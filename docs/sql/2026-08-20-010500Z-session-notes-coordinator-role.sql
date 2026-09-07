-- Add SESSION_NOTES_COORDINATOR to Role enum (Phase 0 Artemis exit / SOP alignment)
-- Idempotent DDL for Supabase SQL Editor

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'Role' AND e.enumlabel = 'SESSION_NOTES_COORDINATOR'
  ) THEN
    ALTER TYPE "Role" ADD VALUE 'SESSION_NOTES_COORDINATOR';
  END IF;
END $$;
