-- Phase 3: Candidate help desk (replaces ras_help_ticket / ras_rbt_help_tickets localStorage)
-- Paste AFTER Phase 2.

CREATE TABLE IF NOT EXISTS "AtsHelpTicket" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "candidateId" UUID NOT NULL REFERENCES "AtsCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "claimedByUserId" UUID REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "subject" TEXT NOT NULL DEFAULT 'Candidate Help Request',
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  -- OPEN | CLAIMED | RESOLVED | CLOSED
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "resolvedAt" TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS "AtsHelpMessage" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "ticketId" UUID NOT NULL REFERENCES "AtsHelpTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "senderType" TEXT NOT NULL,
  -- CANDIDATE | HR_AGENT | HEAD_HR | SYSTEM
  "senderUserId" UUID REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "AtsHelpTicket_candidateId_idx" ON "AtsHelpTicket"("candidateId");
CREATE INDEX IF NOT EXISTS "AtsHelpTicket_status_idx" ON "AtsHelpTicket"("status");
CREATE INDEX IF NOT EXISTS "AtsHelpTicket_claimedByUserId_idx" ON "AtsHelpTicket"("claimedByUserId");
CREATE INDEX IF NOT EXISTS "AtsHelpMessage_ticketId_idx" ON "AtsHelpMessage"("ticketId");
CREATE INDEX IF NOT EXISTS "AtsHelpMessage_createdAt_idx" ON "AtsHelpMessage"("createdAt");

-- When a ticket is OPEN/CLAIMED, app sets AtsCandidate.stage = HELP_DESK
-- When resolved and other rules apply, recompute stage from onboarding progress

-- Replaces localStorage keys:
-- ras_latest_help_ticket, ras_help_ticket_*, ras_rbt_help_tickets, ras_claimed_help_tickets
