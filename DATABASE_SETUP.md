# PostgreSQL and Prisma

This repository includes a Prisma schema and its PostgreSQL migration history in
`prisma/`. The SQL coursework schema in `dbms/03_schema.sql` reflects the same
final database structure; `dbms/04_queries.sql` contains queries for that
structure.

## Local setup

Use Node.js 22.18 or newer.

1. Copy `.env.example` to `.env`.
2. Start PostgreSQL with `docker compose up -d`.
3. Install the project packages with `npm install`.
4. Generate the Prisma client with `npm run db:generate`.
5. Apply the migrations with `npm run db:migrate`.
6. Start the web page and API together with `npm run dev`.

Set `DATABASE_URL` to the PostgreSQL connection string for your database. The
checked-in example is for the local Docker database only. Set `SESSION_SECRET`
to a long random value before deploying. Do not commit `.env` or production
credentials.

For a production build, run `npm run build` and then `npm start`; the API server
serves the built React application and its `/api` routes from the same origin.
The second migration converts empty task assignee IDs to `NULL` and adds a
foreign key to the optional primary assignee.
