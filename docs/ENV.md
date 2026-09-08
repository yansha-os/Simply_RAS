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

## Supabase Auth dashboard baseline

The deployed environment selects its Supabase project through the URL, anon key,
and database URL above. Keep DEV and production settings aligned deliberately;
database branching does not automatically copy every Auth dashboard setting.

Live DEV audit verified **2026-09-07** (project ref
`tgygctyjgarhxvnpmihn`; no credentials recorded):

- Public signup, anonymous sign-in, and manual identity linking are disabled;
  email confirmation and secure email change are enabled.
- Email passwords require at least 12 characters containing lowercase,
  uppercase, digits, and symbols. Password changes require both a recent login
  and the current password.
- Access tokens expire after 3,600 seconds. Potentially compromised refresh
  tokens are detected and revoked; the refresh-token reuse interval is 10
  seconds.
- TOTP is available. AAL1 sessions are limited to 15 minutes, but AAL2 is not
  enforced because the only current Auth user has no verified MFA factor.
- Per-IP Auth limits observed: 150 token refreshes, 30 token verifications, and
  30 sign-up/sign-in requests per five minutes. These complement the app-side
  in-memory limiter (5 attempts per email+IP per 15 minutes in each app's
  `login/actions.ts`), which remains per-server-process only.

Before production launch:

- Enroll and verify at least two recoverable administrator MFA factors before
  enforcing AAL2; enforcing it with zero verified factors can lock out the sole
  administrator.
- Configure the real production Site URL and exact allow-listed redirect URLs;
  DEV currently contains only `http://localhost:3000` and no additional URLs.
- Mirror and re-audit the production project's Auth controls independently.
- Enable leaked-password protection and CAPTCHA when the selected Supabase plan
  supports them. The audited Free plan exposes neither as an active protection.
- Reassess time-boxed sessions, inactivity timeout, and single-session controls
  if production moves to a plan that supports them.

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
