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

Schema declares `creatorId String? @db.Uuid`; the live column was `NOT NULL`. The current action supplies the authenticated creator ID, but the database now also matches the optional Prisma field. Prisma's generated DDL assigns `ON DELETE SET NULL` to this optional relation; the follow-up [`2026-09-07-182830Z-action-item-creator-delete-rule.sql`](../../sql/2026-09-07-182830Z-action-item-creator-delete-rule.sql) corrects the historical live `RESTRICT` drift.

### 2. `ReAuthPacket.attendancePct` — resolved 2026-09-07

Schema (and `2026-08-12-schema-parity-backfill.sql`) declare `DOUBLE PRECISION NOT NULL DEFAULT 95.0`; the live column had the default but allowed NULL because the pre-existing table made the backfill's `CREATE TABLE IF NOT EXISTS` a no-op. The parity migration backfilled any null values and enforced `NOT NULL`.

### Fix SQL

The canonical transaction-wrapped fix is [`2026-09-07-182218Z-nullability-parity.sql`](../../sql/2026-09-07-182218Z-nullability-parity.sql). Apply state is tracked in [`docs/sql/README.md`](../../sql/README.md).

## Benign drift (no action required)

- **39 timestamp columns are `timestamptz` in DB vs Prisma-default `timestamp(3)`** — deliberate: the hand-written `docs/sql` scripts use `TIMESTAMPTZ` (better practice). Prisma Client reads/writes these fine. Affected tables: SessionNote (4 signer/convert timestamps), IntakePacket (2 magic-link), ClientMessage (2), StaffMessage (2), CandidateOnboardingPacket (9), AtsInterview (5), AtsHelpTicket (3), AtsHelpMessage (1), AtsInterviewRecording (1), ApplicantDeviceSession (3), OnboardingSignatureEvent (1), CaseOpening (2), CaseApplication (4). If anyone ever wants `prisma migrate diff` against the live DB to come back clean, annotate these fields `@db.Timestamptz` in schema.prisma — do **not** downgrade the DB columns.
- **The 3 extra orphaned tables originally observed** (`AuditLog`, `FirstSessionConsensus`, `StartDatePoll`) were empty and dependency-free, then removed from `Simple_RAS_CRM_DEV` on 2026-09-07 by [`2026-09-07-180522Z-drop-empty-legacy-tables.sql`](../../sql/2026-09-07-180522Z-drop-empty-legacy-tables.sql).
- **3 legacy `ClientStatus` labels in DB** not in schema: `DOCS_PENDING`, `AUTH_INITIATED`, `AUTHORIZED`. Verified **0 Client rows** use them, so Prisma deserialization is safe. Postgres can't cheaply drop enum values; ignore. (Enum label *order* also differs from schema — only matters for `ORDER BY` on the enum column.)
- **Session indexes:** the original audit predated `docs/sql/2026-08-12-session-indexes.sql`; the live supporting-index audit was subsequently completed and the remaining foreign-key gaps were corrected in DEV on 2026-09-07.

## Foreign-key rule audit — 2026-09-07

Prisma's offline generated DDL defines 58 foreign keys. `Simple_RAS_CRM_DEV` has 62. A name-and-rule catalog comparison found:

- All 58 Prisma-defined constraints exist, and their `ON DELETE` behavior matches after the `ActionItem.creatorId` correction.
- Eighteen older manually created constraints use PostgreSQL's default `ON UPDATE NO ACTION` instead of Prisma's generated `ON UPDATE CASCADE`. IDs are immutable UUID primary keys throughout these workflows, so rewriting otherwise-correct constraints would add table locks and deployment risk without measurable runtime or integrity value. This drift is intentionally accepted.
- Four additional live constraints protect scalar ID fields that Prisma does not expose as navigation relations: `AuditLogVault.userId → User.id`, `ReAuthPacket.paRequestId → PARequest.id`, `ScheduleAppointment.bcbaId → User.id`, and `ScheduleAppointment.rbtId → User.id`. Each uses `ON DELETE SET NULL`; retaining them prevents dangling identifiers without changing application behavior.

Current classification: **zero actionable foreign-key gaps**. Revisit the accepted `ON UPDATE` drift only if the system ever supports changing primary identifiers, and retire the two `ScheduleAppointment` constraints with that dead table if the approved calendar-unification cleanup is executed.

## Column-default audit — 2026-09-07

A read-only catalog comparison checked all 171 fields with `@default(...)` in `prisma/schema.prisma`, normalizing equivalent PostgreSQL spellings such as `CURRENT_TIMESTAMP`/`now()`, enum/text casts, JSONB casts, and database-side `gen_random_uuid()` for Prisma `uuid()` defaults.

- **Zero missing defaults and zero conflicting default values.**
- DEV has 11 additional `now()` defaults, exclusively on Prisma `@updatedAt` columns: `ScheduleAppointment`, `ReAuthPacket`, `AtsInterview`, `AtsCandidate`, `AtsHelpTicket`, `CandidateOnboardingPacket`, `CaseApplication`, `CaseOpening`, `SkillTarget`, `BehaviorTarget`, and `StaffCredential`.
- These additional defaults are intentionally accepted. They make direct SQL inserts safer, while Prisma's `@updatedAt` behavior still supplies subsequent update timestamps. Removing them would not improve application correctness or performance.

Current classification: **zero actionable column-default gaps**.

## Primary, unique, and check-constraint audit — 2026-09-07

A read-only `pg_constraint`/`pg_index` comparison against Prisma's offline generated DDL found:

- All 36 Prisma models have their expected single-column `id` primary key, and every primary-key constraint is validated.
- All 12 Prisma uniqueness guarantees exist on the correct ordered column set, including one-to-one relations, magic-link tokens, candidate email, case code, and the composite case-application key.
- `ApplicantDeviceSession(candidateId, deviceFingerprint)` uses the legacy live name `ApplicantDeviceSession_candidate_device_unique` instead of Prisma's generated `ApplicantDeviceSession_candidateId_deviceFingerprint_key`; its definition is otherwise identical. Index names are not used by the application, so this naming-only drift is intentionally accepted.
- DEV has zero table check constraints, matching the fact that Prisma's schema declares none.

Current classification: **zero actionable primary-key, uniqueness, or check-constraint gaps**.

## Fully matching tables (21 of 36 exact; the other 15 differ only by the items above)

User, Client, Document, Authorization, AuthCptCode, Session, ContactLog, RbtOnboarding, NoteDeficiency, PARequest, GoalTemplate, Notification, SkillTarget, SessionTrialData, BehaviorTarget, BehaviorLog, StaffCredential, EVVLog, ScheduleAppointment, AuditLogVault, AtsCandidate
