---
name: docs-library
description: >
  Use when creating or editing docs under docs/, design specs under
  docs/superpowers/specs/, SQL under docs/sql/, or skills under .agents/skills/.
  Enforces the lean docs library: what to add, what not to add, naming/placement.
---

# Docs library

Before writing or restructuring documentation, **read and follow** [`docs/LIBRARY.md`](../../../docs/LIBRARY.md).

## Do

1. Open `docs/LIBRARY.md` — purpose, read order, TO / NOT TO add, naming, maintenance.
2. Prefer updating the **nearest existing** hub page or skill over inventing a new tree.
3. Reusable fact (agents would rediscover twice) → hub page and/or skill pointer.
4. One-off design → dated file under `docs/superpowers/specs/` only.
5. New SQL → one `docs/sql/YYYY-MM-DD-HHmmssZ-slug.sql` file per logical change, using the real current UTC timestamp (`Z` = UTC), plus index **and apply-order** rows in `docs/sql/README.md`. The timestamp supplies chronology/collision resistance; README dependency order controls execution. Existing date-only SQL is grandfathered and must not be renamed. Never add new SQL under `prisma/migrations/`.
6. New broadly useful skill → add one line to `docs/README.md` skills table; if agents need it on every task class, also root `AGENTS.md` Read first.
7. Keep stubs short with `TODO: fill when working that area` — do not invent product detail.

## Do not

- Exhaustive API / generated schema dumps
- Duplicate the spine roadmap in many places
- Long narrative history, personal notes, chat transcripts
- Parallel architecture docs that contradict `docs/ARCHITECTURE.md`
- Plan-file edits unless the user asked for that plan

## Placement cheat sheet

| Need | Where |
|------|--------|
| Stable map / build / where-to-change | `docs/*.md` |
| Agent workflow | `.agents/skills/<name>/SKILL.md` |
| Feature design | `docs/superpowers/specs/YYYY-MM-DD-…` |
| Human-run DDL | `docs/sql/` |

## After editing

- Link new durable pages from `docs/README.md` when they leave stub status.
- Same change that alters behavior should update the nearest doc/skill — no orphan facts.
