-- Phase 7: auditable onboarding e-sign / upload / quiz events
-- Paste into Supabase SQL Editor. Idempotent.

ALTER TABLE "CandidateOnboardingPacket"
  ADD COLUMN IF NOT EXISTS "ls54PreparedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "ls54PreparedByUserId" UUID,
  ADD COLUMN IF NOT EXISTS "ls54StoragePath" TEXT;

CREATE TABLE IF NOT EXISTS "OnboardingSignatureEvent" (
  "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
  "candidateId"       UUID NOT NULL,
  "stepNumber"        INTEGER NOT NULL,
  "documentKey"       TEXT NOT NULL,
  "documentTitle"     TEXT NOT NULL,
  "documentVersion"   TEXT NOT NULL,
  "actionType"        TEXT NOT NULL,
  "signerName"        TEXT,
  "consents"          JSONB NOT NULL DEFAULT '{}'::jsonb,
  "auditHash"         TEXT NOT NULL,
  "storagePath"       TEXT,
  "fileName"          TEXT,
  "quizScore"         INTEGER,
  "quizAttempt"       INTEGER,
  "quizAnswers"       JSONB,
  "ipAddress"         TEXT,
  "userAgent"         TEXT,
  "deviceFingerprint" TEXT,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "OnboardingSignatureEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OnboardingSignatureEvent_candidateId_fkey"
    FOREIGN KEY ("candidateId") REFERENCES "AtsCandidate"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "OnboardingSignatureEvent_candidateId_createdAt_idx"
  ON "OnboardingSignatureEvent" ("candidateId", "createdAt");

CREATE INDEX IF NOT EXISTS "OnboardingSignatureEvent_candidateId_stepNumber_idx"
  ON "OnboardingSignatureEvent" ("candidateId", "stepNumber");

CREATE INDEX IF NOT EXISTS "OnboardingSignatureEvent_documentKey_idx"
  ON "OnboardingSignatureEvent" ("documentKey");
