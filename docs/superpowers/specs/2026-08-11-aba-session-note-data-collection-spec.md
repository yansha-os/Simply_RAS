# ABA Session Notes & RBT Data Collection — Source of Truth

**Date:** 2026-08-11  
**Status:** Spec (operational guidance — not legal advice; payer contracts govern)  
**Product:** Rise & Shine — Simple RAS CRM + HRM monorepo  
**Related:**
- [`2026-08-11-aba-crm-hrm-spine-roadmap.md`](./2026-08-11-aba-crm-hrm-spine-roadmap.md) (Bridges E–G)
- [`2026-08-11-rbt-session-studio-design.md`](./2026-08-11-rbt-session-studio-design.md) (HRM Session Studio UX)
- Prisma: `Session`, `SessionNote`, `SessionTrialData`, `BehaviorLog`, `EVVLog`, `SkillTarget`, `BehaviorTarget`

Billing remains a **manual Plutus tracker** (no EDI). This spec defines what clinical fields must exist so Billing can later file claims by hand.

---

## 1. Purpose & non-goals

### Purpose

Define the canonical product rules for:

1. What an RBT must capture during/after a session  
2. What a BCBA must co-sign before a note is claim-eligible  
3. Which structured data shapes back the narrative note  
4. What must be true before `SessionNote.isConverted` (Plutus tracker handoff) and before payroll release (Bridge G)

### Non-goals

| Out of scope | Why |
|---|---|
| Real EDI / Plutus API / clearinghouse | Spine Slice C / Bridge F: manual tracker only |
| State EVV aggregator submission | Studio may capture GPS; submission is later |
| Multi-learner group CPT (97154 / 97158) | V1 is 1:1 |
| Crypto / DocuSign-grade e-sign | Typed-name attestation acceptable until dedicated audit slice |
| Replacing Motivity training simulator | `/rbt/simulation` stays separate |
| Legal/compliance advice | Operational product guidance only |

---

## 2. Roles

| Role | App | Owns | Does not own |
|---|---|---|---|
| **RBT** | HRM Session Studio | Clock in/out, data collection, note draft, RBT signature, caregiver attestation when required | Setting claim conversion; BCBA protocol mods as 97155 |
| **BCBA / QHP** | CRM clinical portal | Co-sign queue, deficiencies, protocol modification notes (97155), family guidance (97156), assessment (97151) | Payroll product UI |
| **Case Coord** | CRM | Scheduling sessions, staffing, first session → ACTIVE (Bridge E) | Clinical content of notes |
| **Billing** | CRM Plutus tracker | After `bcbaSigned` (+ checklist): mark claim filed / paid externally; flip `isConverted` when entered in Plutus | Writing clinical narrative |
| **Finance / HRM Payroll** | HRM | Pay for signed, checklist-complete units (Bridge G) | Filing claims |

---

## 3. Session lifecycle states

Product lifecycle (conceptual). Existing Prisma `SessionStatus` is thinner — see §8 for mapping.

```text
SCHEDULED
  → IN_PROGRESS          (EVV clock-in)
  → NOTE_DRAFT           (collect + note phases; may leave Incomplete)
  → RBT_SIGNED           (rbtSigned=true; caregiverSign per policy)
  → BCBA_SIGNED          (bcbaSigned=true; open deficiencies = 0)
  → READY_FOR_TRACKER    (billing checklist green; eligible for Plutus row)
  → CONVERTED            (isConverted=true — entered in Plutus tracker)
  → PAID_SIGNAL          (optional external paid flag / payroll release ack)

Terminal non-billable: CANCELLED | NO_SHOW (documented reason; may still need attendance note per payer)
```

| State | Session.status (today) | SessionNote flags | Gate |
|---|---|---|---|
| Scheduled | `SCHEDULED` | none | Case Coord / schedule |
| In progress | `SCHEDULED` + EVV clock-in | none / draft local | RBT |
| Note draft / Incomplete | still open or `COMPLETED` late | unsigned | RBT resume |
| RBT signed | `COMPLETED` | `rbtSigned=true`, `bcbaSigned=false`, `isConverted=false` | Billing checklist (agency) |
| BCBA signed | `COMPLETED` | `bcbaSigned=true` | No open `NoteDeficiency` |
| Ready for tracker | `COMPLETED` | same + checklist persisted | Billing queue |
| Converted | `COMPLETED` | `isConverted=true` | Manual Plutus entry |
| Cancelled / No-show | `CANCELLED` / `NO_SHOW` | optional cancel note | Not claimable as 97153 units |

**Invariant (Bridge F):** `isConverted` MUST NOT become true unless `rbtSigned && bcbaSigned` and billing checklist passes.  
**Invariant (Bridge G):** Payroll release MUST NOT treat units as payable if note is Incomplete / checklist-blocked / missing required signatures (agency policy).

---

## 4. Required data model

### 4.1 Session header (claim spine)

| Field | Required for claim | Source today | Notes |
|---|---|---|---|
| `clientId` | MUST | `Session.clientId` | Active authorized client |
| Rendering provider (`rbtId`) | MUST | `Session.rbtId` | Credential on file (NPI/Medicaid ID via `StaffCredential` LATER) |
| Supervising BCBA (`bcbaId`) | MUST | `Session.bcbaId` / `Client.bcbaId` | Direction of technician |
| `scheduledStart` / `scheduledEnd` | MUST | Session | Auth / schedule integrity |
| `actualStart` / `actualEnd` | MUST | Session + EVV | Drives 15-min units |
| Duration / billable units | MUST | Derived | 8-minute rule (see §6) |
| `cptCode` | MUST | `Session.cptCode` | Default `97153` for RBT direct |
| Place of service | MUST | `Session.location` | Store CMS POS code + label (e.g. `12 - Home`) |
| Authorization / PA reference | MUST (tracker) | Client / PA tracker | Manual Plutus — surface ID on note header JSON |
| Diagnosis / medical necessity link | MUST (audit) | Client clinical / TP | Note must reference TP goals worked |

**Recommended header JSON** (store in `SessionNote.structuredContent` when added — see §8):

```json
{
  "schemaVersion": 1,
  "cptCode": "97153",
  "placeOfService": { "code": "12", "label": "Home" },
  "actualStart": "2026-08-11T14:00:00.000Z",
  "actualEnd": "2026-08-11T16:00:00.000Z",
  "durationMinutes": 120,
  "billableUnits": 8,
  "renderingProviderUserId": "uuid",
  "renderingCredential": "RBT",
  "supervisingBcbaUserId": "uuid",
  "authorizationRef": "PA-2026-…",
  "treatmentPlanRef": "TP signed date / id",
  "personsPresent": {
    "client": true,
    "caregiverPresent": true,
    "caregiverName": "Jane Doe",
    "other": []
  }
}
```

### 4.2 Clinical narrative (97153 sections — not generic SOAP)

Canonical sections (align with Session Studio `buildClinicalNoteDocument`):

| Section | Min bar | Purpose |
|---|---|---|
| Logistics summary | Auto from header | Who / when / where / CPT / units |
| Goals / targets addressed | ≥1 TP-linked target | Medical necessity |
| Objective data | Measurable summary | Audit + progress |
| Procedures by protocol | ≥1 intervention | Shows implementation of authorized protocols |
| Client response | ≥40 chars substantive | Not “good session” |
| Barriers / safety | Explicit (incl. “None noted”) | Risk + continuity |
| Caregiver participation / debrief | Required if present | Many MCO / agency policies |
| Plan for next session | ≥20 chars | Continuity |
| Signatures block | RBT (+ caregiver per policy) + later BCBA | Attestation chain |

`SessionNote.clinicalContent` remains the human-readable render (text). Structured fields live alongside (JSON) so checklists and payroll don’t parse prose.

### 4.3 Goals / targets + data collection payloads

Link trials/logs to `SkillTarget` / `BehaviorTarget` when UUIDs exist.

#### Trial-by-trial / DTT (percentage correct)

```json
{
  "modality": "TRIAL",
  "targetId": "uuid",
  "targetLabel": "Mand: I want ___",
  "trials": [
    {
      "trialIndex": 1,
      "score": "+",
      "promptLevel": "Independent",
      "at": "ISO-8601"
    }
  ],
  "summary": { "correct": 8, "prompted": 2, "incorrect": 0, "percentIndependent": 80 }
}
```

Maps to existing `SessionTrialData` (`score`: `+` | `-` | `P` | `NR`).

#### Frequency

```json
{
  "modality": "FREQUENCY",
  "behaviorTargetId": "uuid",
  "behaviorName": "Elopement attempts",
  "count": 3,
  "observationMinutes": 120,
  "ratePerHour": 1.5
}
```

#### Duration

```json
{
  "modality": "DURATION",
  "behaviorTargetId": "uuid",
  "episodes": [{ "seconds": 45, "intensity": "MODERATE", "at": "ISO-8601" }],
  "totalSeconds": 120
}
```

#### ABC (incident)

```json
{
  "modality": "ABC",
  "antecedent": "…",
  "behavior": "…",
  "consequence": "…",
  "durationSeconds": 30,
  "intensity": "MILD",
  "at": "ISO-8601",
  "behaviorTargetId": "uuid | null"
}
```

Prefer persisting to `BehaviorLog` (+ `abcNotes`) when `BehaviorTarget` exists.

#### Task analysis / chaining

```json
{
  "modality": "TASK_ANALYSIS",
  "targetId": "uuid",
  "chainType": "FORWARD | BACKWARD | TOTAL_TASK",
  "steps": [
    { "order": 1, "instruction": "Wash hands - turn on water", "status": "INDEPENDENT" },
    { "order": 2, "instruction": "Apply soap", "status": "PROMPTED" }
  ],
  "percentIndependent": 50
}
```

#### Probe / cold probe

```json
{
  "modality": "PROBE",
  "targetId": "uuid",
  "result": "CORRECT | INCORRECT | NO_RESPONSE",
  "promptLevel": "Independent",
  "notes": "First trial of session, no teaching"
}
```

#### Interval / partial interval (LATER)

```json
{
  "modality": "INTERVAL",
  "targetId": "uuid",
  "intervalSeconds": 30,
  "intervals": [{ "index": 1, "occurred": true }],
  "percentIntervals": 40
}
```

### 4.4 Caregiver involvement

| Field | When required |
|---|---|
| `caregiverPresent` YES/NO | Always document |
| `caregiverName` | If YES |
| `caregiverParticipation` narrative | If YES (debrief / coaching) |
| Caregiver signature | Agency payroll gate + many MCO contracts (Session Studio checklist) |

### 4.5 Barriers / cancel / no-show

| Event | Required fields |
|---|---|
| Barriers during session | Free text (≥4 chars; allow “None noted”) |
| Safety incident | Narrative + optional ABC + intensity; escalate per SOP (out of band) |
| Cancel | `Session.status=CANCELLED`, reason code, who cancelled, notice time |
| No-show | `Session.status=NO_SHOW`, wait time, contact attempts |

Cancel/no-show are **not** 97153 billable units; some payers allow limited admin billing — out of V1 tracker scope unless Billing adds a separate Plutus row type.

---

## 5. Data collection modality matrix

| Goal / target type (`SkillTarget.measurementType`) | Primary modality | Secondary | Persist to |
|---|---|---|---|
| Acquisition / DTT skill | TRIAL (+ prompt level) | Probe | `SessionTrialData` |
| Mand / FCT | TRIAL or FREQUENCY | ABC if problem behavior | Trial + optional BehaviorLog |
| Listener / imitation | TRIAL | — | `SessionTrialData` |
| Self-help / ADL chain | TASK_ANALYSIS | TRIAL per step | JSON (+ trials LATER) |
| Problem behavior ↓ | FREQUENCY / DURATION | ABC | `BehaviorLog` |
| Replacement behavior ↑ | TRIAL or FREQUENCY | — | Trial or BehaviorLog |
| Fluency / rate | FREQUENCY (timed) | — | BehaviorLog / JSON |
| Maintenance | PROBE | TRIAL | `SessionTrialData` |
| NET / incidental | Narrative + opportunistic TRIAL | — | clinicalContent + trials |

**Rule:** At least **one** objective datum (≥1 trial **or** frequency/duration/TA summary) must exist before claim-ready for 97153, unless session is documented cancel/no-show.

---

## 6. Billing readiness checklist

### 6.1 Time / units (all timed ABA Category I codes)

Operational guidance (AMA adaptive behavior codes; Medicare-style midpoint for 15-min units):

| Minutes | Units |
|---|---|
| 0–7 | 0 |
| 8–22 | 1 |
| 23–37 | 2 |
| … | `floor((minutes + 7) / 15)` |

Match Session Studio `billableUnitsFromSeconds`.

### 6.2 CPT-specific documentation (what Billing needs later)

| CPT | Who renders | Doc MUST show | Common failure |
|---|---|---|---|
| **97153** | Tech / RBT (under QHP direction) | Goals, protocols used, data, client response, times, POS, signatures | Vague narrative; no data; wrong provider |
| **97155** | BCBA / QHP | **What protocol changed + why + client response**; face-to-face | “Supervision only” → downcode to 97153 |
| **97156** | BCBA / QHP | Caregiver named, skills taught, practice/feedback | “Discussed progress” only |
| **97151** | BCBA / QHP | Assessment activities, tools, analysis, TP/report work | Billing treatment as assessment |

**Concurrent 97153 + 97155:** Allowed when QHP joins and modifies protocol while tech continues — document both roles/times (LATER product; V1 may single-code sessions).

### 6.3 Claim-ready checklist (97153 — Bridge F gate)

Aligned to Session Studio / NYS Medicaid + commercial/CASP-style common fields:

| # | Check | Fail → |
|---|---|---|
| 1 | Start/end recorded; units ≥ 1 | Incomplete + pay hold |
| 2 | CPT + POS set | Incomplete |
| 3 | Persons present (caregiver Y/N + name if Y) | Incomplete |
| 4 | ≥1 TP goal + objective data | Incomplete |
| 5 | ≥1 procedure by protocol | Incomplete |
| 6 | Client response ≥40 chars | Incomplete |
| 7 | Barriers/safety addressed | Incomplete |
| 8 | Plan next ≥20 chars | Incomplete |
| 9 | RBT signature | Incomplete |
| 10 | Caregiver signature (agency policy) | Incomplete / pay hold |
| 11 | `bcbaSigned` (supervisory co-sign) | Wait in BCBA queue — **not** Plutus-ready |
| 12 | No open `NoteDeficiency` | Block conversion |

Only after 1–12: Billing may set `isConverted` when the claim is entered in the **manual Plutus tracker**.

### 6.4 Authorization / units remaining

Before conversion, Billing verifies (manual, outside EDI):

- Active Treatment PA / auth covers date of service  
- CPT allowed under auth  
- Remaining units ≥ billed units  
- Rendering provider credentialed for payer  

Product surfaces auth ref on note header; enforcement can start as soft warnings (MUST for tracker UX, hard-block LATER).

---

## 7. Signature & audit trail requirements

### Chain

```text
RBT completes note → RBT typed-name sign (rbtSigned)
  → Caregiver typed-name sign when required (parentSigned)
    → BCBA co-sign (bcbaSigned)  [CRM queue]
      → Billing converts (isConverted)  [Plutus tracker]
        → Payroll release signal (Bridge G)
```

### Attestation semantics (product)

| Flag | Meaning |
|---|---|
| `rbtSigned` | Rendering provider attests times, data, and narrative are accurate |
| `parentSigned` | Caregiver acknowledges session occurred / participation (agency gate) |
| `bcbaSigned` | Supervising QHP reviewed note for clinical adequacy / direction |
| `isConverted` | Billing recorded claim in Plutus tracker (not “paid”) |

### Audit (MUST vs LATER)

| Requirement | Priority |
|---|---|
| Persist boolean flags on `SessionNote` | MUST (exists) |
| Store signer display name + timestamp in structured JSON | MUST |
| Immutable append-only audit log table | LATER |
| IP / device fingerprint | LATER |
| Deficiency open/resolve with actor | MUST (`NoteDeficiency` exists) |
| No PHI in application logs | MUST — log ids/error codes only |

---

## 8. Mapping to Prisma + additive fields

### 8.1 Existing models (keep)

| Model | Use |
|---|---|
| `Session` | Header: client, rbt, bcba, times, cpt, location, status |
| `SessionNote` | Narrative + signature / converted flags |
| `SessionTrialData` | Trial-level skill data |
| `SkillTarget` | Authorized goals; `measurementType` drives modality |
| `BehaviorTarget` / `BehaviorLog` | Problem behavior + ABC |
| `EVVLog` | Clock in/out + optional lat/lng |
| `NoteDeficiency` | BCBA bounce-back |

### 8.2 `SessionStatus` gap

Today: `SCHEDULED | COMPLETED | CANCELLED | NO_SHOW`.  
Product needs `IN_PROGRESS` (and optionally `INCOMPLETE_NOTE`).  

| Change | Priority |
|---|---|
| Add `IN_PROGRESS` to enum | MUST (Bridge E/F honesty) |
| Represent Incomplete via note unsigned + payroll hold (no new enum) | OK for V1 |

### 8.3 Additive fields — MUST vs LATER

| Change | Priority | Notes |
|---|---|---|
| `SessionNote.structuredContent Json?` | **MUST** | Header + sections + checklist snapshot |
| `SessionNote.rbtSignedAt` / `bcbaSignedAt` / `parentSignedAt DateTime?` | **MUST** | Audit timestamps |
| `SessionNote.rbtSignerName` / `bcbaSignerName` / `parentSignerName String?` | **MUST** | Typed-name capture |
| `SessionNote.billableUnits Int?` | **MUST** | Avoid re-deriving inconsistently |
| `SessionNote.checklistSnapshot Json?` | **MUST** | Freeze pass/fail at RBT submit |
| `SessionNote.plutusClaimRef String?` | **MUST** (Bridge F tracker) | Manual claim id / batch note |
| `SessionNote.convertedAt DateTime?` | **MUST** | When `isConverted` flipped |
| `Session.placeOfServiceCode String?` | **MUST** | Normalize POS separate from free-text `location` |
| `SessionStatus.IN_PROGRESS` | **MUST** | Lifecycle honesty |
| Persist ABC → `BehaviorLog` from Studio | **MUST** | Today often draft-only |
| Persist TA / frequency JSON beyond trials | **LATER** | Can live in `structuredContent` first |
| Interval recording UI | **LATER** | |
| Concurrent 97155 session split | **LATER** | |
| Auth unit ledger table | **LATER** | Manual tracker first |
| Append-only `SessionNoteAuditEvent` | **LATER** | |

Do **not** run migrate/db push from agents. Paste SQL below in Supabase SQL Editor when ready.

### 8.4 Appendix — paste-ready Supabase SQL (idempotent)

```sql
-- ABA session note additive fields (Bridge F readiness)
-- Run manually in Supabase SQL Editor. Idempotent where possible.

-- 1) SessionStatus: add IN_PROGRESS if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'SessionStatus' AND e.enumlabel = 'IN_PROGRESS'
  ) THEN
    ALTER TYPE "SessionStatus" ADD VALUE 'IN_PROGRESS';
  END IF;
END $$;

-- 2) Session: normalized POS code
ALTER TABLE "Session"
  ADD COLUMN IF NOT EXISTS "placeOfServiceCode" TEXT;

-- 3) SessionNote: structured + signature audit + tracker fields
ALTER TABLE "SessionNote"
  ADD COLUMN IF NOT EXISTS "structuredContent" JSONB,
  ADD COLUMN IF NOT EXISTS "checklistSnapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "billableUnits" INTEGER,
  ADD COLUMN IF NOT EXISTS "rbtSignedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "parentSignedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "bcbaSignedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "rbtSignerName" TEXT,
  ADD COLUMN IF NOT EXISTS "parentSignerName" TEXT,
  ADD COLUMN IF NOT EXISTS "bcbaSignerName" TEXT,
  ADD COLUMN IF NOT EXISTS "plutusClaimRef" TEXT,
  ADD COLUMN IF NOT EXISTS "convertedAt" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "SessionNote_bcbaSigned_isConverted_idx"
  ON "SessionNote" ("bcbaSigned", "isConverted");

CREATE INDEX IF NOT EXISTS "SessionNote_rbtSigned_bcbaSigned_idx"
  ON "SessionNote" ("rbtSigned", "bcbaSigned");
```

Mirror the same fields in `packages/db/prisma/schema.prisma` (and root `prisma/schema.prisma` if kept in sync) **after** SQL is applied; run `prisma generate` only (no db push).

---

## 9. UX outline

### 9.1 HRM Session Studio (RBT) — exists; extend carefully

Phases (approved design): `CLOCK_IN → COLLECT → NOTE → SIGN`

| Phase | Product rules |
|---|---|
| Clock in | EVV start; set session `IN_PROGRESS` when durable |
| Collect | Modality UI per target type; DTT + ABC minimum V1; fat-finger scoring |
| Note | Auto-fill from data; enforce section mins; live billing strip |
| Sign | RBT + caregiver; if checklist fail → Incomplete + pay hold; if pass → persist note `rbtSigned`, notify BCBA |

Do not mark `isConverted` from HRM.

### 9.2 CRM BCBA co-sign queue

| Surface | Behavior |
|---|---|
| Daily workstation / clinical queue | List `rbtSigned && !bcbaSigned` |
| Note detail | Show clinicalContent + structured data summaries + checklist |
| Approve | Set `bcbaSigned` (+ name/time) → notify Billing |
| Reject | Create `NoteDeficiency`; clear or keep `rbtSigned` per policy (prefer keep content, require RBT fix) |
| Client EMR tab | Per-client pending sign-offs |

### 9.3 CRM Billing / Plutus tracker

| Queue | Filter |
|---|---|
| Awaiting BCBA | `rbtSigned && !bcbaSigned` |
| Ready for Plutus | `bcbaSigned && !isConverted` + checklist ok |
| Converted | `isConverted` | Enter claim ref / date; optional paid signal later |

---

## 10. Alignment with Bridges F & G

| Bridge | This spec contributes |
|---|---|
| **E** First session → ACTIVE | Durable `Session` with real times/POS before clinical ops; Studio should attach to scheduled session ids |
| **F** Notes → claims tracker | Lifecycle + checklist + `bcbaSigned` before `isConverted`; structured fields for manual claim filing |
| **G** Notes → payroll | Same checklist blockers as Incomplete holds; payable when RBT(+caregiver) complete and agency rules met — typically after BCBA sign **or** explicit finance policy; **default recommendation:** release payroll only when checklist green **and** `rbtSigned` (+ caregiver); optionally hold until `bcbaSigned` if finance requires |

**Default product decision (recommended):**

- **Claims (`isConverted`):** require `bcbaSigned`  
- **Payroll:** require checklist + `rbtSigned` + caregiver sign; soft-warn if BCBA unsigned > N days  

Document any override in Finance SOP; do not silently pay Incomplete notes.

---

## 11. Gap analysis — current `RbtSessionStudio`

| Area | Status in codebase | Gap |
|---|---|---|
| Full-page studio phases | Present | — |
| DTT trial collect + ABC | Present (draft + partial persist) | ABC → `BehaviorLog` not always written |
| Billing checklist (97153) | Present in `sessionStudio.ts` | Does not yet require `bcbaSigned` (correct — BCBA is CRM) |
| Structured clinical note text | `buildClinicalNoteDocument` → `clinicalContent` | No `structuredContent` JSON column yet |
| Persist Session + SessionNote | `submitHrmSessionEmrNote` | Sets `rbtSigned`, clears `isConverted`, awaits BCBA |
| `SessionTrialData` | Only when `targetId` is real SkillTarget UUID | Demo targets don’t persist trials |
| TA steps / frequency modalities | Payload fields exist; UI limited | Full modality matrix incomplete |
| BCBA co-sign | CRM actions/queue emerging | Ensure single source of truth with this spec |
| Plutus tracker fields | `isConverted` only | Need claim ref / convertedAt / ready queue UX |
| Payroll holds | Durable `Session` + `SessionNote` attestation | LIVE payroll and incomplete queues derive the same fail-closed result; browser hold ledger retired |
| `IN_PROGRESS` status | Not in enum | SQL appendix |
| HIPAA logging | Mixed `console.error` with messages | Strip PHI; ids only |

---

## 12. HIPAA / PHI handling (stack notes)

| Rule | Practice |
|---|---|
| Logs | No client names, DOB, addresses, note body in server logs — use `sessionId` / `noteId` |
| Drafts | `sessionStorage` drafts are device-local; clear on claim-ready submit; warn on shared devices |
| Transport | HTTPS only; server actions auth-guarded |
| Access | RBT sees assigned sessions; BCBA sees supervised clients; Billing sees signed notes |
| Minimization | Payroll views units/time/status — not full clinical narrative unless needed for dispute |

---

## 13. Open decisions / risks

| # | Decision | Risk if deferred |
|---|---|---|
| 1 | Payroll gate: caregiver-only vs also `bcbaSigned` | Over/under-paying RBTs |
| 2 | Hard-block conversion without auth unit ledger | Over-billing auth |
| 3 | Single CPT per session vs split 97153/97155 | Downcodes / lost revenue |
| 4 | Parent/caregiver sign required for all payers vs agency-only | Checklist too strict for some commercial |
| 5 | Duplicate schemas (`prisma/` vs `packages/db`) | Drift |
| 6 | Demo/findOrCreateClient in Studio submit | Pollutes prod DB if misused |
| 7 | Typed-name e-sign sufficiency | Payer audit challenges — mitigate with timestamps + deficiency trail |
| 8 | NYS EVV aggregator | Compliance exposure for Medicaid home services |

---

## 14. Supervision / BCBA oversight (documentation impact)

Operational (BACB-aligned concepts for product design):

| Requirement | Product implication |
|---|---|
| RBT practices under BCBA direction | Every 97153 note has supervising `bcbaId` |
| Ongoing supervision % (employer/BACB policy) | Separate from CPT; do not invent “supervision CPT” from 97153 notes |
| Protocol modification face-to-face | Use **97155** note type with modification fields — not a checkbox on 97153 |
| Note review | BCBA co-sign queue is the product control for claim readiness |
| Deficiencies | Bounce incomplete clinical content before conversion |

---

## 15. EVV posture (P2 decision record, 2026-08-12)

Decision record for open risk #8 (state EVV aggregator). Aggregator **submission stays out of scope** (gap-analysis §6) — this pins what exists and what the go/no-go looks like.

**Captured today (capture-only, no submission):**
- `EVVLog` row per session: `clockInTimestamp` / `clockOutTimestamp`, `staffId`, optional `clockInLat/Lng` + `clockOutLat/Lng`.
- Written idempotently at Studio clock-in (one open log per session; re-clock resumes instead of duplicating — duplicate EVV rows are a payer-audit flag); clock-out stamps the open row.
- Session `actualStart`/`actualEnd` drive the `(min+7)/15` billable-unit math; clock-in also flips `SessionStatus` to `IN_PROGRESS`.
- **Honesty gap:** `isLocationVerified` defaults `true` with no actual GPS/telephony verification behind it.

**What a state aggregator (e.g. Sandata/HHAeXchange-class) would additionally need:**
- Verified visit location (GPS or telephony) at both clock events; member + rendering-provider Medicaid identifiers; payer EVV service-code mapping; batch/real-time submission with acceptance/rejection reconciliation; a manual-edit/exception workflow with reason codes.

**Decision point:** before scaling billing beyond the dual-run cohort into Medicaid home-service claims, Billing + Ops decide build-vs-integrate on aggregator submission. Until then: capture stays as-is, and `isLocationVerified` must not be presented as verified EVV.

---

## Document control

| Version | Date | Notes |
|---|---|---|
| 1.0 | 2026-08-11 | Initial source-of-truth for Bridges F/G clinical + billing field design |
| 1.1 | 2026-08-12 | §15 EVV posture P2 decision record (Track J payer hardening) |
