-- ABA session note additive fields (Session Studio Slice 0 / SoT §8.4)
-- Run manually in Supabase SQL Editor. Idempotent where possible.
-- Creates: SessionStatus.IN_PROGRESS, Session.placeOfServiceCode,
--          SessionNote structured / signer / tracker columns + indexes.

-- 1) SessionStatus: add IN_PROGRESS if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'SessionStatus' AND e.enumlabel = 'IN_PROGRESS'
  ) THEN
    ALTER TYPE "SessionStatus" ADD VALUE 'IN_PROGRESS';
  END IF;
END $$;

-- 2) Session: normalized POS code
ALTER TABLE "Session"
  ADD COLUMN IF NOT EXISTS "placeOfServiceCode" TEXT;

-- 3) SessionNote: structured + signature audit + tracker fields
ALTER TABLE "SessionNote"
  ADD COLUMN IF NOT EXISTS "structuredContent" JSONB,
  ADD COLUMN IF NOT EXISTS "checklistSnapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "billableUnits" INTEGER,
  ADD COLUMN IF NOT EXISTS "rbtSignedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "parentSignedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "bcbaSignedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "rbtSignerName" TEXT,
  ADD COLUMN IF NOT EXISTS "parentSignerName" TEXT,
  ADD COLUMN IF NOT EXISTS "bcbaSignerName" TEXT,
  ADD COLUMN IF NOT EXISTS "plutusClaimRef" TEXT,
  ADD COLUMN IF NOT EXISTS "convertedAt" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "SessionNote_bcbaSigned_isConverted_idx"
  ON "SessionNote" ("bcbaSigned", "isConverted");

CREATE INDEX IF NOT EXISTS "SessionNote_rbtSigned_bcbaSigned_idx"
  ON "SessionNote" ("rbtSigned", "bcbaSigned");
