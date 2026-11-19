-- ============================================================
-- 4. MESSAGE QUERIES
-- ============================================================

-- Q17. Display messages of a team.
SELECT
    id AS message_id,
    data->>'userName' AS sender,
    data->>'text' AS message,
    data->>'createdAt' AS sent_at
FROM "Message"
WHERE data->>'teamId' = 'TEAM_ID_HERE'
ORDER BY data->>'createdAt', id;


-- Q18. Display the latest 20 messages of a team.
SELECT
    id AS message_id,
    data->>'userName' AS sender,
    data->>'text' AS message,
    data->>'createdAt' AS sent_at
FROM "Message"
WHERE data->>'teamId' = 'TEAM_ID_HERE'
ORDER BY data->>'createdAt' DESC, id DESC
LIMIT 20;


-- Q19. Count messages sent by each user in a team.
SELECT
    data->>'userName' AS user_name,
    COUNT(*) AS total_messages
FROM "Message"
WHERE data->>'teamId' = 'TEAM_ID_HERE'
GROUP BY data->>'userName'
ORDER BY total_messages DESC, user_name ASC;


-- ============================================================
-- 5. PEER RATING QUERIES
-- ============================================================

-- Q20. Display all ratings given in a team.
SELECT
    id AS rating_id,
    "raterId",
    "ratedUserId",
    data->>'score' AS score,
    data->>'feedback' AS feedback
FROM "PeerRating"
WHERE "teamId" = 'TEAM_ID_HERE';


-- Q21. Display ratings given by a particular user.
SELECT
    "ratedUserId",
    data->>'score' AS score,
    data->>'feedback' AS feedback,
    "updatedAt"
FROM "PeerRating"
WHERE "teamId" = 'TEAM_ID_HERE'
  AND "raterId" = 'USER_ID_HERE';


-- Q22. Calculate the average rating received by each user in a team.
SELECT
    "ratedUserId",
    AVG((data->>'score')::NUMERIC) AS average_rating,
    COUNT(*) AS total_ratings
FROM "PeerRating"
WHERE "teamId" = 'TEAM_ID_HERE'
GROUP BY "ratedUserId";


-- Q23. Count the total number of ratings in a team.
SELECT COUNT(*) AS total_ratings
FROM "PeerRating"
WHERE "teamId" = 'TEAM_ID_HERE';


-- ============================================================
-- 6. BASIC DATABASE CHECKS
-- ============================================================

-- Q24. Count records in each table.
SELECT COUNT(*) AS total_users FROM "User";
SELECT COUNT(*) AS total_teams FROM "Team";
SELECT COUNT(*) AS total_tasks FROM "Task";
SELECT COUNT(*) AS total_messages FROM "Message";
SELECT COUNT(*) AS total_peer_ratings FROM "PeerRating";


-- Q25. Find tasks that refer to a team that does not exist.
SELECT
    "Task".id AS task_id,
    "Task".data->>'teamId' AS team_id
FROM "Task"
LEFT JOIN "Team"
    ON "Task".data->>'teamId' = "Team".id
WHERE "Team".id IS NULL;


-- Q26. Find peer ratings whose team does not exist.
SELECT
    "PeerRating".id AS rating_id,
    "PeerRating"."teamId"
FROM "PeerRating"
LEFT JOIN "Team"
    ON "PeerRating"."teamId" = "Team".id
WHERE "Team".id IS NULL;


-- ============================================================
-- END OF QUERIES
-- ============================================================
