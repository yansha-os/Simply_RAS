-- Remove three empty legacy tables that have no Prisma model, application
-- references, triggers, views, functions, or inbound foreign-key dependencies.
-- DROP TABLE intentionally omits CASCADE so any unexpected dependency fails closed.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

LOCK TABLE
  public."AuditLog",
  public."FirstSessionConsensus",
  public."StartDatePoll"
IN ACCESS EXCLUSIVE MODE;

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public."AuditLog" LIMIT 1) THEN
    RAISE EXCEPTION 'Safety stop: public."AuditLog" is no longer empty.';
  END IF;

  IF EXISTS (SELECT 1 FROM public."FirstSessionConsensus" LIMIT 1) THEN
    RAISE EXCEPTION 'Safety stop: public."FirstSessionConsensus" is no longer empty.';
  END IF;

  IF EXISTS (SELECT 1 FROM public."StartDatePoll" LIMIT 1) THEN
    RAISE EXCEPTION 'Safety stop: public."StartDatePoll" is no longer empty.';
  END IF;
END
$guard$;

DROP TABLE public."AuditLog";
DROP TABLE public."FirstSessionConsensus";
DROP TABLE public."StartDatePoll";

COMMIT;
