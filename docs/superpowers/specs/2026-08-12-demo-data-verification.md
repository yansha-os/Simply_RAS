# Demo-data verification — read-only DB gate (2026-08-12)

Automates the Phase 1 checklist gate **"No demo targets / mock IDs on ACTIVE cohort clients"** from
[`2026-08-12-production-readiness-gap-analysis.md`](2026-08-12-production-readiness-gap-analysis.md) §7
(also Blocker 3's "assert no demo targets/mock IDs on ACTIVE clients" action).

- **Script:** [`scripts/verify-no-demo-data.mjs`](../../../scripts/verify-no-demo-data.mjs)
- **Run:** `node scripts/verify-no-demo-data.mjs` (repo root; needs `DATABASE_URL` in env or root `.env`)
- **Exit code:** `0` only when every check passes; `1` on any violation or query error (CI-friendly)
- **Safety:** SELECT-only queries via `@prisma/client` + `pg` adapter. Every connection also sets
  `default_transaction_read_only = on` as a startup option — verified to survive the Supabase session
  pooler (`SHOW default_transaction_read_only` → `on`), so the DB session itself rejects any write.

## When to run

1. **Before each cohort activation** (Phase 1 dual-run) — must be green before flipping any real client to `ACTIVE`.
2. **Before Phase B cutover** (write-freeze / Artemis SoT handoff for a cohort).
3. **Against the production DB env once one exists** — point `DATABASE_URL` at prod and run; the script never writes.
4. After any Dev Tools "Seed Studio" use, to confirm demo data stayed fenced to the demo learner.

## Marker inventory (derived from code, 2026-08-12)

| Marker | Value | Written by | DB location |
|---|---|---|---|
| Demo learner client | `guardianEmail = 'demo.studio.learner@riseandshine.local'` (case-insensitive) | `DEMO_STUDIO_GUARDIAN_EMAIL` in `apps/crm/src/app/actions/devTools.ts` + `apps/hrm/src/app/actions/devTools.ts` (`devSeedConnectedProductDemo`) | `Client.guardianEmail` |
| Seed JSON fence | `__devSeed` key (`kind: 'connected-product-studio'`) | same seed | `Client.treatmentPlan` JSON |
| Seeded PA / auth | `authNumber = 'DEV-TX-STUDIO'` (TREATMENT, APPROVED, 160 units) | same seed | `PARequest.authNumber` |
| Demo staff users | `demo.bcba.studio@riseandshine.local`, `demo.casecoord.studio@riseandshine.local`; `david.m@riseandshine.nyc` is protected seed staff | `ensureDemoUser` in both `devTools.ts` | `User.email` (expected; informational) |
| Demo Studio target ids | `/^[tb]\d+$/i` → `t1`–`t3`, `b1`–`b3` | `DEMO_TARGETS` / `DEMO_BEHAVIOR_TARGETS` + `isDemoStudioTargetId` in `apps/hrm/src/lib/sessionStudio.ts`; RBT opt-in "Dev: demo targets" button in `RbtSessionStudio` | JSON-only: `SessionNote.structuredContent` trials/probes `targetId`. Never `SessionTrialData` — `sessionEmrActions.ts` filters trial-row writes to real SkillTarget UUIDs. Claim-ready submit hard-blocks them (`sessionStudioClaimReady.ts` `DURABLE_TARGETS`); they persist only on Incomplete-path notes. |
| Demo target labels | exact `DEMO_TARGETS` / `DEMO_BEHAVIOR_TARGETS` labels (e.g. `Mand: request preferred item with “I want ___”`, `Elopement attempts`) | defensive check in case labels were ever synced into durable targets | `SkillTarget.title`, `BehaviorTarget.behaviorName` |
| Mock identity literal | `'mock-user-id'` | role-impersonation stub in `apps/crm/src/lib/auth.ts` + `apps/hrm/src/lib/auth.ts`; server actions guard against it | Physically impossible in uuid-typed FK columns (`User.id`, `Session.rbtId`, `Notification.userId`, `StaffMessage.senderId`, …). Text/JSON columns scanned: `User`(email/names), `Session`(location/cptCode), `SessionNote`(clinicalContent/structuredContent/checklistSnapshot/signer names/plutusClaimRef), `Notification`(title/message/linkUrl), `StaffMessage`(content). |
| HRM dev-skip artifacts | `formData.__devSkipped`, `OnboardingSignatureEvent.documentKey = 'dev-skip'`, `signerName 'DEV TOOLS'` | `devSkipApplicantRequirements` in `apps/hrm/src/app/actions/devTools.ts` | `CandidateOnboardingPacket.formData`, `OnboardingSignatureEvent` — applicant-side, no client PHI; counted informationally |

## Checks

- **A — ACTIVE cohort clean:** no `ACTIVE`-status client carries any demo marker. The demo learner itself
  being `ACTIVE` counts as a violation: the gate reads "no demo data on ACTIVE clients", and the demo
  client *is* demo data.
- **B — Non-demo clients clean (any status):** no demo marker on any client that isn't the demo learner
  (verifies the `assertDemoClientTarget` fence held historically).
- **C — Mock-id literals:** `'mock-user-id'` in text/JSON columns of `User`, `Session`, `SessionNote`,
  `Notification`, `StaffMessage`.
- **D — Census + containment:** ≤1 demo learner; every `DEV-TX-STUDIO` PA, `__devSeed` plan, and
  demo-`targetId` note attaches to the demo learner; demo staff users and HRM dev-skip artifacts listed
  informationally.

## Run record — 2026-08-12 (live dev DB, Supabase session pooler)

**Overall: FAIL — 1 violation (demo learner is ACTIVE). Checks B, C, D pass; containment holds.**

```text
== Demo-data verification (read-only) ==
Repo: C:\Users\azmrk\Documents\GitHub\Simple_RAS_CRM
Time: 2026-08-12T08:07:22.094Z

[FAIL] Check A — No demo markers on ACTIVE-status clients
    · ACTIVE clients scanned: 2
    !! Demo Studio Learner (Client 56b64754-ed58-4dab-b8f4-5700893a02a0) is the demo learner and is ACTIVE — demo client must not be in the ACTIVE cohort. Markers: guardianEmail='demo.studio.learner@riseandshine.local'; treatmentPlan.__devSeed; PARequest.authNumber='DEV-TX-STUDIO'; SessionNote demo t#/b# targetIds

[PASS] Check B — No demo markers on non-demo clients (any status)
    · Non-demo clients scanned (all statuses): 2

[PASS] Check C — No 'mock-user-id' literals in key tables
    · "User": scanned 3 text/JSON column(s)
    · "Session": scanned 2 text/JSON column(s)
    · "SessionNote": scanned 7 text/JSON column(s)
    · "Notification": scanned 3 text/JSON column(s)
    · "StaffMessage": scanned 1 text/JSON column(s)

[PASS] Check D — Demo-entity census + containment to demo learner
    · Demo learner clients: 1 [56b64754-ed58-4dab-b8f4-5700893a02a0 status=ACTIVE]
    · PARequest rows with authNumber='DEV-TX-STUDIO': 1
    · Clients with treatmentPlan.__devSeed: 1
    · SessionNotes containing demo t#/b# targetIds: 1
    · HRM dev-skip artifacts (informational): 1 OnboardingSignatureEvent 'dev-skip' row(s), 1 CandidateOnboardingPacket(s) with formData.__devSkipped

RESULT: FAIL — 1 violation(s)/error(s) across 1 check(s). See details above.
```

### Interpretation

The single violation is **expected in the current dev DB**: Dev Tools "Seed Studio (ACTIVE)" was used for
Bridge E–G QA, so the Demo Studio Learner (`56b64754-ed58-4dab-b8f4-5700893a02a0`) sits at `ACTIVE` with
its seeded `DEV-TX-STUDIO` auth and one Incomplete-path note containing demo `t#/b#` target ids. Nothing
leaked onto real clients (checks B and D green), and no `mock-user-id` literal persisted anywhere (check C).

For the Phase 1 gate to go green, the demo learner must leave `ACTIVE` before a real cohort is activated
(or the whole demo fixture set must be removed from that environment). A prod DB should show **zero** demo
entities in check D.

### Suggested cleanup (NOT executed — review, then run manually in Supabase SQL Editor)

```sql
-- OPTION 1 (minimal, reversible): take the demo learner out of the ACTIVE cohort.
-- Re-running Dev Tools "Seed Studio (ACTIVE)" will flip it back — fine for dev,
-- not for a prod-configured env.
--
-- UPDATE "Client"
-- SET status = 'DISCHARGED'
-- WHERE id = '56b64754-ed58-4dab-b8f4-5700893a02a0'
--   AND lower("guardianEmail") = 'demo.studio.learner@riseandshine.local';

-- OPTION 2 (full removal, e.g. before pointing this DB at real cohort work):
-- Client cascade deletes PARequest / IntakePacket / Session / SessionNote /
-- SkillTarget / BehaviorTarget rows (all onDelete: Cascade).
-- Leaves demo staff Users in place (harmless; also referenced elsewhere).
--
-- DELETE FROM "Client"
-- WHERE id = '56b64754-ed58-4dab-b8f4-5700893a02a0'
--   AND lower("guardianEmail") = 'demo.studio.learner@riseandshine.local';
```

After either option, re-run `node scripts/verify-no-demo-data.mjs` and expect `RESULT: PASS`, exit 0.
