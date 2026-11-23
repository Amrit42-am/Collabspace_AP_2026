# Query Timing Report

## Benchmark setup

The queries were measured on **21 November 2026** using PostgreSQL 16.16 on
Apple Silicon (a local Homebrew installation). The benchmark ran in a temporary
database with the schema from `03_schema.sql` and the synthetic data generated
by `06_benchmark_seed.sql`.

| Table | Rows |
|---|---:|
| `users` | 200 |
| `teams` | 20 |
| `team_members` | 400 |
| `team_invitations` | 200 |
| `tasks` | 40,000 |
| `task_assignees` | 40,000 |
| `messages` | 100,000 |
| `peer_ratings` | 2,000 |

Message and rating queries used `team-001`; Q21 used `user-0001`. Statistics
were refreshed with `ANALYZE`. The project script `07_measure_queries.sql`
ran each operation once to warm the cache, followed by five measured runs;
elapsed time was measured inside PostgreSQL and the table reports the median.
These server-side times exclude client/network transfer and are for a warm
local cache with synthetic data. Treat them as a reproducible baseline rather
than a production performance guarantee.

## Measured results

| Query | Median time (ms) | Rows in benchmark result | Min–max (ms) |
|---|---:|---:|---:|
| Q17 – team messages, chronological | 0.874 | 5,000 | 0.809–1.063 |
| Q18 – latest 20 team messages | 0.021 | 20 | 0.019–0.028 |
| Q19 – message count by sender | 0.668 | 20 | 0.633–0.960 |
| Q20 – ratings for a team | 0.053 | 100 | 0.042–0.093 |
| Q21 – ratings by a user in a team | 0.016 | 10 | 0.015–0.022 |
| Q22 – average ratings received per team member | 0.033 | 10 | 0.033–0.038 |
| Q23 – rating count for a team | 0.016 | 1 | 0.015–0.019 |
| Q24 – count users | 0.014 | 1 | 0.013–0.017 |
| Q24 – count teams | 0.008 | 1 | 0.008–0.010 |
| Q24 – count team members | 0.020 | 1 | 0.018–0.110 |
| Q24 – count invitations | 0.034 | 1 | 0.031–0.052 |
| Q24 – count tasks | 1.017 | 1 | 0.848–1.631 |
| Q24 – count task assignees | 1.163 | 1 | 0.763–3.149 |
| Q24 – count messages | 1.848 | 1 | 1.735–2.437 |
| Q24 – count peer ratings | 0.048 | 1 | 0.047–0.052 |
| Q25 – tasks whose team is missing | 3.178 | 0 | 2.649–3.490 |
| Q26 – ratings whose team is missing | 0.164 | 0 | 0.114–0.242 |

## Execution plan observations

`EXPLAIN (ANALYZE, BUFFERS)` was run for Q17–Q23, Q25, and Q26 with the same
team and database. Representative plans showed:

- Q17 used `messages_teamId_createdAt_idx` to find the team's 5,000 messages,
  then sorted by `createdAt, id`. Its plan execution time was 1.103 ms.
- Q18 scanned the message index backward and used an incremental sort for the
  `id` tie-break, stopping after 20 rows. Plan execution time was 0.019 ms.
- Q19 used the message index for the team filter, then a hash aggregate and a
  small sort. Plan execution time was 0.660 ms.
- Q20–Q23 used the unique index on `(teamId, raterId, ratedUserId)`; Q21 used
  both its leading `teamId` and `raterId` keys. Plan execution times ranged from
  0.005 to 0.036 ms.
- Q25 and Q26 used hash anti joins and sequentially scanned the relevant child
  tables. They returned no orphans, as expected with the foreign keys enabled.
  Plan execution times were 5.238 ms and 0.361 ms, respectively.

## Reproducing the benchmark

1. Create a dedicated PostgreSQL database and apply `03_schema.sql`.
2. Run `06_benchmark_seed.sql`. **It truncates all application tables**, so do
   not run it against a database containing data you need.
3. Run `ANALYZE;` after loading the data.
4. In `04_queries.sql`, replace `TEAM_ID_HERE` with `team-001` and
   `USER_ID_HERE` with `user-0001`, then run Q17–Q26.
5. Run `psql -f dbms/07_measure_queries.sql` to repeat each operation and
   report the median and range. The script uses fixed benchmark IDs.
6. Run `EXPLAIN (ANALYZE, BUFFERS)` for plan details. `EXPLAIN ANALYZE` executes
   the query; the reported execution time excludes planning time.
7. Plan observations above come from separate single-run `EXPLAIN` executions
   and may differ from the five-run medians.

The SQL schema matches the tables, columns, constraints, and indexes in the
Prisma schema and complete migration chain. `Task.assigneeId` is nullable and
has a foreign key to `users.id`; when no primary assignee is set, store `NULL`. The
`task_assignees` join table continues to support multiple assignees.
