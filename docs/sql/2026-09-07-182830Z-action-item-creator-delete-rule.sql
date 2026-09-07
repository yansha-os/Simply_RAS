-- Align the ActionItem.creator optional relation with Prisma's generated DDL.
-- Prisma's default referential action for this optional relation is SET NULL.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $migration$
DECLARE
  current_delete_rule text;
BEGIN
  SELECT rc.delete_rule
  INTO current_delete_rule
  FROM information_schema.referential_constraints rc
  WHERE rc.constraint_schema = 'public'
    AND rc.constraint_name = 'ActionItem_creatorId_fkey';

  IF current_delete_rule IS NULL THEN
    RAISE EXCEPTION 'Safety stop: ActionItem_creatorId_fkey is missing.';
  END IF;

  IF current_delete_rule <> 'SET NULL' THEN
    ALTER TABLE public."ActionItem"
      DROP CONSTRAINT "ActionItem_creatorId_fkey";

    ALTER TABLE public."ActionItem"
      ADD CONSTRAINT "ActionItem_creatorId_fkey"
      FOREIGN KEY ("creatorId")
      REFERENCES public."User"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END
$migration$;

COMMIT;
