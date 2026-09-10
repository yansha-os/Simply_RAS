# Operations & deployment runbook

Runbook for deploying and operating the two Next apps + one shared Supabase Postgres.
Env var names: [`ENV.md`](./ENV.md). SQL apply order: [`sql/README.md`](./sql/README.md).
Readiness context: [production-readiness gap analysis](./superpowers/specs/2026-08-12-production-readiness-gap-analysis.md). No secrets in this file.

## 1. Deploy

Two independent Next.js 16 servers off one npm-workspaces monorepo. CRM on **:3000**, HRM on **:3001**, both against the **same** `DATABASE_URL` (Supabase shared **transaction pooler** on `:6543`; never point agents/CLI DDL at it).

```bash
npm ci
npm run db:generate        # prisma generate (packages/db schema) — client only, no DB write
npm run build              # = build:crm && build:hrm
npm run start:crm          # next start -p 3000
npm run start:hrm          # next start -p 3001  (separate process/host)
```

Per-app env at build **and** run time (see [`ENV.md`](./ENV.md) for the full table):

- Both: `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_CRM_URL`, `NEXT_PUBLIC_HRM_URL`
- CRM: `NEXT_PUBLIC_HRM_URL` → the deployed HRM origin
- HRM: `NEXT_PUBLIC_CRM_URL`, `NEXT_PUBLIC_HRM_URL` (self), `SUPABASE_SERVICE_ROLE_KEY` (server-only secret)
- `NEXT_PUBLIC_ENABLE_DEV_TOOLS` — **must be unset or `false`** in every deployed env. `src/lib/devToolsGate.ts` (both apps, imported by both root layouts) **throws at boot** if it is `true` while `NODE_ENV=production`; the app will not start. This is intentional — unset the flag and rebuild, do not patch the gate.
- `NODE_ENV=production` — set by `next build`/`next start` and the host; required for the impersonation server-block.

Topology notes:

- Cross-app navigation is by absolute URL via `NEXT_PUBLIC_HRM_URL` / `NEXT_PUBLIC_CRM_URL` — set them to the real public origins or deep links 404.
- Cross-app login continuity is available only when both apps use the same
  Supabase project and sibling custom domains controlled by the organization.
  In that topology, set the same `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN` (for example
  `.example.com`) in both builds. Never set `.onrender.com`, `.vercel.app`, or
  another shared hosting-provider parent; the runtime rejects these values.
  Leave the variable unset for localhost or unrelated origins, where sessions
  are intentionally host-only and users sign in separately to each app.
- `NEXT_PUBLIC_*` values are **baked in at build time** — changing them requires a rebuild, not just a restart.
- HRM allows 200mb server-action bodies (interview uploads, `next.config.ts`); keep any reverse proxy body limit at least that high for HRM.
- CI (`.github/workflows/ci.yml`) builds both apps with dummy env — a green CI build does not validate your real env values.

## 2. Database

### Migrations (manual Supabase SQL only)

- **Never** run `prisma migrate` / `prisma db push` against the live DB. All DDL is pasted by a human into the **Supabase SQL Editor**.
- Apply only the scripts needed by the target database, **in the dependency order listed in [`sql/README.md`](./sql/README.md)** and subject to each row's review gate. Prereq: archive `prisma/migrations/01–15` already applied.
- After any schema change: `npm run db:generate`, then rebuild + redeploy both apps (shared client).
- New DDL uses one `docs/sql/YYYY-MM-DD-HHmmssZ-slug.sql` file per logical change, generated from the real current UTC timestamp (`Z` = UTC), plus index and apply-order rows. The timestamp provides chronology/collision resistance; README dependency order controls execution. Treat a migration as applied only after explicit human confirmation.

### Backups (enable in Supabase dashboard)

- **Database → Backups**: confirm scheduled daily backups are on (default on paid plans); note retention.
- Enable **PITR (point-in-time recovery)** before any live PHI — daily snapshots alone can lose up to a day of clinical notes.
- Before pasting any non-trivial SQL: note the timestamp (PITR target) or take a manual backup first.

### Database transport security

- Supabase **Enforce SSL on incoming connections** is enabled on DEV (verified 2026-09-07): the configured TLS client connects and an explicit plaintext client is rejected with `ESSLREQUIRED`.
- Enable and independently verify the same control on production before any live PHI. This setting restarts the database briefly, so schedule it before launch traffic.
- Runtime Prisma and both read-only verification scripts require TLS with certificate and hostname verification. The public Supabase Root 2021 CA is pinned at `packages/db/certs/prod-ca-2021.crt`; review and rotate it before its 2031-04-26 expiry or whenever Supabase changes its published project CA.

### Restore / rollback runbook

1. Stop writes: stop both app processes (or block traffic). One DB serves both apps — restore affects CRM **and** HRM.
2. In Supabase: Database → Backups → restore to point-in-time (PITR) or pick a snapshot. Restore to just **before** the bad migration/incident.
3. After restore, identify which `docs/sql/` changes are absent, then re-apply only those reviewed scripts in README dependency order and honor every prerequisite/security gate. Do not blindly replay the whole list.
4. `npm run db:generate` if the schema of record changed, rebuild if needed, restart both apps.
5. Verify: log in to each app, load a client profile (CRM) and the RBT portal (HRM), check server logs for Prisma errors.

Rolling back a **bad migration only** (DB otherwise fine): there are no down-scripts — write a compensating SQL script in `docs/sql/` using the current UTC-timestamp filename convention, apply it in the SQL Editor, and add its index and apply-order rows. Prefer PITR when data was corrupted.

## 3. Monitoring & logging

**In the code today:**

- **Health endpoints** — `GET /api/health` on **both** apps (CRM `:3000`, HRM `:3001`). Unauthenticated by design (uptime checkers must reach them); responses expose only non-secret readiness flags. Both return `{ ok, app, time, db }`; HRM also returns `encryption` for its required onboarding-field encryption configuration. Each does a fast `SELECT 1` DB probe with a 3s timeout. **200** = the app is ready. **503** = the process is up but a required dependency/configuration failed; inspect `db` and, for HRM, `encryption`, then check the corresponding environment and Supabase logs. No response at all = the Next process itself is down.
- **Structured logging** — `src/lib/logger.ts` in each app (`logInfo/logWarn/logError(event, meta)`) emits single-line JSON to stdout: `{ ts, app, level, event, meta }`. Alert on `"level":"error"` lines. **Hard rule: never log PHI** (names/DOB/note content) — opaque ids only; the rule is baked into the helper's doc comment. Infrastructure sites are migrated; remaining `console.error` calls in billing/middleware code migrate as those files are next touched.
- **Uncaught server errors** — `src/instrumentation.ts` (`onRequestError`, both apps) logs every uncaught server-component/action/route error as one `server.request_error` JSON line (message, digest, method, path, route). Users see the branded `src/app/global-error.tsx` screen, which exposes only the error **digest** — grep logs for that digest to find the real error.

Wiring it up:

- **Host logs:** keep both processes under something that captures stdout (Vercel/host log drain, or `pm2`/systemd journal if self-hosted). That is the only place log lines appear.
- **Supabase logs:** dashboard → Logs → Postgres for query errors/connection saturation (the transaction pooler has a connection cap — two apps share it). Each app process is bounded to five `pg` clients, waits at most five seconds for a connection, cancels queries after 30 seconds, and recycles connections after five minutes.
- **Uptime:** point any external pinger (UptimeRobot, Better Stack, Pingdom, etc.) at `https://<crm>/api/health` **and** `https://<hrm>/api/health`, expecting HTTP 200. Example — UptimeRobot: two "HTTP(s)" monitors, one per URL, 1–5 min interval; it treats 503 as down automatically, which is exactly what a failed DB probe returns. Locally: `http://localhost:3000/api/health` / `http://localhost:3001/api/health`.
- **Error alerting:** Sentry (Next.js SDK in both apps) is the cheapest step up — its hook belongs in the existing `src/instrumentation.ts`. Until then, host log alerts on `"level":"error"` / `FATAL` strings.

**When either app 500s, check in this order:**

1. Server stdout/logs for the actual error (Prisma `column does not exist` → unapplied `docs/sql/` script, see §2).
2. `[SECURITY] FATAL` at boot → dev-tools flag set in prod (§1) — unset and rebuild.
3. **Known failure mode — corrupted `.next` build cache** (webpack/module-not-found or random chunk errors after switching branches): stop the app, delete that app's `.next` folder (`apps/crm/.next` or `apps/hrm/.next`), rebuild/restart. In dev this presents as a dev server that compiles but serves broken pages.
4. Supabase status + connection count (pooler exhaustion shows as intermittent Prisma connect timeouts).

## 4. Incident quick-reference

- **Restart dev servers:** kill the node processes, then `npm run dev` (root — runs both via concurrently) or `npm run dev:crm` / `npm run dev:hrm` individually.
- **It compiles but behaves insane:** clear `.next` first (`apps/<app>/.next`), restart. Cheapest fix, try before debugging.
- **Port conflict** (`EADDRINUSE 3000/3001`): a stale dev server holds the port. Windows: `netstat -ano | findstr :3000` → `taskkill /PID <pid> /F`. Unix: `lsof -ti :3000 | xargs kill`.
- **After any `schema.prisma` change:** `npm run db:generate`, restart dev servers/rebuild — stale Prisma client causes "Unknown field" runtime errors.
- **DevTools/impersonation gating** lives in `apps/crm/src/lib/devToolsGate.ts` and `apps/hrm/src/lib/devToolsGate.ts` (single gate: `isDevToolsEnabled()`, boot assertion). If dev tools show where they shouldn't, or the app refuses to boot in prod, this file and `NEXT_PUBLIC_ENABLE_DEV_TOOLS`/`NODE_ENV` are the whole story.
- **Prod smoke after any deploy:** both `/api/health` return 200 with `"db":"ok"`, and HRM also reports `"encryption":"ok"`; both `/login` pages load; one CRM client profile renders; HRM RBT portal renders; no `[SECURITY]` or Prisma errors in logs.
