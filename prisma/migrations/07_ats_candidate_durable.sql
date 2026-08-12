-- Phase 1: Durable ATS fields on AtsCandidate
-- Paste into Supabase SQL Editor. Idempotent where possible.

ALTER TABLE "AtsCandidate"
  ADD COLUMN IF NOT EXISTS "activationStatus" TEXT NOT NULL DEFAULT 'PENDING_HR_REVIEW';

ALTER TABLE "AtsCandidate"
  ADD COLUMN IF NOT EXISTS "dossier" JSONB DEFAULT '{}'::jsonb;

ALTER TABLE "AtsCandidate"
  ADD COLUMN IF NOT EXISTS "userId" UUID;

ALTER TABLE "AtsCandidate"
  ADD COLUMN IF NOT EXISTS "assignedHrAgentId" UUID;

-- Optional: normalize legacy stage defaults in app comments; leave existing rows as-is.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AtsCandidate_userId_fkey'
  ) THEN
    ALTER TABLE "AtsCandidate"
      ADD CONSTRAINT "AtsCandidate_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AtsCandidate_assignedHrAgentId_fkey'
  ) THEN
    ALTER TABLE "AtsCandidate"
      ADD CONSTRAINT "AtsCandidate_assignedHrAgentId_fkey"
      FOREIGN KEY ("assignedHrAgentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "AtsCandidate_stage_idx" ON "AtsCandidate"("stage");
CREATE INDEX IF NOT EXISTS "AtsCandidate_userId_idx" ON "AtsCandidate"("userId");
CREATE INDEX IF NOT EXISTS "AtsCandidate_assignedHrAgentId_idx" ON "AtsCandidate"("assignedHrAgentId");
