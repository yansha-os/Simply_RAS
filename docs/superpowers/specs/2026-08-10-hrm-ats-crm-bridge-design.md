# HRM Durable ATS + CRM Bridge Design

**Date:** 2026-08-10  
**Status:** Approved for spec review  
**Apps:** `apps/hrm` (HR product), `apps/crm` (client product)  
**Phase covered by this build:** Phase 1 (durable ATS + hire notifications + CRM HR portal removal)

---

## Context

Rise & Shine runs two separate Next.js apps on one Postgres database:

| App | Port | Owns |
|-----|------|------|
| CRM | 3000 | Clients, intake, case, clinical/BCBA, billing (later Plutus) |
| HRM | 3001 | ATS, applicants, RBT portal, job board, payroll, Head HR |

Enterprise assessment (Aug 2026): CRM intake/PA ~7.5/10; overall CRM+HRM enterprise readiness ~4.5/10. Biggest gap for the staffing→sessions→billing spine is **HRM ATS state living in `localStorage`**, which blocks reliable CRM handoffs.

This design is **sub-project 1** of an ordered roadmap:

1. **Phase 1 (this spec):** Durable ATS + hire → RBT user + `RBT_HIRED` notifications + remove CRM HR product UI  
2. **Phase 2:** Job postings/applications + `JOB_POSTED` / `JOB_APPLICATION` notifications  
3. **Phase 3:** BCBA e-sign queue, first-day supervision, Plutus claim handoff  

---

## Goals

1. HR Agent ATS is a durable, multi-browser system of record in Prisma.  
2. Apply → advance → hire is server-authoritative; no demo ID / localStorage stage contamination.  
3. CRM and HRM stay **separate apps** with **no HR hub inside CRM**; they collaborate via shared DB + `Notification` rows.  
4. Hiring an RBT notifies the relevant BCBA(s) in the CRM notification bell.  
5. Schema changes are delivered as paste-ready Supabase SQL (no agent `migrate`/`db push`).

## Non-goals (this phase)

- Job board post/apply tables and UX wiring  
- BCBA session-note e-sign productization  
- Plutus / Claim / EDI submission  
- Supabase Storage for resume binaries  
- Production email provider  
- Shared `@repo/notifications` package extraction  
- Rebuilding CRM `/portal-hr` as a mirror of HRM  

---

## Product boundaries

- **HRM is the only HR product.** ATS, applicant lifecycle, RBT careers, payroll live in HRM.  
- **CRM has no HR portal UI.** Existing `/portal-hr/*` routes are removed from nav and either deleted or hard-redirected to HRM (`NEXT_PUBLIC_HRM_URL`, default `http://localhost:3001`).  
- **CRM may still store `User` rows with HR roles** (`HEAD_HR`, `HR_AGENT`, `FINANCE`) so future CRM events can notify HR people — without giving them an HR suite inside CRM.  
- Cross-app collaboration is **data + notifications**, not embedded UI.

```text
HRM writes hire / applications
CRM writes job posts / clinical events
Both read Notification for their signed-in user
```

---

## Architecture

### System of record: `AtsCandidate`

Extend existing `AtsCandidate` + `CandidateOnboardingPacket` rather than adding a parallel Applicant table.

**Stage enum (align with HR Agent board):**

`APPLIED` → `PHONE_SCREEN` → `INTERVIEW` → `OFFER` → `HIRED`  
Also: `HELP_DESK`, `REJECTED`

**Required field additions:**

| Field | Purpose |
|-------|---------|
| `userId` (nullable FK → `User`) | Set on hire; links candidate to staff login |
| `activationStatus` | e.g. `PENDING_HR_REVIEW`, `INVITATION_SENT`, `ACTIVE` |
| `assignedHrAgentId` (nullable FK → `User`) | Optional ownership for HR agents |
| `dossier` / packet `formData` | Application payload currently stuck in localStorage |
| Stage string | Must match board keys above |

### Apply flow

`publicRbt` / apply form:

1. Upsert **`AtsCandidate`** by email (unique).  
2. Ensure **`CandidateOnboardingPacket`** (magic link token as needed).  
3. Persist dossier JSON on candidate/packet.  
4. **Do not** create an active RBT `User` at apply time. Prefer User creation at **hire**.

File binaries may remain temporary until Storage (Phase 1 does not require Storage).

### ATS server actions (HRM only writes)

All stage mutations go through authenticated server actions with `requireRole` for `HEAD_HR` | `HR_AGENT` (and CEO/admin as needed):

- `listAtsCandidates` — Prisma only  
- `advanceAtsStage` / `setAtsStage`  
- `inviteCandidate` (sets activation + magic link; dev: return copyable URL; no fake “email sent”)  
- `recordInterviewResult`  
- `extendOffer`  
- `hireCandidate`  
- `rejectCandidate`  
- `deleteAtsCandidate`

**Remove as source of truth:**

- `localStorage` key `ras_ats_custom_stages`  
- Jane Doe / `c1` / demo ID stage fan-out  
- UI that advances stage in React state without persisting  

**Bug fixes included in Phase 1:**

- Advance-stage modal must persist the *next* stage (not copy previous stage)  
- Interview claim is **per candidate**, not a single global boolean  

### Hire action

Ordered steps:

1. Validate candidate exists and is hireable (`OFFER` or explicit Head HR override).  
2. Resolve staff `User` by candidate email (exact, case-normalized):
   - **No `User`:** create one with `role: RBT`, `isActive: true`, name/email from candidate.  
   - **Existing `User` with `isActive: false`:** activate that row (`isActive: true`), set `role: RBT` if it was a hire placeholder, refresh name from candidate. Do **not** insert a second row.  
   - **Existing `User` with `isActive: true`:** abort hire with a clear error (email already an active staff account). Do **not** create a second `User`.  
3. Set `AtsCandidate.userId` to that user, `stage: HIRED`, `activationStatus: ACTIVE`.  
4. Resolve notify targets: prefer BCBAs on clients with `STAFFING_PENDING` / `bcbaId`; if none, notify active `BCBA` users or fall back to `HEAD_HR`.  
5. Write `Notification` rows: `type: RBT_HIRED`, CRM deep link (`/portal-clinical` or `/client/[id]` when known).  

If no BCBA to notify: hire still succeeds and notify all active `HEAD_HR` users.

### Notifications

Reuse existing `Notification` model + bells in both apps (already poll ~15s).

| Event type | Writer | Recipients | Deep link |
|------------|--------|------------|-----------|
| `RBT_HIRED` | HRM hire | BCBA(s) on staffing-pending clients; else all active BCBAs; else HEAD_HR. Also notify case coord when `caseCoordinatorId` is set on those clients. | CRM clinical/client |
| `JOB_POSTED` | CRM (Phase 2) | Active RBTs | HRM `/rbt/job-board` |
| `JOB_APPLICATION` | HRM (Phase 2) | Case coord of client | CRM client/staffing |
| `NOTE_AWAITING_BCBA_SIGN` | later | BCBA | CRM notes/clinical |
| `NOTE_READY_FOR_PLUTUS` | later | Billing | CRM billing |

Shared helper pattern (duplicate in both apps for Phase 1; extract package later):

`notifyUsers({ userIds, title, message, type, linkUrl })`

### CRM HR portal removal

- Remove HR product entries from CRM sidebar (`/portal-hr`, ats, onboarding, payroll, session-emr, requests).  
- Routes: hard-redirect to `NEXT_PUBLIC_HRM_URL` corresponding paths.  
- Staffing **consumer** UI that case/clinical need can remain later as CRM-native pages that **read** hired RBTs / job applications from Prisma; not an HR suite.

---

## Phase 2 preview (designed, not built here)

New models:

- `ClientJobPosting` — `clientId`, `postedByUserId`, status `OPEN|FILLED|CLOSED`, description fields  
- `ClientJobApplication` — `postingId`, `rbtUserId`, status `APPLIED|REVIEWING|ACCEPTED|REJECTED`  

Events: `JOB_POSTED`, `JOB_APPLICATION`. Accept application → set `Client.rbtId`, notify BCBA.

## Phase 3 preview

Session note BCBA e-sign queue; first-day supervision; Plutus claim entity beyond `SessionNote.isConverted`.

---

## Error handling

- Unauthorized stage/hire → `FORBIDDEN` via role guard; no silent success.  
- Hire email resolution (same rules as Hire action step 2): inactive same-email user → **activate and link**; active same-email user → **clear error, never insert a second `User`**.  
- Missing candidate / invalid stage transition → `{ success: false, error }` for UI toast.  
- Notification fan-out failure must not roll back a completed hire (log + best-effort notify).  

---

## Success criteria (Phase 1)

1. ATS board reflects Prisma stages after full page reload and in a second browser.  
2. New apply appears as `AtsCandidate` in `APPLIED` without relying on localStorage.  
3. Stage advance / invite / hire persist via server actions.  
4. Hire creates/activates RBT `User` and links `AtsCandidate.userId`.  
5. CRM BCBA notification bell shows `RBT_HIRED` (when a BCBA target exists).  
6. CRM no longer exposes HR ATS/onboarding/payroll product nav.  
7. Manual Supabase SQL provided and synced into root + `packages/db` schemas.  

### Manual test checklist

1. Apply as new RBT → appears in ATS `APPLIED` after refresh / other browser.  
2. HR agent advances candidate → stage sticks after reload.  
3. Hire → RBT can use HRM staff login path; CRM BCBA gets notification.  
4. CRM has no HR ATS/payroll UI in sidebar.  

---

## Implementation notes

- Edit `prisma/schema.prisma` and keep `packages/db/prisma/schema.prisma` in sync; `npm run db:generate`.  
- Deliver SQL for the user to paste in Supabase SQL Editor.  
- Touch primary files: `apps/hrm` ATS views/actions, `publicRbt`, apply form; CRM sidebar + `/portal-hr` redirects; both `notifications` actions if helper consolidation is needed.  
- Do not claim email delivery until a provider exists; expose copyable magic link in UI for Phase 1.  

---

## Decisions log

| Decision | Choice |
|----------|--------|
| Roadmap order | ATS first, then job board spine, then e-sign/Plutus |
| ATS write ownership | HRM only (CRM may read later) |
| CRM HR UI | None — separate apps; shared DB + notifications |
| Candidate model | Extend `AtsCandidate`, link `userId` on hire |
| Stage storage | Prisma only; kill localStorage stages |
| Cross-app messaging | Existing `Notification` poll; typed `type` strings |
| Hire email collision | Inactive same email → activate; active same email → error (never two Users) |
