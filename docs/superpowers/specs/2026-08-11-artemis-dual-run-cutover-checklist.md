# Artemis Dual-Run → RAS-Only Cutover Checklist

**Date:** 2026-08-11  
**Status:** Operational go/no-go (ops / clinical leadership — not legal advice)  
**Product:** Rise & Shine — Simple RAS CRM + HRM  
**Spine owner:** [`2026-08-11-aba-emr-artemis-replacement-roadmap.md`](./2026-08-11-aba-emr-artemis-replacement-roadmap.md) §8  

**Related (do not duplicate):**
- Roadmap phases / capability matrix → Artemis replacement roadmap
- Note fields / Bridge F–G invariants → [`2026-08-11-aba-session-note-data-collection-spec.md`](./2026-08-11-aba-session-note-data-collection-spec.md)
- Studio build readiness → [`2026-08-11-session-studio-implementation-plan.md`](./2026-08-11-session-studio-implementation-plan.md)
- Wiring click-paths → [`2026-08-11-bridge-efg-manual-qa-checklist.md`](./2026-08-11-bridge-efg-manual-qa-checklist.md)
- Connected smoke → [`2026-08-11-connected-product-test-playbook.md`](./2026-08-11-connected-product-test-playbook.md)

**Principle:** No big-bang. Dual-run **by cohort** until RAS chart + notes pass exit criteria; then freeze Artemis writes for that cohort. Billing stays **manual Plutus tracker** through enclosed-EMR MVP (P3 EDI is not a cutover gate).

**Hard rule:** This checklist does **not** claim Artemis is replaced. Org-wide replacement is roadmap P1–P3 + D3. First success = one cohort at **D2** (RAS primary for notes/chart ops; Plutus still manual).

---

## 0. Product reality snapshot (2026-08-11)

Use this to judge go/no-go — do not invent “Artemis-grade” readiness from aspirational UI.

| Area | Reality today | Cutover implication |
|------|---------------|---------------------|
| **Bridges E–G** | **DONE** (wiring): durable first session → `ACTIVE`; BCBA `bcbaSigned` + convert → Plutus ref; payroll from signed notes | Required precondition; re-run [Bridge E–F–G QA](./2026-08-11-bridge-efg-manual-qa-checklist.md) per cohort sample |
| **Session Studio depth** | Slices **0–2 code landed** (structured submit, modalities, `billableUnits`); Slice 0 SQL must be applied in Supabase; slices **3–7** (checklist convert gate, `IN_PROGRESS`, BCBA structured summary, Plutus ref write, payroll units prefer) still open or partial | **Do not start D1** until Studio plan success criteria for claim-ready notes are green for the cohort CPT mix |
| **Chart Progress** | CRM `ClinicalChartProgressTab` — session/note history surface (light product readiness) | Helps BCBA see RAS sessions; **not** full Artemis chart replacement (graphs / programs / supervision ledger still PARTIAL/MISSING per roadmap §4) |
| **Auth units** | CRM `AuthUnitsPanel` + weekly grid — authorized vs estimated remaining (session-duration 8-min estimate) | Display OK for dual-run ops; **claim-grade unit ledger** still P2 — do not treat panel as overbill hard-stop |
| **Plutus** | Manual tracker by design (`isConverted`, optional `plutusClaimRef`) | **Stay Plutus** through cutover; EDI/clearinghouse stubs are P3-optional, not a gate |
| **SOP / Artemis strings** | CRM Build B redirected many confirm/SOP strings to RAS chart + Plutus; HRM onboarding may still track `artemisAccountSetup` | Purge remaining Artemis training strings at **D2** for the cohort; rename field when product ready |
| **Enclosed EMR** | Roadmap P0–P1 in progress; Artemis still valid clinical SoT for non-cutover caseloads | Dual-run exists **because** replacement is incomplete |

```text
Wiring (E–G)     = DONE
Notes honesty    = Studio slices + SQL + QA  →  gate for D0→D1
Chart / auth UX  = light readiness (Progress + AuthUnits)  →  helpful, not full exit
Claims           = Plutus manual  →  never block on EDI
Artemis replaced = NOT YET (org)  →  only per-cohort D2 write freeze
```

---

## How to use this doc

1. Name a **cohort** (client list + assigned RBT/BCBA IDs) and fill the header table.
2. Complete **Phase A** (dual-run readiness) before any staff leave Artemis for new DOS.
3. Advance modes **D0 → D1 → D2** (D3 is org-wide decommission, not per-pilot).
4. Check every box in the **current** mode before promoting; do not skip D1 exit for “RAS primary.”
5. When D2 exit is signed, execute **Phase B** (exit Artemis writes) for that cohort only.
6. Keep **Phase C** (rollback) printed with the cohort sheet; rehearse once before D1.
7. One copy of this checklist per cohort (duplicate or ops sheet). Do not invent PRODUCT/BUILD pages from this runbook.

| Field | Value |
|-------|-------|
| Cohort name / ID | |
| Client IDs (ACTIVE) | |
| RBT / BCBA roster | |
| Clinical owner | |
| Billing owner | |
| Eng / Studio owner | |
| Target D0 start | |
| Target D1 start | |
| Target D2 (RAS primary) | |
| Sign-off date | |
| Go / No-go (Clinical) | ☐ GO ☐ NO-GO |
| Go / No-go (Billing) | ☐ GO ☐ NO-GO |

---

## Phase A — Dual-run criteria (must pass before D1)

**Goal:** Prove RAS can own **new** session notes for the cohort while Artemis remains available for historical / fallback.

### A1 — Wiring & environment (go/no-go)

- [ ] Bridge E–F–G manual QA green on **≥1** cohort (or twin) client within 14 days of D0.
- [ ] Cohort clients **ACTIVE** via durable non-`97151` `Session` (Bridge E) — no job-board-only activation.
- [ ] RBT + BCBA assigned; Bridge G payroll path known for those staff.
- [ ] Session-note structured SQL applied in Supabase (`docs/sql/2026-08-11-session-note-structured-fields.sql`) if cohort will produce Slice 1+ notes.
- [ ] Studio plan slices required for cohort CPT mix marked done in implementation plan (minimum: claim-ready submit + sign + convert path).
- [ ] Plutus handoff owner agrees RAS-signed notes are the **packet source** for this cohort’s new DOS (manual tracker OK).
- [ ] Chart Progress + Auth units panels available on cohort client profiles (ops visibility — not a substitute for Artemis chart until P1 exit).

**NO-GO if any A1 box fails.** Stay Artemis-primary; fix product; do not start D1.

### A2 — Clinical dual-run acceptance (D0 exit → D1)

- [ ] Cohort RBTs open Session Studio for scheduled RAS `Session`s without demo-only session IDs.
- [ ] Shadow/parallel RAS drafts do not block Artemis documentation during D0.
- [ ] BCBA can review RAS drafts/queue; claim-ready only after `rbtSigned && bcbaSigned` (+ checklist when Slice 3 live).
- [ ] Open `NoteDeficiency` blocks convert (Bridge F).
- [ ] No SOP yet that abandons Artemis for the whole org — cohort-scoped language only.
- [ ] Known Studio defects logged; **zero** severity blockers for D1 listed as open.

**Promote to D1 when:** Clinical owner signs A2; Eng confirms Studio depth for cohort CPT.

### A3 — Dual-write operating rules (while in D1)

| Rule | Expectation |
|------|-------------|
| New DOS documentation | RAS Session Studio only |
| Artemis | Read historical chart; **no** new clinical notes for cohort DOS |
| Billing packet | Convert only RAS-signed notes → Plutus ref |
| Payroll | Bridge G from RAS notes for cohort sessions |
| Dual-entry incident | Log + extend D1; do not promote to D2 |
| Audit sample | **≥10** cohort notes pass internal checklist (roadmap §8.4 #10) |

---

## Modes (from roadmap §8.2)

| Mode | Who writes clinical | Typical duration | Exit (promote when…) |
|------|---------------------|------------------|----------------------|
| **D0 Shadow** | Artemis primary; RAS notes optional parallel | Pilots | Phase A1–A2 green; Studio QA for cohort |
| **D1 Dual-write** | New sessions → RAS Studio; Artemis **read-only** for historical | 2–6 weeks / cohort | BCBA + Billing accept RAS → Plutus; ≥10-note audit |
| **D2 RAS primary** | Artemis **write disabled** for cohort | Until org-wide | Phase B complete; historical PDF vault for cohort |
| **D3 Decommission** | Artemis accounts off; export archived | Final (org) | All cohorts D2+; contract exit — **not** first-cohort gate |

```text
Phase A (dual-run ready)
    → D0 Shadow → D1 Dual-write
        → Phase B (exit Artemis writes) = D2
            → Phase C only if failure
                → D3 org decommission (later)
```

---

## D0 — Shadow (Artemis still primary)

**Goal:** Prove RAS can capture notes without making Artemis read-only yet.

- [ ] Cohort RBTs can open Session Studio for scheduled RAS `Session`s.
- [ ] Optional parallel RAS note drafts do not block Artemis documentation (shadow = non-blocking).
- [ ] BCBA can see RAS drafts/queue without treating them as claim-ready yet (unless intentionally dual-signed).
- [ ] Chart Progress shows RAS sessions/notes for spot-check.
- [ ] No SOP change that tells staff to abandon Artemis **yet**.
- [ ] Studio QA / known defects logged; blockers for D1 listed.

**Promote to D1 when:** Phase A2 signed; Clinical owner signs D0 exit.

---

## D1 — Dual-write / RAS notes for new sessions

**Goal:** New clinical documentation for the cohort lives in RAS; Artemis is historical read for that caseload.

### Session delivery (HRM)

- [ ] New therapy sessions for cohort clients are scheduled/completed as RAS `Session` rows.
- [ ] RBTs complete notes in Session Studio (not Artemis) for those sessions.
- [ ] Caregiver / RBT sign paths used as designed; drafts do not convert.
- [ ] ACTIVE clients do not rely on Studio **demo** targets for claim-ready notes (real `SkillTarget` / `BehaviorTarget` or explicit clinical exception).

### Clinical chart / co-sign (CRM)

- [ ] BCBA co-sign queue used **exclusively** for cohort notes (no Artemis co-sign as SoT for new DOS).
- [ ] Open `NoteDeficiency` blocks claim-ready / convert (Bridge F invariant).
- [ ] Structured summary / checklist visible for sign-off when Slice 5+ shipped; otherwise document interim prose+checklist SOP.
- [ ] Chart Progress used for caseload visibility; Auth units panel checked before heavy scheduling (estimate only until P2 ledger).

### Billing / payroll

- [ ] Billing converts **only** RAS-signed notes (`rbtSigned && bcbaSigned`, checklist pass when gated → `isConverted` + Plutus ref).
- [ ] No Plutus packet sourced from Artemis documentation for this cohort’s **new** dates of service.
- [ ] Payroll / Bridge G uses RAS notes for cohort sessions.
- [ ] EDI / clearinghouse UI **not** used as production path (Plutus manual).

### Ops hygiene (D1)

- [ ] Artemis access for cohort staff limited to **read** historical chart (writes discouraged / monitored).
- [ ] Dual-entry incidents logged; if staff still write Artemis notes for new DOS → fail — extend D1, do not promote.
- [ ] Sample audit: **≥10** cohort notes pass internal checklist (roadmap §8.4 #10).

**Promote to D2 when:** Clinical + Billing owners accept RAS → Plutus for the cohort; audit sample signed; Phase B freeze plan scheduled.

---

## Phase B — Exit Artemis criteria (D2 write freeze)

**Goal:** Artemis is not a write path for this cohort; RAS is clinical SoT for **ongoing** care. Artemis is still **not** org-replaced.

### Freeze Artemis writes (execute in order)

- [ ] Confirm D1 exit signed (above) + Phase A still true (no regression on E–G / Studio).
- [ ] Remove / disable Artemis **write** access for cohort RBTs and BCBAs (vendor admin or credential revoke).
- [ ] Communicate cutover window to cohort staff (date/time, who to call, RAS-only rule).
- [ ] Spot-check: attempt to document a new session in Artemis fails or is policy-blocked; RAS path still works.
- [ ] Update SOP / UI copy for cohort workflows: Clinical Support, RBT tasks, onboarding — no “confirm / schedule / finalize in Artemis” for these clients.
- [ ] Track rename/retire of `RbtOnboarding.artemisAccountSetup` → RAS clinical EMR access (product change when ready; do not leave training on Artemis setup for cutover cohorts).

### Historical close-out (cohort)

- [ ] Historical Artemis PDFs / exports attached under client Documents (vault) for cohort clients.
- [ ] Auths / PA totals entered in RAS `Authorization` / `PARequest` (or CSV); AuthUnits panel reflects windows (estimate burn-down OK).
- [ ] Programs/targets present as real `SkillTarget` / `BehaviorTarget` (no demo targets for ACTIVE cohort clients).
- [ ] Staff map complete: Artemis users → `User` (+ credentials as needed for later P2).

**D2 exit (cohort):** Clinical leadership: “We operate this caseload’s **new** documentation enclosed in RAS.” Billing still Plutus manual. Artemis write remains off for the cohort. **Do not** announce org-wide Artemis replacement.

---

## Phase C — Rollback

Use when D1 audit fails, RAS outage blocks care, or D2 freeze was premature.

| Trigger | Action | Owner |
|---------|--------|-------|
| D1 audit fails (≥10 sample or checklist) | Stay on D1; Artemis read OK; fix RAS defects; re-run sample | Clinical + Eng |
| Dual-entry / staff still writing Artemis for new DOS | Extend D1; retrain; do **not** promote to D2 | Clinical ops |
| RAS outage during D2 | Temporary Artemis write = **named exception** only: DOS list, expiry, re-import/reconcile into RAS before closing | Clinical + Billing + IT |
| Billing packet mix (Artemis + RAS same DOS) | Halt convert; reconcile before Plutus file | Billing |
| Accidental D2 write re-enable | Written Clinical + Billing decision required; treat as new dual-run | Leadership |

### Rollback checklist

- [ ] **Do not** re-enable Artemis writes casually after D2 without Clinical + Billing written decision.
- [ ] If D1 audit fails: stay on D1; Artemis read OK; fix RAS defects; re-run 10-note sample.
- [ ] If RAS outage during D2: temporary Artemis write requires named exception, DOS list, and re-import/reconcile plan into RAS before closing the exception.
- [ ] Never convert Plutus from mixed Artemis+RAS notes for the same DOS without Billing reconciliation.
- [ ] After rollback, re-enter at the correct mode (usually D1); do not jump to D2.

---

## D3 — Decommission (org-wide — after all cohorts at D2)

Do **not** run D3 for a single pilot. Use when every active caseload is D2+.

- [ ] All remaining cohorts at D2 exit.
- [ ] Full Artemis export archived (contract / retention SOP with counsel).
- [ ] Artemis accounts disabled org-wide.
- [ ] Contract exit / vendor offboarding checklist complete.
- [ ] Residual Artemis strings purged from product + SOP.

**Until D3 is signed, Artemis is not replaced** — only frozen for cutover cohorts.

---

## Per-cohort gate summary (roadmap §8.4)

Single-page sign-off; details live in Phase A–C / D0–D2 above.

| # | Gate | Owner | Done |
|---|------|-------|------|
| 1 | Cohort clients ACTIVE with durable `Session` path (Bridge E) | Case Coord / Clinical | [ ] |
| 2 | Studio SoT depth live for notes this cohort produces (+ SQL applied) | Eng / Clinical | [ ] |
| 3 | BCBA co-sign queue exclusive for cohort notes | BCBA lead | [ ] |
| 4 | Billing converts only RAS-signed notes → Plutus ref (manual) | Billing | [ ] |
| 5 | Payroll uses Bridge G from RAS notes | HR / Payroll | [ ] |
| 6 | Artemis write access removed for cohort RBT/BCBA (Phase B) | Ops / IT | [ ] |
| 7 | SOP copy updated (no Artemis strings for cohort) | Clinical ops | [ ] |
| 8 | `artemisAccountSetup` retired/renamed plan executed or scheduled | Eng / HR | [ ] |
| 9 | Historical Artemis PDFs under Documents | Clinical / CC | [ ] |
| 10 | Audit sample ≥10 notes + compliance sign-off as needed | Clinical + Billing (+ counsel if required) | [ ] |

**Light product (helpful, not sole gate):** Chart Progress + Auth units panels reviewed for cohort clients.

---

## Explicit non-blockers

| Item | Why not a cutover gate |
|------|------------------------|
| P3 claims / EDI / clearinghouse | Plutus files claims through P2 |
| Full structured historical note parse | PDF vault first |
| Claim-grade auth unit ledger | AuthUnits display is enough for dual-run ops; ledger is P2 |
| Full progress graphs / Artemis-parity chart | Chart Progress is light readiness; P1 roadmap owns enclosed chart MVP |
| Parent app beyond magic-link | P2+ |
| AI note drafting | Convenience, not SoT |
| Motivity `/rbt/simulation` | Unrelated to Artemis note SoT |
| Org-wide Artemis contract exit | D3 only — after all cohorts |

---

## Index pointers

- `docs/README.md` — specs table  
- `docs/ARCHITECTURE.md` — Artemis dual-run checklist link  
- CRM DevTools (gated `NEXT_PUBLIC_ENABLE_DEV_TOOLS`) — Dual-run readiness doc path  
- `.agents/skills/crm-app-map` / `hrm-app-map` — Also see one-liners  
