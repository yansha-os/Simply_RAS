-- Align the two remaining live nullability mismatches with schema.prisma.
-- ActionItem.creatorId is optional in Prisma; its existing FK remains RESTRICT.
-- ReAuthPacket.attendancePct is required with a 95.0 default in Prisma.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public."ActionItem"
  ALTER COLUMN "creatorId" DROP NOT NULL;

UPDATE public."ReAuthPacket"
SET "attendancePct" = 95.0
WHERE "attendancePct" IS NULL;

ALTER TABLE public."ReAuthPacket"
  ALTER COLUMN "attendancePct" SET NOT NULL;

COMMIT;
