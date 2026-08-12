# Calendar Model Unification — retire `ScheduleAppointment`, `Session` is the single calendar model

**Date:** 2026-08-12
**Gap:** #26 (Low) from `2026-08-12-production-readiness-gap-analysis.md` — "Dual `Session` vs `ScheduleAppointment` calendar models. Action: Unify (roadmap P1)."
**Status:** Design approved-pending-review. Read-only investigation; no code changed yet.

---

## Verdict

`ScheduleAppointment` is **dead code**: it exists only in the two (byte-identical) `schema.prisma` copies, in the parity-backfill DDL, and in docs. **Zero** application-code reads or writes in either app. `Session` is the single working calendar/scheduling model everywhere. Recommendation: **retire `ScheduleAppointment`** (drop model + table); no data merge needed.

Evidence — full-repo grep for `ScheduleAppointment` / `scheduleAppointment` matches only:

- `prisma/schema.prisma` (model at ~line 620; `Client.appointments ScheduleAppointment[]` at ~line 216)
- `packages/db/prisma/schema.prisma` (identical copy — verified byte-identical via diff)
- `docs/sql/2026-08-12-schema-parity-backfill.sql` (§5 creates the table, and its own header labels it "Schema-only models … NOT yet referenced by app code")
- `docs/sql/README.md`, gap-analysis spec, one roadmap spec (mentions only)

No `prisma.scheduleAppointment.*` call exists anywhere under `apps/` or `packages/`.

### Model comparison (why nothing is lost)

`ScheduleAppointment` is a strict subset of `Session` plus a free-text `notes` field:

| ScheduleAppointment field | Session equivalent |
|---|---|
| `clientId`, `rbtId`, `bcbaId` | same (Session adds real `rbt`/`bcba` User relations; ScheduleAppointment has none) |
| `scheduledStart/End` | same |
| `serviceAddress` | `location` + `placeOfServiceCode` |
| `cptCode` (String, default 97153) | `cptCode` (String?) |
| `status` (free String) | `status SessionStatus` enum — SCHEDULED / IN_PROGRESS / COMPLETED / CANCELLED / NO_SHOW |
| `notes` (Text) | `SessionNote` 1:1 relation (far richer: signatures, structured content, billable units) |

`Session` also carries `actualStart/End` (EVV honesty) and child relations `SessionNote`, `SessionTrialData`, `BehaviorLog`, `EVVLog`. `ScheduleAppointment` has no children and nothing references it except the `Client` FK. Neither model declares `@@index` (see optional follow-up).

---

## Current-state map — who uses `Session`

### Writers (create/update)

| Surface | File | What it does |
|---|---|---|
| Case-coord first-therapy scheduling | `apps/crm/src/app/actions/firstSessionActions.ts` | `scheduleFirstTherapySession` creates SCHEDULED non-97151 rows (gates STAFFING_PENDING→ACTIVE); `confirmTherapySessionCompleted` → COMPLETED |
| Assessment scheduling | `apps/crm/src/app/(dashboard)/portal-case/actions/clinical-support.ts` (`scheduleAssessment`, ~line 55) | Creates SCHEDULED 97151 session + advances client to ASSESSMENT_SCHEDULED |
| Studio submit (HRM) | `apps/hrm/src/app/actions/sessionEmrActions.ts` (~lines 894–930) | Transactionally updates a SCHEDULED/IN_PROGRESS row → COMPLETED with actual times, or creates a COMPLETED row for unscheduled work; upserts `SessionNote` |
| EVV clock-in (HRM) | `apps/hrm/src/app/actions/sessionEmrActions.ts` (`clockInHrmSession`, ~line 1058) | SCHEDULED → **IN_PROGRESS** (today's addition) + `actualStart` + idempotent `EVVLog` |
| Legacy RBT log (HRM) | `apps/hrm/src/app/(dashboard)/rbt/actions.ts` (`logSession`) | Demo-ish: hardcoded now→+2h COMPLETED session + note |
| Dev tools (both apps) | `apps/{crm,hrm}/src/app/actions/devTools.ts` | Seed/advance demo sessions |

### Readers (consume)

| Surface | File | Reads |
|---|---|---|
| HRM RBT schedule + Studio picker | `apps/hrm/src/app/actions/payrollActions.ts` (`listRbtScheduledSessions`) → `apps/hrm/src/components/rbt/RbtScheduleView.tsx` | SCHEDULED/IN_PROGRESS/COMPLETED by rbtId; Mon–Fri matrix |
| HRM payroll | same file (`listRbtPayrollSessions`) | Pay-period window; IN_PROGRESS rows surface as DB-backed holds |
| Billing week grid | `apps/crm/src/app/actions/weeklyUnitsActions.ts` + `apps/crm/src/lib/billing/weeklyBillableUnits.ts` → `WeeklyBillableUnitGrid.tsx` | BCBA-signed notes per clinic week |
| Auth unit burn-down | `apps/crm/src/app/actions/authUnitsActions.ts` + `lib/billing/authUnits.ts` → `AuthUnitsPanel.tsx` | All client sessions vs Authorization/PARequest windows |
| Notes pipeline (Plutus gate) | `apps/crm/src/app/(dashboard)/notes/page.tsx` + `notes/actions.ts` | Per-client session ledgers for convert gating |
| Client chart/history | `apps/crm/src/app/actions/clientSessionHistoryActions.ts`, `chartProgressActions.ts` | Read-only chart rows / progress |
| Parent portal | `apps/crm/src/app/magic-link/[id]/page.tsx` (~lines 126, 144) | Upcoming (SCHEDULED/IN_PROGRESS) + past sessions, 97151 excluded |
| Activation gate | `apps/crm/src/app/(dashboard)/case/actions.ts` (`activateClient`) | Requires a durable non-97151 Session before ACTIVE |
| Case-coord scheduling tab | `apps/crm/src/components/client-profile/tabs/CaseCoordSchedulingTab.tsx` | Lists therapy sessions; calls `scheduleFirstTherapySession` |

### Status lifecycle (as implemented)

`SCHEDULED → IN_PROGRESS (clock-in) → COMPLETED (Studio submit / confirm)`; `CANCELLED` / `NO_SHOW` exist in the enum but no code path sets them yet (UI/action gap, out of scope here). Payroll and parent portal already consume IN_PROGRESS.

### Calendar-ish UI **not** backed by either model (by design — leave alone)

- `apps/crm/src/components/magic-link/ClientScheduleBuilder.tsx` — parent's preferred weekly schedule, saved as JSON at `Client.treatmentPlan.preferredSchedule`. Preferences, not dated events.
- `apps/crm/src/components/client-profile/tabs/WeeklyScheduleUnitGrid.tsx` (+ `ClientJobBoardPanel.tsx`) — recurring Mon–Sun 15-min unit grid (`WeekSchedule` JSON) for staffing/job-board listings. Also preferences.
- `apps/hrm/src/components/rbt/RbtScheduleView.tsx` — schedule rows are DB-backed, but pay-holds/done-state ride a localStorage overlay; `clockInHrmSession` explicitly ignores non-UUID "local/demo schedule ids".

These are weekly-recurrence *preferences*; converting them to dated Session rows is explicitly not part of this unification.

### Timezone state after 2026-08-12 `clinicTimezone.ts` pinning

- **Pinned to clinic TZ (America/New_York):** billing week grid (`weeklyBillableUnits.ts`), auth windows (`authUnits.ts`), HRM `RbtScheduleView` day/week bucketing (`clinicDateKey`, `addClinicDays`).
- **Still host/browser TZ:** the two *creation* surfaces — `CaseCoordSchedulingTab.tsx` (`datetime-local` → `new Date(startLocal).toISOString()`, display via bare `toLocaleString()`) and `BcbaAssessmentTab.tsx` (same pattern). Also `RbtScheduleView.tsx` line ~114 renders time-of-day with `toLocaleTimeString([], …)` (no `timeZone`), so times display in the viewer's browser TZ while date bucketing is clinic-TZ. Acceptable while all users sit in ET; flag as a small follow-up, not part of this migration.

---

## Migration plan

### Step 1 — Schema (S)

Remove from **both** copies (`prisma/schema.prisma` and `packages/db/prisma/schema.prisma`, keep byte-identical):

1. `model ScheduleAppointment { … }` block (~line 620).
2. `appointments ScheduleAppointment[]` line on `model Client` (~line 216).

No other model references it. Do **not** run `prisma generate` until the SQL below is confirmed applied (client must match live DB).

### Step 2 — SQL script (S) — describe only; create at implementation time

New file `docs/sql/YYYY-MM-DD-HHmmssZ-retire-schedule-appointment.sql`, using the real current UTC timestamp per supabase-migration-generator conventions: paste-ready, idempotent, indexed in `docs/sql/README.md` (both tables; runs **after** `2026-08-12-schema-parity-backfill.sql` in the apply order, though it is a safe no-op if the table never existed). Contents:

1. A `DO $$ … $$` guard: if `"ScheduleAppointment"` exists **and has any rows**, `RAISE EXCEPTION` and abort — a populated table would mean some out-of-band writer exists and the merge branch of this spec applies instead. (Expected rowcount is 0: the table only gained DDL-of-record today via the parity backfill and no code writes it.)
2. `DROP TABLE IF EXISTS "ScheduleAppointment";` — the client FK constraint drops with the table; no other object depends on it.

The user runs it manually in the Supabase SQL Editor; wait for confirmation before Step 3.

### Step 3 — Prisma client + code (S)

- `npx prisma generate` after the user confirms the SQL ran.
- Code changes: **none** — verified no app/package code references the model. Gate: `rg -i scheduleappointment apps packages` must return nothing.

### Step 4 — Docs (S)

- Mark gap #26 resolved in the gap-analysis spec's tracking (parent handles index links).
- Amend the §5 "schema-only models" note in `docs/sql/README.md` / parity-backfill references where they still list `ScheduleAppointment` as pending — the retire script supersedes the parity `CREATE` for this one table (no orphan facts).

### Step 5 — Verify (S)

Per repo rules: `npm test` (vitest) + `npm run typecheck` at repo root, plus both `next build`s (CI blocks on all four). No unit tests reference the model, so green = done.

### Rollback

Trivial and lossless (table is empty): re-add the model block to both schemas from git history and re-run §5 of `docs/sql/2026-08-12-schema-parity-backfill.sql`, which recreates the table idempotently.

### Optional follow-up (separate change, M)

`Session` has no `@@index`; hot paths filter `(rbtId, status)` (HRM schedule/payroll) and `(clientId, scheduledStart)` (grids, chart, parent portal). Adding `@@index([rbtId, status])` and `@@index([clientId, scheduledStart])` + a small `CREATE INDEX IF NOT EXISTS` script would future-proof the now-single calendar model. Not required for unification.

---

## Non-goals

- **Recurring appointments / recurrence engine** — weekly patterns live as preference JSON (`treatmentPlan.preferredSchedule`, `WeekSchedule` grids) and nothing consumes them as dated events. No evidence of need.
- **External calendar sync (Google/Outlook/iCal)** — zero references anywhere.
- **CANCELLED / NO_SHOW workflows** — enum values exist, no setter paths; separate roadmap item.
- **Clinic-TZ pinning of the scheduling creation/display surfaces** (`CaseCoordSchedulingTab`, `BcbaAssessmentTab`, `RbtScheduleView` time-of-day) — noted above, tracked separately.
- **Renaming `Session`** or migrating preference grids into Session rows.

## Effort summary

| Step | Size |
|---|---|
| Schema edit (both copies) | S |
| SQL script + README index | S |
| Prisma generate + grep gate | S |
| Docs touch-ups | S |
| Verification (test/typecheck/builds) | S |
| **Total** | **S — a half-day including the manual Supabase apply round-trip** |
