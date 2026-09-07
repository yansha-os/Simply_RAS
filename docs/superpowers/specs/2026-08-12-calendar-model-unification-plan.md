# Calendar Model Unification Plan — `Session` vs `ScheduleAppointment`

**Date:** 2026-08-12
**Status:** Investigation + phased execution plan (doc-only — no code changed yet)
**Resolves:** Gap 26 of [`2026-08-12-production-readiness-gap-analysis.md`](./2026-08-12-production-readiness-gap-analysis.md); "Scheduling — dual models" P1 row in [`2026-08-11-aba-emr-artemis-replacement-roadmap.md`](./2026-08-11-aba-emr-artemis-replacement-roadmap.md) (§ capability table)

**Read with (do not duplicate):**
- Bridge E–G session/note/payroll flow → [`2026-08-11-aba-crm-hrm-spine-roadmap.md`](./2026-08-11-aba-crm-hrm-spine-roadmap.md)
- Cutover phases referenced below → gap-analysis §4 (Phase 0/1/2) and [`2026-08-11-ras-sandbox-cutover-checklist.md`](./2026-08-11-ras-sandbox-cutover-checklist.md)
- SQL delivery convention → [`docs/sql/README.md`](../../sql/README.md) (manual Supabase SQL Editor only — never `prisma migrate`/`db push`)

---

## 1. Decision (TL;DR)

**Keep `Session` as the single calendar/scheduling source of truth. Delete `ScheduleAppointment` — code first, table last.** Nothing folds *in* from `ScheduleAppointment` because it contains nothing the product uses: it has **zero code references** in either app, and every field it adds is either already on `Session` (`status` values exist in the `SessionStatus` enum; `location` + `placeOfServiceCode` cover `serviceAddress`) or unwanted free-text (`notes` — clinical narrative belongs on `SessionNote`, not the calendar row).

The real scheduling gaps (cancellation audit, conflict detection, recurrence, make-up sessions) are `Session` hardening work — additive columns and write-path guards — not a second model.

| Phase | What | Effort | When |
|---|---|---|---|
| 1 | Remove `ScheduleAppointment` from both `schema.prisma` copies (code-level only) | **S** | Now — safe any time |
| 2 | Verify live table empty → paste-ready `DROP TABLE` SQL | **S** | After Phase 1, user-applied |
| 3 | `Session` hardening: cancellation columns + overlap guard | **M** | After gap-analysis Phase 0 exits |
| 4 | Recurrence materialization + make-up workflow | **L** | **Not before gap-analysis Phase 2 cutover stabilizes** |

---

## 2. Evidence — who touches what (verified 2026-08-12)

### 2.1 `Session` — load-bearing everywhere (Bridge E–G spine)

All references found via `prisma.session` grep across `apps/`; relation reads via `include`/`select` of `Client.sessions` listed separately.

**Writes:**

| Surface | File | Operation |
|---|---|---|
| Case Coord first-session (Bridge E) | `apps/crm/src/app/actions/firstSessionActions.ts` | `create` 97153 therapy session; `update` → COMPLETED; activation gate reads |
| Assessment scheduling (97151) | `apps/crm/src/app/(dashboard)/portal-case/actions/clinical-support.ts` | `create` in `$transaction` (also dual-writes `assessmentScheduledAt` into `Client.treatmentPlan` JSON — see §3.4) |
| Session Studio submit (Bridge F) | `apps/hrm/src/app/actions/sessionEmrActions.ts` | `update` scheduled → COMPLETED with actual clock times, or `create` walk-in COMPLETED; note upsert + trial/behavior rows in same `$transaction`; clock-in `update` (SCHEDULED → IN_PROGRESS) |
| Dev seeding | `apps/crm/src/app/actions/devTools.ts`, `apps/hrm/src/app/actions/devTools.ts` | `create`/`update` demo sessions |

**Reads:**

| Surface | File |
|---|---|
| CRM client profile (feeds CaseCoordSchedulingTab etc.) | `apps/crm/src/app/(dashboard)/client/[id]/page.tsx` (`sessions` include) |
| BCBA daily workstation | `apps/crm/src/app/(dashboard)/portal-clinical/daily/page.tsx` (`sessions: true`) |
| Notes pipeline / billing conversion | `apps/crm/src/app/(dashboard)/notes/page.tsx`, `notes/actions.ts` |
| Case pipeline first-session gate | `apps/crm/src/app/(dashboard)/case/actions.ts` |
| Weekly billable units (billing) | `apps/crm/src/app/actions/weeklyUnitsActions.ts` → `lib/billing/weeklyBillableUnits.ts` |
| Auth-unit consumption panel | `apps/crm/src/app/actions/authUnitsActions.ts` → `lib/billing/authUnits.ts` |
| Chart progress | `apps/crm/src/app/actions/chartProgressActions.ts` |
| Client session history tab | `apps/crm/src/app/actions/clientSessionHistoryActions.ts` |
| Parent magic-link portal (upcoming + history) | `apps/crm/src/app/magic-link/[id]/page.tsx` (2 queries) |
| HRM payroll (Bridge G) | `apps/hrm/src/app/actions/payrollActions.ts` — `listRbtPayrollSessions` (pay window, note-unit resolution, holds) |
| HRM RBT schedule → Session Studio | `payrollActions.listRbtScheduledSessions` → `apps/hrm/src/components/rbt/RbtScheduleView.tsx` (LIVE, DB-only, clinic-TZ keyed) |

### 2.2 `ScheduleAppointment` — schema-only, zero code refs (confirmed)

`prisma.scheduleAppointment` appears **nowhere** in `apps/` or `packages/`. Total footprint:

- `prisma/schema.prisma` + `packages/db/prisma/schema.prisma` (mirrored copies): model at ~line 620 ("Intelligent Scheduling Models (Phase 5)" comment block) + `Client.appointments ScheduleAppointment[]` relation at line 216.
- `docs/sql/2026-08-12-schema-parity-backfill.sql` — created the empty table today (parity-only; the script exists so schema.prisma has DDL of record, not because code needs it).
- Doc mentions (gap analysis, Artemis roadmap, SQL README).

Field diff vs `Session`: `serviceAddress` (covered by `Session.location` + `placeOfServiceCode`), `notes @db.Text` (belongs on `SessionNote`), string `status` with SCHEDULED/COMPLETED/CANCELLED/NO_SHOW (all already in the `SessionStatus` enum, which additionally has IN_PROGRESS). It also *lacks* `actualStart/End`, the `note`/`trialLogs`/`behaviorLogs`/`evvLogs` relations, and `bcba`/`rbt` User relations — it could never carry the Bridge E–G flow.

### 2.3 Other scheduling representations (intent, not calendar events — leave as-is)

| Representation | Where | Role |
|---|---|---|
| `CaseOpening.scheduleText/daysOfWeek/sessionLengthMinutes/scheduleJson` | schema ~line 904; written by `caseOpeningActions.ts` / `ClientJobBoardPanel.tsx` (`WeeklyScheduleUnitGrid` UI) | Weekly *staffing intent* for the job-board listing. Never materialized into `Session` rows (Phase 4 opportunity) |
| `CandidateOnboardingPacket.availabilityGrid` (Json) | schema ~line 714 | Applicant availability from HRM onboarding. Not checked at scheduling time |
| `CaseApplication.meetAt` | schema ~line 946 | Meet-and-greet datetime — one-off, not a service event |
| `Client.treatmentPlan.assessmentScheduledAt` (JSON) | written by `clinical-support.ts` alongside the 97151 `Session` row | Duplicate write; status-wiring (Slice B) owns it — out of scope here |
| localStorage layers (`sessionStudioDraft`, `rbtPayHolds`) | HRM client-side | Draft/hold UX only; DB stays SoT |

---

## 3. The concrete pain

1. **Fork risk is now live.** The parity backfill just created a real, empty `ScheduleAppointment` table in the DB, and schema comments advertise it as "Intelligent Scheduling (Phase 5)". A future agent building a calendar feature can plausibly wire it, forking the calendar: sessions written there are invisible to billing (`weeklyBillableUnits`, `authUnits`), payroll (Bridge G), the notes pipeline, the parent portal, and Studio. This is the single strongest reason to delete it *before* scheduling features scale.
2. **No recurrence.** Weekly intent lives in `CaseOpening.scheduleJson` but Case Coord creates each `Session` by hand; nothing materializes a recurring plan into rows.
3. **No cancellation/reschedule audit.** Status flips to `CANCELLED`/`NO_SHOW` carry no reason, timestamp, or actor; a reschedule mutates `scheduledStart/End` in place, so attendance integrity ("make-up workflow MISSING", Artemis roadmap) can't be reconstructed. Billing correctly *excludes* CANCELLED/NO_SHOW (`weeklyBillableUnits.ts`), but nothing records why.
4. **No conflict detection.** Nothing prevents double-booking an RBT or client at overlapping times, and `availabilityGrid` is never consulted at write time.
5. **TZ is solved — don't re-solve it.** All day/week boundaries go through `clinicTimezone.ts` (America/New_York, `Intl`-only, byte-identical CRM/HRM copies). Any unification work must keep using these helpers and keep the copies in sync.

None of these are fixed by keeping two models; all are additive `Session` work.

---

## 4. Phased plan

Every phase independently shippable; exit criteria for each: `npm test` + `npm run typecheck` green (repo root), both `next build`s pass in CI.

### Phase 1 — Remove `ScheduleAppointment` from code (S)

No DB change; the orphaned table is harmless to Prisma.

1. Delete the `ScheduleAppointment` model block (under the "INTELLIGENT SCHEDULING MODELS (PHASE 5)" comment, ~line 620) and the `appointments ScheduleAppointment[]` relation on `Client` (~line 216) from **both** `prisma/schema.prisma` and `packages/db/prisma/schema.prisma` (they must stay mirrored).
2. `npx prisma generate` (client-only — never migrate/push per workspace rule).
3. Grep-verify `scheduleAppointment|ScheduleAppointment` has zero hits under `apps/` and `packages/` outside `.sql` archives.
4. Do **not** edit `docs/sql/2026-08-12-schema-parity-backfill.sql` — it is the applied-DDL record.

**Files:** the two `schema.prisma` copies only. **Risk:** none observed — no generated-client consumer exists.

### Phase 2 — Verified-empty drop (S, user-applied SQL)

1. Give the user verification SQL for the Supabase SQL Editor:
   `SELECT COUNT(*) FROM "ScheduleAppointment";`
2. **If 0** (expected — no code has ever written to it): add `docs/sql/YYYY-MM-DD-HHmmssZ-drop-schedule-appointment.sql` using the real current UTC timestamp, containing `DROP TABLE IF EXISTS "ScheduleAppointment";`, plus index + apply-order rows in `docs/sql/README.md`. Wait for user confirmation before treating as applied.
3. **If > 0** (someone inserted manually): STOP — do not drop. Map rows into `Session` first (`status::text → "SessionStatus"` cast; `serviceAddress → location`; `notes` reviewed by a human — no automatic home), then drop.
4. Update gap-analysis gap 26 and the Artemis roadmap scheduling row to point here as resolved.

**Constraint honored:** destructive DDL only after data verified, only via manual Supabase SQL, ordered after the parity backfill in the apply-order table.

### Phase 3 — `Session` scheduling hardening (M)

Additive only; runs after gap-analysis **Phase 0** exits (auth guards + CI blocking), because new write paths must land on guarded actions.

1. **Schema (additive):** `cancellationReason String?`, `cancelledAt DateTime?`, `cancelledById String? @db.Uuid` on `Session` (+ paste-ready `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` script in `docs/sql/`). Skip `serviceAddress` — `location` + `placeOfServiceCode` cover current product needs; add only when a real surface asks.
2. **Cancel/reschedule actions:** a `cancelSession` action (sets status + reason columns, never deletes) and a `rescheduleSession` action that cancels-and-recreates (new row) instead of mutating `scheduledStart` in place — preserving billing/attendance history. Follow the server-action-pattern skill; guard with `requireStaff`.
3. **Overlap guard:** shared helper (e.g. `apps/crm/src/lib/sessionConflicts.ts`) checking RBT and client overlap (`scheduledStart < otherEnd AND scheduledEnd > otherStart`, status in SCHEDULED/IN_PROGRESS), called from `firstSessionActions.scheduleFirstTherapySession` and `clinical-support` assessment scheduling. Unit tests alongside the existing `lib/__tests__` suites.
4. Surface cancel/reschedule in `CaseCoordSchedulingTab` and the client session history tab.

**Files:** both `schema.prisma` copies, new `docs/sql/` script, `firstSessionActions.ts`, `portal-case/actions/clinical-support.ts`, new `lib/sessionConflicts.ts` (+ tests), `CaseCoordSchedulingTab.tsx`, `clientSessionHistoryActions.ts`.

### Phase 4 — Recurrence + make-up (L, deferred)

Materialize weekly `Session` rows from `CaseOpening.scheduleJson` (n weeks ahead, clinic-TZ via `clinicTimezone.ts` helpers, conflict-checked, optional `recurrenceGroupId String?` column), plus a make-up workflow linking a make-up session to its CANCELLED/NO_SHOW origin.

**Explicit timing recommendation: do NOT start Phase 4 before gap-analysis Phase 2 (per-cohort production cutover) stabilizes.** Evidence: `Session` is the load-bearing input to billing conversion, auth-unit consumption, and payroll during the Artemis dual-run; a bulk-materialization writer introduced mid-cutover risks flooding those queues with future rows and corrupting the ≥10-note audit and payroll windows (`listRbtPayrollSessions` already includes SCHEDULED rows as holds). Manual scheduling volume (one cohort) does not justify the risk yet.

---

## 5. What NOT to do

- **Do not touch billing/payroll invariants mid-flight:** the Studio submit `$transaction` (session update + note upsert + trial/behavior replace + `isConverted` re-check) in `sessionEmrActions.ts`, the `isConverted` resubmit block, `weeklyBillableUnits` unit resolution, or `derivePayHoldFromFlags` in `payrollActions.ts`.
- **Do not rename `Session` columns or alter `SessionStatus` enum values** — live DDL; additive only.
- **Do not wire `ScheduleAppointment` into anything** while Phase 1 is pending; it is scheduled for deletion.
- **No destructive DDL before the Phase 2 count check**, and never from the agent (Supabase SQL Editor only).
- **Do not fix the `treatmentPlan.assessmentScheduledAt` dual-write here** — assessment status wiring (spine Slice B) owns it; note it there instead.
- **Do not add new timezone logic** — use `clinicTimezone.ts` and keep the CRM/HRM copies byte-identical.
