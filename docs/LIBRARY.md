# Docs library — how this works

Lean, durable reference for agents and humans. **Not** a wiki: capture facts that would otherwise be re-discovered twice; leave one-off design narrative in dated specs.

Authoritative contribution rules live **here**. Index of current docs: [`README.md`](./README.md). System map: [`ARCHITECTURE.md`](./ARCHITECTURE.md). Hard agent rules: root [`AGENTS.md`](../AGENTS.md).

## Purpose

- Orient agents quickly (what exists, where to change it, what not to invent).
- Keep SQL, skills, and approved design specs discoverable in one place.
- Grow only when a fact is reusable; prefer short pages over long essays.

**Rule of thumb:** if agents would re-discover the same thing twice → docs page and/or skill pointer. If one-off for a feature → leave it in a spec under `docs/superpowers/specs/`.

## How to use (read order)

1. **Root [`AGENTS.md`](../AGENTS.md)** — hard rules (Prisma cardinality, UI, cursors) + Read first pointers.
2. **[`ARCHITECTURE.md`](./ARCHITECTURE.md)** — CRM vs HRM vs packages, shared Postgres, SQL convention, which-skill-when.
3. **Relevant skill** under [`.agents/skills/`](../.agents/skills/) — task-scoped map or workflow (e.g. `crm-app-map`, `hrm-app-map`, `supabase-migration-generator`).
4. **Relevant spec** under [`superpowers/specs/`](./superpowers/specs/) — only when designing or implementing that feature; do not treat specs as the live product map.

Then code. When you learn a durable fact, update the nearest doc or skill (see Maintenance).

## Folder map

| Path | Role |
|------|------|
| [`docs/`](./) | Hub pages (`README`, `ARCHITECTURE`, `LIBRARY`, future product/build cheat sheets) |
| [`docs/sql/`](./sql/) | **Canonical** paste-ready SQL (`YYYY-MM-DD-HHmmssZ-slug.sql`) for Supabase SQL Editor |
| [`docs/superpowers/specs/`](./superpowers/specs/) | Approved / in-progress design specs and roadmaps (dated filenames) |
| [`.agents/skills/`](../.agents/skills/) | Focused agent skills (triggers + checklists + “where to look”) |
| [`prisma/migrations/`](../prisma/migrations/) | **Archive** — do not add new SQL here |
| Root [`AGENTS.md`](../AGENTS.md) | Hard rules; points into this library — do not duplicate long docs there |

## What TO add

| Kind | Examples |
|------|----------|
| Product / ownership map | What CRM vs HRM owns; high-level surfaces |
| Build / run | How to start apps, env expectations (no secrets) |
| Domain spines | Stable status flows, “where state lives” (short) |
| “Where to change X” | Cheat sheets: feature → files / skills |
| Dated SQL | Idempotent DDL under `docs/sql/` only |
| Focused skills | Narrow trigger + pointers; not full novels |
| Approved design specs | Dated `YYYY-MM-DD-*-design.md` / `*-spec.md` after intent is clear |

Keep pages short. Link to skills and code paths instead of pasting large trees.

## What NOT to add

- Exhaustive API or route dumps that go stale immediately
- Generated Prisma / schema dumps (schema lives in `prisma/schema.prisma`)
- Copying the same roadmap into many files (one spine roadmap; others link)
- Long narrative history or changelog essays
- Stale how-tos that duplicate package scripts or CI without ownership
- Personal notes, scratchpads, or dumping chat / agent transcripts
- Parallel “second architecture” docs that contradict `ARCHITECTURE.md`

If unsure: put it in a **dated spec** or don’t write it.

## Naming and placement

| Need | Put it in | Naming |
|------|-----------|--------|
| Stable, reusable orientation | `docs/*.md` hub page | `PRODUCT.md`, `BUILD.md`, `WHERE-TO-CHANGE.md` — short, scannable |
| Agent workflow / repeated task | `.agents/skills/<name>/SKILL.md` | kebab-case folder; YAML `name` + `description` (when to load) |
| Feature design / sequencing | `docs/superpowers/specs/` | `YYYY-MM-DD-<topic>-design.md` or `-spec.md` / `-roadmap.md` |
| Schema change for humans | `docs/sql/` | `YYYY-MM-DD-HHmmssZ-slug.sql` (+ index and apply-order rows in `docs/sql/README.md`) |

For future SQL files, `Z` means UTC: generate the filename from the real current UTC timestamp, and keep one logical change per file. The timestamp provides chronology and collision resistance only; dependency order in `docs/sql/README.md` controls execution. Existing date-only SQL files and historical references are grandfathered and must not be renamed.

**Page vs skill vs spec**

- **Page** — humans and agents both need a stable map (“what is the product”, “how to build”).
- **Skill** — agents need a triggerable checklist when touching a domain (“load before changing intake”).
- **Spec** — deciding or implementing a feature; may become outdated; link from README/ARCHITECTURE when still authoritative.

Do not invent a new top-level docs tree. Prefer one page + skill pointer over three overlapping markdown files.

## Maintenance

- When behavior or ownership changes, **update the nearest doc or skill in the same PR/change** — do not leave orphan facts in chat or only in code comments.
- Prefer editing the existing page/skill over adding a sibling “v2” file.
- Specs may stay historical; if the live truth moves, update hub pages / skills and leave a one-line pointer in the spec if needed.
- New SQL → one `docs/sql/YYYY-MM-DD-HHmmssZ-slug.sql` file per logical change, using the real current UTC timestamp, plus index and apply-order rows in `docs/sql/README.md`. New durable agent workflow → skill + one line in `docs/README.md` skills table and root `AGENTS.md` Read first if broadly useful.
- Creating or editing docs/skills/specs → follow this file; optional skill **docs-library**.

## Suggested next pages (stubs)

Fill when working that area; do not invent product detail ahead of time.

- [ ] [`PRODUCT.md`](./PRODUCT.md) — product surfaces & CRM/HRM ownership (short)
- [ ] [`BUILD.md`](./BUILD.md) — monorepo build / run / packages
- [ ] [`WHERE-TO-CHANGE.md`](./WHERE-TO-CHANGE.md) — feature → files / skills cheat sheet
- [ ] [`AUTH-AND-ROLES.md`](./AUTH-AND-ROLES.md) — auth guards, role flags, portal access
- [ ] [`NOTIFICATIONS.md`](./NOTIFICATIONS.md) — shared `Notification` patterns across apps
- [ ] [`ENV.md`](./ENV.md) — required env vars by app (names only, no secrets)
