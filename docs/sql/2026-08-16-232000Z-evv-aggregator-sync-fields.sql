-- =============================================================================
-- Migration: 2026-08-16-232000Z-evv-aggregator-sync-fields.sql
-- Description: Add State EVV aggregator sync fields (vendor, status, responseId,
--              submittedAt) to EVVLog table for Cures Act State API integration.
-- Authoritative schema: packages/db/prisma/schema.prisma & prisma/schema.prisma
-- =============================================================================

ALTER TABLE "EVVLog" ADD COLUMN IF NOT EXISTS "aggregatorVendor" TEXT;
ALTER TABLE "EVVLog" ADD COLUMN IF NOT EXISTS "aggregatorStatus" TEXT DEFAULT 'PENDING';
ALTER TABLE "EVVLog" ADD COLUMN IF NOT EXISTS "aggregatorResponseId" TEXT;
ALTER TABLE "EVVLog" ADD COLUMN IF NOT EXISTS "aggregatorSubmittedAt" TIMESTAMP(3);
