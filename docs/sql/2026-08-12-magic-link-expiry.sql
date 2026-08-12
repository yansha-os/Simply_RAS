-- eMigration: Magic-link expiry / revocation (readiness gap 7)
-- Generated: 2026-08-12
--
-- Adds expiresAt/revokedAt columns for both magic-link surfaces:
--   - "IntakePacket" (parent intake magic link, CRM)
--   - "CandidateOnboardingPacket" (applicant onboarding magic link, HRM)
--
-- Idempotent: safe to re-run. No order dependency on other 2026-08-12 scripts.
-- Existing links keep working: NULL magicLinkExpiresAt is treated as
-- "no expiry recorded" by app code until the link is regenerated/reset,
-- at which point a fresh expiry window is stamped.

ALTER TABLE "IntakePacket"
  ADD COLUMN IF NOT EXISTS "magicLinkExpiresAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "magicLinkRevokedAt" TIMESTAMPTZ;

ALTER TABLE "CandidateOnboardingPacket"
  ADD COLUMN IF NOT EXISTS "magicLinkExpiresAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "magicLinkRevokedAt" TIMESTAMPTZ;
