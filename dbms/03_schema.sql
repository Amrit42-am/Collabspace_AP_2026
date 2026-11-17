
-- ============================================================
-- Database Schema
-- PostgreSQL 15+
-- ============================================================

-- ============================================================
-- 1. USER TABLE
-- ============================================================

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "User_pkey"
        PRIMARY KEY ("id")
);


-- ============================================================
-- 2. TEAM TABLE
-- ============================================================

CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "Team_pkey"
        PRIMARY KEY ("id")
);


-- ============================================================
-- 3. TASK TABLE
-- ============================================================

CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "Task_pkey"
        PRIMARY KEY ("id")
);


-- ============================================================
-- 4. MESSAGE TABLE
-- ============================================================

CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "Message_pkey"
        PRIMARY KEY ("id")
);


-- ============================================================
-- 5. PEER RATING TABLE
-- ============================================================

CREATE TABLE "PeerRating" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "raterId" TEXT NOT NULL,
    "ratedUserId" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "PeerRating_pkey"
        PRIMARY KEY ("id")
);


-- ============================================================
-- 6. UNIQUE INDEXES
-- ============================================================

-- Ensures that each user has a unique email address.

CREATE UNIQUE INDEX "User_email_key"
ON "User" ("email");


-- Ensures that a user can rate another user only once
-- within the same team.

CREATE UNIQUE INDEX "PeerRating_teamId_raterId_ratedUserId_key"
ON "PeerRating" ("teamId", "raterId", "ratedUserId");


-- ============================================================
-- 7. PERFORMANCE INDEXES
-- ============================================================

-- Supports retrieving and ordering peer ratings
-- belonging to a particular team by update time.

CREATE INDEX "PeerRating_teamId_updatedAt_idx"
ON "PeerRating" ("teamId", "updatedAt");


-- ============================================================
-- END OF SCHEMA
-- ============================================================
