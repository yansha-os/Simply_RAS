-- eMigration: schema-parity backfill — every model/column/enum value in
--            prisma/schema.prisma that has NO DDL of record in the
--            prisma/migrations archive (01-15) or earlier docs/sql scripts.
-- Generated: 2026-08-12 (production-readiness gap analysis, Phase 0 / Blocker 2)
-- Run in Supabase SQL Editor. Fully idempotent — on a DB that already has these
-- objects (created historically via `prisma db push`) every statement is a no-op.
--
-- Order: run AFTER the three 2026-08-11 scripts and 2026-08-12-staff-message.sql.
--
-- Contents:
--   1) Enum values:  Role (HR wave), ClientStatus (assessment/TX-PA/staffing wave)
--   2) Columns on existing tables: Client, ActionItem, IntakePacket, PARequest
--   3) Tables referenced by app code with no CREATE of record:
--      ClientMessage, Notification, GoalTemplate, SkillTarget, SessionTrialData,
--      BehaviorTarget, BehaviorLog, EVVLog
--   4) ATS base tables altered by archive 07-15 but never created of record:
--      AtsCandidate, CandidateOnboardingPacket
--   5) Schema-only models (in schema.prisma, NOT yet referenced by app code):
--      StaffCredential, ScheduleAppointment, ReAuthPacket, AuditLogVault

-- ============================================================
-- 1) Enum values missing from the archive
-- ============================================================

-- Role: HR wave (archive 02 created the enum without these)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
                 WHERE t.typname = 'Role' AND e.enumlabel = 'HR') THEN
    ALTER TYPE "Role" ADD VALUE 'HR';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
                 WHERE t.typname = 'Role' AND e.enumlabel = 'HEAD_HR') THEN
    ALTER TYPE "Role" ADD VALUE 'HEAD_HR';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
                 WHERE t.typname = 'Role' AND e.enumlabel = 'HR_AGENT') THEN
    ALTER TYPE "Role" ADD VALUE 'HR_AGENT';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
                 WHERE t.typname = 'Role' AND e.enumlabel = 'FINANCE') THEN
    ALTER TYPE "Role" ADD VALUE 'FINANCE';
  END IF;
END $$;

-- NOTE: archive 02 also created Role values SESSION_NOTES_COORDINATOR and
-- SCHEDULING which schema.prisma no longer declares. Removing enum values is
-- destructive — leave them in the DB; they are simply unused.

-- ClientStatus: assessment / TX-PA / staffing wave (archive 04 stopped at PA_APPROVED)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
                 WHERE t.typname = 'ClientStatus' AND e.enumlabel = 'ASSESSMENT_SCHEDULED') THEN
    ALTER TYPE "ClientStatus" ADD VALUE 'ASSESSMENT_SCHEDULED';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
                 WHERE t.typname = 'ClientStatus' AND e.enumlabel = 'REPORT_ASSEMBLED') THEN
    ALTER TYPE "ClientStatus" ADD VALUE 'REPORT_ASSEMBLED';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
                 WHERE t.typname = 'ClientStatus' AND e.enumlabel = 'TX_PA_SUBMITTED') THEN
    ALTER TYPE "ClientStatus" ADD VALUE 'TX_PA_SUBMITTED';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
                 WHERE t.typname = 'ClientStatus' AND e.enumlabel = 'TX_PA_APPROVED') THEN
    ALTER TYPE "ClientStatus" ADD VALUE 'TX_PA_APPROVED';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
                 WHERE t.typname = 'ClientStatus' AND e.enumlabel = 'STAFFING_PENDING') THEN
    ALTER TYPE "ClientStatus" ADD VALUE 'STAFFING_PENDING';
  END IF;
END $$;

-- ============================================================
-- 2) Columns on existing tables with no DDL of record
-- ============================================================

-- Client: RBT assignment + treatment plan
ALTER TABLE "Client"
  ADD COLUMN IF NOT EXISTS "rbtId" UUID,
  ADD COLUMN IF NOT EXISTS "rbtApproved" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "treatmentPlan" JSONB DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Client_rbtId_fkey') THEN
    ALTER TABLE "Client"
      ADD CONSTRAINT "Client_rbtId_fkey"
      FOREIGN KEY ("rbtId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ActionItem: optional client link
ALTER TABLE "ActionItem"
  ADD COLUMN IF NOT EXISTS "clientId" UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ActionItem_clientId_fkey') THEN
    ALTER TABLE "ActionItem"
      ADD CONSTRAINT "ActionItem_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- IntakePacket: magic-link + current document-flag set.
-- (Archive 04 created legacy flags form1Complete/form2Complete/form3Complete/
--  insuranceCardUploaded/medicaidCardUploaded, which schema.prisma no longer
--  declares. Dropping columns is destructive — leave them in place.)
ALTER TABLE "IntakePacket"
  ADD COLUMN IF NOT EXISTS "magicLinkToken" TEXT,
  ADD COLUMN IF NOT EXISTS "deviceFingerprint" TEXT,
  ADD COLUMN IF NOT EXISTS "intakeFormComplete" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "consentFormComplete" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "insuranceCardFrontUploaded" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "insuranceCardBackUploaded" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "medicaidCardFrontUploaded" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "medicaidCardBackUploaded" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "iepUploaded" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "priorAbaRecordsUploaded" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "clientChangeRequested" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "clientChangeNotes" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "IntakePacket_magicLinkToken_key"
  ON "IntakePacket"("magicLinkToken");

-- PARequest: peer-to-peer review fields
ALTER TABLE "PARequest"
  ADD COLUMN IF NOT EXISTS "p2pResolved" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "p2pNotes" TEXT;

-- ============================================================
-- 3) Tables referenced by app code with no CREATE of record
-- ============================================================

-- Parent <-> staff messaging (magic-link portal + client profile)
CREATE TABLE IF NOT EXISTS "ClientMessage" (
  "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
  "clientId"     UUID NOT NULL,
  "content"      TEXT NOT NULL,
  "isFromClient" BOOLEAN NOT NULL DEFAULT false,
  "senderName"   TEXT NOT NULL,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "readAt"       TIMESTAMPTZ,
  CONSTRAINT "ClientMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClientMessage_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- In-app notification bell (both apps)
CREATE TABLE IF NOT EXISTS "Notification" (
  "id"        UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId"    UUID,
  "title"     TEXT NOT NULL,
  "message"   TEXT NOT NULL,
  "type"      TEXT NOT NULL DEFAULT 'INFO',
  "linkUrl"   TEXT,
  "isRead"    BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Notification_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- BCBA goal bank
CREATE TABLE IF NOT EXISTS "GoalTemplate" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "type"        TEXT NOT NULL,
  "domain"      TEXT,
  "description" TEXT,
  "mastery"     TEXT,
  "behavior"    TEXT,
  "topography"  TEXT,
  "function"    TEXT,
  "antecedent"  TEXT,
  "consequence" TEXT,
  "authorName"  TEXT,
  "createdAt"   TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "GoalTemplate_pkey" PRIMARY KEY ("id")
);

-- EMR data collection: skill acquisition targets
CREATE TABLE IF NOT EXISTS "SkillTarget" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "clientId"        UUID NOT NULL,
  "domain"          TEXT NOT NULL,
  "title"           TEXT NOT NULL,
  "description"     TEXT,
  "measurementType" TEXT NOT NULL DEFAULT 'TRIAL',
  "targetStatus"    TEXT NOT NULL DEFAULT 'BASELINE',
  "masteryCriteria" TEXT DEFAULT '80% over 3 sessions',
  "baselineData"    DOUBLE PRECISION,
  "phaseLines"      JSONB DEFAULT '[]',
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "SkillTarget_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SkillTarget_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- EMR data collection: per-session trial logs
CREATE TABLE IF NOT EXISTS "SessionTrialData" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "sessionId"   UUID NOT NULL,
  "targetId"    UUID NOT NULL,
  "score"       TEXT NOT NULL,
  "promptLevel" TEXT,
  "trialIndex"  INTEGER NOT NULL DEFAULT 1,
  "timestamp"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "SessionTrialData_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SessionTrialData_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SessionTrialData_targetId_fkey"
    FOREIGN KEY ("targetId") REFERENCES "SkillTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- EMR data collection: behavior reduction targets
CREATE TABLE IF NOT EXISTS "BehaviorTarget" (
  "id"                  UUID NOT NULL DEFAULT gen_random_uuid(),
  "clientId"            UUID NOT NULL,
  "behaviorName"        TEXT NOT NULL,
  "definition"          TEXT NOT NULL,
  "measurementType"     TEXT NOT NULL DEFAULT 'FREQUENCY',
  "antecedents"         TEXT,
  "consequences"        TEXT,
  "replacementBehavior" TEXT,
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "BehaviorTarget_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BehaviorTarget_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- EMR data collection: per-session behavior logs
CREATE TABLE IF NOT EXISTS "BehaviorLog" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "sessionId"       UUID NOT NULL,
  "behaviorId"      UUID NOT NULL,
  "frequencyCount"  INTEGER DEFAULT 1,
  "durationSeconds" INTEGER DEFAULT 0,
  "intensity"       TEXT DEFAULT 'MODERATE',
  "abcNotes"        TEXT,
  "timestamp"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "BehaviorLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BehaviorLog_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BehaviorLog_behaviorId_fkey"
    FOREIGN KEY ("behaviorId") REFERENCES "BehaviorTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- EVV clock in/out log (session studio)
CREATE TABLE IF NOT EXISTS "EVVLog" (
  "id"                 UUID NOT NULL DEFAULT gen_random_uuid(),
  "sessionId"          UUID NOT NULL,
  "staffId"            UUID NOT NULL,
  "clockInLat"         DOUBLE PRECISION,
  "clockInLng"         DOUBLE PRECISION,
  "clockOutLat"        DOUBLE PRECISION,
  "clockOutLng"        DOUBLE PRECISION,
  "isLocationVerified" BOOLEAN NOT NULL DEFAULT true,
  "clockInTimestamp"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "clockOutTimestamp"  TIMESTAMPTZ,
  CONSTRAINT "EVVLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EVVLog_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EVVLog_staffId_fkey"
    FOREIGN KEY ("staffId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- ============================================================
-- 4) ATS base tables — altered by archive 07-15 but never created of record
-- ============================================================

CREATE TABLE IF NOT EXISTS "AtsCandidate" (
  "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
  "firstName"         TEXT NOT NULL,
  "lastName"          TEXT NOT NULL,
  "email"             TEXT NOT NULL,
  "phone"             TEXT,
  "appliedRole"       TEXT NOT NULL DEFAULT 'RBT',
  "stage"             TEXT NOT NULL DEFAULT 'APPLIED',
  "activationStatus"  TEXT NOT NULL DEFAULT 'PENDING_HR_REVIEW',
  "bacbNumber"        TEXT,
  "bacbVerified"      BOOLEAN NOT NULL DEFAULT false,
  "dossier"           JSONB DEFAULT '{}',
  "userId"            UUID,
  "assignedHrAgentId" UUID,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "AtsCandidate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AtsCandidate_email_key" UNIQUE ("email"),
  CONSTRAINT "AtsCandidate_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AtsCandidate_assignedHrAgentId_fkey"
    FOREIGN KEY ("assignedHrAgentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "CandidateOnboardingPacket" (
  "id"                    UUID NOT NULL DEFAULT gen_random_uuid(),
  "candidateId"           UUID NOT NULL,
  "magicLinkToken"        TEXT,
  "w4Complete"            BOOLEAN NOT NULL DEFAULT false,
  "i9Complete"            BOOLEAN NOT NULL DEFAULT false,
  "directDepositComplete" BOOLEAN NOT NULL DEFAULT false,
  "cprUploaded"           BOOLEAN NOT NULL DEFAULT false,
  "formData"              JSONB DEFAULT '{}',
  "tasksDone"             BOOLEAN NOT NULL DEFAULT false,
  "tasksCompletedSteps"   JSONB NOT NULL DEFAULT '[]',
  "availabilityDone"      BOOLEAN NOT NULL DEFAULT false,
  "availabilityGrid"      JSONB NOT NULL DEFAULT '[]',
  "preferredBoroughs"     JSONB NOT NULL DEFAULT '[]',
  "transportation"        TEXT,
  "homeZipCode"           TEXT,
  "maxTravelMiles"        INTEGER DEFAULT 15,
  "simulationDone"        BOOLEAN NOT NULL DEFAULT false,
  "interviewBooked"       BOOLEAN NOT NULL DEFAULT false,
  "interviewPassed"       BOOLEAN NOT NULL DEFAULT false,
  "certUploaded"          BOOLEAN NOT NULL DEFAULT false,
  "backgroundCleared"     BOOLEAN NOT NULL DEFAULT false,
  "clearedForHire"        BOOLEAN NOT NULL DEFAULT false,
  "resumeFileName"        TEXT,
  "resumeStoragePath"     TEXT,
  "govtIdFileName"        TEXT,
  "govtIdStoragePath"     TEXT,
  "deviceFingerprint"     TEXT,
  "deviceBoundAt"         TIMESTAMPTZ,
  "inviteSentAt"          TIMESTAMPTZ,
  "inviteAcceptedAt"      TIMESTAMPTZ,
  "ls54PreparedAt"        TIMESTAMPTZ,
  "ls54PreparedByUserId"  UUID,
  "ls54StoragePath"       TEXT,
  "ls54Payload"           JSONB,
  "ls54Status"            TEXT NOT NULL DEFAULT 'NONE',
  "ls54Version"           INTEGER NOT NULL DEFAULT 0,
  "ls54SentAt"            TIMESTAMPTZ,
  "ls54SignedAt"          TIMESTAMPTZ,
  "ls54DeclinedAt"        TIMESTAMPTZ,
  "createdAt"             TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "CandidateOnboardingPacket_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CandidateOnboardingPacket_candidateId_key" UNIQUE ("candidateId"),
  CONSTRAINT "CandidateOnboardingPacket_magicLinkToken_key" UNIQUE ("magicLinkToken"),
  CONSTRAINT "CandidateOnboardingPacket_candidateId_fkey"
    FOREIGN KEY ("candidateId") REFERENCES "AtsCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- ============================================================
-- 5) Schema-only models — declared in prisma/schema.prisma but NOT yet
--    referenced by any app code. Created for schema parity only.
-- ============================================================

CREATE TABLE IF NOT EXISTS "StaffCredential" (
  "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId"           UUID NOT NULL,
  "credentialType"   TEXT NOT NULL,
  "credentialNumber" TEXT,
  "payerName"        TEXT DEFAULT 'ALL_PAYERS',
  "isCredentialed"   BOOLEAN NOT NULL DEFAULT true,
  "expirationDate"   TIMESTAMPTZ,
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "StaffCredential_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StaffCredential_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ScheduleAppointment" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "clientId"       UUID NOT NULL,
  "rbtId"          UUID,
  "bcbaId"         UUID,
  "scheduledStart" TIMESTAMPTZ NOT NULL,
  "scheduledEnd"   TIMESTAMPTZ NOT NULL,
  "serviceAddress" TEXT,
  "cptCode"        TEXT NOT NULL DEFAULT '97153',
  "status"         TEXT NOT NULL DEFAULT 'SCHEDULED',
  "notes"          TEXT,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "ScheduleAppointment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ScheduleAppointment_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ReAuthPacket" (
  "id"                   UUID NOT NULL DEFAULT gen_random_uuid(),
  "clientId"             UUID NOT NULL,
  "paRequestId"          UUID,
  "status"               TEXT NOT NULL DEFAULT 'DRAFT',
  "skillGraphSummary"    JSONB DEFAULT '{}',
  "behaviorGraphSummary" JSONB DEFAULT '{}',
  "attendancePct"        DOUBLE PRECISION NOT NULL DEFAULT 95.0,
  "cptRequestPayload"    JSONB DEFAULT '{}',
  "createdAt"            TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "ReAuthPacket_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReAuthPacket_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "AuditLogVault" (
  "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId"       UUID,
  "action"       TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId"   TEXT NOT NULL,
  "ipAddress"    TEXT,
  "metadata"     JSONB DEFAULT '{}',
  "timestamp"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "AuditLogVault_pkey" PRIMARY KEY ("id")
);
