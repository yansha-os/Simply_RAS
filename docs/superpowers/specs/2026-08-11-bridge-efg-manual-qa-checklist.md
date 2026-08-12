# Bridges E / F / G — Manual QA Checklist

**Date:** 2026-08-11  
**Status:** Manual QA runbook (click-paths)  
**Apps:** CRM `:3000` · HRM `:3001`  
**Related:** spine [`2026-08-11-aba-crm-hrm-spine-roadmap.md`](./2026-08-11-aba-crm-hrm-spine-roadmap.md); clinical SoT [`2026-08-11-aba-session-note-data-collection-spec.md`](./2026-08-11-aba-session-note-data-collection-spec.md)

Use this after Bridges E–G are deployed against a shared DB. Prefer a known `STAFFING_PENDING` client with RBT + BCBA assigned (or staff via job board first).

| App | Port | Dev |
|-----|------|-----|
| CRM | **3000** | `apps/crm` → `next dev -p 3000` |
| HRM | **3001** | `apps/hrm` → `next dev -p 3001` |

---

## Preconditions

- [ ] Both apps running against the **same** Postgres.
- [ ] DevTools / role switch available if needed (Case Coord, BCBA, Billing, RBT).
- [ ] Test client: `Client.status = STAFFING_PENDING`, `rbtId` + `bcbaId` set (or ready to assign via job board).
- [ ] Optional DB checks: Supabase Table Editor or SQL on `Client`, `Session`, `SessionNote`.

### DevTools one-click fixture (skip full intake)

Requires `NEXT_PUBLIC_ENABLE_DEV_TOOLS=true` and non-production. Idempotent upsert on guardian email `demo.studio.learner@riseandshine.local`.

**Prefer DevTools → Seed Studio→payroll** (ACTIVE + scheduled 97153) with `NEXT_PUBLIC_ENABLE_DEV_TOOLS=true`. Isolated FAB seeds on CRM and HRM both work.

| Where | Button | Result |
|-------|--------|--------|
| CRM or HRM DevTools | **Seed Studio→payroll (ACTIVE + session)** | Client `ACTIVE` + RBT + BCBA + scheduled `97153` — Studio → sign → payroll |
| Same | **Seed staffing (STAFFING_PENDING + staff)** | Client `STAFFING_PENDING` + RBT + BCBA (no session) — Bridge E schedule path |

Then: HRM DevTools → **Active Users → David Miller (RBT)** → `/rbt/schedule` → **EVV Start Session**. Action: `devSeedConnectedProductDemo` in `apps/crm|hrm/src/app/actions/devTools.ts`.

---

## Bridge E — First durable session → `ACTIVE`

**Invariant:** Job-board / parent accept assigns RBT only. `ACTIVE` requires a durable non-`97151` `Session` **then** explicit activate.

### Code / surfaces

| Piece | Where |
|-------|--------|
| Schedule + activate UI | CRM `CaseCoordSchedulingTab` — client profile tab **Scheduling & Job Board** |
| Actions | `apps/crm/src/app/actions/firstSessionActions.ts` → `scheduleFirstTherapySession`, `activateClientAfterFirstSession` |
| Job-board accept (must NOT activate) | CRM `ClientJobBoardPanel` → **Parent likes → assign** → `acceptApplicationAsParent` |
| Labels | **Schedule therapy session (97153)** · **Schedule Session** · **Activate after first session** · section **2. First Session & Activate** |

### Click path A — Happy path (schedule → activate)

1. **CRM :3000** — open client `/client/[id]` as Case Coord → tab **Scheduling & Job Board**.
2. Confirm badge / status shows `STAFFING_PENDING` and RBT + BCBA assigned. If not staffed, use job board (path B) first — still expect status stay `STAFFING_PENDING`.
3. Under **2. First Session & Activate**, set start/end → click **Schedule Session**.
4. Expect toast about first therapy session scheduled; list shows a non-`97151` session (default CPT `97153`).
5. Click **Activate after first session**.
6. Expect client status → `ACTIVE`; toast / notification *Client activated*.

**DB / status checks**

| Check | Expected |
|-------|----------|
| `Client.status` after schedule only | still `STAFFING_PENDING` |
| `Session` row | `cptCode != '97151'`, `status` in `SCHEDULED` \| `COMPLETED`, `rbtId` / `bcbaId` populated |
| `Client.status` after activate | `ACTIVE` |
| Activate without Session | action error: *no therapy Session on record* |

### Click path B — Prove job-board accept does NOT activate

1. Client at `STAFFING_PENDING` **without** relying on prior `ACTIVE`.
2. CRM job board panel: post opening if needed → HRM `:3001` `/rbt/job-board` apply (or existing application).
3. CRM **Parent likes → assign** (`acceptApplicationAsParent`).
4. Expect toast **Parent liked — RBT assigned**; opening `FILLED`; application `APPROVED`.
5. **Assert** `Client.status` remains `STAFFING_PENDING` (never jumps to `ACTIVE`).
6. Only after Bridge E path A (schedule + activate) should status become `ACTIVE`.

### Common failure points (E)

| Symptom | Likely cause |
|---------|----------------|
| Schedule disabled / error *Staffing not ready* | Missing `rbtId` or `bcbaId` while `STAFFING_PENDING` |
| Cannot schedule | Client not `STAFFING_PENDING` / `ACTIVE` |
| Activate fails *Assessment sessions cannot activate* | Session is CPT `97151` only |
| Activate fails *no therapy Session* | Scheduled nothing, or only assessment rows |
| Status `ACTIVE` right after parent accept | Regression — Bridge E invariant broken |
| UI shows ACTIVE but DB not | Cache / wrong client id — re-query `Client` |

---

## Bridge F — RBT note → BCBA `bcbaSigned` → Plutus convert

**Invariant:** `isConverted` only after `rbtSigned && bcbaSigned` (actions also expect parent/caregiver signed for tracker). HRM must **not** set `isConverted`.

### Code / surfaces

| Piece | Where |
|-------|--------|
| RBT submit | HRM Session Studio `/rbt/session/[sessionId]` · `RbtSessionStudio` · `submitHrmSessionEmrNote` |
| Schedule entry | HRM `/rbt/schedule` · `RbtScheduleView` → **EVV Start Session →** |
| BCBA e-sign | CRM `/portal-clinical/daily` · `BcbaDailyWorkstation` · **E-Sign Note** / **Batch E-Sign** · `signSessionNotesAsBcba` |
| Plutus tracker | CRM `/notes` · `NotesPipelineClient` · **Mark sent to Plutus (manual tracker)** · `convertNoteToBillable` |

### Click path

1. **HRM :3001** — `/rbt/schedule` (hired RBT). Prefer a Case Coord–scheduled session for the test client; demo seeds OK if DB session id is UUID.
2. **Upcoming Schedule** → **EVV Start Session →** → `/rbt/session/[id]`.
3. Complete Studio phases (clock-in → collect → note → sign) until claim-ready submit succeeds.
4. Expect success copy about awaiting BCBA e-sign; **do not** see Plutus convert from HRM.
5. **DB after RBT submit:** `SessionNote.rbtSigned = true`, `bcbaSigned = false`, `isConverted = false`, `Session.status = COMPLETED` (typical).
6. **CRM :3000** — `/portal-clinical/daily` → **Daily Workstation & E-Sign Hub** → note shows **RBT Signed** / **BCBA Signature Pending** → **E-Sign Note** (or batch).
7. Expect toast *E-signed … eligible for Plutus tracker.*
8. **DB:** `SessionNote.bcbaSigned = true`; still `isConverted = false`.
9. Open `/notes` (**Manual Plutus / Claims Tracker**). Note appears only when signed (page filters `rbtSigned && parentSigned && bcbaSigned && !isConverted`).
10. Click **Mark sent to Plutus (manual tracker)**.
11. **DB:** `isConverted = true`.

### Negative checks (F)

| Action | Expected |
|--------|----------|
| Convert before BCBA sign | Action error *BCBA e-sign required…*; `/notes` list empty for that note |
| Convert with `bcbaSigned` false via API/UI bypass | Blocked in `notes/actions.ts` |
| RBT submit sets `isConverted` | Fail — must stay `false` until `/notes` convert |

### Common failure points (F)

| Symptom | Likely cause |
|---------|----------------|
| Note missing from Daily Workstation | `rbtSigned` false; wrong BCBA / filter; note not created |
| Note missing from `/notes` | Missing `bcbaSigned` or `parentSigned` |
| Studio submit creates orphan client | Demo `findOrCreateClient` / name mismatch — use real `clientId` |
| Session id not UUID | Demo schedule id — Bridge E scheduled session preferred |
| Double-convert | Already `isConverted` — UI *Already marked for Plutus* |

---

## Bridge G — HRM payroll payable vs hold

**Invariant (shipped):** Payable when note exists and (`bcbaSigned` **or** `isConverted`). Unsigned / missing note → hold with reason. CPT `97151` excluded.

### Code / surfaces

| Piece | Where |
|-------|--------|
| Payroll UI | HRM `/rbt/payroll` · `RbtPayrollView` — **My Payroll & Pay Holds** |
| Data | `listRbtPayrollSessions` in `apps/hrm/src/app/actions/payrollActions.ts` |
| Local Incomplete (secondary) | `RbtScheduleView` Incomplete tab + `ras_rbt_pay_holds` — do not treat as SoT over DB |

### Click path

1. After Bridge F RBT submit **before** BCBA sign: open **HRM :3001** `/rbt/payroll`.
2. Expect session under holds (not **Payable sessions**); hold reason like **Awaiting BCBA e-sign — pay held**.
3. Complete BCBA e-sign (Bridge F step 6–7).
4. Refresh payroll → row moves to **Payable sessions (BCBA signed / converted)**; summary **Approved (BCBA signed)** increases.
5. Optional: mark Plutus convert → still payable; may show **Plutus tagged**.

### DB / field checks (G)

| Condition | `payable` | Typical `holdReason` |
|-----------|-----------|----------------------|
| No `SessionNote` | false | Missing note / not submitted |
| `rbtSigned` false | false | RBT signature incomplete |
| `rbtSigned` true, `bcbaSigned` false | false | Awaiting BCBA e-sign |
| `bcbaSigned` true | true | null |
| `isConverted` true (even if used alone) | true | null |
| `cptCode = 97151` | excluded from list | — |

### Common failure points (G)

| Symptom | Likely cause |
|---------|----------------|
| Empty payroll | Wrong RBT user / impersonation fallback; session `rbtId` mismatch |
| Still held after e-sign | Hard refresh; signed different note; `rbtId` not this RBT |
| Payable without BCBA sign | Only if `isConverted` true (unusual) — check flags |
| Local Incomplete vs DB disagree | `localStorage` holds stale — trust `SessionNote` flags |
| Units look wrong | Estimated from actual/scheduled duration ÷ 15 — Studio SoT units not yet persisted |

---

## End-to-end smoke (E → F → G)

| # | App | Step | Pass criteria |
|---|-----|------|----------------|
| 1 | CRM | Job-board parent accept | RBT assigned; status **not** `ACTIVE` |
| 2 | CRM | Schedule 97153 + **Activate after first session** | `Client.status = ACTIVE` |
| 3 | HRM | Session Studio submit | `rbtSigned`; `bcbaSigned=false`; `isConverted=false` |
| 4 | HRM | Payroll | Held — awaiting BCBA |
| 5 | CRM | Daily Workstation e-sign | `bcbaSigned=true` |
| 6 | HRM | Payroll | Payable |
| 7 | CRM | `/notes` Mark sent to Plutus | `isConverted=true` |
| 8 | CRM | `/notes` before step 5 | Note absent / convert blocked |

---

## Quick reference — routes & components

| Bridge | Route | Component / action |
|--------|-------|--------------------|
| E | CRM `/client/[id]` → Scheduling & Job Board | `CaseCoordSchedulingTab`, `firstSessionActions` |
| E (neg) | Same + job board panel | `ClientJobBoardPanel`, `acceptApplicationAsParent` |
| F (RBT) | HRM `/rbt/schedule` → `/rbt/session/[id]` | `RbtScheduleView`, `RbtSessionStudio`, `sessionEmrActions` |
| F (BCBA) | CRM `/portal-clinical/daily` | `BcbaDailyWorkstation`, `sessionNoteSignActions` |
| F (Billing) | CRM `/notes` | `NotesPipelineClient`, `notes/actions` |
| G | HRM `/rbt/payroll` | `RbtPayrollView`, `payrollActions` |
