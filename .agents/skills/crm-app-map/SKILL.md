---
name: crm-app-map
description: >
  Use when working under apps/crm, client profile, portals (intake/clinical/billing/case-coord),
  magic link, FlowMap, CaseOpening authored in CRM, or CRM-side staffing/job board surfaces.
  Read before changing client lifecycle, portal ownership, or CRM↔HRM boundary code.
---

# CRM App Map

Authoritative ownership map for **`apps/crm`**. Use this to stay inside CRM lanes and avoid implementing ATS/hire product work here.

Also see:
- `.agents/skills/intake-workflow-map/SKILL.md` — client status / packet / magic-link state machine
- `docs/superpowers/specs/2026-08-11-aba-crm-hrm-spine-roadmap.md` — spine sequencing & bridge freeze notes
- `docs/superpowers/specs/2026-08-11-aba-session-note-data-collection-spec.md` — BCBA co-sign / claim-eligible note fields (clinical SoT)
- `docs/superpowers/specs/2026-08-11-aba-emr-artemis-replacement-roadmap.md` — Enclosed EMR / Artemis clinical replacement (chart modules, phases)
- `docs/superpowers/specs/2026-08-11-ras-sandbox-cutover-checklist.md` — Sandbox QA → cold cutover (no dual-run)
- `docs/superpowers/specs/2026-08-11-bridge-efg-manual-qa-checklist.md` — Manual QA for first-session ACTIVE, e-sign, Plutus convert

---

## Owns

| Domain | Notes |
|---|---|
| Client lifecycle | Inquiry → intake → clinical → billing PA → Case Coord → ACTIVE |
| Intake → PA spine | Magic link, docs, clinical review, VOB, Assessment/Treatment PA tracker |
| Case Coord | Readiness, schedule, case openings authored in CRM |
| Case openings | `CaseOpening` create/publish/review; parent accept paths on CRM |
| Portals | Intake (`portal-case`), clinical, billing, case-coord |

Shared with HRM (do not duplicate product): one Postgres DB, `Notification` rows, `User` role flags.

---

## Does not own

- ATS applicant lifecycle (apply → screen → interview → offer → hire)
- RBT careers / onboarding product (lives in HRM)
- Embedded HR suite as the source of truth for hire

CRM has **no** RBT or HR surfaces anymore (2026-08-12). The old CRM `/rbt/*` page stack (+ `rbt/actions.ts`, `components/rbt/*`) and all `/portal-hr/*` pages were **deleted**; catch-all pages at `app/(dashboard)/rbt/[[...path]]/page.tsx` and `app/(dashboard)/portal-hr/[[...path]]/page.tsx` (plus the CRM request routing layer, `src/proxy.ts`) server-redirect every such URL to the HRM equivalent. The legacy CRM EMR auto-convert path (`app/actions/sessionEmrActions.ts`, `components/emr/*`) is also deleted — all session documentation flows through **HRM Session Studio**. Do not recreate any of these in CRM. Job-board bridge: CRM posts openings; HRM applies.

---

## Key paths

### App routes

| Path | Purpose |
|---|---|
| `apps/crm/src/app/(dashboard)/client/[id]/` | Client profile server page |
| `apps/crm/src/app/(dashboard)/portal-case/` | Intake coordinator portal (+ `actions/`) |
| `apps/crm/src/app/(dashboard)/portal-case-coord/` | Case Coord clients + openings marketplace |
| `apps/crm/src/app/(dashboard)/portal-billing/` | Billing / PA tracker surfaces |
| `apps/crm/src/app/(dashboard)/portal-clinical/` | Clinical / BCBA portal |
| `apps/crm/src/app/(dashboard)/clinical-support/` | Clinical support queue |
| `apps/crm/src/app/magic-link/` | Parent-facing intake magic link |

### Actions

| Path | Purpose |
|---|---|
| `apps/crm/src/app/actions/intake.ts` | Parent submit / schedule save |
| `apps/crm/src/app/actions/caseOpeningActions.ts` | Openings / applications / parent accept (CRM) |
| `apps/crm/src/app/actions/firstSessionActions.ts` | First durable Session → ACTIVE |
| `apps/crm/src/app/actions/sessionNoteSignActions.ts` | BCBA sign / notes → claims gate |
| `apps/crm/src/app/(dashboard)/portal-case/actions/` | Intake assign, billing PA, clinical-support flips |

### Components

| Path | Purpose |
|---|---|
| `apps/crm/src/components/client-profile/` | Tabs, FlowMap, command center |
| `apps/crm/src/components/client-profile/tabs/` | Intake docs, billing auth, case-coord schedule, job board panel |
| `apps/crm/src/components/portal-case-coord/` | Case Coord marketplace / clients UI |
| `apps/crm/src/components/magic-link/` | Parent continuous intake forms |
| `apps/crm/src/components/portal-billing/` | Billing portal UI |
| `apps/crm/src/components/portal-clinical/` | Clinical portal UI |

### Guards & shared libs (use these — do not reinvent)

| Path | Purpose |
|---|---|
| `apps/crm/src/lib/auth-guard.ts` | `requireStaff(roles?)` / `requireClientAccess(clientId)` + role groups (`INTAKE_ROLES`, `BILLING_ROLES`, `CLINICAL_ROLES`, `CASE_COORD_ROLES`, `HR_ROLES`) — **every server action must gate first** |
| `apps/crm/src/lib/magicLinkGuard.ts` | Parent magic-link gate: live token + 30-day expiry + revocation + device-fingerprint binding (`requireParentPacketAccess`, `requireStaffOrParent`) |
| `apps/crm/src/lib/devToolsGate.ts` | `isDevToolsEnabled()` single gate; boot assert throws in prod if the flag is on |
| `apps/crm/src/lib/noteConvertGate.ts` | Notes → Plutus convert gate: `rbtSigned` + `bcbaSigned` + green `checklistSnapshot`; pair with conditional `updateMany` (race-safe) |
| `apps/crm/src/lib/auditLog.ts` | `writeAuditLog(s)` → `AuditLogVault` for VIEW/SIGN/CONVERT/EXPORT (never throws, ids only) |
| `apps/crm/src/lib/clinicTimezone.ts` | Clinic-TZ (America/New_York) day/week boundaries — keep byte-identical with the HRM copy |
| `apps/crm/src/lib/billing/` | `edi837Generator.calculateBillingUnits` (Medicaid 8-min rule = HRM formula), `weeklyBillableUnits`, `authUnits` — units are computed **server-side only** |
| `apps/crm/src/app/api/upload/route.ts` + `api/documents/route.ts` | PHI documents live in the **private** Supabase Storage bucket `client-documents`; reads go through the signed-URL route. Nothing is written to `public/uploads` |

---

## CRM → HRM bridge (read-only reminder)

```
CRM writes CaseOpening + clinical / PA / ClientStatus
HRM writes AtsCandidate hire + RbtJobApplication
Shared: Notification + User
```

Job board staffing is **BRIDGE_V1** — freeze polish into HRM applicant work; do not reopen ATS cycle from CRM.

ACTIVE only after a real first `Session` (Bridge E) — staffing accept alone does not activate.

---

## When to load other skills

| Touching… | Load |
|---|---|
| `ClientStatus`, packet, FlowMap, magic link badges | `intake-workflow-map` |
| Prisma schema / SQL for openings or client fields | `supabase-migration-generator` + write SQL under `docs/sql/` |
| Server Actions patterns | `server-action-pattern` |
