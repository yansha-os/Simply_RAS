# Production-Readiness Gap Analysis — Simple RAS CRM + HRM

**Date:** 2026-08-12
**Status:** Point-in-time readiness audit (product / engineering — not legal advice)
**Product:** Rise & Shine — Simple RAS CRM (`:3000`) + HRM (`:3001`), one shared Supabase Postgres
**Method:** Static audit — ran both app typechecks, read schema/SQL/specs/auth/billing/bridge code. Live DB **not** queried (session-pooler only); "applied" states must be confirmed in Supabase.

**Read with (do not duplicate — this doc links out):**
- Spine sequencing → [`2026-08-11-aba-crm-hrm-spine-roadmap.md`](./2026-08-11-aba-crm-hrm-spine-roadmap.md)
- Clinical note SoT → [`2026-08-11-aba-session-note-data-collection-spec.md`](./2026-08-11-aba-session-note-data-collection-spec.md)
- Studio slices → [`2026-08-11-session-studio-implementation-plan.md`](./2026-08-11-session-studio-implementation-plan.md)
- Enclosed EMR / Artemis replacement → [`2026-08-11-aba-emr-artemis-replacement-roadmap.md`](./2026-08-11-aba-emr-artemis-replacement-roadmap.md)
- Cohort cutover go/no-go → [`2026-08-11-ras-sandbox-cutover-checklist.md`](./2026-08-11-ras-sandbox-cutover-checklist.md)
- Connected smoke → [`2026-08-11-connected-product-test-playbook.md`](./2026-08-11-connected-product-test-playbook.md)
- SQL index → [`docs/sql/README.md`](../../sql/README.md) · Env stub → [`docs/ENV.md`](../../ENV.md)

---

## 1. Executive summary

The connected product **works end-to-end as a wiring skeleton**: intake → PA → Case Coord → staffing marketplace → first-session activation (Bridge E) → RBT Session Studio note → BCBA co-sign (Bridge F) → manual Plutus tracker → payroll (Bridge G). Both apps **typecheck clean** (`tsc --noEmit` exit 0 for CRM and HRM), schema is mirrored across both `schema.prisma` copies, and Prisma client generates. Claim-ready gating in Session Studio is **real** (server + client `evaluateClaimReady`, demo-target hard-block).

It is **not production-ready** for a live clinical caseload today. The honest ceiling right now is a **per-cohort dual-run beta** (Artemis stays clinical SoT for everyone else) — exactly what the dual-run checklist scopes. Blockers cluster in five places: (1) **authorization is not enforced where data mutates** — most CRM dashboard/`intake`/magic-link server actions and HRM Session Studio/EMR/payroll actions have no `requireRole`/session check → PHI IDOR; (2) **PHI at rest is world-readable** — uploads land in `public/uploads/`, plus applicant-session cookie forgery; (3) **schema/DDL drift** — code references columns/models whose SQL may be unapplied; (4) **demo/mocks not quarantined** — duplicate CRM `/rbt/*` stack, mounted mock KPI surfaces (Payroll/HR analytics), a legacy CRM EMR path that auto-converts notes, plus 15+ orphaned prototype dashboards; (5) **zero automated tests + unverified production build**.

**Do not claim** Artemis is replaced (only per-cohort D2 write-freeze is achievable) or that Plutus files claims (it is a **manual internal tracker**; EDI 837/835 is an explicit stub).

---

## 2. Production-readiness scorecard

RAG: 🟢 ready for scope · 🟡 works but has real gaps · 🔴 blocker(s) before any live PHI.

| Domain | RAG | State (evidence) | Worst gap |
|--------|-----|------------------|-----------|
| Build / typecheck | 🟡 | CRM + HRM `tsc --noEmit` **pass** (exit 0). CI runs lint (non-blocking) + typecheck. `next build` not run here. | No verified prod build; ESLint debt hidden by `continue-on-error` |
| Automated testing | 🔴 | **Zero** `*.test/*.spec` files in repo. CI has no test step. | No regression net for clinical/billing/bridge logic |
| Data / schema / migrations | 🔴 | 2 `schema.prisma` copies in sync; 3 `docs/sql/` scripts are the required-but-unverified apply set; `StaffMessage` model referenced by code has **no DDL of record**. | Unapplied DDL → runtime failures on core paths |
| Auth & security | 🔴 | Supabase password login solid; impersonation **server-gated** by `NODE_ENV`. But server actions largely **unguarded**, PHI uploads served from `public/`, applicant cookie forgery, no magic-link expiry. | Systemic IDOR on PHI; middleware is a redirect, not an auth boundary |
| Clinical EMR (Artemis replacement) | 🔴 | Bridges E–G wired; Studio slices **0–2 landed, 3–8 open/partial**; chart modules mostly PARTIAL/MISSING; claim-ready gate real. | Not enclosed SoT org-wide; only cohort dual-run |
| Billing (Plutus manual) | 🟡 | Manual tracker is real (`isConverted`, `plutusClaimRef`, `convertedAt`); weekly units + `calculateBillingUnits` real; EDI 837/835 labeled **stubs**; `ClaimsDenialAppealCompiler` is orphan mock. | Auth-unit ledger display-only; "Clearinghouse" naming vs reality |
| Bridges E–G | 🟡 | HRM Studio → CRM sign → convert → HRM payroll wiring DONE. | **Legacy CRM `/portal-hr/session-emr` auto-sets `isConverted`** (bypasses F/G); RBT identity fallbacks; `localStorage` holds; payroll estimate-only |
| Cross-app integration | 🔴 | Shared DB + `Notification` rows work for data. | Cross-app `revalidatePath` calls are **no-ops**; notification bell uses **relative links → 404 across apps**; no clinic timezone policy |
| Demo / mock quarantine | 🔴 | `mock-user-id` env-gated; claim-ready demo-block real. But **duplicate CRM `/rbt/*` stack** (localStorage), **mounted mock KPI surfaces** (PayrollBenefitsView, HrAgentAnalyticsView), `submitMagicLinkPacket` auto-completes all docs, 15+ orphan dashboards, `==DEBUG==` logs. | Mock data reachable in prod routing; demo adjacent to PHI |
| Ops / deploy | 🟡 | Two Next apps, shared session-pooler DB. `docs/ENV.md` is a TODO stub. | No documented env set, monitoring, logging, or backup/rollback |
| Accessibility / perf / UX | 🟡 | Premium UI directives enforced; HRM server actions allow **200mb** upload bodies. | No a11y/perf budgets; large-upload DoS surface |

---

## 3. Prioritized gap list (Blockers first)

Severity: **Blocker** (no live PHI until closed) · **High** · **Medium** · **Low**. Owner-area in brackets.

### Blockers

0a. **Server actions do not enforce authorization (PHI IDOR).** `[Security]`
   Middleware only redirects; Server Actions bypass it. Most CRM `(dashboard)/**/actions.ts`, `app/actions/intake.ts`, `magic-link/actions.ts`, and HRM `sessionEmrActions.ts` / `payrollActions.ts` accept `clientId`/`packetId`/`userId` with **no `requireRole` or session/ownership check**. `getNotifications(userId?)` / `markNotificationAsRead` are IDOR-able. Anyone who knows/guesses a UUID can read or mutate PHI.
   **Action:** Add a per-portal auth wrapper (`requireRole` + resource-scoped ownership) to every mutation/PHI read; gate magic-link mutations on token + device fingerprint. Highest-effort, highest-priority item.

0b. **PHI written to `public/` + applicant cookie forgery.** `[Security]`
   `apps/crm/src/app/api/upload/route.ts` stores uploads under `public/uploads/` (world-readable at `/uploads/{name}`), authorizes on magic-link token **alone** (no device proof), and trusts client MIME. `resolveApplicantId()` (`onboardingSignatureActions.ts`) returns `{ ok: true }` when the fingerprint cookie is **absent** → an attacker can set `ras_device_session_token` to a victim UUID.
   **Action:** Move uploads to private Supabase Storage/S3 with signed URLs + `clientId` path isolation + magic-byte check; always require a valid `(candidateId, fingerprint, revokedAt IS NULL)` session row.

0c. **Legacy CRM EMR path auto-converts notes (bypasses Bridge F/G).** `[Clinical/Bridges]`
   `apps/crm/src/app/actions/sessionEmrActions.ts` (wired from `/portal-hr/session-emr`) can pick the first active RBT, auto-create a client, and set **`isConverted: true` immediately** — skipping BCBA sign and the convert gate, corrupting billing/payroll integrity.
   **Action:** Delete/guard the legacy action; redirect `/portal-hr/session-emr` to HRM Session Studio (the real path). All live sessions go through `RbtSessionStudio` only.

1. **Unapplied `docs/sql/` DDL vs. code expectations.** `[Data]`
   `prisma/schema.prisma` (both copies) and app code reference `SessionNote.structuredContent/checklistSnapshot/billableUnits/…SignedAt/…SignerName/plutusClaimRef/convertedAt`, `Session.placeOfServiceCode`, `SessionStatus.IN_PROGRESS`, and `CaseOpening`/`CaseApplication` + listing-enrichment columns. These live only in the 3 `docs/sql/` scripts. If not pasted into Supabase, Studio submit / marketplace / notes convert **fail at runtime**.
   **Action:** Confirm in Supabase (or apply, in order) the three scripts in §5; then `prisma generate`. Track applied-state somewhere durable.

2. **`StaffMessage` table has no migration of record.** `[Data]`
   Model exists in `schema.prisma` and is used by `apps/crm/src/app/actions/chat.ts`, `apps/*/actions/staffCommunicationActions.ts`, and `caseOpeningActions.ts`, but no `prisma/migrations/*` or `docs/sql/*` creates it. Staff chat / case-coord messaging will 500 if the table is absent.
   **Action:** Verify the table exists in the live DB; if not, add `docs/sql/2026-08-12-staff-message.sql` and apply. Either way, record its provenance.

3. **Demo/mocks reachable in production routing.** `[Demo / Clinical]`
   Beyond env-gated impersonation: a **duplicate CRM `/rbt/*` stack** persists onboarding state in `localStorage` (parallel to HRM's DB flow); **mounted** HRM mock KPI surfaces `PayrollBenefitsView` (`/payroll`, fake $48,250 spend/staff table) and `HrAgentAnalyticsView` (`/hr-dashboard`, fake interview rows) present fabricated numbers as real; `submitMagicLinkPacket` (`apps/crm/src/app/magic-link/actions.ts`) is a prototype that marks **all** intake docs complete. Studio demo targets are correctly hard-blocked from claim-ready.
   **Action:** Redirect/delete CRM `/rbt/*` (mirror the `/portal-hr` redirect); wire or hide the mock KPI routes; replace `submitMagicLinkPacket` with field-level validation; assert no demo targets/mock IDs on ACTIVE clients.

4. **No automated tests + unverified production build.** `[Testing / Build]`
   Zero test files; CI only lints (non-blocking) and typechecks. `next build` for both apps has not been verified green here.
   **Action:** Add a `next build` step to CI (blocking) and a minimal smoke/unit layer over Bridge E–G invariants, billing-unit math, and status gates (§Path Phase 0).

5. **Verify production env locks dev-tools off.** `[Security / Ops]`
   Impersonation is safe **only** when `NODE_ENV==='production'` OR the public flag is unset. A misconfigured staging/preview (`NEXT_PUBLIC_ENABLE_DEV_TOOLS=true`, non-prod NODE_ENV) exposes password-less impersonation over real data.
   **Action:** In every deployed env, set `NODE_ENV=production` and ensure `NEXT_PUBLIC_ENABLE_DEV_TOOLS` is unset/false; add a boot-time assertion.

### High

6. **15+ orphaned prototype dashboards + dead CRM trees.** `[CRM]` Never-imported sample-data components (`FinancialRcmAnalyticsDashboard`, `ExecutiveBiCockpit`, `ParentPortalDashboard`, `ReAuthCompilerDashboard`, `MockInsuranceAuditSimulator`, `ClaimsDenialAppealCompiler`, `TelehealthSupervisionRoom`, `IntelligentSchedulingCalendar`, `MultiClinicOperationsHub`, `BacbSupervisionTracker`, `CredentialingHardLockMatrix`, `RbtDeidentifiedSessionView`, etc.), plus dead `apps/crm/src/components/hrm/*` + `portal-hr/*` (redirected) and unused `HrmLayoutWrapper`. **Action:** Delete or dev-gate; reduces accidental-import risk.
7. **No magic-link expiry / revocation.** `[Security]` Parent (`IntakePacket`) and applicant (`CandidateOnboardingPacket`) tokens are UUIDs with no `expiresAt`/`revokedAt`; leak = durable access. **Action:** Add expiry + revoke + staff "reset link" flow; enforce in page + actions.
8. **Notification deep links break across apps.** `[Integration]` Both bells render `item.linkUrl` as **relative** paths; RBT links (`/rbt/*`) 404 in CRM, CRM links (`/portal-clinical`, `/notes`) 404 in HRM. **Action:** Prefix cross-app links with `NEXT_PUBLIC_HRM_URL`/`NEXT_PUBLIC_CRM_URL` (pattern already in `atsActions.ts`).
9. **Cross-app `revalidatePath` calls are no-ops.** `[Integration]` HRM actions revalidate CRM routes (and vice-versa) across separate Next servers — silently ineffective. **Action:** Remove cross-app revalidates; rely on `force-dynamic`/client refresh/polling (already done on some surfaces) and document.
10. **RBT identity fallbacks.** `[HRM/Bridges]` `resolveActingRbt` falls back to demo "David Miller" / first active RBT; `RbtSessionStudio` doesn't pass `rbtUserId`; `findOrCreateClient` can auto-create clients. **Action:** Disable demo fallbacks in prod; require explicit `User.id`/`clientId` UUIDs; reject submit on mismatch with `Session.rbtId`.
11. **`docs/ENV.md` is an empty TODO.** `[Ops]` **Action:** Fill env names (no secrets): `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_HRM_URL`, `NEXT_PUBLIC_CRM_URL`, `NEXT_PUBLIC_ENABLE_DEV_TOOLS`, server-only `SUPABASE_SERVICE_ROLE_KEY`.
12. **No PHI access/audit logging + unguarded service-role.** `[Shared]` `AuditLogVault` unwired; `createAdminClient()` (service role, RLS bypass) is called from server actions that lack `requireRole`. **Action:** Wire audit on view/sign/convert/export; guard every admin-client call site.
13. **`/api/generate-report` lacks role/ownership check.** `[Security]` Handler only checks a user exists. **Action:** Add `requireRole` + client-assignment check.
14. **Clinical Studio slices 3–8 open.** `[Clinical]` Checklist convert-gate, `IN_PROGRESS` lifecycle, BCBA structured-summary parity, Plutus-ref write, payroll unit preference, PHI-safe logging (see Studio plan §3). **Action:** Complete required slices for the beta cohort's CPT mix before D1.
15. **Auth-unit ledger is display-only.** `[Billing]` No hard overbill stop. **Action:** Ops visibility for dual-run; claim-grade ledger is P2 before scaling billing.

### Medium

16. **No clinic timezone policy.** `[Integration/Billing]` No `America/New_York`/`date-fns-tz` usage; week grids + auth windows + scheduling use runtime-local TZ → SSR-UTC vs EST boundary drift. **Action:** Pin clinic TZ in billing/scheduling helpers. *(Done 2026-08-12: Intl-only `src/lib/clinicTimezone.ts` in both apps pins `America/New_York`; week boundaries (`weeklyBillableUnits.ts`), auth windows (`authUnits.ts` `inWindow`/active/expired), and the HRM `RbtScheduleView` week grid all consume it. TZ-explicit vitest boundary tests pass under ET, UTC, and UTC+14 — see secondary-weakness audit H5.)*
17. **`DevToolsWrapper` (CRM) checks only the public flag, not `NODE_ENV`.** `[Security]` Runs `prisma.user.findMany` every render even in prod if flag mis-set (UI still hidden). **Action:** Add `NODE_ENV !== 'production'` to the wrapper; add CI guard forbidding the flag in prod.
18. **Dev login email-pattern bypass + no MFA/rate-limit.** `[Security]` Non-prod email bypass skips Supabase; Supabase placeholder creds used when env missing. **Action:** Require real sign-in before redirect; fail fast on missing env; enable MFA + rate limits for staff.
19. **Next.js middleware → proxy deprecation.** `[Ops]` Both apps use legacy `middleware.ts` on Next 16.2.10. **Action:** Run codemod → `proxy.ts`; retest redirects + magic-link fingerprint injection. *(Done 2026-08-12: both apps migrated `src/middleware.ts` → `src/proxy.ts` manually — identical to what the `middleware-to-proxy` codemod does (file rename + exported function `middleware` → `proxy`; supported since Next 16.0.0). All logic byte-preserved: CRM `/portal-hr` → HRM redirect map, magic-link token validation + device-fingerprint header/cookie injection (both apps), Supabase session refresh, protected-path redirects, matcher configs. Note `proxy.ts` runs on the Node.js runtime by default — all code here is Node-compatible (`crypto.randomUUID`, `@supabase/ssr`). Verified via `next build` for both apps.)*
20. **200mb server-action upload limit (HRM).** `[Security/Perf]` Interview upload sets `bodySizeLimit: 200mb`. **Action:** Server-side size/type validation + auth; prefer direct-to-storage.
21. **`localStorage` pay-holds still secondary.** `[Bridges]` **Action:** Finish Studio Slice 7 (DB-backed units/holds); payroll is estimate-only (`HOURLY_RATE_DEFAULT`), no payroll-system export.
22. **`==DEBUG==` logs + hardcoded UI values.** `[Hygiene]` `intake.ts` logs ×5; `BcbaTreatmentPlanTab` hardcodes `authorName: 'Current BCBA'`; static KPI badges (`+14.2%`, `98.4%`). **Action:** Remove logs; wire author to `getCurrentUser()`; label or wire KPIs.
23. **Residual Artemis strings.** `[Clinical/HR]` `RbtOnboarding.artemisAccountSetup` + copy remain. **Action:** Rename/retire per cutover checklist gate 8 when a cohort cuts over. *(Done 2026-08-12 for user-facing copy: HRM RBT pipeline confirm buttons, RBT policy/training copy (24-hour rule, GPS, note elements), Head-HR module card, tracker-note `clinicalContent`, and the CRM status-gate SOP line now say "RAS EMR"/"EMR account setup" — repo-wide grep of both apps shows the only remaining "Artemis" strings are the dev-tools-gated dual-run docs pointer in `DevToolsUI.tsx` (intentionally honest) and historical doc/spec names. The `RbtOnboarding.artemisAccountSetup` **column is deliberately kept** (non-destructive; both schema copies carry a legacy-name comment) — UI labels never surface the old name.)*

### Low

24. ESLint debt hidden by CI `continue-on-error`. **Action:** Burn down and flip to blocking.
25. No a11y/perf budgets. **Action:** Lighthouse/axe pass before GA.
26. Dual `Session` vs `ScheduleAppointment` calendar models. **Action:** Unify (roadmap P1).
27. "Clearinghouse" naming vs manual-tracker reality (`ClearinghouseBillingQueue`, EDI preview download). **Action:** Rename to "Plutus handoff"; keep EDI preview dev-flagged. *(Done 2026-08-12: component renamed `ClearinghouseBillingQueue` → `PlutusHandoffQueue`, board header now "Plutus handoff board", copy states no clearinghouse submission happens; the 837P preview + download are now gated behind `isDevToolsEnabled()` — invisible in production. Remaining "Clearinghouse" mention is one code comment in `edi837Generator.ts` (billing workstream's file).)*

---

## 4. Path to production (phased)

### Phase 0 — Stabilize (engineering, no cohort)
- **Authorization pass:** add `requireRole`/resource-ownership guards to every PHI-touching server action + magic-link mutation; fix notifications IDOR and `/api/generate-report` (Blocker 0a, gaps 12–13).
- **Data-at-rest:** move uploads off `public/` to private storage w/ signed URLs; fix applicant-session cookie forgery; add magic-link expiry/revocation (Blockers 0b, gap 7).
- **Kill the auto-convert path:** delete/redirect legacy CRM `/portal-hr/session-emr`; route all sessions through HRM Session Studio (Blocker 0c).
- Apply/confirm the 3 `docs/sql/` scripts + resolve `StaffMessage` DDL (Blockers 1–2).
- Add blocking `next build` to CI; add smoke/unit tests for Bridge E–G invariants, billing-unit math, status gates (Blocker 4).
- Fill `docs/ENV.md`; add prod env-lock assertion for dev-tools; add `NODE_ENV` check to `DevToolsWrapper` (Blocker 5, gaps 11, 17).
- Quarantine demo: redirect/delete CRM `/rbt/*`; wire/hide mock KPI routes (Payroll/HR analytics); fix `submitMagicLinkPacket`; delete 15+ orphan dashboards; remove `==DEBUG==` logs (Blocker 3, gaps 6, 22).
- **Exit:** green build + tests in CI; no unapplied DDL; every PHI action authorized; no PHI in `public/`; no demo/mock surface reachable in a prod-configured env.

### Phase 1 — Dual-run beta (one cohort)
- Complete Studio slices required for cohort CPT mix (gap 10); wire `AuditLogVault` (gap 8).
- Run the **connected product test playbook** end-to-end, then the **Bridge E–F–G manual QA** on ≥1 cohort client.
- Follow the **Artemis dual-run cutover checklist** (Phase A → D0 → D1). Artemis remains SoT for everyone else.
- **Exit:** cohort produces claim-ready RAS notes → Plutus tracker; ≥10-note audit passes; Clinical + Billing sign D1.

### Phase 2 — Production (per-cohort D2, then scale)
- Execute cutover Phase B (freeze Artemis writes for the cohort); add monitoring/logging + backup/rollback runbook.
- Build P2 payer-hardening (auth-unit ledger, credential enforcement, EVV decision) before scaling billing volume.
- **Exit:** cohort operates enclosed in RAS for new documentation (Plutus still manual). Org-wide replacement (D3) only after all cohorts at D2.

---

## 5. Dependencies — SQL & env

### SQL the live DB must have (confirm in Supabase; apply in order if missing)
Cannot be verified from here (session-pooler only). Prereq: `prisma/migrations/` archive `01`–`15` already applied.

| Order | File | Provides |
|------:|------|----------|
| 1 | [`docs/sql/2026-08-11-case-opening-marketplace.sql`](../../sql/2026-08-11-case-opening-marketplace.sql) | `CaseOpening` + `CaseApplication` (+ enums) |
| 2 | [`docs/sql/2026-08-11-case-opening-listing-enrichment.sql`](../../sql/2026-08-11-case-opening-listing-enrichment.sql) | Listing fields + RBT home zip / travel miles |
| 3 | [`docs/sql/2026-08-11-session-note-structured-fields.sql`](../../sql/2026-08-11-session-note-structured-fields.sql) | `SessionNote` structured/signer/tracker cols, `Session.placeOfServiceCode`, `SessionStatus.IN_PROGRESS` |
| 4 | [`docs/sql/2026-08-12-staff-message.sql`](../../sql/2026-08-12-staff-message.sql) | `StaffMessage` table (script added 2026-08-12 — apply/verify in Supabase) |
| 5 | [`docs/sql/2026-08-12-schema-parity-backfill.sql`](../../sql/2026-08-12-schema-parity-backfill.sql) | All remaining schema.prisma objects with no DDL of record (see below) — idempotent, no-op where the live DB already has them via old `db push` |
| 6 | [`docs/sql/2026-08-12-magic-link-expiry.sql`](../../sql/2026-08-12-magic-link-expiry.sql) | Magic-link expiry/revocation columns (parent `IntakePacket` + applicant packets) — **pending user apply in Supabase** (added 2026-08-12) |

**2026-08-12 audit extension (Blocker 2 was wider than `StaffMessage`):** the archive 01–15 + 2026-08-11 scripts never create: `Role` values `HR/HEAD_HR/HR_AGENT/FINANCE`; `ClientStatus` values `ASSESSMENT_SCHEDULED/REPORT_ASSEMBLED/TX_PA_SUBMITTED/TX_PA_APPROVED/STAFFING_PENDING`; columns `Client.rbtId/rbtApproved/treatmentPlan`, `ActionItem.clientId`, `IntakePacket` magic-link + current doc flags, `PARequest.p2pResolved/p2pNotes`; code-referenced tables `ClientMessage`, `Notification`, `GoalTemplate`, `SkillTarget`, `SessionTrialData`, `BehaviorTarget`, `BehaviorLog`, `EVVLog`; ATS base tables `AtsCandidate`, `CandidateOnboardingPacket` (07–15 only ALTER them); schema-only `StaffCredential`, `ScheduleAppointment`, `ReAuthPacket`, `AuditLogVault`. All covered by script 5.

### Env (names only — fill `docs/ENV.md`)
`DATABASE_URL` (shared, same DB both apps), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_HRM_URL` (CRM→HRM deep links), `NEXT_PUBLIC_ENABLE_DEV_TOOLS` (must be false/unset in prod), any server-side Supabase key. Ports: CRM 3000, HRM 3001.

---

## 6. Explicitly out of scope (do not treat as gaps)

| Item | Why |
|------|-----|
| Real EDI 837/835 / clearinghouse claims | Billing is a **manual Plutus tracker** by design; `edi837Generator.ts` is a labeled P3-optional stub |
| Org-wide Artemis replacement | Only per-cohort D2 write-freeze is in scope; full parity is roadmap P1–P3 + D3 |
| State EVV aggregator submission | Capture/clock only until a P2 decision |
| DocuSign-grade crypto e-sign | Typed-name + timestamps is the chosen bar |
| Motivity `/rbt/simulation` | Training simulator, unrelated to clinical SoT |
| Native parent app | Magic-link + messages through P1; parent app P2+ |

---

## 7. Go-live checklist (tick before each phase)

**Phase 0 — Stabilize**
- [x] Authorization guards on all PHI server actions + magic-link mutations; notifications IDOR + `/api/generate-report` fixed *(2026-08-12: `requireRole`/resource-scoped guards applied across all CRM + HRM server actions, including the notifications IDOR (`getNotifications`/`markNotificationAsRead` now session-scoped) and `/api/generate-report` role + client-assignment check)*
- [x] Uploads moved off `public/` to private storage (signed URLs, `clientId` isolation) *(2026-08-12: uploads now write to the private Supabase Storage `client-documents` bucket; reads go through the new `/api/documents` route issuing signed URLs; server-side magic-byte content checks replace trusting client MIME)*
- [x] Applicant-session cookie forgery fixed; magic-link expiry/revocation added *(2026-08-12: absent-fingerprint bypass closed in all three HRM applicant action files — a valid `(candidateId, fingerprint, revokedAt IS NULL)` session row is always required. Magic-link expiry/revocation enforced end-to-end (pages + actions + staff reset/revoke); DDL in `docs/sql/2026-08-12-magic-link-expiry.sql` — **pending user apply in Supabase**, see §5 row 6)*
- [x] Legacy CRM `/portal-hr/session-emr` auto-convert path deleted/redirected *(2026-08-12: CRM `sessionEmrActions.ts` (auto-`isConverted` writer) and the whole legacy CRM `/portal-hr/*` page tree deleted; replaced with a `[[...path]]` server-redirect page to `NEXT_PUBLIC_HRM_URL` mirroring the existing middleware map, so the path can't render even if middleware is bypassed. CRM `components/emr/*` (RbtDataCollectionEngine, ScribeGuideMeEngine, LiveSessionDataCollector, TargetProgressGrapher) grep-verified orphaned and deleted)*
- [x] CRM `/rbt/*` duplicate stack redirected/deleted *(2026-08-12: all 8 CRM `/rbt/*` localStorage prototype pages + `rbt/actions.ts` deleted; a `[[...path]]` server-redirect page now bounces every CRM `/rbt/*` URL to the same path on HRM (all had HRM equivalents). Orphaned CRM `components/rbt/*` deleted: RbtTasksView, RbtScheduleView, RbtAvailabilityView, FixIncompleteSessionDrawer, RbtPipelineClient)*
- [x] Mock KPI routes wired or hidden (`PayrollBenefitsView`, `HrAgentAnalyticsView`); `submitMagicLinkPacket` field-validated *(complete 2026-08-12: both HRM mock KPI pages (`/payroll`, `/hr-dashboard`) gate the prototype views behind `isDevToolsEnabled()`; prod renders honest empty/real states — `/hr-dashboard` shows live `AtsCandidate` + active-RBT counts and routes to `/ats`, `/payroll` points to the real `/rbt/payroll`. `submitMagicLinkPacket` prototype that auto-completed all docs replaced with field-level validation — second half done in the auth workstream, 2026-08-12)*
- [x] 15+ orphan dashboards deleted/dev-gated; `==DEBUG==` logs removed *(2026-08-12 complete: 9 prototype dashboards deleted earlier (FinancialRcmAnalyticsDashboard, ParentPortalDashboard, ReAuthCompilerDashboard, IntelligentSchedulingCalendar, ClaimsDenialAppealCompiler, MockInsuranceAuditSimulator, StaffTravelPayrollSummary, TelehealthSupervisionRoom, FreeVoiceClinicalAssistant); remaining gap-6 orphans grep-verified never-imported and deleted — ExecutiveBiCockpit, MultiClinicOperationsHub, CRM `components/hrm/*` (AtsPipelineView, PayrollBenefitsView, RbtOnboardingChecklist, RbtDeidentifiedSessionView, BacbSupervisionTracker, CredentialingHardLockMatrix), CRM `components/portal-hr/HrStaffingQueue`, unused HrmLayoutWrapper + HrmSidebar + HrmHeader. All 5 `==DEBUG==` logs removed from `intake.ts`; repo-wide grep clean. `BcbaTreatmentPlanTab` hardcoded `authorName: 'Current BCBA'` replaced — `saveGoalTemplate` now derives author server-side from `getCurrentUser()`)*
- [x] 3 `docs/sql/` scripts confirmed applied in Supabase (in order) *(user confirmed running all five §5 scripts in the Supabase SQL Editor, 2026-08-12)*
- [x] `StaffMessage` DDL added (`docs/sql/2026-08-12-staff-message.sql`)
- [x] Remaining no-DDL-of-record models/columns/enums scripted (`docs/sql/2026-08-12-schema-parity-backfill.sql`)
- [x] Both 2026-08-12 scripts applied/verified in Supabase *(user confirmed running both in the Supabase SQL Editor, 2026-08-12)*
- [x] `prisma generate` run; both apps typecheck (already ✔)
- [x] `next build` green for CRM **and** HRM; CI: `next build` added as blocking step *(re-verified 2026-08-12 ~03:26 ET on the full post-edit tree — all seven 2026-08-12 workstreams merged: `prisma generate` ✔, both `tsc --noEmit` exit 0, `vitest` 84/84, and both `next build`s exit 0 with CI dummy env + `NEXT_PUBLIC_ENABLE_DEV_TOOLS=false`)*
- [x] Minimal tests: Bridge E–G invariants, billing-unit math, `clientStatusGates` (vitest, 84 tests across 8 files passing as of 2026-08-12; blocking CI step added)
- [x] `docs/ENV.md` filled (names only)
- [x] Prod env asserts `NODE_ENV=production` and dev-tools flag off; `DevToolsWrapper` gains `NODE_ENV` check *(code side done 2026-08-12: `src/lib/devToolsGate.ts` in both apps throws at boot when `NODE_ENV=production` + `NEXT_PUBLIC_ENABLE_DEV_TOOLS=true`, imported from both root layouts; `DevToolsWrapper` + both `devTools.ts` actions + auth impersonation now gate through it. Setting the actual env values in each deployed environment remains a deployment task)*

**Phase 1 — Dual-run beta**
- [x] Studio slices for cohort CPT mix complete (plan §3) *(2026-08-12: slices 3–8 landed per the studio implementation plan v1.3 — convert gate, IN_PROGRESS lifecycle, sign parity, DB-backed payroll units/holds, PHI-safe logging)*
- [x] `AuditLogVault` writes wired on view/sign/convert/export *(2026-08-12: `writeAuditLog` helpers (`apps/crm/src/lib/auditLog.ts`, fire-and-forget) wired for VIEW/SIGN/CONVERT; EXPORT added on `/api/generate-report` PDF download)*
- [ ] Connected product test playbook passes end-to-end
- [ ] Bridge E–F–G manual QA green on ≥1 cohort client
- [ ] Dual-run checklist Phase A → D0 → D1 satisfied; Clinical + Billing sign D1
- [ ] No demo targets / mock IDs on ACTIVE cohort clients

**Phase 2 — Production**
- [ ] Cutover Phase B (Artemis writes frozen for cohort) executed
- [ ] Monitoring + logging + backup/rollback runbook in place
- [ ] P2 auth-unit ledger / credential enforcement before scaling billing
- [x] Residual Artemis strings purged for cohort (`artemisAccountSetup` retire plan) *(2026-08-12: all user-facing Artemis copy retired across both apps (gap 23); the `artemisAccountSetup` column intentionally survives under a neutral "EMR account setup" UI label — retiring the column itself is deferred to a future major migration, by design non-destructive)*

---

## Document control

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-08-12 | Initial whole-project production-readiness gap analysis (CRM + HRM + shared) |
| 1.1 | 2026-08-12 | Folded in deep auth/security, billing/bridges, and demo/mock audits: added security IDOR + PHI-at-rest + auto-convert blockers; expanded gap list and Phase 0 checklist |
| 1.2 | 2026-08-12 | Phase 0 security boxes ticked (auth guards, private uploads, cookie forgery + magic-link expiry, mock-KPI/`submitMagicLinkPacket`); magic-link-expiry SQL added as §5 row 6 (pending Supabase apply); clinic-TZ gap 16 closed |
| 1.3 | 2026-08-12 | Final verification pass on the full post-edit tree (~03:26 ET): prisma generate, both typechecks, 84/84 vitest, both `next build`s green with CI dummy env; §7 build/test lines annotated |
| 1.4 | 2026-08-12 | Track L cleanup: gap 19 closed (`middleware.ts` → `proxy.ts` both apps, behavior-preserving), gap 23 closed (user-facing Artemis strings retired; column kept non-destructively), gap 27 closed (`PlutusHandoffQueue` rename + dev-flagged EDI preview); Phase 2 Artemis-strings line ticked. Secondary-audit M1/L1/L2/L3/L4/L5 closed or annotated there. Gap 24 (ESLint debt / `continue-on-error`) intentionally untouched. |
