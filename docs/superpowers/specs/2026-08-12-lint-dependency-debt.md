# Lint + Dependency Debt Report

**Date:** 2026-08-12
**Status:** Point-in-time census (read-only — no code changed). Numbers were captured while several agents were actively editing/deleting files, so treat totals as a snapshot that will shift; the *shape* of the debt (which rules, which areas) is stable.
**Addresses:** Gap 24 groundwork ("ESLint debt hidden by CI `continue-on-error`") in [2026-08-12-production-readiness-gap-analysis.md](./2026-08-12-production-readiness-gap-analysis.md).
**Method:** `npx eslint src --format json` per app (eslint 9 + `eslint-config-next` 16.2.10, script `eslint src`), aggregated from the JSON; `npm audit --json` (prod + full) at root; import-grep of every declared dependency across `apps/*/src` and `packages/*/src`.

---

## 1. ESLint census

CI (`.github/workflows/ci.yml`) runs `npm run lint` with `continue-on-error: true` — every number below is currently invisible to merges.

| App | Errors | Warnings | Total | Files w/ issues | Auto-fixable |
|-----|-------:|---------:|------:|----------------:|-------------:|
| CRM (`apps/crm`) | 317 | 188 | **505** | 92 / 181 linted | 4 |
| HRM (`apps/hrm`) | 114 | 196 | **310** | 51 / 131 linted | 1 |
| **Combined** | **431** | **384** | **815** | 143 | **5** |

Only **5 of 815** problems are machine-fixable (`prefer-const` + two formatting hits). The debt is manual.

### Top rules by count

| Rule | CRM | HRM | Severity | Character |
|------|----:|----:|----------|-----------|
| `@typescript-eslint/no-unused-vars` | 174 | 182 | warn | Dead imports/vars — safe deletions |
| `@typescript-eslint/no-explicit-any` | 237 | 38 | error | Type-safety debt, concentrated in big client components |
| `react/no-unescaped-entities` | 24 | 37 | error | Cosmetic (apostrophes/quotes in JSX text) |
| `react-hooks/set-state-in-effect` | 19 | 21 | error | Real render-loop/perf risk |
| `react-hooks/static-components` | 27 | 0 | error | Components defined inside components — remount bugs |
| `@next/next/no-img-element` | 9 | 10 | warn | `<img>` vs `next/image` |
| `react-hooks/rules-of-hooks` | 0 | 6 | error | **Genuine bugs** — conditional hooks |
| `react-hooks/immutability` | 2 | 7 | error | Mutating props/state |
| `react-hooks/purity` | 3 | 0 | error | Impure render |
| `react-hooks/exhaustive-deps` | 3 | 4 | warn | Stale-closure risk |

### Worst files (top 10 per app, errors+warnings)

- **CRM:** `client-profile/tabs/BcbaTreatmentPlanTab.tsx` (27), `ops/OpsDashboardClient.tsx` (20), `client-profile/tabs/BillingAuthTab.tsx` (19), `ClinicalReviewTab.tsx` (19), `IntakeDocumentsTab.tsx` (18), `intake/IntakePipelineClient.tsx` (15), `public-rbt/RbtApplicationForm.tsx` (14), `BcbaSessionEmrTab.tsx` (13), `notes/NotesPipelineClient.tsx` (13), `portal-case/IntakeQueue.tsx` (13).
- **HRM:** `app/ats/applicant/[id]/page.tsx` (42), `components/rbt/RbtTasksView.tsx` (30), `components/emr/RbtDataCollectionEngine.tsx` (27), `app/(dashboard)/rbt/interview/page.tsx` (25), `public-rbt/RbtApplicationForm.tsx` (15), `rbt/RbtScheduleView.tsx` (13), `hrm/RbtOnboardingChecklist.tsx` (10), `layout/HrmSidebar.tsx` (10), `rbt/FixIncompleteSessionDrawer.tsx` (10), `rbt/RbtPipelineClient.tsx` (10).

**Important:** several of these top offenders are orphan/mock surfaces the gap analysis already slates for deletion, and the current working tree (parallel agents) is deleting CRM `components/rbt/*`, `components/emr/*`, `components/hrm/*` right now. Re-run this census after that lands — expect a material drop for free.

### Burn-down order (recommended)

1. **Correctness errors first (small, dangerous):** `react-hooks/rules-of-hooks` (6, HRM), `react-hooks/immutability` (9), `react-hooks/purity` (3), `react-hooks/set-state-in-effect` (40). ~60 problems, each a potential runtime bug. Never disable these.
2. **Delete-then-recount:** wait for the in-flight orphan/mock deletions, re-run the census, and only then chase file-level debt — don't fix files that are being deleted.
3. **`no-unused-vars` sweep (356):** mostly unused imports; mechanical and low-risk. Config `argsIgnorePattern: "^_"` first so intentional placeholder args stop counting.
4. **`no-explicit-any` (275):** fix by area, highest-stakes first — `lib/billing/*`, server actions, then client components. Types exist via `@repo/db` re-exports; most `any`s are laziness, not necessity.
5. **`react-hooks/static-components` (27, CRM):** hoist inner components; concentrated in the big client-profile tabs.

### Disable-with-justification vs fix

- **Disable (justified):** `react/no-unescaped-entities` — 61 errors of pure cosmetics (`'` in prose). Escaping every apostrophe adds noise and no safety; many Next.js teams turn it off. Recommend `"react/no-unescaped-entities": "off"` with a comment, which alone removes ~14% of all errors.
- **Keep as warn (don't block yet):** `@next/next/no-img-element`, `react-hooks/exhaustive-deps` — legitimate, but each fix needs individual judgment.
- **Fix, never disable:** all `react-hooks/*` correctness rules, `no-unused-vars`, `no-explicit-any` (downgrading `any` to warn is acceptable *temporarily* to make errors=0 gateable sooner, but set a dated TODO).

---

## 2. Dependency audit (no uninstalls performed)

Workspaces: root, `apps/crm`, `apps/hrm`, `packages/db`, `packages/ui`. Method: grep `from '<pkg>'` / `require('<pkg>')` per workspace, then manual check of config references (`postcss.config.mjs`, `next.config.ts`, `tsconfig.json`, root scripts). Generated code (`apps/crm/src/generated/prisma`, gitignored) excluded.

### Likely unused (candidates — confidence order)

| # | Dependency | Declared in | Evidence |
|---|-----------|-------------|----------|
| 1 | `framer-motion` | crm + hrm deps | **Zero imports anywhere** in repo (code or config). Most confident removal, both apps. |
| 2 | `@types/pg` | crm **deps** (not devDeps) | `pg` is never imported in CRM; types also misplaced in runtime deps. |
| 3 | `pg` | crm deps | Only imported in `packages/db/src/index.ts`, which has its own `pg` dep. |
| 4 | `pg` | hrm deps | Same as above. |
| 5 | `@prisma/adapter-pg` | crm + hrm deps | Only imported in `packages/db`. |
| 6 | `@prisma/client` | crm + hrm deps | No handwritten app code imports it; apps consume Prisma exclusively via `@repo/db` (which re-exports `* from '@prisma/client'` and declares it itself). |
| 7 | `@repo/ui` | crm + hrm deps | **Zero imports** in either app. Config-referenced only (`transpilePackages`, tsconfig paths). Its barrel re-exports *from* `apps/crm/src/components/ui/*` — an inverted dependency; either make it a real package or drop it. |
| 8 | `prisma` (CLI) | crm + hrm devDeps | Root devDeps already carry it for `db:generate`; app copies redundant (harmless with hoisting). |

Counting per-workspace declarations, that's **~12 removable declaration lines**; the five most confident are rows 1–4 above (`framer-motion` ×2, `@types/pg`, `pg` ×2).

**Config-referenced, NOT unused (do not touch):** `tailwindcss` + `@tailwindcss/postcss` (globals.css `@import`, `postcss.config.mjs`), `eslint` + `eslint-config-next` (lint), `concurrently` (root `dev` script), `vitest` (root `test` script + 12 test-file imports in apps), `typescript`, `@types/*` (react/node), `prisma` at root (`db:generate`).

### Inverse problem — undeclared (phantom) dependency

- **`@react-pdf/renderer` is imported by HRM** (`apps/hrm/src/lib/pdf/TreatmentPlanPDF.tsx`) but declared only in CRM's `package.json`. It resolves via hoisting today and would break the moment CRM drops it or hoisting changes. **Add it to `apps/hrm/package.json`** when no sibling is editing that file.

### Version drift

Effectively none — the workspaces are well aligned: `next` 16.2.10 + `eslint-config-next` 16.2.10 everywhere, `prisma`/`@prisma/*` ^7.8.0 everywhere, `react`/`react-dom` 19.2.4 pinned in apps vs `^19.2.4` in `@repo/ui` (compatible), `lucide-react` ^1.24.0, `tailwind-merge` ^3.6.0, `clsx` ^2.1.1 identical. The only *fleet* drift is `next` 16.2.10 vs the security-fixed 16.3.0 (below).

### Stray artifact (informational)

`apps/crm/src/generated/prisma/**` is a full generated Prisma client (gitignored) referenced by **nothing** — both schema copies carry the comment "Client is generated from packages/db; do not output into root src". Safe to delete locally; it slightly pollutes local greps.

---

## 3. npm audit

Run at root (audits the whole workspace tree), 2026-08-12. `npm audit --omit=dev` and full `npm audit`. **No upgrades performed.**

| Scope | Critical | High | Moderate | Low | Total |
|-------|---------:|-----:|---------:|----:|------:|
| Production (`--omit=dev`) | 0 | **3** | 0 | 0 | 3 |
| Full (incl. dev) | 0 | 6 | 5 | 0 | 11 |

### Production (3 high) — one root cause: `next@16.2.10`

- **`next` (direct dep):** middleware/proxy bypass ([GHSA-6gpp-xcg3-4w24](https://github.com/advisories/GHSA-6gpp-xcg3-4w24)), Server Actions DoS ([GHSA-m99w-x7hq-7vfj](https://github.com/advisories/GHSA-m99w-x7hq-7vfj)), Server Actions SSRF ([GHSA-89xv-2m56-2m9x](https://github.com/advisories/GHSA-89xv-2m56-2m9x)). The middleware-bypass one is especially relevant given the gap analysis already flags middleware as the only auth boundary.
- **`postcss`, `sharp` (transitive, via next):** XSS/path-traversal and libvips CVEs — both resolved by the same next bump.
- **Fix:** `next@16.3.0` (same major, non-breaking per npm). Bump `next` + `eslint-config-next` together in all three package.json files that pin 16.2.10. Do this as its own PR once the parallel edit wave lands.

### Dev-only (additional 8) — all transitive, all have non-major fixes

- `prisma` CLI chain: `@prisma/dev` → `hono` / `@hono/node-server` / `valibot` (moderate).
- `brace-expansion`, `fast-uri`, `js-yaml` (high, tooling-side DoS/parse issues).
- None ship to production. A routine `npm update`-style pass (or the next prisma minor) clears them; low urgency.

---

## 4. What CI should gate next

Current CI already blocks on: schema parity, typecheck, unit tests, both prod builds. Lint is the one `continue-on-error` hole. Recommended sequence:

1. **Now (cheap):** turn off `react/no-unescaped-entities` (justified above) and add `argsIgnorePattern: "^_"` — pure config, removes ~75 errors without touching code.
2. **After the orphan-deletion wave lands:** re-run this census; fix the ~60 `react-hooks` correctness errors; they're small and are the real bugs.
3. **Gate errors:** flip lint to blocking with warnings tolerated — change the CI step to `npm run lint -- --max-warnings=9999` equivalent (errors already fail eslint) and **delete `continue-on-error: true`**. This is achievable once steps 1–2 plus the `no-explicit-any` decision (fix vs temporary downgrade-to-warn with dated TODO) are done.
4. **Ratchet warnings:** record the warning count as a baseline and fail CI when it grows (simple: `--max-warnings <current>`); tighten the number as sweeps land.
5. **Gate `npm audit --omit=dev --audit-level=high`** as a separate non-blocking→blocking step after the `next@16.3.0` bump (it would pass immediately after the bump).
6. **Dependency hygiene (one-time PR, post-wave):** remove the likely-unused declarations in §2, add `@react-pdf/renderer` to HRM, and decide `@repo/ui`'s fate.

---

*Follow-up housekeeping: add this spec's index row to `docs/README.md` (not done here — this report's writes were intentionally limited to this file + root README).*
