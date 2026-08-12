# Archive — do not add new SQL here

This folder holds already-applied numbered migration scripts (historical). Prisma still references it via `prisma.config.ts`; do **not** move or renumber these files.

**Future SQL goes in [`docs/sql/`](../../docs/sql/)** (`YYYY-MM-DD-HHmmssZ-slug.sql`, using the real current UTC timestamp), pasted into the Supabase SQL Editor and ordered by dependencies in its README. Existing archive and date-only SQL filenames are grandfathered; do not rename them. Agents must never run `prisma migrate` or `prisma db push` against the live database.
