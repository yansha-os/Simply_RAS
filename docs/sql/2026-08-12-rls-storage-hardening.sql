-- RLS + private Storage hardening
-- Generated: 2026-08-12
-- Status: PENDING MANUAL SECURITY REVIEW — NOT APPLIED
--
-- Purpose
--   1. Remove the proven-overbroad authenticated read policy on public."Client".
--   2. Remove the eight proven-overbroad authenticated bucket-wide CRUD policies
--      on the two private ATS buckets.
--   3. Keep all application access server-authoritative:
--        - business rows through guarded Prisma server code;
--        - private objects through guarded service-role calls;
--        - browser recording upload through a service-role-issued signed upload URL;
--        - browser reads through short-lived signed download URLs.
--
-- No replacement authenticated policy is created. Current source inspection found
-- no direct Supabase Data API table consumer and no Storage path that requires a
-- browser/user JWT once SUPABASE_SERVICE_ROLE_KEY is configured server-side.
--
-- REQUIRED BEFORE APPLYING
--   A. Configure SUPABASE_SERVICE_ROLE_KEY as a server-only secret in BOTH CRM and
--      HRM deployment environments. Never prefix it with NEXT_PUBLIC_.
--   B. Redeploy and smoke-test every path listed in the repository handoff:
--      CRM client upload/read; HRM application/onboarding/certificate uploads;
--      HRM candidate-document reads; interview recording upload/finalize/read/delete.
--   C. Confirm there is no external consumer (outside this repository) that depends
--      on direct authenticated Data API reads of public."Client" or direct
--      authenticated CRUD in either ATS bucket.
--
-- ORDER DEPENDENCIES
--   - Requires public."Client", storage.objects, storage.buckets, and the three
--     private buckets to exist.
--   - The targeted policies originated in the archived candidate-document and
--     interview-recording SQL. They may already be absent; this script is idempotent.
--   - No dependency on the other dated 2026-08-12 schema scripts.
--
-- FILE-SIZE SOURCE OF TRUTH (REVIEWED 2026-08-12)
--   - client-documents: 5 MiB / 5,242,880 bytes. Enforced by CRM route MAX_BYTES
--     and the browser upload pre-check. A separately approved Dashboard bucket cap
--     should match 5,242,880 bytes and allow PDF, JPEG, and PNG.
--   - ats-applicant-docs: 10 MiB / 10,485,760 bytes. Enforced by the HRM candidate,
--     onboarding, and 40-hour certificate action constants; the live bucket already
--     uses 10,485,760 bytes with PDF, JPEG, PNG, and WebP.
--   - ats-interview-recordings: 50 MiB / 52,428,800 bytes. The current named
--     INTERVIEW_RECORDING_MAX_BYTES and INTERVIEW_RECORDING_MAX_MB constants, their
--     client/server consumers, and the unit test all enforce 50 MiB. The live bucket
--     is 500 MiB / 524,288,000 bytes; a separately approved Dashboard hardening
--     change should reduce it to 52,428,800 bytes.
--   - No current 200 MiB recording constant exists. If the product requirement
--     returns to 200 MiB, update the named constants, UI/server checks, and tests
--     together before changing the bucket cap.
--
-- SAFETY
--   - Run the PRECHECK queries alone first if desired.
--   - The transaction aborts if an existing targeted policy differs from the exact
--     live 2026-08-12 definition, if RLS is disabled, or if a bucket is not private.
--   - This script does not change bucket metadata, table grants, default privileges,
--     Prisma's pooler role, application rows, or stored objects.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- PRECHECK 1: all 39 public tables should remain RLS-enabled.
SELECT
  COUNT(*)::integer AS public_table_count,
  COUNT(*) FILTER (WHERE c.relrowsecurity)::integer AS rls_enabled_count,
  COUNT(*) FILTER (WHERE c.relforcerowsecurity)::integer AS force_rls_count
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p');

-- PRECHECK 2: exact current definitions of every policy relevant to this change.
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual AS using_expression,
  with_check
FROM pg_policies
WHERE
  (schemaname = 'public' AND tablename = 'Client')
  OR
  (
    schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname IN (
      'ats_docs_select_authenticated',
      'ats_docs_insert_authenticated',
      'ats_docs_update_authenticated',
      'ats_docs_delete_authenticated',
      'ats_recordings_select_authenticated',
      'ats_recordings_insert_authenticated',
      'ats_recordings_update_authenticated',
      'ats_recordings_delete_authenticated'
    )
  )
ORDER BY schemaname, tablename, policyname;

-- PRECHECK 3: all buckets must exist and be private. Metadata only; no object rows.
SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id IN (
  'client-documents',
  'ats-applicant-docs',
  'ats-interview-recordings'
)
ORDER BY id;

-- PRECHECK 4: grants remain visible for review. This targeted artifact does not
-- alter grants/default ACLs; Data API disablement is a separate Dashboard decision.
SELECT table_schema, table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'Client'
  AND grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY grantee, privilege_type;

-- Drift guard: only the exact proven-overbroad definitions may be removed.
DO $guard$
DECLARE
  actual record;
  expected record;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'Client'
      AND c.relkind IN ('r', 'p')
      AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION
      'Safety stop: public."Client" is missing or RLS is disabled.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'storage'
      AND c.relname = 'objects'
      AND c.relkind IN ('r', 'p')
      AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION
      'Safety stop: storage.objects is missing or RLS is disabled.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('client-documents'),
        ('ats-applicant-docs'),
        ('ats-interview-recordings')
    ) AS required_bucket(id)
    LEFT JOIN storage.buckets AS b ON b.id = required_bucket.id
    WHERE b.id IS NULL OR b.public IS DISTINCT FROM false
  ) THEN
    RAISE EXCEPTION
      'Safety stop: a required Storage bucket is missing or not private.';
  END IF;

  SELECT *
  INTO actual
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'Client'
    AND policyname = 'Allow authenticated staff to read clients';

  IF FOUND AND (
    actual.permissive IS DISTINCT FROM 'PERMISSIVE'
    OR actual.roles::text IS DISTINCT FROM '{public}'
    OR actual.cmd IS DISTINCT FROM 'SELECT'
    OR actual.qual IS DISTINCT FROM
      '((auth.role() = ''authenticated''::text) OR (auth.role() = ''service_role''::text))'
    OR actual.with_check IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'Safety stop: Client policy definition drifted; review it manually.';
  END IF;

  FOR expected IN
    SELECT *
    FROM (
      VALUES
        (
          'ats_docs_delete_authenticated'::text,
          'DELETE'::text,
          '(bucket_id = ''ats-applicant-docs''::text)'::text,
          NULL::text
        ),
        (
          'ats_docs_insert_authenticated',
          'INSERT',
          NULL,
          '(bucket_id = ''ats-applicant-docs''::text)'
        ),
        (
          'ats_docs_select_authenticated',
          'SELECT',
          '(bucket_id = ''ats-applicant-docs''::text)',
          NULL
        ),
        (
          'ats_docs_update_authenticated',
          'UPDATE',
          '(bucket_id = ''ats-applicant-docs''::text)',
          '(bucket_id = ''ats-applicant-docs''::text)'
        ),
        (
          'ats_recordings_delete_authenticated',
          'DELETE',
          '(bucket_id = ''ats-interview-recordings''::text)',
          NULL
        ),
        (
          'ats_recordings_insert_authenticated',
          'INSERT',
          NULL,
          '(bucket_id = ''ats-interview-recordings''::text)'
        ),
        (
          'ats_recordings_select_authenticated',
          'SELECT',
          '(bucket_id = ''ats-interview-recordings''::text)',
          NULL
        ),
        (
          'ats_recordings_update_authenticated',
          'UPDATE',
          '(bucket_id = ''ats-interview-recordings''::text)',
          '(bucket_id = ''ats-interview-recordings''::text)'
        )
    ) AS policy_definition(
      policy_name,
      command_name,
      using_expression,
      check_expression
    )
  LOOP
    SELECT *
    INTO actual
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = expected.policy_name;

    IF FOUND AND (
      actual.permissive IS DISTINCT FROM 'PERMISSIVE'
      OR actual.roles::text IS DISTINCT FROM '{authenticated}'
      OR actual.cmd IS DISTINCT FROM expected.command_name
      OR actual.qual IS DISTINCT FROM expected.using_expression
      OR actual.with_check IS DISTINCT FROM expected.check_expression
    ) THEN
      RAISE EXCEPTION
        'Safety stop: Storage policy "%" drifted; review it manually.',
        expected.policy_name;
    END IF;
  END LOOP;
END
$guard$;

-- public."Client": Prisma is the active business-data plane and its pooler role
-- bypasses RLS. Removing this policy closes direct reads by every Auth user;
-- it does not replace or weaken required server guards.
DROP POLICY IF EXISTS "Allow authenticated staff to read clients"
  ON public."Client";

-- Keep "Allow service_role full client access" unchanged. It is redundant for a
-- genuine service-role request (which bypasses RLS) but is not the broad
-- authenticated exposure targeted by this reviewed change.

-- ATS objects: all active paths must now use guarded service-role calls. The one
-- browser-to-Storage operation uses a signed upload URL created server-side by
-- the service-role client; consuming that token needs no authenticated CRUD policy.
DROP POLICY IF EXISTS "ats_docs_select_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "ats_docs_insert_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "ats_docs_update_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "ats_docs_delete_authenticated" ON storage.objects;

DROP POLICY IF EXISTS "ats_recordings_select_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "ats_recordings_insert_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "ats_recordings_update_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "ats_recordings_delete_authenticated" ON storage.objects;

-- POSTCHECK 1: expected result is zero rows.
SELECT
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual AS using_expression,
  with_check
FROM pg_policies
WHERE
  (
    schemaname = 'public'
    AND tablename = 'Client'
    AND policyname = 'Allow authenticated staff to read clients'
  )
  OR
  (
    schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname IN (
      'ats_docs_select_authenticated',
      'ats_docs_insert_authenticated',
      'ats_docs_update_authenticated',
      'ats_docs_delete_authenticated',
      'ats_recordings_select_authenticated',
      'ats_recordings_insert_authenticated',
      'ats_recordings_update_authenticated',
      'ats_recordings_delete_authenticated'
    )
  )
ORDER BY schemaname, tablename, policyname;

-- POSTCHECK 2: inspect what remains. The expected Client result is only the
-- service-role policy; no authenticated ATS bucket policy should remain.
SELECT
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual AS using_expression,
  with_check
FROM pg_policies
WHERE
  (schemaname = 'public' AND tablename = 'Client')
  OR
  (
    schemaname = 'storage'
    AND tablename = 'objects'
    AND (
      COALESCE(qual, '') LIKE '%ats-applicant-docs%'
      OR COALESCE(with_check, '') LIKE '%ats-applicant-docs%'
      OR COALESCE(qual, '') LIKE '%ats-interview-recordings%'
      OR COALESCE(with_check, '') LIKE '%ats-interview-recordings%'
    )
  )
ORDER BY schemaname, tablename, policyname;

-- Final assertion before commit.
DO $assert$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE
      (
        schemaname = 'public'
        AND tablename = 'Client'
        AND policyname = 'Allow authenticated staff to read clients'
      )
      OR
      (
        schemaname = 'storage'
        AND tablename = 'objects'
        AND policyname IN (
          'ats_docs_select_authenticated',
          'ats_docs_insert_authenticated',
          'ats_docs_update_authenticated',
          'ats_docs_delete_authenticated',
          'ats_recordings_select_authenticated',
          'ats_recordings_insert_authenticated',
          'ats_recordings_update_authenticated',
          'ats_recordings_delete_authenticated'
        )
      )
  ) THEN
    RAISE EXCEPTION
      'Hardening assertion failed: a targeted broad policy still exists.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'Client'
      AND c.relrowsecurity
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'storage'
      AND c.relname = 'objects'
      AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION
      'Hardening assertion failed: required RLS is not enabled.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id IN (
      'client-documents',
      'ats-applicant-docs',
      'ats-interview-recordings'
    )
      AND public IS DISTINCT FROM false
  ) THEN
    RAISE EXCEPTION
      'Hardening assertion failed: a required bucket is not private.';
  END IF;
END
$assert$;

COMMIT;

-- ---------------------------------------------------------------------------
-- EMERGENCY ROLLBACK (COMMENTED OUT — REINTRODUCES THE DOCUMENTED EXPOSURES)
-- Use only after explicit security approval. These statements restore the exact
-- 2026-08-12 behavior and should not be a normal compatibility strategy.
-- ---------------------------------------------------------------------------
--
-- BEGIN;
--
-- CREATE POLICY "Allow authenticated staff to read clients"
--   ON public."Client"
--   AS PERMISSIVE
--   FOR SELECT
--   TO PUBLIC
--   USING (
--     (auth.role() = 'authenticated'::text)
--     OR (auth.role() = 'service_role'::text)
--   );
--
-- CREATE POLICY "ats_docs_select_authenticated"
--   ON storage.objects
--   AS PERMISSIVE
--   FOR SELECT
--   TO authenticated
--   USING (bucket_id = 'ats-applicant-docs'::text);
--
-- CREATE POLICY "ats_docs_insert_authenticated"
--   ON storage.objects
--   AS PERMISSIVE
--   FOR INSERT
--   TO authenticated
--   WITH CHECK (bucket_id = 'ats-applicant-docs'::text);
--
-- CREATE POLICY "ats_docs_update_authenticated"
--   ON storage.objects
--   AS PERMISSIVE
--   FOR UPDATE
--   TO authenticated
--   USING (bucket_id = 'ats-applicant-docs'::text)
--   WITH CHECK (bucket_id = 'ats-applicant-docs'::text);
--
-- CREATE POLICY "ats_docs_delete_authenticated"
--   ON storage.objects
--   AS PERMISSIVE
--   FOR DELETE
--   TO authenticated
--   USING (bucket_id = 'ats-applicant-docs'::text);
--
-- CREATE POLICY "ats_recordings_select_authenticated"
--   ON storage.objects
--   AS PERMISSIVE
--   FOR SELECT
--   TO authenticated
--   USING (bucket_id = 'ats-interview-recordings'::text);
--
-- CREATE POLICY "ats_recordings_insert_authenticated"
--   ON storage.objects
--   AS PERMISSIVE
--   FOR INSERT
--   TO authenticated
--   WITH CHECK (bucket_id = 'ats-interview-recordings'::text);
--
-- CREATE POLICY "ats_recordings_update_authenticated"
--   ON storage.objects
--   AS PERMISSIVE
--   FOR UPDATE
--   TO authenticated
--   USING (bucket_id = 'ats-interview-recordings'::text)
--   WITH CHECK (bucket_id = 'ats-interview-recordings'::text);
--
-- CREATE POLICY "ats_recordings_delete_authenticated"
--   ON storage.objects
--   AS PERMISSIVE
--   FOR DELETE
--   TO authenticated
--   USING (bucket_id = 'ats-interview-recordings'::text);
--
-- COMMIT;
