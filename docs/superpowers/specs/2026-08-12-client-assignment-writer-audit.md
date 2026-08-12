# Client Assignment Writer Audit

**Date:** 2026-08-12  
**Mode:** read-only, point-in-time static audit  
**Scope:** Prisma writers under `apps/crm` and `apps/hrm` that directly change `Client.bcbaId`, `Client.rbtId`, `Client.caseCoordinatorId`, or `Client.rbtApproved`; create/change `Session.rbtId` or `Session.bcbaId`; or select a marketplace application in a way that establishes/clears an effective assignment.

## Executive summary

- **18 distinct action-level writers** were found after de-duplicating paths and collapsing repeated branches inside each action.
- **15 production-capable writers are unsafe or incomplete:** 10 High and 5 Medium.
- **2 additional writers are Low because they are demo seeders with an explicit non-production fence.**
- **1 writer is the already-hardened baseline:** `updateClientCaseCoordinator` in `apps/crm/src/app/actions/hr.ts`. It is inventoried for completeness but is not repeated as a remediation finding.
- No raw SQL assignment writer was found. The `$queryRaw` calls in scope are health/connectivity probes, not mutations.

The central problem is fragmented ownership. Assignment authority is spread across legacy CRM actions, case-opening actions, clinical actions, first-session scheduling, HRM session submission/clock-in, and two seeders. Most paths do not enforce the same combination of resource ownership, active role-qualified staff, canonical client status, expected-current compare-and-set, and audit logging.

## Top three findings

1. **High — HRM `logSession` can manufacture a completed assigned session and signed note without authentication.** `apps/hrm/src/app/(dashboard)/rbt/actions.ts:6-55` has no auth call at all; caller-supplied `clientId`, `rbtId`, and `bcbaId` become persisted assignment relationships with `Session.status = COMPLETED` and `SessionNote.rbtSigned = true`.
2. **High — Session Studio can claim or rewrite effective session assignment without client-team ownership.** `submitHrmSessionEmrNote` and `clockInHrmSession` in `apps/hrm/src/app/actions/sessionEmrActions.ts` protect a resolved RBT identity, but do not consistently require that the session/client belongs to that RBT. A null `Session.rbtId` is claimable, and Studio submit can create an unscheduled completed session from caller-selected client context.
3. **High — the CRM legacy/portal assignment chain bypasses the hardened writer.** `assignStaff` in `apps/crm/src/app/(dashboard)/case/actions.ts:8-44` and RBT approval/rejection in `apps/crm/src/app/(dashboard)/portal-case/actions.ts:494-526` mutate assignment state with broad role checks but no resource ownership, active target validation, expected-current value, or canonical assignment-state transition.

## Counting and method

The writer count is by exported/server-action function, not by individual Prisma statement. A function with several writes in one transaction is one writer. The two demo seeders each count once even though each contains multiple create/update branches.

The audit searched both apps for:

- Prisma `create`, `update`, `upsert`, and `updateMany`;
- raw-query APIs;
- assignment field names and shorthand variables;
- related `Session`, `CaseOpening`, and `CaseApplication` mutations;
- all current imports/call sites for each exported action.

The root and package schema copies were checked for parity. `Client.bcbaId`, `Client.rbtId`, and `Client.caseCoordinatorId` are singular optional relation fields (each client has at most one staff member in each slot), while each staff user can relate to many clients and sessions. `Client.sessions` and `User.sessionsAsRbt` / `sessionsAsBcba` are one-to-many. `CaseOpening.selectedApplication` is derived from an approved application rather than stored as a scalar selection ID.

### Conservative inclusion/exclusion rules

- Included `Session.bcbaId` alongside `Session.rbtId` because both establish the effective treatment-team relationship on a clinical record.
- Included the `CaseApplication` transition to `PARENT_PENDING`, because it selects the candidate presented to the parent even before `Client.rbtId` changes.
- Excluded standalone `CaseApplication` writes limited to `APPLIED`, `MESSAGING`, `MEET_SCHEDULED`, or `WITHDRAWN`; those express applicant/screening state but do not select the parent-facing or accepted candidate. W03 remains included because that same generic action can write `PARENT_PENDING`.
- Excluded `Session` updates that do not write an assignment field.
- No `ScheduleAppointment.create/update/upsert/updateMany` writer exists in either app. The two `RbtOnboarding.update` sites only touch `updatedAt`, not `rbtId`, so they are not relationship writers.

## Required canonical mutation contract

Every production assignment mutation should use one shared transaction/service contract:

1. Authenticate an active actor and authorize the specific operation.
2. Enforce resource scope for the client/session/opening, not only a broad role allowlist.
3. Resolve the target staff row server-side and require `isActive` plus the exact assignment role.
4. Validate the canonical client/opening/application/session transition.
5. Require an `expectedCurrentId` or expected status/version and perform the mutation with a conditional `updateMany`.
6. Treat a zero-row update as a stale-write conflict.
7. Keep all coupled rows in the same transaction.
8. Write an assignment audit record containing actor, subject, previous value, next value, reason/source, and correlation ID.
9. Emit notifications only after the transaction succeeds.

For RBT marketplace acceptance, selection, `Client.rbtId`, `rbtApproved`, opening closure, and competing-application rejection must be one guarded transaction. For session assignment, scheduled-session ownership and any one-time null claim need a dedicated compare-and-set operation; note submission must not silently become an assignment API.

## Writer inventory: authorization and ownership

| ID | Writer and persisted relationship | Current caller/UI | Auth and resource scope | Active target validation | Fence | Rating |
|---|---|---|---|---|---|---|
| W01 | `updateClientCaseCoordinator` — `client.updateMany({ caseCoordinatorId })` at `apps/crm/src/app/actions/hr.ts:225-326` (mutation `:290-296`) | `ClientAssignmentsTab.tsx` (`updateClientCaseCoordinator`) | `requireStaff(CASE_COORD_ROLES)` plus `requireClientAccess`; leadership/intake/clinical-support managers may manage any assignment, while an ordinary coordinator may manage only self-owned or unassigned clients | Yes: target must be active and have exact `CASE_COORDINATOR` role | Production | **Hardened baseline** |
| W02 | `createCaseOpening` — creates an opening and conditionally initializes `Client.caseCoordinatorId` at `apps/crm/src/app/actions/caseOpeningActions.ts:84-261` (client write `:140-143`) | `ClientJobBoardPanel.tsx`; `CaseOpeningsMarketplace.tsx` | `requireStaff(CASE_COORD_ROLES)` only; no `requireClientAccess(clientId)`, owning-coordinator check, or opening-level scope | Actor is active via `requireStaff`, but `createdById` is accepted as coordinator without requiring exact `CASE_COORDINATOR` role | Production | **Medium** |
| W03 | `updateCaseApplicationStatus` — can select a candidate by writing `CaseApplication.status = PARENT_PENDING` at `apps/crm/src/app/actions/caseOpeningActions.ts:325-381` (write `:341-345`) | `ClientJobBoardPanel.tsx`; `CaseOpeningsMarketplace.tsx` | `requireStaff(CASE_COORD_ROLES)` only; no `requireClientAccess(opening.clientId)` or owning-coordinator check | Applicant employment/activity is not revalidated | Production | **Medium** |
| W04 | Misnamed `acceptApplicationAsParent` — staff-recorded decision writes `Client.rbtId/rbtApproved`, selected application `APPROVED`, opening `FILLED`, and competitors `REJECTED` at `apps/crm/src/app/actions/caseOpeningActions.ts:545-631` (writes `:578-596`) | `ClientJobBoardPanel.tsx`; `CaseOpeningsMarketplace.tsx` | `requireStaff(CASE_COORD_ROLES)` only; despite the name, there is no magic-link parent guard, client access check, or owning-coordinator check | No active RBT/role/eligibility revalidation at acceptance time | Production | **High** |
| W05 | Misnamed `declineApplicationAsParent` — staff-recorded decision rejects the application and may clear `Client.rbtId/rbtApproved` at `apps/crm/src/app/actions/caseOpeningActions.ts:635-683` (writes `:646-657`) | `ClientJobBoardPanel.tsx`; `CaseOpeningsMarketplace.tsx` | `requireStaff(CASE_COORD_ROLES)` only; despite the name, there is no magic-link parent guard, client access check, or owning-coordinator check | No active target check; clearing is based on a separate prior read | Production | **High** |
| W06 | `assignClinicalTeam` — writes `Client.bcbaId` and `Client.caseCoordinatorId` at `apps/crm/src/app/(dashboard)/portal-case/actions.ts:372-400` (write `:383-389`) | No current import found; dormant exported action | `requireStaff(INTAKE_ROLES)` only; no client portfolio/access check | No target lookup, active check, or role check | Production-capable, not fenced | **Medium** |
| W07 | `assignCaseCoordinator` — writes `Client.caseCoordinatorId` at `apps/crm/src/app/(dashboard)/portal-case/actions.ts:469-492` (write `:478-481`) | Stale import in `IntakeQueue.tsx`; no invocation found | `requireStaff(CASE_COORD_ROLES)` only; no client portfolio/access check | No target lookup, active check, or role check | Production-capable, not fenced | **Medium** |
| W08 | `approveRbtCandidate` — writes `Client.rbtApproved = true` at `apps/crm/src/app/(dashboard)/portal-case/actions.ts:494-513` (write `:503-506`) | `CaseCoordClientsView.tsx` | `requireStaff(CASE_COORD_ROLES)` only; no client portfolio/access check | No RBT lookup, active check, role check, selected-application check, or equality check against `Client.rbtId` | Production | **High** |
| W09 | `rejectRbtCandidate` — clears `Client.rbtId` and writes `rbtApproved = false` at `apps/crm/src/app/(dashboard)/portal-case/actions.ts:515-533` (write `:520-526`) | `CaseCoordClientsView.tsx` | `requireStaff(CASE_COORD_ROLES)` only; no client portfolio/access check | No target/current-assignment validation | Production | **High** |
| W10 | `assignBcba` — writes `Client.bcbaId` at `apps/crm/src/app/(dashboard)/portal-clinical/actions.ts:95-122` (write `:110-113`) | `ClientProfileTabs.tsx`; `BcbaDashboard.tsx`; `BcbaMetricsDashboard.tsx` | `requireStaff(CLINICAL_ROLES)` only; no clinical caseload/client access check | No: the action never loads the target user; active BCBA options in UI are not a server-side invariant | Production | **High** |
| W11 | `assignStaff` — writes both `Client.rbtId` and `Client.bcbaId` at `apps/crm/src/app/(dashboard)/case/actions.ts:8-36` (write `:21-27`) | `CasePipelineClient.tsx` | `requireStaff(CASE_COORD_ROLES)` only; no client access/ownership check | No active or role-qualified target validation; trusts form IDs | Production | **High** |
| W12 | `scheduleFirstTherapySession` — creates `Session.rbtId/bcbaId` from the client assignment at `apps/crm/src/app/actions/firstSessionActions.ts:39-159` (create `:114-125`) | `CaseCoordSchedulingTab.tsx` | `getCurrentUser()` authentication only; no staff-role or client-access authorization | Only checks assignment IDs are non-null; no active/role check and no `rbtApproved` requirement | Production | **High** |
| W13 | `scheduleAssessment` — creates an assessment `Session.bcbaId` at `apps/crm/src/app/(dashboard)/portal-case/actions/clinical-support.ts:28-89` (create `:61-72`) | Directly called by `BcbaAssessmentTab.tsx`; also called through the scoped wrapper in `apps/crm/src/app/(dashboard)/clinical-support/actions.ts` | Canonical action uses `requireStaff(CLINICAL_ROLES)` but no client access; the wrapper adds `requireClientAccess`, while the direct UI import bypasses the wrapper | Does not require a BCBA at all and does not revalidate active BCBA role; a session with null `bcbaId` can be created | Production | **Medium** |
| W14 | `logSession` — creates `Session.rbtId/bcbaId` and an RBT-signed `SessionNote` at `apps/hrm/src/app/(dashboard)/rbt/actions.ts:6-55` (session create `:22-32`) | `RbtPipelineClient.tsx` | **No authentication or authorization guard** | No validation of caller-supplied client/RBT/BCBA | Production | **High** |
| W15 | `submitHrmSessionEmrNote` — creates or updates `Session.rbtId/bcbaId` while submitting Studio data at `apps/hrm/src/app/actions/sessionEmrActions.ts:423-1049` (update `:899-911`, create `:913-928`) | `RbtSessionStudio.tsx`; legacy `RbtDataCollectionEngine.tsx` | `resolveActingRbtContext` resolves an RBT identity and rejects a different non-null scheduled RBT, but a null assignment and an unscheduled client remain claimable; there is no client-team access check | Looks up exact role `RBT`, but not `isActive`; BCBA ID is server-derived from the scheduled session/client but not revalidated as an active BCBA | Production | **High** |
| W16 | `clockInHrmSession` — writes `Session.rbtId` when null at `apps/hrm/src/app/actions/sessionEmrActions.ts:1055-1150` (update `:1093-1107`) | `RbtSessionStudio.tsx` | `resolveActingRbtUserId()` rejects a different non-null RBT, but allows a null assignment to be claimed; no client-team access check | No explicit active/role revalidation in the action | Production | **High** |
| W17 | CRM `devSeedConnectedProductDemo` — demo `Client` update/create at `apps/crm/src/app/actions/devTools.ts:198-236` and `Session` update/create at `:322-345` write the assignment fields (function `:141-378`) | `DevToolsUI.tsx` via `DevToolsWrapper.tsx` | No staff auth; action is protected by the dev-tools environment gate and demo marker | Seeds/upserts known demo users; not a production assignment contract | `isDevToolsEnabled()`: explicit flag and `NODE_ENV !== production`; production misconfiguration throws at boot | **Low / fenced** |
| W18 | HRM `devSeedConnectedProductDemo` — demo `Client` update/create at `apps/hrm/src/app/actions/devTools.ts:616-654` and `Session` update/create at `:707-730` write the assignment fields (function `:559-759`) | `HrmDevToolsUI.tsx` | No staff auth; action is protected by the same dev-tools environment gate and demo marker | Seeds/upserts known demo users; not a production assignment contract | `isDevToolsEnabled()`: explicit flag and `NODE_ENV !== production`; production misconfiguration throws at boot | **Low / fenced** |

### Exact Prisma mutation-site index

This is the de-duplicated static call-site list behind W01–W18:

- **W01:** `client.updateMany` — `apps/crm/src/app/actions/hr.ts:290-296`
- **W02:** `client.update` — `apps/crm/src/app/actions/caseOpeningActions.ts:140-143`; coupled `caseOpening.create` — `:186-212`
- **W03:** `caseApplication.update` — `apps/crm/src/app/actions/caseOpeningActions.ts:341-345`
- **W04:** `client.update` — `apps/crm/src/app/actions/caseOpeningActions.ts:579`; `caseApplication.update` — `:580-583`; `caseOpening.update` — `:584-587`; competing `caseApplication.updateMany` — `:588-595`
- **W05:** `caseApplication.update` — `apps/crm/src/app/actions/caseOpeningActions.ts:646-649`; conditional-after-read `client.update` — `:654-657`
- **W06:** `client.update` — `apps/crm/src/app/(dashboard)/portal-case/actions.ts:383-389`
- **W07:** `client.update` — `apps/crm/src/app/(dashboard)/portal-case/actions.ts:478-481`
- **W08:** `client.update` — `apps/crm/src/app/(dashboard)/portal-case/actions.ts:503-506`
- **W09:** `client.update` — `apps/crm/src/app/(dashboard)/portal-case/actions.ts:520-526`
- **W10:** `client.update` — `apps/crm/src/app/(dashboard)/portal-clinical/actions.ts:110-113`
- **W11:** `client.update` — `apps/crm/src/app/(dashboard)/case/actions.ts:21-27`
- **W12:** `session.create` — `apps/crm/src/app/actions/firstSessionActions.ts:114-125`
- **W13:** `session.create` — `apps/crm/src/app/(dashboard)/portal-case/actions/clinical-support.ts:62-72`
- **W14:** `session.create` — `apps/hrm/src/app/(dashboard)/rbt/actions.ts:22-32`
- **W15:** mutually exclusive `session.update` / `session.create` branches — `apps/hrm/src/app/actions/sessionEmrActions.ts:899-928`
- **W16:** `session.update` — `apps/hrm/src/app/actions/sessionEmrActions.ts:1093-1107`
- **W17:** `client.update` / `client.create` — `apps/crm/src/app/actions/devTools.ts:198-236`; `session.update` / `session.create` — `:322-345`
- **W18:** `client.update` / `client.create` — `apps/hrm/src/app/actions/devTools.ts:616-654`; `session.update` / `session.create` — `:707-730`

No qualifying assignment `upsert`, raw mutation, or `ScheduleAppointment` mutation was found.

## Writer inventory: concurrency, status, and side effects

| ID | Expected-current / race protection | Canonical status gate | Audit and notification side effects |
|---|---|---|---|
| W01 | Yes. Caller provides `expectedCaseCoordinatorId`; conditional `updateMany` rejects stale state | Assignment is explicit and independent of a client pipeline-status transition | No dedicated assignment audit/notification observed; not reopened in this audit |
| W02 | No. Reads `caseCoordinatorId === null`, then updates by client ID only; opening create and client assignment are not one transaction | Opening creation checks client stage/readiness, but coordinator initialization has no canonical assignment transition helper | Notifies a bounded active-RBT roster about the opening; no assignment audit |
| W03 | No expected application/opening status in the write predicate | Partial transition rules exist, but `PARENT_PENDING` is accepted as a requested status without a dedicated from-state/one-selected-candidate invariant | Notifications for some application outcomes; no audit and no parent-pending selection event |
| W04 | Multi-row transaction, but no compare-and-set on opening/application/client current state; concurrent accepts can race | Only a pre-read of `opening.status === OPEN`; **no required application status**, selected-candidate invariant, or conditional transition | Notifies selected RBT and competing applicants; no assignment audit |
| W05 | Not transactional. Application rejection commits before a separate client read/write; clear-after-read is not conditional on the expected RBT | No required application/opening status. An accepted/approved client RBT is left in place even after the application is rejected | Notifies applicant; no assignment audit |
| W06 | No expected `bcbaId` or `caseCoordinatorId`; overwrites both in one ordinary update | None | None |
| W07 | No expected current coordinator | None | Deletes **all** `ClientMessage` rows for the client after assignment; no audit/notification |
| W08 | No expected `rbtId`, expected approval flag, application, or opening status | None | None |
| W09 | No expected current RBT; can clear a newly changed assignment | None | None |
| W10 | No expected current BCBA | Uses `canAssignBcbaAtStatus`, which is the strongest BCBA status gate found | None |
| W11 | No expected current RBT/BCBA | None; assignment can occur at any client status | None |
| W12 | No duplicate/race protection. The `existingFirst` query only changes response/notification wording; the action always creates another session | Partial: client must be `STAFFING_PENDING` or `ACTIVE` and both IDs must exist; does not require approved RBT/readiness | Notifies assigned RBT/BCBA/coordinator; no assignment audit |
| W13 | No duplicate/race protection; each call creates another assessment session | Partial pre-read: allows `PA_APPROVED` or `ASSESSMENT_SCHEDULED`, but neither session create nor client update conditionally binds the expected current status | None |
| W14 | No expected session/current assignment; creates a fresh completed session | Hardcodes `COMPLETED`; bypasses scheduled → in-progress → completed workflow | Creates a signed note but no security/assignment audit or notification |
| W15 | A transaction covers session/note/data writes, but null-assignment updates are not compare-and-set; unscheduled create derives the client from request context | Studio validation covers note completeness, not canonical client-assignment ownership; even a terminal scheduled row can be updated to `COMPLETED` | Writes a best-effort PHI `SIGN` audit **after** the transaction and notifies the BCBA; neither is an atomic assignment audit |
| W16 | Read then update by session ID; concurrent null claims can both pass and last write wins | Blocks `COMPLETED/CANCELLED/NO_SHOW`, but accepts other states and does not require canonical `SCHEDULED` ownership | Best-effort EVV-log create; no assignment audit/notification |
| W17 | Demo-marker/upsert behavior gives practical idempotency, not assignment compare-and-set semantics | Demo setup only | Creates a connected demo graph; no production assignment audit |
| W18 | Demo-marker/upsert behavior gives practical idempotency, not assignment compare-and-set semantics | Demo setup only | Creates a connected demo graph; no production assignment audit |

## Exact ownership-safe remediation by file

### High

#### `apps/hrm/src/app/(dashboard)/rbt/actions.ts`

- Remove or server-disable `logSession`; route the UI to Session Studio's scheduled-session submit path.
- If temporary compatibility is required, discard caller-supplied `rbtId`/`bcbaId`, resolve the active RBT from the authenticated user, load the scheduled session plus client team, require `session.rbtId === actor.rbtId`, and call one canonical completion service.
- Never create a directly `COMPLETED` session or signed note without the same status, ownership, note-validation, and audit rules as Studio.

#### `apps/hrm/src/app/actions/sessionEmrActions.ts`

- In `submitHrmSessionEmrNote`, require an existing scheduled session for production submission. Load session, client, active client-team assignments, and actor in the transaction; require self-assignment for an RBT. Leadership override must include an explicit target RBT and auditable reason.
- Preserve the scheduled session's BCBA for existing rows and require it to be an active BCBA authorized for that client. For the explicit unscheduled exception workflow, derive BCBA from a freshly loaded active client team; display-only `supervisingBcba` text must never become identity authority.
- If unscheduled/offline capture remains necessary, create a separate exception workflow with an explicit permission and review queue; do not let note submission silently assign the session.
- In `clockInHrmSession`, require `SCHEDULED`, active RBT, client-team eligibility, and `rbtId` equal to the actor. If null claims are a supported scheduling workflow, use `updateMany({ where: { id, status: 'SCHEDULED', rbtId: null }, data: ... })` and reject a zero-row race. Otherwise reject null.
- Add assignment/status audit rows in the same transaction and notify after commit.

#### `apps/crm/src/app/(dashboard)/case/actions.ts`

- Retire `assignStaff` as a direct Prisma writer. Split RBT and BCBA intents and delegate to canonical assignment services.
- Require `requireClientAccess(clientId)` plus operation-specific ownership, validate active role-qualified targets, require expected current ID, and apply the canonical client status gate.
- Do not let membership in the broad `CASE_COORD_ROLES` allowlist, by itself, imply authority to assign either clinical role.

#### `apps/crm/src/app/(dashboard)/portal-case/actions.ts`

- Replace `assignClinicalTeam` with two canonical mutations; each must carry its own expected-current ID, role-qualified active target, resource ownership rule, and status gate.
- Replace `assignCaseCoordinator` with the hardened `updateClientCaseCoordinator` contract rather than preserving a second writer.
- Remove the unrelated `clientMessage.deleteMany({ where: { clientId } })` side effect from coordinator assignment. Assignment must never erase the client's message history.
- Replace `approveRbtCandidate` with a marketplace-aware transaction that requires the exact selected application, opening status, `Client.rbtId`, expected `rbtApproved`, active eligible RBT, readiness criteria, and caller's client/opening scope.
- Make `rejectRbtCandidate` conditional on the expected RBT and approval state. Update/restore opening/application state in the same transaction so a rejected client assignment cannot disagree with an approved application or filled opening.
- Write an audit event and generate notifications from persisted previous/next values, never a caller-supplied notification target.

#### `apps/crm/src/app/(dashboard)/portal-clinical/actions.ts`

- Keep `canAssignBcbaAtStatus`, then add clinical resource scope (director/leadership global authority or explicit client/caseload authority).
- Require `expectedBcbaId`, active `BCBA` target, and conditional `updateMany` matching both expected BCBA and allowed status.
- Return a stale-conflict result on zero rows and record previous/next BCBA plus actor in the audit log.

#### `apps/crm/src/app/actions/caseOpeningActions.ts`

- Both misleadingly named actions are staff actions today. Either implement a real `requireMagicLinkClientAccess` parent-decision endpoint, or rename them as staff recording actions and require owning-coordinator/leadership scope plus evidence of the parent decision.
- `acceptApplicationAsParent`: in one transaction, re-read and conditionally transition exactly one `PARENT_PENDING` application on an `OPEN` opening; require the applicant still maps to an active eligible RBT; conditionally set the client's expected RBT/approval; fill the opening and reject competitors. Fail the whole transaction on any zero-row transition.
- `declineApplicationAsParent`: move application rejection and any client clear into one transaction; conditionally reject the expected pending/approved application and clear the client only when `Client.rbtId` still equals that applicant. Reopen or otherwise normalize the opening according to the canonical marketplace state machine.
- Persist parent-selection/decline and assignment audit events; dispatch current notifications only after successful commit.

#### `apps/crm/src/app/actions/firstSessionActions.ts`

- Replace `getCurrentUser()` with `requireStaff` using the actual scheduling roles, then require client access/case-coordinator ownership.
- Require `STAFFING_PENDING`, `rbtApproved === true`, active role-qualified RBT and BCBA, and expected assignment IDs.
- In one transaction, conditionally claim the first-session transition and create a unique scheduled session; reject stale assignment/status or a duplicate. The current `existingFirst` read is presentation-only and must not be treated as duplicate protection.

### Medium

#### `apps/crm/src/app/actions/caseOpeningActions.ts`

- `createCaseOpening`: initialize `caseCoordinatorId` only through the canonical coordinator service or a conditional `updateMany` where the current coordinator is null. Validate that the actor is active and role-qualified before using the actor ID as coordinator. Couple opening create and any initialization in one transaction.
- `updateCaseApplicationStatus`: add `requireClientAccess(opening.clientId)` or explicit owning-coordinator/leadership policy. Encode allowed from/to transitions, require only one `PARENT_PENDING` application per opening, and use an expected status in the update predicate.

#### `apps/crm/src/app/(dashboard)/portal-case/actions.ts`

- Remove the dormant `assignClinicalTeam` export and the unused `assignCaseCoordinator` import/path after callers have migrated. Until removal, make both delegate to canonical services so an unreferenced export cannot remain an alternate API.

#### `apps/crm/src/app/(dashboard)/portal-case/actions/clinical-support.ts`

- Expose only one assessment scheduling action. Put `requireClientAccess` in the canonical implementation rather than relying on an optional wrapper.
- Revalidate the assigned BCBA as active/role-qualified and create only when client status and expected BCBA still match. Use a database uniqueness/conditional claim for duplicate assessment scheduling.

### Low / fenced

#### `apps/crm/src/app/actions/devTools.ts` and `apps/hrm/src/app/actions/devTools.ts`

- Keep the current two-factor environment fence (`NODE_ENV !== production` plus explicit flag) and boot-time production assertion.
- Add a focused test that production mode rejects the flag and that each seeder fails before its first Prisma call when disabled.
- Keep demo rows marker-scoped. Do not reuse either seeder as a production fixture or assignment helper.

### Already hardened; do not reopen in this pass

`apps/crm/src/app/actions/hr.ts` and `apps/crm/src/components/client-profile/tabs/ClientAssignmentsTab.tsx` already implement the expected-current coordinator handoff and restricted ordinary-coordinator ownership. Future consolidation should call that contract; it should not be replaced by one of the weaker portal writers.

## Minimal regression test matrix

| Test | Level | Required assertion |
|---|---|---|
| Coordinator stale handoff | Server-action integration | A mismatched `expectedCaseCoordinatorId` changes zero rows and returns conflict |
| Opening coordinator initialization race | Transaction/service | Two concurrent creates cannot overwrite a coordinator assigned between read and write |
| Candidate selection ownership | Server-action integration | Non-owning staff cannot move an application to `PARENT_PENDING`; leadership policy remains explicit |
| Parent accept race | Transaction/service | Two concurrent accepts yield one approved application, one filled opening, and one matching approved client RBT |
| Parent decline stale clear | Transaction/service | Declining applicant A cannot clear a client already reassigned to RBT B |
| Resource-scope denial | Parameterized action test | Every production Client assignment writer rejects an allowed-role actor without client/opening ownership |
| Target eligibility | Parameterized service test | Inactive or wrong-role coordinator/RBT/BCBA is rejected without writes |
| Canonical client status | Parameterized service test | BCBA, RBT, and first-session mutations reject all disallowed client statuses |
| RBT approval/readiness | First-session integration | First session cannot be created when `rbtApproved` is false or either assigned clinician is inactive |
| Legacy HRM write denial | Action test | `logSession` cannot use caller-supplied staff IDs or directly manufacture a completed signed record |
| Studio scheduled ownership | Action/transaction integration | RBT A cannot submit or clock into RBT B's session or a client outside A's assignment |
| Studio null-claim race | Transaction integration | Two simultaneous null claims produce one winner; the loser receives a stale conflict |
| BCBA integrity | Studio action test | A stale/inactive scheduled or client BCBA is rejected; display-name input cannot alter persisted BCBA identity |
| Audit atomicity | Transaction integration | Successful assignment writes one previous/next audit event; failed/stale writes emit neither audit nor notification |
| Dev fence | Unit test | Production plus dev flag fails at boot; disabled seed actions make zero Prisma calls |

The smallest useful implementation order is: shared mutation-contract unit tests, marketplace transaction tests, HRM scheduled-session ownership tests, then action-level authorization tests for each remaining facade.

## Active-workstream wait zones

The worktree contains extensive same-day modifications and untracked replacements. Follow-up fixes should **wait for those workstreams to settle** rather than editing through them:

1. **Hardened coordinator baseline — do not touch:**  
   `apps/crm/src/app/actions/hr.ts`  
   `apps/crm/src/components/client-profile/tabs/ClientAssignmentsTab.tsx`
2. **Case-opening marketplace workstream:**  
   `apps/crm/src/app/actions/caseOpeningActions.ts`  
   `apps/crm/src/components/client-profile/tabs/ClientJobBoardPanel.tsx`  
   `apps/crm/src/components/portal-case-coord/CaseOpeningsMarketplace.tsx`
3. **CRM case/clinical assignment workstream:**  
   `apps/crm/src/app/(dashboard)/case/actions.ts`  
   `apps/crm/src/app/(dashboard)/portal-case/actions.ts`  
   `apps/crm/src/app/(dashboard)/portal-clinical/actions.ts`  
   `apps/crm/src/components/case/CasePipelineClient.tsx`  
   `apps/crm/src/components/portal-case-coord/CaseCoordClientsView.tsx`  
   `apps/crm/src/components/portal-clinical/BcbaDashboard.tsx`  
   `apps/crm/src/components/portal-clinical/BcbaMetricsDashboard.tsx`
4. **Assessment/first-session workstream:**  
   `apps/crm/src/app/actions/firstSessionActions.ts`  
   `apps/crm/src/app/(dashboard)/portal-case/actions/clinical-support.ts`  
   `apps/crm/src/app/(dashboard)/clinical-support/actions.ts`  
   `apps/crm/src/components/client-profile/tabs/BcbaAssessmentTab.tsx`  
   `apps/crm/src/components/client-profile/tabs/CaseCoordSchedulingTab.tsx`  
   `apps/crm/src/components/portal-case-coord/StaffingReadinessChecklist.tsx`
5. **HRM Session Studio workstream:**  
   `apps/hrm/src/app/(dashboard)/rbt/actions.ts`  
   `apps/hrm/src/app/actions/sessionEmrActions.ts`  
   `apps/hrm/src/lib/resolveActingRbt.ts`  
   `apps/hrm/src/components/rbt/RbtPipelineClient.tsx`  
   `apps/hrm/src/components/rbt/RbtSessionStudio.tsx`  
   `apps/hrm/src/components/emr/RbtDataCollectionEngine.tsx`
6. **Connected-demo workstream:**  
   `apps/crm/src/app/actions/devTools.ts`  
   `apps/hrm/src/app/actions/devTools.ts`  
   both apps' `DevToolsUI.tsx`, `DevToolsWrapper.tsx`, and `devToolsGate.ts`

Deleted legacy components observed in the worktree should not be restored to preserve an old caller. In particular, do not revive deleted CRM-side RBT/HRM portal files to fix a call path; current ownership is moving to `apps/hrm`.

## Limitations and handoff

- This is a static source audit, not a runtime authorization or concurrency test.
- Line numbers are point-in-time references and may move as active workstreams land.
- Dynamic Prisma access assembled outside the explicit field/method searches was not observed.
- Database triggers or external writers are outside this two-app source scope.
- Before remediation, re-read the settled version of each wait-zone file and preserve the hardened `hr.ts` behavior as the coordinator baseline.
