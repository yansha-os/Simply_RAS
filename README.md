# Simple RAS CRM

Monorepo for Rise & Shine ABA operations:

| App | Package | Port | Purpose |
|-----|---------|------|---------|
| CRM | `crm-app` (`apps/crm`) | 3000 | Intake, case, clinical, billing, client 360 |
| HRM | `hrm-app` (`apps/hrm`) | 3001 | ATS, HR, RBT careers / PWA |

Shared packages: `@repo/db` (Prisma), `@repo/ui` (shared UI exports).

## Setup

```bash
npm install
npm run db:generate
```

Copy env vars into the root and/or each app as needed — full per-app table in [`docs/ENV.md`](docs/ENV.md):

- `DATABASE_URL` — Supabase Postgres (session pooler is fine for the app)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_HRM_URL` (CRM), `NEXT_PUBLIC_CRM_URL` + `SUPABASE_SERVICE_ROLE_KEY` (HRM) — cross-app links / storage admin
- `NEXT_PUBLIC_ENABLE_DEV_TOOLS` — set to `true` only for local demo impersonation (never in production)

Schema changes: edit root `prisma/schema.prisma`, mirror into `packages/db/prisma/schema.prisma`, run `npm run db:generate`, then put paste-ready SQL in [`docs/sql/`](docs/sql/) and run it in the Supabase SQL Editor. Do not run `prisma migrate` / `db push` against production from agents. Apps import Prisma only via `@repo/db`.

## Scripts

```bash
npm run dev          # CRM :3000 + HRM :3001
npm run dev:crm
npm run dev:hrm
npm run build        # build:crm && build:hrm
npm run start:crm    # prod server :3000 (start:hrm for :3001)
npm run lint
npm run typecheck
npm test             # vitest run (test:watch for watch mode)
npm run db:generate
```

CI (`.github/workflows/ci.yml`) runs schema-parity check, lint (currently non-blocking), typecheck, unit tests, and both prod builds on every push/PR.

## Workspace layout

```text
apps/crm          CRM Next.js app
apps/hrm          HRM Next.js app
packages/db       Shared Prisma client (@repo/db)
packages/ui       Shared UI barrel (@repo/ui)
prisma/           Canonical schema + applied-SQL archive
docs/             Docs library — start at docs/README.md
```

## Docs

- [`docs/README.md`](docs/README.md) — index of everything below
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — monorepo map, CRM vs HRM boundaries
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md) — deploy, backups, monitoring, incident runbook
- [`docs/ENV.md`](docs/ENV.md) — full env var reference (names only, no secrets)
- [`docs/sql/`](docs/sql/) — paste-ready SQL for the Supabase SQL Editor (apply order in its README)
