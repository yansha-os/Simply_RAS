-- Phase 5: Application document paths (resume / gov ID) — files in Supabase Storage
-- Paste AFTER Phase 1 (extends CandidateOnboardingPacket).

ALTER TABLE "CandidateOnboardingPacket"
  ADD COLUMN IF NOT EXISTS "resumeFileName" TEXT;

ALTER TABLE "CandidateOnboardingPacket"
  ADD COLUMN IF NOT EXISTS "resumeStoragePath" TEXT;

ALTER TABLE "CandidateOnboardingPacket"
  ADD COLUMN IF NOT EXISTS "govtIdFileName" TEXT;

ALTER TABLE "CandidateOnboardingPacket"
  ADD COLUMN IF NOT EXISTS "govtIdStoragePath" TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ats-applicant-docs',
  'ats-applicant-docs',
  false,
  10485760, -- 10MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Staff policies (public apply uses SUPABASE_SERVICE_ROLE_KEY on the server)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'ats_docs_select_authenticated'
  ) THEN
    CREATE POLICY "ats_docs_select_authenticated"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'ats-applicant-docs');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'ats_docs_insert_authenticated'
  ) THEN
    CREATE POLICY "ats_docs_insert_authenticated"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'ats-applicant-docs');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'ats_docs_update_authenticated'
  ) THEN
    CREATE POLICY "ats_docs_update_authenticated"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'ats-applicant-docs')
    WITH CHECK (bucket_id = 'ats-applicant-docs');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'ats_docs_delete_authenticated'
  ) THEN
    CREATE POLICY "ats_docs_delete_authenticated"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'ats-applicant-docs');
  END IF;
END $$;

-- Replaces localStorage keys:
-- ras_file_data_urls, ras_submitted_app_* resume/govt data URLs,
-- ras_latest_submitted_app binary blobs (keep form JSON on AtsCandidate.dossier)
