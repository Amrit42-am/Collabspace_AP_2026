
# Database Normalization

## 1. Overview

The database consists of five tables:

1. User
2. Team
3. Task
4. Message
5. PeerRating

The schema follows a hybrid relational-document approach. Primary identifiers and selected attributes are stored as relational columns, while additional information is stored using PostgreSQL's JSONB data type.

The purpose of normalization is to reduce data redundancy, prevent insertion, update and deletion anomalies, and maintain data consistency.

This document analyzes the normalization of the five tables using their declared relational columns and constraints.

**Note:** The internal structure of the JSONB columns is not specified in the provided schema. Therefore, normalization of attributes inside those JSON documents cannot be conclusively established.

---

## 2. Functional Dependencies

A functional dependency (FD) describes a relationship in which one attribute or group of attributes uniquely determines another attribute or group of attributes.

The notation:

`A → B`

means that attribute A determines attribute B.

### 2.1 User

**Attributes:**

- id (Primary Key)
- email (Unique)
- data (JSONB)

**Functional Dependencies:**

- `id → email, data`
- `email → id, data`

The `id` column is the primary key, while `email` has a unique constraint through a unique index.

Both attributes uniquely identify a user record.

**Candidate Keys:** `id`, `email`

### 2.2 Team

**Attributes:**

- id (Primary Key)
- data (JSONB)

**Functional Dependency:**

- `id → data`

The `id` column uniquely identifies each team record.

**Candidate Key:** `id`

### 2.3 Task

**Attributes:**

- id (Primary Key)
- data (JSONB)

**Functional Dependency:**

- `id → data`

Each task is uniquely identified by its `id`.

**Candidate Key:** `id`

### 2.4 Message

**Attributes:**

- id (Primary Key)
- data (JSONB)

**Functional Dependency:**

- `id → data`

Each message is uniquely identified by its `id`.

**Candidate Key:** `id`

### 2.5 PeerRating

**Attributes:**

- id (Primary Key)
- teamId
- raterId
- ratedUserId
- updatedAt
- data (JSONB)

**Functional Dependencies:**

- `id → teamId, raterId, ratedUserId, updatedAt, data`
- `(teamId, raterId, ratedUserId) → id, updatedAt, data`

The first dependency exists because `id` is the primary key.

The second dependency exists because the combination of `teamId`, `raterId`, and `ratedUserId` has a unique constraint.

This ensures that the same user cannot create multiple rating records for the same user within the same team.

**Candidate Keys:**
- `id`
- `(teamId, raterId, ratedUserId)`

---

## 3. Normalization Analysis

### 3.1 First Normal Form (1NF)

A relation satisfies First Normal Form when:

- Each row is uniquely identifiable.
- Each attribute contains a single value.
- There are no repeating groups in the relational structure.

**Analysis:**

All five tables have primary keys that uniquely identify their records.

The relational columns contain individual values rather than repeating groups.

The `data` columns use JSONB, which can contain nested objects, arrays, and other JSON structures. Their internal contents cannot be verified against the supplied schema.

Therefore, the outer relational structure satisfies the basic 1NF requirements, but strict atomicity and absence of repeating groups inside JSONB cannot be established without examining the stored documents.

### 3.2 Second Normal Form (2NF)

A relation satisfies Second Normal Form when:

- It is already in 1NF.
- Every non-key attribute is fully functionally dependent on the entire candidate key.
- There are no partial dependencies.

**Analysis:**

The `User`, `Team`, `Task`, and `Message` tables have single-column primary keys. Therefore, partial dependencies cannot occur against these primary keys.

The `PeerRating` table has a composite candidate key consisting of:

`(teamId, raterId, ratedUserId)`

The remaining attributes (`updatedAt` and `data`) depend on the complete combination rather than any individual component, based on the declared unique constraint and available schema.

Therefore, there are no partial dependencies in the declared relational columns.

All five tables satisfy 2NF at the outer relational level.

### 3.3 Third Normal Form (3NF)

A relation satisfies Third Normal Form when:

- It is already in 2NF.
- No non-key attribute is transitively dependent on a candidate key through another non-key attribute.

**Analysis:**

In the `User`, `Team`, `Task`, and `Message` tables, the declared non-key attributes depend directly on their respective primary keys.

In `PeerRating`, the declared attributes depend on either of its candidate keys. No additional non-key-to-non-key functional dependencies are specified in the schema.

Therefore, no transitive dependencies are identifiable among the declared relational columns.

All five tables satisfy 3NF based on the available functional dependencies.

### 3.4 Boyce-Codd Normal Form (BCNF)

A relation satisfies BCNF when every determinant of a non-trivial functional dependency is a superkey.

**Analysis:**

For `User`, both `id` and `email` are candidate keys. Hence, both determinants are superkeys.

For `Team`, `Task`, and `Message`, the only declared determinant is `id`, which is the primary key.

For `PeerRating`, both `id` and the composite key `(teamId, raterId, ratedUserId)` are candidate keys.

Therefore, every determinant in the declared functional dependencies is a candidate key.

All five tables satisfy BCNF at the relational-column level, based on the declared constraints.

---

## 4. Summary of Normal Forms

| Table | Primary Key | Candidate Keys | Highest Verified Normal Form |
|---|---|---|---|
| User | id | id, email | BCNF |
| Team | id | id | BCNF |
| Task | id | id | BCNF |
| Message | id | id | BCNF |
| PeerRating | id | id, (teamId, raterId, ratedUserId) | BCNF |

The BCNF assessment applies to the declared relational attributes and their functional dependencies. It does not establish the internal normalization of JSONB documents.

---

## 5. JSONB and Database Design

The schema uses JSONB columns in all five tables.

JSONB allows flexible storage of structured information without requiring every attribute to be represented as a separate relational column.

### Advantages

- Supports flexible and nested data structures.
- Allows additional attributes without changing the table structure.
- Supports PostgreSQL JSON operators and functions.
- Can be indexed using GIN indexes when required by query patterns.

### Limitations

- Individual JSON fields do not automatically receive relational constraints.
- Foreign keys cannot directly reference values inside JSON documents.
- Inconsistent document structures can introduce data-quality problems.
- Queries involving frequently accessed JSON attributes may require additional indexes.
- Functional dependencies inside JSON documents cannot be determined from the table definitions alone.

The actual JSONB structures should be examined separately before making claims about their internal normalization.

---

## 6. Keys, Constraints and Indexes

The schema uses the following integrity constraints:

| Table | Constraint | Purpose |
|---|---|---|
| User | PRIMARY KEY (id) | Uniquely identifies users |
| User | UNIQUE (email) | Prevents duplicate email values |
| Team | PRIMARY KEY (id) | Uniquely identifies teams |
| Task | PRIMARY KEY (id) | Uniquely identifies tasks |
| Message | PRIMARY KEY (id) | Uniquely identifies messages |
| PeerRating | PRIMARY KEY (id) | Uniquely identifies rating records |
| PeerRating | UNIQUE (teamId, raterId, ratedUserId) | Prevents duplicate ratings for the same team and user combination |

Two additional indexes are defined:

1. `PeerRating_teamId_updatedAt_idx`: Helps retrieve and order rating records by team and update time.
2. `User_email_key`: Supports unique email lookups.

PostgreSQL automatically creates unique B-tree indexes for primary keys and unique constraints.

### Referential Integrity Observation

The columns `teamId`, `raterId`, and `ratedUserId` appear to represent relationships with the `Team` and `User` tables.

However, the supplied schema does not declare foreign key constraints for these columns. Therefore, PostgreSQL does not currently enforce the existence of the referenced records.

The actual relationship requirements should be confirmed before adding foreign key constraints.

---

## 7. Conclusion

The database uses a hybrid relational-document design with five tables and JSONB columns for flexible data storage.

Based on the declared relational columns, all five tables satisfy 1NF, 2NF, 3NF, and BCNF.

The primary keys provide unique identification, while unique indexes enforce additional business rules, particularly for email addresses and peer ratings.

The main limitation of the current schema is that the internal structure of JSONB data is not explicitly defined. Consequently, its internal functional dependencies, atomicity, and normalization cannot be fully evaluated without examining actual JSON documents.

Overall, the declared relational structure provides a consistent foundation, while further validation of JSONB structures and intended table relationships would be necessary for a complete normalization assessment.
