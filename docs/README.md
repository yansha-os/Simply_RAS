# Docs — Simple RAS CRM

Entrypoint for architecture, SQL conventions, design specs, and agent skills.

## How this library works

→ **[`LIBRARY.md`](./LIBRARY.md)** — how agents/humans should use docs, **what to add**, **what NOT to add**, naming/placement, and maintenance. Read before creating or restructuring docs, specs, or skills.

## Start here

| Doc | Purpose |
|-----|---------|
| [LIBRARY.md](./LIBRARY.md) | Docs contribution rules — lean library, not a wiki |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Monorepo map (CRM vs HRM vs packages), shared Postgres, SQL convention, which-skill-when |
| [OPERATIONS.md](./OPERATIONS.md) | Ops runbook — deploy both apps, Supabase migration/backup/restore, monitoring, incident quick-reference |
| [AGENTS.md](../AGENTS.md) | Hard agent rules (Prisma relations, UI, cursors) — single source of truth |

## Hub stubs (fill when working that area)

| Doc | Purpose |
|-----|---------|
| [PRODUCT.md](./PRODUCT.md) | Product surfaces & ownership |
| [BUILD.md](./BUILD.md) | Build / run |
| [WHERE-TO-CHANGE.md](./WHERE-TO-CHANGE.md) | Feature → files / skills |
| [AUTH-AND-ROLES.md](./AUTH-AND-ROLES.md) | Auth guards & roles |
| [NOTIFICATIONS.md](./NOTIFICATIONS.md) | Shared notifications |
| [ENV.md](./ENV.md) | Env var names (no secrets) |

## SQL

| Path | Role |
|------|------|
| [`sql/`](./sql/) | **Canonical** — future human-run SQL (`YYYY-MM-DD-HHmmssZ-slug.sql`, real current UTC timestamp; paste into Supabase SQL Editor; README dependency order controls execution) |
| [`../prisma/migrations/`](../prisma/migrations/) | **Archive** — already-applied numbered scripts; do not add new SQL there |

## Specs

Design / roadmap docs under [`superpowers/specs/`](./superpowers/specs/):

| Spec | Topic |
|------|-------|
| [2026-08-11-aba-crm-hrm-spine-roadmap.md](./superpowers/specs/2026-08-11-aba-crm-hrm-spine-roadmap.md) | CRM/HRM spine sequencing & product boundaries |
| [2026-08-11-connected-product-test-playbook.md](./superpowers/specs/2026-08-11-connected-product-test-playbook.md) | Single product test playbook — SQL order, apps, intake → payroll |
| [2026-08-11-aba-session-note-data-collection-spec.md](./superpowers/specs/2026-08-11-aba-session-note-data-collection-spec.md) | Session note / RBT data-collection clinical SoT (Bridges E–G) |
| [2026-08-11-rbt-session-studio-design.md](./superpowers/specs/2026-08-11-rbt-session-studio-design.md) | RBT session studio UX |
| [2026-08-11-bridge-efg-manual-qa-checklist.md](./superpowers/specs/2026-08-11-bridge-efg-manual-qa-checklist.md) | Manual QA click-paths for Bridges E–G |
| [2026-08-11-session-studio-implementation-plan.md](./superpowers/specs/2026-08-11-session-studio-implementation-plan.md) | Session Studio build slices vs SoT |
| [2026-08-11-aba-emr-artemis-replacement-roadmap.md](./superpowers/specs/2026-08-11-aba-emr-artemis-replacement-roadmap.md) | Enclosed ABA EMR roadmap — replace Artemis clinical SoT |
| [2026-08-11-ras-sandbox-cutover-checklist.md](./superpowers/specs/2026-08-11-ras-sandbox-cutover-checklist.md) | Go/no-go: sandbox QA → cold cutover (no dual-run; external stack until flip) |
| [2026-08-19-artemis-exit-enclosed-system-roadmap.md](./superpowers/specs/2026-08-19-artemis-exit-enclosed-system-roadmap.md) | Master Artemis exit — 9-phase workflow, role charters, domain state, Phase 0–4 sequencing |
| [2026-08-20-pre-prod-readiness-checklist.md](./superpowers/specs/2026-08-20-pre-prod-readiness-checklist.md) | Pre-production deploy go/no-go — SQL order, env locks, role smoke, Phase 0–4 engineering |
| [2026-09-10-enterprise-multistate-v1-roadmap.md](./superpowers/specs/2026-09-10-enterprise-multistate-v1-roadmap.md) | Enterprise v1 execution program — multi-state architecture, simplicity, reliability, verification, and v2 PHI gate |
| [2026-08-10-hrm-ats-crm-bridge-design.md](./superpowers/specs/2026-08-10-hrm-ats-crm-bridge-design.md) | HRM ATS ↔ CRM bridge |
| [2026-08-12-production-readiness-gap-analysis.md](./superpowers/specs/2026-08-12-production-readiness-gap-analysis.md) | Whole-project production-readiness audit — scorecard, blockers, phased path to prod |
| [2026-08-12-calendar-model-unification-plan.md](./superpowers/specs/2026-08-12-calendar-model-unification-plan.md) | Session vs ScheduleAppointment unification (gap 26) — keep Session, drop unused model, phased hardening |

## Agent skills (`.agents/skills/`)

| Skill | When to load |
|-------|----------------|
| **docs-library** | Creating or editing `docs/`, specs, `docs/sql/`, or `.agents/skills/` — follow LIBRARY.md |
| **crm-app-map** | Work under `apps/crm` — client profile, portals, magic link, FlowMap, case openings from CRM |
| **hrm-app-map** | Work under `apps/hrm` — ATS, RBT portal, onboarding, job board, wage offer, session studio |
| **intake-workflow-map** | Client intake status, magic link, FlowMap, intake packet, doc approve/reject |
| **supabase-migration-generator** | Any Prisma schema change — emit paste-ready SQL under `docs/sql/` |
| **server-action-pattern** | Creating or modifying Next.js `'use server'` actions |
| **discord-imessage-chat-pattern** | Chat / help desk / messenger / messaging threads |
| **systematic-debugging** | Bugs, unexpected behavior, build errors |
| **nextjs-component-audit** | UI not updating or wrong data after a change |
| **verification-before-completion** | Before claiming fixed/complete or asking the user to refresh |
| **prisma-debug** | Deprecated — use **systematic-debugging** instead |
