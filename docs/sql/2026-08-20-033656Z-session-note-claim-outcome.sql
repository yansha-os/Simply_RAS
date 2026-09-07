-- SessionNote payer adjudication outcome (post isConverted / claim filed).
-- Idempotent: safe to re-run.

DO $$ BEGIN
  CREATE TYPE "ClaimOutcome" AS ENUM ('APPROVED', 'DENIED_CLERICAL', 'DENIED_CLINICAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "SessionNote"
  ADD COLUMN IF NOT EXISTS "claimOutcome" "ClaimOutcome";
