# Architecture — Simple RAS CRM

Monorepo map for agents and humans. Product sequencing lives in the [spine roadmap](./superpowers/specs/2026-08-11-aba-crm-hrm-spine-roadmap.md).

## Monorepo layout

```text
apps/crm          Client product — intake → PA → Case Coord → openings
apps/hrm          HR product — ATS, RBT portal, hire cycle, job applications
packages/db       Shared Prisma client / schema (`@repo/db`)
packages/ui       Shared UI primitives
prisma/           Root schema + historical migration archive
docs/sql/         Canonical paste-ready SQL for Supabase
.agents/skills/   Project agent skills
```

| Lane | Owns | Does not own |
|------|------|--------------|
| **CRM** (`apps/crm`) | Clients, intake, clinical/BCBA, billing (manual Plutus tracker), Case Coord, case openings / job posts | ATS applicant lifecycle, RBT careers product, payroll product |
| **HRM** (`apps/hrm`) | ATS, applicants, RBT portal, hire → User, applications against CRM openings | Client clinical status, Treatment PA, Case Coord readiness |
| **Shared** | One Postgres DB (Prisma), `Notification` rows, `User` with role flags | Embedded HR suite inside CRM / embedded clinical suite inside HRM |

Cross-app collaboration is **data + notifications**, not embedded UI.

```text
CRM writes CaseOpening + clinical / PA status
HRM writes AtsCandidate hire + RbtJobApplication
Both read Notification for signed-in user
```

## Shared Postgres

- One database for CRM and HRM.
- Schema source of truth: `prisma/schema.prisma` and `packages/db/prisma/schema.prisma` (keep in sync / generate client as usual).
- Agents must **not** run `prisma migrate`, `prisma db push`, or any DDL against live DB.
- Developer applies SQL manually in the **Supabase SQL Editor**.

## SQL convention

| Path | Role |
|------|------|
| [`docs/sql/`](./sql/) | **Canonical** — future SQL only here (`YYYY-MM-DD-HHmmssZ-slug.sql`, real current UTC timestamp); README dependency order controls execution |
| [`prisma/migrations/`](../prisma/migrations/) | **Archive** — numbered history already referenced by Prisma config; do not add new files |

When changing schema: update Prisma → generate client if needed → write idempotent SQL under `docs/sql/` → wait for human confirmation before treating migration as applied.

Use skill **supabase-migration-generator** for the full workflow.

## Which skill when

| Situation | Skill |
|-----------|--------|
| Touching `apps/crm` broadly (portals, client profile, case openings) | **crm-app-map** |
| Touching `apps/hrm` broadly (ATS, RBT portal, onboarding, job board) | **hrm-app-map** |
| Intake status / magic link / FlowMap / intake docs | **intake-workflow-map** |
| Prisma schema / new SQL | **supabase-migration-generator** |
| New or changed server actions | **server-action-pattern** |
| Chat / help desk / messaging UI | **discord-imessage-chat-pattern** |
| Bug or “still broken” | **systematic-debugging** |
| Component shows wrong/stale UI | **nextjs-component-audit** |
| About to say “fixed” / “refresh” | **verification-before-completion** |

Hard rules (Prisma relation cardinality, button cursors, premium UI): root [`AGENTS.md`](../AGENTS.md).

## Spine roadmap

Authoritative CRM/HRM sequencing and freeze notes:

→ [docs/superpowers/specs/2026-08-11-aba-crm-hrm-spine-roadmap.md](./superpowers/specs/2026-08-11-aba-crm-hrm-spine-roadmap.md)

Clinical field rules for session notes / RBT data collection (Bridges E–G):

→ [docs/superpowers/specs/2026-08-11-aba-session-note-data-collection-spec.md](./superpowers/specs/2026-08-11-aba-session-note-data-collection-spec.md)

Connected product test playbook (SQL order + intake → payroll) · Manual QA Bridges E–G · Session Studio slices:

→ [docs/superpowers/specs/2026-08-11-connected-product-test-playbook.md](./superpowers/specs/2026-08-11-connected-product-test-playbook.md) · [docs/superpowers/specs/2026-08-11-bridge-efg-manual-qa-checklist.md](./superpowers/specs/2026-08-11-bridge-efg-manual-qa-checklist.md) · [docs/superpowers/specs/2026-08-11-session-studio-implementation-plan.md](./superpowers/specs/2026-08-11-session-studio-implementation-plan.md)

Enclosed clinical EMR / Artemis replacement (after notes SoT + Bridges E–G):

→ [docs/superpowers/specs/2026-08-11-aba-emr-artemis-replacement-roadmap.md](./superpowers/specs/2026-08-11-aba-emr-artemis-replacement-roadmap.md)

RAS sandbox → cold cutover (ops checklist):

→ [docs/superpowers/specs/2026-08-11-ras-sandbox-cutover-checklist.md](./superpowers/specs/2026-08-11-ras-sandbox-cutover-checklist.md)

Artemis exit & enclosed system (master roadmap — workflow, roles, Phase 0–4):

→ [docs/superpowers/specs/2026-08-19-artemis-exit-enclosed-system-roadmap.md](./superpowers/specs/2026-08-19-artemis-exit-enclosed-system-roadmap.md)

Whole-project production-readiness audit (scorecard, blockers, phased path to prod):

→ [docs/superpowers/specs/2026-08-12-production-readiness-gap-analysis.md](./superpowers/specs/2026-08-12-production-readiness-gap-analysis.md)
