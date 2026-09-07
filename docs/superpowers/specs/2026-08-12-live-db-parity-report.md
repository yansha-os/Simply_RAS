# Live DB ↔ schema.prisma Parity Report — 2026-08-12

**Historical verdict:** 2 actionable nullability discrepancies were observed on 2026-08-12. Both were corrected and independently verified in `Simple_RAS_CRM_DEV` on 2026-09-07 by [`2026-09-07-182218Z-nullability-parity.sql`](../../sql/2026-09-07-182218Z-nullability-parity.sql). Everything else in the original comparison matched: **all 36 schema models existed as tables, with zero missing columns and zero missing enum values.**

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

### 1. `ActionItem.creatorId` — resolved 2026-09-07

Schema declares `creatorId String? @db.Uuid`; the live column was `NOT NULL`. The current action supplies the authenticated creator ID, but the database now also matches the optional Prisma field. Prisma does not declare `onDelete: SetNull` for this relation, so the existing `RESTRICT` rule remains intentional.

### 2. `ReAuthPacket.attendancePct` — resolved 2026-09-07

Schema (and `2026-08-12-schema-parity-backfill.sql`) declare `DOUBLE PRECISION NOT NULL DEFAULT 95.0`; the live column had the default but allowed NULL because the pre-existing table made the backfill's `CREATE TABLE IF NOT EXISTS` a no-op. The parity migration backfilled any null values and enforced `NOT NULL`.

### Fix SQL

The canonical transaction-wrapped fix is [`2026-09-07-182218Z-nullability-parity.sql`](../../sql/2026-09-07-182218Z-nullability-parity.sql). Apply state is tracked in [`docs/sql/README.md`](../../sql/README.md).

## Benign drift (no action required)

- **39 timestamp columns are `timestamptz` in DB vs Prisma-default `timestamp(3)`** — deliberate: the hand-written `docs/sql` scripts use `TIMESTAMPTZ` (better practice). Prisma Client reads/writes these fine. Affected tables: SessionNote (4 signer/convert timestamps), IntakePacket (2 magic-link), ClientMessage (2), StaffMessage (2), CandidateOnboardingPacket (9), AtsInterview (5), AtsHelpTicket (3), AtsHelpMessage (1), AtsInterviewRecording (1), ApplicantDeviceSession (3), OnboardingSignatureEvent (1), CaseOpening (2), CaseApplication (4). If anyone ever wants `prisma migrate diff` against the live DB to come back clean, annotate these fields `@db.Timestamptz` in schema.prisma — do **not** downgrade the DB columns.
- **The 3 extra orphaned tables originally observed** (`AuditLog`, `FirstSessionConsensus`, `StartDatePoll`) were empty and dependency-free, then removed from `Simple_RAS_CRM_DEV` on 2026-09-07 by [`2026-09-07-180522Z-drop-empty-legacy-tables.sql`](../../sql/2026-09-07-180522Z-drop-empty-legacy-tables.sql).
- **3 legacy `ClientStatus` labels in DB** not in schema: `DOCS_PENDING`, `AUTH_INITIATED`, `AUTHORIZED`. Verified **0 Client rows** use them, so Prisma deserialization is safe. Postgres can't cheaply drop enum values; ignore. (Enum label *order* also differs from schema — only matters for `ORDER BY` on the enum column.)
- **Session indexes:** the original audit predated `docs/sql/2026-08-12-session-indexes.sql`; the live supporting-index audit was subsequently completed and the remaining foreign-key gaps were corrected in DEV on 2026-09-07.

## Fully matching tables (21 of 36 exact; the other 15 differ only by the items above)

User, Client, Document, Authorization, AuthCptCode, Session, ContactLog, RbtOnboarding, NoteDeficiency, PARequest, GoalTemplate, Notification, SkillTarget, SessionTrialData, BehaviorTarget, BehaviorLog, StaffCredential, EVVLog, ScheduleAppointment, AuditLogVault, AtsCandidate
