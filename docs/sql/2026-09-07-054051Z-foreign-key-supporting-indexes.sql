-- Add supporting indexes for every foreign key reported by the Supabase
-- performance advisor. Compound indexes mirror the application's ordered hot
-- paths while retaining the FK column as the leading key.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE INDEX IF NOT EXISTS "ActionItem_assigneeId_createdAt_idx"
  ON public."ActionItem" ("assigneeId", "createdAt");
CREATE INDEX IF NOT EXISTS "ActionItem_clientId_idx"
  ON public."ActionItem" ("clientId");
CREATE INDEX IF NOT EXISTS "ActionItem_creatorId_idx"
  ON public."ActionItem" ("creatorId");

CREATE INDEX IF NOT EXISTS "AtsHelpMessage_senderUserId_idx"
  ON public."AtsHelpMessage" ("senderUserId");
CREATE INDEX IF NOT EXISTS "AtsInterviewRecording_createdByUserId_idx"
  ON public."AtsInterviewRecording" ("createdByUserId");
CREATE INDEX IF NOT EXISTS "AuditLog_userId_idx"
  ON public."AuditLog" ("userId");

CREATE INDEX IF NOT EXISTS "AuthCptCode_authorizationId_idx"
  ON public."AuthCptCode" ("authorizationId");
CREATE INDEX IF NOT EXISTS "Authorization_clientId_createdAt_idx"
  ON public."Authorization" ("clientId", "createdAt");
CREATE INDEX IF NOT EXISTS "BehaviorLog_behaviorId_idx"
  ON public."BehaviorLog" ("behaviorId");

CREATE INDEX IF NOT EXISTS "Client_bcbaId_idx"
  ON public."Client" ("bcbaId");
CREATE INDEX IF NOT EXISTS "Client_caseCoordinatorId_idx"
  ON public."Client" ("caseCoordinatorId");
CREATE INDEX IF NOT EXISTS "Client_clinicalSupportId_idx"
  ON public."Client" ("clinicalSupportId");
CREATE INDEX IF NOT EXISTS "Client_rbtId_idx"
  ON public."Client" ("rbtId");

CREATE INDEX IF NOT EXISTS "ClientMessage_clientId_createdAt_idx"
  ON public."ClientMessage" ("clientId", "createdAt");
CREATE INDEX IF NOT EXISTS "ContactLog_authorId_idx"
  ON public."ContactLog" ("authorId");
CREATE INDEX IF NOT EXISTS "ContactLog_clientId_createdAt_idx"
  ON public."ContactLog" ("clientId", "createdAt");
CREATE INDEX IF NOT EXISTS "Document_clientId_createdAt_idx"
  ON public."Document" ("clientId", "createdAt");

-- These catalog tables predate the current Prisma schema but retain live FKs.
CREATE INDEX IF NOT EXISTS "FirstSessionConsensus_clientId_idx"
  ON public."FirstSessionConsensus" ("clientId");

CREATE INDEX IF NOT EXISTS "NoteDeficiency_authorId_idx"
  ON public."NoteDeficiency" ("authorId");
CREATE INDEX IF NOT EXISTS "NoteDeficiency_flaggedById_idx"
  ON public."NoteDeficiency" ("flaggedById");
CREATE INDEX IF NOT EXISTS "NoteDeficiency_noteId_status_idx"
  ON public."NoteDeficiency" ("noteId", "status");

CREATE INDEX IF NOT EXISTS "PARequest_clientId_createdAt_idx"
  ON public."PARequest" ("clientId", "createdAt");
CREATE INDEX IF NOT EXISTS "RbtOnboarding_rbtId_idx"
  ON public."RbtOnboarding" ("rbtId");
CREATE INDEX IF NOT EXISTS "ReAuthPacket_paRequestId_idx"
  ON public."ReAuthPacket" ("paRequestId");
CREATE INDEX IF NOT EXISTS "Session_bcbaId_scheduledStart_idx"
  ON public."Session" ("bcbaId", "scheduledStart");

CREATE INDEX IF NOT EXISTS "StartDatePoll_clientId_idx"
  ON public."StartDatePoll" ("clientId");

COMMIT;
