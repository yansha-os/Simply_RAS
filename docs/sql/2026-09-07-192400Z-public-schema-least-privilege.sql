-- Public application data is server-only through Prisma. Remove Supabase's
-- broad REST-role grants so RLS is defense-in-depth rather than the sole gate.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public
FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public
FROM anon, authenticated;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public
FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

COMMIT;

-- Independent post-check: both values must be zero.
SELECT
  (
    SELECT count(*)
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND grantee IN ('anon', 'authenticated')
  ) AS untrusted_table_grants,
  (
    SELECT count(*)
    FROM information_schema.role_routine_grants
    WHERE routine_schema = 'public'
      AND grantee IN ('PUBLIC', 'anon', 'authenticated')
  ) AS untrusted_routine_grants;
