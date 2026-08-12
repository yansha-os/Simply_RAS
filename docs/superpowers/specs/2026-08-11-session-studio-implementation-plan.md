# Session Studio — Implementation Plan

**Date:** 2026-08-11  
**Status:** Slices 0–8 code landed (2026-08-12: checklist convert gate, BCBA sign parity, payroll note-units, RBT identity hardening, AuditLogVault wiring); SQL applied via `2026-08-12-schema-parity-backfill.sql`  
**Owner lane:** HRM Session Studio + CRM BCBA / notes parity  
**SoT:** [`2026-08-11-aba-session-note-data-collection-spec.md`](./2026-08-11-aba-session-note-data-collection-spec.md)  
**UX design:** [`2026-08-11-rbt-session-studio-design.md`](./2026-08-11-rbt-session-studio-design.md)  
**QA after ship:** [`2026-08-11-bridge-efg-manual-qa-checklist.md`](./2026-08-11-bridge-efg-manual-qa-checklist.md)  
**Spine:** Bridges E–G marked DONE for activation / sign / payroll *wiring*; this plan closes **clinical + structured field** gaps so those bridges stay honest under audit.

---

## 0. Context — Bridges F/G already shipped

Do **not** rebuild Bridge wiring. Extend data quality on top:

| Bridge | Already true in code | Still incomplete vs SoT |
|--------|----------------------|-------------------------|
| **E** | Case Coord schedules durable non-`97151` `Session`; activate → `ACTIVE`; job-board accept does not activate | Studio should prefer attaching to that scheduled session id (UUID) |
| **F** | RBT submit → `rbtSigned`; BCBA → `bcbaSigned`; `/notes` convert → `isConverted` gated on signs | Structured/checklist/signer fields now written from HRM Studio (Slice 1); BCBA queue still prose-first |
| **G** | HRM payroll payable from `bcbaSigned \|\| isConverted`; unsigned = hold | Units now persisted on note; Incomplete still partly `localStorage`; payroll prefer `billableUnits` is Slice 7 |

**Product decision locked for this plan (matches shipped Bridge G):** payroll pays when `bcbaSigned` (or converted). Soften later only via Finance SOP — do not silently pay Incomplete notes.

---

## 1. Gap analysis vs SoT

Sources: SoT §§4–11, design doc, live `RbtSessionStudio` / `sessionStudio.ts` / `sessionEmrActions.ts` / `SessionNote` schema.

| Area | Exists today | Missing / weak |
|------|--------------|----------------|
| Full-page phases CLOCK→COLLECT→NOTE→SIGN | Yes — `/rbt/session/[sessionId]` | — |
| DTT trials + ABC in draft | Yes | ABC → `BehaviorLog` + full modality JSON on claim-ready (Slice 2) |
| Billing checklist UI | Yes — `sessionStudio.ts` | Snapshot persisted on claim-ready submit; CRM convert gate is Slice 3 |
| Note text | `buildClinicalNoteDocument` → `clinicalContent` | `structuredContent` written on submit (Slice 1) |
| Persist Session + SessionNote | `submitHrmSessionEmrNote` | Forces `isConverted: false`; writes billableUnits + signer audit (Slice 1) |
| `SessionTrialData` | Real SkillTarget UUIDs (DTT + probe) | Demo targets still JSON-only in `structuredContent.modalities` |
| Frequency / duration / TA / interval modalities | Collect UI + JSON snapshot | Interval UI still LATER; TA/freq live in `structuredContent` first |
| `SessionStatus.IN_PROGRESS` | Enum + Prisma ready | Clock-in status flip is Slice 4 |
| POS | `Session.location` + `placeOfServiceCode` | Code set on submit |
| BCBA queue | `BcbaDailyWorkstation` e-sign | No structured summary / deficiency bounce UX depth (Slice 5) |
| Plutus tracker | `isConverted` boolean | Columns ready; write on convert is Slice 6 |
| Payroll | Durable list + local holds secondary | Prefer persisted units is Slice 7 |
| HIPAA logs | Mixed | Strip PHI from server logs (ids only) — Slice 8 |

---

## 2. Schema / SQL MUST fields

Apply SoT §8.3–8.4. **Do not** run `prisma migrate` / `db push`. Paste SQL in Supabase SQL Editor; then mirror Prisma + `prisma generate` only.

### MUST (this plan)

| Field / change | Why |
|----------------|-----|
| `SessionNote.structuredContent Json?` | Header + sections + modalities snapshot |
| `SessionNote.checklistSnapshot Json?` | Freeze pass/fail at RBT submit |
| `SessionNote.billableUnits Int?` | Payroll / tracker unit accuracy |
| `SessionNote.rbtSignedAt` / `bcbaSignedAt` / `parentSignedAt` | Audit |
| `SessionNote.rbtSignerName` / `bcbaSignerName` / `parentSignerName` | Typed-name attestation |
| `SessionNote.plutusClaimRef` / `convertedAt` | Manual Plutus tracker |
| `Session.placeOfServiceCode` | Normalize POS |
| `SessionStatus.IN_PROGRESS` | Clock-in honesty |

### LATER (out of MUST slices)

Auth unit ledger table; append-only `SessionNoteAuditEvent`; interval UI; concurrent 97155 split; TA/frequency as separate tables (OK inside `structuredContent` first).

### Appendix — paste-ready SQL

Canonical file: [`docs/sql/2026-08-11-session-note-structured-fields.sql`](../../sql/2026-08-11-session-note-structured-fields.sql) (identical to SoT §8.4).

```sql
-- ABA session note additive fields (Session Studio plan)
-- Run manually in Supabase SQL Editor. Idempotent where possible.

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

ALTER TABLE "Session"
  ADD COLUMN IF NOT EXISTS "placeOfServiceCode" TEXT;

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

---

## 3. Build slices (ordered)

### Slice 0 — Schema + Prisma mirror — **DONE (code); blocked on human SQL apply**

| | |
|--|--|
| **Work** | Human runs SQL → update root + `packages/db` Prisma → `prisma generate` → confirm client types |
| **Touch** | `prisma/schema.prisma`, `packages/db/prisma/schema.prisma`, `docs/sql/2026-08-11-session-note-structured-fields.sql` |
| **Success** | Types expose new fields; no live migrate from agents; existing E/F/G paths still compile |
| **Progress** | Prisma mirrored (both schemas); SQL indexed in `docs/sql/README.md`. **Run SQL in Supabase before treating DB as migrated.** |

### Slice 1 — Structured note JSON on submit — **DONE (HRM Studio)**

| | |
|--|--|
| **Work** | On claim-ready submit, write SoT header + section map into `structuredContent`; keep `clinicalContent` as human render from `buildClinicalNoteDocument`; set signer names/timestamps, `billableUnits`, `placeOfServiceCode` |
| **Touch** | `sessionStudio.ts`, `sessionEmrActions.ts`, `RbtSessionStudio.tsx` |
| **Success** | New note row has non-null `structuredContent.schemaVersion`, matching times/CPT/POS; `rbtSigned=true`; `bcbaSigned=false`; `isConverted=false`; Bridges F/G QA still passes |
| **Non-regression** | Do not set `isConverted` from HRM |
| **Progress** | `buildStructuredNoteContent` + `checklistSnapshot` persisted on claim-ready submit; Studio passes `sessionId` + checklist freeze. Still needs SQL applied for live writes. |

### Slice 2 — Modality persist (DTT + ABC minimum; frequency/duration in JSON) — **DONE (HRM Studio)**

| | |
|--|--|
| **Work** | Persist trials to `SessionTrialData` when SkillTarget UUID; always embed trial/ABC/frequency/duration arrays in `structuredContent`; write ABC incidents to `BehaviorLog` |
| **Touch** | `sessionEmrActions.ts`, collect phase in `RbtSessionStudio`, SoT modality shapes |
| **Success** | Real-target session leaves trial rows; ABC appears in `BehaviorLog`; demo targets still store modalities in JSON (no silent drop) |
| **Progress** | Collect tabs for DTT / freq / duration / TA / probe / ABC; `buildModalitiesSnapshot` embeds SoT shapes; DTT+probe → `SessionTrialData` (UUID); ABC always → `BehaviorLog` (find/create BehaviorTarget); freq/duration → BehaviorLog when BehaviorTarget UUID (else JSON only). Bridge F: `isConverted` still forced false. |

### Slice 3 — Billing checklist gate (durable) — **DONE (2026-08-12)**

| | |
|--|--|
| **Work** | Persist `checklistSnapshot` at submit; Incomplete path remains unsigned + pay hold; CRM `convertNoteToBillable` rejects if snapshot missing/failed (in addition to signature gates) |
| **Touch** | `sessionStudio.ts` checklist, `sessionEmrActions.ts`, `apps/crm/.../notes/actions.ts` |
| **Success** | Failed checklist cannot become `isConverted`; passed checklist visible on note; Incomplete resume still hydrates draft |
| **Align F** | Tracker stays manual — no EDI |
| **Progress** | `apps/crm/src/lib/noteConvertGate.ts` (`evaluateConvertGate`, vitest-covered) gates `convertNoteToBillable`: rejects missing **or** failed `checklistSnapshot` after signature checks; convert also role-guarded + audit-logged. |

### Slice 4 — Session lifecycle honesty (`IN_PROGRESS`) — **DONE**

| | |
|--|--|
| **Work** | Clock-in updates durable session to `IN_PROGRESS` + actualStart; sign/close → `COMPLETED` + actualEnd |
| **Touch** | Session Studio clock phase, `sessionEmrActions` (or thin clock action) |
| **Success** | Scheduled Case Coord session moves SCHEDULED → IN_PROGRESS → COMPLETED; Bridge E activate still accepts SCHEDULED \| COMPLETED therapy sessions |
| **Progress** | `clockInHrmSession` flips SCHEDULED → IN_PROGRESS + `actualStart` (+ EVVLog best-effort); Studio submit completes to COMPLETED + `actualEnd`. 2026-08-12: clock-in now requires the acting RBT and rejects sessions assigned to another RBT. |

### Slice 5 — BCBA queue parity — **DONE (2026-08-12)**

| | |
|--|--|
| **Work** | Daily Workstation / client EMR show structured summary + checklist snapshot; e-sign sets `bcbaSignedAt` / `bcbaSignerName`; deficiency create path usable when reject |
| **Touch** | `BcbaDailyWorkstation`, `sessionNoteSignActions`, optional `BcbaSessionEmrTab` |
| **Success** | BCBA can e-sign without guessing from prose alone; F QA path unchanged for happy path; unsigned notes stay off `/notes` |
| **Progress** | Queue shows structured summary + `checklistPassed` (`bcbaNoteQueueActions` + `sessionNoteSummary`). E-sign is role-guarded (BCBA/CD/CEO), mirrors the attestation into `structuredContent.bcbaSignature` (+ supervising BCBA backfill), and writes SIGN audit rows. `flagDeficiency` now records the real signed-in flagger (mock IDs rejected). |

### Slice 6 — Plutus tracker fields — **DONE**

| | |
|--|--|
| **Work** | On convert: set `convertedAt`, optional `plutusClaimRef` input on `NotesPipelineClient` |
| **Touch** | `notes/actions.ts`, `NotesPipelineClient`, `/notes` page |
| **Success** | Converted notes show claim ref; still no EDI |
| **Progress** | Convert writes `convertedAt` + optional `plutusClaimRef`; `NotesPipelineClient` has the claim-ref input and shows ref + date on converted rows. 2026-08-12: convert additionally gated on checklist snapshot (Slice 3) and audit-logged. |

### Slice 7 — Payroll unit accuracy + durable holds — **DONE (2026-08-12)**

| | |
|--|--|
| **Work** | Prefer `SessionNote.billableUnits` in `listRbtPayrollSessions`; treat Incomplete as DB-backed (unsigned / failed checklist) — keep `localStorage` secondary/migrated |
| **Touch** | `payrollActions.ts`, `RbtPayrollView`, `rbtPayHolds.ts` (de-emphasize) |
| **Success** | Payable units match Studio 8-minute rule display; G QA holds/payable still correct; no pay for unsigned |
| **Progress** | `resolvePayrollUnits` prefers persisted `billableUnits` (`unitsSource: NOTE \| ESTIMATE` badge in `RbtPayrollView`); payroll query now includes `IN_PROGRESS` sessions as DB-backed incomplete holds; failed frozen checklist is a DB hold reason. `localStorage` holds remain secondary for local-only drafts and reconcile against payable rows. Vitest suite extended (`rbtPayHolds.test.ts`). |

### Slice 8 — Hygiene (can parallel late) — **DONE (Studio-lane files, 2026-08-12)**

| | |
|--|--|
| **Work** | PHI-safe logging; prefer scheduled `sessionId` over findOrCreateClient in LIVE path; document demo seed limits |
| **Success** | Server logs ids only; LIVE submit attaches to Case Coord session when UUID provided |
| **Progress** | Studio-lane server actions log `error.message`/ids only. Submit resolves the scheduled Session **first** and takes its `clientId` as authoritative; `findOrCreateClient` → `resolveSubmitClient` never auto-creates clients outside the dev-tools sandbox. Gap-10 identity: Studio fetches + passes explicit `rbtUserId` (`getActingRbtForStudio`), server re-verifies against the device/auth session and rejects mismatches vs `Session.rbtId`; no first-active-RBT fallback in prod. Demo seed limits documented below. |

**Demo seed (DevTools):** `devSeedConnectedProductDemo` in CRM + HRM DevTools — buttons **Seed staffing** / **Seed Studio→payroll**. Playbook pointer: [`2026-08-11-bridge-efg-manual-qa-checklist.md`](./2026-08-11-bridge-efg-manual-qa-checklist.md) §Preconditions. Limits: skips real intake; idempotent on `demo.studio.learner@riseandshine.local`; gated by `NEXT_PUBLIC_ENABLE_DEV_TOOLS` + non-production only.

---

## 4. Success criteria (rollup)

- [x] SoT MUST columns exist in DB + Prisma client. *(SQL applied 2026-08-12 via schema-parity backfill)*
- [x] Claim-ready submit writes `structuredContent` + `checklistSnapshot` + `billableUnits` + signer audit.
- [x] Modalities: DTT durable when targets real; ABC → `BehaviorLog`; others at least in JSON. *(HRM Slice 2)*
- [x] `isConverted` still requires signatures **and** green checklist snapshot. *(Slice 3, 2026-08-12)*
- [x] BCBA queue shows structured/checklist context before e-sign. *(Slice 5)*
- [x] Payroll uses persisted units; unsigned = hold (Bridge G). *(Slice 7, 2026-08-12)*
- [ ] Manual QA checklist E→F→G still green end-to-end. *(re-run pending after 2026-08-12 changes)*
- [x] No Plutus EDI; no EVV aggregator; no Motivity `/rbt/simulation` rewrite.
- [x] `AuditLogVault` wired: VIEW (BCBA sign-queue load), SIGN (RBT submit + BCBA e-sign), CONVERT (Plutus). *(gap 12; `/api/generate-report` EXPORT audit is a follow-up in the auth-guard lane)*

---

## 5. Explicit non-goals

| Out of scope | Why |
|--------------|-----|
| Real EDI / Plutus API / clearinghouse | Bridge F = manual tracker |
| State EVV aggregator submission | Capture only |
| Multi-learner CPT (97154 / 97158) | V1 is 1:1 |
| DocuSign-grade crypto e-sign | Typed-name + timestamps |
| Replacing `/rbt/simulation` Motivity engine | Training stays separate |
| Reopening ATS / job-board BRIDGE_V1 polish | Freeze |
| Inventing PRODUCT.md / BUILD.md stub content | LIBRARY |
| Changing Bridge E activate rules | Already shipped |

---

## 6. Alignment with Bridges F/G (do not break)

```text
RBT Studio submit  →  rbtSigned (+ structured/checklist)
        ↓
BCBA e-sign         →  bcbaSigned  (CRM workstation)
        ↓
/notes convert      →  isConverted (+ claim ref)   [F]
        ↓
HRM payroll         →  payable iff bcbaSigned|converted  [G]
```

| Rule | Owner |
|------|--------|
| Never activate client from Studio or job-board accept | Bridge E / Case Coord only |
| Never set `isConverted` from HRM | Bridge F |
| Never pay Incomplete / unsigned | Bridge G |
| Studio attaches to scheduled therapy session when possible | Bridge E session id |

---

## 7. Suggested implementation order (one PR stream)

1. Slice 0 (SQL + Prisma) — blocked on human SQL apply  
2. Slices 1 → 3 (structured + modalities + checklist gate)  
3. Slice 4 (`IN_PROGRESS`)  
4. Slices 5 → 6 (BCBA + Plutus fields)  
5. Slice 7 (payroll units)  
6. Slice 8 (hygiene)  
7. Re-run [`2026-08-11-bridge-efg-manual-qa-checklist.md`](./2026-08-11-bridge-efg-manual-qa-checklist.md)

Skills when coding: **hrm-app-map**, **crm-app-map** (notes/sign), **server-action-pattern**, **supabase-migration-generator**, **verification-before-completion**.

---

## Document control

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-08-11 | Initial implementation plan from SoT + live Studio gaps |
| 1.1 | 2026-08-11 | Slice 0–1: SQL file + Prisma mirror + Studio structured submit |
| 1.2 | 2026-08-11 | Slice 2: modality snapshot + SessionTrialData/BehaviorLog persist + Collect UI |
| 1.3 | 2026-08-12 | Slices 3–8 closed: checklist convert gate (`noteConvertGate`), BCBA sign parity + role guards, payroll note-units + DB-backed holds, gap-10 RBT identity hardening (explicit `rbtUserId`, no prod client auto-create), AuditLogVault VIEW/SIGN/CONVERT wiring |
