# Manual Supabase SQL

**Canonical location for all new human-run SQL.** Paste into the Supabase SQL Editor. Agents must never run `prisma migrate` or `prisma db push` against the live database.

## Naming (future files)

```text
YYYY-MM-DD-HHmmssZ-slug.sql
```

`Z` means UTC. Generate each filename from the real current UTC timestamp at file creation; do not reuse a stale timestamp or placeholder. Keep one logical change per SQL file.

The timestamp provides chronology and collision resistance. It does **not** encode prerequisites: the dependency/apply-order table below controls execution. Existing date-only files and historical references are grandfathered and must not be renamed.

Prefer idempotent DDL (`IF NOT EXISTS`, safe alters, `DO $$ … EXCEPTION WHEN duplicate_object` for enums).

## Run these for connected product

When a target database needs these scripts, paste them into Supabase SQL Editor in this dependency order and obey each row's review gate. Do not infer applied state from filenames. Prerequisite: `prisma/migrations/` archive `01`–`15` already on the DB.

| Order | File | Purpose |
|------:|------|---------|
| 1 | [`2026-08-11-case-opening-marketplace.sql`](2026-08-11-case-opening-marketplace.sql) | CaseOpening + CaseApplication (staffing marketplace) |
| 2 | [`2026-08-11-case-opening-listing-enrichment.sql`](2026-08-11-case-opening-listing-enrichment.sql) | Listing enrichment + RBT home zip / travel miles |
| 3 | [`2026-08-11-session-note-structured-fields.sql`](2026-08-11-session-note-structured-fields.sql) | Session Studio Slice 0 — structured note / signer / Plutus tracker fields |
| 4 | [`2026-08-12-staff-message.sql`](2026-08-12-staff-message.sql) | StaffMessage table (staff chat / case-coord messaging) |
| 5 | [`2026-08-12-schema-parity-backfill.sql`](2026-08-12-schema-parity-backfill.sql) | Everything else in schema.prisma with no DDL of record — enum values (Role HR wave, ClientStatus TX-PA wave), Client/ActionItem/IntakePacket/PARequest columns, EMR + messaging + notification tables, ATS base tables. No-op if the live DB already has them (via old `db push`) |
| 6 | [`2026-08-12-magic-link-expiry.sql`](2026-08-12-magic-link-expiry.sql) | Magic-link `magicLinkExpiresAt`/`magicLinkRevokedAt` on `IntakePacket` + `CandidateOnboardingPacket` (expiry/revocation, readiness gap 7) — all four columns were **observed in the inspected live catalog on 2026-08-12**, but manual execution history is unrecorded; verify the target DB rather than marking the file applied |
| 7 | [`2026-08-12-session-indexes.sql`](2026-08-12-session-indexes.sql) | `Session` hot-path indexes (`clientId+scheduledStart`, `rbtId+scheduledStart`) — idempotent, no order dependency on the other 2026-08-12 scripts — **pending apply in Supabase** |
| 8 | [`2026-08-12-rls-storage-hardening.sql`](2026-08-12-rls-storage-hardening.sql) | Remove the proven-overbroad authenticated `Client` read and ATS bucket-wide CRUD policies. Apply only after both server deployments have a verified `SUPABASE_SERVICE_ROLE_KEY`; no dependency on orders 1–7 — **PENDING MANUAL SECURITY REVIEW** |

Storage size source of truth for security review: CRM `client-documents` is **5 MiB** (`5,242,880` bytes), HRM `ats-applicant-docs` is **10 MiB** (`10,485,760` bytes), and `ats-interview-recordings` is **50 MiB** (`52,428,800` bytes) per the current named constants and tests. No current 200 MiB recording constant exists. The RLS hardening script is policy-only and does **not** alter bucket metadata; any Dashboard cap change is separate.

Manual SQL Editor runs do not create a repository execution ledger. Observed catalog state may show that required objects exist, but only explicit human confirmation can establish a manual execution record.

Full walkthrough (apps, intake → payroll): [`docs/superpowers/specs/2026-08-11-connected-product-test-playbook.md`](../superpowers/specs/2026-08-11-connected-product-test-playbook.md).

## Index

| File | Purpose |
|------|---------|
| [`2026-08-11-case-opening-marketplace.sql`](2026-08-11-case-opening-marketplace.sql) | CaseOpening + CaseApplication (Phase 1 staffing marketplace) |
| [`2026-08-11-case-opening-listing-enrichment.sql`](2026-08-11-case-opening-listing-enrichment.sql) | Richer CaseOpening listing fields + RBT home zip for distance matching |
| [`2026-08-11-session-note-structured-fields.sql`](2026-08-11-session-note-structured-fields.sql) | Session Studio Slice 0 — SessionNote structured/signer/tracker fields + Session.placeOfServiceCode + SessionStatus.IN_PROGRESS |
| [`2026-08-12-staff-message.sql`](2026-08-12-staff-message.sql) | StaffMessage table — staff-to-staff chat used by CRM chat.ts + both apps' staffCommunicationActions / caseOpeningActions |
| [`2026-08-12-schema-parity-backfill.sql`](2026-08-12-schema-parity-backfill.sql) | Schema-parity backfill: all remaining models/columns/enum values in schema.prisma without DDL of record (Role + ClientStatus enum values; Client.rbtId/rbtApproved/treatmentPlan; ActionItem.clientId; IntakePacket magic-link + doc flags; PARequest p2p fields; ClientMessage, Notification, GoalTemplate, SkillTarget, SessionTrialData, BehaviorTarget, BehaviorLog, EVVLog; AtsCandidate + CandidateOnboardingPacket base tables; schema-only StaffCredential / ScheduleAppointment / ReAuthPacket / AuditLogVault) |
| [`2026-08-12-magic-link-expiry.sql`](2026-08-12-magic-link-expiry.sql) | Magic-link expiry/revocation columns for parent (`IntakePacket`) and applicant (`CandidateOnboardingPacket`) links — idempotent, no order dependency on the other 2026-08-12 scripts |
| [`2026-08-12-session-indexes.sql`](2026-08-12-session-indexes.sql) | `Session` hot-path indexes for the unified calendar model: `(clientId, scheduledStart)` (client chart / notes / auth units / weekly grids / parent portal) + `(rbtId, scheduledStart)` (HRM RBT schedule + payroll windows). Names match Prisma `@@index` defaults |
| [`2026-08-12-rls-storage-hardening.sql`](2026-08-12-rls-storage-hardening.sql) | Transaction-wrapped, drift-guarded removal of the broad authenticated `Client` SELECT policy and eight bucket-wide ATS Storage CRUD policies; no bucket metadata changes; server-only/service-role and signed-token access remain the intended paths — **PENDING MANUAL SECURITY REVIEW** |

## Older numbered SQL

Already-applied numbered scripts (`01_*.sql`–`15_*.sql`) live under [`prisma/migrations/`](../../prisma/migrations/). That folder is an archive — do **not** add new SQL there. New paste-ready migrations go here only.
