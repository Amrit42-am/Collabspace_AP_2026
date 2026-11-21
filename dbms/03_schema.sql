-- ============================================================
-- Relational Database Schema
-- PostgreSQL 15+
-- ============================================================

-- App fields are stored as relational columns so they can be queried and
-- constrained. JSONB is used only for the intentionally structured values:
-- verification/reset tokens and task comments.

-- ============================================================
-- 1. USER TABLE
-- ============================================================

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "course" TEXT NOT NULL DEFAULT '',
    "year" TEXT NOT NULL DEFAULT '',
    "about" TEXT NOT NULL DEFAULT '',
    "skills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "workFocus" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "role" TEXT NOT NULL DEFAULT 'Member',
    "teamName" TEXT NOT NULL DEFAULT '',
    "createdAt" TEXT NOT NULL,
    "emailVerifiedAt" TEXT NOT NULL DEFAULT '',
    "emailVerification" JSONB,
    "passwordReset" JSONB,
    "profileUpdatedAt" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "User_email_key" UNIQUE ("email")
);

-- ============================================================
-- 2. TEAM TABLE
-- ============================================================

CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "projectTitle" TEXT NOT NULL DEFAULT '',
    "deadline" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,
    "rolesCheckedAt" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Team_createdById_fkey"
        FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT
);

-- ============================================================
-- 3. TASK TABLE
-- ============================================================

CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'To Do',
    "deadline" TEXT NOT NULL DEFAULT '',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "teamId" TEXT NOT NULL,
    "teamName" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL DEFAULT '',
    "assignee" TEXT NOT NULL DEFAULT '',
    "assigneeId" TEXT,
    "archivedAt" TEXT NOT NULL DEFAULT '',
    "completedAt" TEXT NOT NULL DEFAULT '',
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,
    "comments" JSONB NOT NULL DEFAULT '[]'::JSONB,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Task_teamId_fkey"
        FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE,
    CONSTRAINT "Task_createdById_fkey"
        FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT,
    CONSTRAINT "Task_assigneeId_fkey"
        FOREIGN KEY ("assigneeId") REFERENCES "User" ("id") ON DELETE SET NULL
);

-- ============================================================
-- 4. MESSAGE TABLE
-- ============================================================

CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "teamName" TEXT NOT NULL DEFAULT '',
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Message_teamId_fkey"
        FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE,
    CONSTRAINT "Message_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE
);

-- ============================================================
-- 5. PEER RATING TABLE
-- ============================================================

CREATE TABLE "PeerRating" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "raterId" TEXT NOT NULL,
    "ratedUserId" TEXT NOT NULL,
    "score" INTEGER,
    "feedback" TEXT NOT NULL DEFAULT '',
    "ratedUserName" TEXT NOT NULL DEFAULT '',
    "ratedUserRole" TEXT NOT NULL DEFAULT 'Member',
    "raterName" TEXT NOT NULL DEFAULT '',
    "raterRole" TEXT NOT NULL DEFAULT 'Member',
    "teamName" TEXT NOT NULL DEFAULT '',
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,

    CONSTRAINT "PeerRating_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PeerRating_teamId_fkey"
        FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE,
    CONSTRAINT "PeerRating_raterId_fkey"
        FOREIGN KEY ("raterId") REFERENCES "User" ("id") ON DELETE CASCADE,
    CONSTRAINT "PeerRating_ratedUserId_fkey"
        FOREIGN KEY ("ratedUserId") REFERENCES "User" ("id") ON DELETE CASCADE,
    CONSTRAINT "PeerRating_teamId_raterId_ratedUserId_key"
        UNIQUE ("teamId", "raterId", "ratedUserId")
);

-- ============================================================
-- 6. PERFORMANCE INDEXES
-- ============================================================

CREATE INDEX "Team_createdById_idx" ON "Team" ("createdById");
CREATE INDEX "Task_teamId_status_idx" ON "Task" ("teamId", "status");
CREATE INDEX "Task_createdById_idx" ON "Task" ("createdById");
CREATE INDEX "Message_teamId_createdAt_idx" ON "Message" ("teamId", "createdAt");
CREATE INDEX "PeerRating_teamId_updatedAt_idx" ON "PeerRating" ("teamId", "updatedAt");

-- ============================================================
-- END OF SCHEMA
-- ============================================================
