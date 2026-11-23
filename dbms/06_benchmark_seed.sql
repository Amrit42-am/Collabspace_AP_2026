-- Repeatable synthetic dataset for dbms/05_query_timings.md.
-- Run only in a dedicated benchmark database: this clears all application data.
TRUNCATE TABLE
    peer_ratings, messages, task_assignees, tasks, team_invitations,
    team_members, teams, users
RESTART IDENTITY CASCADE;

INSERT INTO users (
    id, email, name, "passwordHash", course, year, about, skills, "workFocus",
    role, "teamName", "createdAt", "emailVerifiedAt", "profileUpdatedAt"
)
SELECT
    'user-' || lpad(n::TEXT, 4, '0'),
    'user-' || n || '@example.test',
    'User ' || n,
    'benchmark-hash',
    'Computer Science',
    'Year ' || ((n % 4) + 1),
    'Synthetic benchmark account ' || n,
    ARRAY['SQL', 'React'],
    ARRAY['Collaboration'],
    'Member',
    '',
    '2026-01-01T00:00:00.000Z',
    '',
    ''
FROM generate_series(1, 200) AS n;

INSERT INTO teams (
    id, name, "projectTitle", deadline, "createdById", "createdAt", "rolesCheckedAt"
)
SELECT
    'team-' || lpad(t::TEXT, 3, '0'),
    'Team ' || t,
    'Benchmark Project ' || t,
    '2026-12-31',
    'user-' || lpad(t::TEXT, 4, '0'),
    '2026-01-01T00:00:00.000Z',
    ''
FROM generate_series(1, 20) AS t;

INSERT INTO team_members (id, "teamId", "userId", name, role, "joinedAt")
SELECT
    'member-' || t || '-' || u,
    'team-' || lpad(t::TEXT, 3, '0'),
    'user-' || lpad(u::TEXT, 4, '0'),
    'User ' || u,
    CASE WHEN u = 1 THEN 'Lead' ELSE 'Member' END,
    '2026-01-02T00:00:00.000Z'
FROM generate_series(1, 20) AS t
CROSS JOIN generate_series(1, 20) AS u;

INSERT INTO team_invitations (
    id, "teamId", "userId", name, email, role, "invitedAt", "invitedBy"
)
SELECT
    'invite-' || t || '-' || u,
    'team-' || lpad(t::TEXT, 3, '0'),
    'user-' || lpad((u + 20)::TEXT, 4, '0'),
    'User ' || (u + 20),
    'user-' || (u + 20) || '@example.test',
    'Member',
    '2026-01-03T00:00:00.000Z',
    'user-' || lpad(t::TEXT, 4, '0')
FROM generate_series(1, 20) AS t
CROSS JOIN generate_series(1, 10) AS u;

INSERT INTO tasks (
    id, title, description, status, deadline, priority, "teamId", "teamName",
    "createdById", "createdByName", assignee, "assigneeId", "archivedAt",
    "completedAt", "createdAt", "updatedAt", comments
)
SELECT
    'task-' || t || '-' || n,
    'Benchmark task ' || n,
    'Synthetic task for query timing',
    CASE WHEN n % 3 = 0 THEN 'Done' WHEN n % 3 = 1 THEN 'To Do' ELSE 'In Progress' END,
    '2026-12-31',
    CASE WHEN n % 3 = 0 THEN 'high' WHEN n % 3 = 1 THEN 'medium' ELSE 'low' END,
    'team-' || lpad(t::TEXT, 3, '0'),
    'Team ' || t,
    'user-' || lpad(t::TEXT, 4, '0'),
    'User ' || t,
    'User ' || (((n - 1) % 20) + 1),
    'user-' || lpad((((n - 1) % 20) + 1)::TEXT, 4, '0'),
    '',
    '',
    '2026-01-04T00:00:00.000Z',
    '2026-01-04T00:00:00.000Z',
    '[]'::JSONB
FROM generate_series(1, 20) AS t
CROSS JOIN generate_series(1, 2000) AS n;

INSERT INTO task_assignees (id, "taskId", "userId", name)
SELECT
    'task-assignee-' || t || '-' || n,
    'task-' || t || '-' || n,
    'user-' || lpad((((n - 1) % 20) + 1)::TEXT, 4, '0'),
    'User ' || (((n - 1) % 20) + 1)
FROM generate_series(1, 20) AS t
CROSS JOIN generate_series(1, 2000) AS n;

INSERT INTO messages (id, text, "teamId", "teamName", "userId", "userName", "createdAt")
SELECT
    'message-' || t || '-' || n,
    'Benchmark message ' || n || ' for team ' || t,
    'team-' || lpad(t::TEXT, 3, '0'),
    'Team ' || t,
    'user-' || lpad((((n - 1) % 20) + 1)::TEXT, 4, '0'),
    'User ' || (((n - 1) % 20) + 1),
    to_char(
        TIMESTAMP '2026-01-01 00:00:00' + n * INTERVAL '1 second',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    )
FROM generate_series(1, 20) AS t
CROSS JOIN generate_series(1, 5000) AS n;

INSERT INTO peer_ratings (
    id, "teamId", "raterId", "ratedUserId", score, feedback,
    "ratedUserName", "ratedUserRole", "raterName", "raterRole", "teamName",
    "createdAt", "updatedAt"
)
SELECT
    'rating-' || t || '-' || r || '-' || v,
    'team-' || lpad(t::TEXT, 3, '0'),
    'user-' || lpad(r::TEXT, 4, '0'),
    'user-' || lpad(v::TEXT, 4, '0'),
    ((r + v + t) % 5) + 1,
    'Synthetic rating feedback',
    'User ' || v,
    'Member',
    'User ' || r,
    CASE WHEN r = 1 THEN 'Lead' ELSE 'Member' END,
    'Team ' || t,
    '2026-01-05T00:00:00.000Z',
    '2026-01-06T00:00:00.000Z'
FROM generate_series(1, 20) AS t
CROSS JOIN generate_series(1, 10) AS r
CROSS JOIN generate_series(11, 20) AS v;

ANALYZE;
