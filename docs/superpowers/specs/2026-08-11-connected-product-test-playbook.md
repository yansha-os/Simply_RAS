# Connected Product — Test Playbook

**Version:** v2 — 2026-08-12  
**Status:** Manual runbook (one shared DB, both apps)  
**Purpose:** Walk the connected CRM ↔ HRM product once — SQL → apps → intake → staffing → ACTIVE → Studio note → BCBA sign → Plutus tracker → payroll — plus the new production gates (link expiry, auth-unit hard stop, credential warnings, audit vault, health probes).

**Detail click-paths (Bridges E–G):** [`2026-08-11-bridge-efg-manual-qa-checklist.md`](./2026-08-11-bridge-efg-manual-qa-checklist.md)  
**Spine / status enum:** [`2026-08-11-aba-crm-hrm-spine-roadmap.md`](./2026-08-11-aba-crm-hrm-spine-roadmap.md)  
**SQL index:** [`docs/sql/README.md`](../../sql/README.md)

---

## 0. Do this tonight (7 steps)

1. Paste the **seven** `docs/sql/` scripts below into Supabase SQL Editor **in order**; confirm no errors.
2. In Supabase Storage, confirm a **private** bucket named **`client-documents`** exists (parent doc uploads land there; uploads 500 without it).
3. Start **CRM :3000** and **HRM :3001** against the **same** `DATABASE_URL`; hit `http://localhost:3000/api/health` and `http://localhost:3001/api/health` — both must return `{"ok":true,...,"db":"ok"}`.
4. With `NEXT_PUBLIC_ENABLE_DEV_TOOLS=true`, open CRM or HRM DevTools → **Seed Studio→payroll (ACTIVE + session)** (ACTIVE + scheduled 97153). Use DevTools **role impersonation** for role switching — the email-pattern login shortcuts are dev-gated and real login is rate-limited (5 attempts / 15 min per email+IP).
5. Walk one client **Inquiry → … → `STAFFING_PENDING`** only if you need the honest intake path (optional when using the seed).
6. Staff via job board (optional secondary) → or from the seed go: HRM `/rbt/schedule` clock-in → Studio submit → CRM BCBA e-sign → `/notes` Plutus → HRM `/rbt/payroll` **Payable**.
7. Run the **gate & negative checks** (section 4) — these are the new v2 surfaces — then re-run the smoke table in the [Bridge E–F–G checklist](./2026-08-11-bridge-efg-manual-qa-checklist.md) if anything fails.

**Primary test path:** DevTools **Seed Studio→payroll** → HRM Schedule → Studio → CRM e-sign → Plutus → payroll. Detail click-paths remain in Bridges E–G checklist.

**Route ownership change:** the RBT portal and HR portal live in **HRM only** now. CRM `/rbt/*` redirects to HRM `/rbt/*` (same path shape); CRM `/portal-hr/*` redirects to HRM `/hr-dashboard`, `/ats`, `/payroll`, or `/session-emr`. Any old step pointing at a CRM `/rbt` or `/portal-hr` page should land you on `:3001`.

---

## 1. SQL to run (ordered)

Paste into the **Supabase SQL Editor** only. Do **not** run `prisma migrate` / `db push` against live DB.

| Order | File | What it adds |
|------:|------|--------------|
| 1 | [`docs/sql/2026-08-11-case-opening-marketplace.sql`](../../sql/2026-08-11-case-opening-marketplace.sql) | `CaseOpening` + `CaseApplication` (+ enums) — staffing marketplace |
| 2 | [`docs/sql/2026-08-11-case-opening-listing-enrichment.sql`](../../sql/2026-08-11-case-opening-listing-enrichment.sql) | Listing fields on `CaseOpening` + RBT home zip / travel miles |
| 3 | [`docs/sql/2026-08-11-session-note-structured-fields.sql`](../../sql/2026-08-11-session-note-structured-fields.sql) | Session Studio Slice 0 — `SessionNote` structured/signer/tracker cols, `Session.placeOfServiceCode`, `SessionStatus.IN_PROGRESS` |
| 4 | [`docs/sql/2026-08-12-staff-message.sql`](../../sql/2026-08-12-staff-message.sql) | `StaffMessage` table (staff chat / case-coord messaging) |
| 5 | [`docs/sql/2026-08-12-schema-parity-backfill.sql`](../../sql/2026-08-12-schema-parity-backfill.sql) | Schema-parity backfill — enum values, EMR/messaging/notification tables, **`AuditLogVault`**, ATS base tables. No-op where the live DB already has them |
| 6 | [`docs/sql/2026-08-12-magic-link-expiry.sql`](../../sql/2026-08-12-magic-link-expiry.sql) | `magicLinkExpiresAt` / `magicLinkRevokedAt` on `IntakePacket` + `CandidateOnboardingPacket` (30-day expiry / revocation) |
| 7 | [`docs/sql/2026-08-12-session-indexes.sql`](../../sql/2026-08-12-session-indexes.sql) | `Session` hot-path indexes (`clientId+scheduledStart`, `rbtId+scheduledStart`) |

**Prerequisites:** Base schema / numbered archive under `prisma/migrations/` (`01`–`15`) already applied on this DB, **and** a private Supabase Storage bucket **`client-documents`** (uploads write `{clientId}/...` paths there; reads go through `/api/documents` signed URLs).

**After SQL:** `npx prisma generate` locally if the client is stale — client only, no DB write.

Canonical ordered list also lives in [`docs/sql/README.md`](../../sql/README.md) → **Run these for connected product**.

---

## 2. Env & apps

| App | Port | Package | Dev |
|-----|------|---------|-----|
| **CRM** | **3000** | `apps/crm` | `npm run dev` → `next dev -p 3000` |
| **HRM** | **3001** | `apps/hrm` | `npm run dev` → `next dev -p 3001` |

| Requirement | Notes |
|-------------|--------|
| Shared Postgres | Both apps must use the **same** database (session pooler URL is fine for app runtime). |
| Env | Names only — see stub [`docs/ENV.md`](../../ENV.md). Typical: `DATABASE_URL`, Supabase/auth keys, `NEXT_PUBLIC_HRM_URL` / `NEXT_PUBLIC_CRM_URL` for cross-app redirects + notification links. **No secrets in docs.** |
| Storage | Private bucket `client-documents` + `SUPABASE_SERVICE_ROLE_KEY` configured, or parent uploads fail with "Storage is not configured". |
| Roles | **DevTools role impersonation** (`dev_impersonate_role` cookie) for Case Coord, BCBA, Billing, RBT. The `hr@`/`rbt@`/`bcba@`-style email shortcuts on `/login` only work when dev tools are enabled. |
| Login | Rate-limited: 5 attempts / 15 min per email+IP → "Too many sign-in attempts. Please try again later." Don't burn attempts testing bad passwords mid-run. |
| Auth | Hired RBT user for Studio + payroll; BCBA for Daily Workstation; Billing for `/notes` and `/portal-billing`. |

---

## 3. End-to-end walkthrough

Status spine (authoritative):

```text
INQUIRY → MAGIC_LINK_SENT → DOCS_SUBMITTED → DOCS_APPROVED_INTAKE
→ CLINICAL_REVIEW_APPROVED → VOB_COMPLETED → PA_SUBMITTED → PA_APPROVED
→ ASSESSMENT_SCHEDULED → REPORT_ASSEMBLED → TX_PA_SUBMITTED → TX_PA_APPROVED
→ STAFFING_PENDING → ACTIVE → DISCHARGED
```

### A. Intake → authorized → staffing-ready (CRM :3000)

| Step | What to do | Pass |
|------|------------|------|
| 1 | Create / open inquiry client; send magic link (copy-link OK). Links now carry a **30-day expiry** and are **revocable**. | Packet / docs path works |
| 2 | Open the link as the parent. First open **binds the device** (fingerprint cookie); the form validates server-side on submit — an incomplete packet returns "Almost there — N required item(s) are still missing" with per-field/doc missing lists, and uploads land in the private `client-documents` bucket. | Complete packet → `DOCS_SUBMITTED`; incomplete submit is rejected with the missing list |
| 3 | Intake approve → Clinical review. To exercise the **rejected-doc loop**: reject one document with a reason → parent portal shows the rejection → parent re-uploads → resubmit clears `rejectionDetails` and returns the packet to `SUBMITTED`. | Status advances honestly; rejection loop round-trips |
| 4 | Billing: VOB + Assessment PA — work the queue at `/portal-billing/clients` (approve / deny; clinical denials open the **P2P** loop, see G9). Dashboard `/portal-billing` is analytics only. | `PA_APPROVED` (or equivalent stage) |
| 5 | BCBA: assessment / TP / parent typed sign / report as your build supports. | Toward Treatment PA |
| 6 | Billing: Treatment PA submit/approve (manual tracker). | `TX_PA_APPROVED` |
| 7 | Case Coord: handoff → **`STAFFING_PENDING`**. Assign supervising **BCBA** (`bcbaId`). | Status = `STAFFING_PENDING`; BCBA set |

Do **not** expect `ACTIVE` from CD assign or staffing alone.

### B. Job board staffing (CRM ↔ HRM)

| Step | App | What to do | Pass |
|------|-----|------------|------|
| 8 | CRM | Client **Scheduling & Job Board** — post / open `CaseOpening`. | Opening `OPEN` |
| 9 | HRM | Hired RBT → `http://localhost:3001/rbt/job-board` → apply. (Typing the old CRM `/rbt/job-board` URL must bounce you here.) | Application visible |
| 10 | CRM | **Parent likes → assign**. | RBT on client; opening `FILLED`; status still **`STAFFING_PENDING`** |

### C. First session → ACTIVE (Bridge E)

| Step | App | What to do | Pass |
|------|-----|------------|------|
| 11 | CRM | **Schedule therapy session (97153)** under First Session & Activate. | Durable `Session` (not `97151`); status still `STAFFING_PENDING` |
| 12 | CRM | **Activate after first session**. | `Client.status = ACTIVE` |

Full asserts / negatives → Bridge E section of the [QA checklist](./2026-08-11-bridge-efg-manual-qa-checklist.md).

### D. Studio note → BCBA → Plutus → payroll (Bridges F–G)

| Step | App | What to do | Pass |
|------|-----|------------|------|
| 13 | HRM | `/rbt/schedule` → **EVV Start Session →** (clock-in). | `Session.status = IN_PROGRESS` + `actualStart`; re-clicking clock-in is **idempotent** (no duplicate EVV rows, timestamps preserved) |
| 14 | HRM | `/rbt/session/[sessionId]` → complete Studio (collect → note → sign) → claim-ready submit. Submit is **one transaction** — session completion, note, trials, checklist snapshot land together or not at all. | `rbtSigned`; `bcbaSigned=false`; `isConverted=false`; `checklistSnapshot` frozen green |
| 15 | HRM | Re-open the same session and **resubmit** with edited trial data. | Prior trial rows are **replaced, not duplicated** |
| 16 | HRM | `/rbt/payroll` | Session **held** (awaiting BCBA); rows are DB-backed (no localStorage) with a **unit source badge**: "Note units" (from the signed note) or "Estimated" |
| 17 | CRM | `/portal-clinical/daily` → **E-Sign Note** (or Batch E-Sign). If the signing BCBA or session RBT has an expired/missing credential, a **non-blocking credential warning** toast appears. | `bcbaSigned=true`; `AuditLogVault` gets a `SIGN` row |
| 18 | HRM | Refresh `/rbt/payroll` | **Payable**, badge "Note units" |
| 19 | CRM | `/notes` → **Mark sent to Plutus (manual tracker)**. Convert is gated: RBT + BCBA signatures **and** a green `checklistSnapshot` **and** the auth-unit hard stop (G4). | `isConverted=true`; `AuditLogVault` gets a `CONVERT` row |

---

## 4. Gate & negative checks (new in v2)

Each of these is a concrete browser check against a gate that shipped 2026-08-12. Run with dev tools enabled.

| # | Check | How | Pass |
|---|-------|-----|------|
| G1 | Health endpoints | GET `:3000/api/health` and `:3001/api/health` | `{"ok":true,"app":"crm"...}` / `"app":"hrm"`, `"db":"ok"`, HTTP 200 (503 = DB probe failed) |
| G2 | Magic-link expiry / revocation screen | Set the packet's `magicLinkExpiresAt` to the past (or `magicLinkRevokedAt = now()`) in SQL, reload the link | Amber **"This Link Is No Longer Active"** screen ("This link has expired/has been revoked… contact the clinic"), no form rendered |
| G3 | Device lock | Open a bound magic link from a second browser / incognito | Red **"Device Locked"** screen; parent server actions also refuse ("locked to the device that first opened the link") |
| G4 | Auth-unit hard stop | On `/notes`, convert a note whose units exceed the client's remaining authorized units for that CPT/auth window | Blocked: "Auth-unit hard stop: X unit(s) remaining for CPT … — converting would overbill…". Non-leadership sees "A Billing / Finance / CEO override is required." As BILLING/FINANCE/CEO, override **requires a reason** and writes an `OVERRIDE` / `AUTH_UNIT_HARD_STOP_OVERRIDE` audit row with the numbers |
| G5 | Convert gate order | Try converting before BCBA sign, then with a failed/missing checklist | "BCBA e-sign required…", "RBT signature required…", or "Billing checklist snapshot missing / failed at RBT submit — cannot convert" |
| G6 | Credential warnings | Expire a staff credential (`StaffCredential`), then BCBA-sign or convert a note for that staff | Action **succeeds** with a warning naming the staff + credential issue (soft gate — warn, never block) |
| G7 | Login rate limit | 5 failed logins for one email, then a 6th | "Too many sign-in attempts. Please try again later." (generic on purpose) |
| G8 | Audit-log spot check | `npx prisma studio` → `AuditLogVault`, or SQL: `select action, "resourceType", "resourceId", timestamp from "AuditLogVault" order by timestamp desc limit 20;` | Rows for `VIEW` (chart opens), `SIGN` (step 17), `CONVERT` (step 19), plus `OVERRIDE` if you ran G4 |
| G9 | PA queue deny → P2P | `/portal-billing/clients` queues: deny a PA as **clinical** with a reason | Reason lands in `p2pNotes`, `p2pResolved=false`; BCBA P2P queue on `/portal-clinical` picks it up; billing can log the P2P resolution afterward |
| G10 | Sandbox cohort QA | Follow [`2026-08-11-ras-sandbox-cutover-checklist.md`](./2026-08-11-ras-sandbox-cutover-checklist.md) | Complete the ≥10-note clinical/billing review and record the written go/no-go outside RAS. The retired `/portal-billing/audit` dual-run worksheet must not be expected. |
| G11 | Cross-app notification links | Trigger a notification whose target lives in the other app (e.g. "note awaiting BCBA sign" seen from HRM) | Bell link resolves to the **owning app's** absolute URL (e.g. `:3000/portal-clinical/...` from HRM, `:3001/rbt/payroll` from CRM) — full navigation, no 404 |
| G12 | HRM mock KPI routes dev-gated | Open HRM `/payroll` and `/hr-dashboard` with dev tools **off** | The mock Payroll & Benefits / HR analytics KPI views do **not** render; you get the live-data pointer page instead. With dev tools on, the mock views render (labeled dev/demo) |

---

## 5. Pointers — Bridge E / F / G checklist

Use [`2026-08-11-bridge-efg-manual-qa-checklist.md`](./2026-08-11-bridge-efg-manual-qa-checklist.md) for:

- Preconditions and DB field checks  
- Happy path **and** negatives (job-board must not activate; convert blocked before BCBA sign)  
- Route / component quick reference  
- End-to-end smoke table (rows 1–8)

This playbook is the **product-wide** path (intake → payroll). That checklist is the **deep** Bridges E–G pass/fail. Where the checklist still names CRM `/rbt/*` or `/portal-hr/*` routes, read them as their HRM `:3001` equivalents (see section 0).

Related (not required for tonight’s smoke):

| Doc | When |
|-----|------|
| [`2026-08-11-aba-session-note-data-collection-spec.md`](./2026-08-11-aba-session-note-data-collection-spec.md) | Clinical field SoT for Studio |
| [`2026-08-11-session-studio-implementation-plan.md`](./2026-08-11-session-studio-implementation-plan.md) | Studio slices still shipping |
| [`2026-08-11-aba-emr-artemis-replacement-roadmap.md`](./2026-08-11-aba-emr-artemis-replacement-roadmap.md) | Full enclosed EMR / Artemis replacement |
| [`2026-08-11-ras-sandbox-cutover-checklist.md`](./2026-08-11-ras-sandbox-cutover-checklist.md) | Authoritative sandbox QA and cold-cutover go/no-go process (G10) |

---

## 6. Known gaps — do not expect yet

| Do **not** expect | Reality today |
|-------------------|---------------|
| Full **Artemis** clinical replacement | Chart modules, sandbox QA, cold cutover, and SOP purge remain governed by the roadmap/cutover checklist; not this smoke. No legacy-system dual-run worksheet exists in RAS. |
| Real **EDI** / Plutus API / clearinghouse | Billing = **manual** Plutus tracker (`isConverted` + claim ref). EDI stubs are P3-optional |
| State **EVV aggregator** submission | Capture / Studio clock only (clock-in → `IN_PROGRESS` is honest and idempotent, but nothing is submitted upstream) |
| DocuSign-grade crypto e-sign | Typed-name + timestamps OK; credential checks on sign are **warnings**, not blocks |
| CRM-side RBT / HR portals | Gone by design — CRM `/rbt/*` and `/portal-hr/*` only redirect to HRM |
| Production email for magic link | Copy-link remains valid (now with 30-day expiry + device binding) |
| Reopening ATS applicant cycle | Marked COMPLETE — freeze unless regressions |

If a portal looks “Artemis-grade” but is labeled stub / aspirational — treat as non-blocking for this playbook.

---

## Document control

| Version | Date | Notes |
|---------|------|-------|
| 1 | 2026-08-11 | Initial connected-product test playbook |
| 2 | 2026-08-11 | Connected Loop board (`/dev/connected-loop`) as unison view |
| 3 | 2026-08-11 | Removed loop board; primary path is DevTools Seed Studio→payroll click-path |
| v2 rewrite | 2026-08-12 | Product-wide v2 pass: HRM-only RBT/HR routes (CRM redirects), magic-link 30-day expiry + device fingerprint + validated submit + rejected-doc loop, private `client-documents` bucket, login rate limit + DevTools impersonation, convert gates (signatures + checklist + auth-unit hard stop w/ BILLING/FINANCE/CEO override), transactional Studio submit + idempotent EVV/resubmit, DB-backed payroll units (NOTE/ESTIMATE badges), new section 4 gate checks (health, audit vault, PA P2P, dual-run audit, cross-app notifications, dev-gated HRM KPIs) |
