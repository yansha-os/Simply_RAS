# Server Action and API Contract Catalog

**Snapshot:** 2026-08-12 working tree, including the latest same-day CRM and HRM changes

**Scope:** exported functions in real `'use server'` modules plus exported HTTP methods under `apps/{crm,hrm}/src/app/api/**`

**Inventory:** **220 Server Actions in 57 modules** and **5 route handlers**

| App | Server Actions | Action modules | Route handlers |
|---|---:|---:|---:|
| CRM | 115 | 32 | 4 |
| HRM | 105 | 25 | 1 |
| **Total** | **220** | **57** | **5** |

`apps/hrm/src/lib/atsStage.ts` is not an action module: its mention of `'use server'` is in a warning comment. Exported types and non-exported helpers are also excluded.

## How to read this catalog

- **Staff** means the action calls `requireStaff(...)`, `requireRole(...)`, or performs an equivalent current-user check.
- **Client** means client-scoped authorization, normally `requireClientAccess(clientId)`.
- **Device** means HRM applicant/RBT ownership is proven by a hashed, expiring `ApplicantDeviceSession` token. **Weak acting context** means the older fallback resolver accepts a raw candidate-id cookie or broad current-user fallback.
- **OK/ERR** is the dominant `{ success: true, ... } | { success: false, error, ... }` envelope.
- **Throw** means a caller may receive a rejected Server Action promise rather than a typed failure value.
- **RV** means `revalidatePath`.
- **Audit** means a durable `writeAuditLog`/credential audit/onboarding signature event, not merely `console.error`.
- Routine inventory rows omit declaration lines because same-day work was still moving code. Finding locations identify the exact relevant guard or branch in the final rescan.

This is a contract inventory, not an assertion that every currently public or weakly guarded surface is intended to remain so.

## Public-by-design and token-scoped surfaces

### CRM

- `login` is the unauthenticated credential entry point; success is a redirect. When the central dev-tools gate is enabled, email-pattern shortcuts redirect before rate limiting or Supabase password verification.
- `submitMagicLinkPacket` and the parent branches of `saveIntakeProgress`, `submitForm01`, `submitForm02`, `signTreatmentPlan`, and `saveClientSchedule` are magic-link packet scoped.
- Parent messaging and parent document access use `requireStaffOrParent` or `requireParentPacketAccess`.
- `GET /api/documents` accepts either client-authorized staff or the current bound parent packet session and constrains the storage path to that client.
- `POST /api/upload` intentionally supports packet-token uploads, but its staff branch currently lacks client-resource authorization (F12).
- `GET /api/health` is intentionally public and reports only app/time/DB health.

### HRM

- `login` and `submitRbtApplication` are unauthenticated entry points. HRM login has the same dev-only, pre-rate-limit email-pattern shortcuts as CRM.
- `bindMagicLinkSession` exchanges a valid ATS magic-link token for an opaque hashed device session.
- Applicant availability, self-booking, wage-offer, onboarding, help-desk, and candidate-document workflows are intended for an applicant/RBT principal. Newer actions use verified device sessions; several legacy surfaces still use weak acting context or raw candidate cookies (F4, F9, F10).
- `attachApplicantDocuments` is upload-token scoped.
- `GET /api/health` is intentionally public.
- `listOpenCaseOpeningsForRbt` is currently unauthenticated, but the source does not mark that exposure public-by-design; it is therefore listed as a guard gap (F18).

## Top-priority normalization backlog

### P0 — close authorization and ownership bypasses

1. **Remove caller-controlled security options.** Split `hireCandidate` into a guarded exported action and a non-exported trusted service; never accept `skipLs54Gate` from the client (F3).
2. **Require an authenticated principal on every exported write.** Guard notification writers and legacy RBT note mutations; add ownership/resource authorization to legacy interview, case/signature, deficiency, and action-item mutations (F1, F5, F9, F13, F22, F23).
3. **Replace weak acting context everywhere.** Require a verified `ApplicantDeviceSession` or a role-authorized staff-on-behalf-of path; remove authorization based on raw candidate-id cookies (F4, F10, F11, F19).
4. **Fix public reapplication ownership.** A repeated email must not update an existing ATS record and return its reusable token without proof of mailbox/session ownership (F2).
5. **Enforce client assignment/access in clinical and session flows.** Apply `requireClientAccess` or an explicit agency-wide privilege to CRM clinical reads, first-session mutations and BCBA note signing, plus HRM Session Studio client operations (F6, F7, F8, F14, F21).
6. **Scope staff uploads and job-board writes.** Validate staff access to `clientId`; require a verified RBT principal for listings/profile writes and reject ambiguous fallback identity (F12, F18).
7. **Retire duplicate unsafe APIs.** Route all interview booking through the verified-device implementation and delete or make private the older exported equivalents (F9).

### P1 — create one typed RPC contract

8. Adopt a discriminated result everywhere:

   `ActionResult<T, C> = { ok: true; data: T } | { ok: false; error: { code: C; message: string; fieldErrors?: Record<string, string[]> } }`.

   Reserve thrown redirects/not-found responses for framework control flow. Do not return raw `Error.message`.
9. Validate every boundary with shared schemas. Derive `Input`/`Output` types from Zod (or equivalent), including UUIDs, enums, dates, `FormData`, file size/MIME, pagination, and JSON payload limits.
10. Build typed authorization contexts: `public`, `staff(roles)`, `staffClient(roles, clientId)`, `applicantDevice`, `rbtDevice`, and `magicLinkPacket`. A procedure must choose exactly one context before executing business logic.
11. Move domain mutation logic into non-exported services. Server Actions and route handlers should become thin transports that parse, authorize, invoke, map domain errors, and declare effects.
12. Standardize stable error codes (`UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_FAILED`, `CONFLICT`, `PRECONDITION_FAILED`, `INTERNAL`) and stop treating unauthenticated reads as successful empty data.
13. Return one payload key (`data`) and one boolean key (`ok`). Current variants include `success`, `status`, `message`, `notifications`, `items`, `metrics`, bare arrays, strings, and objects.

### P1 — make effects observable and reliable

14. Define per-procedure effect metadata: revalidation tags/paths, audit event, notification event, idempotency key, and transaction boundary.
15. Add PHI audit coverage for document views/uploads, clinical queue/chart/target reads, legacy signature toggles, and case-message access. Preserve the existing report, note-signing, deficiency, and conversion audits. Do not log tokens, signatures, file contents, or clinical payloads.
16. Put the state mutation and outbox event in one transaction; dispatch notifications from an outbox so a notification failure cannot create a misleading partial result.

### P2 — align HTTP routes and generated clients

17. Give routes the same schema, error codes, and auth contexts as actions; normalize JSON status mapping (`400/401/403/404/409/422/500`) and document non-JSON file responses separately.
18. Generate a procedure registry/OpenAPI-like manifest from the schemas. Use it for typed callers, contract tests, authorization tests, and automatic detection of an exported action without a declared guard.
19. Prefer tag-based cache invalidation mapped to domain resources over duplicated path lists.

## Flagged inconsistencies and guard gaps

### F1 — notification write helpers have no caller guard (**P0**)

- `apps/crm/src/app/actions/notifications.ts:39-52` and `:95-106`
- `apps/hrm/src/app/actions/notifications.ts:38-51` and `:93-104`

`createNotification` and `notifyUsers` accept arbitrary user IDs and payloads and write immediately. They are exported Server Actions, so “used internally” is not an authorization boundary. Make them non-exported services or require a privileged context. Today's versions now catch database failures and return envelopes, but the missing caller authorization remains.

### F2 — public reapplication can recover an existing ATS upload token (**P0**)

- `apps/hrm/src/app/actions/publicRbt.ts:103-150`

On an existing email, `submitRbtApplication` updates the existing candidate and returns `existing.onboardingPacket.magicLinkToken` as `uploadToken` without mailbox or device-session proof. This turns email knowledge into record mutation plus token recovery. Use a one-time verification flow and never return an existing bearer token from the public application endpoint.

### F3 — `hireCandidate` accepts a caller-controlled auth and LS-54 bypass (**P0**)

- `apps/hrm/src/app/actions/atsActions.ts:941-951`

When `opts.skipLs54Gate` is true, the action skips both `requireRole(HR/CEO/ADMIN)` and the wage-offer gate. Because `opts` is an exported action argument, TypeScript visibility does not make it internal. Keep bypass state outside the public procedure and require a server-only capability if a trusted auto-hire flow needs it.

### F4 — shared HRM acting-RBT resolver trusts a raw candidate cookie (**P0**)

- `apps/hrm/src/lib/resolveActingRbt.ts:48-71`
- `apps/hrm/src/lib/resolveActingRbt.ts:109-115`
- `apps/hrm/src/lib/resolveActingRbt.ts:128-151`

The resolver treats the raw candidate UUID cookie as an authoritative hired-RBT identity without checking the device fingerprint/session row. Its arbitrary explicit-RBT path accepts any real signed-in non-RBT user, rather than a declared management role. The old production “first RBT” fallback is gone; demo-David fallback is now dev-gated. The remaining helper still affects payroll, staff communication, case applications, and Session Studio.

### F5 — legacy RBT session-note mutations are unguarded (**P0**)

- `apps/hrm/src/app/(dashboard)/rbt/actions.ts:6-39`
- `apps/hrm/src/app/(dashboard)/rbt/actions.ts:57-68`

`logSession` trusts caller-supplied `rbtId`/`clientId`; `fixDeficiency` trusts `noteId`. Neither authenticates or verifies assignment/ownership.

### F6 — HRM Session Studio has client-scope and identity fallbacks (**P0**)

- `apps/hrm/src/app/actions/sessionEmrActions.ts:246-305`
- `apps/hrm/src/app/actions/sessionEmrActions.ts:423-527`
- `apps/hrm/src/app/actions/sessionEmrActions.ts:536-558`

`getSessionStudioTargets` authenticates some identity but does not verify assignment/access to the selected client and may auto-create target rows. `submitHrmSessionEmrNote` verifies RBT identity, but when `sessionId` is absent it can resolve an arbitrary client by caller-supplied ID/name and create a new completed session without proving assignment. Today's `clockInHrmSession` is tighter: it requires an existing session and rejects a different assigned RBT.

### F7 — CRM first-session lifecycle lacks client-resource authorization (**P0**)

- `apps/crm/src/app/actions/firstSessionActions.ts:39-83`
- `apps/crm/src/app/actions/firstSessionActions.ts:165-185`
- `apps/crm/src/app/actions/firstSessionActions.ts:212-254`

The three mutations call only `getCurrentUser()`: they do not declare allowed roles or call `requireClientAccess` for the target client/session. Today's `getClientTherapySessions` has been fixed and now uses `requireClientAccess` at `:307-310`.

### F8 — CRM clinical reads use inconsistent role and client scoping (**P0/P1**)

- `apps/crm/src/app/actions/clinicalReviewActions.ts:47-66`
- `apps/crm/src/app/actions/clientSessionHistoryActions.ts:27-41`
- `apps/crm/src/app/actions/bcbaMetricsActions.ts:77-91`
- `apps/crm/src/app/actions/bcbaNoteQueueActions.ts:66-87`

`listClinicalReviewQueue` allows any authenticated role; non-BCBA roles are not scoped for the intake packet and deficiency queries. `getClientSessionHistory` accepts any authenticated user and arbitrary `clientId`. Metrics/note-queue actions scope ordinary users by their ID but never reject non-clinical roles, producing an implicit and inconsistent authorization model. Declare allowed roles and client scope explicitly.

### F9 — unsafe legacy interview exports coexist with verified-device replacements (**P0**)

- Legacy: `apps/hrm/src/app/actions/hrInterviewActions.ts:164-201`, `:215-306`, `:319-341`
- Safer replacements: `apps/hrm/src/app/(dashboard)/rbt/interview/actions.ts:204-225`, `:229-329`

`getHrMembers` exposes staff email addresses with no guard. `bookHrInterview` and `getAtsInterview` now require a current user, but still accept arbitrary candidate IDs; booking also trusts caller-supplied interviewer/name/date fields without candidate ownership or validating that the interviewer is active HR. The newer portal snapshot/booking actions verify applicant-device ownership and interviewer role and should become the only applicant-facing contract.

### F10 — help-desk applicant authorization is a raw candidate cookie (**P0**)

- `apps/hrm/src/app/actions/helpDeskActions.ts:31-40`
- Representative paths: `:275-308`, `:363-405`, `:555-597`

Applicant ticket ownership is checked against a raw `ras_device_session_token` candidate ID, not the fingerprint-bound/revocation-aware device-session mechanism used by newer actions. These paths now also require a current user, and staff branches are role checked, but applicant create/list/send should use one verified principal helper.

### F11 — applicant promotion accepts raw cookie identity (**P0**)

- `apps/hrm/src/app/actions/applicantSessionActions.ts:78-101`

`promoteHiredSessionToRbt` accepts a raw candidate-id cookie, checks only hired stage, and sets long-lived applicant/RBT role cookies without first proving a valid `ApplicantDeviceSession`. It does not create the device-session row; downstream code that trusts those cookies inherits the forged identity.

### F12 — staff upload branch authenticates but does not authorize the client (**P0**)

- `apps/crm/src/app/api/upload/route.ts:63-69`

The token branch verifies packet ownership. The staff branch only checks `requireStaff()` and accepts caller-supplied `clientId`; add `requireClientAccess(clientId)` (or a documented agency-wide upload privilege). Add a PHI audit event after the private-storage upload.

### F13 — legacy case/signature mutations lack resource authorization (**P0**)

- `apps/crm/src/app/(dashboard)/case/actions.ts:8-27`
- `apps/crm/src/app/(dashboard)/case/actions.ts:38-74`
- `apps/crm/src/app/(dashboard)/case/actions.ts:87-97`

Today's actions have staff-role gates, but none calls `requireClientAccess`. `assignStaff` trusts client/RBT/BCBA IDs from `FormData`; `activateClient` accepts an arbitrary client ID; `collectSignature` lets any clinical-role caller set `parentSigned` or `bcbaSigned` on an arbitrary note without signer binding, attestation metadata, or an audit event.

### F14 — role-only clinical mutations lack explicit client access (**P1**)

- `apps/crm/src/app/actions/clinicalGoalsActions.ts:183-210`
- `apps/crm/src/app/(dashboard)/portal-case/actions/clinical-support.ts:28-47`
- `apps/crm/src/app/(dashboard)/portal-case/actions/clinical-support.ts:141-150`
- `apps/crm/src/app/(dashboard)/clinical/actions.ts:7-20`

Treatment-target sync, canonical clinical-support writes, and the legacy Treatment Authorization creator require clinical roles but do not consistently prove access to the supplied client. The dashboard wrappers add client access for some calls, but direct exported canonical actions remain independently callable.

### F15 — dev-tool actions are environment gated, not user authorized (**P1**)

- CRM entry points start at `apps/crm/src/app/actions/devTools.ts:22`, `:141`, `:405`
- HRM entry points start at `apps/hrm/src/app/actions/devTools.ts:28`, `:61`, `:95`, `:323`, `:373`, `:559`, `:784`

The production boot gate is valuable, but when dev tools are enabled the exported actions require no authenticated staff role and can impersonate, seed, skip onboarding, enumerate/delete candidates, and read global QA counts. Both login actions also honor email-pattern redirects before rate limiting/password verification under this gate. Require a privileged dev principal in addition to the environment gate, especially for shared test/staging environments.

### F16 — raw throws and incompatible result families remain widespread (**P1**)

- Unwrapped CRM examples: `apps/crm/src/app/(dashboard)/portal-case/actions.ts:94-141`, `:161-180`, `:355-370`
- Mixed intake example: `apps/crm/src/app/actions/intake.ts:112-155`
- Raw-message examples: `apps/hrm/src/app/actions/atsActions.ts:272-278`, `apps/hrm/src/app/actions/publicRbt.ts:189-199`

Current contracts mix throw/reject, `{ success, error }`, `{ status, message }`, `{ error }`, bare arrays, bare strings, and named payload keys. Some catches return raw database/auth messages while others mask them. Framework redirects in login are expected control flow, but business/auth failures should use stable typed codes.

### F17 — notification reads hide authentication failure as empty success (**P1**)

- `apps/crm/src/app/actions/notifications.ts:7-15`
- `apps/hrm/src/app/actions/notifications.ts:6-14`

Both app copies return `{ success:true, notifications:[], unreadCount:0 }` when no real current user resolves. This still conflates “signed out/mock identity” with a successful empty inbox; query failures use `success:false`.

### F18 — HRM job-board listing/profile identity is not consistently guarded (**P0/P1**)

- `apps/hrm/src/app/actions/caseOpeningActions.ts:227-261`
- `apps/hrm/src/app/actions/caseOpeningActions.ts:338-379`

`listOpenCaseOpeningsForRbt` is unauthenticated. `saveRbtTravelProfile` can fall back from a caller-supplied/user identity to the first hired RBT candidate. Require a verified RBT device principal or an explicit authorized staff-on-behalf-of contract.

### F19 — HRM role resolution trusts raw cookies for UI identity (**P1**)

- `apps/hrm/src/app/actions/resolveHrmRole.ts:64-79`

`resolveHrmUiRole` treats the raw device cookie as a candidate ID and also honors an unsigned role cookie. It is currently a UI-routing helper, not a safe authorization source; rename/type it accordingly and keep it out of permission decisions.

### F20 — route/action side effects lack uniform audit coverage (**P1**)

High-value examples without durable audit events include document upload/download, many clinical state transitions, case application status changes/messages, Session Studio target reads, and legacy signature toggles. Existing good patterns now include treatment-plan PDF export, credential audit events, onboarding signature events, operations export audit, BCBA queue view audit, dual-run audit, note deficiency/convert audit, and note-signing audit.

### F21 — BCBA note signing does not prove note/client assignment (**P0**)

- `apps/crm/src/app/actions/sessionNoteSignActions.ts:46-74`

`signSessionNotesAsBcba` checks only that the current role is BCBA/clinical leadership, then loads arbitrary caller-supplied note IDs. A regular BCBA can therefore sign another BCBA's client notes if IDs are known. Filter to the signer’s assigned clients (with an explicit leadership bypass), and apply the same resource predicate in the conditional write.

### F22 — deficiency author identity is caller-controlled (**P0**)

- `apps/crm/src/app/(dashboard)/notes/actions.ts:282-320`

`flagDeficiency` accepts both `noteId` and `authorId` from `FormData`. It verifies the note state but never derives the author from `note.session.rbtId`; the supplied ID is persisted on `NoteDeficiency` and receives the notification. Resolve the note, authorize its client, and derive the author atomically.

### F23 — action-item contracts expose organization-wide arbitrary IDs (**P1**)

- `apps/crm/src/app/actions/actionItems.ts:8-20`
- `apps/crm/src/app/actions/actionItems.ts:47-67`
- `apps/crm/src/app/actions/actionItems.ts:86-96`

Any staff role can list every action item, create one for an arbitrary client/assignee, or resolve an arbitrary item ID. If organization-wide access is intentional, declare that privilege explicitly; otherwise scope reads/writes to the actor’s assignment and authorize the linked client.

## CRM Server Actions

### Clinical review decisions

File: `apps/crm/src/app/(dashboard)/portal-case/actions/clinical.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `approveClinicalReview`, `clientId` | Staff clinical roles + Client | OK/ERR | Advances client after approved packet; RV |
| `rejectClinicalReview`, `clientId, documentKey, note` | Staff clinical roles + Client | OK/ERR | Transactional document correction/rejection details; RV |
| `rejectClinicalFormFieldsBulk`, `clientId, packetId, fields[]` | Staff clinical roles + Client | OK/ERR | Transactional field corrections/rejection details; RV |
| `resolveP2PDenial`, `paId, notes` | Staff clinical roles + Client resolved from PA | OK/ERR | Resolves P2P fields; RV |

### Clinical-support dashboard wrappers

File: `apps/crm/src/app/(dashboard)/clinical-support/actions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `verifyDocuments`, `clientId` | Staff clinical roles + Client | OK/ERR | Verifies packet/advances status; RV support/client |
| `submitTreatmentPacket`, `clientId` | Staff clinical roles + Client | OK/ERR | Creates/updates treatment PA; RV |
| `scheduleClinicalSupportAssessment`, `clientId, scheduledStart ISO` | Staff clinical roles + Client; canonical action guards again | Canonical OK/ERR | Creates assessment Session; canonical RV |
| `assembleClinicalSupportReport`, `clientId` | Staff clinical roles + Client; canonical action guards again | Canonical OK/ERR | Persists report metadata/status; canonical RV |

### HR staffing and assignment

File: `apps/crm/src/app/actions/hr.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `assignHrStaff`, `_clientId, { bcbaId?, rbtId? }` | Staff HR/leadership | Always ERR | Deprecated/inert; no mutation |
| `getHrStaffingOptions`, none | Staff | `success + bcbas/rbts`; fallback arrays on ERR | Read only |
| `getClientAssignmentSnapshot`, `clientId` | Staff + Client | `success + data`; `data:null` on ERR | Read only |
| `updateClientCaseCoordinator`, `{ clientId, caseCoordinatorId, expectedCaseCoordinatorId }` | Staff CASE_COORDINATOR + Client | `success + assignment` / ERR | Optimistic compare-and-set; RV client/case-coord |

### Operations

File: `apps/crm/src/app/(dashboard)/ops/actions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `getOpsDepartmentMetrics`, none | Staff leadership | `success + data` / ERR | Read-only aggregate |
| `logOpsAuditReportExport`, `{ generatedAt }` | Staff leadership | OK/ERR | **Audit** export event |

### Billing portal wrappers

File: `apps/crm/src/app/(dashboard)/portal-billing/actions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `markVobComplete`, `clientId` | Staff BILLING/FINANCE/CEO | OK/ERR | Client status update; RV client/billing |
| `markAssessmentPaSubmitted`, `clientId` | Staff BILLING/FINANCE/CEO | OK/ERR | Canonical PA submit; RV |
| `markTreatmentPaSubmitted`, `clientId` | Staff BILLING/FINANCE/CEO | OK/ERR | Canonical PA submit; RV |
| `recordPaApproval`, `paId, { authNumber, approvedUnits, effectiveDate, expirationDate }` | Staff BILLING/FINANCE/CEO | OK/ERR | Canonical approval; RV; case-coordinator notification |
| `recordPaDenial`, `paId, { isClinical, reason }` | Staff BILLING/FINANCE/CEO | OK/ERR | Canonical denial + P2P fields; RV; case-coordinator notification |
| `resolvePaP2p`, `paId, notes` | Staff BILLING/FINANCE/CEO | OK/ERR | Resolves PA-row P2P fields; RV |

### Intake and parent packet

File: `apps/crm/src/app/actions/intake.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `saveIntakeProgress`, `packetId, formData:any` | Staff-or-parent packet | OK/ERR | Replaces packet form JSON; no RV |
| `submitForm01`, `packetId, formData:any` | Staff-or-parent packet | OK/ERR | Replaces form JSON, marks intake complete; staff notification |
| `submitForm02`, `packetId, formData:any` | Staff-or-parent packet | OK/ERR | Replaces form JSON, marks consent complete; staff notification |
| `requestClientChanges`, `token, notes` | Staff-or-parent token | `{ success:true }` / `{ error }`; uncaught DB failures reject | Sets change request; RV magic-link page; staff notification |
| `signTreatmentPlan`, `clientId, parentSignatureName` | Staff-or-parent client | OK/ERR | Stores typed-name/date; RV client |
| `saveClientSchedule`, `clientId, schedule, preferences?` | Staff-or-parent client | OK/ERR | Stores schedule/preferences; RV client and concrete magic link |

### CRM developer tools

File: `apps/crm/src/app/actions/devTools.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `setImpersonationCookie`, `userId?, role?` | Dev environment gate only | OK/ERR | Sets/deletes impersonation cookies; RV layout |
| `devSeedConnectedProductDemo`, `{ mode?, withSession? }` | Dev environment gate only | `success + data` / ERR | Seeds users/client/PA/packet/session; demo fence; RV |
| `devGetQaStatusSnapshot`, none | Dev environment gate only | `success + data` / ERR | Global read-only QA counts |

### Case-opening marketplace (CRM staff side)

File: `apps/crm/src/app/actions/caseOpeningActions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `listStaffingPendingClientsForOpenings`, none | Staff CASE_COORDINATOR/CEO/ADMIN | `success + clients` / ERR | Read only |
| `createCaseOpening`, structured client/location/schedule/rate input | Staff CASE_COORDINATOR/CEO/ADMIN | `success + opening` / ERR | Creates listing; RV; notifies active RBTs |
| `listCaseOpeningsForCaseCoord`, none | Staff | `success + openings` / ERR | Read only |
| `closeCaseOpening`, `openingId` | Staff CASE_COORDINATOR/CEO/ADMIN | OK/ERR | Closes listing; RV |
| `updateCaseApplicationStatus`, `applicationId, status` | Staff CASE_COORDINATOR/CEO/ADMIN | OK/ERR | Updates status; RV; applicant notification |
| `scheduleMeetForApplication`, `applicationId, scheduledFor ISO` | Staff CASE_COORDINATOR/CEO/ADMIN | OK/ERR | Sets meeting; RV; applicant notification |
| `sendApplicationStaffMessage`, `applicationId, content` | Staff CASE_COORDINATOR/CEO/ADMIN | OK/ERR | Creates staff thread message and may advance status; RV |
| `sendParentCaseMessage`, `clientId, content` | Staff CASE_COORDINATOR/CEO/ADMIN | OK/ERR | Creates staff-to-parent client message; RV |
| `getApplicationThread`, `applicationId` | Staff (any role) | `success + messages/parentMessages` / ERR | Reads staff and parent threads |
| `acceptApplicationAsParent`, `applicationId` | Staff CASE_COORDINATOR/CEO/ADMIN | OK/ERR | Records acceptance; RV; notification |
| `declineApplicationAsParent`, `applicationId` | Staff CASE_COORDINATOR/CEO/ADMIN | OK/ERR | Records decline; RV; notification |

### Session-note billing and deficiency

File: `apps/crm/src/app/(dashboard)/notes/actions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `convertNoteToBillable`, `noteId, { plutusClaimRef?, overrideAuthUnits?, overrideReason? }?` | Current billing/operations roles; note ID lookup | Rich OK/gate ERR | Converts eligible note with audited auth override; RV; RBT notification; **Audit** |
| `flagDeficiency`, `(prevState, FormData(noteId,authorId,description))` | Current clinical/billing/case roles; note ID lookup | `{ success:true }` / `{ error }` | Creates deficiency, strips signatures; RV; supplied-author notification; **Audit**; F22 |

File: `apps/crm/src/app/actions/sessionNoteSignActions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `signSessionNotesAsBcba`, `noteIds[]` | Current BCBA/clinical leadership; **no note/client assignment check** | `success + signed/skipped counts and IDs` / ERR | Transactional co-sign; RV; notifications; **Audit** per note; F21 |
| `signSingleSessionNoteAsBcba`, `noteId` | Delegates to guarded batch | Same batch result | Same effects |

### Case activation

File: `apps/crm/src/app/(dashboard)/case/actions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `assignStaff`, `FormData(clientId, staffType, staffId)` | Staff case/HR/leadership; no Client guard | OK/ERR | Assigns BCBA/RBT; RV case/client; F13 |
| `activateClient`, `clientId` | Current user + case/leadership role; no Client guard | OK/ERR | Enforces readiness then activates; RV; F13 |
| `collectSignature`, `noteId, signerRole` | Current user + clinical role; no note/client guard | OK/ERR | Toggles parent/BCBA signed boolean; RV; F13 |

### Units and first-session lifecycle

File: `apps/crm/src/app/actions/weeklyUnitsActions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `getClientWeeklyBillableUnits`, `clientId, weekStartIso?` | Client access | `success + data` / ERR | Read-only weekly units |

File: `apps/crm/src/app/actions/firstSessionActions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `scheduleFirstTherapySession`, structured client/RBT/session input | Current user only; **no role/Client guard** | `success + sessionId` / ERR | Creates first session; RV; notifications |
| `confirmTherapySessionCompleted`, `sessionId` | Current user only; **no role/resource guard** | `success + clientId` / ERR | Completes session; RV; notifications |
| `activateClientAfterFirstSession`, `clientId` | Current user only; **no role/Client guard** | OK/ERR | Activates after completed therapy; RV; notifications |
| `getClientTherapySessions`, `clientId` | Client access | `success + sessions` / ERR | Read only |

### Billing dual-run audit

File: `apps/crm/src/app/actions/dualRunAuditActions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `listDualRunAuditNotes`, `{ from, to, clientId? }` | Staff billing/leadership | `success + rows/clients` / ERR | Read-only fully signed notes + latest audit markers |
| `setDualRunAuditMark`, `noteId, mark, note?` | Staff billing/leadership; note ID lookup | `success + marker` / ERR | Appends durable audit marker; RV; **Audit** |
| `logDualRunAuditExport`, `{ from, to, rowCount }` | Staff billing/leadership | OK/ERR | Fire-and-forget **Audit** export |

### Clinical review, goals, charts, and BCBA queues

File: `apps/crm/src/app/actions/clinicalReviewActions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `listClinicalReviewQueue`, none | Current user only; inconsistent role/scope | `success + items/counts` / ERR fallback | Read-only PHI aggregation; see F8 |

File: `apps/crm/src/app/actions/clinicalGoalsActions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `getClinicalGoalsSnapshot`, `clientId` | Client access | `success + data` / ERR | Read only |
| `getSessionStudioSyncStatus`, `clientId` | Client access | `success + data` / ERR | Read only |
| `syncTreatmentPlanTargetsToSessionStudio`, `clientId` | Current clinical role; no Client guard | Rich sync counts / ERR | Upserts targets; RV; F14 |
| `updateSkillTargetStatus`, `clientId, targetId, status` | Staff clinical + Client | OK/ERR | Updates target; RV |

File: `apps/crm/src/app/actions/clientSessionHistoryActions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `getClientSessionHistory`, `clientId, limit?` | Any current user; no Client guard | `success + sessions` / ERR | Read-only PHI; see F8 |

File: `apps/crm/src/app/actions/chartProgressActions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `getClientChartProgress`, `clientId, noteLimit?` | Client access | `success + data` / ERR | Read-only clinical aggregation |

File: `apps/crm/src/app/actions/bcbaNoteQueueActions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `listBcbaUnsignedNotes`, `{ recordView? }` | Current user; directors global, others self-ID scoped | `success + notes/count` / ERR | Optional PHI **Audit** VIEW |
| `countBcbaUnsignedNotes`, none | Delegates to list with no view audit | `success + count` / ERR | Read only |

File: `apps/crm/src/app/actions/bcbaMetricsActions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `getBcbaOpsMetrics`, none | Current user; directors global, others self-ID scoped | `success + metrics` / ERR with empty metrics | Read-only PHI aggregate |

File: `apps/crm/src/app/actions/authUnitsActions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `getClientAuthUnitBalances`, `clientId` | Client access | `success + data` / ERR | Read only |

### Magic link and login

File: `apps/crm/src/app/magic-link/actions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `submitMagicLinkPacket`, `packetId, formData?` | Bound, unexpired, non-revoked parent packet access | OK/ERR with optional validation details | Persists/validates packet form data, submits packet; RV; staff notifications |

File: `apps/crm/src/app/login/actions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `login`, `(prevState, FormData(email,password))` | Public credential endpoint + IP/email rate limit; dev-gated shortcut precedes both | `{ error }` or framework redirect | Supabase sign-in, active-profile check, role redirect |

### Profile synchronization, notifications, chat, and action items

File: `apps/crm/src/app/actions/rbtProfileSync.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `syncRbtProfileToCrm`, `{ userId?, availabilitySlots, preferredBoroughs, totalSelectedHours }` | Staff session must itself be RBT; supplied ID ignored | `success + syncStatus/message` / raw-message ERR | Touches own onboarding row; RV CRM coordination paths |

File: `apps/crm/src/app/actions/notifications.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `getNotifications`, ignored legacy `userId?` | Current user; unauth/mock returns successful empty | `{ success, notifications[], unreadCount, error? }` | Read only; F17 |
| `createNotification`, notification object | **None** | `{ success, notification?, deduped? }` / ERR | Notification write with unread dedupe; no RV; F1 |
| `notifyUsers`, batch notification object | **None** | `{ success, notified, error? }` | Batch notification write with unread dedupe; no RV; F1 |
| `markNotificationAsRead`, `id` | Current user + ownership | OK/ERR | Updates row; RV layout |
| `markAllNotificationsAsRead`, ignored legacy `userId?` | Current user | OK/ERR | Bulk update; RV layout |

File: `apps/crm/src/app/actions/chat.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `getStaffMembers`, none | Staff | Bare member array; returns `[]` on failure | Read only |
| `getStaffMessages`, `otherUserId` | Staff | Bare message array; returns `[]` on failure | Reads thread |
| `markStaffThreadRead`, `otherUserId` | Staff | OK/ERR | Marks read; RV layout |
| `sendStaffMessage`, `recipientId, content` | Staff | OK/ERR | Creates message; RV layout |

File: `apps/crm/src/app/actions/actionItems.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `getActionItems`, `coordinatorId?` | Staff; no role/ownership filter when omitted | `{ success, actionItems[], error? }` | Reads all action items by default; F23 |
| `createActionItem`, title/description/client/assignee/due input | Staff; no client/assignee scope | `success + actionItem` / ERR | Creates item; RV layout; assignee notification; F23 |
| `resolveActionItem`, `id` | Staff; no ownership/resource scope | `success + actionItem` / ERR | Resolves arbitrary item; RV layout; F23 |

### Clinical portal

File: `apps/crm/src/app/(dashboard)/portal-clinical/actions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `approveClinicalDocs`, `FormData(clientId)` | Staff clinical roles; no Client guard | OK/ERR | Advances status; RV |
| `rejectClinicalDocs`, `FormData(packetId, clientId, notes)` | Staff clinical roles; no Client guard | OK/ERR | Rejects packet and bounces client; RV |
| `assignBcba`, `clientId, bcbaId` | Staff clinical roles; no Client guard | OK/ERR | Assigns BCBA after status gate; RV |
| `updateTreatmentPlanStatus`, `_clientId, _status` | None; inert | Always ERR | Direct status writer is hard-disabled |

### Canonical clinical-support actions

File: `apps/crm/src/app/(dashboard)/portal-case/actions/clinical-support.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `scheduleAssessment`, `clientId, date` | Staff clinical roles; no Client guard | OK/ERR | Creates assessment Session; RV |
| `assembleReport`, `clientId` | Staff clinical roles; no Client guard | OK/ERR | Stores assembled report/status; RV |
| `saveTreatmentPlan`, `clientId, treatmentPlanData:any, isSubmit?` | Staff clinical roles; no Client guard | OK/ERR | Stores plan/status metadata; RV |
| `getGoalTemplates`, `type?` | Staff | `success + templates` / ERR | Read only |
| `saveGoalTemplate`, `payload:any` | Staff clinical roles | `success + template` / ERR | Creates template; no RV |

### Canonical billing actions

File: `apps/crm/src/app/(dashboard)/portal-case/actions/billing.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `completeVobAndCreds`, `clientId` | Staff billing roles | OK/ERR; raw message in catch | Upserts Assessment PA VOB fields; advances client; RV |
| `submitPaRequest`, `clientId` | Staff billing roles | OK/ERR; raw message in catch | Submits Assessment PA; advances client; RV |
| `denyPaRequest`, `paId, isClinical` | Staff billing roles | OK/ERR; raw message in catch | Denies PA; RV |
| `approvePaRequest`, `paId, approvalData` | Staff billing roles | OK/ERR; raw message in catch | Approves Assessment PA/advances client; RV |
| `submitTreatmentPaRequest`, `clientId` | Staff billing roles | OK/ERR; raw message in catch | Submits Treatment PA/advances client; RV |
| `approveTreatmentPaRequest`, `paId, approvalData` | Staff billing roles | OK/ERR; raw message in catch | Approves Treatment PA/advances to staffing; RV |

### Intake/case coordination portal

File: `apps/crm/src/app/(dashboard)/portal-case/actions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `createInquiry`, `(prevState, FormData)` | Staff intake roles | OK/ERR; raw message in catch | Creates lead; RV |
| `createIntakeClient`, `(prevState, FormData)` | Staff intake roles | `{ error }` or framework redirect | Creates intake client; redirect |
| `generateMagicLink`, `FormData(clientId)` | Staff intake roles; no Client guard | `undefined` / `{ error }`; DB failures reject | Creates packet/token; RV |
| `regenerateMagicLink`, `FormData(packetId, clientId)` | Staff intake roles; no packet/client binding check | `undefined` / `{ error }`; DB failures reject | Rotates token; RV |
| `revokeMagicLink`, `packetId, clientId` | Staff intake roles; no packet/client binding check | OK/ERR | Revokes token; RV |
| `sendToClinical`, `FormData(packetId, clientId)` | Staff intake roles; no packet/client binding check | `{ error }` or framework redirect; DB failures reject | Advances packet/client; RV |
| `approveDocument`, `packetId, documentKey, clientId` | Staff intake roles; no packet/client binding check | `{ success:true }` / `{ error }` | Approves whitelisted document flag; may update client; RV |
| `rejectDocument`, `packetId, documentKey, clientId, reason` | Staff intake roles; no packet/client binding check | `{ success:true }` / `{ error }` | Rejects document flag/clears form value; RV |
| `rejectFormField`, `packetId, fieldId, reason` | Delegates to guarded bulk action | Same bulk result | Field rejection; RV |
| `rejectFormFieldsBulk`, `packetId, fields[]` | Staff intake roles | `{ success:true }` / `{ error }` | Bulk field rejection; RV |
| `unlockPacket`, `packetId` | Staff intake roles | `undefined` / `{ error }`; DB failures reject | Unlocks packet; RV |
| `assignClinicalTeam`, `clientId, bcbaId, caseCoordinatorId` | Staff intake roles; no Client guard | Error envelope or framework redirect | Assigns team; RV |
| `getClinicalStaff`, none | Staff; unauthorized returns empty bare object | Bare `{ bcbas, caseCoordinators }`; DB failures reject | Read only |
| `sendClientMessage`, `clientId, content, isFromClient, senderName` | Staff-or-parent client | OK/ERR; raw message in catch | Creates client message; RV |
| `markClientMessagesAsRead`, `clientId, isFromClient` | Staff-or-parent client | `{ success:boolean }` only | Marks read; RV |
| `assignCaseCoordinator`, `clientId, caseCoordinatorId` | Staff case roles; no Client guard | OK/ERR | Assigns coordinator, deletes messages; RV layout |
| `approveRbtCandidate`, `clientId` | Staff case roles; no Client guard | OK/ERR | Marks RBT approved; RV layout |
| `rejectRbtCandidate`, `clientId` | Staff case roles; no Client guard | OK/ERR | Clears RBT/approval; RV layout |

### Legacy clinical authorization action

File: `apps/crm/src/app/(dashboard)/clinical/actions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `submitTreatmentPlan`, `clientId` | Staff clinical roles; no Client guard | `{ success:true }` / `{ error }` | Creates pending Treatment Authorization; RV; F14 |

## CRM Route Handlers

| Route export (line) | Guard and input | Success / error | Side effects and notes |
|---|---|---|---|
| `GET /api/health` — `apps/crm/src/app/api/health/route.ts:42` | Public; no input | `200/503 { ok, app:'crm', time, db:'ok'|'error' }` | Timed database probe only |
| `GET /api/documents` — `apps/crm/src/app/api/documents/route.ts:19` | Client-authorized staff or bound parent packet session; query `path={clientId}/{safeFile}` | `302` to 120-second signed URL; text `400/403/404/500` | Private Supabase Storage signed read; no durable PHI view audit |
| `GET /api/generate-report/[clientId]` — `apps/crm/src/app/api/generate-report/[clientId]/route.tsx:9` | Client access; dynamic `clientId` | PDF `200`; text `400/403/404/500` | Reads client/plan/targets/packet form; PDF render; durable export **Audit** |
| `POST /api/upload` — `apps/crm/src/app/api/upload/route.ts:72` | Multipart `file, clientId?, magicLinkToken?`; token packet+device scoped or Staff only | `200 { url, storagePath, name, size, type }`; JSON `400/401/500` | Validates 5 MB/MIME + magic bytes; uploads private Storage object only; no Document row/RV/audit; staff scope gap F12 |

## HRM Server Actions

### Verified applicant availability

File: `apps/hrm/src/app/(dashboard)/rbt/availability/actions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `getMyRbtAvailability`, none | Linked signed-in RBT or verified applicant device | Typed `success + data` / coded ERR | Read only |
| `saveMyRbtAvailability`, validated availability/borough/travel payload | Linked signed-in RBT or verified applicant device | Typed `success + data` / coded ERR | Updates packet/progress/stage; RV availability/RBT/ATS |

### Verified applicant interview portal

File: `apps/hrm/src/app/(dashboard)/rbt/interview/actions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `getInterviewPortalSnapshot`, none | Verified applicant device | Typed `success + data` / reasoned ERR | Returns interview + active HR display data without staff email |
| `bookOwnInterview`, `{ interviewerId, date, time }` | Verified applicant device | Typed `success + data` / ERR | Validates active HR/ET slot, updates interview/progress; RV |

### ATS administration

File: `apps/hrm/src/app/actions/atsActions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `getAtsCandidates`, none | Staff ATS roles | `{ success, data[] }` / raw-message ERR | Read-only ATS list |
| `getRbtManagerDashboard`, none | Staff HR roles | `success + data` / ERR | Read-only RBT/work/payroll metrics |
| `getHiredRbtStaff`, none | Staff HR roles | `{ success, data[] }` / ERR | Delegates to manager dashboard |
| `getHiredCandidateSummary`, `candidateId` | Staff ATS roles | `success + data` / raw-message ERR | Reads linked RBT user/case applications |
| `addAtsCandidate`, name/email/phone/role/experience | Staff ATS roles | `success + candidate` / raw-message ERR | Creates candidate/packet; RV |
| `setAtsStage`, `candidateId, stage, activationStatus?` | Staff ATS roles | `success + candidate` / raw-message ERR | Updates stage/status; RV |
| `advanceAtsStage`, `candidateId` | Staff ATS roles | Delegated candidate result / raw-message ERR | Derives next stage; may hire; RV downstream |
| `inviteCandidate`, `candidateId` | Staff ATS roles | `success + candidate/magicLinkUrl/message` / raw-message ERR | Creates/refreshes invite token; RV |
| `revokeCandidateMagicLink`, `candidateId` | Staff ATS roles | OK / raw-message ERR | Revokes token/device sessions; RV |
| `hireCandidate`, `candidateId, opts?` | Staff ATS roles **unless caller sets bypass** | `success + candidate` / raw-message ERR | Creates/links User, marks hired, notifies; RV; F3 |
| `rejectCandidate`, `candidateId` | Delegates to guarded `setAtsStage` | Delegated result | Sets rejected stage; RV |
| `deleteAtsCandidate`, `candidateId` | Staff ATS roles | OK / raw-message ERR | Deletes candidate; RV |
| `updateCandidateProgress`, `candidateId, patch` | Current user; ATS staff or applicant/RBT self via weak context | `success + candidate/progress/stage/snapshot` / raw-message ERR | Merges progress/derives stage; RV |
| `getOnboardingProgress`, `candidateId` | Current user; ATS staff or applicant/RBT self via weak context | `success + data/stage/status` / raw-message ERR | Read only |

### Finance payroll

File: `apps/hrm/src/app/actions/financePayrollActions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `getFinancePayrollRollup`, optional date-range input | Staff FINANCE/CEO | `{ success, data }` / ERR with `data:null` | Read-only capped payroll aggregation |

### Staff credentials

File: `apps/hrm/src/app/actions/staffCredentialActions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `listActiveStaffCredentials`, none | Staff HR/HEAD_HR/CEO | `success + asOfDate/data[]` / ERR | Read only |
| `createStaffCredential`, `{ userId, credentialType, expirationDate }` | Staff HR/HEAD_HR/CEO | OK/ERR | Creates credential; RV; **Audit** |
| `updateStaffCredential`, `{ id, credentialType, expirationDate }` | Staff HR/HEAD_HR/CEO | OK/ERR | Updates credential; RV; **Audit** |
| `revokeStaffCredential`, `id` | Staff HR/HEAD_HR/CEO | OK/ERR | Sets `isCredentialed:false`; RV; **Audit** |
| `deleteStaffCredential`, `id` | Staff HR/HEAD_HR/CEO | OK/ERR | Deletes credential; RV; **Audit** |

### HRM developer tools

File: `apps/hrm/src/app/actions/devTools.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `setImpersonationCookie`, `userId?, role?` | Dev environment gate only | OK/ERR | Impersonation cookies; RV layout |
| `resolveDemoRbtUserId`, none | Dev environment gate only | `success + data:string|null` / ERR | Read only |
| `devSkipApplicantRequirements`, `mode?, candidateIdOverride?` | Dev environment gate only | `success + data` / ERR | Skips onboarding requirements; signature **Audit** breadcrumb; RV |
| `devListAtsCandidates`, none | Dev environment gate only | `success + data` / ERR fallback | Global candidate read |
| `devDeleteAtsCandidate`, `candidateId` | Dev environment gate only | `success + data` / ERR | Deletes candidate/linked user except protected seeds; RV |
| `devSeedConnectedProductDemo`, `{ mode?, withSession? }` | Dev environment gate only | `success + data` / ERR | Seeds shared CRM entities; demo fence; RV |
| `devGetQaStatusSnapshot`, none | Dev environment gate only | `success + data` / ERR | Global read-only QA counts |

### Case-opening marketplace (RBT side)

File: `apps/hrm/src/app/actions/caseOpeningActions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `listOpenCaseOpeningsForRbt`, none | Weak resolver, but continues with no identity | `success + openings/travelProfile` / ERR | Deidentified listing read; includes own application when resolved; F18 |
| `saveRbtTravelProfile`, `{ homeZipCode, maxTravelMiles?, transportation? }` | Weak acting context + latest-hired fallback | OK/ERR | Updates candidate travel profile; RV; F18 |
| `applyToCaseOpening`, `openingId, message?` | Weak acting-RBT context | OK/ERR | Creates application; RV; staff notification |
| `withdrawCaseApplication`, `applicationId` | Weak acting-RBT context + ownership | OK/ERR | Withdraws; RV |
| `listMyCaseApplications`, none | Weak acting-RBT context | `success + applications` / ERR | Read only |

### Wage offers

File: `apps/hrm/src/app/actions/wageOfferActions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `getWageOffer`, `candidateId` | Staff HR/leadership/admin | `{ success, data }` / raw-message ERR | Read only |
| `getMyWageOffer`, none | Verified applicant device | `{ success, data }` / ERR | Read only |
| `saveWageOfferDraft`, `candidateId, Ls54Payload` | Staff HR/leadership/admin | OK/ERR | Upserts draft; RV; signature-event **Audit** |
| `sendWageOffer`, `candidateId, Ls54Payload` | Staff HR/leadership/admin | `success + version` / ERR | Marks sent; RV; signature-event **Audit** |
| `signWageOffer`, signer/language/consent input | Verified applicant device | `success + auditHash/hired` / ERR | Signs/audits, invokes hire bypass, promotes session; RV |
| `declineWageOffer`, `reason?` | Verified applicant device | OK/ERR | Marks declined; RV; signature-event **Audit** |
| `discussWageOffer`, `message?` | Verified applicant device | OK/ERR | Opens/updates wage help ticket; RV; signature-event **Audit** |

### Staff communication and HRM role

File: `apps/hrm/src/app/actions/staffCommunicationActions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `getRbtCommunicationInbox`, none | Weak acting-RBT context | Named `success + rbtUserId/peers/notifications/cases` / ERR; unresolved identity can return success | Reads staff/messages/cases/alerts |
| `getRbtStaffThread`, `peerUserId` | Weak acting-RBT context | `success + messages` / ERR | Reads thread; marks incoming read |
| `sendRbtStaffMessage`, `peerUserId, content, opts?` | Weak acting-RBT context | `success + message` / ERR | Creates message; RV; notification |

File: `apps/hrm/src/app/actions/resolveHrmRole.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `resolveHrmUiRole`, none | Current user or raw role/device cookies | Bare role string | UI-routing helper; F19 |

### RBT payroll and schedule

File: `apps/hrm/src/app/actions/payrollActions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `listRbtPayrollSessions`, `rbtUserId?` | Weak acting-RBT context; explicit ID staff path | `success + sessions/summary` / ERR | Read-only 90-day payroll PHI |
| `listRbtScheduledSessions`, `rbtUserId?` | Weak acting-RBT context; explicit ID staff path | `success + sessions` / ERR | Read-only capped schedule PHI |

### Onboarding signatures and audit pack

File: `apps/hrm/src/app/actions/onboardingSignatureActions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `recordOnboardingDownload`, `stepNumber` | Verified applicant device | `success + auditHash/createdAt` / ERR | Signature-event **Audit** |
| `recordOnboardingSignature`, `{ stepNumber, signerName, consents }` | Verified applicant device | `success + auditHash/createdAt/ipAddress` / ERR | Signature-event **Audit**; RV |
| `recordOnboardingAdvance`, `fromStep, toStep` | Verified applicant device | `success + auditHash` / ERR | Signature-event **Audit** |
| `submitOnboardingEmbeddedForm`, step/signer/form payload | Verified applicant device | `success + auditHash/createdAt` / ERR | Stores form; signature-event **Audit**; RV |
| `uploadOnboardingFile`, `FormData(stepNumber,file)` | Verified applicant device | `success + audit/file metadata` / ERR | Private storage upload + packet flags; **Audit**; RV |
| `submitHarassmentQuiz`, `answers` | Verified applicant device | `success + score/pass/audit data` / ERR | Scores quiz; signature-event **Audit**; RV |
| `getOnboardingStepState`, none | Verified applicant device | `success + data` / ERR with `data:null` | Reads LS-54 and signature events |
| `getCandidateOnboardingAudit`, `candidateId` | Staff ATS roles | `success + data[]` / ERR | Reads audit trail |
| `exportCandidateAuditPack`, `candidateId` | Staff ATS roles | `success + data` / ERR | Reads export pack; records export **Audit** |

### Interview recordings

File: `apps/hrm/src/app/actions/interviewRecordingActions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `listInterviewRecordings`, `candidateId` | Staff ATS roles | `success + data[]` / ERR | Creates short-lived signed read URLs |
| `createInterviewRecordingUpload`, `{ candidateId, mimeType, byteSize }` | Staff ATS roles | `success + signed-upload data` / ERR | Ensures interview; creates signed upload URL only |
| `finalizeInterviewRecording`, recording/candidate/title/duration/MIME input | Staff ATS roles | `success + data` / ERR | Verifies stored size/magic bytes, creates DB metadata; RV |
| `deleteInterviewRecording`, `recordingId` | Staff ATS roles | OK/ERR | Deletes storage object and DB row; RV |

### Applicant help desk

File: `apps/hrm/src/app/actions/helpDeskActions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `createHelpTicket`, candidate/category/subject/message input | Current user; ATS staff or raw-cookie applicant ownership | `success + ticket` / raw-message ERR | Creates ticket/message; syncs stage; RV |
| `listHelpTickets`, optional `{ candidateId, activeOnly }` | Current user; ATS staff or raw-cookie applicant ownership | `success + data[]` / raw-message ERR | Read only |
| `claimHelpTicket`, `ticketId` | Staff ATS roles | `success + ticket` / raw-message ERR | Claims ticket, adds greeting; syncs stage; RV |
| `unclaimHelpTicket`, `ticketId` | Staff ATS roles | `success + ticket` / raw-message ERR | Unclaims ticket; syncs stage; RV |
| `resolveHelpTicket`, `ticketId` | Staff ATS roles | OK / raw-message ERR | Resolves ticket; syncs stage; RV |
| `sendHelpMessage`, `ticketId, message payload` | Current user; staff role or raw-cookie applicant ownership | `success + ticket` / raw-message ERR | Creates message/updates status; RV |
| `updateHelpMessageMeta`, `messageId, meta patch` | Staff ATS roles | `success + ticket` / raw-message ERR | Updates encoded message metadata; RV |

> Count note: this module currently exports **7** actions. `listHelpTickets` serves both staff and applicant views.

### Forty-hour course

File: `apps/hrm/src/app/actions/fortyHourCourseActions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `getFortyHourCoachState`, none | Verified applicant device | `success + data` / ERR | Read only |
| `markFortyHourCoachStep`, `nextStep` | Verified applicant device | `success + data` / ERR | Updates progress; RV |
| `uploadFortyHourCertificate`, `FormData(file)` | Verified applicant device | `success + data/warning?` / ERR | Uploads when possible, but marks complete even on storage failure; RV |
| `getEmptyFortyHourCoach`, none | None; pure helper action | Bare empty state object | No I/O |

### Candidate documents

File: `apps/hrm/src/app/actions/candidateDocumentActions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `attachApplicantDocuments`, `candidateId, uploadToken, FormData(files)` | Valid unexpired candidate packet upload token | OK/ERR | Replaces private storage objects and packet/dossier metadata; RV |
| `getCandidateDocuments`, `candidateId` | Staff ATS roles | `success + data` / ERR with `data:null` | Creates signed URLs and returns dossier |

### Applicant device sessions

File: `apps/hrm/src/app/actions/applicantSessionActions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `promoteHiredSessionToRbt`, none | Raw candidate cookie + hired state | `success + data` / ERR | Flips cookies only; does not verify/rebind device row; F11 |
| `bindMagicLinkSession`, `magicLinkToken` | Valid, unexpired, non-revoked ATS token | `success + data` / ERR | Upserts fingerprint-bound device session, sets cookies; RV |
| `resolveActiveApplicantSession`, none | Verified fingerprint-bound device session | `success + data|null` / ERR | Refreshes activity/cookies |
| `devImpersonateApplicantSession`, `candidateId` | Dev environment gate | `success + data` / ERR | Creates dev device session/cookies; RV |
| `clearApplicantDeviceSession`, none | Cookie/session if present | OK/ERR | Revokes current fingerprint session, clears cookies; RV |
| `revokeCandidateDeviceSessions`, `candidateId` | Staff ATS roles | OK/ERR | Revokes all candidate sessions; RV |

### Login and deprecated staffing

File: `apps/hrm/src/app/login/actions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `login`, `(prevState, FormData(email,password))` | Public credential endpoint + IP/email rate limit; dev-gated shortcut precedes both | `{ error }` or framework redirect | Supabase sign-in, active-profile check, role redirect |

File: `apps/hrm/src/app/actions/staffingActions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `dispatchRbtCandidate`, `_clientId, _rbtCandidateId, _candidateName` | None; inert | Always ERR | Deprecated HR dispatch endpoint |

### Session Studio and EMR

File: `apps/hrm/src/app/actions/sessionEmrActions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `getActingRbtForStudio`, none | Weak acting-RBT context | `success + rbtUserId/rbtName` / ERR | Read only |
| `getSessionStudioTargets`, `{ clientName?, clientId?, autoSync? }` | Weak acting-RBT or any current user; no assignment check | Named target arrays/metadata / raw-message ERR | Reads and may auto-create clinical targets; F6 |
| `submitHrmSessionEmrNote`, structured session/note/modalities payload | Weak acting context; scheduled RBT check but unscheduled client gap | Rich success metadata / raw-message ERR | Atomic session/note/trial/behavior writes; RV; notification; **Audit** |
| `clockInHrmSession`, `{ sessionId, placeOfService?, cptCode?, startedAt? }` | Weak acting context + existing session/RBT check | OK/ERR; local IDs return skipped success | Marks session in progress, creates idempotent EVV log; RV |

### RBT profile sync and public application

File: `apps/hrm/src/app/actions/rbtProfileSync.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `syncRbtProfileToCrm`, `{ userId?, availabilitySlots, preferredBoroughs, totalSelectedHours }` | Weak acting-RBT context | `success + syncStatus/message` / raw-message ERR | Touches linked onboarding row; RV availability |

File: `apps/hrm/src/app/actions/publicRbt.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `submitRbtApplication`, public applicant fields | Public + rate limit | `success + applicantId/uploadToken/message` / raw-message ERR | Creates or updates candidate/packet; RV; existing-token flaw F2 |

### HRM notifications

File: `apps/hrm/src/app/actions/notifications.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `getNotifications`, ignored legacy `userId?` | Current user; unauth/mock returns successful empty | `{ success, notifications[], unreadCount, error? }` | Read only; F17 |
| `createNotification`, notification input | **None** | `{ success, notification?, deduped? }` / ERR | Notification write with unread dedupe; F1 |
| `notifyUsers`, batch notification input | **None** | `{ success, notified, error? }` | Batch notification write with unread dedupe; F1 |
| `markNotificationAsRead`, `id` | Current user + ownership | OK/ERR | Updates row |
| `markAllNotificationsAsRead`, ignored legacy `userId?` | Current user | OK/ERR | Bulk update |

### Legacy HR interview administration

File: `apps/hrm/src/app/actions/hrInterviewActions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `getHrMembers`, none | **None** | `success + data(name,email)` / ERR | Staff-directory read; F9 |
| `bookHrInterview`, caller-supplied candidate/interviewer/name/date/time | Current user only; no ownership/role validation | `success + interview/message` / raw-message ERR | Upserts interview, updates progress, notifies selected ID; RV; F9 |
| `getAtsInterview`, `candidateId` | Current user only; no ownership/role validation | `success + data|null` / raw-message ERR | Reads arbitrary candidate interview; F9 |
| `claimAtsInterview`, `candidateId` | Staff ATS roles | `success + interview` / raw-message ERR | Claims interview; RV |
| `markHrJoinedInterview`, `candidateId` | Staff ATS roles | `success + interview` / raw-message ERR | Records join time; RV |
| `saveInterviewNotes`, `candidateId, notes` | Staff ATS roles | `success + interview` / raw-message ERR | Upserts notes; RV |
| `saveInterviewScorecard`, `candidateId, scorecard` | Staff ATS roles | `success + interview` / raw-message ERR | Upserts scorecard; RV |
| `saveInterviewScriptProgress`, `candidateId, completedSteps[]` | Staff ATS roles | `success + interview` / raw-message ERR | Upserts progress; RV |
| `completeAtsInterview`, `candidateId, { recommendation?, interviewPassed? }` | Staff ATS roles | `success + interview` / raw-message ERR | Completes interview/delegates progress update; RV |

### Legacy RBT note actions

File: `apps/hrm/src/app/(dashboard)/rbt/actions.ts`

| Export and input | Guard | Result | Revalidation and side effects |
|---|---|---|---|
| `logSession`, `(prevState, FormData(clientId,rbtId,bcbaId))` | **None** | `{ success:true }` / `{ error }` | Creates hard-coded completed session/note; RV; F5 |
| `fixDeficiency`, `(prevState, FormData(deficiencyId,noteId))` | **None** | `{ success:true }` / `{ error }` | Re-signs note/resolves deficiency; RV; F5 |

## HRM Route Handler

| Route export (line) | Guard and input | Success / error | Side effects and notes |
|---|---|---|---|
| `GET /api/health` — `apps/hrm/src/app/api/health/route.ts:42` | Public; no input | `200/503 { ok, app:'hrm', time, db:'ok'|'error' }` | Timed database probe only |

## Contract families to collapse

| Current family | Representative examples | Typed-RPC target |
|---|---|---|
| `{ success: boolean, ... }` with named payload fields | Most actions | `ActionResult<T, Code>` with `data` |
| Bare arrays/objects/strings | chat, `getClinicalStaff`, `resolveHrmUiRole`, `getEmptyFortyHourCoach` | Wrapped typed data |
| `{ error }` without a success discriminator | CRM portal/intake and legacy RBT actions | Stable error/result union |
| Raw throw/rejected promise | Unwrapped CRM portal-case and intake mutations | Mapped domain error code |
| Raw `Error.message` returned to client | ATS, public application, legacy interview | Sanitized public message + server-only diagnostic |
| Framework redirect | Login actions | Keep as declared transport control flow |
| Binary/redirect HTTP response | report and document routes | Separate typed route metadata plus documented non-JSON response |

## Suggested procedure registry shape

Each future RPC procedure should declare:

1. Stable name and version (`clinical.notes.sign.v1`).
2. Transport exposure (`serverAction`, `http`, or internal-only).
3. Input and output schemas.
4. Auth context and resource resolver.
5. Domain service and transaction boundary.
6. Stable error-code union.
7. Audit event and redaction policy.
8. Notification/outbox events.
9. Cache tags/paths.
10. Idempotency/concurrency policy.

The registry should fail CI when an exported write has no auth context, when client-scoped input has no resource authorization declaration, or when an action exposes an untyped/raw error.
