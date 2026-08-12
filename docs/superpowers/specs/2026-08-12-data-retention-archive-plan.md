# Data Retention and Archive Plan

**Date:** 2026-08-12  
**Status:** Proposed technical plan; document-only; no retention schedule is approved or active  
**System boundary:** One shared Postgres database (`prisma/schema.prisma`, mirrored at `packages/db/prisma/schema.prisma`) plus Supabase Storage used by CRM and HRM

> **Legal/compliance caveat:** This is a technical control design, not legal advice. Retention and destruction periods must be approved by qualified counsel and the organization’s privacy, clinical-records, billing, and HR owners. The approved schedule must account for applicable federal and state rules, minor medical-record requirements, payer/Medicaid and employment contracts, tax/payroll duties, litigation or investigation holds, malpractice/insurance requirements, and recording-consent rules. If requirements conflict, the latest permitted destruction date wins. Until that approval exists, regulated classes below are **archive-only; automated destruction stays disabled**.

## 1. Required decisions

1. **One policy engine, separate data classes.** CRM clinical data, CRM parent communications, HRM applicant data, audit events, and notifications share infrastructure but do not share one blanket period.
2. **Archive, verify, then purge.** No job may hard-delete a database row or Storage object until its archive manifest is complete and verified, unless the approved policy explicitly designates the class as delete-without-archive.
3. **Legal hold always wins.** A hold blocks source deletion, archive expiration, key destruction, and backup-expiry requests for every descendant row and object in its scope.
4. **Cascades are integrity mechanisms, not retention workflows.** Retention code explicitly inventories and deletes children in a known order. It must not call `Client.delete`, `Session.delete`, `AtsCandidate.delete`, or `User.delete` and rely on `ON DELETE CASCADE`.
5. **Destruction is fail-closed.** Missing policy, ambiguous clock, unresolved Storage pointer, failed audit write, failed archive verification, or unknown hold status means “retain and alert.”
6. **De-identified derivatives are separate records.** Source records are never overwritten with scrubbed values. Identifiable source data follows its policy; approved analytics derivatives follow a separate policy.
7. **A purge is a durable saga, not one transaction.** Postgres and Supabase Storage cannot participate in one atomic transaction. Every step is idempotent, recorded, and safely retryable.

## 2. Current data inventory

### 2.1 Database classes and retention anchors

| Data class | Concrete records and sensitive fields | Current relationship behavior | Proposed retention clock and eligibility |
|---|---|---|---|
| **Clinical encounter PHI** | `Session` (`clientId`, staff IDs, schedule, actual times, CPT/POS/location); one-to-one `SessionNote` (`clinicalContent`, `structuredContent`, checklist, signatures, claim reference); `NoteDeficiency`; `SessionTrialData`; `BehaviorLog` including `abcNotes`; `EVVLog` including timestamps and optional latitude/longitude | `Client → Session`, `Session → SessionNote/SessionTrialData/BehaviorLog/EVVLog`, and `SessionNote → NoteDeficiency` all cascade. Trial and behavior rows also cascade if their `SkillTarget` / `BehaviorTarget` is deleted. `EVVLog` also cascades on `User` deletion through `staffId`. | Clock is the latest applicable immutable event: `Session.actualEnd` or `scheduledEnd`, `SessionNote.bcbaSignedAt`, and `SessionNote.convertedAt`. A session is ineligible while scheduled/in progress, while a note has an open `NoteDeficiency`, or while a claim/clinical hold applies. Never infer a final clock from `updatedAt`. |
| **Client messages** | `ClientMessage.content`, `senderName`, `isFromClient`, `createdAt`, `readAt` | Child of `Client` with cascade. `assignCaseCoordinator` currently calls `clientMessage.deleteMany({ clientId })`, erasing the thread outside a retention workflow. | Keep with the client communication/clinical record unless counsel classifies it as transitory. Clock is `createdAt`, but client discharge and any chart hold can extend it. |
| **Client documents and intake packet** | `Document.type`, `fileUrl`, verification and dates; `IntakePacket.formData`, signatures/form answers, rejection details, magic-link/device fields, and upload flags | `Document` and the one-to-one `IntakePacket` cascade from `Client`. Live parent uploads are primarily embedded in `IntakePacket.formData`, not normalized `Document` rows. | Use explicit `Client.dischargedAt` plus document-specific expiration where approved. `ClientStatus.DISCHARGED` exists, but there is no immutable discharge timestamp today; `updatedAt` is not an acceptable substitute. |
| **ATS applicant and onboarding PII** | `AtsCandidate` names/contact details, BACB number, `dossier`, stage, linked `userId`; `CandidateOnboardingPacket.formData` (including onboarding, tax/direct-deposit/I-9-related material), availability/travel data, document paths, LS-54 payload/status; `ApplicantDeviceSession` token, IP, user agent, fingerprint; `OnboardingSignatureEvent` signer, consents, quiz answers, IP/device data | Packet, device sessions, signature events, interviews, help tickets, and recordings cascade from `AtsCandidate`. `AtsCandidate.userId` points to `User` with `SetNull` when the user is deleted; deleting the candidate does **not** require deleting the hired user. | Add immutable `terminalAt` and `terminalReason` when a candidate becomes `REJECTED`/withdrawn or is hired. Do not use mutable `updatedAt`. A hired candidate moves to an approved employee-record policy; it is not eligible under the non-hired-applicant schedule. |
| **ATS interviews and support** | `AtsInterview.scorecard`, `interviewerNotes`, `scriptProgress`, recommendation, schedule/meeting data; `AtsHelpTicket`; `AtsHelpMessage.body` (JSON may contain text, call URLs, filenames/URLs); `AtsInterviewRecording` metadata | Interview, help-ticket/message, and recording descendants cascade from `AtsCandidate`; recordings also cascade from `AtsInterview`. | Use `AtsInterview.completedAt` for interview content only after the candidate has a terminal lifecycle event. Open/help-desk or active interview rows are ineligible. |
| **Audit events** | `AuditLogVault`: actor `userId`, action, `resourceType`, `resourceId`, optional IP and metadata, `timestamp` | No Prisma relation/FK to the referenced user or resource. Source deletion therefore leaves the audit row intact. Writers intentionally log IDs rather than names/narrative, but IP, actor label, resource IDs, and metadata can still be identifying. | Clock is `timestamp`; use a separately approved audit/security policy. Archive before any approved expiration. Audit events covered by a hold remain retained even when the referenced source record would otherwise expire. |
| **Notifications** | `Notification.title`, `message`, type, link and read state. Current events may include client/candidate names, deficiency descriptions, or parent-request snippets, so rows can contain PHI/PII despite being operational. | Child of `User` with cascade. CRM and HRM read the same rows. The bell only displays the latest 20, but older rows remain in Postgres. | Not a source of truth. Separate clocks: `readAt` is unavailable, so add it; use `readAt` for read notifications and `createdAt` for never-read notifications. A relevant subject hold can override deletion. |

`StaffMessage` is not one of the requested classes, but it uses the same unbounded-retention pattern and direct `User` FKs. It should be onboarded as a separate policy before any `User` deletion workflow is enabled.

### 2.2 Existing Storage buckets and pointers

| Bucket referenced in code (private by design; live status unverified) | Current object layout | Database pointer(s) | Retention-specific gap |
|---|---|---|---|
| `client-documents` | `{clientId}/{timestamp}-{safeName}` | The upload API returns `storagePath`, but `DocumentUploads.tsx` currently persists only an authenticated `/api/documents?path=...` URL inside `IntakePacket.formData` keys `docInsuranceFront`, `docInsuranceBack`, `docMedicaidFront`, `docMedicaidBack`, `docEval`, `docReferral`, `docIEP`, `docCustody`, and `docPriorABA`. `Document.fileUrl` is another possible pointer, but the upload route does not create a `Document` row. | No normalized bucket/path registry. Removing or replacing an intake form value does not remove the old object, so abandoned/rejected uploads can become orphans. Backfill must parse the encoded `path` query parameter and safely handle object, JSON, or double-stringified packet data. |
| `ats-applicant-docs` | `{candidateId}/resume-...`, `{candidateId}/govt-id-...`, `{candidateId}/40hr-cert-...`, and `onboarding/{candidateId}/{documentKey}-...` | `CandidateOnboardingPacket.resumeStoragePath`, `govtIdStoragePath`, `ls54StoragePath`; nested `formData.fortyHourCoach.certStoragePath`; `OnboardingSignatureEvent.storagePath` | Candidate deletion currently removes database descendants without enumerating these objects. Prefix-only deletion is insufficient because onboarding files use `onboarding/{candidateId}/`, while the other files use `{candidateId}/`. |
| `ats-interview-recordings` | `{candidateId}/{interviewId}/{recordingId}.{ext}` | `AtsInterviewRecording.storageBucket` and `.storagePath` | `deleteAtsCandidate` is database-only. `deleteInterviewRecording` attempts object removal but deletes metadata even when Storage removal fails, making an orphaned blob harder to discover. |

The application expects all three buckets to be private. The point-in-time [`Supabase Storage readiness report`](./2026-08-12-storage-readiness-report.md) could not authenticate to verify live bucket settings, and no canonical bucket-definition SQL was found for `client-documents`. Retention rollout therefore starts with authenticated, read-only bucket inventory and privacy/configuration verification.

## 3. Configurable policy model

### 3.1 Policy records

Add versioned configuration rather than hard-coded day counts:

| Proposed record | Required fields and behavior |
|---|---|
| `RetentionPolicy` | `key`, `version`, `dataClass`, `clockEvent`, `archiveAfterDays`, nullable `destroyAfterDays`, `archiveMode`, eligibility conditions, jurisdiction/payer/employment scope, effective/superseded timestamps, approver IDs, and `enabled`. `destroyAfterDays = null` means no automated destruction. Published versions are immutable. |
| `RetentionSubject` | Subject type/id, applicable policy/version, computed clock, next action date, state, last evaluated time, and reason. It is the durable coordination row for one client/session/candidate/user/resource. |
| `LegalHold` | Hold id, status, target type/id, reason category, authority/case reference, custodian, created/approved/released timestamps, release approver, and optional review date. Free-text detail should be minimal and access-restricted. |
| `StoredObject` | Unique `(bucket, path)`, owner type/id, source model/id/field, MIME, bytes, checksum, discovered/last-seen timestamps, archive object key, and lifecycle state. All uploads and deletions register here. |
| `RetentionRun` / `RetentionRunItem` | Run mode (`DRY_RUN`, `ARCHIVE_ONLY`, `PURGE`), policy snapshot, cutoff/high-water mark, actor, per-subject state, counts/bytes/checksums, hold result, retries, error code, and completion timestamps. |
| `ArchiveManifest` | Archive URI, wrapped encryption-key reference, schema/policy version, protected subject reference, row-set counts/digests, object counts/digests, verification and restore-test status. |
| `RetentionEvent` | Append-only, fail-closed audit ledger for eligibility, hold, archive, restore, purge, failure, and override events. This is separate from the fire-and-forget `AuditLogVault` writer. |

Policy precedence is:

1. active legal/investigation hold;
2. longest statutory, payer, contract, employment, tax, or insurance minimum;
3. organization policy;
4. verified individual deletion request, where legally permitted.

A policy change that shortens retention must create a new version, produce an impact preview, and require dual approval. It must never make existing data immediately purgeable without a configurable review/grace window.

### 3.2 Launch configuration before legal approval

These are conservative technical defaults, not legal periods:

| Data class key | Archive behavior | Destruction behavior at launch |
|---|---|---|
| `CLINICAL_ENCOUNTER`, `CLIENT_DOCUMENT`, `CLIENT_MESSAGE` | Archive only after explicit discharge/finalization and an approved operational cool-down | Disabled (`destroyAfterDays = null`) |
| `ATS_APPLICATION`, `ATS_ONBOARDING_DOCUMENT`, `ATS_INTERVIEW_MEDIA` | Archive only after explicit candidate terminal event; hired candidates route to employee policy | Disabled |
| `AUDIT_EVENT` | Archive verified older events to restricted cold storage | Disabled |
| `NOTIFICATION` | Dry-run first; after policy approval, read and unread rows may use separate short operational periods because notifications are not source records | Disabled until `readAt` exists and content owners approve |
| `ORPHAN_STORAGE_OBJECT` | Quarantine only after two complete inventories agree that no database pointer exists and the object predates the run high-water mark | Purge disabled until owner review; then require an additional grace period |

## 4. Legal-hold behavior

Hold scope must expand before eligibility is calculated:

- A **client hold** covers the `Client`, all `Session` bundles (notes, deficiencies, trials, behavior, EVV), client messages, `Document` rows, `IntakePacket` data, and every `client-documents` object owned by that client.
- A **session hold** covers the session, its note/deficiencies, trial and behavior rows, EVV rows, related archive copies, and matching `AuditLogVault.resourceId` rows when the resource type identifies the session or note.
- A **candidate hold** covers `AtsCandidate`, packet, interview, help tickets/messages, device sessions, signature events, recording rows, and both ATS bucket path families.
- A **user/employee hold** covers that user’s employment records and prevents a user deletion that would cascade `EVVLog`, `Notification`, credentials, or other user-linked rows.
- A **resource hold** may target one document/object or audit resource. Exact-match scope does not silently widen unless a parent hold is also created.

Operational rules:

1. The eligibility query and the final purge transaction both re-check holds.
2. Creating a hold cancels queued purge work and locks archive expiry/key destruction.
3. Held source data is not de-identified or altered. Read access remains least-privilege and is audited.
4. Releasing a hold requires a second approver and starts a grace period; it does not trigger immediate destruction.
5. If hold expansion fails or a subject cannot be resolved, the item becomes `HOLD_STATUS_UNKNOWN` and is retained.

## 5. Archive format and restoreability

Use two proposed private, server-only archive locations to preserve access separation:

- `retention-archive-phi`: `client/{clientIdHmac}/{runId}/...`
- `retention-archive-hr`: `candidate/{candidateIdHmac}/{runId}/...`

Archive bundles are encrypted **before** upload with a per-bundle data-encryption key wrapped by the organization’s managed key service. An ordinary private bucket must not be described as WORM or immutable. If counsel, payer contracts, or insurers require retention lock/object lock, use a storage service that provides that control and record its retention mode in `ArchiveManifest`.

Each bundle contains:

- schema and policy version;
- cutoff/high-water timestamp;
- model-separated exports with original keys needed for a controlled restore;
- row counts and SHA-256 digest per model;
- copied Storage objects with original bucket/path recorded inside the encrypted manifest;
- object count, byte count, MIME, and checksum;
- source-to-archive mapping;
- archive creator and verification timestamps.

The externally queryable manifest contains HMAC-based subject/resource references, counts, and digests—not names, DOBs, narrative, filenames, raw coordinates, or message text.

An archive is not “verified” until:

1. every expected row and object is represented;
2. row/object counts match the eligibility snapshot;
3. object size and checksum match;
4. the encrypted bundle can be opened by the restore role;
5. a restore into an isolated test database/bucket passes FK and content checks.

## 6. De-identification plan

De-identification is for approved analytics/research derivatives, not a substitute for source-record retention:

- Replace client/candidate/user/session identifiers with versioned HMAC tokens whose key is stored outside Postgres.
- Remove direct identifiers and free text by default. Do not attempt regex-only scrubbing of `SessionNote.clinicalContent`, `structuredContent`, `ClientMessage.content`, `AtsCandidate.dossier`, `CandidateOnboardingPacket.formData`, `AtsInterview.interviewerNotes`, `AtsHelpMessage.body`, document binaries, or recording media.
- Suppress or coarsen exact dates/times, small cohorts, address/location fields, and EVV latitude/longitude according to the approved analytic purpose.
- Keep only enumerated trial/behavior measures needed by the approved dataset; evaluate rare diagnoses, targets, and event combinations for re-identification risk.
- Store the derivative with its transformation version, source cutoff, field allowlist, and risk approval. Never keep the HMAC link key beside the dataset.
- A dataset is not represented as HIPAA de-identified merely because names were removed. Safe Harbor or Expert Determination status requires qualified review; until then classify the derivative as protected data.
- A legal hold applies to identifiable sources and any derivative that remains linkable.

## 7. Idempotent archive and deletion workflow

### 7.1 State machine

```text
DISCOVERED
  ├─> HOLD_BLOCKED
  └─> ARCHIVE_PENDING
        └─> ARCHIVED_UNVERIFIED
              └─> ARCHIVED_VERIFIED
                    ├─> RETAINED_IN_ARCHIVE
                    └─> PURGE_STORAGE_PENDING
                          └─> PURGE_DB_PENDING
                                └─> PURGED
```

Any step can move to `RETRYABLE_FAILURE` or `MANUAL_REVIEW`; neither state permits later steps to run automatically.

### 7.2 Per-run sequence

1. **Discover:** Snapshot eligible IDs at a fixed cutoff and save the exact policy version and source high-water mark. Do not include records newer than the cutoff.
2. **Resolve policy:** Calculate the clock from explicit lifecycle fields. Missing terminal timestamps or ambiguous policy context routes to manual review.
3. **Expand/re-check holds:** Resolve parent and descendant holds. Persist the decision and evidence.
4. **Lock subject:** Acquire a subject-scoped advisory lock and mark the subject read-only for retention work. Writers must reject or retry changes while the subject is in a purge state.
5. **Inventory:** Materialize expected row IDs and Storage objects. Compare `StoredObject` pointers to an authenticated bucket listing.
6. **Archive:** Write the encrypted bundle and manifest. This step is idempotent on `(subject, policyVersion, cutoff)`.
7. **Verify:** Validate counts/checksums and perform the configured restore check.
8. **Approval gate:** Require policy-configured automated or human approval. Regulated first runs require dual human approval.
9. **Delete source objects:** Remove each current-bucket object. If removal fails, retain its database pointer/registry row, record the error, and stop that subject.
10. **Delete database children:** Re-check hold and unchanged eligibility inside a bounded transaction, then delete explicit child rows in dependency order.
11. **Verify destruction:** Confirm no source rows, live pointers, or untracked bucket objects remain. Record rows/bytes removed and exceptions.
12. **Finalize:** Mark the run item `PURGED`, retain the minimal HMAC tombstone, and emit a required `RetentionEvent`. Also write a best-effort `AuditLogVault` event, but do not rely on that fire-and-forget path as the sole proof.

## 8. FK-safe purge order

### 8.1 Session bundle

For one eligible `Session.id`, archive all records together, then explicitly delete:

1. `NoteDeficiency` rows for the session’s `SessionNote.id`;
2. `SessionTrialData` rows by `sessionId`;
3. `BehaviorLog` rows by `sessionId`;
4. `EVVLog` rows by `sessionId`;
5. `SessionNote` by `sessionId`;
6. `Session`.

Do not delete `SkillTarget` or `BehaviorTarget` as part of a session purge; they are client chart master data and may be referenced by other retained sessions. Before enabling purge, change critical clinical cascades to `RESTRICT` (or an equivalent guarded deletion design), especially:

- `Session.clientId`;
- `SessionNote.sessionId`;
- `SessionTrialData.sessionId` and `targetId`;
- `BehaviorLog.sessionId` and `behaviorId`;
- `EVVLog.sessionId` and `staffId`.

This prevents an unrelated `Client`, target, session, or `User` deletion from silently destroying retained clinical evidence.

### 8.2 Client messages and documents

- Purge a `ClientMessage` row directly only after its own policy/hold check. Remove the current coordinator-assignment `deleteMany` behavior before rollout.
- For a normalized `Document`, remove and verify its `client-documents` object, then delete the `Document` row.
- For an intake upload embedded in `IntakePacket.formData`, remove and verify the object, then atomically remove the exact `doc*` pointer or purge the whole packet when its policy allows.
- Do not delete the `Client` root to purge these classes. The client has additional descendants—authorizations, PA requests, contact logs, action items, schedules, re-auth packets, openings/applications, targets, and more—outside this plan’s requested inventory. A future whole-chart policy must cover all of them first.

### 8.3 ATS candidate bundle

After both ATS bucket inventories are archived and verified, explicitly delete:

1. `AtsInterviewRecording`;
2. `OnboardingSignatureEvent`;
3. `AtsHelpMessage`, then `AtsHelpTicket`;
4. `ApplicantDeviceSession`;
5. `AtsInterview`;
6. `CandidateOnboardingPacket`;
7. `AtsCandidate`.

Never delete the linked `User` as part of candidate retention. The current dev deletion path attempts that cleanup; because `EVVLog.staffId` and other relations can cascade from `User`, it can destroy clinical/payroll evidence. Hired candidates must be handed to a separate employee-record policy before applicant records are eligible.

Before enabling ATS purge, either change retention-managed candidate/interview/ticket cascades to `RESTRICT` or revoke direct delete privileges so only the retention service can execute the explicit order above. In particular, protect `CandidateOnboardingPacket.candidateId`, `AtsInterview.candidateId`, `AtsHelpTicket.candidateId`, `AtsHelpMessage.ticketId`, `AtsInterviewRecording.candidateId/interviewId`, `ApplicantDeviceSession.candidateId`, and `OnboardingSignatureEvent.candidateId`.

### 8.4 Audit events and notifications

- `AuditLogVault` has no resource FK; process it by its own `timestamp` policy after preserving hold mappings and archive proof.
- Delete `Notification` rows explicitly in bounded batches. Do not use `User.delete` as notification cleanup.
- Retention proof remains in `RetentionEvent` even after the source `AuditLogVault` or `Notification` row reaches its own approved expiry.

## 9. Storage reconciliation and orphan handling

1. Backfill `StoredObject` from every pointer listed in §2.2.
2. List all objects in all three existing buckets with a service-role worker; never expose that key to the browser.
3. Compute:
   - **referenced + present**: healthy;
   - **referenced + missing**: broken pointer, manual repair;
   - **unreferenced + present**: possible orphan, quarantine candidate;
   - **duplicate pointer**: preserve until ownership is resolved.
4. An orphan is not purgeable from one scan. It must:
   - predate the scan high-water mark;
   - be absent from every normalized pointer and approved legacy JSON parser;
   - remain unreferenced in a second scan after the grace interval;
   - have no legal hold by owner prefix or exact object;
   - be approved under `ORPHAN_STORAGE_OBJECT`.
5. Change replacement flows to: upload new object → validate/checksum → save new pointer and registry row → remove old object → mark old pointer deleted. Failed old-object removal remains retryable and visible.
6. Change recording deletion so database metadata is not discarded when Storage deletion fails.
7. After every run, compare bucket listing to `StoredObject`; nonzero unexplained differences fail the run.

## 10. Audit trail and deletion certificate

Every archive, restore, hold, override, and purge attempt records:

- run and item ID;
- policy key/version and cutoff;
- actor/service identity and approvals;
- action and outcome;
- HMAC subject/resource reference;
- source model and bucket names;
- row/object/byte counts;
- before/archive/after digests;
- hold decision;
- archive manifest URI and verification result;
- retry/error code and timestamps.

Do not put source content, names, filenames, signed URLs, access tokens, exact EVV coordinates, or document contents in the retention ledger.

A deletion certificate states precisely what was removed from active Postgres and current Storage, what remains in archive, what is held, and what remains in backups. It must not claim immediate erasure from immutable backups. Backup policy must define expiry; if a backup is restored, the purge ledger is replayed before normal access resumes.

## 11. Phased implementation

### Phase 0 — Stop uncontrolled deletion and approve policy inputs

- Guard or disable:
  - `apps/hrm/src/app/actions/atsActions.ts::deleteAtsCandidate`;
  - `apps/hrm/src/app/actions/devTools.ts::devDeleteAtsCandidate`;
  - the `ClientMessage.deleteMany` call in CRM coordinator assignment;
  - interview-recording metadata deletion after a failed Storage removal.
- Confirm record owners, jurisdictions, payer/employment obligations, archive access roles, and hold authorities.
- Keep all regulated destruction disabled.

**Gate:** No source hard-delete path can bypass the future retention service; approved policy owners are named.

### Phase 1 — Schema and policy foundation

- Add the proposed retention/hold/object/manifest/run/event records to both Prisma schema copies.
- Add immutable lifecycle clocks such as `Client.dischargedAt`, `AtsCandidate.terminalAt`, and notification `readAt`.
- Add eligibility indexes, including session status/final date, message/document client+date, candidate stage+terminal date, notification user/read/date, and audit resource/date.
- Convert critical clinical/HR retention FKs from accidental cascade paths to explicit `RESTRICT` where feasible.
- Deliver any future DDL as idempotent SQL under `docs/sql/` for manual Supabase SQL Editor execution; do not run `prisma migrate` or `db push`.

**Gate:** Human confirms SQL application; schemas remain byte-identical; no purge job exists yet.

### Phase 2 — Normalize Storage ownership

- Register all new uploads in `StoredObject`.
- Backfill all explicit fields and legacy JSON/URL pointers from §2.2.
- Run authenticated read-only inventory for all three buckets and verify privacy/limits/MIME settings.
- Repair broken pointers and classify possible orphans without deleting them.

**Gate:** Every referenced object is present or has a reviewed exception; every bucket object is registered or quarantined.

### Phase 3 — Dry-run policy engine

- Implement eligibility, policy precedence, hold expansion, high-water marks, idempotency, and impact reports.
- Run at least two complete dry runs separated by the proposed grace interval.
- Review sample clients, sessions, candidates, notifications, audit rows, and bucket objects with domain owners.

**Gate:** Repeated runs produce stable candidates; zero held/active records appear as purgeable.

### Phase 4 — Archive-only canary

- Archive a small, approved cohort without deleting source data.
- Verify manifests/checksums and restore each data class into an isolated environment.
- Exercise failed upload, failed archive, expired credentials, duplicate run, and hold-created-mid-run cases.

**Gate:** Restore is complete, FK-valid, and reviewed; rerunning creates no duplicate archive or event.

### Phase 5 — Low-risk purge canary

- Start with approved transient notifications and confirmed orphan objects, not clinical or HR source records.
- Purge in small bounded batches with a kill switch and dual approval.
- Compare Postgres rows, Storage objects, run ledger, and archive manifests after each batch.

**Gate:** No dangling pointers, unexplained objects, missing audit events, or collateral cascade deletes.

### Phase 6 — Regulated class rollout

- Enable one approved class/policy version at a time.
- Use explicit child order from §8 and subject-level locks.
- Keep legal-hold, archive-restore, and backup-replay drills in the release gate.

**Gate:** Counsel/privacy/clinical-or-HR owner signs the exact policy version and canary report before destruction is enabled.

### Phase 7 — Operations

- Scheduled dry-run report before each purge window.
- Quarterly restore sampling and hold-expansion tests.
- Reconcile all live buckets after every purge run.
- Alert on policy ambiguity, unknown hold, pointer mismatch, checksum mismatch, audit failure, or retry exhaustion.
- Annual policy review; new versions never silently shorten existing obligations.

## 12. Verification matrix

| Scenario | Required result |
|---|---|
| Client hold + old completed session | Session and every note/trial/behavior/EVV descendant remain; item is `HOLD_BLOCKED`. |
| Candidate hold + objects in both ATS path families | Database rows and `{candidateId}/...` plus `onboarding/{candidateId}/...` objects remain. |
| Storage removal fails | Database pointer/registry remains retryable; no source DB purge occurs. |
| Archive checksum mismatch | Item never advances past `ARCHIVED_UNVERIFIED`. |
| Job reruns after timeout | Same run item resumes idempotently; no duplicate archive or deletion event. |
| Hold is created after archive but before purge | Final hold check blocks purge and locks archive expiration. |
| `User` is linked to a hired candidate and EVV rows | Candidate workflow never deletes `User`; EVV remains intact. |
| Intake URL pointer is double-stringified JSON | Backfill resolves the path safely or creates a manual-review exception; it never guesses and deletes by prefix. |
| Unreferenced object is newer than inventory cutoff | Object is ignored until a later two-scan quarantine cycle. |
| Backup is restored after a prior purge | Purge ledger replays before application access, and the restore is audited. |

## 13. Completion criteria

The retention system is production-ready only when:

- every requested data class has an approved, versioned policy and immutable clock;
- every existing Storage object is registered or has a reviewed exception;
- regulated purges require verified archives and hold re-checks;
- critical cascade paths cannot cause collateral clinical/HR deletion;
- archive restore tests pass for every class;
- all destructive paths emit a durable, fail-closed retention event;
- database, Storage, archive, and backup behavior are represented accurately in deletion certificates;
- dry-run, canary, failure, idempotency, FK, legal-hold, and restore tests pass.

