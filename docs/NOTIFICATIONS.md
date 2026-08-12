# Notifications

Shared `Notification` rows in one Postgres DB. CRM and HRM each poll their own bell (~15s). Cross-app collaboration is **data + notifications**, not embedded UI.

Helpers (duplicated per app, Phase 1): `createNotification`, `notifyUsers` in:

- `apps/crm/src/app/actions/notifications.ts`
- `apps/hrm/src/app/actions/notifications.ts`

Unread dedupe: same `userId` + `type` + `title` + `linkUrl` within `dedupeHours` (default 24) skips a second create.

## Event matrix

| Type | Writer | Recipients | Deep link | Noise control |
|------|--------|------------|-----------|---------------|
| `JOB_APPLICATION` | HRM `applyToCaseOpening` | Client `caseCoordinatorId`, else active `CASE_COORDINATOR` | CRM `/client/[id]?mode=case-coord` | Prefer owner; no unread collapse (each apply pings) |
| `JOB_APPLICATION_WITHDRAWN` | HRM `withdrawCaseApplication` | Client `caseCoordinatorId`, else active `CASE_COORDINATOR` | CRM `/client/[id]?mode=case-coord` | Each withdrawal pings |
| `JOB_POSTED` | CRM `createCaseOpening` | Active `RBT` users | HRM `/rbt/job-board` | Skip fan-out if >30 active RBTs; 12h unread dedupe |
| `CASE_MEET_SCHEDULED` | CRM `scheduleMeetForApplication` / `updateCaseApplicationStatus` | Applicant RBT | HRM `/rbt/job-board` | Each schedule pings (includes ET time + link) |
| `CASE_APPLICATION_ACCEPTED` | CRM `acceptApplicationAsParent` | Winning applicant RBT | HRM `/rbt/job-board` | Each accept pings |
| `CASE_APPLICATION_REJECTED` | CRM `acceptApplicationAsParent` (auto-rejected others) / `declineApplicationAsParent` / `updateCaseApplicationStatus` | Rejected applicant RBT(s) | HRM `/rbt/job-board` | Each rejection pings; de-identified (case code only) |
| `NOTE_AWAITING_BCBA_SIGN` | HRM `submitHrmSessionEmrNote` | Session/client BCBA | CRM `/portal-clinical/notes` | 6h unread dedupe |
| `NOTE_READY_FOR_PLUTUS` | CRM `signSessionNotesAsBcba` | `BILLING` / `FINANCE` / `CEO` + note case coords | CRM `/notes?queue=ready` | 4h unread dedupe |
| `NOTE_BCBA_SIGNED` | CRM `signSessionNotesAsBcba` | Session RBT(s), never the signer | HRM `/rbt/payroll` | 6h unread dedupe (pay-hold release) |
| `NOTE_DEFICIENCY` | CRM `flagDeficiency` (notes) | Note author RBT, never the flagger | HRM `/rbt/schedule` | Each deficiency pings (includes description snippet) |
| `PAYROLL_REFRESH` | CRM `convertNoteToBillable` | Session `rbtId` | HRM `/rbt/payroll` | Soft; 24h unread dedupe |
| `RBT_HIRED` | HRM hire (`atsActions`) | BCBAs / case coords on staffing-pending | CRM clinical/client | Existing hire path |
| `FIRST_SESSION_SCHEDULED` | CRM `scheduleFirstTherapySession` | Client RBT + BCBA + case coord | HRM `/rbt/schedule` | Per-schedule ping |
| `CLIENT_ACTIVE` | CRM `activateClientAfterFirstSession` | Client RBT + BCBA + case coord | CRM `/client/[id]` | Per-activation ping |
| `INFO` (PA approved) | CRM `recordPaApproval` | Client `caseCoordinatorId`, else active `CASE_COORDINATOR`; never the actor | CRM `/client/[id]?mode=billing` | Only a persisted transition to `APPROVED`; 24h unread dedupe |
| `ALERT` (PA denied) | CRM `recordPaDenial` | Client `caseCoordinatorId`, else active `CASE_COORDINATOR`; never the actor | CRM `/client/[id]?mode=billing` | Only a persisted transition to the selected denial status; 24h unread dedupe |
| `INTAKE_FORMS_SUBMITTED` | CRM `submitForm01` / `submitForm02` (fires when BOTH complete) | Client `caseCoordinatorId`, else active `INTAKE_PA_COORDINATOR` | CRM `/client/[id]` | 24h unread dedupe (resubmits collapse) |
| `INTAKE_CHANGES_REQUESTED` | CRM `requestClientChanges` (parent, magic link) | Client `caseCoordinatorId`, else active `INTAKE_PA_COORDINATOR` | CRM `/client/[id]` | Each request pings (includes notes snippet) |
| `STAFF_MESSAGE` | HRM `sendRbtStaffMessage` | Message recipient | (none) | Each message pings |
| `WARNING` (action item) | CRM `createActionItem` | Assignee | CRM `/client/[id]?mode=case-coord` | 24h unread dedupe |

Links are app-relative to the recipient’s product surface (Case Coord / BCBA / billing → CRM; RBT → HRM); `lib/notificationLinks.ts` resolves cross-app at render time.

## Known non-events (deliberate)

- **Parent-facing events** (first session scheduled, report ready): parents have no bell — magic-link surfaces only.
- **Staffing readiness blocked** (`createCaseOpening` guard): the blocked case coordinator IS the actor and sees the error inline.
- **Note converted → billing**: billing is the actor of the convert; the RBT side is covered by `PAYROLL_REFRESH`.
