-- Phase 4: rename legacy RbtOnboarding column (Artemis-era name → enclosed RAS EMR).
-- Idempotent: no-op if already renamed or column absent.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'RbtOnboarding'
      AND column_name = 'artemisAccountSetup'
  ) THEN
    ALTER TABLE "RbtOnboarding"
      RENAME COLUMN "artemisAccountSetup" TO "clinicalEmrProvisioned";
  END IF;
END $$;
