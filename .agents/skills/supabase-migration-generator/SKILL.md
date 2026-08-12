---
name: supabase-migration-generator
description: >
  Use when modifying prisma/schema.prisma — adding, changing, or removing any model, field,
  enum, or relation. Generates the raw SQL for the Supabase SQL Editor instead of running
  prisma migrate dev or prisma db push.
---

# Supabase Migration Generator

## The Rule (from AGENTS.md)

> **NEVER** auto-run `prisma migrate dev` or `prisma db push`.  
> Always generate raw PostgreSQL SQL for the user to run in the Supabase SQL Editor.

---

## When This Triggers

Any edit to `prisma/schema.prisma` that:
- Adds a new model
- Adds, renames, or removes a field
- Changes a field type or default
- Adds or changes a relation
- Adds or changes an enum value

---

## Step 1: Make the Schema Change

Edit `prisma/schema.prisma` with the new definition.

## Step 2: Generate the SQL Equivalent

Translate the Prisma change into raw PostgreSQL. Common patterns:

### Adding a new column
```sql
-- Prisma: fieldName  String?
ALTER TABLE "ModelName" ADD COLUMN "fieldName" TEXT;

-- Prisma: fieldName  Boolean @default(false)
ALTER TABLE "ModelName" ADD COLUMN "fieldName" BOOLEAN NOT NULL DEFAULT false;

-- Prisma: fieldName  Int?
ALTER TABLE "ModelName" ADD COLUMN "fieldName" INTEGER;

-- Prisma: fieldName  DateTime?
ALTER TABLE "ModelName" ADD COLUMN "fieldName" TIMESTAMPTZ;

-- Prisma: fieldName  Json? @default("{}")
ALTER TABLE "ModelName" ADD COLUMN "fieldName" JSONB DEFAULT '{}';
```

### Adding a new enum value
```sql
ALTER TYPE "EnumName" ADD VALUE 'NEW_VALUE';
```

### Creating a new model
```sql
CREATE TABLE "ModelName" (
  "id"        UUID NOT NULL DEFAULT gen_random_uuid(),
  "clientId"  UUID NOT NULL,
  "status"    "EnumName" NOT NULL DEFAULT 'DEFAULT_VALUE',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "ModelName_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ModelName_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE
);
```

### Removing a column
```sql
-- CAUTION: Irreversible. Confirm with user before including.
ALTER TABLE "ModelName" DROP COLUMN "fieldName";
```

### Renaming a column
```sql
ALTER TABLE "ModelName" RENAME COLUMN "oldName" TO "newName";
```

---

## Step 3: Write the SQL file and present it to the User

1. **Timestamp it** from the real current UTC time at file generation. Future filenames use exactly `YYYY-MM-DD-HHmmssZ-slug.sql`, where `Z` means UTC; do not copy a stale timestamp or use a placeholder.
2. **Write** one logical change to that one file under `docs/sql/` (canonical paste-ready location; see `docs/sql/README.md`). The timestamp provides chronology and collision resistance, not dependency order. Existing date-only SQL is grandfathered and must not be renamed. Do **not** add new files under `prisma/migrations/`.
3. **Index and order it** in `docs/sql/README.md`: add a row to the Index table and a row to the ordered "Run these for connected product" table. Declare any dependency on earlier scripts, or "no order dependency" when standalone. README dependency order controls execution.
4. **Track state conservatively:** mark it **pending apply** until the user explicitly confirms execution. Catalog objects observed in a database may be documented as observed state, but do not convert that into an unrecorded claim that the file was manually applied.
5. **Display** the same SQL in a clearly labeled code block:

```
## Database Migration Required

Run this SQL in the **Supabase SQL Editor** (Project Settings → SQL Editor).
Also saved at: `docs/sql/YYYY-MM-DD-HHmmssZ-slug.sql`

\`\`\`sql
-- Migration: [brief description]
-- Generated: [date]

[SQL here]
\`\`\`
```

## Step 4: Regenerate the Prisma Client

After the user confirms the SQL has been run, update the client:

```bash
npx prisma generate
```

Do NOT run this before the user confirms the SQL was applied — the generated client must match the actual DB schema.

---

## Prisma Table Name Mapping

Prisma automatically maps PascalCase model names to quoted table names:
- `model Client` → `"Client"`
- `model IntakePacket` → `"IntakePacket"`
- `model PARequest` → `"PARequest"`

Always use quoted names in SQL to match Prisma's convention.

---

## Type Mapping Reference

| Prisma Type | PostgreSQL Type |
|---|---|
| `String` | `TEXT` |
| `String @db.Uuid` | `UUID` |
| `Int` | `INTEGER` |
| `Float` | `DOUBLE PRECISION` |
| `Boolean` | `BOOLEAN` |
| `DateTime` | `TIMESTAMPTZ` |
| `Json` | `JSONB` |
| `Enum` | `"EnumName"` (quoted) |
