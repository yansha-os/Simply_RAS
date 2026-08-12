# Data-integrity remediation analysis — development database

**Date:** 2026-08-12  
**Mode:** Read-only evidence collection; no database repair applied  
**Target:** Workspace development `DATABASE_URL` (`current_database() = postgres`)  
**Companion SQL:** [`../../sql/2026-08-12-dev-data-integrity-repair.sql`](../../sql/2026-08-12-dev-data-integrity-repair.sql)

## Outcome

All three reported violations resolve to conclusively non-production artifacts:

- `SessionNote` `317fe47d-eed7-4a2b-bbfb-885a94ec0230` is **designated demo data**.
- `SessionNote` `835cedd7-6c8f-488a-8eef-73f9d8756ada` is a **legacy dev-only auto-convert artifact**.
- `Client` `6585876c-351d-4277-be13-77628acf7b8b` is the isolated legacy Studio Client that owns the preceding note, so its Bridge E failure is part of the same artifact.

No row in this three-violation set remains potentially real/unknown at the inspected snapshot. The SQL is therefore available, but it is guarded so any changed predicate reclassifies the row as unsafe and aborts the transaction.

## Read-only controls and baseline

The detailed inspection used one `pg` connection with startup option
`-c default_transaction_read_only=on`, then issued the same session-local setting before
opening `BEGIN READ ONLY`. Both
`default_transaction_read_only=on` and `transaction_read_only=on` were verified before and
after the evidence queries. Queries returned IDs, state, timestamps, counts, and marker
booleans; they did not return names, DOBs, signer values, or clinical content.

The requested baseline rerun was:

- Command: `node scripts/verify-data-integrity.mjs`
- Window: `2026-08-12T08:50:00.599Z` to `2026-08-12T08:50:21.686Z`
- Guard: `default_transaction_read_only=on`; `transaction_read_only=on`
- Result: expected **FAIL**, exit `1`
- DQ4: 2 violations, the same two note IDs
- DQ7: 1 violation, the same Client ID
- DQ1, DQ2, DQ3, DQ5, DQ6, and DQ8: pass
- No database changes were made.

## Classification evidence

### Designated demo note

Record chain:

- Note `317fe47d-eed7-4a2b-bbfb-885a94ec0230`
- Session `cf671ec8-8b3f-4a25-aba0-a2cde9af0dfa`
- Client `56b64754-ed58-4dab-b8f4-5700893a02a0`
- Session RBT User `7188d6b9-77c3-4ba3-a742-7b3ef2bcb8dd`
- Session BCBA User `92cba35f-f00e-4be8-9de2-cc9b3e93d669`
- Demo PA request `b714d58b-9ef0-464d-a869-b4b0651f066f`

Conclusive demo markers:

- The Client matches the designated demo guardian marker.
- `Client.treatmentPlan.__devSeed.kind` matches the connected-product Studio seed.
- The related PA carries the designated demo authorization marker.
- The note's structured JSON contains demo-only `t#`/`b#` target IDs.
- These markers are the fenced values documented in
  [`2026-08-12-demo-data-verification.md`](./2026-08-12-demo-data-verification.md) and written
  by `devSeedConnectedProductDemo` in both CRM and HRM Dev Tools.

Integrity state:

- RBT and parent flags have corresponding timestamp/name presence.
- `bcbaSigned=true`, but both BCBA signature-audit fields are absent.
- `isConverted=true` and `convertedAt` is present, but the Plutus reference is absent.
- The frozen checklist says passed even though the payload contains demo-only target IDs.
- No open deficiency exists.
- No `AuditLogVault` row exists for the note. The vault contained zero rows globally at this snapshot, so it cannot validate any signature or conversion.

Code-path interpretation:

- The legacy Case Pipeline `collectSignature` action still writes the BCBA boolean without
  signer metadata.
- The in-tree manual tracker action can write `convertedAt` while leaving an omitted claim
  reference null.
- This state is therefore consistent with demo QA passing through those transitional paths;
  no missing signer or claim value can be reconstructed safely.

Classification: **designated demo data**.

Valid remediation: unconvert and return to review. The guarded SQL preserves the existing
clinical payload and supported RBT/parent attestations, clears the unsupported BCBA flag and
claim handoff, and removes the stale checklist freeze. Current workflow must then re-submit
and re-review before any future conversion. It does not invent a signer, timestamp,
checklist result, or Plutus reference.

### Legacy auto-convert note and ACTIVE Client

Record chain:

- Client `6585876c-351d-4277-be13-77628acf7b8b`
- Session `89b5b721-3271-4d21-807c-45707c4f9826`
- Note `835cedd7-6c8f-488a-8eef-73f9d8756ada`
- Session RBT User `7188d6b9-77c3-4ba3-a742-7b3ef2bcb8dd`
- Client BCBA User `92cba35f-f00e-4be8-9de2-cc9b3e93d669`

The DQ7 `related` value is the Client's BCBA User ID. It is not an RBT assignment record.
The Client has no `rbtId`; its sole Session has an RBT but no `bcbaId`, so copying either
value across records would infer staffing facts and is not a valid repair.

Conclusive legacy/dev evidence:

- The Client matches the hard-coded legacy Studio identity and its exact fallback marker.
- That fallback can create a Client only when Dev Tools are enabled.
- Client, Session, and note were created as one burst: Session 80 ms after Client and note
  48 ms after Session.
- The only Session has zero scheduled and actual duration.
- The note has the exact deleted CRM auto-convert fingerprint:
  `rbtSigned=true`, `parentSigned=true`, `isConverted=true`, with no structured content,
  checklist, units, signature metadata, conversion timestamp, or Plutus reference.
- The Client has no contact/payer identifiers, intake packet, PA/auth, documents, messages,
  contact logs, action items, targets, appointments, re-auth, onboarding, or case opening.
- It owns exactly this one Session and one note. Those rows have no trials, behavior logs,
  EVV, deficiencies, direct Client notification link, or related audit row.

The fingerprint matches the deleted
`apps/crm/src/app/actions/sessionEmrActions.ts`, whose legacy submit created a completed
Session and immediately created an already-converted note with only RBT/parent booleans.
The hard-coded Studio caller and dev-only fallback remain visible in the HRM tree history.

Classification: **legacy dev-only auto-convert artifact**, not a real Bridge E client.

Valid remediation: delete the isolated Client and its exactly checked one-Session/one-note
cascade. This removes both the DQ4 note and DQ7 Client without fabricating staffing,
a rendered visit, signatures, or clinical facts. If any related record or state differs at
apply time, the SQL raises and rolls back instead of deleting.

## Guarded SQL behavior

[`2026-08-12-dev-data-integrity-repair.sql`](../../sql/2026-08-12-dev-data-integrity-repair.sql)
contains two idempotent operations:

1. Update the designated demo note into an unconverted review state.
2. Delete the isolated legacy Client after exact IDs, structural fingerprint, and
   zero-other-dependency predicates pass.

First-run expectations are one updated note and one deleted Client, with one Session and one
note removed by the checked cascade. A repeat expects zero changed rows because the demo
note is already in its post-state and the legacy Client is already absent.

The file includes preflight SELECTs, assertion-backed row counts, postflight SELECTs, and
targeted DQ4/DQ7 counts. It ends in `ROLLBACK` by default; pasting it unchanged is a dry run.
`docs/sql/README.md` was intentionally not edited.

An additional read-only mirror of the SQL's full first-run predicates returned exactly one
eligible designated-demo note and exactly one eligible legacy Client. The session guard
remained on before and after that validation.

## Human review and apply steps

1. Confirm the SQL Editor is connected to this development database, not production.
2. Confirm neither note represents an actual external Plutus entry. Do not infer this from
   the empty database reference alone; check the external tracker if one was used during QA.
3. Run the SQL file unchanged. Because its final statement is `ROLLBACK`, this is a dry run.
4. In preflight output, require the designated-demo fence and demo-target booleans to be
   true. Require all legacy isolation booleans to be true.
5. Require first-run notices to report note update `1` and Client delete `1`; postflight must
   show the demo note unconverted/BCBA-unsigned with checklist reset, legacy Client/Session/
   note counts `0`, and targeted DQ4/DQ7 counts `0`.
6. If any assertion raises or any output differs, execute `ROLLBACK;`, leave the SQL
   unapplied, and reclassify the changed row for human review.
7. To apply, change only the final `ROLLBACK;` to `COMMIT;` and rerun the entire file once.
8. After commit, run `node scripts/verify-data-integrity.mjs`. Expect the three targeted
   violations to be gone; a full PASS still depends on no concurrent/new violations.
9. Run `node scripts/verify-no-demo-data.mjs` separately before cohort activation. This
   repair intentionally does not move the otherwise valid designated demo Client out of
   `ACTIVE`, so that separate gate is expected to remain red until the documented demo
   fixture cleanup decision is applied.

Do not repair by copying the Session RBT onto the legacy Client, copying the Client BCBA onto
the zero-duration Session, inventing signer metadata, synthesizing a therapy Session, or
inventing a Plutus reference.
