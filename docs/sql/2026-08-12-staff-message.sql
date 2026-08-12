-- Migration: StaffMessage table (staff-to-staff chat / case-coord messaging)
-- Generated: 2026-08-12
-- Run in Supabase SQL Editor. Idempotent.
--
-- Creates the "StaffMessage" table exactly matching prisma/schema.prisma
-- (model StaffMessage). Used by apps/crm chat.ts and both apps'
-- staffCommunicationActions.ts / caseOpeningActions.ts — staff chat 500s if absent.
--
-- Order: run AFTER the three 2026-08-11 scripts (see docs/sql/README.md).
-- Only hard dependency is the "User" table (prisma/migrations archive 01-02).

CREATE TABLE IF NOT EXISTS "StaffMessage" (
  "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
  "senderId"   UUID NOT NULL,
  "receiverId" UUID NOT NULL,
  "content"    TEXT NOT NULL,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "readAt"     TIMESTAMPTZ,
  CONSTRAINT "StaffMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StaffMessage_senderId_fkey"
    FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StaffMessage_receiverId_fkey"
    FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- schema.prisma defines no @@index on StaffMessage; these FK/lookup indexes are
-- supplemental (safe extras) for the sender/receiver thread queries in chat.ts.
CREATE INDEX IF NOT EXISTS "StaffMessage_senderId_idx" ON "StaffMessage"("senderId");
CREATE INDEX IF NOT EXISTS "StaffMessage_receiverId_idx" ON "StaffMessage"("receiverId");
