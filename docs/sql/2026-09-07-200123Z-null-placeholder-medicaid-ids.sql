-- DEV data-quality repair: replace recognized Medicaid-ID placeholders with NULL.
-- Guarded to the three independently classified development rows. This does not
-- merge or delete clients and never exposes the placeholder or any real identifier.

BEGIN;

DO $$
DECLARE
  matched_count integer;
BEGIN
  SELECT count(*)
  INTO matched_count
  FROM "Client"
  WHERE id = ANY (ARRAY[
    'c3b869ed-8581-4a0d-8d7f-9e81739b92f9'::uuid,
    '7dc8ec13-d636-4092-8863-440e4205bc24'::uuid,
    '604a384a-ed60-49fd-8720-05e4ec60f947'::uuid
  ])
    AND lower(btrim("medicaidId")) IN ('n/a', 'na', 'none', 'unknown', 'pending', 'tbd');

  IF matched_count <> 3 THEN
    RAISE EXCEPTION
      'Expected exactly 3 guarded placeholder Medicaid IDs; found %. No changes applied.',
      matched_count;
  END IF;
END
$$;

UPDATE "Client"
SET "medicaidId" = NULL,
    "updatedAt" = now()
WHERE id = ANY (ARRAY[
  'c3b869ed-8581-4a0d-8d7f-9e81739b92f9'::uuid,
  '7dc8ec13-d636-4092-8863-440e4205bc24'::uuid,
  '604a384a-ed60-49fd-8720-05e4ec60f947'::uuid
])
  AND lower(btrim("medicaidId")) IN ('n/a', 'na', 'none', 'unknown', 'pending', 'tbd');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Client"
    WHERE id = ANY (ARRAY[
      'c3b869ed-8581-4a0d-8d7f-9e81739b92f9'::uuid,
      '7dc8ec13-d636-4092-8863-440e4205bc24'::uuid,
      '604a384a-ed60-49fd-8720-05e4ec60f947'::uuid
    ])
      AND "medicaidId" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Post-check failed: a guarded Medicaid ID remains non-null.';
  END IF;
END
$$;

COMMIT;

