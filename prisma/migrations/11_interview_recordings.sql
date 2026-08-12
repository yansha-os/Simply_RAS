-- Phase 4: Interview recording metadata (files go in Supabase Storage, not IndexedDB)
-- Paste AFTER Phase 2 (needs AtsInterview).
-- Also create Storage bucket in Dashboard (or run storage insert below if allowed).

CREATE TABLE IF NOT EXISTS "AtsInterviewRecording" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "interviewId" UUID NOT NULL REFERENCES "AtsInterview"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "candidateId" UUID NOT NULL REFERENCES "AtsCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "title" TEXT NOT NULL DEFAULT 'Interview Take',
  "storageBucket" TEXT NOT NULL DEFAULT 'ats-interview-recordings',
  "storagePath" TEXT NOT NULL,
  -- e.g. {candidateId}/{interviewId}/{recordingId}.webm
  "mimeType" TEXT NOT NULL DEFAULT 'video/webm',
  "durationSeconds" INTEGER NOT NULL DEFAULT 0,
  "byteSize" BIGINT,
  "createdByUserId" UUID REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "AtsInterviewRecording_interviewId_idx"
  ON "AtsInterviewRecording"("interviewId");
CREATE INDEX IF NOT EXISTS "AtsInterviewRecording_candidateId_idx"
  ON "AtsInterviewRecording"("candidateId");

-- Optional: create private storage bucket (run in SQL if you have permission)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ats-interview-recordings',
  'ats-interview-recordings',
  false,
  524288000, -- 500MB
  ARRAY['video/webm', 'video/mp4', 'audio/webm', 'audio/mpeg']
)
ON CONFLICT (id) DO NOTHING;

-- Staff read/write policies for authenticated JWTs (service role bypasses RLS)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'ats_recordings_select_authenticated'
  ) THEN
    CREATE POLICY "ats_recordings_select_authenticated"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'ats-interview-recordings');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'ats_recordings_insert_authenticated'
  ) THEN
    CREATE POLICY "ats_recordings_insert_authenticated"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'ats-interview-recordings');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'ats_recordings_update_authenticated'
  ) THEN
    CREATE POLICY "ats_recordings_update_authenticated"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'ats-interview-recordings')
    WITH CHECK (bucket_id = 'ats-interview-recordings');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'ats_recordings_delete_authenticated'
  ) THEN
    CREATE POLICY "ats_recordings_delete_authenticated"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'ats-interview-recordings');
  END IF;
END $$;

-- Replaces browser IndexedDB RiseAndShineCRM_RecordingsDB / interview_recordings
-- App uses SUPABASE_SERVICE_ROLE_KEY on the server when Dev Tools has no Auth session.
