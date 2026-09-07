-- Sandbox/pilot cohort tracking on Client (cold cutover roadmap).
-- Apply in Supabase SQL Editor when tagging pretend clients for sandbox QA.
DO $$ BEGIN
  CREATE TYPE "DualRunMode" AS ENUM ('D0_SHADOW', 'D1_DUAL_WRITE', 'D2_RAS_PRIMARY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Client"
  ADD COLUMN IF NOT EXISTS "dualRunCohort" TEXT,
  ADD COLUMN IF NOT EXISTS "dualRunMode" "DualRunMode";

CREATE INDEX IF NOT EXISTS "Client_dualRunCohort_idx" ON "Client" ("dualRunCohort");
