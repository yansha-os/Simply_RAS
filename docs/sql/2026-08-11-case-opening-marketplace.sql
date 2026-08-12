-- Migration: CaseOpening + CaseApplication (Phase 1 staffing marketplace)
-- Generated: 2026-08-11
-- Run in Supabase SQL Editor. Idempotent where possible.

DO $$ BEGIN
  CREATE TYPE "CaseOpeningStatus" AS ENUM ('OPEN', 'FILLED', 'CLOSED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CaseApplicationStatus" AS ENUM (
    'APPLIED',
    'MESSAGING',
    'MEET_SCHEDULED',
    'PARENT_PENDING',
    'APPROVED',
    'REJECTED',
    'WITHDRAWN'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CaseOpening" (
  "id"                  UUID NOT NULL DEFAULT gen_random_uuid(),
  "clientId"            UUID NOT NULL,
  "createdById"         UUID NOT NULL,
  "caseCode"            TEXT NOT NULL,
  "status"              "CaseOpeningStatus" NOT NULL DEFAULT 'OPEN',
  "weeklyHours"         INTEGER,
  "borough"             TEXT,
  "neighborhood"        TEXT,
  "ageBand"             TEXT,
  "clientInitials"      TEXT,
  "scheduleText"        TEXT,
  "locationNotes"       TEXT,
  "transportationNotes" TEXT,
  "scheduleJson"        JSONB,
  "bcbaDisplayName"     TEXT,
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "CaseOpening_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CaseOpening_caseCode_key" UNIQUE ("caseCode"),
  CONSTRAINT "CaseOpening_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CaseOpening_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "CaseOpening_status_idx" ON "CaseOpening"("status");
CREATE INDEX IF NOT EXISTS "CaseOpening_clientId_idx" ON "CaseOpening"("clientId");
CREATE INDEX IF NOT EXISTS "CaseOpening_createdById_idx" ON "CaseOpening"("createdById");

CREATE TABLE IF NOT EXISTS "CaseApplication" (
  "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
  "openingId"        UUID NOT NULL,
  "rbtUserId"        UUID NOT NULL,
  "status"           "CaseApplicationStatus" NOT NULL DEFAULT 'APPLIED',
  "message"          TEXT,
  "meetAt"           TIMESTAMPTZ,
  "meetLink"         TEXT,
  "parentDecisionAt" TIMESTAMPTZ,
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "CaseApplication_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CaseApplication_openingId_rbtUserId_key" UNIQUE ("openingId", "rbtUserId"),
  CONSTRAINT "CaseApplication_openingId_fkey"
    FOREIGN KEY ("openingId") REFERENCES "CaseOpening"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CaseApplication_rbtUserId_fkey"
    FOREIGN KEY ("rbtUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "CaseApplication_rbtUserId_idx" ON "CaseApplication"("rbtUserId");
CREATE INDEX IF NOT EXISTS "CaseApplication_status_idx" ON "CaseApplication"("status");
CREATE INDEX IF NOT EXISTS "CaseApplication_openingId_idx" ON "CaseApplication"("openingId");
