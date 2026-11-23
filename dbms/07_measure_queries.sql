-- Reproducible server-side timing for Q17-Q26.
-- Run after 03_schema.sql and 06_benchmark_seed.sql, using PostgreSQL 14+.
-- Uses one warm-up run plus five measured runs; reports median, minimum, max.

CREATE TEMP TABLE query_timings (
    query_id TEXT NOT NULL,
    elapsed_ms DOUBLE PRECISION NOT NULL
);

CREATE OR REPLACE FUNCTION pg_temp.measure_query(
    p_query_id TEXT,
    p_sql TEXT,
    p_team_id TEXT DEFAULT NULL,
    p_user_id TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    run_no INTEGER;
    started_at TIMESTAMPTZ;
BEGIN
    FOR run_no IN 0..5 LOOP
        started_at := clock_timestamp();
        IF p_team_id IS NULL THEN
            EXECUTE p_sql;
        ELSE
            EXECUTE p_sql USING p_team_id, p_user_id;
        END IF;
        IF run_no > 0 THEN
            INSERT INTO query_timings VALUES
                (p_query_id,
                 EXTRACT(EPOCH FROM clock_timestamp() - started_at) * 1000.0);
        END IF;
    END LOOP;
END;
$$;

SELECT pg_temp.measure_query('Q17',
    'SELECT id, "userName", text, "createdAt" FROM messages WHERE "teamId" = $1 ORDER BY "createdAt", id',
    'team-001');
SELECT pg_temp.measure_query('Q18',
    'SELECT id, "userName", text, "createdAt" FROM messages WHERE "teamId" = $1 ORDER BY "createdAt" DESC, id DESC LIMIT 20',
    'team-001');
SELECT pg_temp.measure_query('Q19',
    'SELECT "userName", COUNT(*) FROM messages WHERE "teamId" = $1 GROUP BY "userName" ORDER BY COUNT(*) DESC, "userName"',
    'team-001');
SELECT pg_temp.measure_query('Q20',
    'SELECT id, "raterId", "ratedUserId", score, feedback FROM peer_ratings WHERE "teamId" = $1',
    'team-001');
SELECT pg_temp.measure_query('Q21',
    'SELECT "ratedUserId", score, feedback, "updatedAt" FROM peer_ratings WHERE "teamId" = $1 AND "raterId" = $2',
    'team-001', 'user-0001');
SELECT pg_temp.measure_query('Q22',
    'SELECT "ratedUserId", AVG(score::NUMERIC), COUNT(*) FROM peer_ratings WHERE "teamId" = $1 GROUP BY "ratedUserId"',
    'team-001');
SELECT pg_temp.measure_query('Q23',
    'SELECT COUNT(*) FROM peer_ratings WHERE "teamId" = $1',
    'team-001');

SELECT pg_temp.measure_query('Q24 users', 'SELECT COUNT(*) FROM users');
SELECT pg_temp.measure_query('Q24 teams', 'SELECT COUNT(*) FROM teams');
SELECT pg_temp.measure_query('Q24 team_members', 'SELECT COUNT(*) FROM team_members');
SELECT pg_temp.measure_query('Q24 team_invitations', 'SELECT COUNT(*) FROM team_invitations');
SELECT pg_temp.measure_query('Q24 tasks', 'SELECT COUNT(*) FROM tasks');
SELECT pg_temp.measure_query('Q24 task_assignees', 'SELECT COUNT(*) FROM task_assignees');
SELECT pg_temp.measure_query('Q24 messages', 'SELECT COUNT(*) FROM messages');
SELECT pg_temp.measure_query('Q24 peer_ratings', 'SELECT COUNT(*) FROM peer_ratings');
SELECT pg_temp.measure_query('Q25',
    'SELECT t.id FROM tasks t LEFT JOIN teams tm ON tm.id = t."teamId" WHERE tm.id IS NULL');
SELECT pg_temp.measure_query('Q26',
    'SELECT pr.id FROM peer_ratings pr LEFT JOIN teams tm ON tm.id = pr."teamId" WHERE tm.id IS NULL');

SELECT query_id,
       ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY elapsed_ms))::NUMERIC, 3) AS median_ms,
       ROUND((MIN(elapsed_ms))::NUMERIC, 3) AS min_ms,
       ROUND((MAX(elapsed_ms))::NUMERIC, 3) AS max_ms
FROM query_timings
GROUP BY query_id
ORDER BY query_id;
