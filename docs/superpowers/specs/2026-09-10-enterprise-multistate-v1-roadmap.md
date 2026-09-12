# Enterprise Multi-State v1 Roadmap

**Status:** IN PROGRESS  
**Program:** Rise & Shine CRM + HRM enterprise acceptance  
**Release policy:** v1 uses synthetic/deidentified data; v2 is the first general release authorized for real users and PHI.

This is the execution program for making the existing product simple, fast, reversible, auditable, and structurally multi-state. It does not replace the clinical source of truth, connected-product playbook, pre-production checklist, or cutover checklist; it gates and sequences them.

## Product doctrine

1. Make the correct action obvious and the unsafe action difficult.
2. Preserve one authoritative fact; derive views instead of duplicating state.
3. Never spend compute, storage, bandwidth, complexity, or model inference without measurable user value.
4. Prefer explicit state machines, typed contracts, deterministic rules, idempotency, transactions, and append-only evidence.
5. Application releases should be easy to disable or roll back. Signed clinical records, claims, payroll, and audit evidence use corrections or compensating events—not destructive rollback.
6. No compliance, billing, EVV, security, or reimbursement claim without external evidence supporting the exact scope.
7. No feature exists merely because a competitor has it. Required outcomes receive the smallest complete workflow.

## Release definitions

| Release | Meaning | Data gate |
|---|---|---|
| `v0.9.x` | Feature-complete release candidates and destructive testing | Synthetic/deidentified only |
| `v1.0.0` | Enterprise acceptance baseline; all promised workflows and recovery controls verified | Synthetic/deidentified only |
| `v1.x` | Controlled field testing, usability refinement, and certified adapter work | PHI prohibited unless a separate written go/no-go authorizes a bounded pilot |
| `v2.0.0` | General production launch | Real users/PHI only after security, compliance, operations, and leadership sign-off |

Version numbers never substitute for deployment controls. Environment configuration must independently prevent dev tools, synthetic identities, and unapproved PHI use.

## Definition of “10/10 v1”

V1 is 10/10 only within its declared acceptance scope. Every item below needs reproducible evidence:

- every promised role can complete its end-to-end workflow;
- unauthorized and cross-resource access fails before data access;
- clinical, billing, EVV, hiring, and payroll transitions are race-safe and retry-safe;
- failures preserve drafts and never manufacture successful evidence;
- required database schema, indexes, storage, encryption, and environment locks are verified;
- the browser, unit, integration, security, accessibility, performance, backup, and restore gates pass;
- the product is measurably faster and simpler on its critical tasks;
- limitations and uncertified external integrations are explicit;
- a clean checkout can be built, deployed, observed, disabled, and restored from documented procedures.

“No known release-blocking defects after the defined test program” is acceptable. “No possible bugs” is not a defensible claim.

## Architecture target

Rules resolve through versioned layers:

```text
Federal baseline
  -> state program and effective period
    -> payer / managed-care plan
      -> organization and service location
        -> client authorization
          -> immutable session/note/claim rule snapshot
```

Clinical facts stay independent from jurisdiction rules. EVV vendors, clearinghouses, storage, messaging, payroll, and identity providers sit behind typed adapters. UI components do not contain state/payer policy branches.

## Execution order

### Track 0 — Baseline, ownership, and scope

- [x] Freeze new product surfaces during stabilization.
- [x] Establish v1/v1.x/v2 evidence and data boundaries.
- [x] Preserve CRM ownership of client/clinical/PA/case coordination and HRM ownership of ATS/RBT delivery.
- [x] Inventory every reachable production route, server action, scheduled/background task, external adapter, and data store.
- [x] Classify each surface: LIVE, DEV_ONLY, PROTOTYPE, HOLD, or RETIRE.
- [x] Map every critical workflow to its source-of-truth records and owning roles.
- [x] Reconcile this program against open checklist rows; remove stale claims rather than duplicate them.

**Gate 0:** no unknown or ambiguously owned production surface.

### Track 1 — Multi-state domain foundation

- [x] Inventory New York assumptions: timezone, address, Medicaid IDs, codes, modifiers, credentials, EVV, consent, retention, incidents, and copy.
- [x] Define organization, service location, jurisdiction, payer plan, provider enrollment, and effective-dated rule ownership.
- [x] Define deterministic rule resolution and conflict precedence.
- [ ] Snapshot rule version and resolved billing facts on durable service records.
- [ ] Make scheduling timezone-aware across DST boundaries and multi-location views.
- [ ] Support multiple assigned care-team members without weakening note/session authorization.
- [ ] Add one verified New York rule package; keep other states disabled until researched, reviewed, and tested.
- [ ] Prove a second synthetic state package can be added without schema surgery or UI condition sprawl.

**Gate 1:** a state/payer package is data/configuration plus reviewed deterministic logic—not scattered conditionals.

#### Track 1 domain contract

The foundation uses explicit ownership rather than interpreting free-text fields. The names below are conceptual until the additive Prisma/SQL slice lands; this contract controls that migration.

| Authority | Cardinality and purpose | Immutable/history rule |
|---|---|---|
| `Organization` | Tenant and billing/legal operator. Owns users, clients, locations, plans, enrollments, policies, and all generated records. | An operational record never changes organization. Cross-organization access fails closed. |
| `ServiceLocation` | Belongs to one organization; carries IANA timezone, service-area identity, address metadata, active dates, and default jurisdiction bindings. | Historical services retain their location and timezone snapshot even if the location changes or closes. |
| `Jurisdiction` | Reusable COUNTRY, STATE, or LOCAL authority with stable code and optional parent. Locations bind to all applicable jurisdictions. | Codes are stable; revised requirements create rule versions rather than editing history. |
| `PayerPlan` | Organization-owned contract/program identity, distinct from display-name payer text; may bind a state/program and claims/EVV configuration. | A client coverage period points to a plan version/effective interval; payer-name edits cannot rewrite prior services. |
| `ProviderEnrollment` | Connects organization, payer plan, optional service location, and optional rendering provider with identifiers, status, and effective interval. | Enrollment validity is evaluated at service time; identifiers are restricted and prior intervals remain auditable. |
| `RuleSet` | Stable logical rule key and category (billing, EVV, credential, consent, retention, incident, employment) owned by a federal, jurisdiction, payer-plan, or organization authority. | The key is stable and contains no mutable effective behavior. |
| `RuleVersion` | Immutable reviewed payload with version, effective interval, source references, approval state, and deterministic evaluator contract. | Published versions cannot be edited; corrections supersede them. Overlapping active versions at the same scope are rejected. |
| `ResolvedRuleSnapshot` | Content-addressed result attached to a durable service/note/claim decision, including selected version IDs and normalized resolved facts. | Never recomputed to alter history. Reprocessing creates a new decision linked to the prior one. |

Required relationships for the additive rollout:

- Bootstrap exactly one organization for existing data, then backfill `organizationId` before making tenant columns required. No request may accept a caller-supplied organization as authority.
- Every user and client belongs to one organization in v1. A future cross-organization workforce relationship requires an explicit membership model; it must not be simulated with global role access.
- Every service-bearing session references one service location. Client primary location is a default only; the session location is the historical authority.
- Client coverage becomes effective-dated and references `PayerPlan`; existing `insurancePayer`, `memberId`, and `medicaidId` remain compatibility inputs until encrypted/restricted coverage storage is migrated and verified.
- Provider enrollment is separate from certification/licensure. A valid credential does not imply payer enrollment, and enrollment does not imply permission to perform a service.
- Rules store structured normalized data, never executable source. Unknown values, missing applicability, ambiguous overlap, or failed schema validation produce a review hold—not a guessed default.
- All PHI/PII queries remain organization- and resource-scoped in server authorization. Adding tenant columns does not itself satisfy the Track 2 tenant-isolation gate.

Resolution inputs are the service instant, organization, service location, applicable jurisdictions, payer-plan coverage, provider/enrollment, service code/modifiers/POS, and rule category. Resolution precedence is deterministic:

1. Preserve explicit recorded service facts; policy resolution may validate them but may not silently rewrite them.
2. Apply non-waivable federal and jurisdiction requirements as constraints.
3. Apply the effective payer-plan/program version when it is more specific and does not weaken a higher constraint.
4. Apply service-location and organization policy only for permitted operational choices or stricter controls.
5. Within the same authority and specificity, select the single version whose half-open interval contains the service instant; zero or multiple matches fail closed.
6. Persist canonical normalized facts, selected version IDs, evaluator version, and a SHA-256 content hash on the durable decision boundary.

Dates use half-open intervals (`effectiveFrom <= serviceInstant < effectiveTo`), with null `effectiveTo` meaning open-ended. Draft, approved, active, superseded, and retired lifecycle state is distinct from the effective interval. Activation requires named clinical/billing/compliance ownership appropriate to the category; legal or payer claims additionally require authoritative dated sources and human approval.

### Track 2 — Authorization, privacy, and security

- [ ] Complete server-action inventory with guard-first and resource-scope evidence.
- [ ] Verify tenant/organization isolation in addition to role checks before multi-organization use.
- [ ] Test horizontal and vertical privilege escalation for every role and parent/candidate link flow.
- [ ] Verify secrets, cookies, MFA, session revocation, rate limits, CSRF/origin handling, signed URLs, upload validation, and encryption-key readiness.
- [ ] Define field-level sensitivity and prevent PHI in logs, analytics, notifications, caches, URLs, exports, and errors.
- [ ] Verify retention, legal hold, deletion, correction, export, and access-audit behavior.
- [ ] Run dependency, supply-chain, SAST, secret, and infrastructure scans.
- [ ] Commission an independent penetration test before the v2 PHI gate.

**Gate 2:** no known critical/high vulnerability; medium findings have owners, containment, and deadlines.

### Track 3 — Clinical EMR integrity

- [ ] Verify target/program cardinality, measurement types, prompt levels, baselines, phase changes, mastery, maintenance, generalization, and discontinuation.
- [ ] Verify frequency, rate, duration, latency, interval, task-analysis, probe, ABC, caregiver-training, supervision, and protocol-modification workflows.
- [ ] Ensure raw observations are immutable evidence and derived graphs can be rebuilt.
- [ ] Version treatment plans and preserve who approved each effective change.
- [ ] Validate concurrent sessions, duplicate submissions, late entries, corrections, addenda, reopened notes, missing signatures, and staff reassignment.
- [ ] Verify clinical dashboards never silently drop, merge, or fabricate observations.
- [ ] Conduct BCBA/RBT usability and clinical-integrity acceptance against synthetic cases.

**Gate 3:** every graph, status, and report traces back to durable authorized evidence.

### Track 4 — Scheduling, EVV, and service delivery

- [ ] Validate schedule conflicts across client, provider, location, credentials, authorization, travel, availability, and overlapping services.
- [ ] Verify clock-in/out idempotency, offline/failure recovery, corrections, attestation, location permission denial, implausible location, and supervisor review.
- [ ] Preserve the six federal EVV facts and required state/vendor extensions.
- [ ] Separate captured, location-verified, submitted, accepted, rejected, corrected, and exempt states.
- [ ] Build a real adapter contract with replay protection, correlation IDs, retry/backoff, dead-letter handling, reconciliation, and PHI-safe observability.
- [ ] Keep aggregator transmission disabled until enrollment, vendor/state testing, and attestation are complete.
- [ ] Verify EVV applicability by state, program, payer, code, location, and effective date.

**Gate 4:** v1 accurately captures/reconciles EVV evidence; only certified adapters may claim external compliance.

### Track 5 — Authorization, billing, claims, and revenue integrity

- [ ] Verify authorization windows, CPT/modifier/POS combinations, unit math, utilization, overlaps, exhaustion, overrides, and historical snapshots.
- [ ] Verify documentation/signature/credential prerequisites and payer-specific deficiency rules.
- [ ] Preserve the current manual Plutus boundary honestly for v1 unless a certified clearinghouse path replaces it.
- [ ] Define typed 837/claim, acknowledgment, rejection, correction, void/replacement, ERA/835, adjustment, denial, appeal, and reconciliation states.
- [ ] Add clearinghouse adapters only with enrollment, sandbox certification, duplicate prevention, and financial reconciliation tests.
- [ ] Test pennies, units, dates, identifiers, taxonomy, rendering/billing provider, coordination of benefits, and payer edge cases.

**Gate 5:** every billable-supporting record explains why it is ready or blocked; “submitted/paid” requires external evidence.

### Track 6 — Intake, family, case coordination, and staffing

- [ ] Execute complete intake happy path and rejection/resubmission loops.
- [ ] Verify consent/version history, document lineage, expiration, revocation, device rebinding, and accessibility.
- [ ] Validate PA, assessment, treatment authorization, case opening, application, parent preference, assignment, first session, and activation invariants.
- [ ] Verify cross-app notifications link to the owning product and disclose no PHI.
- [ ] Ensure staffing decisions cannot bypass clinical/case readiness or create duplicate assignments.

**Gate 6:** intake to ACTIVE has one explainable path with safe recovery at every interruption.

### Track 7 — HRM, credentials, onboarding, and payroll boundary

- [ ] Verify applicant, interview, offer, onboarding, hire, credential, schedule, payroll, help-desk, and termination/revocation lifecycles.
- [ ] Validate retained hiring evidence and corrections without destructive history rewriting.
- [ ] Verify employment forms, signatures, wage versions, access activation/deactivation, and separation of clinical and HR records.
- [ ] Reconcile service evidence to payroll without presenting estimates as approved pay facts.
- [ ] Confirm HRM cannot mutate CRM-owned clinical/client lifecycle state.

**Gate 7:** hire-to-service and service-to-payroll are durable, authorized, and explainable.

### Track 8 — Simplicity and workflow superiority

- [ ] Select 15 critical role workflows and baseline time, clicks, waits, errors, and training burden.
- [ ] Remove duplicate entry, dead ends, oversized menus, redundant confirmations, and irrelevant role content.
- [ ] Use progressive disclosure and task queues; preserve expert shortcuts and keyboard access.
- [ ] Standardize loading, empty, stale, conflict, offline, partial-success, failure, and retry states.
- [ ] Test mobile/tablet ergonomics for in-session and field workflows.
- [ ] Run moderated acceptance with representative role users before v2.

**Gate 8:** each critical workflow meets its budget and is understandable without tribal knowledge.

### Track 9 — Performance and cost discipline

- [ ] Establish per-route latency, query-count, payload, bundle, memory, storage, and background-work baselines.
- [ ] Eliminate N+1 queries, duplicate fetches, unnecessary revalidation, per-keystroke writes, unbounded lists, and oversized client bundles.
- [ ] Paginate/stream/lazy-load only where measured; cache only with explicit authorization, freshness, invalidation, and PHI boundaries.
- [ ] Load-test critical reads/writes, concurrent sessions, queue operations, exports, and degraded dependencies.
- [ ] Define budgets and regression tests for critical workflows.

**Gate 9:** performance claims have before/after metrics and no correctness/privacy regression.

### Track 10 — Reliability, reversibility, and operations

- [ ] Classify failure modes and define timeout, retry, idempotency, concurrency, and compensation behavior.
- [ ] Adopt expand/contract migrations and compatibility windows; never destructively roll back signed/audited business facts.
- [ ] Verify feature flags/default-off controls for risky adapters and staged rollouts.
- [ ] Add health/readiness, structured PHI-safe logs, metrics, tracing/correlation, alert thresholds, and runbooks.
- [ ] Verify backups, point-in-time recovery, restore into an isolated environment, RPO/RTO, and disaster communication.
- [ ] Exercise deploy rollback, dependency outage, database saturation, storage failure, notification failure, and partial external acceptance.

**Gate 10:** a clean release can be deployed, observed, disabled, and recovered without losing authoritative records.

### Track 11 — Automated and human verification

- [ ] Keep lint, schema parity, typecheck, unit/security tests, and both production builds mandatory.
- [ ] Add Playwright journeys for every role and the connected intake-to-payroll path.
- [ ] Add negative E2E cases for cross-role/cross-client access, expired/revoked links, stale writes, retries, and conflicts.
- [ ] Add contract tests for every external adapter and deterministic fixtures for payer/state rules.
- [ ] Run accessibility, browser/device, timezone/DST, performance, soak, concurrency, and recovery suites.
- [ ] Execute the connected-product, Bridge E–G, pre-production, and sandbox checklists with retained evidence.
- [ ] Maintain a release-blocker ledger with severity, reproduction, owner, fix evidence, and regression test.

**Gate 11:** v1 has no unresolved release blockers and every required checklist has dated evidence.

### Track 12 — v1 acceptance and v2 PHI authorization

- [ ] Produce `v0.9.0` from a clean checkout and freeze schema/product scope except blockers.
- [ ] Complete synthetic/deidentified acceptance and publish known limitations.
- [ ] Tag `v1.0.0` only after Tracks 0–11 pass for the declared scope.
- [ ] Use v1.x for observed usability/reliability corrections and at most evidence-backed additions.
- [ ] Before v2: external security assessment, HIPAA/compliance/legal review, BAAs/vendor agreements, state/payer certification, operational training, support/incident staffing, restore drill, and written go/no-go.
- [ ] Activate real users/PHI gradually with cohort controls, monitoring, rollback criteria, and post-release review.

**Gate 12:** v2 production authorization is a written organizational decision backed by evidence—not a code-only declaration.

## Competitive outcome scorecard

We compare outcomes, not screenshot counts:

| Outcome | Measure |
|---|---|
| Faster | p50/p95 task time and server latency |
| Simpler | clicks, fields, navigation changes, training time |
| Safer | prevented invalid transitions, access-control tests, unresolved findings |
| More reliable | failed/duplicate/lost writes, recovery success, availability |
| Clinically trustworthy | traceable observations, correction rate, BCBA acceptance |
| Revenue trustworthy | deficiency/denial rate, authorization exceptions, reconciliation accuracy |
| Easier to change | lead time, rollback time, escaped-regression rate |
| Less wasteful | query count, bytes, bundle size, storage growth, compute per workflow |

CentralReach, RethinkBH, Motivity, and Passage Health remain comparison references. A competitor capability becomes required only when it closes a verified user, clinical, billing, compliance, security, or operational need.

## Immediate execution queue

1. Production-surface and external-adapter inventory.
2. Multi-state assumption inventory, starting with hardcoded New York/timezone/payer behavior.
3. Server-action authorization and resource-scope closure audit.
4. Connected workflow state-machine and concurrency audit.
5. Database/schema/index/storage/environment reconciliation.
6. Role fixtures and Playwright connected-product harness.
7. Synthetic acceptance, reliability, performance, and recovery program.

Each slice must identify evidence, make the smallest complete change, add regression protection, run release-proportional verification, update this roadmap, and commit independently.

## Execution log

### 2026-09-10 — Program baseline started

- Registered 29 CRM and 29 HRM page entry points, 40 CRM and 22 HRM action-named files, 76 files containing server-action directives, and five HTTP route handlers as the first inventory boundary. Counts are discovery aids, not completion claims; exports and reachability still require classification.
- Confirmed the external-boundary inventory must cover Supabase Auth/Postgres/Storage, Photon/Nominatim/Census address services, Jitsi links, Plutus CSV handoff, optional 837/835 code, and EVV vendor adapters.
- Confirmed multi-state work cannot be a cosmetic configuration change: `America/New_York` currently appears across shared timezone helpers plus scheduling, availability, payroll, ATS interview, billing, notification, and UI formatting paths.
- Confirmed EVV vendor adapters and native EDI helpers exist but remain prototype/optional boundaries; they must not be promoted to LIVE through naming alone.
- First implementation target selected: produce the authoritative production-surface classification, then centralize organization/location timezone resolution without changing historical service instants.

### 2026-09-11 — Reachable route classification

- Re-discovered route entry files directly from both App Router trees: **64 total** — CRM has 29 pages plus 5 HTTP handlers; HRM has 29 pages plus 1 HTTP handler. This count excludes layouts, loading/error boundaries, components, and server-action modules because they are not independent route entries.
- Classified **61 entries as LIVE** and **3 as RETIRE compatibility redirects**. The RETIRE entries are CRM `/apply`, `/portal-hr/[[...path]]`, and `/rbt/[[...path]]`; each intentionally redirects to the HRM-owned survivor and contains no duplicate workflow implementation.
- CRM LIVE families: authenticated CRM dashboards and portals, client detail, login/MFA, parent magic-link intake, careers landing, root routing, and the address/document/report/health/upload handlers.
- HRM LIVE families: ATS and applicant detail, HR/finance/staffing workspaces, onboarding and applicant magic links, the RBT portal including Session Studio and simulation training, careers/apply, login/MFA, root routing, and health.
- `/hr-dashboard` and `/payroll` remain LIVE because production renders real/limited operational views; only their richer fabricated KPI components are DEV_ONLY behind `isDevToolsEnabled()`. No independently reachable DEV_ONLY, PROTOTYPE, or HOLD route entry was found.
- Route entry classification is complete for this snapshot. Track 0 remains open until server actions, background work, external adapters, and data stores receive the same source-derived classification.

### 2026-09-11 — Server-action classification

- Parsed the current `'use server'` modules and their top-level exports: **73 modules / 257 exported callables** — CRM has 48 modules / 146 callables; HRM has 25 modules / 111 callables. Tests and files that merely mention the directive were excluded.
- Classified **245 callables as LIVE**, **11 as DEV_ONLY**, and **1 as HOLD**. DEV_ONLY consists of every export in the two `app/actions/devTools.ts` modules plus `devImpersonateApplicantSession`; all are protected by the shared production-off dev-tools gate.
- The sole HOLD callable is `exportStateAggregatorBatch`: it deterministically formats a reviewed batch but has no production UI caller and performs no vendor transmission. It must remain HOLD until an EVV vendor/state enrollment and certification decision is complete.
- Reviewed public boundaries are limited to CRM/HRM login, public RBT application, and applicant device-session binding. The existing authorization inventory test continues to require every other database-backed action module to declare a staff, client-resource, parent-token, applicant-session, notification-recipient, or dev-tools boundary.
- Ownership matches the architecture map: CRM actions own client/intake/clinical/billing/case coordination; HRM actions own ATS/onboarding/RBT delivery/payroll views. No retired CRM RBT/HR action implementation remains.
- Server-action classification is complete for this snapshot. Track 0 remains open for scheduled/background work, external adapters, and data stores.

### 2026-09-11 — Scheduled and background-work classification

- Confirmed there is no deployed cron entry, webhook consumer, worker process, durable queue, or automatic scheduled job in either application. Browser timers are UI/session mechanics, and request-scoped timeouts only bound external calls; neither category is background infrastructure.
- Retired the orphaned CRM in-memory task prototype (`lib/tasks/`). It was referenced only by its own test, stored jobs in process memory, scheduled work with `setTimeout`, simulated PDF and PA-scan results, and declared an unimplemented payroll-sync type. It was not safe to classify as LIVE on a restartable Render web process.
- V1 therefore has **zero LIVE background jobs** and no hidden automation claim. Any future PDF, PA-expiration, payroll, notification, or adapter job must use durable persisted state, authenticated enqueueing, idempotency, bounded retry/backoff, dead-letter/reconciliation behavior, and PHI-safe observability before being classified LIVE.
- Background-work classification is complete for this snapshot. Track 0 remains open for external adapters and data stores.

### 2026-09-11 — External-adapter classification

- LIVE v1 boundaries are Supabase Auth/Postgres/private Storage, browser-launched Jitsi rooms, and the manual Plutus CSV handoff. Plutus has no API integration, acknowledgment, or payment-status adapter.
- Public address-provider calls are disabled and the legacy route fails closed; patient-entered addresses and coordinates are not sent to Photon/Nominatim. Public Jitsi is acceptable only for the declared synthetic/deidentified v1 scope. Neither boundary is authorized for v2 PHI without privacy/security review, appropriate agreements, data-minimization controls, and an explicit written go/no-go.
- The local 837P generator is DEV_ONLY and display-only. The unmounted 835 parser and non-transmitting EVV batch formatter remain HOLD; neither proves clearinghouse or aggregator acceptance.
- Retired the orphaned synthetic Sandata/HHAeXchange dispatcher and adapters. They had no production caller and manufactured success response IDs without network transmission; keeping them would undermine EVV state integrity.
- No payment processor, clearinghouse, email/SMS provider, live EVV vendor, analytics SDK, or AI/model API is integrated. Cross-app CRM/HRM links share product state through Postgres and are not external adapters.
- External-adapter classification is complete for this snapshot. Track 0 remains open for the authoritative data-store inventory.

### 2026-09-11 — Authoritative data-store classification

- LIVE durable systems are the shared Supabase PostgreSQL database (**36 Prisma models**) and three private Storage buckets: `client-documents`, `ats-applicant-docs`, and `ats-interview-recordings`. Supabase Auth owns staff identity; durable applicant device-session records plus HttpOnly cookies own applicant access. The root and package Prisma schema definitions now match after restoring 23 missing performance indexes to the package copy.
- LIVE browser storage is limited to non-authoritative, bounded state: visual preferences in `localStorage`; tab-scoped application/session drafts, short-TTL read caches, and Session Studio recovery data in `sessionStorage`; and user-initiated Blob downloads. Authorization, hiring, clinical, EVV, signature, claim, and payroll truth must always be re-established from server records.
- Removed production writes and reads of submitted applicant dossiers in `localStorage`, moved the sensitive public-application draft to tab-scoped `sessionStorage`, and stopped mirroring authenticated applicant identity into persistent browser keys. Existing legacy dossier/draft keys are purged when the public application loads.
- RETIRE migration support remains read/delete-only for pre-hardening interview recordings in IndexedDB; its unused write API was removed. DEV_ONLY impersonation state remains behind the production-off developer-tools gate.
- HOLD/PROTOTYPE browser projections (locally completed schedule markers and finance-ticket drafts) may support synthetic UI demonstrations, but are not authoritative and cannot unlock payment, staffing, billing, or compliance decisions. The browser pay-hold ledger and orphaned browser job-application module were retired during the workflow source-of-truth pass.
- No application-managed filesystem upload directory, service-worker cache, durable process-memory store, or browser database other than the read/delete legacy recording store was found. Manual SQL files describe intended database state but do not prove that a target environment applied it.
- Production-surface discovery and classification are complete for this source snapshot. Track 0 remains open for critical-workflow source-of-truth mapping and checklist reconciliation; Gate 0 is not yet claimed.

### 2026-09-12 — Critical-workflow source-of-truth map

| Workflow boundary | Durable source of truth | Owning role/product |
|---|---|---|
| Client intake and family corrections | `Client.status`, one-to-one `IntakePacket`, private `client-documents` objects | CRM Intake; parent mutations use the bound magic link |
| Clinical review and payer authorization | `Client.status`, `PARequest`, `Authorization`, approved intake evidence | CRM Clinical Support, BCBA, and Billing at their gated transitions |
| Case readiness and staffing | CRM-authored `CaseOpening`; HRM-authored `CaseApplication`; accepted RBT/BCBA assignments on `Client` | CRM Case Coordination authors/accepts; HRM RBT applies |
| Applicant hire and activation | `AtsCandidate`, `CandidateOnboardingPacket`, interview/signature/document records, linked `User` | HRM applicant, HR, and authorized hiring roles |
| Schedule and service occurrence | `Session` planned/actual interval and `EVVLog` evidence | CRM Case Coordination schedules; assigned HRM RBT records service |
| Clinical documentation | one-to-one `SessionNote`, `SessionTrialData`, `BehaviorLog`, `NoteDeficiency` | Assigned RBT submits; assigned/authorized BCBA reviews and signs |
| Claim readiness and outcome | frozen `SessionNote.checklistSnapshot`, `billableUnits`, signatures, deficiencies, `isConverted`, `claimOutcome`; `Authorization` limits | CRM Billing/Clinical gates; manual Plutus handoff remains explicit |
| Payroll readiness | server-derived `Session` + `SessionNote` attestation and signed LS-54 wage evidence | HRM RBT/Finance views; no browser state can make a session payable |

- Replaced the LIVE schedule's browser `ras_rbt_pay_holds` ledger with a server-derived incomplete queue from the same payroll action used by payroll and dashboard views. Session Studio no longer creates or clears local pay authority, its live repair action routes back into the durable Studio workflow, and the schedule purges the retired browser key when loaded.
- Deleted the unreferenced `rbtJobApplications` browser module; actual staffing applications already persist as `CaseApplication` records with a unique opening/RBT constraint.
- Critical workflow ownership and records are mapped for this source snapshot. Track 0 now remains open only for cross-checking the active readiness checklists and removing stale claims.

### 2026-09-12 — Checklist reconciliation and Gate 0

- Reconciled the enterprise roadmap with the pre-production checklist, sandbox/cold-cutover checklist, connected-product playbook, Bridge E–G QA, and canonical SQL ledger. Environment checks, browser walkthroughs, ≥10-note clinical review, and leadership approvals remain deliberately unchecked because repository evidence cannot satisfy them.
- Removed the stale seven-script database subset from the connected playbook; all target-database work now resolves through `docs/sql/README.md`, which owns dependency order and APPLY/HOLD decisions. The retired dual-run cohort script is HOLD for new targets, and the removed synthetic EVV adapters are no longer described as present.
- Removed operational dependence on the retired `/portal-billing/audit` worksheet and corrected the demo-data verifier invocation to its real `node scripts/verify-no-demo-data.mjs` entry point (no npm alias). Sandbox cohort membership, reviewed note IDs, discrepancies, and go/no-go signatures are controlled operational evidence outside RAS.
- Corrected clinical/payroll claims to the current fail-closed behavior: required credential defects block ACTIVE-client sign/convert, `isConverted` never bypasses durable attestation, persisted note units are authoritative, and LIVE incomplete/payroll views derive from database evidence rather than browser holds.
- **Gate 0 passed for the source snapshot:** every reachable surface category is inventoried/classified, ownership and authoritative records are mapped, and active checklists now point to one owner for changing facts. This does not satisfy any later code, environment, clinical, billing, security, or human-approval gate.

### 2026-09-12 — New York assumption inventory

This is a source-code inventory, not legal advice or validation of any statute, payer policy, or vendor rule. Discovery counts identify review scope; an item becomes an enabled rule only after authoritative research, dated evidence, owner approval, and tests.

| Assumption area | Source finding | Required ownership |
|---|---|---|
| Timezone | `America/New_York` occurs across 22 application files, including duplicate CRM/HRM clinic-time helpers and scheduling/payroll formatting. | Organization/service-location timezone; preserve historical instants and test DST. |
| Geography | Borough terms occur across 37 application files; NYC coordinates, New York fallbacks, service areas, and sample addresses are mixed together. | Service-area/location configuration; keep demo fixtures separate from operational rules. |
| Medicaid and payer identity | `Client.medicaidId` and `insurancePayer` are generic strings; there is no effective-dated payer plan, program, or enrollment authority. | Payer plan/program plus provider enrollment, scoped by jurisdiction and effective date. |
| Codes, modifiers, POS, and units | Billing helpers contain default CPT/POS values, a fixed POS set, provisional MUEs, unit formulas, utilization thresholds, and a universal caregiver-signature check. | Reviewed payer/program rule versions; current hard-coded values remain non-authoritative until verified. |
| Credentials | BACB certification is represented as `BACB_LICENSE` and can hard-stop ACTIVE-client billing, but national certification, state licensure, payer credentialing, and enrollment are not separate authorities. | Credential definitions and requirements by role, jurisdiction, payer/program, location, and effective date. |
| EVV | Durable session/EVV records capture much of the service evidence, while the 500-foot radius, default CPT/POS, and vendor batch formats are prototype assumptions. | Applicability and adapter profiles by state, program, payer, code, location, vendor, and effective date. |
| Consent and privacy | Intake and workforce acknowledgments contain organization, federal, and New York-specific language without versioned jurisdiction/template ownership. | Versioned consent/disclosure templates with signer, locale, jurisdiction, effective dates, and immutable evidence. |
| Retention and legal hold | A detailed technical plan exists, but no approved retention schedule, legal-hold engine, or production purge workflow is active. | Counsel-approved policy versions and fail-closed retention/hold execution. |
| Incidents | Mandated-reporting copy exists, but the source scan did not find a formal incident lifecycle with triage, escalation, correction, and closure evidence. | Organization/jurisdiction incident policy and authorized immutable workflow. |
| Employment | LS-54 wage notice and other New York workforce language are embedded throughout hiring/onboarding. | Employment-jurisdiction templates and gates, separate from national hiring state. |
| UI and demo copy | New York/NYC terms occur across 45 application files and mix real organization scope, examples, labels, and behavioral rules. | Brand/organization copy and demo fixtures separated from regulatory configuration. |

- The schema has no first-class organization, service location, jurisdiction, payer plan, provider enrollment, or effective-dated rule snapshot foundation. That is the next Track 1 design slice; it must precede state-specific implementation.
- Disabled patient address autocomplete and reverse geocoding at both caller and route boundaries. Manual address entry and the existing local ZIP-only parser remain available, eliminating public-provider URL disclosure and needless network requests.
- Corrected the architecture/HRM ownership map to name the durable `CaseApplication` model instead of the retired `RbtJobApplication` browser prototype.

### 2026-09-12 — Multi-state ownership contract

- Defined the seven-authority foundation and its cardinalities: organization, service location, jurisdiction, payer plan, provider enrollment, stable rule set/immutable rule version, and content-addressed resolved snapshots.
- Defined a safe single-organization rollout for the existing product: additive nullable keys, deterministic backfill, authorization migration, verification, and only then required constraints. Schema presence alone never proves tenant isolation.
- Separated provider certification/licensure from payer enrollment and separated client coverage identity from the current free-text payer fields.
- Defined effective-time selection, authority/specificity precedence, ambiguity holds, non-executable structured rule payloads, and immutable historical decisions. No New York or payer behavior is enabled by this design-only slice.
- The next slice is the deterministic rule-resolution contract and test matrix. The later schema slice must follow the manual SQL workflow and remain pending until the user confirms application.

### 2026-09-12 — Deterministic rule resolution

- Added the database-free `@repo/db/rule-resolution` policy module so CRM, HRM, and tests share one selector without network, model inference, PHI, Prisma, or Next.js dependencies.
- The selector accepts only an already-authorized service context and one logical rule set, filters ACTIVE versions with half-open effective intervals, selects exactly one version per applicable authority scope, and orders the resulting constraint stack federal → jurisdiction (country/state/local depth) → payer plan → service location → organization.
- Irrelevant tenant, location, payer, and jurisdiction candidates are ignored. Malformed context/version data, mixed logical rule sets, overlapping active versions at one scope, and absent required scopes return typed manual-review holds.
- Added 12 focused tests covering deterministic order, state/local depth, boundary instants, inactive versions, cross-context exclusion, ambiguity, required-scope absence, malformed intervals/identity/version/context, and mixed rule sets. The root Vitest workspace now includes database-free shared-policy tests as a distinct project.
- Selection does not merge payloads or decide whether a lower authority weakens a higher constraint; category-specific deterministic evaluators must enforce that invariant. The next slice snapshots selected versions and normalized resolved billing facts on durable service records.

### 2026-09-12 — Durable rule-storage foundation drafted

- Added matching Prisma definitions for organization, service location, jurisdiction hierarchy/location bindings, payer plan, provider enrollment, scoped rule sets, immutable rule versions, session-linked resolved snapshots, and ordered version selections.
- Existing `User`, `Client`, and `Session` organization/location links are nullable for the additive rollout. They must not become required until bootstrap data, authorization scoping, write paths, and backfill verification are complete.
- The pending manual SQL adds interval/scope/hash/approval checks, foreign keys, query-shaped indexes, RLS enablement, browser-role privilege revocation, published-rule immutability, and immutable resolved history. It creates no organization, location, jurisdiction, payer, enrollment, or policy data and enables no state rule.
- SQL: [`../../sql/2026-09-12-060419Z-multistate-rule-foundation.sql`](../../sql/2026-09-12-060419Z-multistate-rule-foundation.sql) was user-confirmed and catalog-verified on `Simple_RAS_CRM_DEV` on 2026-09-12. Prisma Client was regenerated only after that confirmation.
- The Track 1 snapshot row remains open: storage capability alone is not completion. A later slice must write canonical resolved billing facts and ordered selected-version links transactionally at the service decision boundary.

## Authoritative linked evidence

- Product ownership: [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md)
- Clinical note/data source of truth: [`2026-08-11-aba-session-note-data-collection-spec.md`](./2026-08-11-aba-session-note-data-collection-spec.md)
- End-to-end execution: [`2026-08-11-connected-product-test-playbook.md`](./2026-08-11-connected-product-test-playbook.md)
- Engineering/deploy gates: [`2026-08-20-pre-prod-readiness-checklist.md`](./2026-08-20-pre-prod-readiness-checklist.md)
- Sandbox/cutover gates: [`2026-08-11-ras-sandbox-cutover-checklist.md`](./2026-08-11-ras-sandbox-cutover-checklist.md)
- Operations/recovery: [`../../OPERATIONS.md`](../../OPERATIONS.md)
