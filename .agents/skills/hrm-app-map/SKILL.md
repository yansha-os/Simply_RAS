---
name: hrm-app-map
description: >
  Use when working under apps/hrm, ATS, RBT portal, onboarding, job board apply,
  wage offer, session studio, or HRM-side staffing against CRM case openings.
  Read before changing hire-cycle, RBT portal, or CRM↔HRM boundary code.
---

# HRM App Map

Authoritative ownership map for **`apps/hrm`**. Use this to stay inside HRM lanes and avoid owning client clinical / PA / Case Coord readiness here.

Also see:
- `docs/superpowers/specs/2026-08-11-aba-crm-hrm-spine-roadmap.md` — spine sequencing; job-board bridge freeze; HRM applicant COMPLETE
- `docs/superpowers/specs/2026-08-11-aba-session-note-data-collection-spec.md` — RBT data collection / note draft rules (clinical SoT; pairs with Session Studio)
- `docs/superpowers/specs/2026-08-11-session-studio-implementation-plan.md` — Build slices to close Studio gaps vs SoT (after Bridges F/G wiring)
- `docs/superpowers/specs/2026-08-11-aba-emr-artemis-replacement-roadmap.md` — Enclosed EMR / Artemis replacement (HRM owns delivery, not chart SoT)
- `docs/superpowers/specs/2026-08-11-artemis-dual-run-cutover-checklist.md` — Cohort dual-run → RAS Studio notes → freeze Artemis writes
- `.agents/skills/crm-app-map/SKILL.md` — CRM ownership / CaseOpening authorship
- `.agents/skills/intake-workflow-map/SKILL.md` — client status machine (do not flip from HRM)

---

## Owns

| Domain | Notes |
|---|---|
| ATS hire cycle | Apply → screen → interview → offer → hire → `User` |
| RBT portal | Schedule, documents, job board apply, payroll view, session studio |
| Onboarding | Embedded forms, signatures, candidate docs, wage / LS-54 offer |
| Applications | `RbtJobApplication` against CRM-authored `CaseOpening` |
| ATS ops UI | Pipeline, applicant audit, help tickets, RBT manager |

Shared with CRM (do not duplicate product): one Postgres DB, `Notification` rows, `User` role flags.

HRM is the **only** RBT surface (2026-08-12): CRM's duplicate `/rbt/*` and `/portal-hr/*` stacks were deleted and now server-redirect here. `/payroll` and `/hr-dashboard` are mock-KPI demo surfaces gated by `isDevToolsEnabled()` (404 in prod).

---

## Does not own

- Client clinical status / Treatment PA / VOB / intake packet
- Case Coord readiness checklist or posting openings (CRM authors `CaseOpening`)
- FlowMap / magic-link parent intake (CRM)

Applicant cycle is marked **COMPLETE** in the spine roadmap — do not reopen unless regressions. Job board apply path is **BRIDGE_V1** — freeze; polish notifications later; do not mix into ATS redesign.

---

## Key paths

### App routes

| Path | Purpose |
|---|---|
| `apps/hrm/src/app/ats/` | ATS home, applicant detail, help tickets |
| `apps/hrm/src/app/(dashboard)/rbt/` | RBT portal (job board, schedule, docs, payroll, session) |
| `apps/hrm/src/app/apply/` | Public RBT application |
| `apps/hrm/src/app/onboarding/` | Hire onboarding surfaces |
| `apps/hrm/src/app/magic-link/[token]/` | Candidate magic-link flows |
| `apps/hrm/src/app/hr-dashboard/` | Head HR command |
| `apps/hrm/src/app/rbt-manager/` | RBT manager view |
| `apps/hrm/src/app/payroll/` | Payroll benefits / finance |
| `apps/hrm/src/app/session-emr/` | Session EMR entry |

### Actions

| Path | Purpose |
|---|---|
| `apps/hrm/src/app/actions/atsActions.ts` | ATS stage / hire mutations |
| `apps/hrm/src/app/actions/caseOpeningActions.ts` | Job board apply / CRM opening reads (HRM side) |
| `apps/hrm/src/app/actions/wageOfferActions.ts` | Wage / LS-54 offer |
| `apps/hrm/src/app/actions/onboardingSignatureActions.ts` | Onboarding e-sign |
| `apps/hrm/src/app/actions/candidateDocumentActions.ts` | Candidate uploads |
| `apps/hrm/src/app/actions/hrInterviewActions.ts` | Interview scheduling / outcomes |
| `apps/hrm/src/app/actions/sessionEmrActions.ts` | Session Studio / EMR — submit is one `$transaction`, idempotent (resubmit replaces trial/behavior rows); EVV clock-in idempotent; `SCHEDULED → IN_PROGRESS → COMPLETED` lifecycle |
| `apps/hrm/src/app/actions/publicRbt.ts` | Public apply entry |
| `apps/hrm/src/app/actions/staffingActions.ts` | Staffing queue helpers |
| `apps/hrm/src/app/actions/payrollActions.ts` | Payroll from signed notes (Bridge G) — prefers persisted `SessionNote.billableUnits`, falls back to duration estimate; holds are DB-backed via `lib/rbtPayHolds.ts` (localStorage holds gone) |

### Components & libs

| Path | Purpose |
|---|---|
| `apps/hrm/src/components/hrm/` | ATS pipeline, offer tab, staffing queue, dashboards |
| `apps/hrm/src/components/rbt/` | Job board, schedule, onboarding panels, payroll view |
| `apps/hrm/src/components/emr/` | `RbtSessionStudio` |
| `apps/hrm/src/components/public-rbt/` | Public application form |
| `apps/hrm/src/lib/atsStage.ts` | ATS stage helpers |
| `apps/hrm/src/lib/jobBoardMatching.ts` | Opening ↔ RBT match |
| `apps/hrm/src/lib/onboardingDocuments.ts` | Onboarding doc catalog |
| `apps/hrm/src/lib/sessionStudio.ts` | Session studio helpers |
| `apps/hrm/src/lib/auth-guard.ts` | `requireStaff(roles?)` + role groups — every server action must gate first |
| `apps/hrm/src/lib/devToolsGate.ts` | `isDevToolsEnabled()` single gate; boot assert throws in prod if flag on |
| `apps/hrm/src/lib/resolveActingRbt.ts` | Acting-RBT identity (device session → real auth → demo). In prod (`isDevToolsEnabled()` false) a mock/role-only RBT resolves to `null` — **never** a real RBT; explicit-id spoofing refused |
| `apps/hrm/src/lib/rbtPayHolds.ts` | DB-backed payroll holds |
| `apps/hrm/src/lib/auditLog.ts` | `writeAuditLog(s)` → `AuditLogVault` (VIEW/SIGN/CONVERT/EXPORT; never throws) |
| `apps/hrm/src/lib/clinicTimezone.ts` | Clinic-TZ (America/New_York) boundaries — keep byte-identical with the CRM copy |
| `apps/hrm/src/lib/magicLinkExpiry.ts` | Candidate magic-link expiry/revocation (`CandidateOnboardingPacket`) |

---

## HRM → CRM bridge (read-only reminder)

```
CRM writes CaseOpening + ClientStatus / PA
HRM writes AtsCandidate hire + RbtJobApplication
Shared: Notification + User
```

Do **not** advance `ClientStatus` from HRM. Do **not** invent openings in HRM — read CRM openings and apply.

---

## When to load other skills

| Touching… | Load |
|---|---|
| Client status / intake / FlowMap | `intake-workflow-map` + prefer CRM |
| Case openings authored by Case Coord | `crm-app-map` |
| Prisma schema / SQL | `supabase-migration-generator` + write SQL under `docs/sql/` |
| Server Actions patterns | `server-action-pattern` |
