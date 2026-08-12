-- Phase 1: Durable onboarding requirement progress (replaces ras_rbt_* localStorage flags)
-- Paste into Supabase SQL Editor AFTER wiring app reads/writes off localStorage.
-- Depends on: 07_ats_candidate_durable.sql (activationStatus, dossier, userId already applied)

-- Ensure every AtsCandidate has an onboarding packet row
INSERT INTO "CandidateOnboardingPacket" ("id", "candidateId", "magicLinkToken", "formData", "createdAt", "updatedAt")
SELECT gen_random_uuid(), c."id", gen_random_uuid()::text, '{}'::jsonb, NOW(), NOW()
FROM "AtsCandidate" c
WHERE NOT EXISTS (
  SELECT 1 FROM "CandidateOnboardingPacket" p WHERE p."candidateId" = c."id"
);

-- Requirement completion flags (4 required + optional background/cert)
ALTER TABLE "CandidateOnboardingPacket"
  ADD COLUMN IF NOT EXISTS "tasksDone" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "CandidateOnboardingPacket"
  ADD COLUMN IF NOT EXISTS "tasksCompletedSteps" JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "CandidateOnboardingPacket"
  ADD COLUMN IF NOT EXISTS "availabilityDone" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "CandidateOnboardingPacket"
  ADD COLUMN IF NOT EXISTS "availabilityGrid" JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "CandidateOnboardingPacket"
  ADD COLUMN IF NOT EXISTS "preferredBoroughs" JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "CandidateOnboardingPacket"
  ADD COLUMN IF NOT EXISTS "transportation" TEXT;

ALTER TABLE "CandidateOnboardingPacket"
  ADD COLUMN IF NOT EXISTS "simulationDone" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "CandidateOnboardingPacket"
  ADD COLUMN IF NOT EXISTS "interviewBooked" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "CandidateOnboardingPacket"
  ADD COLUMN IF NOT EXISTS "interviewPassed" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "CandidateOnboardingPacket"
  ADD COLUMN IF NOT EXISTS "certUploaded" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "CandidateOnboardingPacket"
  ADD COLUMN IF NOT EXISTS "backgroundCleared" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "CandidateOnboardingPacket"
  ADD COLUMN IF NOT EXISTS "clearedForHire" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "CandidateOnboardingPacket_tasksDone_idx"
  ON "CandidateOnboardingPacket"("tasksDone");
CREATE INDEX IF NOT EXISTS "CandidateOnboardingPacket_interviewBooked_idx"
  ON "CandidateOnboardingPacket"("interviewBooked");
CREATE INDEX IF NOT EXISTS "CandidateOnboardingPacket_interviewPassed_idx"
  ON "CandidateOnboardingPacket"("interviewPassed");

-- Replaces localStorage keys:
-- ras_rbt_tasks_done*, ras_rbt_completed_steps*
-- ras_rbt_availability_set*, ras_rbt_boroughs, ras_rbt_transportation
-- ras_rbt_sim_completed*, ras_rbt_simulation_completed*
-- ras_rbt_interview_booked*, ras_rbt_interview_done*, ras_rbt_interview_passed*
-- ras_rbt_cert_uploaded*, ras_rbt_background_cleared*, ras_rbt_cleared*
-- ras_ats_custom_stages (stage stays on AtsCandidate.stage)
