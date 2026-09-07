---
name: intake-workflow-map
description: >
  Use when touching any code related to client intake status, magic link flow, FlowMap, 
  intake packet, document approval/rejection, IntakeDocumentsTab, or ContinuousIntakeForm.
  Read before writing any status logic, transitions, or UI badge conditions.
---

# Intake Workflow Map

This is the authoritative state machine for the client intake pipeline in Simple RAS CRM.
Read this before writing any status logic, badge conditions, or status transitions.

Also see: `docs/superpowers/specs/2026-08-11-aba-crm-hrm-spine-roadmap.md` for CRM/HRM spine sequencing.

---

## Client Status (`ClientStatus` enum)

```
INQUIRY → MAGIC_LINK_SENT → DOCS_SUBMITTED → DOCS_APPROVED_INTAKE
       → CLINICAL_REVIEW_APPROVED → VOB_COMPLETED → PA_SUBMITTED → PA_APPROVED
       → ASSESSMENT_SCHEDULED → REPORT_ASSEMBLED → TX_PA_SUBMITTED → TX_PA_APPROVED
       → STAFFING_PENDING → ACTIVE → DISCHARGED
```

| Status | Who sets it | Trigger |
|---|---|---|
| `INQUIRY` | System (default) | Client created in CRM (`createInquiry`) |
| `MAGIC_LINK_SENT` | `generateMagicLink()` | Magic link generated for parent |
| `DOCS_SUBMITTED` | `submitIntakePacket()` | Parent completes & submits all forms |
| `DOCS_APPROVED_INTAKE` | `sendToClinical()` | Intake coordinator approves all docs |
| `CLINICAL_REVIEW_APPROVED` | Clinical support / clinical action | Medical necessity / clinical double-check approved |
| `VOB_COMPLETED` | `completeVobAndCreds()` (billing) | Verification of Benefits + credentialing marked done |
| `PA_SUBMITTED` | `submitPaRequest()` (billing) | Assessment Prior Authorization submitted (manual Plutus tracker) |
| `PA_APPROVED` | `approvePaRequest()` (billing) | Assessment PA approved by payer (tracker) |
| `ASSESSMENT_SCHEDULED` | Assessment schedule action / clinical-support schedule | Real assessment datetime persisted; status advances |
| `REPORT_ASSEMBLED` | Report assembly / TP submit path | Treatment Plan assembled (BCBA submit + packet ready) |
| `TX_PA_SUBMITTED` | `submitTreatmentPaRequest()` (billing) | Treatment PA submitted (manual tracker) |
| `TX_PA_APPROVED` | `approveTreatmentPaRequest()` (billing) | Treatment PA approved; may immediately hand off |
| `STAFFING_PENDING` | `approveTreatmentPaRequest()` / explicit handoff / parent schedule save when already `TX_PA_APPROVED` | Authorized client ready for Case Coord staffing (job board) |
| `ACTIVE` | First durable `Session` only (Bridge E) | **Not** granted by RBT approve, Case Coord assign, or parent accept alone |
| `DISCHARGED` | Case coordinator | Client discharged |

---

## Intake Packet Status (`IntakePacketStatus` enum)

```
PENDING_CLIENT_SUBMISSION ⇄ SUBMITTED → APPROVED
                          ↓
              REJECTED_BY_INTAKE
              REJECTED_BY_CLINICAL
```

| Status | Meaning | Who sets it |
|---|---|---|
| `PENDING_CLIENT_SUBMISSION` | Client has not yet submitted, OR changes were requested | Default / `rejectDocument()` / `rejectFormFieldsBulk()` |
| `SUBMITTED` | Client submitted all forms; admin review pending | `submitIntakePacket()` |
| `APPROVED` | Intake approved all documents | `sendToClinical()` |
| `REJECTED_BY_INTAKE` | (Legacy — use `PENDING_CLIENT_SUBMISSION` + `rejectionDetails`) | — |
| `REJECTED_BY_CLINICAL` | Clinical team rejected | Clinical action |

---

## Key Relationship

```
Client (one-to-one) → IntakePacket
```

**Critical:** `client.intakePacket` is a **single object** (nullable), NOT an array.  
- ✅ `client.intakePacket?.status`  
- ❌ `client.intakePacket?.[0]?.status` — always `undefined`

---

## UI Badge Logic

### Master Pipeline (FlowMap)

| Condition | effectiveStatus | Node Label Override |
|---|---|---|
| `packet.status === 'PENDING_CLIENT_SUBMISSION'` | `MAGIC_LINK_SENT` (Node 1) | "Changes Needed" (if has rejections or DOCS_SUBMITTED) |
| `packet.status === 'SUBMITTED'` and `client.status === 'DOCS_SUBMITTED'` | `DOCS_SUBMITTED` (Node 2) | "Review Needed" |
| `client.status === 'DOCS_APPROVED_INTAKE'` | `DOCS_APPROVED_INTAKE` (Node 3) | — |

### Individual Form/Document Row Badge

| Condition | Badge | Color |
|---|---|---|
| `rejectionDetails[key]` exists | CHANGES NEEDED | 🔴 Red |
| `isComplete && !isForm` | APPROVED | 🟢 Green |
| `isComplete && isForm` | REVIEW NEEDED | 🟠 Orange |
| `isUploaded` | REVIEW NEEDED | 🟠 Orange |
| `packet.status === 'PENDING_CLIENT_SUBMISSION'` and none of above | PENDING UPLOAD | ⚫ Gray |
| `isForm` and not started | NOT STARTED | ⚫ Gray |

### Card Title Badge (Client Submissions section)

| Condition | Badge | Color |
|---|---|---|
| `PENDING_CLIENT_SUBMISSION` + has rejections | CHANGES NEEDED | 🔴 Red |
| `SUBMITTED` | REVIEW NEEDED | 🟠 Orange |
| otherwise | raw status | ⚫ Gray |

---

## Clinical Rejection Flow

When Clinical Support requests correction on a verification document (`rejectClinicalReview`):

1. Persist `rejectionDetails[documentKey]` and clear **that** upload from `formData`.
2. Remove **only** that key from `_clinicalReviewApprovals` — other CSS approvals stay.
3. Keep `packet.status = APPROVED` and `client.status = DOCS_APPROVED_INTAKE` (if the client was already `CLINICAL_REVIEW_APPROVED`, step back to `DOCS_APPROVED_INTAKE` so CSS re-signs after the corrected upload).
4. **Never** set `client.status = DOCS_SUBMITTED`, **never** set `packet.status = PENDING_CLIENT_SUBMISSION`, and **never** notify Intake as if the packet was returned.
5. Notify the parent/client to re-upload **that specific document** on the magic link.
6. Parent re-upload (`submitMagicLinkPacket`): packet stays `APPROVED` on the CSS desk; Intake does **not** re-approve Form 01/02 or send to clinical again. Submit validates **only flagged correction keys** (mapped via `CLINICAL_VERIFICATION_DB_TO_FORM_KEY`) — not Form 01/02 or unrelated docs. CSS approvals for other docs are preserved. The flagged key stays in `rejectionDetails` until CSS re-approves the new file. The re-uploaded document boolean is set `true` so CSS can preview (Needs review).
7. Per flagged document, three UI states (file/value presence — not the mere existence of `rejectionDetails`):
   1. **Awaiting family** — flagged, no new upload yet
   2. **Needs CSS review** — flagged + new file uploaded/submitted
   3. **Approved** — CSS re-approved (flag cleared)
   Waiting-for-family banner only if **any** item is state 1. Parent “Changes requested” only for state 1. After submit, parent sees waiting for Clinical Support; CSS shows Needs review. Keep the rejection note until re-approve, labeled “new upload received — review again”.
8. `isClinicalFamilyCorrectionLoop` remains true while flags exist (so parent submit is still allowed after autosave). Do **not** use it alone for banners.

The legacy `rejectClinicalDocs` full-bounce path is disabled.

Intake coordinator `rejectDocument()` still does **not** change `client.status` (stays `DOCS_SUBMITTED`) and only flags that document.

## Intake Rejection Flow

When the intake coordinator rejects a form field or document:
   - Sets `packet.status = 'PENDING_CLIENT_SUBMISSION'`
   - Adds to `packet.rejectionDetails` JSON: `{ fieldId: reason }` or `{ documentKey: reason }`
   - Clears the uploaded URL from `formData` (so client re-uploads)
   - Does NOT change `client.status` — it stays `DOCS_SUBMITTED`

2. Client sees "CHANGES NEEDED" on magic link page
   - Badge is determined by checking `rejectionDetails` in `InitialBlock.tsx`

3. Client re-submits (`submitIntakePacket()`):
   - Sets `packet.status = 'SUBMITTED'`
   - Sets `packet.rejectionDetails = {}`
   - Sets `client.status = 'DOCS_SUBMITTED'`

4. Admin sees "REVIEW NEEDED" — FlowMap returns to Node 2

---

## Document Keys

| Document | DB Field | `rejectionDetails` Key |
|---|---|---|
| Insurance Card (Front) | `insuranceCardFrontUploaded` | `insuranceCardFrontUploaded` |
| Insurance Card (Back) | `insuranceCardBackUploaded` | `insuranceCardBackUploaded` |
| Medicaid Card (Front) | `medicaidCardFrontUploaded` | `medicaidCardFrontUploaded` |
| Medicaid Card (Back) | `medicaidCardBackUploaded` | `medicaidCardBackUploaded` |
| Diagnostic Eval | `diagnosticEvalUploaded` | `diagnosticEvalUploaded` |
| Physician Rx | `physicianRxUploaded` | `physicianRxUploaded` |
| IEP | `iepUploaded` | `iepUploaded` |
| Custody Docs | `custodyDocsUploaded` | `custodyDocsUploaded` |
| Prior ABA Records | `priorAbaRecordsUploaded` | `priorAbaRecordsUploaded` |

Form field rejections use `formField_${fieldId}` as the key.

---

## Magic Link Flow

### Link security (2026-08-12 — expiry / revocation / fingerprint)

- `generateMagicLink()` stamps `magicLinkExpiresAt` = **30 days** (`newMagicLinkExpiry()` in `src/lib/magicLinkGuard.ts`). `NULL` expiry = legacy link, still accepted.
- Staff **reset**: `regenerateMagicLink()` — new token + fresh expiry, clears `magicLinkRevokedAt` and the device lock. Staff **revoke**: `revokeMagicLink()` — sets `magicLinkRevokedAt`, link dies immediately. Fields live on `IntakePacket` (parent) and `CandidateOnboardingPacket` (HRM applicant).
- Every parent-facing action must gate through `requireParentPacketAccess()` (or `requireStaffOrParent()`) from `src/lib/magicLinkGuard.ts`: live token (not revoked/expired) **and** the `device_fingerprint` httpOnly cookie bound on first open. Staff sessions bypass the fingerprint via `requireStaffOrParent`.
- `submitMagicLinkPacket()` validates **every** required form field and document server-side and rejects incomplete packets — the old prototype that auto-checked all items is gone.
- Documents upload to the **private** Supabase Storage bucket `client-documents` via `/api/upload`; they render via the authenticated `/api/documents?path=…` signed-URL redirect. Nothing is stored under `public/uploads`.

```
Admin generates link → client.status = MAGIC_LINK_SENT
                     → IntakePacket created with PENDING_CLIENT_SUBMISSION + 30-day magicLinkExpiresAt

Parent opens link → ContinuousIntakeForm renders
                 → Shows Form01 (client intake) + Form02 (consent) + DocumentUploads

Parent submits → submitIntakePacket() called
              → packet.status = SUBMITTED
              → client.status = DOCS_SUBMITTED
              → rejectionDetails = {}

Admin reviews → Approves/rejects each document and form field
              → On reject: packet.status = PENDING_CLIENT_SUBMISSION

Parent re-submits → cycle repeats until all approved

Admin clicks "Approve & Send to Clinical" → client.status = DOCS_APPROVED_INTAKE
                                          → packet.status = APPROVED
```

---

## Post-intake clinical → staffing (summary)

```
Billing: VOB → Assessment PA submit/approve
BCBA / Clin Supp: schedule assessment → build TP → assemble report
Parent: typed-name TP sign + preferred schedule
Billing: Treatment PA submit/approve → STAFFING_PENDING
Case Coord: readiness checklist → CaseOpening → review apps → parent accept
ACTIVE: only after a real first Session (Bridge E) — staffing accept alone does NOT activate
```

---

## Key Files

| File | Purpose |
|---|---|
| `src/app/(dashboard)/client/[id]/page.tsx` | Server page — fetches `client` with `intakePacket` |
| `src/components/client-profile/FlowMap.tsx` | Pipeline visualization — reads packet status |
| `src/components/client-profile/tabs/IntakeDocumentsTab.tsx` | Admin review UI |
| `src/app/(dashboard)/portal-case/actions.ts` | Intake / assign / RBT approve actions |
| `src/app/(dashboard)/portal-case/actions/billing.ts` | VOB + Assessment/Treatment PA tracker (canonical) |
| `src/app/(dashboard)/portal-case/actions/clinical-support.ts` | Assessment schedule / report assemble status flips |
| `src/app/actions/intake.ts` | Client-side submission + parent schedule save |
| `src/app/actions/caseOpeningActions.ts` | Job board openings / applications / parent accept |
| `src/app/magic-link/actions.ts` | Magic link page actions (field-validated `submitMagicLinkPacket`) |
| `src/lib/magicLinkGuard.ts` | Parent gate: token + expiry + revocation + device fingerprint |
| `src/app/api/upload/route.ts` + `api/documents/route.ts` | Private `client-documents` bucket upload / signed-URL read |
| `src/components/magic-link/ContinuousIntakeForm.tsx` | Parent-facing form |
| `src/components/magic-link/InitialBlock.tsx` | First screen on magic link — shows status |
