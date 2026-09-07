-- =============================================================================
-- Migration: 2026-08-16-231000Z-client-emr-fields.sql
-- Description: Add EMR chart fields (primary/secondary ICD-10 diagnosis codes
--              and secondary guardian contacts) to Client table.
-- Authoritative schema: packages/db/prisma/schema.prisma & prisma/schema.prisma
-- =============================================================================

ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "secondaryGuardianName" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "secondaryGuardianPhone" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "secondaryGuardianEmail" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "primaryDiagnosisCode" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "secondaryDiagnosisCode" TEXT;
