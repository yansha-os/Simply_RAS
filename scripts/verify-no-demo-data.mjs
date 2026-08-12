#!/usr/bin/env node
/**
 * verify-no-demo-data.mjs — READ-ONLY demo-data verification gate.
 *
 * Automates the Phase 1 checklist gate "No demo targets / mock IDs on ACTIVE
 * cohort clients" from docs/superpowers/specs/2026-08-12-production-readiness-gap-analysis.md §7.
 *
 * Run:   node scripts/verify-no-demo-data.mjs
 * Env:   DATABASE_URL (read from repo-root .env when not already set)
 * Exit:  0 only when every check passes. 1 on any FAIL or query ERROR.
 *
 * Safety: SELECT-only. Every pooled connection additionally runs
 * `SET default_transaction_read_only = on` so even a bug in this script
 * cannot write. Never run DDL/DML here (Supabase session pooler, manual-SQL
 * workflow — see .cursor/rules/supabase-manual-sql.mdc).
 *
 * Marker inventory (source of truth: code, verified 2026-08-12):
 * - Demo learner client:   guardianEmail 'demo.studio.learner@riseandshine.local'
 *                          (apps/{crm,hrm}/src/app/actions/devTools.ts DEMO_STUDIO_GUARDIAN_EMAIL)
 * - Seed JSON fence:       Client.treatmentPlan.__devSeed (same files)
 * - Seeded PA:             PARequest.authNumber 'DEV-TX-STUDIO' (same files)
 * - Demo staff users:      demo.bcba.studio@ / demo.casecoord.studio@riseandshine.local
 *                          (david.m@riseandshine.nyc is protected seed staff, informational)
 * - Demo Studio target ids: /^[tb]\d+$/i (t1..t3 / b1..b3) — JSON-only; can persist
 *                          inside SessionNote.structuredContent trials/probes when a
 *                          note is saved Incomplete (claim-ready hard-blocks them).
 *                          apps/hrm/src/lib/sessionStudio.ts isDemoStudioTargetId / DEMO_TARGETS.
 * - Demo target labels:    exact DEMO_TARGETS / DEMO_BEHAVIOR_TARGETS labels, in case
 *                          they were ever synced into SkillTarget / BehaviorTarget rows.
 * - Mock identity literal: 'mock-user-id' (apps/{crm,hrm}/src/lib/auth.ts role impersonation).
 *                          Cannot exist in uuid-typed FK columns; text/JSON columns scanned.
 * - HRM dev-skip:          CandidateOnboardingPacket.formData.__devSkipped and
 *                          OnboardingSignatureEvent.documentKey 'dev-skip' (informational).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadDotEnv() {
  if (process.env.DATABASE_URL) return;
  let raw;
  try {
    raw = readFileSync(path.join(repoRoot, '.env'), 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, key, valueRaw] = m;
    if (process.env[key] !== undefined) continue;
    let value = valueRaw.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadDotEnv();

if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL not set (env or repo-root .env).');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Read-only Prisma client (pg adapter, forced read-only sessions)
// ---------------------------------------------------------------------------

// Hard safety net: the DB session itself rejects any write (startup GUC).
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  options: '-c default_transaction_read_only=on',
});

const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

// ---------------------------------------------------------------------------
// Markers
// ---------------------------------------------------------------------------

const DEMO_GUARDIAN_EMAIL = 'demo.studio.learner@riseandshine.local';
const DEMO_AUTH_REF = 'DEV-TX-STUDIO';
const MOCK_ID = 'mock-user-id';
const DEV_SEED_KEY = '__devSeed';
const DEV_SKIP_KEY = '__devSkipped';
// jsonb::text renders `"targetId": "t1"`; JSON.stringify renders `"targetId":"t1"`.
const DEMO_TARGET_ID_SQL_REGEX = '"targetId":\\s*"[tbTB][0-9]+"';

const DEMO_USER_EMAILS = [
  'demo.bcba.studio@riseandshine.local',
  'demo.casecoord.studio@riseandshine.local',
];
const PROTECTED_SEED_STAFF_EMAIL = 'david.m@riseandshine.nyc';

// Exact labels from apps/hrm/src/lib/sessionStudio.ts (DEMO_TARGETS / DEMO_BEHAVIOR_TARGETS).
const DEMO_SKILL_TITLES = [
  'Mand: request preferred item with \u201cI want ___\u201d',
  'Listener: follow 1-step instruction in room',
  'Motor imitation: clap / wave / touch head',
];
const DEMO_BEHAVIOR_NAMES = [
  'Elopement attempts',
  'Flopping / dropping',
  'Aggression (hits)',
];

// ---------------------------------------------------------------------------
// Check harness
// ---------------------------------------------------------------------------

/** @type {{ key: string, title: string, status: 'PASS'|'FAIL'|'ERROR', violations: string[], info: string[] }[]} */
const results = [];

async function runCheck(key, title, fn) {
  const res = { key, title, status: 'PASS', violations: [], info: [] };
  try {
    await fn(res);
    if (res.violations.length > 0) res.status = 'FAIL';
  } catch (err) {
    res.status = 'ERROR';
    res.violations.push(`Query error: ${err instanceof Error ? err.message : String(err)}`);
  }
  results.push(res);
  return res;
}

const sqlList = (values) => values.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ');

/**
 * Per-client demo-marker flags. SELECT-only; extraWhere narrows the client set.
 */
async function clientMarkerRows(extraWhere) {
  return prisma.$queryRawUnsafe(`
    SELECT
      c.id::text                                        AS id,
      c."firstName"                                     AS "firstName",
      c."lastName"                                      AS "lastName",
      c.status::text                                    AS status,
      lower(coalesce(c."guardianEmail", ''))            AS guardian_email,
      (lower(coalesce(c."guardianEmail", '')) = '${DEMO_GUARDIAN_EMAIL}') AS is_demo_learner,
      (strpos(coalesce(c."treatmentPlan"::text, ''), '${DEV_SEED_KEY}') > 0) AS has_dev_seed_plan,
      EXISTS (
        SELECT 1 FROM "PARequest" p
        WHERE p."clientId" = c.id AND p."authNumber" = '${DEMO_AUTH_REF}'
      ) AS has_demo_auth,
      EXISTS (
        SELECT 1 FROM "SkillTarget" st
        WHERE st."clientId" = c.id AND st.title IN (${sqlList(DEMO_SKILL_TITLES)})
      ) AS has_demo_skill_targets,
      EXISTS (
        SELECT 1 FROM "BehaviorTarget" bt
        WHERE bt."clientId" = c.id AND bt."behaviorName" IN (${sqlList(DEMO_BEHAVIOR_NAMES)})
      ) AS has_demo_behavior_targets,
      EXISTS (
        SELECT 1
        FROM "Session" s
        JOIN "SessionNote" n ON n."sessionId" = s.id
        WHERE s."clientId" = c.id
          AND coalesce(n."structuredContent"::text, '') ~ '${DEMO_TARGET_ID_SQL_REGEX}'
      ) AS has_demo_note_targets
    FROM "Client" c
    ${extraWhere}
    ORDER BY c."createdAt"
  `);
}

function markerSummary(row) {
  const markers = [];
  if (row.is_demo_learner) markers.push(`guardianEmail='${DEMO_GUARDIAN_EMAIL}'`);
  if (row.has_dev_seed_plan) markers.push(`treatmentPlan.${DEV_SEED_KEY}`);
  if (row.has_demo_auth) markers.push(`PARequest.authNumber='${DEMO_AUTH_REF}'`);
  if (row.has_demo_skill_targets) markers.push('SkillTarget demo labels');
  if (row.has_demo_behavior_targets) markers.push('BehaviorTarget demo labels');
  if (row.has_demo_note_targets) markers.push('SessionNote demo t#/b# targetIds');
  return markers;
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

// (a) No ACTIVE-status client may carry any demo marker — including the demo
// learner itself: before cohort activation it must not sit in the ACTIVE cohort.
async function checkActiveCohort(res) {
  const rows = await clientMarkerRows(`WHERE c.status = 'ACTIVE'`);
  res.info.push(`ACTIVE clients scanned: ${rows.length}`);
  for (const row of rows) {
    const markers = markerSummary(row);
    if (markers.length === 0) continue;
    const who = `${row.firstName} ${row.lastName} (Client ${row.id})`;
    if (row.is_demo_learner) {
      res.violations.push(
        `${who} is the demo learner and is ACTIVE — demo client must not be in the ACTIVE cohort. Markers: ${markers.join('; ')}`
      );
    } else {
      res.violations.push(`${who} is ACTIVE and carries demo markers: ${markers.join('; ')}`);
    }
  }
}

// (b) Demo markers must never appear on a non-demo client of ANY status.
async function checkNonDemoClients(res) {
  const rows = await clientMarkerRows(
    `WHERE lower(coalesce(c."guardianEmail", '')) <> '${DEMO_GUARDIAN_EMAIL}'`
  );
  res.info.push(`Non-demo clients scanned (all statuses): ${rows.length}`);
  for (const row of rows) {
    const markers = markerSummary(row);
    if (markers.length === 0) continue;
    res.violations.push(
      `${row.firstName} ${row.lastName} (Client ${row.id}, status ${row.status}) carries demo markers: ${markers.join('; ')}`
    );
  }
}

// (c) 'mock-user-id' literal in text/JSON columns of key tables.
// uuid-typed columns (User.id, Session.rbtId, Notification.userId, StaffMessage
// senderId/receiverId, ...) physically cannot store it — text columns are the risk.
const MOCK_ID_SCANS = [
  { table: 'User', id: 'id::text', cols: ['email', '"firstName"', '"lastName"'] },
  { table: 'Session', id: 'id::text', cols: ['location', '"cptCode"'] },
  {
    table: 'SessionNote',
    id: 'id::text',
    cols: [
      '"clinicalContent"',
      '"structuredContent"::text',
      '"checklistSnapshot"::text',
      '"rbtSignerName"',
      '"parentSignerName"',
      '"bcbaSignerName"',
      '"plutusClaimRef"',
    ],
  },
  { table: 'Notification', id: 'id::text', cols: ['title', 'message', '"linkUrl"'] },
  { table: 'StaffMessage', id: 'id::text', cols: ['content'] },
];

async function checkMockIdLiterals(res) {
  for (const scan of MOCK_ID_SCANS) {
    const colExprs = scan.cols
      .map((c) => `(strpos(coalesce(${c}, ''), '${MOCK_ID}') > 0) AS match_${c.replace(/[^a-zA-Z]/g, '')}`)
      .join(',\n        ');
    const anyMatch = scan.cols
      .map((c) => `strpos(coalesce(${c}, ''), '${MOCK_ID}') > 0`)
      .join(' OR ');
    const rows = await prisma.$queryRawUnsafe(`
      SELECT ${scan.id} AS id,
        ${colExprs}
      FROM "${scan.table}"
      WHERE ${anyMatch}
    `);
    for (const row of rows) {
      const matched = Object.entries(row)
        .filter(([k, v]) => k.startsWith('match_') && v === true)
        .map(([k]) => k.slice('match_'.length));
      res.violations.push(
        `"${scan.table}" row ${row.id} contains '${MOCK_ID}' in column(s): ${matched.join(', ')}`
      );
    }
    res.info.push(`"${scan.table}": scanned ${scan.cols.length} text/JSON column(s)`);
  }
}

// (d) Demo-entity census + containment: every demo entity must attach to the
// single demo learner (or be one of the expected demo staff users).
async function checkDemoCensus(res) {
  const demoClients = await prisma.$queryRawUnsafe(`
    SELECT id::text AS id, "firstName", "lastName", status::text AS status
    FROM "Client"
    WHERE lower(coalesce("guardianEmail", '')) = '${DEMO_GUARDIAN_EMAIL}'
  `);
  res.info.push(
    `Demo learner clients: ${demoClients.length} ` +
      (demoClients.length
        ? `[${demoClients.map((c) => `${c.id} status=${c.status}`).join('; ')}]`
        : '(none — seed never run against this DB)')
  );
  if (demoClients.length > 1) {
    res.violations.push(
      `Expected at most 1 demo learner client, found ${demoClients.length}: ${demoClients.map((c) => c.id).join(', ')}`
    );
  }
  const demoClientIds = new Set(demoClients.map((c) => c.id));

  const demoAuths = await prisma.$queryRawUnsafe(`
    SELECT p.id::text AS id, p."clientId"::text AS client_id, p.status::text AS status
    FROM "PARequest" p
    WHERE p."authNumber" = '${DEMO_AUTH_REF}'
  `);
  res.info.push(`PARequest rows with authNumber='${DEMO_AUTH_REF}': ${demoAuths.length}`);
  for (const pa of demoAuths) {
    if (!demoClientIds.has(pa.client_id)) {
      res.violations.push(
        `PARequest ${pa.id} has authNumber='${DEMO_AUTH_REF}' but belongs to non-demo Client ${pa.client_id}`
      );
    }
  }

  const devSeedPlans = await prisma.$queryRawUnsafe(`
    SELECT id::text AS id
    FROM "Client"
    WHERE strpos(coalesce("treatmentPlan"::text, ''), '${DEV_SEED_KEY}') > 0
  `);
  res.info.push(`Clients with treatmentPlan.${DEV_SEED_KEY}: ${devSeedPlans.length}`);
  for (const c of devSeedPlans) {
    if (!demoClientIds.has(c.id)) {
      res.violations.push(`Client ${c.id} carries treatmentPlan.${DEV_SEED_KEY} but is not the demo learner`);
    }
  }

  const demoNotes = await prisma.$queryRawUnsafe(`
    SELECT n.id::text AS note_id, s."clientId"::text AS client_id, n."rbtSigned" AS rbt_signed
    FROM "SessionNote" n
    JOIN "Session" s ON s.id = n."sessionId"
    WHERE coalesce(n."structuredContent"::text, '') ~ '${DEMO_TARGET_ID_SQL_REGEX}'
  `);
  res.info.push(`SessionNotes containing demo t#/b# targetIds: ${demoNotes.length}`);
  for (const n of demoNotes) {
    if (!demoClientIds.has(n.client_id)) {
      res.violations.push(
        `SessionNote ${n.note_id} contains demo t#/b# targetIds but belongs to non-demo Client ${n.client_id}`
      );
    }
  }

  const demoUsers = await prisma.$queryRawUnsafe(`
    SELECT id::text AS id, email, role::text AS role, "isActive" AS is_active
    FROM "User"
    WHERE lower(email) IN (${sqlList([...DEMO_USER_EMAILS, PROTECTED_SEED_STAFF_EMAIL])})
  `);
  for (const u of demoUsers) {
    const tag = u.email.toLowerCase() === PROTECTED_SEED_STAFF_EMAIL ? 'protected seed staff' : 'demo staff';
    res.info.push(`User ${u.id} (${u.email}, ${u.role}, active=${u.is_active}) — ${tag} [expected, informational]`);
  }

  // HRM applicant-side dev artifacts — informational (no client PHI attached).
  try {
    const [devSkipEvents] = await prisma.$queryRawUnsafe(`
      SELECT count(*)::int AS n FROM "OnboardingSignatureEvent" WHERE "documentKey" = 'dev-skip'
    `);
    const [devSkipPackets] = await prisma.$queryRawUnsafe(`
      SELECT count(*)::int AS n FROM "CandidateOnboardingPacket"
      WHERE strpos(coalesce("formData"::text, ''), '${DEV_SKIP_KEY}') > 0
    `);
    res.info.push(
      `HRM dev-skip artifacts (informational): ${devSkipEvents.n} OnboardingSignatureEvent 'dev-skip' row(s), ` +
        `${devSkipPackets.n} CandidateOnboardingPacket(s) with formData.${DEV_SKIP_KEY}`
    );
  } catch (err) {
    res.info.push(
      `HRM dev-skip census skipped (${err instanceof Error ? err.message.split('\n')[0] : 'query failed'})`
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('== Demo-data verification (read-only) ==');
  console.log(`Repo: ${repoRoot}`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('');

  await runCheck('A', 'No demo markers on ACTIVE-status clients', checkActiveCohort);
  await runCheck('B', 'No demo markers on non-demo clients (any status)', checkNonDemoClients);
  await runCheck('C', `No '${MOCK_ID}' literals in key tables`, checkMockIdLiterals);
  await runCheck('D', 'Demo-entity census + containment to demo learner', checkDemoCensus);

  let allPass = true;
  for (const r of results) {
    const badge = r.status === 'PASS' ? 'PASS' : r.status;
    console.log(`[${badge}] Check ${r.key} — ${r.title}`);
    for (const line of r.info) console.log(`    · ${line}`);
    for (const v of r.violations) console.log(`    !! ${v}`);
    if (r.status !== 'PASS') allPass = false;
    console.log('');
  }

  const failCount = results.reduce((n, r) => n + r.violations.length, 0);
  console.log(
    allPass
      ? 'RESULT: PASS — no demo targets / mock IDs on ACTIVE cohort clients; demo data contained to demo learner.'
      : `RESULT: FAIL — ${failCount} violation(s)/error(s) across ${results.filter((r) => r.status !== 'PASS').length} check(s). See details above.`
  );

  await prisma.$disconnect();
  process.exit(allPass ? 0 : 1);
}

main().catch(async (err) => {
  console.error('FATAL:', err instanceof Error ? err.message : err);
  try {
    await prisma.$disconnect();
  } catch {}
  process.exit(1);
});
