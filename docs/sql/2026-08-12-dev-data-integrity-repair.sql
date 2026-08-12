-- Development data-integrity repair (2026-08-12)
--
-- Scope:
--   1. Return one conclusively designated-demo SessionNote to review.
--   2. Remove one isolated, hard-coded legacy Session Studio artifact. The
--      Client delete cascades to exactly one Session and one SessionNote.
--
-- This file is intentionally safe-by-default: the final statement is ROLLBACK.
-- First run it unchanged and review every preflight/postflight result and NOTICE.
-- To apply, change only the final ROLLBACK to COMMIT and run the whole file again.
-- If any assertion raises, run ROLLBACK; and stop for human review.
--
-- First-run row-count expectations:
--   demo note UPDATE: 1
--   legacy Client DELETE: 1 (plus 1 Session + 1 SessionNote by checked cascade)
-- Idempotent repeat expectations:
--   demo note UPDATE: 0 (already in the checked post-state)
--   legacy Client DELETE: 0 (already absent)

BEGIN;

-- ---------------------------------------------------------------------------
-- Preflight: IDs and invariant booleans only. No names or clinical content.
-- ---------------------------------------------------------------------------

SELECT
  n.id::text AS "noteId",
  n."sessionId"::text AS "sessionId",
  s."clientId"::text AS "clientId",
  n."isConverted",
  n."rbtSigned",
  n."parentSigned",
  n."bcbaSigned",
  (n."rbtSignedAt" IS NOT NULL AND nullif(btrim(n."rbtSignerName"), '') IS NOT NULL)
    AS "hasRbtSignatureAudit",
  (n."bcbaSignedAt" IS NOT NULL AND nullif(btrim(n."bcbaSignerName"), '') IS NOT NULL)
    AS "hasBcbaSignatureAudit",
  (n."checklistSnapshot"->>'passed' = 'true') AS "checklistPassed",
  (nullif(btrim(n."plutusClaimRef"), '') IS NOT NULL) AS "hasPlutusClaimRef",
  (n."convertedAt" IS NOT NULL) AS "hasConvertedAt",
  (
    lower(coalesce(c."guardianEmail", '')) =
      'demo.studio.learner@riseandshine.local'
    AND coalesce(c."treatmentPlan", '{}'::jsonb)
      ->'__devSeed'->>'kind' = 'connected-product-studio'
    AND EXISTS (
      SELECT 1
      FROM "PARequest" p
      WHERE p."clientId" = c.id
        AND p."authNumber" = 'DEV-TX-STUDIO'
    )
  ) AS "hasDesignatedDemoFence",
  (
    coalesce(n."structuredContent"::text, '') ~
      '"targetId":[[:space:]]*"[tbTB][0-9]+"'
  ) AS "hasDemoTargetIds"
FROM "SessionNote" n
JOIN "Session" s ON s.id = n."sessionId"
JOIN "Client" c ON c.id = s."clientId"
WHERE n.id = '317fe47d-eed7-4a2b-bbfb-885a94ec0230'::uuid
  AND n."sessionId" = 'cf671ec8-8b3f-4a25-aba0-a2cde9af0dfa'::uuid
  AND c.id = '56b64754-ed58-4dab-b8f4-5700893a02a0'::uuid;

SELECT
  c.id::text AS "clientId",
  s.id::text AS "sessionId",
  n.id::text AS "noteId",
  c.status::text AS "clientStatus",
  (c."rbtId" IS NULL) AS "clientRbtMissing",
  (s."bcbaId" IS NULL) AS "sessionBcbaMissing",
  (s."scheduledStart" = s."scheduledEnd") AS "zeroScheduledDuration",
  (s."actualStart" = s."actualEnd") AS "zeroActualDuration",
  (
    c."firstName" = 'Leo'
    AND c."lastName" = 'Miller'
    AND c."guardianName" = 'Caregiver (Session Studio)'
    AND c."guardianEmail" IS NULL
    AND c."guardianPhone" IS NULL
    AND c."dateOfBirth" IS NULL
    AND c."memberId" IS NULL
    AND c."medicaidId" IS NULL
    AND c."insurancePayer" IS NULL
  ) AS "hasLegacyStudioIsolationMarker",
  (
    SELECT count(*) = 1
    FROM "Session" only_session
    WHERE only_session."clientId" = c.id
  ) AS "hasExactlyOneSession",
  (
    SELECT count(*) = 1
    FROM "SessionNote" only_note
    JOIN "Session" only_note_session
      ON only_note_session.id = only_note."sessionId"
    WHERE only_note_session."clientId" = c.id
  ) AS "hasExactlyOneNote"
FROM "Client" c
JOIN "Session" s
  ON s.id = '89b5b721-3271-4d21-807c-45707c4f9826'::uuid
 AND s."clientId" = c.id
JOIN "SessionNote" n
  ON n.id = '835cedd7-6c8f-488a-8eef-73f9d8756ada'::uuid
 AND n."sessionId" = s.id
WHERE c.id = '6585876c-351d-4277-be13-77628acf7b8b'::uuid;

-- ---------------------------------------------------------------------------
-- Repair 1: designated demo note.
--
-- Keep the supported RBT/parent attestations and clinical payload. Clear the
-- unsupported BCBA attestation, invalid claim handoff, and stale green
-- checklist so current workflow requires a real re-submit/review/re-sign.
-- ---------------------------------------------------------------------------

DO $repair_designated_demo_note$
DECLARE
  updated_rows integer;
BEGIN
  -- Idempotent post-state: target still exists, is fenced to the designated
  -- demo client, and can no longer be treated as signed/claim-converted.
  IF EXISTS (
    SELECT 1
    FROM "SessionNote" n
    JOIN "Session" s ON s.id = n."sessionId"
    JOIN "Client" c ON c.id = s."clientId"
    WHERE n.id = '317fe47d-eed7-4a2b-bbfb-885a94ec0230'::uuid
      AND n."sessionId" = 'cf671ec8-8b3f-4a25-aba0-a2cde9af0dfa'::uuid
      AND c.id = '56b64754-ed58-4dab-b8f4-5700893a02a0'::uuid
      AND lower(coalesce(c."guardianEmail", '')) =
        'demo.studio.learner@riseandshine.local'
      AND coalesce(c."treatmentPlan", '{}'::jsonb)
        ->'__devSeed'->>'kind' = 'connected-product-studio'
      AND NOT n."isConverted"
      AND NOT n."bcbaSigned"
      AND n."convertedAt" IS NULL
      AND nullif(btrim(n."plutusClaimRef"), '') IS NULL
      AND n."bcbaSignedAt" IS NULL
      AND nullif(btrim(n."bcbaSignerName"), '') IS NULL
      AND n."checklistSnapshot" IS NULL
  ) THEN
    RAISE NOTICE
      'designated demo note already repaired; expected repeat UPDATE row count = 0';
    RETURN;
  END IF;

  UPDATE "SessionNote" AS n
  SET
    "isConverted" = false,
    "convertedAt" = NULL,
    "plutusClaimRef" = NULL,
    "bcbaSigned" = false,
    "bcbaSignedAt" = NULL,
    "bcbaSignerName" = NULL,
    "checklistSnapshot" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP
  FROM "Session" AS s
  JOIN "Client" AS c ON c.id = s."clientId"
  WHERE n.id = '317fe47d-eed7-4a2b-bbfb-885a94ec0230'::uuid
    AND n."sessionId" = 'cf671ec8-8b3f-4a25-aba0-a2cde9af0dfa'::uuid
    AND s.id = n."sessionId"
    AND c.id = '56b64754-ed58-4dab-b8f4-5700893a02a0'::uuid
    AND lower(coalesce(c."guardianEmail", '')) =
      'demo.studio.learner@riseandshine.local'
    AND coalesce(c."treatmentPlan", '{}'::jsonb)
      ->'__devSeed'->>'kind' = 'connected-product-studio'
    AND EXISTS (
      SELECT 1
      FROM "PARequest" p
      WHERE p."clientId" = c.id
        AND p."authNumber" = 'DEV-TX-STUDIO'
    )
    AND n."isConverted"
    AND n."rbtSigned"
    AND n."parentSigned"
    AND n."bcbaSigned"
    AND n."rbtSignedAt" IS NOT NULL
    AND nullif(btrim(n."rbtSignerName"), '') IS NOT NULL
    AND n."parentSignedAt" IS NOT NULL
    AND nullif(btrim(n."parentSignerName"), '') IS NOT NULL
    AND n."bcbaSignedAt" IS NULL
    AND nullif(btrim(n."bcbaSignerName"), '') IS NULL
    AND nullif(btrim(n."plutusClaimRef"), '') IS NULL
    AND n."convertedAt" IS NOT NULL
    AND n."checklistSnapshot"->>'passed' = 'true'
    AND coalesce(n."structuredContent"::text, '') ~
      '"targetId":[[:space:]]*"[tbTB][0-9]+"'
    AND NOT EXISTS (
      SELECT 1
      FROM "AuditLogVault" a
      WHERE a."resourceType" = 'SESSION_NOTE'
        AND a."resourceId" = n.id::text
        AND a.action IN ('SIGN', 'CONVERT')
    );

  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  IF updated_rows <> 1 THEN
    RAISE EXCEPTION
      'designated demo note repair refused: expected UPDATE row count 1, got %',
      updated_rows;
  END IF;

  RAISE NOTICE
    'designated demo note repaired; first-run UPDATE row count = 1';
END
$repair_designated_demo_note$;

-- ---------------------------------------------------------------------------
-- Repair 2: isolated legacy Session Studio auto-convert artifact.
--
-- Do not infer an RBT assignment or fabricate a BCBA on the zero-duration
-- Session. Delete the exact dev artifact only after every isolation predicate
-- proves that the Client owns no other business/clinical records.
-- ---------------------------------------------------------------------------

DO $delete_legacy_studio_artifact$
DECLARE
  safe_to_delete boolean;
  deleted_rows integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "Client"
    WHERE id = '6585876c-351d-4277-be13-77628acf7b8b'::uuid
  ) THEN
    RAISE NOTICE
      'legacy Studio artifact already absent; expected repeat DELETE row count = 0';
    RETURN;
  END IF;

  -- Prevent a concurrent workflow from attaching a new dependent row between
  -- the isolation check and cascade delete.
  PERFORM 1
  FROM "Client"
  WHERE id = '6585876c-351d-4277-be13-77628acf7b8b'::uuid
  FOR UPDATE;

  PERFORM 1
  FROM "Session"
  WHERE id = '89b5b721-3271-4d21-807c-45707c4f9826'::uuid
  FOR UPDATE;

  PERFORM 1
  FROM "SessionNote"
  WHERE id = '835cedd7-6c8f-488a-8eef-73f9d8756ada'::uuid
  FOR UPDATE;

  SELECT count(*) = 1
  INTO safe_to_delete
  FROM "Client" c
  WHERE c.id = '6585876c-351d-4277-be13-77628acf7b8b'::uuid
    AND c.status = 'ACTIVE'
    AND c."rbtId" IS NULL
    AND c."bcbaId" = '92cba35f-f00e-4be8-9de2-cc9b3e93d669'::uuid
    AND c."caseCoordinatorId" IS NULL
    AND c."clinicalSupportId" IS NULL
    AND NOT c."rbtApproved"
    AND c."firstName" = 'Leo'
    AND c."lastName" = 'Miller'
    AND c."guardianName" = 'Caregiver (Session Studio)'
    AND c."guardianEmail" IS NULL
    AND c."guardianPhone" IS NULL
    AND c."dateOfBirth" IS NULL
    AND c."memberId" IS NULL
    AND c."medicaidId" IS NULL
    AND c."insurancePayer" IS NULL
    AND NOT (coalesce(c."treatmentPlan", '{}'::jsonb) ? '__devSeed')
    AND (
      SELECT count(*) = 1
      FROM "Session" only_session
      WHERE only_session."clientId" = c.id
    )
    AND EXISTS (
      SELECT 1
      FROM "Session" s
      JOIN "SessionNote" n ON n."sessionId" = s.id
      WHERE s.id = '89b5b721-3271-4d21-807c-45707c4f9826'::uuid
        AND s."clientId" = c.id
        AND s."rbtId" = '7188d6b9-77c3-4ba3-a742-7b3ef2bcb8dd'::uuid
        AND s."bcbaId" IS NULL
        AND s.status = 'COMPLETED'
        AND s."cptCode" = '97153-HM'
        AND s."scheduledStart" = s."scheduledEnd"
        AND s."actualStart" IS NOT NULL
        AND s."actualStart" = s."actualEnd"
        AND n.id = '835cedd7-6c8f-488a-8eef-73f9d8756ada'::uuid
        AND n."rbtSigned"
        AND n."parentSigned"
        AND n."bcbaSigned"
        AND n."isConverted"
        AND n."structuredContent" IS NULL
        AND n."checklistSnapshot" IS NULL
        AND n."billableUnits" IS NULL
        AND n."rbtSignedAt" IS NULL
        AND n."parentSignedAt" IS NULL
        AND n."bcbaSignedAt" IS NULL
        AND nullif(btrim(n."rbtSignerName"), '') IS NULL
        AND nullif(btrim(n."parentSignerName"), '') IS NULL
        AND nullif(btrim(n."bcbaSignerName"), '') IS NULL
        AND nullif(btrim(n."plutusClaimRef"), '') IS NULL
        AND n."convertedAt" IS NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM "Document" x WHERE x."clientId" = c.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM "Authorization" x WHERE x."clientId" = c.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM "ContactLog" x WHERE x."clientId" = c.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM "RbtOnboarding" x WHERE x."clientId" = c.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM "IntakePacket" x WHERE x."clientId" = c.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM "PARequest" x WHERE x."clientId" = c.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM "ClientMessage" x WHERE x."clientId" = c.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM "ActionItem" x WHERE x."clientId" = c.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM "SkillTarget" x WHERE x."clientId" = c.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM "BehaviorTarget" x WHERE x."clientId" = c.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM "ScheduleAppointment" x WHERE x."clientId" = c.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM "ReAuthPacket" x WHERE x."clientId" = c.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM "CaseOpening" x WHERE x."clientId" = c.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "SessionTrialData" x
      WHERE x."sessionId" = '89b5b721-3271-4d21-807c-45707c4f9826'::uuid
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "BehaviorLog" x
      WHERE x."sessionId" = '89b5b721-3271-4d21-807c-45707c4f9826'::uuid
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "EVVLog" x
      WHERE x."sessionId" = '89b5b721-3271-4d21-807c-45707c4f9826'::uuid
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "NoteDeficiency" x
      WHERE x."noteId" = '835cedd7-6c8f-488a-8eef-73f9d8756ada'::uuid
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "AuditLogVault" x
      WHERE x."resourceId" IN (
        c.id::text,
        '89b5b721-3271-4d21-807c-45707c4f9826',
        '835cedd7-6c8f-488a-8eef-73f9d8756ada'
      )
    );

  IF NOT safe_to_delete THEN
    RAISE EXCEPTION
      'legacy Studio artifact delete refused: exact isolation predicates no longer match';
  END IF;

  DELETE FROM "Client"
  WHERE id = '6585876c-351d-4277-be13-77628acf7b8b'::uuid;

  GET DIAGNOSTICS deleted_rows = ROW_COUNT;
  IF deleted_rows <> 1 THEN
    RAISE EXCEPTION
      'legacy Studio artifact delete refused: expected Client DELETE row count 1, got %',
      deleted_rows;
  END IF;

  RAISE NOTICE
    'legacy Studio artifact deleted; Client row count = 1; checked cascade Session = 1 and SessionNote = 1';
END
$delete_legacy_studio_artifact$;

-- ---------------------------------------------------------------------------
-- Postflight: expected inside this transaction before COMMIT/ROLLBACK.
-- ---------------------------------------------------------------------------

SELECT
  n.id::text AS "noteId",
  n."sessionId"::text AS "sessionId",
  n."rbtSigned",
  n."parentSigned",
  n."bcbaSigned",
  n."isConverted",
  (n."checklistSnapshot" IS NULL) AS "checklistRequiresResubmit",
  (n."convertedAt" IS NULL) AS "convertedAtCleared",
  (nullif(btrim(n."plutusClaimRef"), '') IS NULL) AS "plutusClaimRefCleared"
FROM "SessionNote" n
WHERE n.id = '317fe47d-eed7-4a2b-bbfb-885a94ec0230'::uuid;

SELECT
  (SELECT count(*)::int FROM "Client"
    WHERE id = '6585876c-351d-4277-be13-77628acf7b8b'::uuid)
    AS "legacyClientRows",
  (SELECT count(*)::int FROM "Session"
    WHERE id = '89b5b721-3271-4d21-807c-45707c4f9826'::uuid)
    AS "legacySessionRows",
  (SELECT count(*)::int FROM "SessionNote"
    WHERE id = '835cedd7-6c8f-488a-8eef-73f9d8756ada'::uuid)
    AS "legacyNoteRows";

-- Both targeted DQ4 rows must now be absent from the converted-integrity set.
SELECT count(*)::int AS "targetedConvertedIntegrityViolations"
FROM "SessionNote" n
LEFT JOIN "Session" s ON s.id = n."sessionId"
WHERE n.id IN (
    '317fe47d-eed7-4a2b-bbfb-885a94ec0230'::uuid,
    '835cedd7-6c8f-488a-8eef-73f9d8756ada'::uuid
  )
  AND n."isConverted"
  AND (
    NOT n."rbtSigned"
    OR NOT n."bcbaSigned"
    OR n."rbtSignedAt" IS NULL
    OR n."bcbaSignedAt" IS NULL
    OR nullif(btrim(n."rbtSignerName"), '') IS NULL
    OR nullif(btrim(n."bcbaSignerName"), '') IS NULL
    OR nullif(btrim(n."plutusClaimRef"), '') IS NULL
    OR n."convertedAt" IS NULL
    OR n."checklistSnapshot" IS NULL
    OR jsonb_typeof(n."checklistSnapshot") <> 'object'
    OR n."checklistSnapshot"->>'passed' IS DISTINCT FROM 'true'
    OR s.id IS NULL
    OR s.status::text <> 'COMPLETED'
    OR EXISTS (
      SELECT 1
      FROM "NoteDeficiency" d
      WHERE d."noteId" = n.id
        AND d.status = 'OPEN'
    )
  );

-- The targeted DQ7 Client must be absent; do not synthesize assignments/sessions.
SELECT count(*)::int AS "targetedActiveBridgeEViolations"
FROM "Client" c
WHERE c.id = '6585876c-351d-4277-be13-77628acf7b8b'::uuid
  AND c.status = 'ACTIVE'
  AND (
    c."rbtId" IS NULL
    OR c."bcbaId" IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM "Session" s
      WHERE s."clientId" = c.id
        AND coalesce(btrim(s."cptCode"), '') <> '97151'
        AND s.status IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED')
        AND s."rbtId" IS NOT NULL
        AND s."bcbaId" IS NOT NULL
    )
  );

-- Safety default: leaves the database unchanged.
ROLLBACK;
-- APPLY ONLY AFTER REVIEW: replace the preceding ROLLBACK with COMMIT.
