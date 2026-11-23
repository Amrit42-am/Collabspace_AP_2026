import 'dotenv/config';
import express from 'express';
import { PrismaClient } from '../generated/prisma/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  createHmac,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scrypt = promisify(scryptCallback);
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. Copy .env.example to .env and configure PostgreSQL.');
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const app = express();
const port = Number(process.env.PORT || 3001);
const cookieName = 'collabspace_session';
const sessionLifetimeSeconds = 60 * 60 * 24 * 7;
const sessionSecret = process.env.SESSION_SECRET || 'local-development-secret-change-me';

if (process.env.NODE_ENV === 'production' && sessionSecret === 'local-development-secret-change-me') {
  throw new Error('Set SESSION_SECRET to a strong random value in production.');
}

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

function signSession(userId) {
  const payload = Buffer.from(JSON.stringify({
    userId,
    expiresAt: Date.now() + sessionLifetimeSeconds * 1000,
  })).toString('base64url');
  const signature = createHmac('sha256', sessionSecret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function readSession(req) {
  const cookieHeader = req.headers.cookie || '';
  const token = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
  if (!token) return null;

  const [payload, providedSignature] = token.split('.');
  if (!payload || !providedSignature) return null;
  const expectedSignature = createHmac('sha256', sessionSecret).update(payload).digest();
  let actualSignature;
  try {
    actualSignature = Buffer.from(providedSignature, 'base64url');
  } catch {
    return null;
  }
  if (actualSignature.length !== expectedSignature.length || !timingSafeEqual(actualSignature, expectedSignature)) {
    return null;
  }

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof session.userId !== 'string' || session.expiresAt < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

function setSessionCookie(res, userId) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${cookieName}=${signSession(userId)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${sessionLifetimeSeconds}${secure}`,
  );
}

function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${cookieName}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`);
}

async function requireUser(req, res, next) {
  const session = readSession(req);
  if (!session) return res.status(401).json({ error: 'Please sign in to continue.' });
  try {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, name: true, email: true, course: true, year: true, about: true, skills: true, workFocus: true },
    });
    if (!user) return res.status(401).json({ error: 'Your session is no longer valid.' });
    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

function cleanString(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function parseList(value) {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return [...new Set(values.map((item) => cleanString(item, 40)).filter(Boolean))].slice(0, 20);
}

async function makePasswordHash(password) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${Buffer.from(hash).toString('hex')}`;
}

async function passwordMatches(password, storedHash) {
  const [algorithm, saltHex, hashHex] = storedHash.split('$');
  if (algorithm !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = Buffer.from(await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function getMemberTeam(teamId, userId) {
  const membership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
    include: { team: true },
  });
  if (membership) return membership;
  const team = await prisma.team.findFirst({ where: { id: teamId, createdById: userId } });
  return team ? { team, teamId, userId, role: 'Lead' } : null;
}

function isTeamLead(membership) {
  return membership?.role === 'Lead';
}

app.get('/api/health', async (_req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/register', async (req, res, next) => {
  const name = cleanString(req.body?.name, 80);
  const email = cleanString(req.body?.email, 254).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (name.length < 2) return res.status(400).json({ error: 'Enter your name (at least 2 characters).' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 10 || password.length > 128) {
    return res.status(400).json({ error: 'Your password must be 10 to 128 characters long.' });
  }

  try {
    const user = await prisma.user.create({
      data: {
        id: randomUUID(),
        email,
        name,
        passwordHash: await makePasswordHash(password),
        course: cleanString(req.body?.course, 120),
        year: cleanString(req.body?.year, 40),
        about: cleanString(req.body?.about, 1000),
        skills: parseList(req.body?.skills),
        workFocus: parseList(req.body?.workFocus),
        createdAt: new Date().toISOString(),
      },
      select: { id: true, name: true, email: true, course: true, year: true, about: true, skills: true, workFocus: true },
    });
    setSessionCookie(res, user.id);
    res.status(201).json({ user });
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'An account with that email already exists.' });
    next(error);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  const email = cleanString(req.body?.email, 254).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await passwordMatches(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }
    setSessionCookie(res, user.id);
    res.json({ user: { id: user.id, name: user.name, email: user.email, course: user.course, year: user.year, about: user.about, skills: user.skills, workFocus: user.workFocus } });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/auth/me', requireUser, (req, res) => res.json({ user: req.user }));

app.patch('/api/auth/profile', requireUser, async (req, res, next) => {
  const name = cleanString(req.body?.name, 80);
  if (name.length < 2) return res.status(400).json({ error: 'Name must be at least 2 characters.' });
  try {
    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: req.user.id },
        data: {
          name,
          course: cleanString(req.body?.course, 120),
          year: cleanString(req.body?.year, 40),
          about: cleanString(req.body?.about, 1000),
          skills: parseList(req.body?.skills),
          workFocus: parseList(req.body?.workFocus),
          profileUpdatedAt: new Date().toISOString(),
        },
        select: { id: true, name: true, email: true, course: true, year: true, about: true, skills: true, workFocus: true },
      });
      await tx.teamMember.updateMany({ where: { userId: req.user.id }, data: { name } });
      await tx.taskAssignee.updateMany({ where: { userId: req.user.id }, data: { name } });
      await tx.task.updateMany({ where: { createdById: req.user.id }, data: { createdByName: name } });
      await tx.task.updateMany({ where: { assigneeId: req.user.id }, data: { assignee: name } });
      return updated;
    });
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

app.get('/api/workspaces', requireUser, async (req, res, next) => {
  try {
    const teams = await prisma.team.findMany({
      where: {
        OR: [
          { members: { some: { userId: req.user.id } } },
          { createdById: req.user.id },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        projectTitle: true,
        deadline: true,
        createdAt: true,
        _count: { select: { members: true, tasks: true } },
      },
    });
    res.json({ workspaces: teams });
  } catch (error) {
    next(error);
  }
});

app.post('/api/workspaces', requireUser, async (req, res, next) => {
  const name = cleanString(req.body?.name, 100);
  const projectTitle = cleanString(req.body?.projectTitle, 160);
  const deadline = cleanString(req.body?.deadline, 40);
  if (name.length < 2) return res.status(400).json({ error: 'Workspace name must be at least 2 characters.' });

  try {
    const team = await prisma.team.create({
      data: {
        id: randomUUID(),
        name,
        projectTitle,
        deadline,
        createdById: req.user.id,
        createdAt: new Date().toISOString(),
        members: {
          create: {
            id: randomUUID(),
            userId: req.user.id,
            name: req.user.name,
            role: 'Lead',
            joinedAt: new Date().toISOString(),
          },
        },
      },
      select: { id: true, name: true, projectTitle: true, deadline: true, createdAt: true },
    });
    res.status(201).json({ workspace: team });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/workspaces/:teamId', requireUser, async (req, res, next) => {
  const name = req.body?.name === undefined ? undefined : cleanString(req.body.name, 100);
  const projectTitle = req.body?.projectTitle === undefined ? undefined : cleanString(req.body.projectTitle, 160);
  const deadline = req.body?.deadline === undefined ? undefined : cleanString(req.body.deadline, 40);
  if (name !== undefined && name.length < 2) return res.status(400).json({ error: 'Workspace name must be at least 2 characters.' });
  try {
    const membership = await getMemberTeam(req.params.teamId, req.user.id);
    if (!membership) return res.status(404).json({ error: 'Workspace not found.' });
    if (!isTeamLead(membership)) return res.status(403).json({ error: 'Only a team lead can edit workspace details.' });
    const workspace = await prisma.$transaction(async (tx) => {
      const updated = await tx.team.update({
        where: { id: req.params.teamId },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(projectTitle !== undefined ? { projectTitle } : {}),
          ...(deadline !== undefined ? { deadline } : {}),
        },
      });
      if (name !== undefined) {
        await tx.task.updateMany({ where: { teamId: updated.id }, data: { teamName: name } });
        await tx.message.updateMany({ where: { teamId: updated.id }, data: { teamName: name } });
        await tx.peerRating.updateMany({ where: { teamId: updated.id }, data: { teamName: name } });
      }
      return updated;
    });
    res.json({ workspace: { id: workspace.id, name: workspace.name, projectTitle: workspace.projectTitle, deadline: workspace.deadline } });
  } catch (error) {
    next(error);
  }
});

app.get('/api/workspaces/:teamId/summary', requireUser, async (req, res, next) => {
  try {
    if (!(await getMemberTeam(req.params.teamId, req.user.id))) return res.status(404).json({ error: 'Workspace not found.' });
    const [team, tasks, ratings] = await Promise.all([
      prisma.team.findUnique({
        where: { id: req.params.teamId },
        include: { members: { include: { user: { select: { id: true, name: true, skills: true, workFocus: true } } } } },
      }),
      prisma.task.findMany({
        where: { teamId: req.params.teamId },
        select: { id: true, status: true, deadline: true, archivedAt: true, assignees: { select: { userId: true } } },
      }),
      prisma.peerRating.findMany({
        where: { teamId: req.params.teamId, score: { not: null } },
        select: { ratedUserId: true, score: true },
      }),
    ]);
    if (!team) return res.status(404).json({ error: 'Workspace not found.' });
    const activeTasks = new Map();
    const completedTasks = new Map();
    tasks.filter((task) => !task.archivedAt).forEach((task) => task.assignees.forEach(({ userId }) => {
      const counts = task.status === 'Done' ? completedTasks : activeTasks;
      counts.set(userId, (counts.get(userId) || 0) + 1);
    }));
    const ratingTotals = new Map();
    ratings.forEach(({ ratedUserId, score }) => {
      const row = ratingTotals.get(ratedUserId) || { total: 0, count: 0 };
      row.total += score;
      row.count += 1;
      ratingTotals.set(ratedUserId, row);
    });
    const members = team.members.map(({ user, role, joinedAt }) => {
      const rating = ratingTotals.get(user.id);
      return {
        id: user.id,
        name: user.name,
        role,
        joinedAt,
        skills: user.skills,
        workFocus: user.workFocus,
        activeTasks: activeTasks.get(user.id) || 0,
        completedTasks: completedTasks.get(user.id) || 0,
        averageRating: rating ? Number((rating.total / rating.count).toFixed(2)) : null,
        ratingCount: rating?.count || 0,
      };
    });
    const now = new Date();
    const deadlineDate = team.deadline ? new Date(`${team.deadline.slice(0, 10)}T00:00:00`) : null;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const daysRemaining = deadlineDate ? Math.round((deadlineDate.getTime() - today.getTime()) / 86400000) : null;
    const currentTasks = tasks.filter((task) => !task.archivedAt);
    res.json({
      workspace: { id: team.id, name: team.name, projectTitle: team.projectTitle, deadline: team.deadline, daysRemaining },
      members,
      tasks: {
        total: currentTasks.length,
        archived: tasks.length - currentTasks.length,
        todo: currentTasks.filter((task) => task.status === 'To Do').length,
        inProgress: currentTasks.filter((task) => task.status === 'In Progress').length,
        done: currentTasks.filter((task) => task.status === 'Done').length,
        overdue: currentTasks.filter((task) => task.status !== 'Done' && task.deadline && new Date(`${task.deadline.slice(0, 10)}T23:59:59`) < now).length,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/workspaces/:teamId/members', requireUser, async (req, res, next) => {
  try {
    if (!(await getMemberTeam(req.params.teamId, req.user.id))) return res.status(404).json({ error: 'Workspace not found.' });
    const members = await prisma.teamMember.findMany({
      where: { teamId: req.params.teamId },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
      select: { userId: true, name: true, role: true, joinedAt: true, user: { select: { email: true } } },
    });
    res.json({ members: members.map(({ user, ...member }) => ({ ...member, email: user.email })) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/workspaces/:teamId/invitations', requireUser, async (req, res, next) => {
  const email = cleanString(req.body?.email, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  try {
    const membership = await getMemberTeam(req.params.teamId, req.user.id);
    if (!membership) return res.status(404).json({ error: 'Workspace not found.' });
    if (!isTeamLead(membership)) return res.status(403).json({ error: 'Only a team lead can invite members.' });
    const invitee = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true } });
    if (!invitee) return res.status(404).json({ error: 'That person needs a CollabSpace account before they can be invited.' });
    if (invitee.id === req.user.id) return res.status(400).json({ error: 'You are already part of this workspace.' });
    const member = await prisma.teamMember.findUnique({ where: { teamId_userId: { teamId: req.params.teamId, userId: invitee.id } } });
    if (member) return res.status(409).json({ error: 'That person is already a workspace member.' });
    const invitation = await prisma.teamInvitation.create({
      data: {
        id: randomUUID(), teamId: req.params.teamId, userId: invitee.id,
        name: invitee.name, email: invitee.email, role: 'Member',
        invitedAt: new Date().toISOString(), invitedBy: req.user.name,
      },
    });
    res.status(201).json({ invitation });
  } catch (error) {
    next(error);
  }
});

app.get('/api/workspaces/:teamId/invitations', requireUser, async (req, res, next) => {
  try {
    if (!(await getMemberTeam(req.params.teamId, req.user.id))) return res.status(404).json({ error: 'Workspace not found.' });
    const invitations = await prisma.teamInvitation.findMany({
      where: { teamId: req.params.teamId },
      orderBy: { invitedAt: 'desc' },
      select: { id: true, name: true, email: true, role: true, invitedAt: true, invitedBy: true },
    });
    res.json({ invitations });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/workspaces/:teamId/invitations/:invitationId', requireUser, async (req, res, next) => {
  try {
    const membership = await getMemberTeam(req.params.teamId, req.user.id);
    if (!membership) return res.status(404).json({ error: 'Workspace not found.' });
    if (!isTeamLead(membership)) return res.status(403).json({ error: 'Only a team lead can cancel invitations.' });
    const invitation = await prisma.teamInvitation.findFirst({ where: { id: req.params.invitationId, teamId: req.params.teamId } });
    if (!invitation) return res.status(404).json({ error: 'Invitation not found.' });
    await prisma.teamInvitation.delete({ where: { id: invitation.id } });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/invitations', requireUser, async (req, res, next) => {
  try {
    const invitations = await prisma.teamInvitation.findMany({
      where: { userId: req.user.id },
      include: { team: { select: { id: true, name: true, projectTitle: true } } },
      orderBy: { invitedAt: 'desc' },
    });
    res.json({ invitations });
  } catch (error) {
    next(error);
  }
});

app.post('/api/invitations/:invitationId/accept', requireUser, async (req, res, next) => {
  try {
    const invitation = await prisma.teamInvitation.findFirst({ where: { id: req.params.invitationId, userId: req.user.id } });
    if (!invitation) return res.status(404).json({ error: 'Invitation not found.' });
    await prisma.$transaction([
      prisma.teamMember.create({
        data: {
          id: randomUUID(), teamId: invitation.teamId, userId: req.user.id,
          name: req.user.name, role: invitation.role, joinedAt: new Date().toISOString(),
        },
      }),
      prisma.teamInvitation.delete({ where: { id: invitation.id } }),
    ]);
    res.json({ ok: true, teamId: invitation.teamId });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/invitations/:invitationId', requireUser, async (req, res, next) => {
  try {
    const invitation = await prisma.teamInvitation.findFirst({ where: { id: req.params.invitationId, userId: req.user.id } });
    if (!invitation) return res.status(404).json({ error: 'Invitation not found.' });
    await prisma.teamInvitation.delete({ where: { id: invitation.id } });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/workspaces/:teamId/tasks', requireUser, async (req, res, next) => {
  try {
    if (!(await getMemberTeam(req.params.teamId, req.user.id))) {
      return res.status(404).json({ error: 'Workspace not found.' });
    }
    const tasks = await prisma.task.findMany({
      where: { teamId: req.params.teamId },
      orderBy: { createdAt: 'desc' },
      include: { assignees: { select: { userId: true, name: true } }, createdBy: { select: { id: true, name: true } } },
    });
    res.json({ tasks });
  } catch (error) {
    next(error);
  }
});

app.post('/api/workspaces/:teamId/tasks', requireUser, async (req, res, next) => {
  const title = cleanString(req.body?.title, 200);
  const description = cleanString(req.body?.description, 5000);
  const status = cleanString(req.body?.status, 40) || 'To Do';
  const priority = cleanString(req.body?.priority, 20) || 'medium';
  const assigneeIds = Array.isArray(req.body?.assigneeIds)
    ? [...new Set(req.body.assigneeIds.map((id) => cleanString(id, 80)).filter(Boolean))]
    : (cleanString(req.body?.assigneeId, 80) ? [cleanString(req.body.assigneeId, 80)] : []);
  if (!title) return res.status(400).json({ error: 'Task title is required.' });
  if (!['To Do', 'In Progress', 'Done'].includes(status)) return res.status(400).json({ error: 'Choose a valid task status.' });
  if (!['low', 'medium', 'high'].includes(priority)) return res.status(400).json({ error: 'Choose a valid task priority.' });

  try {
    const membership = await getMemberTeam(req.params.teamId, req.user.id);
    if (!membership) return res.status(404).json({ error: 'Workspace not found.' });
    const teamMembers = assigneeIds.length ? await prisma.teamMember.findMany({
      where: { teamId: req.params.teamId, userId: { in: assigneeIds } },
      select: { userId: true, name: true },
    }) : [];
    if (teamMembers.length !== assigneeIds.length) return res.status(400).json({ error: 'Every assignee must be a workspace member.' });
    const primaryAssignee = teamMembers[0] || null;
    const now = new Date().toISOString();
    const task = await prisma.task.create({
      data: {
        id: randomUUID(),
        title,
        description,
        status,
        priority,
        deadline: cleanString(req.body?.deadline, 40),
        teamId: req.params.teamId,
        teamName: membership.team.name,
        createdById: req.user.id,
        createdByName: req.user.name,
        assignee: primaryAssignee?.name || '',
        assigneeId: primaryAssignee?.userId || null,
        createdAt: now,
        updatedAt: now,
        assignees: teamMembers.length ? {
          create: teamMembers.map((member) => ({ id: randomUUID(), userId: member.userId, name: member.name })),
        } : undefined,
      },
      include: { assignees: { select: { userId: true, name: true } } },
    });
    res.status(201).json({ task });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/workspaces/:teamId/tasks/:taskId', requireUser, async (req, res, next) => {
  const title = req.body?.title === undefined ? undefined : cleanString(req.body.title, 200);
  const description = req.body?.description === undefined ? undefined : cleanString(req.body.description, 5000);
  const status = req.body?.status === undefined ? undefined : cleanString(req.body.status, 40);
  const priority = req.body?.priority === undefined ? undefined : cleanString(req.body.priority, 20);
  const deadline = req.body?.deadline === undefined ? undefined : cleanString(req.body.deadline, 40);
  const archived = typeof req.body?.archived === 'boolean' ? req.body.archived : undefined;
  const commentText = cleanString(req.body?.comment, 2000);
  if (title !== undefined && !title) return res.status(400).json({ error: 'Task title cannot be empty.' });
  if (status !== undefined && !['To Do', 'In Progress', 'Done'].includes(status)) return res.status(400).json({ error: 'Choose a valid task status.' });
  if (priority !== undefined && !['low', 'medium', 'high'].includes(priority)) return res.status(400).json({ error: 'Choose a valid task priority.' });
  try {
    if (!(await getMemberTeam(req.params.teamId, req.user.id))) return res.status(404).json({ error: 'Workspace not found.' });
    const existing = await prisma.task.findFirst({ where: { id: req.params.taskId, teamId: req.params.teamId }, include: { assignees: true } });
    if (!existing) return res.status(404).json({ error: 'Task not found.' });
    let assigneeIds = existing.assignees.map(({ userId }) => userId);
    if (Array.isArray(req.body?.assigneeIds)) {
      assigneeIds = [...new Set(req.body.assigneeIds.map((id) => cleanString(id, 80)).filter(Boolean))];
    }
    const teamMembers = assigneeIds.length ? await prisma.teamMember.findMany({
      where: { teamId: req.params.teamId, userId: { in: assigneeIds } },
      select: { userId: true, name: true },
    }) : [];
    if (teamMembers.length !== assigneeIds.length) return res.status(400).json({ error: 'Every assignee must be a workspace member.' });
    const now = new Date().toISOString();
    const comments = Array.isArray(existing.comments) ? existing.comments : [];
    if (commentText) comments.push({ id: randomUUID(), userId: req.user.id, userName: req.user.name, text: commentText, createdAt: now });
    const completedAt = status === undefined ? existing.completedAt : status === 'Done' ? (existing.completedAt || now) : '';
    const updated = await prisma.$transaction(async (tx) => {
      if (Array.isArray(req.body?.assigneeIds)) {
        await tx.taskAssignee.deleteMany({ where: { taskId: existing.id } });
        if (teamMembers.length) await tx.taskAssignee.createMany({
          data: teamMembers.map((member) => ({ id: randomUUID(), taskId: existing.id, userId: member.userId, name: member.name })),
        });
      }
      return tx.task.update({
        where: { id: existing.id },
        data: {
          ...(title !== undefined ? { title } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(status !== undefined ? { status, completedAt } : {}),
          ...(priority !== undefined ? { priority } : {}),
          ...(deadline !== undefined ? { deadline } : {}),
          ...(archived !== undefined ? { archivedAt: archived ? (existing.archivedAt || now) : '' } : {}),
          ...(Array.isArray(req.body?.assigneeIds) ? {
            assigneeId: teamMembers[0]?.userId || null,
            assignee: teamMembers[0]?.name || '',
          } : {}),
          ...(commentText ? { comments } : {}),
          updatedAt: now,
        },
        include: { assignees: { select: { userId: true, name: true } }, createdBy: { select: { id: true, name: true } } },
      });
    });
    res.json({ task: updated });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/workspaces/:teamId/tasks/:taskId', requireUser, async (req, res, next) => {
  try {
    const membership = await getMemberTeam(req.params.teamId, req.user.id);
    if (!membership) return res.status(404).json({ error: 'Workspace not found.' });
    const task = await prisma.task.findFirst({ where: { id: req.params.taskId, teamId: req.params.teamId } });
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    if (!isTeamLead(membership) && task.createdById !== req.user.id) return res.status(403).json({ error: 'Only the task creator or a team lead can delete this task.' });
    await prisma.task.delete({ where: { id: task.id } });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/workspaces/:teamId/suggested-assignee', requireUser, async (req, res, next) => {
  const taskText = `${cleanString(req.query.title, 200)} ${cleanString(req.query.description, 1000)}`.toLowerCase();
  try {
    if (!(await getMemberTeam(req.params.teamId, req.user.id))) return res.status(404).json({ error: 'Workspace not found.' });
    const [members, activeTasks] = await Promise.all([
      prisma.teamMember.findMany({ where: { teamId: req.params.teamId }, include: { user: { select: { skills: true, workFocus: true } } } }),
      prisma.taskAssignee.findMany({ where: { task: { teamId: req.params.teamId, status: { not: 'Done' }, archivedAt: '' } }, select: { userId: true } }),
    ]);
    const workload = new Map();
    activeTasks.forEach(({ userId }) => workload.set(userId, (workload.get(userId) || 0) + 1));
    const suggestions = members.map(({ userId, name, user }) => {
      const matches = [...user.skills, ...user.workFocus].filter((skill) => {
        const term = skill.toLowerCase().trim();
        return term.length > 1 && taskText.includes(term);
      });
      return { userId, name, activeTasks: workload.get(userId) || 0, matchedSkills: [...new Set(matches)] };
    }).sort((a, b) => b.matchedSkills.length - a.matchedSkills.length || a.activeTasks - b.activeTasks || a.name.localeCompare(b.name));
    res.json({ suggestion: suggestions[0] || null, candidates: suggestions, method: 'skill match, then lowest active workload' });
  } catch (error) {
    next(error);
  }
});

app.get('/api/workspaces/:teamId/ratings', requireUser, async (req, res, next) => {
  try {
    if (!(await getMemberTeam(req.params.teamId, req.user.id))) return res.status(404).json({ error: 'Workspace not found.' });
    const ratings = await prisma.peerRating.findMany({
      where: { teamId: req.params.teamId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true, teamId: true, raterId: true, ratedUserId: true, score: true,
        feedback: true, raterName: true, ratedUserName: true, updatedAt: true,
      },
    });
    res.json({ ratings });
  } catch (error) {
    next(error);
  }
});

app.post('/api/workspaces/:teamId/ratings', requireUser, async (req, res, next) => {
  const ratedUserId = cleanString(req.body?.ratedUserId, 80);
  const score = Number(req.body?.score);
  const feedback = cleanString(req.body?.feedback, 2000);
  if (!ratedUserId) return res.status(400).json({ error: 'Choose a teammate to rate.' });
  if (!Number.isInteger(score) || score < 1 || score > 5) return res.status(400).json({ error: 'Choose a score from 1 to 5.' });
  try {
    const [raterMembership, ratedMembership] = await Promise.all([
      getMemberTeam(req.params.teamId, req.user.id),
      prisma.teamMember.findUnique({ where: { teamId_userId: { teamId: req.params.teamId, userId: ratedUserId } }, include: { user: true } }),
    ]);
    if (!raterMembership || !ratedMembership) return res.status(404).json({ error: 'Workspace member not found.' });
    if (ratedUserId === req.user.id) return res.status(400).json({ error: 'You cannot rate yourself.' });
    const raterRecord = await prisma.user.findUnique({ where: { id: req.user.id }, select: { role: true } });
    const now = new Date().toISOString();
    const rating = await prisma.peerRating.upsert({
      where: { teamId_raterId_ratedUserId: { teamId: req.params.teamId, raterId: req.user.id, ratedUserId } },
      update: { score, feedback, updatedAt: now },
      create: {
        id: randomUUID(), teamId: req.params.teamId, raterId: req.user.id, ratedUserId,
        score, feedback, ratedUserName: ratedMembership.name, ratedUserRole: ratedMembership.role,
        raterName: req.user.name, raterRole: raterRecord?.role || 'Member',
        teamName: raterMembership.team.name, createdAt: now, updatedAt: now,
      },
    });
    res.status(201).json({ rating });
  } catch (error) {
    next(error);
  }
});

app.get('/api/workspaces/:teamId/messages', requireUser, async (req, res, next) => {
  try {
    const membership = await getMemberTeam(req.params.teamId, req.user.id);
    if (!membership) return res.status(404).json({ error: 'Workspace not found.' });
    const messages = await prisma.message.findMany({
      where: { teamId: req.params.teamId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    res.json({ messages: messages.reverse() });
  } catch (error) {
    next(error);
  }
});

app.post('/api/workspaces/:teamId/messages', requireUser, async (req, res, next) => {
  const text = cleanString(req.body?.text, 4000);
  if (!text) return res.status(400).json({ error: 'Message text is required.' });
  try {
    const membership = await getMemberTeam(req.params.teamId, req.user.id);
    if (!membership) return res.status(404).json({ error: 'Workspace not found.' });
    const message = await prisma.message.create({
      data: {
        id: randomUUID(),
        text,
        teamId: req.params.teamId,
        teamName: membership.team.name,
        userId: req.user.id,
        userName: req.user.name,
        createdAt: new Date().toISOString(),
      },
    });
    res.status(201).json({ message });
  } catch (error) {
    next(error);
  }
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
app.use(express.static(path.join(projectRoot, 'dist')));
app.use((req, res, next) => {
  if (req.method === 'GET' && req.accepts('html')) {
    return res.sendFile(path.join(projectRoot, 'dist', 'index.html'), (error) => {
      if (error) next();
    });
  }
  next();
});

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error.code === 'P2003') return res.status(400).json({ error: 'A related record was not found.' });
  if (error.code === 'P2002') return res.status(409).json({ error: 'That record already exists.' });
  res.status(500).json({ error: 'The server could not complete the request.' });
});

const server = app.listen(port, () => {
  console.log(`CollabSpace API listening on http://localhost:${port}`);
});

async function shutdown() {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
