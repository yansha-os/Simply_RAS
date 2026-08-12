-- Phase 2: Interview bookings + HR evaluation (replaces ras_rbt_interview_payload / meeting localStorage)
-- Paste AFTER Phase 1 SQL. App must write here instead of localStorage interview payload.

CREATE TABLE IF NOT EXISTS "AtsInterview" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "candidateId" UUID NOT NULL UNIQUE REFERENCES "AtsCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "interviewerUserId" UUID REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "claimedByUserId" UUID REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "scheduledDate" TEXT,
  "scheduledTime" TEXT,
  "scheduledAt" TIMESTAMPTZ,
  "meetingCode" TEXT,
  "meetingLink" TEXT,
  "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
  -- SCHEDULED | IN_PROGRESS | COMPLETED | CANCELLED | NO_SHOW
  "hrJoinedAt" TIMESTAMPTZ,
  "scorecard" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "interviewerNotes" TEXT,
  "scriptProgress" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "recommendation" TEXT,
  -- ADVANCE | REJECT | HOLD
  "completedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "AtsInterview_status_idx" ON "AtsInterview"("status");
CREATE INDEX IF NOT EXISTS "AtsInterview_interviewerUserId_idx" ON "AtsInterview"("interviewerUserId");
CREATE INDEX IF NOT EXISTS "AtsInterview_claimedByUserId_idx" ON "AtsInterview"("claimedByUserId");
CREATE INDEX IF NOT EXISTS "AtsInterview_scheduledAt_idx" ON "AtsInterview"("scheduledAt");

-- Replaces localStorage keys:
-- ras_rbt_interview_payload, ras_hr_joined_meeting
-- ras_applicant_notes_*, scorecard/script keys on applicant page
-- claimed interview UI (was client-only)
