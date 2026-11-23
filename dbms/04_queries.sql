-- Queries use the normalized PostgreSQL tables and fields in
-- 03_schema.sql (the same schema as the Prisma migration).
-- Replace TEAM_ID_HERE and USER_ID_HERE with IDs present in your database.

-- ============================================================
-- 4. MESSAGE QUERIES
-- ============================================================

-- Q17. Display messages of a team in chronological order.
SELECT id AS message_id, "userName" AS sender, text AS message,
       "createdAt" AS sent_at
FROM messages
WHERE "teamId" = 'TEAM_ID_HERE'
ORDER BY "createdAt", id;

-- Q18. Display the latest 20 messages of a team.
SELECT id AS message_id, "userName" AS sender, text AS message,
       "createdAt" AS sent_at
FROM messages
WHERE "teamId" = 'TEAM_ID_HERE'
ORDER BY "createdAt" DESC, id DESC
LIMIT 20;

-- Q19. Count messages sent by each user in a team.
SELECT "userName" AS user_name, COUNT(*) AS total_messages
FROM messages
WHERE "teamId" = 'TEAM_ID_HERE'
GROUP BY "userName"
ORDER BY total_messages DESC, user_name ASC;

-- ============================================================
-- 5. PEER RATING QUERIES
-- ============================================================

-- Q20. Display all ratings given in a team.
SELECT id AS rating_id, "raterId", "ratedUserId", score, feedback
FROM peer_ratings
WHERE "teamId" = 'TEAM_ID_HERE';

-- Q21. Display ratings given by a particular user in a team.
SELECT "ratedUserId", score, feedback, "updatedAt"
FROM peer_ratings
WHERE "teamId" = 'TEAM_ID_HERE'
  AND "raterId" = 'USER_ID_HERE';

-- Q22. Calculate the average rating received by each user in a team.
SELECT "ratedUserId", AVG(score::NUMERIC) AS average_rating,
       COUNT(*) AS total_ratings
FROM peer_ratings
WHERE "teamId" = 'TEAM_ID_HERE'
GROUP BY "ratedUserId";

-- Q23. Count the total number of ratings in a team.
SELECT COUNT(*) AS total_ratings
FROM peer_ratings
WHERE "teamId" = 'TEAM_ID_HERE';

-- ============================================================
-- 6. BASIC DATABASE CHECKS
-- ============================================================

-- Q24. Count records in each application table.
SELECT COUNT(*) AS total_users FROM users;
SELECT COUNT(*) AS total_teams FROM teams;
SELECT COUNT(*) AS total_team_members FROM team_members;
SELECT COUNT(*) AS total_team_invitations FROM team_invitations;
SELECT COUNT(*) AS total_tasks FROM tasks;
SELECT COUNT(*) AS total_task_assignees FROM task_assignees;
SELECT COUNT(*) AS total_messages FROM messages;
SELECT COUNT(*) AS total_peer_ratings FROM peer_ratings;

-- Q25. Find tasks whose team does not exist (should return no rows when
-- foreign keys are enabled).
SELECT t.id AS task_id, t."teamId" AS team_id
FROM tasks AS t
LEFT JOIN teams AS tm ON tm.id = t."teamId"
WHERE tm.id IS NULL;

-- Q26. Find peer ratings whose team does not exist (should return no rows
-- when foreign keys are enabled).
SELECT pr.id AS rating_id, pr."teamId"
FROM peer_ratings AS pr
LEFT JOIN teams AS tm ON tm.id = pr."teamId"
WHERE tm.id IS NULL;

-- ============================================================
-- END OF QUERIES
-- ============================================================
