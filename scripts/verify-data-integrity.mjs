#!/usr/bin/env node
/**
 * verify-data-integrity.mjs — live, READ-ONLY data-quality checker.
 *
 * Run:   node scripts/verify-data-integrity.mjs
 * Test:  node scripts/verify-data-integrity.mjs --self-test
 * Env:   DATABASE_URL (loaded from repo-root .env only when not already set)
 * Exit:  0 = clean, 1 = violations, 2 = safety/query error
 *
 * Safety:
 * - The pg startup packet forces default_transaction_read_only=on.
 * - If the session pooler strips that startup GUC, one exact session-local
 *   SET default_transaction_read_only=on is issued before Prisma can query.
 * - The pool is limited to one connection, and the GUC is verified before and
 *   after all checks.
 * - Every data statement must be SELECT / WITH ... SELECT / SHOW.
 * - This file contains no DDL, DML, cleanup command, or automatic repair.
 *
 * Output intentionally contains record IDs and invariant reasons, not names,
 * emails, member identifiers, clinical content, or other PHI.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MUTATING_SQL =
  /\b(ALTER|CALL|COMMENT|COPY|CREATE|DELETE|DO|DROP|GRANT|INSERT|MERGE|REFRESH|REINDEX|REVOKE|SECURITY\s+LABEL|TRUNCATE|UPDATE|VACUUM)\b/i;
const LOCKING_SELECT = /\bFOR\s+(?:NO\s+KEY\s+)?UPDATE\b|\bFOR\s+(?:KEY\s+)?SHARE\b/i;
const READ_ONLY_SESSION_SETUP_SQL = 'SET default_transaction_read_only = on';

function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--.*$/gm, ' ');
}

function stripSqlStringLiterals(sql) {
  let output = '';
  let inString = false;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    if (char !== "'") {
      if (!inString) output += char;
      continue;
    }

    if (inString && sql[index + 1] === "'") {
      index += 1;
      continue;
    }
    inString = !inString;
    output += ' ';
  }

  if (inString) {
    throw new Error('Read-only SQL guard: unterminated string literal.');
  }
  return output;
}

function assertReadOnlySql(sql) {
  const normalized = stripSqlComments(sql).trim();
  const safetySurface = stripSqlStringLiterals(normalized);
  if (!/^(SELECT|SHOW|WITH)\b/i.test(normalized)) {
    throw new Error('Read-only SQL guard: statement must start with SELECT, SHOW, or WITH.');
  }
  if (safetySurface.includes(';')) {
    throw new Error('Read-only SQL guard: multiple/terminated statements are not allowed.');
  }
  if (MUTATING_SQL.test(safetySurface) || LOCKING_SELECT.test(safetySurface)) {
    throw new Error('Read-only SQL guard: mutating or row-locking SQL is not allowed.');
  }
}

function assertReadOnlySessionSetupSql(sql) {
  if (sql !== READ_ONLY_SESSION_SETUP_SQL) {
    throw new Error('Read-only session guard: only the exact read-only GUC setup is allowed.');
  }
}

function runSelfTests() {
  assert.doesNotThrow(() => assertReadOnlySql('SELECT 1'));
  assert.doesNotThrow(() => assertReadOnlySql('SHOW default_transaction_read_only'));
  assert.doesNotThrow(() =>
    assertReadOnlySql('WITH ids AS (SELECT id FROM "Client") SELECT id FROM ids')
  );
  assert.doesNotThrow(() => assertReadOnlySql("SELECT concat_ws('; ', 'safe literal')"));
  assert.throws(
    () => assertReadOnlySql('UPDATE "Client" SET status = \'ACTIVE\''),
    /read-only/i
  );
  assert.throws(
    () => assertReadOnlySql('WITH removed AS (DELETE FROM "Client" RETURNING id) SELECT id FROM removed'),
    /read-only/i
  );
  assert.throws(() => assertReadOnlySql('SELECT 1; SELECT 2'), /read-only/i);
  assert.throws(() => assertReadOnlySql('SELECT id FROM "Client" FOR UPDATE'), /read-only/i);
  assert.doesNotThrow(() => assertReadOnlySessionSetupSql(READ_ONLY_SESSION_SETUP_SQL));
  assert.throws(() => assertReadOnlySessionSetupSql('SET ROLE postgres'), /read-only/i);
  console.log('Self-tests passed: SQL guard permits reads and rejects writes/locks.');
}

function loadDotEnv() {
  if (process.env.DATABASE_URL) return;

  let raw;
  try {
    raw = readFileSync(path.join(repoRoot, '.env'), 'utf8');
  } catch {
    return;
  }

  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/
    );
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;

    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

const CHECKS = [
  {
    key: 'DQ1',
    title: 'Duplicate supposedly-unique business records',
    definition:
      'Normalized staff/candidate emails, candidate BACB numbers, client payer identifiers, probable client identity, PA/auth references, case codes, and one-open-listing-per-client.',
    cleanup:
      '-- Review each ID set with its owning team; choose a canonical row, reconcile dependencies, and only then archive/merge duplicates. Add normalized uniqueness only after the live rows are clean.',
    sql: `
      WITH
      user_email_dupes AS (
        SELECT array_agg(id::text ORDER BY id::text) AS ids, count(*) AS n
        FROM "User"
        WHERE nullif(lower(btrim(email)), '') IS NOT NULL
        GROUP BY lower(btrim(email))
        HAVING count(*) > 1
      ),
      candidate_email_dupes AS (
        SELECT array_agg(id::text ORDER BY id::text) AS ids, count(*) AS n
        FROM "AtsCandidate"
        WHERE nullif(lower(btrim(email)), '') IS NOT NULL
        GROUP BY lower(btrim(email))
        HAVING count(*) > 1
      ),
      candidate_bacb_dupes AS (
        SELECT array_agg(id::text ORDER BY id::text) AS ids, count(*) AS n
        FROM "AtsCandidate"
        WHERE nullif(regexp_replace(upper(btrim("bacbNumber")), '[^A-Z0-9]', '', 'g'), '') IS NOT NULL
        GROUP BY regexp_replace(upper(btrim("bacbNumber")), '[^A-Z0-9]', '', 'g')
        HAVING count(*) > 1
      ),
      client_medicaid_dupes AS (
        SELECT array_agg(id::text ORDER BY id::text) AS ids, count(*) AS n
        FROM "Client"
        WHERE nullif(regexp_replace(upper(btrim("medicaidId")), '[^A-Z0-9]', '', 'g'), '') IS NOT NULL
        GROUP BY regexp_replace(upper(btrim("medicaidId")), '[^A-Z0-9]', '', 'g')
        HAVING count(*) > 1
      ),
      client_member_dupes AS (
        SELECT array_agg(id::text ORDER BY id::text) AS ids, count(*) AS n
        FROM "Client"
        WHERE nullif(regexp_replace(upper(btrim("memberId")), '[^A-Z0-9]', '', 'g'), '') IS NOT NULL
        GROUP BY
          coalesce(nullif(regexp_replace(upper(btrim("insurancePayer")), '\\s+', '', 'g'), ''), 'UNKNOWN'),
          regexp_replace(upper(btrim("memberId")), '[^A-Z0-9]', '', 'g')
        HAVING count(*) > 1
      ),
      probable_client_dupes AS (
        SELECT array_agg(id::text ORDER BY id::text) AS ids, count(*) AS n
        FROM "Client"
        WHERE "dateOfBirth" IS NOT NULL
          AND nullif(lower(btrim("firstName")), '') IS NOT NULL
          AND nullif(lower(btrim("lastName")), '') IS NOT NULL
        GROUP BY lower(btrim("firstName")), lower(btrim("lastName")), "dateOfBirth"::date
        HAVING count(*) > 1
      ),
      pa_auth_dupes AS (
        SELECT array_agg(id::text ORDER BY id::text) AS ids, count(*) AS n
        FROM "PARequest"
        WHERE nullif(regexp_replace(upper(btrim("authNumber")), '[^A-Z0-9]', '', 'g'), '') IS NOT NULL
        GROUP BY "clientId", type, regexp_replace(upper(btrim("authNumber")), '[^A-Z0-9]', '', 'g')
        HAVING count(*) > 1
      ),
      authorization_auth_dupes AS (
        SELECT array_agg(id::text ORDER BY id::text) AS ids, count(*) AS n
        FROM "Authorization"
        WHERE nullif(regexp_replace(upper(btrim("authNumber")), '[^A-Z0-9]', '', 'g'), '') IS NOT NULL
        GROUP BY "clientId", type, regexp_replace(upper(btrim("authNumber")), '[^A-Z0-9]', '', 'g')
        HAVING count(*) > 1
      ),
      case_code_dupes AS (
        SELECT array_agg(id::text ORDER BY id::text) AS ids, count(*) AS n
        FROM "CaseOpening"
        WHERE nullif(lower(btrim("caseCode")), '') IS NOT NULL
        GROUP BY lower(btrim("caseCode"))
        HAVING count(*) > 1
      ),
      open_case_dupes AS (
        SELECT array_agg(id::text ORDER BY id::text) AS ids, count(*) AS n
        FROM "CaseOpening"
        WHERE status = 'OPEN'
        GROUP BY "clientId"
        HAVING count(*) > 1
      )
      SELECT 'User.normalizedEmail' AS "entityType", ids[1] AS "entityId",
        array_to_string(ids, ', ') AS "relatedIds",
        format('%s staff rows share one normalized email', n) AS reason
      FROM user_email_dupes
      UNION ALL
      SELECT 'AtsCandidate.normalizedEmail', ids[1], array_to_string(ids, ', '),
        format('%s candidate rows share one normalized email', n)
      FROM candidate_email_dupes
      UNION ALL
      SELECT 'AtsCandidate.normalizedBacbNumber', ids[1], array_to_string(ids, ', '),
        format('%s candidate rows share one normalized BACB number', n)
      FROM candidate_bacb_dupes
      UNION ALL
      SELECT 'Client.normalizedMedicaidId', ids[1], array_to_string(ids, ', '),
        format('%s clients share one normalized Medicaid identifier', n)
      FROM client_medicaid_dupes
      UNION ALL
      SELECT 'Client.payerMemberId', ids[1], array_to_string(ids, ', '),
        format('%s clients share one normalized payer/member identifier', n)
      FROM client_member_dupes
      UNION ALL
      SELECT 'Client.nameDob', ids[1], array_to_string(ids, ', '),
        format('%s clients share normalized name + date of birth (review as probable duplicates)', n)
      FROM probable_client_dupes
      UNION ALL
      SELECT 'PARequest.authNumber', ids[1], array_to_string(ids, ', '),
        format('%s PA requests for one client/type share an auth reference', n)
      FROM pa_auth_dupes
      UNION ALL
      SELECT 'Authorization.authNumber', ids[1], array_to_string(ids, ', '),
        format('%s authorizations for one client/type share an auth reference', n)
      FROM authorization_auth_dupes
      UNION ALL
      SELECT 'CaseOpening.caseCode', ids[1], array_to_string(ids, ', '),
        format('%s openings share one normalized case code', n)
      FROM case_code_dupes
      UNION ALL
      SELECT 'CaseOpening.openPerClient', ids[1], array_to_string(ids, ', '),
        format('%s OPEN listings exist for one client', n)
      FROM open_case_dupes
      ORDER BY 1, 2
    `,
  },
  {
    key: 'DQ2',
    title: 'Orphan-like or semantically invalid references',
    definition:
      'Missing parents, wrong-role assignees, and cross-client clinical data links on high-risk CRM/HRM bridge records.',
    cleanup:
      '-- Confirm the intended owner on each record, then repair the reference through the owning application workflow. Do not delete clinical or audit-linked rows solely because this check flags them.',
    sql: `
      WITH issues AS (
        SELECT 'Client.caseCoordinatorId'::text AS "entityType", c.id::text AS "entityId",
          c."caseCoordinatorId"::text AS "relatedIds",
          CASE
            WHEN u.id IS NULL THEN 'assigned case coordinator User is missing'
            WHEN u.role::text <> 'CASE_COORDINATOR' THEN 'assigned User does not have CASE_COORDINATOR role'
            ELSE 'assigned case coordinator User is inactive'
          END AS reason
        FROM "Client" c
        LEFT JOIN "User" u ON u.id = c."caseCoordinatorId"
        WHERE c."caseCoordinatorId" IS NOT NULL
          AND (u.id IS NULL OR u.role::text <> 'CASE_COORDINATOR' OR NOT u."isActive")

        UNION ALL
        SELECT 'Client.clinicalSupportId', c.id::text, c."clinicalSupportId"::text,
          CASE
            WHEN u.id IS NULL THEN 'assigned clinical-support User is missing'
            WHEN u.role::text <> 'CLINICAL_SUPPORT' THEN 'assigned User does not have CLINICAL_SUPPORT role'
            ELSE 'assigned clinical-support User is inactive'
          END
        FROM "Client" c
        LEFT JOIN "User" u ON u.id = c."clinicalSupportId"
        WHERE c."clinicalSupportId" IS NOT NULL
          AND (u.id IS NULL OR u.role::text <> 'CLINICAL_SUPPORT' OR NOT u."isActive")

        UNION ALL
        SELECT 'Client.bcbaId', c.id::text, c."bcbaId"::text,
          CASE
            WHEN u.id IS NULL THEN 'assigned BCBA User is missing'
            WHEN u.role::text <> 'BCBA' THEN 'assigned User does not have BCBA role'
            ELSE 'assigned BCBA User is inactive'
          END
        FROM "Client" c
        LEFT JOIN "User" u ON u.id = c."bcbaId"
        WHERE c."bcbaId" IS NOT NULL
          AND (u.id IS NULL OR u.role::text <> 'BCBA' OR NOT u."isActive")

        UNION ALL
        SELECT 'Client.rbtId', c.id::text, c."rbtId"::text,
          CASE
            WHEN u.id IS NULL THEN 'assigned RBT User is missing'
            WHEN u.role::text <> 'RBT' THEN 'assigned User does not have RBT role'
            ELSE 'assigned RBT User is inactive'
          END
        FROM "Client" c
        LEFT JOIN "User" u ON u.id = c."rbtId"
        WHERE c."rbtId" IS NOT NULL
          AND (u.id IS NULL OR u.role::text <> 'RBT' OR NOT u."isActive")

        UNION ALL
        SELECT 'Session.clientId', s.id::text, s."clientId"::text, 'Session client is missing'
        FROM "Session" s
        LEFT JOIN "Client" c ON c.id = s."clientId"
        WHERE c.id IS NULL

        UNION ALL
        SELECT 'Session.rbtId', s.id::text, s."rbtId"::text,
          CASE WHEN u.id IS NULL THEN 'Session RBT User is missing'
            ELSE 'Session rbtId does not reference an RBT User' END
        FROM "Session" s
        LEFT JOIN "User" u ON u.id = s."rbtId"
        WHERE s."rbtId" IS NOT NULL AND (u.id IS NULL OR u.role::text <> 'RBT')

        UNION ALL
        SELECT 'Session.bcbaId', s.id::text, s."bcbaId"::text,
          CASE WHEN u.id IS NULL THEN 'Session BCBA User is missing'
            ELSE 'Session bcbaId does not reference a BCBA User' END
        FROM "Session" s
        LEFT JOIN "User" u ON u.id = s."bcbaId"
        WHERE s."bcbaId" IS NOT NULL AND (u.id IS NULL OR u.role::text <> 'BCBA')

        UNION ALL
        SELECT 'SessionNote.sessionId', n.id::text, n."sessionId"::text, 'SessionNote parent Session is missing'
        FROM "SessionNote" n
        LEFT JOIN "Session" s ON s.id = n."sessionId"
        WHERE s.id IS NULL

        UNION ALL
        SELECT 'PARequest.clientId', p.id::text, p."clientId"::text, 'PARequest client is missing'
        FROM "PARequest" p
        LEFT JOIN "Client" c ON c.id = p."clientId"
        WHERE c.id IS NULL

        UNION ALL
        SELECT 'Authorization.clientId', a.id::text, a."clientId"::text, 'Authorization client is missing'
        FROM "Authorization" a
        LEFT JOIN "Client" c ON c.id = a."clientId"
        WHERE c.id IS NULL

        UNION ALL
        SELECT 'AuthCptCode.authorizationId', ac.id::text, ac."authorizationId"::text,
          'AuthCptCode parent Authorization is missing'
        FROM "AuthCptCode" ac
        LEFT JOIN "Authorization" a ON a.id = ac."authorizationId"
        WHERE a.id IS NULL

        UNION ALL
        SELECT 'SessionTrialData.targetClient', t.id::text,
          concat_ws(', ', t."sessionId"::text, t."targetId"::text),
          CASE
            WHEN s.id IS NULL THEN 'trial parent Session is missing'
            WHEN st.id IS NULL THEN 'trial SkillTarget is missing'
            ELSE 'trial SkillTarget belongs to a different client than the Session'
          END
        FROM "SessionTrialData" t
        LEFT JOIN "Session" s ON s.id = t."sessionId"
        LEFT JOIN "SkillTarget" st ON st.id = t."targetId"
        WHERE s.id IS NULL OR st.id IS NULL OR s."clientId" <> st."clientId"

        UNION ALL
        SELECT 'BehaviorLog.behaviorClient', b.id::text,
          concat_ws(', ', b."sessionId"::text, b."behaviorId"::text),
          CASE
            WHEN s.id IS NULL THEN 'behavior log parent Session is missing'
            WHEN bt.id IS NULL THEN 'behavior log BehaviorTarget is missing'
            ELSE 'BehaviorTarget belongs to a different client than the Session'
          END
        FROM "BehaviorLog" b
        LEFT JOIN "Session" s ON s.id = b."sessionId"
        LEFT JOIN "BehaviorTarget" bt ON bt.id = b."behaviorId"
        WHERE s.id IS NULL OR bt.id IS NULL OR s."clientId" <> bt."clientId"

        UNION ALL
        SELECT 'EVVLog.sessionOrStaff', e.id::text,
          concat_ws(', ', e."sessionId"::text, e."staffId"::text),
          CASE
            WHEN s.id IS NULL THEN 'EVV parent Session is missing'
            WHEN u.id IS NULL THEN 'EVV staff User is missing'
            ELSE 'EVV staff does not have RBT role'
          END
        FROM "EVVLog" e
        LEFT JOIN "Session" s ON s.id = e."sessionId"
        LEFT JOIN "User" u ON u.id = e."staffId"
        WHERE s.id IS NULL OR u.id IS NULL OR u.role::text <> 'RBT'

        UNION ALL
        SELECT 'RbtOnboarding.clientOrRbt', o.id::text,
          concat_ws(', ', o."clientId"::text, o."rbtId"::text),
          CASE
            WHEN c.id IS NULL THEN 'RbtOnboarding client is missing'
            WHEN u.id IS NULL THEN 'RbtOnboarding RBT User is missing'
            WHEN u.role::text <> 'RBT' THEN 'RbtOnboarding rbtId does not reference an RBT User'
            ELSE 'RbtOnboarding RBT does not match Client.rbtId'
          END
        FROM "RbtOnboarding" o
        LEFT JOIN "Client" c ON c.id = o."clientId"
        LEFT JOIN "User" u ON u.id = o."rbtId"
        WHERE c.id IS NULL OR u.id IS NULL OR u.role::text <> 'RBT'
          OR (c."rbtId" IS NOT NULL AND c."rbtId" <> o."rbtId")

        UNION ALL
        SELECT 'ReAuthPacket.paRequestId', r.id::text,
          concat_ws(', ', r."clientId"::text, r."paRequestId"::text),
          CASE
            WHEN c.id IS NULL THEN 'ReAuthPacket client is missing'
            WHEN r."paRequestId" IS NOT NULL AND p.id IS NULL THEN 'referenced PARequest is missing'
            ELSE 'referenced PARequest belongs to a different client'
          END
        FROM "ReAuthPacket" r
        LEFT JOIN "Client" c ON c.id = r."clientId"
        LEFT JOIN "PARequest" p ON p.id = r."paRequestId"
        WHERE c.id IS NULL
          OR (r."paRequestId" IS NOT NULL AND (p.id IS NULL OR p."clientId" <> r."clientId"))

        UNION ALL
        SELECT 'ScheduleAppointment.clientOrStaff', a.id::text,
          concat_ws(', ', a."clientId"::text, a."rbtId"::text, a."bcbaId"::text),
          CASE
            WHEN c.id IS NULL THEN 'ScheduleAppointment client is missing'
            WHEN a."rbtId" IS NOT NULL AND (rbt.id IS NULL OR rbt.role::text <> 'RBT')
              THEN 'ScheduleAppointment rbtId is missing or not an RBT User'
            ELSE 'ScheduleAppointment bcbaId is missing or not a BCBA User'
          END
        FROM "ScheduleAppointment" a
        LEFT JOIN "Client" c ON c.id = a."clientId"
        LEFT JOIN "User" rbt ON rbt.id = a."rbtId"
        LEFT JOIN "User" bcba ON bcba.id = a."bcbaId"
        WHERE c.id IS NULL
          OR (a."rbtId" IS NOT NULL AND (rbt.id IS NULL OR rbt.role::text <> 'RBT'))
          OR (a."bcbaId" IS NOT NULL AND (bcba.id IS NULL OR bcba.role::text <> 'BCBA'))

        UNION ALL
        SELECT 'AtsCandidate.userId', a.id::text, a."userId"::text,
          CASE
            WHEN u.id IS NULL THEN 'linked staff User is missing'
            WHEN a."appliedRole" = 'BCBA' THEN 'linked staff User does not have BCBA role'
            ELSE 'linked staff User does not have RBT role'
          END
        FROM "AtsCandidate" a
        LEFT JOIN "User" u ON u.id = a."userId"
        WHERE a."userId" IS NOT NULL
          AND (
            u.id IS NULL
            OR (a."appliedRole" = 'BCBA' AND u.role::text <> 'BCBA')
            OR (a."appliedRole" <> 'BCBA' AND u.role::text <> 'RBT')
          )

        UNION ALL
        SELECT 'CandidateOnboardingPacket.candidateId', p.id::text, p."candidateId"::text,
          'CandidateOnboardingPacket parent candidate is missing'
        FROM "CandidateOnboardingPacket" p
        LEFT JOIN "AtsCandidate" a ON a.id = p."candidateId"
        WHERE a.id IS NULL

        UNION ALL
        SELECT 'CaseOpening.clientOrCreator', o.id::text,
          concat_ws(', ', o."clientId"::text, o."createdById"::text),
          CASE WHEN c.id IS NULL THEN 'CaseOpening client is missing'
            ELSE 'CaseOpening creator User is missing' END
        FROM "CaseOpening" o
        LEFT JOIN "Client" c ON c.id = o."clientId"
        LEFT JOIN "User" u ON u.id = o."createdById"
        WHERE c.id IS NULL OR u.id IS NULL

        UNION ALL
        SELECT 'CaseApplication.openingOrRbt', a.id::text,
          concat_ws(', ', a."openingId"::text, a."rbtUserId"::text),
          CASE
            WHEN o.id IS NULL THEN 'CaseApplication opening is missing'
            WHEN u.id IS NULL THEN 'CaseApplication RBT User is missing'
            ELSE 'CaseApplication rbtUserId does not reference an RBT User'
          END
        FROM "CaseApplication" a
        LEFT JOIN "CaseOpening" o ON o.id = a."openingId"
        LEFT JOIN "User" u ON u.id = a."rbtUserId"
        WHERE o.id IS NULL OR u.id IS NULL OR u.role::text <> 'RBT'
      )
      SELECT "entityType", "entityId", "relatedIds", reason
      FROM issues
      ORDER BY "entityType", "entityId"
    `,
  },
  {
    key: 'DQ3',
    title: 'COMPLETED Session without SessionNote',
    definition: 'Every Session whose status is COMPLETED must have its one-to-one SessionNote.',
    cleanup:
      '-- Reopen the affected Session in Session Studio and submit the real note. Never synthesize clinical content or insert a placeholder note to silence this check.',
    sql: `
      SELECT 'Session.completedWithoutNote' AS "entityType", s.id::text AS "entityId",
        s."clientId"::text AS "relatedIds",
        'COMPLETED Session has no SessionNote' AS reason
      FROM "Session" s
      LEFT JOIN "SessionNote" n ON n."sessionId" = s.id
      WHERE s.status = 'COMPLETED' AND n.id IS NULL
      ORDER BY s."scheduledStart", s.id
    `,
  },
  {
    key: 'DQ4',
    title: 'Converted note missing signatures, checklist, or Plutus reference',
    definition:
      'Converted notes require completed Session state, RBT/BCBA signature flags and audit metadata, green checklist snapshot, convertedAt, Plutus reference, and no open deficiency.',
    cleanup:
      '-- Reconcile each note against Plutus and AuditLogVault. Use an audited staff workflow to correct signature metadata/reference or intentionally un-convert and re-convert; never patch claim state blindly.',
    sql: `
      SELECT 'SessionNote.convertedIntegrity' AS "entityType", n.id::text AS "entityId",
        n."sessionId"::text AS "relatedIds",
        concat_ws('; ',
          CASE WHEN NOT n."rbtSigned" THEN 'rbtSigned=false' END,
          CASE WHEN NOT n."bcbaSigned" THEN 'bcbaSigned=false' END,
          CASE WHEN n."rbtSignedAt" IS NULL THEN 'rbtSignedAt missing' END,
          CASE WHEN n."bcbaSignedAt" IS NULL THEN 'bcbaSignedAt missing' END,
          CASE WHEN nullif(btrim(n."rbtSignerName"), '') IS NULL THEN 'rbtSignerName missing' END,
          CASE WHEN nullif(btrim(n."bcbaSignerName"), '') IS NULL THEN 'bcbaSignerName missing' END,
          CASE WHEN nullif(btrim(n."plutusClaimRef"), '') IS NULL THEN 'plutusClaimRef missing' END,
          CASE WHEN n."convertedAt" IS NULL THEN 'convertedAt missing' END,
          CASE
            WHEN n."checklistSnapshot" IS NULL
              OR jsonb_typeof(n."checklistSnapshot") <> 'object'
              OR n."checklistSnapshot"->>'passed' IS DISTINCT FROM 'true'
            THEN 'checklistSnapshot.passed is not true'
          END,
          CASE WHEN s.id IS NULL THEN 'parent Session missing'
            WHEN s.status::text <> 'COMPLETED' THEN 'parent Session is not COMPLETED' END,
          CASE WHEN EXISTS (
            SELECT 1 FROM "NoteDeficiency" d
            WHERE d."noteId" = n.id AND d.status = 'OPEN'
          ) THEN 'open NoteDeficiency exists' END
        ) AS reason
      FROM "SessionNote" n
      LEFT JOIN "Session" s ON s.id = n."sessionId"
      WHERE n."isConverted"
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
            SELECT 1 FROM "NoteDeficiency" d
            WHERE d."noteId" = n.id AND d.status = 'OPEN'
          )
        )
      ORDER BY n."convertedAt" NULLS FIRST, n.id
    `,
  },
  {
    key: 'DQ5',
    title: 'PA/auth invalid windows or negative units',
    definition:
      'Approved windows require both bounds in chronological order; unit fields may not be negative.',
    cleanup:
      '-- Billing must validate the payer source document, then correct dates/units through the PA or Authorization tracker workflow. Do not infer a date range or unit allowance from neighboring records.',
    sql: `
      WITH issues AS (
        SELECT 'PARequest.windowOrUnits'::text AS "entityType", p.id::text AS "entityId",
          p."clientId"::text AS "relatedIds",
          concat_ws('; ',
            CASE WHEN p."effectiveDate" IS NOT NULL AND p."expirationDate" IS NOT NULL
              AND p."effectiveDate" > p."expirationDate" THEN 'effectiveDate is after expirationDate' END,
            CASE WHEN p.status = 'APPROVED'
              AND (p."effectiveDate" IS NULL OR p."expirationDate" IS NULL)
              THEN 'APPROVED PA is missing a window bound' END,
            CASE WHEN p."approvedUnits" < 0 THEN 'approvedUnits is negative' END
          ) AS reason
        FROM "PARequest" p
        WHERE (
            p."effectiveDate" IS NOT NULL AND p."expirationDate" IS NOT NULL
            AND p."effectiveDate" > p."expirationDate"
          )
          OR (p.status = 'APPROVED' AND (p."effectiveDate" IS NULL OR p."expirationDate" IS NULL))
          OR p."approvedUnits" < 0

        UNION ALL
        SELECT 'Authorization.windowOrUnits', a.id::text, a."clientId"::text,
          concat_ws('; ',
            CASE WHEN a."startDate" IS NOT NULL AND a."endDate" IS NOT NULL
              AND a."startDate" > a."endDate" THEN 'startDate is after endDate' END,
            CASE WHEN a.status = 'APPROVED' AND (a."startDate" IS NULL OR a."endDate" IS NULL)
              THEN 'APPROVED Authorization is missing a window bound' END,
            CASE WHEN a."unitsRequested" < 0 THEN 'unitsRequested is negative' END,
            CASE WHEN a."unitsApproved" < 0 THEN 'unitsApproved is negative' END
          )
        FROM "Authorization" a
        WHERE (
            a."startDate" IS NOT NULL AND a."endDate" IS NOT NULL
            AND a."startDate" > a."endDate"
          )
          OR (a.status = 'APPROVED' AND (a."startDate" IS NULL OR a."endDate" IS NULL))
          OR a."unitsRequested" < 0
          OR a."unitsApproved" < 0

        UNION ALL
        SELECT 'AuthCptCode.negativeUnits', c.id::text, c."authorizationId"::text,
          'unitsApproved is negative'
        FROM "AuthCptCode" c
        WHERE c."unitsApproved" < 0
      )
      SELECT "entityType", "entityId", "relatedIds", reason
      FROM issues
      ORDER BY "entityType", "entityId"
    `,
  },
  {
    key: 'DQ6',
    title: 'HIRED RBT candidate without a valid RBT User',
    definition:
      'AtsCandidate rows at HIRED with appliedRole=RBT require a linked, active RBT User with the same normalized email.',
    cleanup:
      '-- Re-run the reviewed hire/link workflow after confirming candidate identity. Do not fabricate a User row or relink by name alone.',
    sql: `
      SELECT 'AtsCandidate.hiredRbtUser' AS "entityType", a.id::text AS "entityId",
        a."userId"::text AS "relatedIds",
        concat_ws('; ',
          CASE WHEN a."userId" IS NULL THEN 'userId missing' END,
          CASE WHEN a."userId" IS NOT NULL AND u.id IS NULL THEN 'linked User missing' END,
          CASE WHEN u.id IS NOT NULL AND u.role::text <> 'RBT' THEN 'linked User role is not RBT' END,
          CASE WHEN u.id IS NOT NULL AND NOT u."isActive" THEN 'linked RBT User is inactive' END,
          CASE WHEN u.id IS NOT NULL AND lower(btrim(u.email)) <> lower(btrim(a.email))
            THEN 'candidate/User normalized emails do not match' END
        ) AS reason
      FROM "AtsCandidate" a
      LEFT JOIN "User" u ON u.id = a."userId"
      WHERE a.stage = 'HIRED'
        AND a."appliedRole" = 'RBT'
        AND (
          a."userId" IS NULL
          OR u.id IS NULL
          OR u.role::text <> 'RBT'
          OR NOT u."isActive"
          OR lower(btrim(u.email)) <> lower(btrim(a.email))
        )
      ORDER BY a."updatedAt", a.id
    `,
  },
  {
    key: 'DQ7',
    title: 'ACTIVE Client missing required Bridge E assignments',
    definition:
      'ACTIVE requires active RBT + BCBA assignments and a durable non-assessment Session in SCHEDULED, IN_PROGRESS, or COMPLETED state.',
    cleanup:
      '-- Ops/Case Coord should review the activation history: restore valid RBT/BCBA assignments and a real therapy Session, or intentionally move the client out of ACTIVE through the approved lifecycle workflow.',
    sql: `
      SELECT 'Client.activeBridgeE' AS "entityType", c.id::text AS "entityId",
        concat_ws(', ', c."rbtId"::text, c."bcbaId"::text) AS "relatedIds",
        concat_ws('; ',
          CASE WHEN c."rbtId" IS NULL THEN 'rbtId missing' END,
          CASE WHEN c."rbtId" IS NOT NULL AND rbt.id IS NULL THEN 'assigned RBT User missing' END,
          CASE WHEN rbt.id IS NOT NULL AND rbt.role::text <> 'RBT' THEN 'assigned RBT User has wrong role' END,
          CASE WHEN rbt.id IS NOT NULL AND NOT rbt."isActive" THEN 'assigned RBT User is inactive' END,
          CASE WHEN c."bcbaId" IS NULL THEN 'bcbaId missing' END,
          CASE WHEN c."bcbaId" IS NOT NULL AND bcba.id IS NULL THEN 'assigned BCBA User missing' END,
          CASE WHEN bcba.id IS NOT NULL AND bcba.role::text <> 'BCBA' THEN 'assigned BCBA User has wrong role' END,
          CASE WHEN bcba.id IS NOT NULL AND NOT bcba."isActive" THEN 'assigned BCBA User is inactive' END,
          CASE WHEN NOT EXISTS (
            SELECT 1
            FROM "Session" s
            WHERE s."clientId" = c.id
              AND coalesce(btrim(s."cptCode"), '') <> '97151'
              AND s.status IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED')
              AND s."rbtId" IS NOT NULL
              AND s."bcbaId" IS NOT NULL
          ) THEN 'no durable assigned non-97151 Session supports ACTIVE' END
        ) AS reason
      FROM "Client" c
      LEFT JOIN "User" rbt ON rbt.id = c."rbtId"
      LEFT JOIN "User" bcba ON bcba.id = c."bcbaId"
      WHERE c.status = 'ACTIVE'
        AND (
          c."rbtId" IS NULL
          OR rbt.id IS NULL
          OR rbt.role::text <> 'RBT'
          OR NOT rbt."isActive"
          OR c."bcbaId" IS NULL
          OR bcba.id IS NULL
          OR bcba.role::text <> 'BCBA'
          OR NOT bcba."isActive"
          OR NOT EXISTS (
            SELECT 1
            FROM "Session" s
            WHERE s."clientId" = c.id
              AND coalesce(btrim(s."cptCode"), '') <> '97151'
              AND s.status IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED')
              AND s."rbtId" IS NOT NULL
              AND s."bcbaId" IS NOT NULL
          )
        )
      ORDER BY c."updatedAt", c.id
    `,
  },
  {
    key: 'DQ8',
    title: 'Duplicate open EVV logs',
    definition: 'At most one EVVLog with clockOutTimestamp=NULL may exist per Session.',
    cleanup:
      '-- Ops should compare clock evidence, retain the canonical visit, and close/void extras through an audited EVV exception workflow. Never silently delete duplicate clock records.',
    sql: `
      SELECT 'EVVLog.openPerSession' AS "entityType",
        (array_agg(e.id::text ORDER BY e."clockInTimestamp", e.id))[1] AS "entityId",
        array_to_string(array_agg(e.id::text ORDER BY e."clockInTimestamp", e.id), ', ') AS "relatedIds",
        format('%s open EVV logs exist for Session %s', count(*), e."sessionId") AS reason
      FROM "EVVLog" e
      WHERE e."clockOutTimestamp" IS NULL
      GROUP BY e."sessionId"
      HAVING count(*) > 1
      ORDER BY min(e."clockInTimestamp"), min(e.id::text)
    `,
  },
];

function firstErrorLine(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || 'Unknown query error';
}

function normalizeViolation(row) {
  return {
    entityType: String(row.entityType ?? 'Unknown'),
    entityId: row.entityId == null ? null : String(row.entityId),
    relatedIds: row.relatedIds == null ? null : String(row.relatedIds),
    reason: String(row.reason ?? 'Invariant failed'),
  };
}

async function runLiveChecker() {
  loadDotEnv();
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set (environment or repo-root .env).');
  }

  // Startup GUC applies to every transaction on the only pooled connection.
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
    maxLifetimeSeconds: 300,
    query_timeout: 30_000,
    ssl: { rejectUnauthorized: false },
    options: '-c default_transaction_read_only=on',
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  async function query(sql) {
    assertReadOnlySql(sql);
    return prisma.$queryRawUnsafe(sql);
  }

  async function readGuard() {
    const rows = await query(`
      SELECT current_database() AS "databaseName",
        current_setting('default_transaction_read_only') AS "defaultTransactionReadOnly",
        current_setting('transaction_read_only') AS "transactionReadOnly"
    `);
    const guard = rows[0];
    if (
      !guard ||
      guard.defaultTransactionReadOnly !== 'on' ||
      guard.transactionReadOnly !== 'on'
    ) {
      throw new Error(
        'Read-only safety check failed: default_transaction_read_only and transaction_read_only must both be on.'
      );
    }
    return guard;
  }

  const startedAt = new Date().toISOString();
  const results = [];

  try {
    // Supabase's transaction pooler may ignore startup `options`. Set the same GUC
    // explicitly on the sole pg connection before Prisma receives that session.
    // This changes connection state only; it does not mutate database data/schema.
    const bootstrapClient = await pool.connect();
    try {
      assertReadOnlySessionSetupSql(READ_ONLY_SESSION_SETUP_SQL);
      await bootstrapClient.query(READ_ONLY_SESSION_SETUP_SQL);
    } finally {
      bootstrapClient.release();
    }

    const guard = await readGuard();

    for (const check of CHECKS) {
      try {
        const rows = await query(check.sql);
        const violations = rows.map(normalizeViolation);
        results.push({
          key: check.key,
          title: check.title,
          definition: check.definition,
          cleanup: check.cleanup,
          status: violations.length === 0 ? 'PASS' : 'FAIL',
          violations,
          error: null,
        });
      } catch (error) {
        results.push({
          key: check.key,
          title: check.title,
          definition: check.definition,
          cleanup: check.cleanup,
          status: 'ERROR',
          violations: [],
          error: firstErrorLine(error),
        });
      }
    }

    const endingGuard = await readGuard();
    const finishedAt = new Date().toISOString();
    const violationCount = results.reduce((sum, result) => sum + result.violations.length, 0);
    const failedChecks = results.filter((result) => result.status === 'FAIL').length;
    const erroredChecks = results.filter((result) => result.status === 'ERROR').length;

    console.log('== Live data-quality verification (READ-ONLY) ==');
    console.log(`Repo: ${repoRoot}`);
    console.log(`Started: ${startedAt}`);
    console.log(`Finished: ${finishedAt}`);
    console.log(`Database: ${guard.databaseName}`);
    console.log(
      `Session guard: default_transaction_read_only=${guard.defaultTransactionReadOnly}; transaction_read_only=${guard.transactionReadOnly}`
    );
    console.log('');

    for (const result of results) {
      console.log(`[${result.status}] ${result.key} — ${result.title}`);
      console.log(`    Scope: ${result.definition}`);
      if (result.error) {
        console.log(`    !! Query error: ${result.error}`);
      } else {
        console.log(`    Violations: ${result.violations.length}`);
        for (const violation of result.violations) {
          const ids = [
            violation.entityId ? `id=${violation.entityId}` : null,
            violation.relatedIds ? `related=${violation.relatedIds}` : null,
          ]
            .filter(Boolean)
            .join(' · ');
          console.log(
            `    !! ${violation.entityType}${ids ? ` · ${ids}` : ''} · ${violation.reason}`
          );
        }
      }
      if (result.status !== 'PASS') console.log(`    ${result.cleanup}`);
      console.log('');
    }

    const finalGuardMatches =
      endingGuard.defaultTransactionReadOnly === guard.defaultTransactionReadOnly &&
      endingGuard.transactionReadOnly === guard.transactionReadOnly;
    if (!finalGuardMatches) {
      throw new Error('Read-only session guard changed during execution.');
    }

    if (erroredChecks > 0) {
      console.log(
        `RESULT: ERROR — ${erroredChecks} check(s) errored; ${violationCount} violation(s) found in completed checks.`
      );
      return 2;
    }
    if (violationCount > 0) {
      console.log(
        `RESULT: FAIL — ${violationCount} violation(s) across ${failedChecks} check(s); no database changes made.`
      );
      return 1;
    }

    console.log('RESULT: PASS — all checks clean; no database changes made.');
    return 0;
  } finally {
    await prisma.$disconnect().catch(() => {});
    await pool.end().catch(() => {});
  }
}

if (process.argv.includes('--self-test')) {
  runSelfTests();
} else {
  runLiveChecker()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(`FATAL: ${firstErrorLine(error)}`);
      process.exitCode = 2;
    });
}
