-- Supabase advisor hardening for the RLS event trigger and Client policy.
-- Idempotent and transaction-wrapped for manual execution in Supabase SQL Editor.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $guard$
DECLARE
  function_row record;
  policy_row record;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'Client'
      AND c.relkind IN ('r', 'p')
      AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Safety stop: public."Client" is missing or RLS is disabled.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'service_role' AND rolbypassrls
  ) THEN
    RAISE EXCEPTION 'Safety stop: service_role does not have BYPASSRLS.';
  END IF;

  SELECT p.oid, p.prosecdef, p.proconfig
  INTO function_row
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'rls_auto_enable'
    AND pg_get_function_identity_arguments(p.oid) = '';

  IF FOUND AND (
    function_row.prosecdef IS DISTINCT FROM true
    OR NOT ('search_path=pg_catalog' = ANY(COALESCE(function_row.proconfig, ARRAY[]::text[])))
  ) THEN
    RAISE EXCEPTION 'Safety stop: public.rls_auto_enable() definition drifted.';
  END IF;

  IF FOUND AND NOT EXISTS (
    SELECT 1 FROM pg_event_trigger
    WHERE evtname = 'ensure_rls'
      AND evtfoid = function_row.oid
      AND evtenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'Safety stop: ensure_rls event trigger is missing or disabled.';
  END IF;

  SELECT *
  INTO policy_row
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'Client'
    AND policyname = 'Allow service_role full client access';

  IF FOUND AND (
    policy_row.permissive IS DISTINCT FROM 'PERMISSIVE'
    OR policy_row.roles::text IS DISTINCT FROM '{public}'
    OR policy_row.cmd IS DISTINCT FROM 'ALL'
    OR policy_row.qual IS DISTINCT FROM '(auth.role() = ''service_role''::text)'
    OR policy_row.with_check IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Safety stop: Client service-role policy definition drifted.';
  END IF;
END
$guard$;

DO $revoke$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;
  END IF;
END
$revoke$;

-- Genuine service-role and direct Postgres connections bypass RLS. Keeping a
-- per-row auth.role() policy is redundant and triggers an initialization-plan
-- performance warning.
DROP POLICY IF EXISTS "Allow service_role full client access"
  ON public."Client";

DO $assert$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL AND (
    has_function_privilege('anon', 'public.rls_auto_enable()', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.rls_auto_enable()', 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'Hardening assertion failed: untrusted roles can execute rls_auto_enable().';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'Client'
      AND policyname = 'Allow service_role full client access'
  ) THEN
    RAISE EXCEPTION 'Hardening assertion failed: redundant Client policy remains.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'Client'
      AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Hardening assertion failed: Client RLS is not enabled.';
  END IF;
END
$assert$;

COMMIT;
