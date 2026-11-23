-- Convert the empty-string "unassigned" sentinel to SQL NULL before adding
-- the foreign key to the primary assignee.
UPDATE "tasks"
SET "assigneeId" = NULL
WHERE "assigneeId" = '';

ALTER TABLE "tasks"
    ALTER COLUMN "assigneeId" DROP DEFAULT,
    ALTER COLUMN "assigneeId" DROP NOT NULL;

ALTER TABLE "tasks"
    ADD CONSTRAINT "tasks_assigneeId_fkey"
    FOREIGN KEY ("assigneeId") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
