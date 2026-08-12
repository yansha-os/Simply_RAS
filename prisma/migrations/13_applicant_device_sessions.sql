-- Phase 6: Device-bound applicant magic-link sessions (passwordless applicant login)
-- Paste AFTER Phase 1. This is the durable version of "binding link" on mobile.

ALTER TABLE "CandidateOnboardingPacket"
  ADD COLUMN IF NOT EXISTS "deviceFingerprint" TEXT;

ALTER TABLE "CandidateOnboardingPacket"
  ADD COLUMN IF NOT EXISTS "deviceBoundAt" TIMESTAMPTZ;

ALTER TABLE "CandidateOnboardingPacket"
  ADD COLUMN IF NOT EXISTS "inviteSentAt" TIMESTAMPTZ;

ALTER TABLE "CandidateOnboardingPacket"
  ADD COLUMN IF NOT EXISTS "inviteAcceptedAt" TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS "ApplicantDeviceSession" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "candidateId" UUID NOT NULL REFERENCES "AtsCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "deviceFingerprint" TEXT NOT NULL,
  "magicLinkToken" TEXT NOT NULL,
  "userAgent" TEXT,
  "ipAddress" TEXT,
  "boundAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "lastSeenAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "revokedAt" TIMESTAMPTZ,
  CONSTRAINT "ApplicantDeviceSession_candidate_device_unique"
    UNIQUE ("candidateId", "deviceFingerprint")
);

CREATE INDEX IF NOT EXISTS "ApplicantDeviceSession_magicLinkToken_idx"
  ON "ApplicantDeviceSession"("magicLinkToken");
CREATE INDEX IF NOT EXISTS "ApplicantDeviceSession_candidateId_idx"
  ON "ApplicantDeviceSession"("candidateId");

-- Flow:
-- 1) HR invites → magicLinkToken on packet, inviteSentAt set
-- 2) Applicant opens /magic-link/{token} on phone → bind deviceFingerprint (httpOnly cookie)
-- 3) Later visits to HRM with same fingerprint = logged-in applicant (no password)
-- 4) Revoke = set revokedAt (lost phone / HR reset)

-- Replaces: ephemeral device_fingerprint cookie with no durable binding row
-- (cookie can remain as client carrier; DB is source of truth for bind)
