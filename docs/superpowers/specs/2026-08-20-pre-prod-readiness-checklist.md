# Pre-Production Readiness Checklist — Simple RAS CRM + HRM

**Date:** 2026-08-20
**Status:** Engineering go/no-go before first production deploy (ops / leadership — not legal advice)
**Product:** Rise & Shine — Simple RAS CRM (`:3000`) + HRM (`:3001`), one shared Supabase Postgres

**Strategy:** RAS is a **fully enclosed** system in product copy and engineering. Production caseload stays on the **external production stack** (friend's CRM+HRM) until leadership executes **cold cutover**. This checklist gates the **first production deploy** of RAS — not org-wide legacy vendor offboarding.

**Related (do not duplicate):**
- Master phases → [`2026-08-19-artemis-exit-enclosed-system-roadmap.md`](./2026-08-19-artemis-exit-enclosed-system-roadmap.md)
- Sandbox → cold cutover (post-deploy) → [`2026-08-11-ras-sandbox-cutover-checklist.md`](./2026-08-11-ras-sandbox-cutover-checklist.md)
- Security / auth audit → [`2026-08-12-production-readiness-gap-analysis.md`](./2026-08-12-production-readiness-gap-analysis.md)
- SQL index → [`../../sql/README.md`](../../sql/README.md)
- Env names → [`../../ENV.md`](../../ENV.md)

---

## How to use

1. Complete **Section A (SQL)** in Supabase SQL Editor — confirm each row with human checkbox + date.
2. Complete **Section B (env locks)** in each deployed environment (CRM + HRM).
3. Run **Section C (role routing smoke)** on staging/prod URLs after deploy.
4. Tick **Section D (Phase 0–3 engineering)** — honest static audit; do not invent readiness.
5. **GO** only when all **MUST APPLY** SQL + env + smoke + engineering boxes are green.
6. **Section E** items are explicitly **after prod** or **HOLD** — they do not block this deploy.

| Field | Value |
|-------|-------|
| Deploy target (staging / prod) | |
| CRM URL | |
| HRM URL | |
| Eng owner | |
| Ops owner | |
| Sign-off date | |
| Go / No-go | ☐ GO ☐ NO-GO |

---

## A. SQL apply order (Supabase SQL Editor)

Prerequisite: archive `prisma/migrations/` scripts `01`–`15` already on the target DB.

### MUST APPLY before prod deploy

| Order | File | Purpose | Applied ☐ | Date |
|------:|------|---------|:---------:|------|
| 1 | [`2026-08-11-case-opening-marketplace.sql`](../../sql/2026-08-11-case-opening-marketplace.sql) | CaseOpening + CaseApplication | [ ] | |
| 2 | [`2026-08-11-case-opening-listing-enrichment.sql`](../../sql/2026-08-11-case-opening-listing-enrichment.sql) | Listing enrichment + RBT zip | [ ] | |
| 3 | [`2026-08-11-session-note-structured-fields.sql`](../../sql/2026-08-11-session-note-structured-fields.sql) | Session Studio structured note fields | [ ] | |
| 4 | [`2026-08-12-staff-message.sql`](../../sql/2026-08-12-staff-message.sql) | StaffMessage table | [ ] | |
| 5 | [`2026-08-12-schema-parity-backfill.sql`](../../sql/2026-08-12-schema-parity-backfill.sql) | Remaining schema.prisma parity | [ ] | |
| 6 | [`2026-08-12-magic-link-expiry.sql`](../../sql/2026-08-12-magic-link-expiry.sql) | Magic-link expiry/revocation columns | [ ] | |
| 7 | [`2026-08-12-session-indexes.sql`](../../sql/2026-08-12-session-indexes.sql) | Session hot-path indexes | [ ] | |
| 11 | [`2026-08-19-182500Z-client-portal-notifications.sql`](../../sql/2026-08-19-182500Z-client-portal-notifications.sql) | Notification.clientId for parent bell | [ ] | |
| 12 | [`2026-08-20-010500Z-session-notes-coordinator-role.sql`](../../sql/2026-08-20-010500Z-session-notes-coordinator-role.sql) | SESSION_NOTES_COORDINATOR enum | [ ] | |
| 13 | [`2026-08-20-012800Z-dual-run-cohort-fields.sql`](../../sql/2026-08-20-012800Z-dual-run-cohort-fields.sql) | Sandbox cohort tags on Client | [ ] | |
| 14 | [`2026-08-20-015300Z-clinical-emr-provisioned-rename.sql`](../../sql/2026-08-20-015300Z-clinical-emr-provisioned-rename.sql) | RbtOnboarding column rename | [ ] | |

After apply: run `npx prisma generate` locally; redeploy both apps.

### HOLD — do not apply until product decision / UI wired

| File | Why HOLD |
|------|----------|
| [`2026-08-16-231000Z-client-emr-fields.sql`](../../sql/2026-08-16-231000Z-client-emr-fields.sql) | Intake Form01 still uses packet `diagnosisText`, not `Client.primaryDiagnosisCode` |
| [`2026-08-16-232000Z-evv-aggregator-sync-fields.sql`](../../sql/2026-08-16-232000Z-evv-aggregator-sync-fields.sql) | **EVV HOLD** — Sandata/HHA adapters are synthetic prototypes; no live aggregator chosen |
| [`2026-08-12-rls-storage-hardening.sql`](../../sql/2026-08-12-rls-storage-hardening.sql) | **PENDING MANUAL SECURITY REVIEW** — apply only after both apps verified with `SUPABASE_SERVICE_ROLE_KEY` |

---

## B. Environment locks (each deployed environment)

| Check | CRM | HRM |
|-------|:---:|:---:|
| `NODE_ENV=production` | [ ] | [ ] |
| `NEXT_PUBLIC_ENABLE_DEV_TOOLS` unset or `false` | [ ] | [ ] |
| Boot assert passes (`devToolsGate.ts` — no throw on layout import) | [ ] | [ ] |
| `DATABASE_URL` — shared pooler, same DB both apps | [ ] | [ ] |
| `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` set | [ ] | [ ] |
| `SUPABASE_SERVICE_ROLE_KEY` server-only (never `NEXT_PUBLIC_*`) | [ ] | [ ] |
| `NEXT_PUBLIC_HRM_URL` / `NEXT_PUBLIC_CRM_URL` cross-app deep links | [ ] | [ ] |
| PHI uploads: private `client-documents` bucket only (no `public/uploads`) | [ ] | N/A |

**NO-GO** if dev-tools flag is on in production or impersonation is reachable.

---

## C. Role routing smoke (post-deploy)

Quick path per role — expect **200 + correct portal**, not 404/403 loops.

| Role | App | Route | Pass ☐ |
|------|-----|-------|:------:|
| Intake / PA | CRM | `/portal-case` | [ ] |
| Clinical Support | CRM | `/clinical-support` | [ ] |
| Case Coordinator | CRM | `/portal-case-coord` | [ ] |
| Session Notes Coord / Billing | CRM | `/notes` | [ ] |
| BCBA | CRM | `/portal-clinical` | [ ] |
| Billing | CRM | `/portal-billing` | [ ] |
| Ops Director | CRM | `/ops` | [ ] |
| RBT | HRM | `/rbt/schedule` → Session Studio | [ ] |
| Head HR | HRM | `/ats` | [ ] |

**Bridge E–G wiring smoke** (one pretend/sandbox client if available): schedule → Studio note → BCBA sign → `/notes` convert → payroll row. Full QA: [`2026-08-11-bridge-efg-manual-qa-checklist.md`](./2026-08-11-bridge-efg-manual-qa-checklist.md).

---

## D. Phase 0–3 engineering complete (pre-deploy)

### Phase 0 — Stabilize (from gap analysis §7)

- [x] Authorization guards on PHI server actions + magic-link mutations
- [x] Uploads off `public/` — private Supabase Storage + signed URLs
- [x] Applicant cookie forgery closed; magic-link expiry enforced in code
- [x] Legacy CRM `/portal-hr/session-emr` auto-convert deleted; CRM `/rbt/*` redirects to HRM
- [x] Mock KPI routes dev-gated; orphan dashboards removed
- [x] Core `docs/sql/` scripts 1–6 applied (confirm in Section A)
- [x] `next build` + vitest green in CI
- [x] `docs/ENV.md` filled; dev-tools boot assert in both layouts

### Phase 1 — Notes + EVV enclosed (engineering)

- [x] Session Studio slices 3–8 landed (convert gate, IN_PROGRESS, DB payroll units)
- [x] AuditLogVault wired on view/sign/convert/export
- [ ] Connected product test playbook passes end-to-end (manual — post-deploy)
- [ ] Bridge E–F–G manual QA green on ≥1 sandbox client (manual — uses sandbox checklist)

### Phase 2 — Clinical EMR (engineering)

- [x] Chart modules wired (goals, progress, assessment tab, supervision dashboard)
- [ ] Sandbox Phase 2 acceptance signed on pretend ACTIVE clients ([sandbox checklist §Phase 2](./2026-08-11-ras-sandbox-cutover-checklist.md))

### Phase 3 — Billing enclosed (engineering)

- [x] Auth CPT ledger, claim scrubber, denial playbook, credential hard-stops in code
- [ ] Sandbox Phase 3 acceptance signed ([sandbox checklist §Phase 3](./2026-08-11-ras-sandbox-cutover-checklist.md))

### Phase 4 — Legacy EMR decommission (pre-prod engineering — this release)

- [x] Staff-facing copy: zero Artemis / Motivity / dual-run labels in `apps/crm` + `apps/hrm`
- [x] `RbtOnboarding.clinicalEmrProvisioned` in Prisma + rename SQL scripted
- [x] EmrDocumentVault category: **Historical EMR archive** (not vendor-branded)
- [x] Sandbox QA nav labels (`/portal-billing/audit`) — not "Dual-Run Audit"
- [ ] SQL row 14 applied in Supabase (Section A)

---

## E. Explicitly AFTER prod deploy (not go/no-go blockers)

| Item | When |
|------|------|
| **2–3 week sandbox** on pretend clients | After prod live; per [`ras-sandbox-cutover-checklist`](./2026-08-11-ras-sandbox-cutover-checklist.md) Phase A |
| **Cold cutover** of real production caseload | After Cutover Readiness + written leadership go/no-go |
| **Legacy vendor account disable / contract exit** | Decommission phase — operational, outside RAS |
| **Live Sandata / HHA EVV submit** | **HOLD** — capture + geofence in RAS; aggregator adapters prototype only |
| **RLS hardening script** | After security review + service-role verification |
| **Client EMR diagnosis columns SQL** | After intake UI writes `Client.primaryDiagnosisCode` |
| **Multi-RBT per client** | Known gap: single `Client.rbtId` today; `ClientStaffAssignment` table Phase 2+ — document risk, do not block pre-prod |
| **Native EDI 837/835** | Plutus remains claim filer by design |

**Rollback:** Return caseload documentation to the **external production stack** (operational parachute — not implemented in RAS).

---

## F. Known gaps (honest — document, do not hide)

| Gap | Severity | Notes |
|-----|----------|-------|
| **EVV aggregator** | HOLD | Clock-in/out + GPS capture work in Session Studio. Synthetic Sandata/HHA adapters were removed; there is no external transmission path. SQL `2026-08-16-232000Z-*` stays on HOLD until vendor decision, enrollment, and certification. |
| **Single `Client.rbtId`** | Medium | One assigned RBT per client in schema; multi-RBT assignment deferred to `ClientStaffAssignment` (Phase 2). Wrong-RBT-on-note risk if staff bypass assignment SOP. |
| **RLS policies** | Medium | Broad authenticated policies may remain until `2026-08-12-rls-storage-hardening.sql` reviewed and applied. Server actions + service role are primary guard today. |
| **Manual QA not run** | High for cutover | Pre-prod deploy can be **GO**; **cold cutover** requires sandbox ≥10-note QA + Billing sign-off. |

---

## G. CI verification (before claiming engineering complete)

```bash
npm test
npm run typecheck
# Optional pre-deploy: both next builds with prod-like env
NEXT_PUBLIC_ENABLE_DEV_TOOLS=false npm run build --workspace=apps/crm
NEXT_PUBLIC_ENABLE_DEV_TOOLS=false npm run build --workspace=apps/hrm
```

---

## Verdict template

| Question | Answer |
|----------|--------|
| Is **pre-prod engineering** complete? | ☐ Yes — pending Section A SQL apply + manual smoke ☐ No — list blockers |
| Is **org-wide legacy EMR exit** complete? | ☐ No — requires sandbox → cold cutover + vendor offboarding |
| Safe to deploy RAS to production URL? | ☐ GO ☐ NO-GO |

**Honest ceiling:** Phase 4 **pre-prod engineering** can be complete while **operational** enclosed operations (cold cutover, EVV vendor, RLS) remain open. Do not conflate "deploy RAS" with "replace friend's production stack."

---

## Index pointers

- `docs/README.md` — specs table
- `docs/sql/README.md` — canonical apply order
- `.agents/skills/crm-app-map` / `hrm-app-map` — app ownership
