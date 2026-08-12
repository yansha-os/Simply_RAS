# PHI logging / redaction audit

**Date:** 2026-08-12  
**Scope:** Current working tree, including untracked files, under `apps/crm` and `apps/hrm`  
**Mode:** Documentation-only audit; no source, package, workflow, or global-doc changes  
**Verdict:** **Not safe for live PHI logging yet.** One critical path can disclose an HRM bearer token, and a normal CRM intake flow sends a child's or guardian's address in a third-party query URL. The broader logging layer also treats raw exception messages as safe even though Prisma, Supabase, renderers, and Server Actions do not guarantee that their messages exclude submitted values.

## Classification used here

- **Critical** — bearer secret or complete clinical artifact can leave its intended boundary.
- **High** — direct sensitive content is retained in a log/audit record, or a raw error sink sits immediately around PHI/PII writes.
- **Medium** — indirect/error-dependent disclosure, browser-console exposure, or over-retained workforce PII.
- **Acceptable** — opaque record IDs, counts, booleans, durations, bounded status codes, and static event names only.

CRM client and clinical data is treated as HIPAA PHI. HRM applicant/employment records are generally workforce PII rather than HIPAA PHI when held by the employer in that capacity, but names, DOB, email, SSN fragments, bank details, compensation, device data, and access tokens still require the same no-raw-logging control.

## Scan summary

- Searched all `console.log/error/warn/info/debug/trace/dir/table` calls, `logInfo/logWarn/logError`, logger-shaped calls, `catch` blocks, upload/storage errors, Server Action files, `AuditLogVault` writes, and onboarding audit-event metadata in both apps.
- Verification snapshot after de-duplicating Windows path aliases: **265 direct `console.*` call sites** (**128 CRM**, **137 HRM**), including the six logger-emitter calls.
- Structured application logging exists only in the two `src/lib/logger.ts` helpers and the small set of instrumentation/health/upload callers. No Sentry, Pino, Winston, Datadog, Axiom, or equivalent application sink was found.
- No normal production-flow `console.*` statement was found that directly interpolates a client name, DOB, email, or session-note body. The material risks are (a) raw exception objects/messages around writes containing those values, (b) persistent audit metadata, (c) sensitive values in request URLs, and (d) the unredacted HRM magic-link path.
- This is a source audit, not proof that existing host logs are clean. Critical remediation includes retrospective log review/purge and token rotation.

## Findings

### PHI-LOG-01 — HRM global request logging records bearer magic-link tokens

**Severity:** Critical  
**Data class:** Access token; applicant PII reachable through the token

**Evidence**

- The public route places the token in the path: `apps/hrm/src/app/magic-link/[token]/page.tsx:4`, `:11-12`.
- HRM's global uncaught-error hook sends `request.path` unchanged to the structured logger: `apps/hrm/src/instrumentation.ts:19-33`, specifically `:29`.
- This hook runs for uncaught Server Component, Server Action, route-handler, and middleware errors: `apps/hrm/src/instrumentation.ts:4-12`.

An exception while loading `/magic-link/{token}` therefore writes the live bearer token into host logs. Anyone with log access could replay an unexpired, unrevoked token.

**Exact fix**

1. Never log `request.path` or `request.url`. Emit a static route template only, preferably `context.routePath` after asserting it is a template such as `/magic-link/[token]`.
2. Add a fail-closed fallback: if the route template is unavailable, emit `route: "unknown"`; do not fall back to the raw path.
3. Revoke/rotate all currently active HRM applicant magic links that may have appeared in logs.
4. Search and purge host/drain logs containing `/magic-link/`, subject to the incident-retention policy, and document who had access.

### PHI-LOG-02 — intake address autocomplete puts exact addresses in third-party loggable URLs

**Severity:** High  
**Data class:** Child/guardian address PHI and applicant address PII

**Evidence**

- The CRM client-intake form uses the autocomplete for the child's home address and both parents' addresses: `apps/crm/src/components/magic-link/Form01ClientIntake.tsx:231-238`, `:283-310`.
- On every debounced input of five or more characters, the browser sends the current address text as the `q` query parameter to the public Nominatim endpoint: `apps/crm/src/components/magic-link/AutoSaveAddressInput.tsx:13-28`, specifically `:23`.
- The same component logs its caught object to the parent browser console: `apps/crm/src/components/magic-link/AutoSaveAddressInput.tsx:34-35`.
- The public HRM application sends applicant address text to the same endpoint after only three characters: `apps/hrm/src/components/public-rbt/RbtApplicationForm.tsx:171-190`.

Query strings are routinely retained in browser network tooling, reverse proxies, CDN/provider access logs, and vendor telemetry. URL-encoding the value is transport encoding, not redaction. The CRM call discloses PHI to a third party during normal use, independently of whether the catch runs.

**Exact fix**

1. Disable the CRM third-party autocomplete immediately and retain manual address entry until a privacy/security review approves a HIPAA-eligible service and contract/BAA.
2. If autocomplete is approved, proxy a minimum-length search through a same-origin server endpoint; use a vendor/configuration that contractually disables request-content retention. Do not put address text in a URL, log, metric tag, trace attribute, or error.
3. Do not treat a server proxy alone as remediation: it prevents browser/provider exposure only when the downstream vendor and retention controls are acceptable.
4. Remove the browser `console.error`; show static UI copy and emit only a random correlation ID plus a stable code.
5. Apply the same URL/logging controls to HRM applicant addresses, even though employer-held applicant data is generally workforce PII rather than HIPAA PHI.

### PHI-LOG-03 — the structured logger has a policy comment but no runtime redaction

**Severity:** High  
**Data class:** Any PHI/PII/secret passed by a caller

**Evidence**

- Both helpers accept unconstrained `Record<string, unknown>` metadata and serialize it verbatim: `apps/crm/src/lib/logger.ts:20-37`; `apps/hrm/src/lib/logger.ts:20-37`.
- Both `errorMeta` implementations return raw `err.message` or `String(err)`: `apps/crm/src/lib/logger.ts:52-58`; `apps/hrm/src/lib/logger.ts:52-58`.
- Their comments incorrectly state that Prisma/Supabase error messages are acceptable: `apps/crm/src/lib/logger.ts:8-12`; `apps/hrm/src/lib/logger.ts:8-12`.
- Both global hooks pass raw `error.message`: `apps/crm/src/instrumentation.ts:29-38`; `apps/hrm/src/instrumentation.ts:24-33`.

Prisma validation errors may render invocation arguments, storage errors may include object paths, and arbitrary thrown strings may be user-authored. A type alias and comment do not make those messages PHI-safe.

**Exact fix**

1. Replace `LogMeta = Record<string, unknown>` with an allowlisted, flat `SafeLogMeta` containing only fields such as `errorCode`, `errorType`, `status`, opaque `*Id`, `count`, `durationMs`, `routePattern`, and booleans.
2. Replace `errorMeta` with a classifier returning stable codes/types only; never return `message`, stack, cause, request, response, query, or provider body.
3. Add a runtime sanitizer as defense in depth. Reject unknown keys in test/development and emit `[REDACTED]` in production. Do not attempt name/narrative detection by regex alone.
4. Make event names string-literal unions or a registry. Do not permit user input in `event`.
5. Add unit tests using representative name, DOB, email, note narrative, magic-link token, signed URL, filename, and Prisma-style validation message fixtures.

### PHI-LOG-04 — 250+ direct console sites bypass any future central redactor

**Severity:** High  
**Data class:** Error-dependent PHI/PII across both apps

**Evidence**

- Full error objects are logged in PHI-adjacent CRM actions, for example `apps/crm/src/app/(dashboard)/portal-case/actions.ts:44-46`, `:85-87`, and `apps/crm/src/app/actions/actionItems.ts:40-43`, `:78-82`.
- Full error objects are also logged in HRM RBT actions: `apps/hrm/src/app/(dashboard)/rbt/actions.ts:47-53`, `:80-86`.
- Most remaining catches log raw `.message`; representative clinical and applicant examples are detailed below.
- Several catches then return the same raw message to the browser, creating a second disclosure channel: `apps/crm/src/app/(dashboard)/portal-case/actions/billing.ts:71-74`, `:122-125`, `:221-224`; `apps/hrm/src/app/actions/atsActions.ts:723-731`, `:784-788`, `:1220-1228`.

**Exact fix**

1. Permit `console.*` only inside the two logger emitters.
2. Replace every catch sink with `logError("static.event", { errorCode, relevantOpaqueId })`.
3. Map known errors (for example Prisma `P2002`) to a stable internal code and a separate static public message. Do not return `error.message`.
4. For an operation before an ID exists, log a generated correlation ID, never name/email/form content.
5. Preserve debugging detail through local reproduction with synthetic data, not production exception serialization.

### PHI-LOG-05 — CRM intake errors surround names, DOB, email, insurance IDs, and complete form blobs

**Severity:** High  
**Data class:** Client PHI

**Evidence**

- The parent form contains `childName`, `dob`, guardian name/phone/email, insurance member ID, diagnosis dates/providers, emergency contact data, and signatures: `apps/crm/src/components/magic-link/ContinuousIntakeForm.tsx:151-164`.
- `saveIntakeProgress` writes the whole serialized object and logs the raw exception message: `apps/crm/src/app/actions/intake.ts:23-37`. The same pattern exists for both form submissions: `apps/crm/src/app/actions/intake.ts:72-88`, `:92-108`.
- Inquiry creation places child/guardian names, phone, and email in a Prisma create and logs the full error object, then returns its message: `apps/crm/src/app/(dashboard)/portal-case/actions.ts:15-46`.

These are error-path disclosures, not normal-flow direct prints. The issue is that Prisma/adapter error serialization is not contractually value-free.

**Exact fix**

- Emit only `event`, `errorCode`, and `packetId`/`clientId` after validation.
- Never include `formData`, a field value, email, DOB, member ID, or raw exception.
- Return a static public error with a correlation ID, for example `INTAKE_SAVE_FAILED`.
- Add a regression test whose thrown error contains all sensitive sample fields and assert none appear in captured logger output.

### PHI-LOG-06 — session-note and treatment-plan catches can serialize narrative PHI

**Severity:** High  
**Data class:** Session-note content, signatures, treatment goals, and safety information

**Evidence**

- Session Studio accepts caregiver name, goals, objective data, interventions, client response/subjective note, barriers/safety, plan, signatures, trials, and ABC data: `apps/hrm/src/app/actions/sessionEmrActions.ts:423-471`.
- Its terminal catch logs and returns raw `error.message`: `apps/hrm/src/app/actions/sessionEmrActions.ts:1032-1047`.
- CRM treatment-plan save merges an arbitrary clinical JSON object into the client record and logs raw `error.message`: `apps/crm/src/app/(dashboard)/portal-case/actions/clinical-support.ts:141-200`.

**Exact fix**

- For Studio: `logError("session_note.submit_failed", { errorCode, sessionId, clientId })`; return static `SESSION_NOTE_SUBMIT_FAILED`.
- For treatment plans: log only `clientId`, action code, and error code.
- Never log/echo caregiver names, goals, target labels, note text, signatures, or rendered PDF errors.
- Keep the already-safe Studio success audit metadata unchanged; it is listed under verified controls.

### PHI-LOG-07 — messaging and task catches sit around arbitrary free text

**Severity:** High  
**Data class:** Potential clinical narrative, client names, attachments, and workforce PII

**Evidence**

- CRM staff chat writes arbitrary `content` and logs raw `error.message`: `apps/crm/src/app/actions/chat.ts:91-110`.
- CRM action items accept arbitrary title/description and log the full error object: `apps/crm/src/app/actions/actionItems.ts:47-82`.
- HRM RBT messaging writes arbitrary text/document labels and logs raw `error.message`: `apps/hrm/src/app/actions/staffCommunicationActions.ts:429-483`.
- HRM help tickets write subject, message, sender name, filenames, URLs, and call metadata: `apps/hrm/src/app/actions/helpDeskActions.ts:310-355`, `:555-623`; catches log and return raw messages at `:351-359`, `:652-660`.

**Exact fix**

- Log only `messageId`/`ticketId`, sender/receiver opaque IDs, message type, byte/character count, and a stable error code.
- Never log message previews, subject, filename, URL, sender name, or attachment metadata.
- Return static user-facing errors. Keep content in the authorized message table only, not observability logs or generic audit metadata.

### PHI-LOG-08 — HRM application/ATS errors can expose complete applicant dossiers

**Severity:** High  
**Data class:** Workforce PII: name, email, phone, address, BACB number, work authorization, and free-text notes

**Evidence**

- The public application contract includes those fields and `additionalNotes`: `apps/hrm/src/app/actions/publicRbt.ts:13-43`.
- The full dossier is assembled at `apps/hrm/src/app/actions/publicRbt.ts:68-100` and written through Prisma at `:103-177`.
- The catch logs and returns raw exception messages: `apps/hrm/src/app/actions/publicRbt.ts:189-199`.
- Staff ATS creation similarly writes name/email/phone and logs/returns raw messages: `apps/hrm/src/app/actions/atsActions.ts:735-788`.

**Exact fix**

- Before a candidate ID exists, log a random request/correlation ID plus `errorCode`; after creation, log `candidateId`.
- Map duplicate-email errors to a static domain response without logging or echoing the email/value.
- Never log the dossier, applicant name/email/phone/address, filenames, BACB number, or `additionalNotes`.

### PHI-LOG-09 — dual-run audit metadata directly stores note narrative and staff name/email

**Severity:** High  
**Data class:** Clinical note audit narrative plus workforce identity

**Evidence**

- Up to 500 characters of reviewer-authored note text are accepted: `apps/crm/src/app/actions/dualRunAuditActions.ts:320-327`.
- The actor display value is built from full name or email: `apps/crm/src/app/actions/dualRunAuditActions.ts:343-348`.
- Both are written into generic `AuditLogVault.metadata` as `auditNote`, `markedByName`, and possibly `actorLabel`: `apps/crm/src/app/actions/dualRunAuditActions.ts:350-361`.

This contradicts the audit helper's stated IDs-only contract at `apps/crm/src/lib/auditLog.ts:3-7`.

**Exact fix**

1. Put the discrepancy narrative in a dedicated, access-controlled dual-run finding record.
2. Store only `{ findingId, mark, reviewerUserId }` in `AuditLogVault`.
3. Resolve the current display name from `userId` when rendering; do not copy names/emails into audit metadata.
4. Represent dev impersonation with a fixed enum such as `DEV_IMPERSONATION`, not arbitrary `actorLabel`.

### PHI-LOG-10 — billing audit metadata stores claim/auth identifiers and free-text override reasons

**Severity:** High  
**Data class:** Patient-linked claims/authorization identifiers and narrative

**Evidence**

- The Plutus claim reference is copied into generic audit metadata: `apps/crm/src/app/(dashboard)/notes/actions.ts:179-209`.
- Authorization number and reviewer-authored override reason are copied into another audit event: `apps/crm/src/app/(dashboard)/notes/actions.ts:211-227`.
- The audit helper accepts arbitrary metadata without validation: `apps/crm/src/lib/auditLog.ts:12-34`.

**Exact fix**

- Keep claim/auth numbers only in their domain records. Audit by `claimRecordId`, `authorizationId`/`authWindowId`, and `sessionNoteId`.
- Replace free-text `overrideReason` in the generic audit row with an enum `overrideReasonCode` and `overrideRecordId`.
- If compliance requires narrative, store it in a dedicated protected override record and audit the record ID plus a content hash.
- Add typed event-specific metadata so a caller cannot add arbitrary keys.

### PHI-LOG-11 — HRM “redacted” onboarding audit metadata retains names, DOB, email, address, and financial identifiers

**Severity:** High  
**Data class:** Workforce PII and financial identity data

**Evidence**

- Background-check payloads include full legal name, other names, DOB, email, phone, address, and SSN last four: `apps/hrm/src/lib/embeddedOnboardingForms.ts:88-106`.
- W-4/direct-deposit payloads include names, address, full SSN before normalization, bank/routing/account data, email, and phone: `apps/hrm/src/lib/embeddedOnboardingForms.ts:7-26`, `:55-86`.
- `redactForAudit` removes full SSN/account numbers but keeps most other fields, routing numbers, SSN last four, and all background-check values: `apps/hrm/src/lib/embeddedOnboardingForms.ts:396-429`.
- That object is persisted as `OnboardingSignatureEvent.quizAnswers`: `apps/hrm/src/app/actions/onboardingSignatureActions.ts:339-378`, through the generic persistence path at `:157-205`.

**Exact fix**

- Make the generic audit summary event-only: `{ formKey, formVersion, submitted: true, requiredFieldsPresent: true }`.
- Do not place name, DOB, email, phone, address, SSN last four, bank/routing/account fragments, allowances, income, or withholding amounts in `quizAnswers`.
- Keep the authoritative form only in its protected domain record. Audit a form-record ID and content hash.
- If signer name/IP are legally required e-sign evidence, isolate them in the signature record with a documented retention period; do not duplicate them in generic metadata.
- HMAC the device fingerprint with a rotating audit key; store a coarse IP prefix or keyed hash and a normalized browser family instead of full raw values unless counsel requires otherwise.

### PHI-LOG-12 — wage-offer audit events over-retain compensation, language, reason, name, IP, and device data

**Severity:** Medium  
**Data class:** Workforce PII/compensation, not client PHI

**Evidence**

- The audit writer stores signer name, arbitrary `quizAnswers`, IP, full user agent, and device fingerprint: `apps/hrm/src/app/actions/wageOfferActions.ts:117-158`.
- Draft/send events duplicate staff name, pay rate, overtime rate, and payday into audit metadata: `apps/hrm/src/app/actions/wageOfferActions.ts:368-373`, `:445-455`.
- Signing stores primary-language detail: `apps/hrm/src/app/actions/wageOfferActions.ts:519-533`.
- Decline stores up to 500 characters of free-text reason: `apps/hrm/src/app/actions/wageOfferActions.ts:564-590`.

**Exact fix**

- Audit only candidate ID, actor user ID, LS-54 version, status transition, payload hash, and timestamps.
- Keep compensation and payday in the versioned LS-54 domain payload; keep discussion/decline narrative in the protected ticket/domain record.
- Retain signer name only once where e-sign evidence requires it. Apply the same fingerprint/IP/user-agent minimization described in PHI-LOG-11.

### PHI-LOG-13 — upload errors use raw provider messages; CRM object keys retain original filenames

**Severity:** Medium  
**Data class:** Filename-based PHI/PII, storage paths, and potential provider URL/token material

**Evidence**

- CRM sanitizes but preserves the original filename in the storage object key: `apps/crm/src/app/api/upload/route.ts:116-122`.
- It logs the raw Supabase upload message: `apps/crm/src/app/api/upload/route.ts:124-126`; the generic catch also uses raw-message `errorMeta` at `:137-139`.
- The signed-read route logs raw storage/provider messages: `apps/crm/src/app/api/documents/route.ts:45-56`.
- HRM candidate, certificate, onboarding, and recording flows log raw provider messages at `apps/hrm/src/app/actions/candidateDocumentActions.ts:84-92`, `apps/hrm/src/app/actions/fortyHourCourseActions.ts:291-302`, `apps/hrm/src/app/actions/onboardingSignatureActions.ts:420-433`, and `apps/hrm/src/app/actions/interviewRecordingActions.ts:256-263`, `:435-444`.

HRM's listed object keys are already candidate-ID/random-ID or document-key based, so they are **not** a current filename leak. The residual HRM issue is trusting provider message text.

**Exact fix**

- CRM object keys should be `${clientId}/${crypto.randomUUID()}.${verifiedExtension}`. Preserve the original filename only in the authorized document record/UI field.
- Log a mapped provider code/status and opaque client/candidate/document ID only; never provider message, object path, signed URL, token, or original filename.
- Ensure browser responses stay generic and add tests where the fake provider message contains a name, DOB, email, filename, path, and signed token.

### PHI-LOG-14 — raw browser-console errors can be captured by support/session-replay tooling

**Severity:** Medium  
**Data class:** Error-dependent parent/applicant PII and tokens

**Evidence**

- Parent intake autosave logs the caught object directly: `apps/crm/src/components/magic-link/ContinuousIntakeForm.tsx:128-148`.
- Parent document upload logs the caught object directly: `apps/crm/src/components/magic-link/DocumentUploads.tsx:199-235`.
- HRM applicant cache/progress helpers log caught objects or Server Action error strings: `apps/hrm/src/lib/syncAtsProgress.ts:103-150`, `:155-180`, `:205-227`.

Browser logs are visible to anyone with device access and are commonly collected by session-replay/support SDKs later, even though no such SDK exists today.

**Exact fix**

- Remove these console calls or send a static client event code plus a random correlation ID to a safe client telemetry adapter.
- Never include a Server Action error string, caught object, current URL, form state, token, filename, or user-entered value.
- Keep the existing generic toast text.

## Verified current controls — not duplicate findings

These controls were present in the audited tree and are intentionally **not** reported as unresolved historical findings:

- **CRM magic-link path is redacted already:** `apps/crm/src/instrumentation.ts:20-21`, used at `:34`. Only HRM remains exposed.
- **Clinical review/rejection/P2P catches no longer serialize narrative or exception messages.** They emit error type only and return static copy: `apps/crm/src/app/(dashboard)/portal-case/actions/clinical.ts:241-246`, `:340-345`, `:453-458`, `:496-501`. Their remaining direct-console usage is covered by PHI-LOG-04.
- **Session Studio no longer directly logs note payloads.** The mismatch warning contains numeric units/minutes only: `apps/hrm/src/app/actions/sessionEmrActions.ts:483-496`.
- **RBT submit audit is IDs/counts/boolean only:** `apps/hrm/src/app/actions/sessionEmrActions.ts:970-982`.
- **BCBA sign and sign-queue view audits are IDs only:** `apps/crm/src/app/actions/sessionNoteSignActions.ts:166-178`; `apps/crm/src/app/actions/bcbaNoteQueueActions.ts:140-153`.
- **Treatment-plan export audit is IDs/static event only:** `apps/crm/src/app/api/generate-report/[clientId]/route.tsx:43-55`.
- **Dual-run view/export breadcrumbs are filter IDs/counts only:** `apps/crm/src/app/actions/dualRunAuditActions.ts:275-282`, `:386-401`. The separate edit marker remains PHI-LOG-09.
- **Staff-credential audit events use credential/user IDs and static status only:** `apps/hrm/src/app/actions/staffCredentialActions.ts:151-157`, `:197-203`, `:240-246`, `:275-282`.
- **Operations report export metadata is static/timestamp-only:** `apps/crm/src/app/(dashboard)/ops/actions.ts:282-304`.
- **Private storage/public-upload remediation is present.** CRM now uses the private `client-documents` bucket and authenticated reads: `apps/crm/src/app/api/upload/route.ts:7-15`; `apps/crm/src/app/api/documents/route.ts:6-13`. PHI-LOG-13 is limited to filename/error redaction.
- **HRM candidate/recording storage keys are opaque:** `apps/hrm/src/app/actions/candidateDocumentActions.ts:71-96`; `apps/hrm/src/app/actions/interviewRecordingActions.ts:237-240`.

## Top-10 remediation order

1. **Stop the HRM token leak**, deploy template-only route logging, revoke active HRM magic links, and purge affected logs.
2. **Disable the CRM Nominatim autocomplete** until an approved minimum-retention vendor/BAA design exists; remove sensitive address query URLs in both apps.
3. **Make both structured loggers fail-closed** with allowlisted metadata and code-only error classification.
4. **Replace raw errors first in intake, Session Studio, treatment plans, billing, ATS, messaging, and report generation**, then add sensitive-fixture regression tests.
5. **Eliminate all remaining direct `console.*` and raw `error.message` Server Action returns** in both apps.
6. **Move dual-run narrative/name out of `AuditLogVault.metadata`** and audit a finding ID plus reviewer user ID.
7. **Remove claim/auth numbers and override narrative from generic audit metadata**; reference protected domain records.
8. **Minimize HRM onboarding and wage audit events**, especially DOB/email/address/financial fragments, compensation, language, reasons, fingerprint, IP, and user agent.
9. **Randomize CRM storage object names and map all upload/read provider failures to code-only logs**; remove raw browser-console errors.
10. **Turn on the CI grep/lint gate below**, make lint blocking, then re-scan retained logs and rotate/purge anything exposed.

## CI grep and lint proposal

### Immediate grep backstop

After the source migration, add a blocking CI step before tests:

```bash
set -euo pipefail

# Only the two structured logger emitters may call console.*.
if rg -n \
  -g '*.{ts,tsx,js,jsx}' \
  -g '!**/lib/logger.ts' \
  'console\.(log|error|warn|info|debug|trace|dir|table)\s*\(' \
  apps/crm/src apps/hrm/src; then
  echo 'Unsafe direct console call found.'
  exit 1
fi

# Raw exception messages/objects may not become public Server Action errors.
if rg -n \
  -g '*.{ts,tsx}' \
  'error\s*:\s*(error|err|e)(\?\.)?\.message|error instanceof Error\s*\?\s*error\.message' \
  apps/crm/src apps/hrm/src; then
  echo 'Raw exception message exposed or logged.'
  exit 1
fi

# A test under app source must never connect to a live DB or announce live data.
if rg -n \
  -g '*.{test,spec}.{ts,tsx,js,jsx}' \
  'live (DB|data)|DATABASE_URL|PrismaClient|prisma\.(client|session|user|atsCandidate)\b' \
  apps/crm/src apps/hrm/src; then
  echo 'Live-data test detected.'
  exit 1
fi

# Sensitive addresses must not be sent to a public geocoder in a query string.
if rg -n \
  -g '*.{ts,tsx,js,jsx}' \
  'nominatim\.openstreetmap\.org|[?&](q|query|address)=\$\{[^}]+\}' \
  apps/crm/src apps/hrm/src; then
  echo 'Potential sensitive value in an external request URL.'
  exit 1
fi
```

Add a second multiline check for dangerous structured-log keys:

```bash
if rg -n -U \
  -g '*.{ts,tsx}' \
  'log(Info|Warn|Error)\s*\([^;]{0,800}\b(message|path|url|token|name|email|dob|dateOfBirth|note|content|payload|formData|fileName)\s*:' \
  apps/crm/src apps/hrm/src; then
  echo 'Sensitive or unbounded structured-log key found.'
  exit 1
fi
```

The grep is deliberately conservative and is only a backstop; aliases, helper wrappers, and tainted variables require AST/type-aware linting.

### Durable lint/type rule

1. Set ESLint `no-console: "error"` for both app source trees, with a narrow override for only `apps/crm/src/lib/logger.ts` and `apps/hrm/src/lib/logger.ts`.
2. Add a local rule `phi-safe-logging/no-unsafe-meta` that:
   - recognizes `logInfo/logWarn/logError`, audit writers, and public Server Action result objects as sinks;
   - requires a static event literal;
   - permits only an approved metadata-key registry;
   - rejects bare `Error`, `.message`, `.stack`, `.cause`, `request.path/url`, provider response/body, and values sourced from `FormData`, request bodies, URLs, or free-text parameters;
   - rejects sensitive audit keys such as `name`, `email`, `dob`, `note`, `reason`, `content`, `authNumber`, `claimRef`, `token`, `fileName`, `ipAddress`, `userAgent`, and `deviceFingerprint` unless an event-specific legal-evidence schema explicitly permits a minimized form.
3. Add `phi-safe-logging/no-sensitive-url`, rejecting a dynamic query parameter in an external URL when its value is derived from form state, `FormData`, request data, or user input.
4. Define discriminated audit-event types so each event has an exact metadata shape; remove generic `Record<string, unknown>`.
5. Add logger/audit snapshot tests proving representative PHI/PII/secrets never appear.
6. Make lint blocking. It is currently non-blocking via `continue-on-error`: `.github/workflows/ci.yml:31-34`.

## Exit criteria

- No raw path or URL reaches a logger; all dynamic routes use static templates.
- No patient/applicant address or other sensitive value appears in an external request URL; any approved autocomplete has a documented contract, minimum-retention configuration, and same-origin mediation.
- No active token found in retained logs; potentially exposed links are revoked.
- No `console.*` outside the two logger emitters.
- No logger/audit/public-result sink accepts raw `Error`, `.message`, free text, filenames, URLs, or unconstrained metadata.
- Generic audit rows contain IDs, event/status codes, counts, booleans, and timestamps only.
- Onboarding/legal evidence has a documented minimum dataset, role access, retention period, and deletion process.
- Upload object keys are opaque; provider errors are mapped to stable codes.
- All PHI-redaction tests and the now-blocking lint/grep gate pass.
