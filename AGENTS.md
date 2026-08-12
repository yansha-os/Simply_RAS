# Workspace Agent Rules — Simple RAS CRM

## Read first

1. **Architecture:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — CRM vs HRM vs packages, shared Postgres, SQL convention, which-skill-when.
2. **App skill:** **crm-app-map** or **hrm-app-map** (then other skills as needed) — task-scoped ownership map.
3. **Relevant spec** under [`docs/superpowers/specs/`](docs/superpowers/specs/) when implementing that feature (spine roadmap + session-note SoT are indexed from ARCHITECTURE / docs README).
4. **Docs library:** [`docs/LIBRARY.md`](docs/LIBRARY.md) — what to add / NOT to add; skill **docs-library** when editing docs/skills/specs/SQL. Index: [`docs/README.md`](docs/README.md).
5. **SQL:** New paste-ready SQL only in [`docs/sql/`](docs/sql/) (`YYYY-MM-DD-HHmmssZ-slug.sql`; `Z` is UTC; use the real current UTC timestamp when generating the file). Keep one logical change per file and add both index and apply-order rows to `docs/sql/README.md`; the timestamp provides chronology/collision resistance, while README dependency order controls execution. Existing date-only SQL is grandfathered and must not be renamed. Never add under `prisma/migrations/` (archive), or run `prisma migrate` / `db push` against live DB.
6. **Other skills** (`.agents/skills/`): **docs-library**, **intake-workflow-map**, **supabase-migration-generator**, **server-action-pattern**, **discord-imessage-chat-pattern**, **systematic-debugging**, **nextjs-component-audit**, **verification-before-completion**.
7. **Server actions:** every action gates first via `requireStaff(roles?)` / `requireClientAccess(clientId)` (`apps/*/src/lib/auth-guard.ts`) — or the magic-link guard for parent-facing actions. See skill **server-action-pattern**.
8. **Verify:** `npm test` (vitest, repo root) + `npm run typecheck` before claiming done; CI (`.github/workflows/ci.yml`) blocks on typecheck + tests + both `next build`s.

---

## Prisma Relation Access (CRITICAL)

Before writing ANY code that reads a Prisma relation (e.g., `client.intakePacket`, `user.sessions`), you MUST verify its cardinality in `prisma/schema.prisma`:

- `Model?` or `Model` (no `[]`) → **one-to-one**: access as `client.intakePacket` (direct object, may be `null`)
- `Model[]` → **one-to-many**: access as `client.sessions[0]` or `.map()`

**Never** assume an array. **Never** use `[0]` on a one-to-one relation. The result is a silent `undefined` that causes cascading UI bugs and is extremely hard to trace.

### Enforcement Checklist
When writing code that touches a Prisma relation:
1. Open `prisma/schema.prisma` and find the field.
2. Check if it ends in `?`, `Model`, or `Model[]`.
3. Use the correct access pattern in your code.
4. If in doubt, add a server-side `console.log` in the **Server Component** (not a `'use client'` component) to verify the raw value before wiring up the UI.

## Button Cursors
When creating or modifying clickable elements (like <button>), always ensure they have the cursor-pointer class when active, and cursor-not-allowed when disabled. Do not leave the cursor as the default arrow when an element is interactive.

## World-Class Ultra-Premium UI Directives (MANDATORY)
1. **Never Output Basic or Plain UIs:** Every dashboard, card, table, and portal must look like a top-tier modern SaaS application (Linear, Stripe, Vercel dark-mode style). Plain gray boxes, raw unstyled tables, or basic white cards are strictly prohibited.
2. **Glassmorphism & Radial Lighting:** Use deep multi-layered backgrounds (`bg-zinc-950/80`, `backdrop-blur-xl`), 1px translucent borders (`border-white/10 hover:border-brand-orange-500/50`), and subtle radial gradient glows.
3. **Rich Typography & Hierarchy:** Combine `font-heading` for titles, `font-mono` for metadata/timestamps/IDs, and high-contrast text (`text-white`, `text-zinc-400`).
4. **Micro-Interactions & Hover FX:** All interactive cards must feature smooth transitions (`transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl hover:border-brand-orange-500/40`).
5. **Vibrant Status Badges & Glows:** Use glowing live pulse dots (`.dot-live`), status badges with 10% opacity backgrounds and matching border outlines (e.g. `bg-green-500/10 text-green-400 border border-green-500/20`), and Lucide icons for visual clarity.
