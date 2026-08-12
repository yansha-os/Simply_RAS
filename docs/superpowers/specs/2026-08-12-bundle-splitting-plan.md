# Client Bundle Splitting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce initial client JavaScript on the CRM parent/client-profile surfaces and the HRM applicant/RBT surfaces by moving inactive tabs, steps, phases, dialogs, and role branches behind explicit client-side chunk boundaries.

**Architecture:** Keep route data access, authorization, mutations, and workflow state in their current owners. Split only view branches that are mutually exclusive or user-triggered. Declare every `next/dynamic` call at module scope inside a Client Component, use literal import paths, preserve SSR for content that can be the initial view, and use `ssr: false` only for browser-only overlays or role branches that cannot be known on the server.

**Tech Stack:** Next.js 16 App Router and Turbopack, React 19, TypeScript 5, existing Tailwind CSS and Vitest/Playwright tooling. No new runtime or build dependency is required.

**Status:** Execution-ready, document-only plan based on the 2026-08-12 accessibility/performance audit plus a current source/import and `.next` manifest inspection. This planning change owns only this file.

## Global Constraints

- Do not change behavior, workflow gates, mutations, auth semantics, or persisted draft formats merely to create a chunk. The one allowed data-layer change is the read-only, single-candidate loader explicitly required by rank 7's Server Component boundary.
- Do not add a bundle-analyzer dependency. Use production build output, client-reference manifests, and browser network traces.
- Do not place `next/dynamic` in a Server Component expecting it to split an imported Client Component; in the App Router that is not a reliable automatic split. Put the dynamic boundary in a small Client Component controller.
- Every `dynamic(() => import(...))` path must be a literal declared at module scope. No template paths and no `dynamic()` calls inside render functions or event handlers.
- Default to SSR enabled. Use `ssr: false` only where this plan says so and only from an existing/new Client Component.
- A fallback must reserve the loaded panel's approximate height, expose `aria-busy="true"`, and avoid layout shift. Do not replace a substantial panel with a lone spinner.
- Keep the active/first-render branch static when doing so materially improves first paint. Prefetch only the likely next branch on pointer/focus or after the current step validates; do not import every deferred branch on mount.
- Keep controller state above the dynamic boundary so chunk loading cannot discard typed input, file handles, timers, signatures, selections, or optimistic messages.
- Preserve the audit's external-user priority: CRM magic-link parent flow and HRM apply/RBT flow before staff-only dashboards.
- A fresh production build is required before making byte-level claims. The impact rankings below are estimates based on reach, current source size, mutually exclusive code, and manifest fan-out.
- Explicitly deferred and not to be touched by this work: theme engine, DevTools, and report/PDF files listed in [Deferred conflict zones](#deferred-conflict-zones).

---

## Evidence snapshot

### Source/import findings

- The current workspace has no `next/dynamic` import or `dynamic(...)` component boundary under `apps/crm` or `apps/hrm`.
- The audit counted 126 client components across 184 `.tsx` files.
- Current high-cost synchronous owners include:
  - `apps/hrm/src/components/rbt/RbtTasksView.tsx`: 2,062 lines; audit estimate 114 KB source.
  - `apps/hrm/src/components/emr/RbtSessionStudio.tsx`: 2,023 lines; audit estimate 86 KB source.
  - `apps/hrm/src/components/public-rbt/RbtApplicationForm.tsx`: 1,587 lines; audit estimate 74 KB source.
  - `apps/hrm/src/components/rbt/RbtScheduleView.tsx`: 1,296 lines; audit estimate 60 KB source.
  - `apps/hrm/src/app/ats/applicant/[id]/page.tsx`: 2,235 lines and the entire route is a Client Component.
  - `apps/crm/src/components/client-profile/ClientProfileTabs.tsx`: 16 static tab imports.
  - `apps/crm/src/components/client-profile/tabs/BcbaTreatmentPlanTab.tsx`: 875 lines; audit estimate 74 KB source.
  - `apps/crm/src/components/client-profile/tabs/BillingAuthTab.tsx`: 852 lines.
  - `apps/crm/src/components/magic-link/ClientPortalView.tsx`: 688 lines with intake and schedule branches imported together.
  - `apps/crm/src/components/magic-link/ContinuousIntakeForm.tsx`: all three mutually exclusive macro sections imported synchronously.
  - `apps/crm/src/components/GlobalStaffChat.tsx`: 555 lines included by every CRM dashboard route even though its data loads only after opening.

### Existing build artifacts

The existing `.next` folders were inspected but were not regenerated because other work is actively rewriting the tree. Treat them as directional, not as a post-change baseline.

| App | Existing build id | Route | Entry JS files | Relevant synchronous module |
|---|---|---|---:|---|
| CRM | `1gKNw13NpH4Syy7V3QDD0` | `/client/[id]` | 8 | `ClientProfileTabs`, `async: false` |
| CRM | `1gKNw13NpH4Syy7V3QDD0` | `/magic-link/[id]` | 6 | `ClientPortalView`, `async: false` |
| CRM | `1gKNw13NpH4Syy7V3QDD0` | `/portal-billing` | 7 | `BillingQueueTabs`, `async: false` |
| HRM | `Ot24Z0vbWCXMjtfP5TIvA` | `/` | 8 | `HrmDashboardRouter`, `async: false` |
| HRM | `Ot24Z0vbWCXMjtfP5TIvA` | `/rbt` | 7 | `RbtTasksView`, `async: false` |
| HRM | `Ot24Z0vbWCXMjtfP5TIvA` | `/rbt/schedule` | 7 | `RbtScheduleView`, `async: false` |
| HRM | `Ot24Z0vbWCXMjtfP5TIvA` | `/rbt/session/[sessionId]` | 6 | route/Studio client entry, `async: false` |
| HRM | `Ot24Z0vbWCXMjtfP5TIvA` | `/apply` | 6 | `RbtApplicationForm`, `async: false` |
| HRM | `Ot24Z0vbWCXMjtfP5TIvA` | `/ats/applicant/[id]` | 7 | whole client page, `async: false` |
| HRM | `Ot24Z0vbWCXMjtfP5TIvA` | each help desk | 5 | whole client page, `async: false` |

The audit's aggregate CRM artifact was about 1.9 MB across 44 client chunks, with 333 KB and 233 KB as the two largest chunks. The current hashed manifests do not provide trustworthy route gzip sizes, so this plan does not invent byte savings.

### Interpretation

The problem is not merely large files. The highest-value cases are files where one synchronous entry imports several branches while rendering only one:

1. role fork (`RbtTasksView`, `HrmDashboardRouter`);
2. tab router (`ClientProfileTabs`, `RbtScheduleView`, ATS applicant);
3. step/phase wizard (`ContinuousIntakeForm`, `RbtApplicationForm`, `RbtSessionStudio`);
4. closed-by-default overlay (`GlobalStaffChat`, packet previews, PA dialogs).

---

## Boundary rules and shared fallback contract

Use this pattern for SSR-capable branches:

```tsx
const LazyPanel = dynamic(
  () => import('./LazyPanel').then((module) => module.LazyPanel),
  {
    loading: () => <PanelSkeleton label="Loading panel" />,
  }
);
```

Use this pattern only for a browser-only branch from a Client Component:

```tsx
const BrowserOnlyDialog = dynamic(
  () => import('./BrowserOnlyDialog').then((module) => module.BrowserOnlyDialog),
  {
    ssr: false,
    loading: () => <DialogSkeleton label="Opening dialog" />,
  }
);
```

Each app should use a small local fallback component rather than copy large skeleton trees:

- CRM: create `apps/crm/src/components/ui/LazyPanelSkeleton.tsx`.
- HRM: create `apps/hrm/src/components/ui/LazyPanelSkeleton.tsx`.
- Props: `label: string`, `minHeight?: string`, `variant?: 'panel' | 'form' | 'dialog' | 'workspace'`.
- The fallback root carries `role="status"`, `aria-live="polite"`, and `aria-busy="true"`.
- Dialog fallback includes the full fixed backdrop and a correctly sized dialog card, so loading never exposes a clickable background.

---

## Top 15 opportunities ranked by estimated impact

Impact levels are relative to this repository. “Very high” means broad reach plus a large amount of mutually exclusive code; “high” means a hot route or a large conditional branch; “medium” means a narrower staff-only or interaction-only win.

### 1. CRM client-profile tab fan-out

**Estimated impact:** Very high — likely the largest CRM route-level win. Every profile visit currently synchronously reaches 16 tab files, including the 875-line treatment plan and 852-line billing tab, although only one tab is mounted.

**Current owner:** `apps/crm/src/components/client-profile/ClientProfileTabs.tsx`, static imports at lines 6–21.

**Exact boundary:**

- Keep the inline Overview branch and shared tab navigation static.
- Replace static imports with module-scope dynamic imports for:
  - `IntakeDocumentsTab`
  - `ClinicalReviewTab`
  - `BillingAuthTab`
  - `AssessmentPrepTab`
  - `ClientAssignmentsTab`
  - `ClientMessagesTab`
  - `PeerToPeerTab`
  - `ClientDocumentsTab`
  - `BcbaAssessmentTab`
  - `BcbaTreatmentPlanTab`
  - `BcbaSessionEmrTab`
  - `ClinicalGoalsTab`
  - `ClinicalChartProgressTab`
  - `HrStaffingTab`
  - `CaseCoordSchedulingTab`
- Leave `ReportAssemblyTab` untouched and static until the report/PDF rewrite is complete.

**Loading / SSR:** SSR enabled. Use `LazyPanelSkeleton` variant `panel`, minimum height 420 px, with the active tab's visible label.

**Risks and gate:** Verify every `?mode=` and `?tab=` deep link, unread-message clearing, BCBA assignment, and role-specific tab visibility. The active tab must not reset after its chunk resolves.

### 2. HRM `/rbt` live-RBT versus applicant-onboarding fork

**Estimated impact:** Very high — 2,062-line / audit-estimated 114 KB owner on an external-user route. Only one of the live inbox and applicant onboarding hub can render.

**Current owner:** `apps/hrm/src/components/rbt/RbtTasksView.tsx`.

**Exact boundary:**

- Keep only the `liveUnlocked` resolver, event subscriptions, and current loading state in `RbtTasksView.tsx`.
- Move `ApplicantOnboardingTasksHub` and its applicant-only state from line 89 onward to `apps/hrm/src/components/rbt/ApplicantOnboardingTasksHub.tsx`.
- Dynamically import existing `RbtLiveTasksInbox` and new `ApplicantOnboardingTasksHub` from the small gate.
- Do not move `syncAtsProgress` resolution or role/event logic into either branch.

**Loading / SSR:** `ssr: false` for both branches because branch choice depends on browser storage/device-session synchronization after hydration. Reuse the existing “Loading tasks…” shell at a stable minimum height.

**Risks and gate:** Preserve `rbt_progress_synced` and `ras_applicant_session_changed`, hired-user redirection behavior, and all applicant draft state. Confirm the inactive branch's source marker is absent from initial `/rbt` network-loaded JS.

### 3. HRM Session Studio phase panels

**Estimated impact:** Very high — 2,023 lines / audit-estimated 86 KB on the core RBT session route; only one of four phases is visible. Also removes the audit's one-second whole-tree rerender.

**Current owner:** `apps/hrm/src/components/emr/RbtSessionStudio.tsx`.

**Exact boundary:**

- Keep draft hydration, target loading, mutations, derived claim-ready state, phase navigation, and submit orchestration in `RbtSessionStudio.tsx`.
- Create:
  - `apps/hrm/src/components/emr/studio/ClockInPhase.tsx`
  - `apps/hrm/src/components/emr/studio/CollectPhase.tsx`
  - `apps/hrm/src/components/emr/studio/NotePhase.tsx`
  - `apps/hrm/src/components/emr/studio/SignPhase.tsx`
  - `apps/hrm/src/components/emr/studio/SessionTimer.tsx`
  - `apps/hrm/src/components/emr/studio/types.ts`
- Dynamically import all four phase panels in the controller. Pass phase-specific typed view models and callbacks; do not introduce an untyped mega-context.
- Keep the timer component static and tiny. Let it own the one-second display state. Update a controller `elapsedSecondsRef` without setting parent state on every tick; promote the current value to state only on pause, phase transition, draft checkpoint, and submit.
- Prefetch `CollectPhase` after EVV starts, `NotePhase` after first valid datum, and `SignPhase` after note validation.

**Loading / SSR:** SSR enabled. `ClockInPhase` is the expected initial branch; all phase fallbacks use `LazyPanelSkeleton` variant `form`, minimum height 560 px. Keep header, claim-ready strip, and sticky footer mounted during a phase load.

**Risks and gate:** Highest clinical risk. Confirm draft restore, pause/resume, demo-target hard stop, all six collection modalities, unit calculation, incomplete close, signatures, and claim-ready submission. Timer seconds persisted/submitted must match the displayed value within one second.

### 4. CRM continuous intake macro sections

**Estimated impact:** Very high for the parent portal. `ContinuousIntakeForm` synchronously imports Form 01, Form 02, and document uploads while rendering exactly one macro section.

**Current owner:** `apps/crm/src/components/magic-link/ContinuousIntakeForm.tsx`, imports at lines 7–9.

**Exact boundary:**

- Keep `formData`, `formDataRef`, rejection filtering, completion counts, autosave, submit handlers, and rail/navigation in `ContinuousIntakeForm`.
- Replace the three static imports with dynamic named imports:
  - `./Form01ClientIntake`
  - `./Form02Consent`
  - `./DocumentUploads`
- Prefetch the next section only after the current section reaches its required completion count or when the Continue control receives pointer/focus intent.

**Loading / SSR:** SSR enabled because Form 01 is normally the first server-rendered section and rejection mode can make another section first. Use a form skeleton with six labeled rows and minimum height 720 px.

**Risks and gate:** Autosave and `File` state stay in the parent. On chunk resolve, focus must move to the loaded section heading without losing keyboard position. Test normal intake, each single-section rejection mode, double-stringified packet data, and final submit.

### 5. HRM public RBT application steps

**Estimated impact:** Very high for public applicants — 1,587 lines / audit-estimated 74 KB; six mutually exclusive steps plus a closed preview dialog.

**Current owner:** `apps/hrm/src/components/public-rbt/RbtApplicationForm.tsx`.

**Exact boundary:**

- Keep current step, draft persistence, shared `formData`, file objects, preview URL lifecycle, validation, and final submission in `RbtApplicationForm`.
- Create `apps/hrm/src/components/public-rbt/application/` with:
  - `PersonalInfoStep.tsx`
  - `ReadinessStep.tsx`
  - `AvailabilityStep.tsx`
  - `EligibilityStep.tsx`
  - `DocumentsStep.tsx`
  - `ReviewSubmitStep.tsx`
  - `ApplicantDocumentPreviewDialog.tsx`
  - `types.ts`
- Keep `PersonalInfoStep` static for first paint. Dynamically import steps 2–6.
- Dynamically import the preview dialog only when `previewModal` is non-null.
- Prefetch only the next step after current-step validation succeeds.

**Loading / SSR:** Steps 2–6 use SSR enabled; preview dialog uses `ssr: false` because it consumes browser-created Blob URLs and iframe/image preview behavior. Use `LazyPanelSkeleton` variant `form`, minimum height 620 px; dialog fallback reserves the preview card.

**Risks and gate:** Preserve the `rbt_app_draft_v2` format, address debounce/cancellation, Blob ownership, object URL cleanup, Back navigation, per-step validation, Storage upload order, and exactly-once submission.

### 6. CRM parent portal state-specific panels

**Estimated impact:** High — every magic-link state currently ships both the intake form and schedule builder even though client status selects one primary action.

**Current owner:** `apps/crm/src/components/magic-link/ClientPortalView.tsx`, static imports at lines 15–16.

**Exact boundary:**

- Dynamically import named `ContinuousIntakeForm` and named `ClientScheduleBuilder`.
- Extract the messages branch to `apps/crm/src/components/magic-link/ParentMessagesPanel.tsx` and dynamically import it.
- Keep the compact progress tracker and therapy status rows static; they are lightweight and meaningful server-rendered content.
- Use the server-derived `packet.status`, `needsScheduleBuilder`, and `showTherapyLoop` booleans to render exactly one initial action branch.

**Loading / SSR:** SSR enabled for all three panels because any one can be the initial tab. Use action-card, weekly-grid, and message-workspace skeleton variants respectively.

**Risks and gate:** Initial `defaultTab` must remain identical on server and client. Verify all status combinations, unread clearing, treatment-plan signature, preferred schedule save, ACTIVE therapy loop, and message send.

### 7. HRM ATS applicant profile server/client and tab boundary

**Estimated impact:** High — the 2,235-line route is entirely client-side, loads all candidate records and multiple secondary datasets after hydration, and statically reaches audit/offer/interview code.

**Current owner:** `apps/hrm/src/app/ats/applicant/[id]/page.tsx`.

**Exact boundary:**

- Add a scoped server helper `getAtsCandidateById(candidateId)` beside `getAtsCandidates` in `apps/hrm/src/app/actions/atsActions.ts`; it must call the same private `ATS_STAFF_ROLES` gate, reuse `toCandidateRow`, and use the existing select/include contract.
- Convert `page.tsx` to an async Server Component that resolves `params` and calls that gated helper, loading one candidate rather than calling unfiltered `getAtsCandidates()` and searching client-side. For a development-only non-database/mock id, pass an empty initial candidate into the client shell so the existing local fallback can still resolve it.
- Move interactive state to `apps/hrm/src/components/hrm/applicant/ApplicantProfileClient.tsx`.
- Create and dynamically import:
  - `ApplicantOverviewTab.tsx`
  - `ApplicantProgressTab.tsx`
  - `ApplicantInterviewTab.tsx`
  - `ApplicantOfferTab.tsx` wrapping existing `ExtendOfferTab`
  - `ApplicantAuditTab.tsx` wrapping existing `AtsApplicantAuditView`
  - `ApplicantDocumentPreviewDialog.tsx`
  - `ApplicantDeleteDialog.tsx`
- Keep the profile header and tab strip in `ApplicantProfileClient`.
- Browser-only recording/IndexedDB code remains inside `ApplicantInterviewTab`; it must not be imported by Overview.

**Loading / SSR:** SSR enabled for tab panels except `ApplicantInterviewTab` and document preview, which use `ssr: false` because they rely on `MediaRecorder`, IndexedDB, camera/mic state, and browser object URLs. Use a profile-card skeleton and a fixed-size interview workspace fallback.

**Risks and gate:** Preserve staff authorization, DevTools impersonation behavior without editing DevTools files, local fallback dossier behavior in development, document signed URLs, interview event refreshes, recording cleanup, offer permissions, and delete confirmation.

### 8. HRM RBT schedule tabs and drawers

**Estimated impact:** High — 1,296 lines / audit-estimated 60 KB; default Schedule, Active, Incomplete, Completed, sick-day dialog, and fix drawer are bundled together.

**Current owner:** `apps/hrm/src/components/rbt/RbtScheduleView.tsx`.

**Exact boundary:**

- Keep query-param tab selection, schedule fetch/refresh, top-level normalized arrays, week anchor, and navigation in `RbtScheduleView`.
- Create:
  - `apps/hrm/src/components/rbt/schedule/ScheduleCalendarPanel.tsx`
  - `ActiveSessionPanel.tsx`
  - `IncompleteSessionsPanel.tsx`
  - `CompletedSessionsPanel.tsx`
  - `SickDayDialog.tsx`
  - `types.ts`
- Keep default `ScheduleCalendarPanel` static.
- Dynamically import the other three tab panels.
- Replace the static `FixIncompleteSessionDrawer` import with a module-scope dynamic named import and render only while open.
- Dynamically import `SickDayDialog` only while open.

**Loading / SSR:** SSR enabled for tab panels. The drawer and sick-day dialog use `ssr: false`. Use a seven-column calendar skeleton for tabs and full overlay/card fallbacks for overlays.

**Risks and gate:** Preserve `?tab=`, clinic timezone calculations, local completed/done ids, pay-hold synchronization, live refresh, active timers, simulation mode, start-Session-Studio navigation, and drawer save/close behavior.

### 9. CRM global staff chat launcher versus body

**Estimated impact:** High by reach — the 555-line chat is a synchronous dashboard-layout dependency on every staff route, but staff/message data is already fetched only after `isOpen`.

**Current owner/import chain:** `apps/crm/src/app/(dashboard)/layout.tsx` → `apps/crm/src/components/GlobalStaffChat.tsx`.

**Exact boundary:**

- Keep `GlobalStaffChat.tsx` as a tiny launcher that owns `isOpen` plus a one-way `hasOpened` latch.
- Move staff list, thread polling, optimistic outbox, Jitsi helpers, composer, and panel UI to `apps/crm/src/components/GlobalStaffChatPanel.tsx`.
- Dynamically import `GlobalStaffChatPanel` only after the launcher first opens. Once `hasOpened` is true, keep the panel mounted and pass `open={isOpen}`.
- Preserve the panel state while closed by hiding rather than unmounting it; before first open, no panel chunk or data request should occur.

**Loading / SSR:** `ssr: false`. Keep the launcher visible; while loading, render a 380 × 560 px chat-window shell with header and message-row skeletons.

**Risks and gate:** Verify only one five-second poll exists, polling stops on unmount/navigation, close/reopen preserves the selected peer, optimistic retries survive, and keyboard focus returns to the launcher.

### 10. HRM home role router

**Estimated impact:** High — the root manifest has four route-specific chunks and `HrmDashboardRouter` statically imports Head HR, Finance, public landing, applicant tasks, and HR agent analytics while rendering one role.

**Current owner:** `apps/hrm/src/components/hrm/HrmDashboardRouter.tsx`, imports at lines 6–10.

**Exact boundary:**

- Keep `RbtPublicLanding` static so the unauthenticated root retains immediate content.
- Dynamically import:
  - `HeadHrCommandCenter`
  - `PayrollBenefitsView`
  - `RbtTasksView`
  - `HrAgentAnalyticsView`
- Keep RBT redirect logic in the router.

**Loading / SSR:** `ssr: false` for role-specific branches because `useHrmRole` intentionally hydrates from `NONE` using localStorage and a server role check. Use the existing centered “Opening…” shell with role-neutral copy.

**Risks and gate:** No wrong-role flash, no staff view in unauthenticated HTML, public landing remains indexable, and RBT still redirects to `/rbt/schedule`.

### 11. CRM staff packet form-preview imports

**Estimated impact:** High within client-profile document/review tabs — both staff tabs synchronously import the complete Form 01 and Form 02 UIs only for a preview dialog.

**Current owners:**

- `apps/crm/src/components/client-profile/tabs/IntakeDocumentsTab.tsx`, imports at lines 9–10.
- `apps/crm/src/components/client-profile/tabs/ClinicalReviewTab.tsx`, imports at lines 9–10.

**Exact boundary:**

- Create `apps/crm/src/components/client-profile/IntakePacketPreviewDialog.tsx`.
- Move the shared portal, header, form selection, document preview, staged rejection controls, and close/discard handling into typed dialog props.
- Inside the dialog, dynamically import named `Form01ClientIntake` and `Form02Consent`.
- Both tabs dynamically import the dialog and mount it only when `previewDoc` is non-null.

**Loading / SSR:** `ssr: false` because the dialog uses `createPortal` and is closed initially. Use a full-screen backdrop with a large document-card skeleton.

**Risks and gate:** Preserve separate intake versus clinical rejection actions, read-only/approval state, staged field selections, unsaved-close confirmation, signed document URLs, and return focus to the row that opened the dialog.

### 12. HRM help-desk route workspaces

**Estimated impact:** Medium-high — 775-line staff and 884-line applicant pages are whole-route Client Components. Each current route is one synchronous route chunk.

**Current owners:**

- `apps/hrm/src/app/ats/help-tickets/page.tsx`
- `apps/hrm/src/app/(dashboard)/rbt/help-desk/page.tsx`

**Exact boundary:**

- Move staff interactive code to `apps/hrm/src/components/help-desk/HrHelpTicketsClient.tsx`; make the route a Server Component that gates staff and passes `initialTickets` from `listHelpTickets({ activeOnly: true })`.
- Move applicant interactive code to `apps/hrm/src/components/help-desk/RbtHelpDeskClient.tsx`; keep candidate-session resolution in that client controller.
- Extract common rendering-only primitives to `apps/hrm/src/components/help-desk/`:
  - `TicketList.tsx`
  - `TicketConversation.tsx`
  - `MessageComposer.tsx`
  - `types.ts`
- Dynamically import `TicketConversation` and `MessageComposer` only when an active ticket/thread is visible. The applicant's default New Ticket view must not request the conversation chunk.

**Loading / SSR:** SSR enabled for the staff client shell and shared conversation. The applicant shell remains client-resolved; use a two-column workspace skeleton. Attachment controls that consume a file input may remain in the client conversation.

**Risks and gate:** Preserve authorization, latest-200 message ordering, optimistic outbox, failed-send retry, attachment/Jitsi metadata, active ticket selection, empty/no-session states, and scroll-to-latest behavior.

### 13. CRM case-coordination job-board subtab

**Estimated impact:** Medium-high — `CaseCoordSchedulingTab` statically imports the 979-line `ClientJobBoardPanel`; the sibling activation subtab does not need marketplace/application code.

**Current owner:** `apps/crm/src/components/client-profile/tabs/CaseCoordSchedulingTab.tsx`, import at line 23 and conditional render at lines 167–172.

**Exact boundary:**

- Replace the static `ClientJobBoardPanel` import with a module-scope dynamic default import.
- Keep the activation subtab and `StaffingReadinessChecklist` static.
- Prefetch the job-board panel on focus/pointer intent of “Job Board & Applicants” when the activation subtab is current.

**Loading / SSR:** SSR enabled because job board is the current default subtab. Use a readiness card plus three opening/application card skeletons.

**Risks and gate:** Verify publish/close opening, application status changes, parent accept/decline, meeting scheduling, messages, weekly unit grid edits, and the callback that switches to activation.

### 14. CRM billing queue inactive tab

**Estimated impact:** Medium — both assessment and treatment queue trees are synchronous although Assessment is the default.

**Current owner:** `apps/crm/src/components/portal-billing/BillingQueueTabs.tsx`, static imports at lines 4–5.

**Exact boundary:**

- Keep `BillingPaQueue` static.
- Dynamically import default `TreatmentPaQueue`.
- Prefetch Treatment on pointer/focus intent of its tab, not on mount.

**Loading / SSR:** SSR enabled. Use three PA-column skeletons and keep tab counts/navigation mounted.

**Risks and gate:** Badge counts must render before the chunk arrives; search/filter/action behavior must be unchanged after switching repeatedly.

### 15. CRM billing authorization dialogs

**Estimated impact:** Medium — `BillingAuthTab` contains four decision portals and one document-preview portal, all closed initially, inside an 852-line client component.

**Current owner:** `apps/crm/src/components/client-profile/tabs/BillingAuthTab.tsx`.

**Exact boundary:**

- Create `apps/crm/src/components/client-profile/tabs/billing/PaDecisionDialog.tsx` supporting assessment/treatment and approve/deny modes through a discriminated union.
- Create `apps/crm/src/components/client-profile/tabs/billing/BillingDocumentPreviewDialog.tsx`.
- Keep PA state and server-action callbacks in `BillingAuthTab`; pass typed values/handlers to the loaded dialog.
- Dynamically import each dialog and mount only for its matching state.
- Keep `AuthUnitsPanel` and `WeeklyBillableUnitGrid` static within the already deferred Billing tab; both are immediately visible and splitting them would add a waterfall without avoiding work.

**Loading / SSR:** `ssr: false` for both dialogs. Use a fixed backdrop/card fallback and keep destructive/approval controls unavailable until the dialog chunk loads.

**Risks and gate:** Preserve all assessment/treatment action mappings, pending/disabled state, approval fields, denial reasons, mounted portal behavior, preview signed-URL security, and focus restoration.

---

## Independently shippable phases

Each phase is a separate review/rollback boundary. A phase may land without waiting for later phases once its own build, behavior smoke, and network assertion pass.

### Phase 0: Record a fresh baseline

**Files changed:** None required.

- [ ] Wait until the theme, DevTools, and report/PDF rewrites have stopped changing their owned files.
- [ ] Run `npm run build:crm` and `npm run build:hrm`.
- [ ] Record build ids and the `entryJSFiles` arrays for the routes in the evidence table.
- [ ] Start each production app and capture initial JS requests for `/magic-link/[id]`, `/client/[id]`, `/`, `/apply`, `/rbt`, `/rbt/schedule`, `/rbt/session/[sessionId]`, and `/ats/applicant/[id]`.
- [ ] Save byte totals in the implementation PR description, not in a new generated repository document.

**Exit gate:** Baseline comes from the same commit/worktree that the first split is based on.

### Phase 1: Split CRM client-profile tabs

**Implements:** Rank 1.

**Files:**

- Modify: `apps/crm/src/components/client-profile/ClientProfileTabs.tsx`
- Create: `apps/crm/src/components/ui/LazyPanelSkeleton.tsx`

- [ ] Add the shared CRM fallback.
- [ ] Convert the 15 approved tab imports to literal module-scope dynamic imports.
- [ ] Keep Overview and deferred `ReportAssemblyTab` static.
- [ ] Smoke every role/mode and every supported deep-link alias.
- [ ] Confirm an Overview visit does not request treatment-plan, billing, chart-progress, or case-coordination chunks.

**Exit gate:** CRM typecheck/build passes; each inactive tab chunk appears only after its tab is selected or intentionally prefetched.

### Phase 2: Split CRM parent portal

**Implements:** Ranks 4 and 6.

**Files:**

- Modify: `apps/crm/src/components/magic-link/ClientPortalView.tsx`
- Modify: `apps/crm/src/components/magic-link/ContinuousIntakeForm.tsx`
- Create: `apps/crm/src/components/magic-link/ParentMessagesPanel.tsx`
- Reuse: `apps/crm/src/components/ui/LazyPanelSkeleton.tsx`

- [ ] Land the status/tab split in `ClientPortalView` first and verify all client statuses.
- [ ] Land the three intake macro-section boundaries second.
- [ ] Add high-intent next-section prefetch.
- [ ] Run normal packet, rejected Form 01, rejected Form 02, rejected upload, schedule builder, ACTIVE schedule, and message smokes.
- [ ] Confirm no inactive parent panel or later intake section is in initial requested JS.

**Exit gate:** Parent flow passes keyboard navigation, autosave, upload, final submit, and CLS checks on a production build.

### Phase 3: Split HRM applicant entry and role forks

**Implements:** Ranks 2, 5, and 10.

**Files:**

- Modify: `apps/hrm/src/components/rbt/RbtTasksView.tsx`
- Create: `apps/hrm/src/components/rbt/ApplicantOnboardingTasksHub.tsx`
- Modify: `apps/hrm/src/components/public-rbt/RbtApplicationForm.tsx`
- Create: `apps/hrm/src/components/public-rbt/application/*.tsx`
- Modify: `apps/hrm/src/components/hrm/HrmDashboardRouter.tsx`
- Create: `apps/hrm/src/components/ui/LazyPanelSkeleton.tsx`

- [ ] Split the HRM home role router.
- [ ] Reduce `RbtTasksView` to the role/device-session gate and extract the applicant hub.
- [ ] Split public application steps while preserving the draft schema.
- [ ] Test public, applicant, hired RBT, HR agent, Finance, and Head HR role paths.
- [ ] Verify `/apply` requests only the first-step code initially and `/rbt` requests only the resolved role branch.

**Exit gate:** HRM typecheck/build passes; apply draft resume and applicant-to-RBT promotion remain intact.

### Phase 4: Split Session Studio

**Implements:** Rank 3.

**Files:**

- Modify: `apps/hrm/src/components/emr/RbtSessionStudio.tsx`
- Create: `apps/hrm/src/components/emr/studio/*.tsx`
- Reuse: `apps/hrm/src/components/ui/LazyPanelSkeleton.tsx`

- [ ] Extract the timer without changing elapsed-time persistence or billing-unit results.
- [ ] Extract Clock In, Collect, Note, and Sign view panels with typed interfaces.
- [ ] Add phase-specific dynamic imports and high-intent prefetch.
- [ ] Run the Session Studio unit suites plus a full manual CLOCK_IN → COLLECT → NOTE → SIGN submit.
- [ ] Run a close-incomplete path and a restored-draft path.
- [ ] Use React Profiler to confirm only the timer leaf commits once per second.

**Exit gate:** Claim-ready payloads are equivalent before/after, and the initial route does not request Collect/Note/Sign chunks.

### Phase 5: Split RBT schedule

**Implements:** Rank 8.

**Files:**

- Modify: `apps/hrm/src/components/rbt/RbtScheduleView.tsx`
- Create: `apps/hrm/src/components/rbt/schedule/*.tsx`

- [ ] Extract tab panels, sick-day dialog, and dynamic fix drawer.
- [ ] Keep the default schedule calendar static.
- [ ] Test LIVE and SIMULATION modes, every `?tab=` value, refresh, sick day, and incomplete repair.
- [ ] Confirm unopened tabs/drawers are absent from initial requested JS.

**Exit gate:** Schedule semantics and clinic-timezone tests pass; no new timer or event-listener leak appears.

### Phase 6: Split ATS applicant and help desks

**Implements:** Ranks 7 and 12.

**Files:**

- Modify: `apps/hrm/src/app/actions/atsActions.ts`
- Modify: `apps/hrm/src/app/ats/applicant/[id]/page.tsx`
- Create: `apps/hrm/src/components/hrm/applicant/*.tsx`
- Modify: `apps/hrm/src/app/ats/help-tickets/page.tsx`
- Modify: `apps/hrm/src/app/(dashboard)/rbt/help-desk/page.tsx`
- Create: `apps/hrm/src/components/help-desk/*.tsx`

- [ ] Add the single-candidate server helper with the same role gate and mapping contract.
- [ ] Convert applicant page to a Server Component shell and split tabs/dialogs.
- [ ] Convert the staff help-desk page to a Server Component shell.
- [ ] Extract shared ticket display primitives and conditional conversation branches.
- [ ] Test staff and applicant authorization, interview recordings, offer/audit permissions, messages, attachments, calls, and retries.

**Exit gate:** No all-candidate fetch on applicant detail; browser-only APIs are absent from Overview's initial chunk; both help desks retain latest-message behavior.

### Phase 7: Split CRM global staff chat

**Implements:** Rank 9.

**Files:**

- Modify: `apps/crm/src/components/GlobalStaffChat.tsx`
- Create: `apps/crm/src/components/GlobalStaffChatPanel.tsx`

- [ ] Reduce the synchronous layout child to the launcher.
- [ ] Move panel state/effects and UI to the lazy body.
- [ ] Preserve loaded panel state across close/reopen.
- [ ] Verify no staff/message request and no chat body chunk before first open.
- [ ] Verify poll cleanup, retry, Jitsi call, focus return, and mobile sizing.

**Exit gate:** Every CRM dashboard route retains the launcher but no longer pays the chat-body cost at startup.

### Phase 8: Split secondary CRM staff interactions

**Implements:** Ranks 11, 13, 14, and 15.

**Files:**

- Modify: `apps/crm/src/components/client-profile/tabs/IntakeDocumentsTab.tsx`
- Modify: `apps/crm/src/components/client-profile/tabs/ClinicalReviewTab.tsx`
- Create: `apps/crm/src/components/client-profile/IntakePacketPreviewDialog.tsx`
- Modify: `apps/crm/src/components/client-profile/tabs/CaseCoordSchedulingTab.tsx`
- Modify: `apps/crm/src/components/portal-billing/BillingQueueTabs.tsx`
- Modify: `apps/crm/src/components/client-profile/tabs/BillingAuthTab.tsx`
- Create: `apps/crm/src/components/client-profile/tabs/billing/*.tsx`

- [ ] Split packet previews and verify intake/clinical action differences.
- [ ] Split job-board subtab and verify all opening/application workflows.
- [ ] Split Treatment PA queue and keep badge counts immediate.
- [ ] Split PA decision/document dialogs and verify every action mapping.
- [ ] Confirm no closed dialog or inactive queue/subtab code is requested initially.

**Exit gate:** CRM build and connected intake → billing → staffing smoke pass.

---

## Verification protocol for every phase

### Static and compile checks

- [ ] `rg "from ['\"]next/dynamic['\"]" <changed-app>/src` shows only intended module-scope owners.
- [ ] `rg "dynamic\\(" <changed-app>/src` confirms no render-local or event-local declaration.
- [ ] `npm test`
- [ ] `npm run typecheck`
- [ ] Run the changed app's production build: `npm run build:crm` or `npm run build:hrm`.
- [ ] Confirm no target route falls back to a full-page Client Component unless this plan explicitly retains one.

### Runtime behavior checks

- [ ] Start the changed app from its production build.
- [ ] Disable browser cache and record initial JS requests.
- [ ] Verify the deferred module's distinctive UI text is absent from initially requested chunks.
- [ ] Trigger the branch and verify its chunk loads once, the fallback reserves space, and the final UI keeps state/focus.
- [ ] Navigate away/back and switch branches repeatedly to catch duplicate subscriptions, remount resets, and stale closures.
- [ ] Test a slow-3G profile to ensure fallbacks remain usable and controls cannot submit before their dialog/panel is ready.

### Per-route success targets

These are structural targets; byte thresholds are set from the fresh Phase 0 baseline.

- `/client/[id]`: Overview initial JS excludes all 15 deferred tabs.
- `/magic-link/[id]`: only the server-selected initial portal panel and active intake macro section load initially.
- `/apply`: first step loads initially; steps 2–6 and preview load on demand.
- `/rbt`: exactly one live/applicant branch loads after role resolution.
- `/rbt/session/[sessionId]`: Clock In loads initially; Collect/Note/Sign load by phase.
- `/rbt/schedule`: default Schedule loads initially; other tabs/drawers load on demand.
- `/ats/applicant/[id]`: initial profile data arrives from the server; interview browser APIs are absent until Interview.
- CRM dashboard routes: staff-chat body is absent until launcher activation.

### Rollback rule

Each rank changes only an import/render boundary and optional extracted view files. If a production regression appears, revert that rank's owner plus its new leaf files; do not revert neighboring phases or alter persisted data to compensate.

---

## Deferred conflict zones

These are valid future bundle targets but are intentionally excluded because they are currently being rewritten.

### Theme engine — defer

Do not modify:

- `apps/crm/src/components/layout/ThemeContext.tsx`
- `apps/crm/src/components/theme/ThemeBackground.tsx`
- `apps/crm/src/components/layout/ThemeSettingsModal.tsx`
- `apps/crm/src/components/layout/Header.tsx` for theme-related splitting
- `apps/crm/src/app/layout.tsx`
- `apps/hrm/src/components/layout/ThemeContext.tsx`
- `apps/hrm/src/components/theme/ThemeBackground.tsx`
- `apps/hrm/src/components/layout/ThemeSettingsModal.tsx`
- `apps/hrm/src/components/layout/HrmLayoutWrapper.tsx`
- `apps/hrm/src/app/layout.tsx`

After the rewrite lands, remeasure the root layout chunks and consider route groups that keep dashboard chrome out of public `/apply`, `/login`, and Session Studio. That decision must be made against the new theme architecture, not the current one.

### DevTools — defer

Do not modify:

- `apps/crm/src/components/DevToolsUI.tsx`
- `apps/crm/src/components/DevToolsWrapper.tsx`
- `apps/crm/src/components/HrmDevToolsUI.tsx`
- `apps/hrm/src/components/HrmDevToolsUI.tsx`
- `apps/*/src/lib/devToolsGate.ts`

Current manifests show DevTools in shared layout client graphs, so there may be a broad win later. Re-evaluate only after the DevTools rewrite and production gate settle.

### Report/PDF — defer

Do not modify:

- `apps/crm/src/components/client-profile/tabs/ReportAssemblyTab.tsx`
- `apps/crm/src/app/api/generate-report/[clientId]/route.tsx`
- `apps/crm/src/lib/pdf/TreatmentPlanPDF.tsx`
- `apps/crm/src/lib/pdf/treatmentPlanReportModel.ts`
- `apps/crm/src/lib/pdf/tmp-pdf-smoke.test.ts`
- `apps/crm/package.json` for `@react-pdf/renderer`

`ReportAssemblyTab` remains the one intentional static tab import in Phase 1. After the PDF rewrite lands, verify that `@react-pdf/renderer` exists only in the server route graph before dynamically splitting or otherwise changing the report preview.

---

## Final execution order

1. Fresh production baseline.
2. CRM client-profile tab fan-out.
3. CRM parent portal and intake sections.
4. HRM role/task/public-application forks.
5. Session Studio phases and timer leaf.
6. RBT schedule tabs/drawers.
7. ATS applicant and help-desk boundaries.
8. CRM global chat.
9. Secondary CRM packet/job-board/billing interactions.
10. Re-audit deferred theme, DevTools, and report/PDF graphs only after their rewrites land.

This order delivers the external-user wins first, isolates the highest-risk clinical split in its own phase, and keeps every later phase independently revertible.
