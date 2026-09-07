# Environment variables

Env **names** only — never commit secret values. Every variable below is actually
read in code (verified by grepping `process.env` across `apps/` and `packages/`,
2026-08-12). Ports: CRM runs on **3000**, HRM on **3001** (`next dev -p …` in each
app's `package.json`). Both apps share **one** Supabase Postgres via the same
`DATABASE_URL` (shared Supavisor transaction pooler, port `6543`).

## CRM (`apps/crm`, port 3000)

| Variable | Scope | Purpose / read in |
|----------|-------|-------------------|
| `DATABASE_URL` | server | Shared Postgres (Supabase transaction pooler, port `6543`) — read by `packages/db/src/index.ts`; TLS is required in code |
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL — `lib/supabase/{server,client}.ts`, `middleware.ts` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Supabase anon key — same call sites as above |
| `NEXT_PUBLIC_HRM_URL` | public | Cross-app deep links / redirects to HRM — `middleware.ts`, `login/actions.ts` |
| `NEXT_PUBLIC_ENABLE_DEV_TOOLS` | public | Dev Tools + impersonation gate — **must be unset or `false` in prod** — `devToolsGate.ts`, `DevToolsUI.tsx`, `useHrmRole.ts`, `login/*` |

## HRM (`apps/hrm`, port 3001)

| Variable | Scope | Purpose / read in |
|----------|-------|-------------------|
| `DATABASE_URL` | server | Same shared Postgres as CRM — `packages/db/src/index.ts` |
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL — `lib/supabase/{server,client,admin}.ts`, `middleware.ts` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Supabase anon key — same call sites as above |
| `SUPABASE_SERVICE_ROLE_KEY` | **server-only, secret** | Admin client (RLS bypass) for Storage uploads without a session — `lib/supabase/admin.ts`. Never expose with `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_CRM_URL` | public | Deep links back into CRM — `actions/atsActions.ts`, `lib/syncSessionStudioTargets.ts` |
| `NEXT_PUBLIC_HRM_URL` | public | Self-referencing links in notifications — `actions/atsActions.ts` |
| `NEXT_PUBLIC_ENABLE_DEV_TOOLS` | public | Dev Tools + impersonation gate — **must be unset or `false` in prod** — `devToolsGate.ts`, `HrmDevToolsUI.tsx`, `sessionStudio.ts`, `applicantSessionActions.ts`, `resolveHrmRole.ts`, `login/*` |

## Supabase MFA & auth rate limits (dashboard tasks — gap 18)

No custom MFA is built in code. Both are configured in the Supabase dashboard
for the shared project and then apply to staff sign-in in both apps:

- **MFA (TOTP):** Dashboard → **Authentication → Multi-Factor (MFA)** → enable
  **TOTP (App Authenticator)**. To *require* it for staff, set the project's
  MFA enforcement (Pro plan: "Require MFA") or add an RLS/AAL2 policy; users
  enroll an authenticator app on first login after enablement.
- **Auth rate limits:** Dashboard → **Authentication → Rate Limits** — review
  the built-in per-IP limits for token/sign-in endpoints. These complement the
  app-side in-memory limiter (5 attempts per email+IP per 15 min in each app's
  `login/actions.ts`), which is per-server-process only.

## Production notes

- `NODE_ENV=production` must be set in every deployed environment — impersonation
  is server-blocked only when `NODE_ENV === 'production'` **or** the dev-tools flag
  is unset (gap analysis Blocker 5).
- `NEXT_PUBLIC_ENABLE_DEV_TOOLS` must be **unset or `false`** in prod for both apps.
- `SUPABASE_SERVICE_ROLE_KEY` is HRM server-side only; it is a full-access key.
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are **required in
  prod**: with `NODE_ENV=production` a missing value throws on first Supabase
  client creation (`lib/supabase/env.ts`) instead of silently using placeholders.
- `NODE_ENV` is read directly in both apps (login bypass, dev-tools gating) but is
  set by Next.js/host, not by `.env`.
