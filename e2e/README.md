# E2E Smoke Suite (Playwright)

Repeatable browser/API smoke tests for both apps in the monorepo:

| Project | App | Base URL |
|---------|-----|----------|
| `crm` | `apps/crm` | `http://localhost:3000` |
| `hrm` | `apps/hrm` | `http://localhost:3001` |

## How to run

The config **intentionally has no `webServer` block** — it never builds or
starts the apps. Both dev servers must already be running:

```bash
# terminal 1 (or use `npm run dev` for both at once)
npm run dev:crm   # CRM on :3000
npm run dev:hrm   # HRM on :3001

# one-time browser download
npx playwright install chromium

# run the suite (repo root)
npm run test:e2e

# useful variants
npx playwright test --config=e2e/playwright.config.ts --project=crm
npx playwright test --config=e2e/playwright.config.ts specs/health.spec.ts
npx playwright show-report e2e/playwright-report
```

Override target URLs with `E2E_CRM_URL` / `E2E_HRM_URL` if the apps run on
non-default ports.

## What is covered

- `health.spec.ts` — `GET /api/health` returns `200 + ok:true` on both apps.
  Skips gracefully while the endpoint/middleware allowlisting is still rolling
  out (404 or redirect-to-login → skip, not fail).
- `crm-auth.spec.ts` — unauthenticated `/case` redirects to `/login`; login
  page renders email/password/submit controls.
- `hrm-auth.spec.ts` — unauthenticated `/hr-dashboard` (staff-protected)
  redirects to `/login`; login form renders.
- `crm-smoke.spec.ts` — `/login` loads with zero uncaught page errors;
  `/magic-link/invalid-token` degrades to a friendly screen (Next 404 or the
  "link no longer active" card), never the crash overlay.
- `hrm-smoke.spec.ts` — public `/apply` page renders; unauthenticated
  `/rbt/schedule` either redirects to `/apply` (the applicant portal gate —
  note: **not** `/login`, per `apps/hrm/src/proxy.ts`) or, when the server
  runs with `NEXT_PUBLIC_ENABLE_DEV_TOOLS=true`, renders crash-free.

Assertions are structural (status codes, redirect targets, `input[name=…]`,
headings by role) so they survive copy changes.

## What is intentionally NOT covered (future work)

- **Authenticated flows.** Logging in requires seeded Supabase credentials.
  The dev-tools panel (`NEXT_PUBLIC_ENABLE_DEV_TOOLS=true`) already exposes
  demo-account switching; the natural next step is a Playwright
  `globalSetup` that signs in via the dev-tools quick-login and saves
  `storageState` per role (staff, BCBA, billing…), letting specs reuse
  authenticated sessions without touching real credentials.
- **Database mutations.** Nothing here writes data; specs only hit public /
  gated routes and read responses.
- **Magic-link happy path.** Requires seeding an `IntakePacket` with a known
  token (and matching the device-fingerprint lock).

## CI status

Not wired into `.github/workflows/ci.yml` yet — deliberately. The suite needs
live servers, and in CI those would run with placeholder env and **no
database**, so `health.spec.ts` (503) and the magic-link spec (Prisma query
throws) would be permanently red. Wiring it up properly needs a Postgres
service container + schema setup in the workflow; until then, run locally.

## Conventions

- Specs live in `e2e/specs/` and are matched to a project by filename prefix
  (`crm-*` / `hrm-*`); `health.spec.ts` runs in both projects.
- Console/page-error capture helpers live in `e2e/fixtures.ts`.
- If a spec fails because a sibling workstream is mid-change on that feature,
  mark it `test.fixme` with a comment — don't delete it.
