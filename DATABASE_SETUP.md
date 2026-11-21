# PostgreSQL and Prisma

This repository includes a Prisma schema and its initial PostgreSQL migration in `prisma/`. The existing SQL coursework files in `dbms/` are preserved separately.

## Local setup

1. Copy `.env.example` to `.env`.
2. Start PostgreSQL with `docker compose up -d`.
3. Apply the migration with `npx prisma migrate deploy`.

Set `DATABASE_URL` to the PostgreSQL connection string for your database. The checked-in example is for the local Docker database only. Do not commit `.env` or production credentials.

To use Prisma commands, install `prisma` and `@prisma/client` in the Node project. `npx prisma generate` generates the client after installation.
