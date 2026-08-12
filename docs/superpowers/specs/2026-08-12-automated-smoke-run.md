# Automated Connected-Product Smoke Run

**Date:** 2026-08-12 (~03:47–04:30 ET)
**Runner:** Automated browser agent (Playwright/Chromium, headless) against local dev.
**Playbook:** [`2026-08-11-connected-product-test-playbook.md`](./2026-08-11-connected-product-test-playbook.md)
**Environment:** CRM `:3000`, HRM `:3001`, shared dev Supabase DB. `NEXT_PUBLIC_ENABLE_DEV_TOOLS=true`.

> **Live-edit caveat (honest):** Five sibling agents were editing code (billing/convert, logging/health, middleware/proxy, login actions, skills docs) **during** this run, and the dev servers hot-reloaded under the browser. Several failures below are the environment mutating mid-run, not necessarily stable product defects. Where a page errored, it was retried once (per instructions). Observed live-edit artifacts: CRM `middleware.ts` was deleted/recompiled mid-run; a transient React `"Rendered more hooks than during the previous render"` crash on HRM `/rbt`; a new CORS/404 on `GET http://localhost:3000/api/health` (cross-origin from `:3001`).

---

## Executive summary

**Playbook steps (16):** **2 PASS · 1 FAIL · 13 SKIPPED**
**Environment / entry-point checks (3):** **2 PASS · 1 FAIL**
**HRM Studio sub-flow checkpoints driven (9):** **9 PASS** (these substantiate the step-12 evaluation)

**Overall automatable coverage:** The **HRM RBT side is fully drivable without login** (applicant/`/rbt/*` paths are open in dev), and I drove it end-to-end: DevTools role impersonation → RBT schedule → EVV Start → Session Studio (clock-in → collect → note → sign) → close-incomplete → payroll hold. The **entire CRM side is blocked behind Supabase login** — dev-tools impersonation cookies do **not** bypass CRM middleware — so every CRM-authenticated playbook step (intake, case coord, marketplace post/assign, first-session schedule/activate, BCBA e-sign, `/notes` Plutus mark) is **SKIPPED**, recorded honestly as un-automatable without real credentials.

**Most important failure:** The HRM DevTools **"Seed Studio→payroll (ACTIVE + session)"** action — the primary entry point of the playbook's primary path — now returns the toast **"Failed to seed demo client."** It **succeeded on the first invocation** of this session (it created a persistent ACTIVE "Demo Studio Learner" + a scheduled 97153 session that I then used for the whole Studio run), then **regressed mid-run**, consistent with the sibling agents editing billing/convert/actions live. The seeded data persisted, so I completed the rest of the flow by impersonating the seeded RBT ("David Miller") via DevTools → Active Users instead of re-seeding.

**Second failure:** Studio **"Submit claim-ready"** is **unreachable via the seed** — the seeded client has **no CRM-synced SkillTargets/Clinical Goals**, so the Studio shows "No SkillTargets yet", the claim-ready button stays disabled, and only **"Close incomplete"** (payroll hold) can be submitted. This is the documented demo-target gate (`Demo · claim-ready blocked`), so it is **blocked-by-design**, not obviously a code regression — but it means the playbook's step-12 expected outcome (`rbtSigned=true, bcbaSigned=false, isConverted=false` via a claim-ready note) was **not achievable** in this environment.

---

## Environment / entry-point checks

| # | Check | Result | Notes |
|---|-------|--------|-------|
| P1 | CRM `:3000` & HRM `:3001` reachable | **PASS** | HRM was already running (external pid). **CRM was down** at start — I started it (`npm run dev:crm`, "Ready in ~1.9s"). Both intermittently timed out mid-run during hot-recompiles, then recovered. |
| P2 | HRM DevTools panel present on public `/rbt` | **PASS** | `button[title="Developer Tools"]` renders; Seed + role-impersonation controls available (HRM DevTools lives in `HrmLayoutWrapper`, so it shows on applicant/`/rbt/*` pages). |
| P3 | DevTools **Seed Studio→payroll (ACTIVE + session)** | **FAIL (regressed mid-run)** | First call this session **succeeded** → created ACTIVE "Demo Studio Learner" + scheduled 97153 (persisted). Subsequent calls return toast **"Failed to seed demo client."** (server action returned `success:false`; HTTP 200). |

CRM DevTools (`DevToolsWrapper`) only mount inside the protected `(dashboard)` layout, so they are unreachable until a real CRM login exists — they cannot be used to bypass CRM auth.

---

## Playbook walkthrough — per step

### A. Intake → authorized → staffing-ready (CRM :3000)

| Step | Description | Result | Evidence / reason |
|------|-------------|--------|-------------------|
| 1 | Create/open inquiry, send magic link | **SKIPPED** | CRM auth block. `GET /portal-*`, `/notes`, `/client/*` → **307 → `/login?next=…`** even with `dev_impersonate_role` cookie set. Magic-link parent portal is public but needs a token; the seed (which mints the token) is currently failing (P3). |
| 2 | Parent submits docs → Intake approve → Clinical review | **SKIPPED** | CRM auth block. |
| 3 | Billing: VOB + Assessment PA | **SKIPPED** | CRM auth block. |
| 4 | BCBA: assessment / TP / parent sign / report | **SKIPPED** | CRM auth block. |
| 5 | Billing: Treatment PA submit/approve | **SKIPPED** | CRM auth block. |
| 6 | Case Coord: handoff → `STAFFING_PENDING`, assign BCBA | **SKIPPED** | CRM auth block. |

### B. Job board staffing (CRM ↔ HRM)

| Step | App | Description | Result | Evidence / reason |
|------|-----|-------------|--------|-------------------|
| 7 | CRM | Post/open `CaseOpening` on client Scheduling & Job Board | **SKIPPED** | CRM auth block (`/portal-case-coord/openings` → 307 `/login`). |
| 8 | HRM | Hired RBT → `/rbt/job-board` → apply | **SKIPPED (page reachable, apply not driven)** | `/rbt/job-board` renders as impersonated RBT (screenshot captured); I did not complete an application because there was no CRM-posted opening to apply to (step 7 blocked). |
| 9 | CRM | Parent likes → assign | **SKIPPED** | CRM auth block. |

### C. First session → ACTIVE (Bridge E, CRM)

| Step | App | Description | Result | Evidence / reason |
|------|-----|-------------|--------|-------------------|
| 10 | CRM | Schedule therapy session (97153) | **SKIPPED (CRM UI)** | CRM auth block. Equivalent state was produced out-of-band by the seed: a durable `Session` (97153, "12 - Home") appeared on the HRM schedule. |
| 11 | CRM | Activate after first session | **SKIPPED (CRM UI)** | CRM auth block. The seed sets `Client.status = ACTIVE` directly (client showed as ACTIVE with a live schedule). |

### D. Studio note → BCBA → Plutus → payroll (Bridges F–G)

| Step | App | Description | Result | Evidence / reason |
|------|-----|-------------|--------|-------------------|
| 12 | HRM | `/rbt/schedule` → EVV Start → `/rbt/session/[id]` → complete Studio → **claim-ready submit** | **FAIL** | Studio fully drivable (see sub-flow below), **but claim-ready submit is blocked**: seeded client has **no CRM SkillTargets** → "No SkillTargets yet" → "Submit claim-ready" **disabled**. Only **"Close incomplete"** succeeded (redirect to `/rbt/schedule?tab=INCOMPLETE`). Expected `rbtSigned` claim-ready note was **not** produced. |
| 13 | HRM | `/rbt/payroll` → session held | **PASS** | Bridge G payroll renders with real DB flags. The worked session appears under **"Roadblocks holding your pay"** — `$28.00 held`, "Session in progress / incomplete — note not submitted", flags NOTE/RBT SIGNED/BCBA SIGNED/CONVERTED all unset. |
| 14 | CRM | `/portal-clinical/daily` → E-Sign Note | **SKIPPED** | CRM auth block (`/portal-clinical/daily` → 307 `/login`). |
| 15 | HRM | Refresh `/rbt/payroll` → Payable | **PASS (observed, not driven this run)** | Payroll already lists **PAYABLE / PLUTUS TAGGED** sessions ("Demo Studio Learner" 97153 1u $7.00 and "Leo Miller") with **RBT SIGNED + BCBA SIGNED + CONVERTED** from a prior loop — proving the Bridge G payable state functions — but I could **not** drive the held→payable transition myself because step 14 (BCBA e-sign) is CRM-gated. |
| 16 | CRM | `/notes` → Mark sent to Plutus | **SKIPPED** | CRM auth block (`/notes` → 307 `/login`). "PLUTUS TAGGED / CONVERTED" badges visible in payroll show the convert state exists in DB from prior runs. |

### HRM Studio sub-flow (drives the step-12 evaluation) — all PASS

| Checkpoint | Result | Evidence |
|-----------|--------|----------|
| Impersonate seeded RBT (DevTools → Active Users → "David Miller") | **PASS** | Header shows "David Miller, RBT · RBT ACTIVE"; lands on `/rbt/schedule`. |
| Schedule shows seeded session | **PASS** | Wed Aug 12 card "Demo Studio Learner · CONFIRMED · 97153 · 12 - Home · EVV Start Session". |
| EVV Start → Session Studio opens | **PASS** | Navigated to `/rbt/session/1ffe5c8f-…`; Studio header "Session Studio · CPT 97153". |
| Clock-in (logistics: POS/CPT/caregiver → Start EVV) | **PASS** | Session flips to `IN_PROGRESS` (payroll hold reason changed "scheduled" → "in progress / incomplete"). |
| Collect objective data | **PASS** | With **Dev demo targets** loaded + active target "Mand: request preferred item…", DTT trials logged and billable units ≥ 1 (8-min rule) accrued. Without demo targets: **blocked** ("No SkillTargets yet — payers require objective data"). |
| Advance to 97153 Note | **PASS** | Note builder reached; structured fields fillable. |
| Sign & attest | **PASS** | RBT + caregiver signature fields fillable. |
| Submit — claim-ready vs incomplete | **PASS (close-incomplete)** | "Submit claim-ready" **disabled** (demo-target gate); "Close incomplete" succeeded → held. |
| `/rbt/payroll` render | **PASS** | Bridge G "current pay period (DB)": GROSS / HELD / APPROVED (BCBA signed) / payable list / roadblocks. |

---

## Root-cause notes (report only — nothing fixed)

1. **CRM is uniformly login-gated for automation.** `apps/crm` middleware calls `supabase.auth.getUser()` and 307-redirects every protected path to `/login` when there is no Supabase session. The `dev_impersonate_*` cookies are read by `getCurrentUser()` **after** the middleware, so they let a *logged-in* user switch roles but do **not** create a session — they cannot get an automated browser past the CRM gate. Login itself needs real Supabase credentials (none available) and now has rate-limiting on `login/actions.ts`, so repeated password attempts were deliberately avoided. → All CRM steps SKIPPED.
2. **HRM is open for the RBT/applicant surface in dev.** `apps/hrm` proxy allows `/rbt/*` without a session when `NEXT_PUBLIC_ENABLE_DEV_TOOLS=true` and non-prod. This is what made the entire Studio→payroll HRM path automatable.
3. **Seed action regressed mid-run.** `devSeedConnectedProductDemo` returned success on first use, then "Failed to seed demo client." on all later calls (no console error, server action HTTP 200 with `success:false`). Coincides with live edits to billing/convert/action files. Worked around via DevTools RBT impersonation on the already-seeded data.
4. **Claim-ready needs CRM Clinical Goals sync.** The seed creates an ACTIVE client + 97153 session but no `SkillTarget`s, so Studio claim-ready is gated. This is expected per the Studio "demo targets can't submit claim-ready" design, but it blocks a seed-only claim-ready demonstration of step 12.

---

## Artifacts

Screenshots captured to a scratch dir (outside the repo, per the "no code writes" constraint):
`%TEMP%\ras-smoke\shots\` — key frames: `01-crm-login`, `02-crm-portal-redirect`, `03-hrm-rbt-landing`, `12-hrm-schedule` (seeded 97153 session), `41-studio-clockin`, `43-collected` (demo targets + active target), `45-sign`, `46-closed-incomplete`, `47-payroll` (Bridge G holds + payable list).

Key visual observations:
- **CRM login** renders cleanly (Rise & Shine HRM & CRM employee sign-in); protected routes bounce to `/login?next=…`.
- **HRM RBT schedule** shows the seeded "Demo Studio Learner" 97153 session with a green "EVV Start Session" CTA.
- **Session Studio** audit checklist reads "4/13 … NOT BILLABLE YET"; the claim-ready blocker is the missing SkillTargets, not the note fields.
- **Payroll** shows GROSS $7.00 / HELD $28.00 / APPROVED (BCBA signed) $7.00, a payable Plutus-tagged converted session, and the current worked session under roadblocks ("No SessionNote on file — complete Session Studio to unlock payroll review").

---

## Focused rerun — 2026-08-12 05:19 ET

The DevTools Studio seed regression and missing-target blocker were retested after the fix. This addendum supersedes only the original P3 and seed-target findings; the rest of the smoke report remains historical.

- **PASS — two consecutive browser seeds:** both returned the same demo client (`56b64754-ed58-4dab-b8f4-5700893a02a0`), close-incomplete session (`8ff565ae-2497-5387-96df-bb2f53fa0345`), and separate claim-ready session (`3a269668-8abd-54b4-89f7-2ff35a2b83e0`).
- **PASS — QA snapshot after each seed:** `demoClientId`, `demoIncompleteSessionId`, and `demoClaimReadySessionId` matched the seed result on both runs.
- **PASS — Studio target load after each seed:** Studio received two durable UUID `SkillTarget`s (`d8dbda4f-55a8-5b95-b57a-425d15350f73`, `f3bc613e-928c-5618-96fb-1f5c1b5aaa05`) and one UUID `BehaviorTarget` (`fa2a7996-fe30-5326-b889-b2772bd334c1`). The Collect view rendered both `[DEMO]` skill labels and reported `2 SkillTargets`; the durable-target checklist passed instead of activating the placeholder demo-target block.
- **PASS — verification:** `npm run typecheck`; `npm test` (50 files, 529 tests).
