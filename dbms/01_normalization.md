# Database Normalization

## 1. Overview

The database contains eight relational tables matching the Prisma models:

1. `users`
2. `teams`
3. `team_members`
4. `team_invitations`
5. `tasks`
6. `task_assignees`
7. `messages`
8. `peer_ratings`

Their primary keys, foreign keys, unique constraints, and indexes are defined
in `03_schema.sql` and in the Prisma migration. Fields used for relationships
and frequent queries are ordinary SQL columns. The remaining JSONB fields
(`emailVerification`, `passwordReset`, and task `comments`) hold structured
values; `skills` and `workFocus` are PostgreSQL arrays.

## 2. Keys and functional dependencies

The following dependencies follow from declared primary and unique keys. They
assume IDs and emails are unique as constrained by the schema.

| Table | Candidate key(s) | Key dependency |
|---|---|---|
| `users` | `id`, `email` | `id → all other user columns`; `email → id and all other user columns` |
| `teams` | `id` | `id → all other team columns` |
| `team_members` | `id`, `(teamId, userId)` | Each candidate key determines all other membership columns |
| `team_invitations` | `id`, `(teamId, userId)` | Each candidate key determines all other invitation columns |
| `tasks` | `id` | `id → all other task columns` |
| `task_assignees` | `id`, `(taskId, userId)` | Each candidate key determines all other assignment columns |
| `messages` | `id` | `id → all other message columns` |
| `peer_ratings` | `id`, `(teamId, raterId, ratedUserId)` | Each candidate key determines all other rating columns |

Foreign keys enforce that teams have an existing creator; memberships,
invitations, and assignments refer to existing teams, users, and tasks; tasks
refer to an existing team and creator (and optionally an assignee); messages
refer to an existing team and sender; and ratings refer to an existing team,
rater, and rated user.

## 3. Normal forms

### First Normal Form (1NF)

The relational attributes are single scalar values except for PostgreSQL array
columns (`skills`, `workFocus`) and structured JSONB columns. Those fields can
contain multiple values, so the schema does not satisfy strict 1NF if atomicity
is required for every stored value. They are retained because the application
uses skills/focus lists and nested verification, reset, and comment data. The
many-to-many team membership and task assignment relationships are represented
with separate tables rather than JSON arrays.

### Second Normal Form (2NF)

Every table has a single-column primary key, so no partial dependency exists
relative to that primary key. However, `team_members`, `team_invitations`, and
`task_assignees` and `peer_ratings` also have composite alternate candidate
keys. Their name, email, role, and team-name snapshots may depend on only one
component if they are meant to mirror the current user or team record; in that
interpretation these tables are not in 2NF. If they record historical display
values, that dependency does not hold. The key constraints alone cannot
determine which interpretation the application intends.

### Third Normal Form (3NF) and BCNF

The foreign keys point to canonical team and user records, and join tables
represent team membership and task assignments. The schema also stores
repeated display fields such as `teamName`, `createdByName`, `assignee`,
`userName`, and rating names/roles. If these are required to equal the current
referenced row, they create transitive dependencies in single-key tables and
partial dependencies in tables with composite candidate keys. Those tables
would not meet 3NF/BCNF under that interpretation. If the fields are snapshots
whose value is intentionally preserved when a referenced name changes, the
dependencies do not hold. Since the schema does not enforce either policy,
strict 3NF/BCNF status for those fields cannot be established from DDL alone.

The display fields can be kept as historical snapshots or removed from
relational rows and retrieved through joins, depending on the desired behavior.
The current schema preserves the app's fields and foreign keys, but does not
enforce equality between snapshots and canonical names.

JSONB contents and arrays are outside these relational functional-dependency
claims; their internal structure must be reviewed separately if strict
normalization is required for those values.

## 4. Integrity constraints and indexes

- `users.email` is unique.
- A user can belong to or be invited to a team once, enforced by unique
  `(teamId, userId)` constraints.
- A user can be assigned to a task once, enforced by unique `(taskId, userId)`.
- A user can rate another user once per team, enforced by unique
  `(teamId, raterId, ratedUserId)`.
- Foreign keys enforce the relationships listed above. Team-owned rows cascade
  when a team is deleted; user-owned membership, invitation, assignment,
  message, and rating rows follow their declared cascade/restrict behavior.
- Indexes support team/creator lookups, task status filtering, message ordering,
  rating lookup/order, and related-user lookups.

## 5. Summary

The database is relational for its core entities and associations, with
explicit constraints for identity and referential integrity. Repeating
relationships use join tables. Arrays and selected JSONB fields remain
multi-valued by design, and cached display names are intentional denormalized
snapshots rather than authoritative relationship data.
