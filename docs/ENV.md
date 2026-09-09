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
| `NEXT_PUBLIC_CRM_URL` | public | CRM's deployed origin; required with a shared Auth cookie domain |
| `NEXT_PUBLIC_HRM_URL` | public | Cross-app deep links / redirects to HRM — `middleware.ts`, `login/actions.ts` |
| `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN` | public | Optional organization-owned parent domain shared by CRM/HRM Auth cookies (for example `.example.com`); omit on localhost |
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
| `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN` | public | Same optional organization-owned parent domain configured in CRM; never use a hosting-provider parent such as `.onrender.com` |
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
- TOTP enrollment and factor management are available at `/account/security`
  in both apps. Each app's proxy enforces AAL2 for users who have a verified
  factor and redirects their AAL1 sessions to `/mfa`; unenrolled users remain
  allowed until rollout is complete. AAL1 sessions are limited to 15 minutes.
- Per-IP Auth limits observed: 150 token refreshes, 30 token verifications, and
  30 sign-up/sign-in requests per five minutes. These complement the app-side
  in-memory limiter (5 attempts per email+IP per 15 minutes in each app's
  `login/actions.ts`), which remains per-server-process only.

Before production launch:

- Enroll and verify at least two administrator authenticators before enabling
  project-wide AAL2 enforcement. The UI prevents removal of the sole verified
  factor; Supabase does not currently provide recovery codes.
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
- Cross-app single sign-on requires both apps to use the same Supabase project
  and controlled sibling origins such as `crm.example.com` / `hrm.example.com`.
  Set the identical `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN=.example.com` at build time
  in both apps. The app rejects public hosting parents and any configured app
  URL outside that domain. Leave it unset for localhost or unrelated origins;
  those deployments require a separate login in each app.
- `NODE_ENV` is read directly in both apps (login bypass, dev-tools gating) but is
  set by Next.js/host, not by `.env`.
