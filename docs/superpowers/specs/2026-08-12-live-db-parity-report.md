# Live DB ↔ schema.prisma Parity Report — 2026-08-12

**Verdict: 2 actionable discrepancies** (both nullability, fix SQL below). Everything else matches: **all 36 schema models exist as tables, zero missing columns, zero missing enum values.** All 6 `docs/sql` scripts — including `2026-08-12-magic-link-expiry.sql` — are confirmed applied.

Read-only verification of the live Supabase database against `prisma/schema.prisma`
(byte-identical to `packages/db/prisma/schema.prisma` at time of check).

## Method

- `prisma db pull --print` hangs over the transaction pooler (`:6543`, `pgbouncer=true`) — killed after ~5 min, never connected. Direct `pg` queries over the same URL work fine (~4 s).
- Canonical DDL generated **offline** (no DB): `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`.
- Live catalog dumped **read-only** (`SET default_transaction_read_only = on`): `information_schema.tables` / `.columns`, `pg_enum`, plus targeted row-count spot checks.
- Compared programmatically: tables, columns (name/type/nullability), enum labels. **Not audited:** indexes, defaults, and FK rules beyond the spot checks noted below.

Live DB: 39 tables, 477 columns, 13 enums. Schema: 36 models, 13 enums.

## Priority checklist (from spine roadmap / session-note SoT)

| Item | Status |
|------|--------|
| SessionNote structured / signer / plutus fields | ✅ all present |
| `Session.placeOfServiceCode` | ✅ present (Session table fully matches) |
| `SessionStatus.IN_PROGRESS` | ✅ present |
| CaseOpening / CaseApplication + listing-enrichment columns | ✅ all present |
| StaffMessage, Notification, ClientMessage | ✅ all present |
| GoalTemplate, SkillTarget, SessionTrialData, BehaviorTarget, BehaviorLog, EVVLog | ✅ fully match |
| AtsCandidate, CandidateOnboardingPacket | ✅ all present |
| AuditLogVault, StaffCredential | ✅ fully match |
| `magicLinkExpiresAt` / `magicLinkRevokedAt` on IntakePacket + CandidateOnboardingPacket | ✅ **present → script 6 (`2026-08-12-magic-link-expiry.sql`) was applied** |
| Role enum (13 values incl. HEAD_HR, HR_AGENT, FINANCE) | ✅ all present |
| ClientStatus enum (15 schema values) | ✅ all present (+3 legacy extras, see below) |

## Discrepancies

### 1. `ActionItem.creatorId` — NOT NULL in DB, optional in schema (ACTIONABLE — live bug)

Schema declares `creatorId String? @db.Uuid` with `onDelete: SetNull`; live column is `NOT NULL`.
`createActionItem()` in `apps/crm/src/app/actions/actionItems.ts` never sets `creatorId`, so **that insert fails against the live DB today**. The live FK delete rule is also `RESTRICT` instead of the schema's `SET NULL`, which would make deleting a referenced `User` fail.

### 2. `ReAuthPacket.attendancePct` — nullable in DB, NOT NULL in schema (ACTIONABLE — safe now, latent)

Schema (and `2026-08-12-schema-parity-backfill.sql`) declare `DOUBLE PRECISION NOT NULL DEFAULT 95.0`; live column has the default but allows NULL (table pre-existed, so the backfill's `CREATE TABLE IF NOT EXISTS` no-op'd). Table currently has 0 rows, so nothing is broken yet — tighten it now while it's free.

### Fix SQL — paste into Supabase SQL Editor (idempotent, no order dependency)

```sql
-- 2026-08-12 parity fixes: ActionItem.creatorId optional + ReAuthPacket.attendancePct NOT NULL
-- Source: docs/superpowers/specs/2026-08-12-live-db-parity-report.md

-- 1) ActionItem.creatorId: schema says optional (FK ON DELETE SET NULL).
--    Live DB has NOT NULL + RESTRICT → createActionItem() (no creatorId) fails.
ALTER TABLE "ActionItem" ALTER COLUMN "creatorId" DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.referential_constraints
    WHERE constraint_name = 'ActionItem_creatorId_fkey' AND delete_rule <> 'SET NULL'
  ) THEN
    ALTER TABLE "ActionItem" DROP CONSTRAINT "ActionItem_creatorId_fkey";
    ALTER TABLE "ActionItem" ADD CONSTRAINT "ActionItem_creatorId_fkey"
      FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 2) ReAuthPacket.attendancePct: schema says NOT NULL DEFAULT 95.0; live DB is nullable.
--    Backfill first (currently 0 rows, so this is a no-op safety net).
UPDATE "ReAuthPacket" SET "attendancePct" = 95.0 WHERE "attendancePct" IS NULL;
ALTER TABLE "ReAuthPacket" ALTER COLUMN "attendancePct" SET NOT NULL;
```

## Benign drift (no action required)

- **39 timestamp columns are `timestamptz` in DB vs Prisma-default `timestamp(3)`** — deliberate: the hand-written `docs/sql` scripts use `TIMESTAMPTZ` (better practice). Prisma Client reads/writes these fine. Affected tables: SessionNote (4 signer/convert timestamps), IntakePacket (2 magic-link), ClientMessage (2), StaffMessage (2), CandidateOnboardingPacket (9), AtsInterview (5), AtsHelpTicket (3), AtsHelpMessage (1), AtsInterviewRecording (1), ApplicantDeviceSession (3), OnboardingSignatureEvent (1), CaseOpening (2), CaseApplication (4). If anyone ever wants `prisma migrate diff` against the live DB to come back clean, annotate these fields `@db.Timestamptz` in schema.prisma — do **not** downgrade the DB columns.
- **3 extra tables in DB with no schema model and zero code references** (orphaned legacy): `AuditLog`, `FirstSessionConsensus`, `StartDatePoll`. Leave them; drop later if desired (destructive — not included here).
- **3 legacy `ClientStatus` labels in DB** not in schema: `DOCS_PENDING`, `AUTH_INITIATED`, `AUTHORIZED`. Verified **0 Client rows** use them, so Prisma deserialization is safe. Postgres can't cheaply drop enum values; ignore. (Enum label *order* also differs from schema — only matters for `ORDER BY` on the enum column.)
- **`docs/sql` README script 7 (`2026-08-12-session-indexes.sql`)**: the file does not exist yet and the live `Session` table has only its primary-key index. Not a schema-parity gap (schema.prisma has no `@@index` on Session at time of check) — flagging so the index work isn't assumed done.

## Fully matching tables (21 of 36 exact; the other 15 differ only by the items above)

User, Client, Document, Authorization, AuthCptCode, Session, ContactLog, RbtOnboarding, NoteDeficiency, PARequest, GoalTemplate, Notification, SkillTarget, SessionTrialData, BehaviorTarget, BehaviorLog, StaffCredential, EVVLog, ScheduleAppointment, AuditLogVault, AtsCandidate
