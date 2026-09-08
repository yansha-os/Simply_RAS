-- Fail closed for legacy parent/applicant magic links that predate expiry tracking.
-- Existing links retain their original issuance age: none receive a fresh window.

BEGIN;

UPDATE "IntakePacket"
SET "magicLinkExpiresAt" = "createdAt" + INTERVAL '30 days'
WHERE "magicLinkToken" IS NOT NULL
  AND "magicLinkExpiresAt" IS NULL;

UPDATE "CandidateOnboardingPacket"
SET "magicLinkExpiresAt" = "createdAt" + INTERVAL '30 days'
WHERE "magicLinkToken" IS NOT NULL
  AND "magicLinkExpiresAt" IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'IntakePacket_magic_link_requires_expiry_check'
      AND conrelid = '"IntakePacket"'::regclass
  ) THEN
    ALTER TABLE "IntakePacket"
      ADD CONSTRAINT "IntakePacket_magic_link_requires_expiry_check"
      CHECK ("magicLinkToken" IS NULL OR "magicLinkExpiresAt" IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'CandidateOnboardingPacket_magic_link_requires_expiry_check'
      AND conrelid = '"CandidateOnboardingPacket"'::regclass
  ) THEN
    ALTER TABLE "CandidateOnboardingPacket"
      ADD CONSTRAINT "CandidateOnboardingPacket_magic_link_requires_expiry_check"
      CHECK ("magicLinkToken" IS NULL OR "magicLinkExpiresAt" IS NOT NULL);
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "IntakePacket"
    WHERE "magicLinkToken" IS NOT NULL
      AND "magicLinkExpiresAt" IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM "CandidateOnboardingPacket"
    WHERE "magicLinkToken" IS NOT NULL
      AND "magicLinkExpiresAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'Magic-link expiry backfill did not complete';
  END IF;
END
$$;

COMMIT;
