# Live Data Quality Report — Development Database

**Run date:** 2026-08-12  
**Snapshot:** 2026-08-12T08:34:36.897Z → 2026-08-12T08:34:38.968Z  
**Target:** Workspace development `DATABASE_URL` (`current_database() = postgres`)  
**Checker:** `node scripts/verify-data-integrity.mjs`  
**Result:** **FAIL — 3 row-level violations across 2 of 8 checks**

## Current verification — 2026-09-07

All eight integrity categories now pass against `Simple_RAS_CRM_DEV`. The final DQ1
finding was three distinct clients sharing a recognized two-character placeholder in
`Client.medicaidId`; guarded SQL
[`2026-09-07-200123Z-null-placeholder-medicaid-ids.sql`](../../sql/2026-09-07-200123Z-null-placeholder-medicaid-ids.sql)
converted only those three placeholder values to `NULL`. Independent post-check:
three guarded rows, three null values, zero recognized placeholders.

The separate `verify-no-demo-data.mjs` cutover gate intentionally remains red while
the designated Studio learner is `ACTIVE` for sandbox workflow testing. It is not an
integrity-check failure and must be cleared only before activating a real cohort.

## Read-only evidence

- The checker used one pooled connection.
- `default_transaction_read_only=on` and `transaction_read_only=on` were verified before the first check and again after the final check.
- The pooler did not honor the startup GUC by itself, so the checker issued the exact session-local safety command `SET default_transaction_read_only = on` before Prisma received the connection.
- Every data-quality statement was guarded as `SELECT`, `SHOW`, or `WITH ... SELECT`; no DDL, DML, row locks, cleanup, or automatic repair ran.
- Output is limited to record IDs and invariant reasons; no names, emails, payer/member identifiers, or clinical content are included.

## Check results

- **DQ1 PASS — duplicate supposedly-unique business records:** 0
- **DQ2 PASS — orphan-like or semantically invalid references:** 0
- **DQ3 PASS — `COMPLETED` Session without SessionNote:** 0
- **DQ4 FAIL — converted note integrity:** 2
- **DQ5 PASS — PA/auth invalid windows or negative units:** 0
- **DQ6 PASS — `HIRED` RBT candidate without valid RBT User:** 0
- **DQ7 FAIL — `ACTIVE` Client missing Bridge E requirements:** 1
- **DQ8 PASS — duplicate open EVV logs:** 0

## Violations

### DQ4 — converted SessionNote integrity

1. `SessionNote` `835cedd7-6c8f-488a-8eef-73f9d8756ada`  
   Session: `89b5b721-3271-4d21-807c-45707c4f9826`  
   Missing/invalid: `rbtSignedAt`, `bcbaSignedAt`, `rbtSignerName`, `bcbaSignerName`, `plutusClaimRef`, `convertedAt`, and a green `checklistSnapshot.passed`.

2. `SessionNote` `317fe47d-eed7-4a2b-bbfb-885a94ec0230`  
   Session: `cf671ec8-8b3f-4a25-aba0-a2cde9af0dfa`  
   Missing: `bcbaSignedAt`, `bcbaSignerName`, and `plutusClaimRef`.

### DQ7 — ACTIVE Client / Bridge E

1. `Client` `6585876c-351d-4277-be13-77628acf7b8b`  
   Existing related assignment ID: `92cba35f-f00e-4be8-9de2-cc9b3e93d669`  
   Missing/invalid: `rbtId` and a durable, assigned, non-97151 `Session` in `SCHEDULED`, `IN_PROGRESS`, or `COMPLETED`.

## Cleanup guidance — comments only

```sql
-- DQ4: Reconcile each note against Plutus and AuditLogVault before changing claim state.
-- DQ4: Correct signature metadata/reference through an audited staff workflow.
-- DQ4: If un-conversion is required, use an approved audited workflow, then re-submit/re-sign/re-convert.
-- DQ4: Do not invent signer identity, timestamps, checklist results, or a Plutus reference.

-- DQ7: Ops/Case Coord should review the Client activation history and intended assignments.
-- DQ7: Restore a verified active RBT assignment and a real assigned therapy Session, or intentionally
-- DQ7: move the Client out of ACTIVE through the approved lifecycle workflow.
-- DQ7: Do not fabricate a Session or assignment solely to make this report pass.
```

## Scope definitions

- Duplicate checks normalize case/whitespace/punctuation for staff and candidate emails, candidate BACB numbers, client Medicaid and payer/member identifiers, probable client identity (name + DOB), PA/auth references, case codes, and multiple open listings for one client.
- Orphan-like checks cover high-risk client/staff assignments, Sessions and notes, PA/auth rows, CPT lines, trial/behavior links across clients, EVV, RBT onboarding, re-auth links, schedule rows, ATS candidate/user links, onboarding packets, openings, and applications.
- The `HIRED` check is intentionally scoped to candidates whose `appliedRole` is `RBT`; BCBA hires are not expected to link to an RBT-role User.
- The `ACTIVE` check mirrors Bridge E: active RBT + BCBA assignments and a durable assigned non-assessment Session.
- Results are point-in-time. A clean check does not replace owner review, payer-source validation, or database constraints.
