#!/usr/bin/env node
/**
 * Read-only Supabase Storage readiness verifier.
 *
 * Reads bucket metadata with GET /storage/v1/bucket. It never lists objects,
 * uploads files, changes bucket configuration, or accesses Postgres.
 *
 * Run: node scripts/check-storage-readiness.mjs
 * Exit: 0 when all required buckets are compatible; 1 otherwise.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ENV_FILES = [
  '.env',
  '.env.local',
  'apps/crm/.env',
  'apps/crm/.env.local',
  'apps/hrm/.env',
  'apps/hrm/.env.local',
];

function loadEnvFiles() {
  const loaded = [];
  for (const relativePath of ENV_FILES) {
    let raw;
    try {
      raw = readFileSync(path.join(repoRoot, relativePath), 'utf8');
    } catch {
      continue;
    }
    loaded.push(relativePath);
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
  return loaded;
}

const loadedEnvFiles = loadEnvFiles();

const REQUIRED_BUCKETS = [
  {
    id: 'client-documents',
    purpose: 'CRM parent/client documents',
    appMaxBytes: 5 * 1024 * 1024,
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    source: 'apps/crm/src/app/api/upload/route.ts',
  },
  {
    id: 'ats-applicant-docs',
    purpose: 'HRM applicant/onboarding documents',
    appMaxBytes: 10 * 1024 * 1024,
    allowedMimeTypes: [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
    ],
    source: 'apps/hrm/src/app/actions/candidateDocumentActions.ts',
  },
  {
    id: 'ats-interview-recordings',
    purpose: 'HRM interview recordings',
    appMaxBytes: 50 * 1024 * 1024,
    allowedMimeTypes: [
      'video/webm',
      'video/mp4',
      'audio/webm',
      'audio/mpeg',
    ],
    source: 'apps/hrm/src/lib/uploadValidation.ts',
  },
];

function bytesToMb(value) {
  return `${value / 1024 / 1024}MB`;
}

function normalizeBucket(raw) {
  return {
    id: String(raw?.id ?? raw?.name ?? ''),
    name: String(raw?.name ?? raw?.id ?? ''),
    public: raw?.public,
    fileSizeLimit: raw?.file_size_limit ?? raw?.fileSizeLimit ?? null,
    allowedMimeTypes:
      raw?.allowed_mime_types ?? raw?.allowedMimeTypes ?? null,
  };
}

function evaluateBucket(requirement, bucket) {
  const failures = [];
  const observations = [];

  if (!bucket) {
    failures.push('Bucket does not exist or was not returned by listBuckets.');
    return { status: 'FAIL', failures, observations };
  }

  if (bucket.public !== false) {
    failures.push(
      `Bucket must be private; API returned public=${String(bucket.public)}.`
    );
  } else {
    observations.push('Private: yes');
  }

  if (bucket.fileSizeLimit == null) {
    observations.push(
      `File-size limit: unlimited (compatible with app cap ${bytesToMb(requirement.appMaxBytes)})`
    );
  } else {
    const limit = Number(bucket.fileSizeLimit);
    if (!Number.isFinite(limit)) {
      failures.push('Bucket file-size limit is present but not numeric.');
    } else if (limit < requirement.appMaxBytes) {
      failures.push(
        `Bucket file-size limit ${bytesToMb(limit)} is below app cap ${bytesToMb(requirement.appMaxBytes)}.`
      );
    } else {
      observations.push(
        `File-size limit: ${bytesToMb(limit)} (app cap ${bytesToMb(requirement.appMaxBytes)})`
      );
    }
  }

  if (bucket.allowedMimeTypes == null) {
    observations.push(
      'MIME allowlist: unrestricted (application validation remains authoritative)'
    );
  } else if (!Array.isArray(bucket.allowedMimeTypes)) {
    failures.push('Bucket MIME allowlist is present but is not an array.');
  } else {
    const actual = new Set(bucket.allowedMimeTypes.map((value) => String(value)));
    const missing = requirement.allowedMimeTypes.filter(
      (mime) => !actual.has(mime)
    );
    if (missing.length > 0) {
      failures.push(`Bucket MIME allowlist is missing: ${missing.join(', ')}.`);
    } else {
      observations.push(
        `MIME allowlist covers all ${requirement.allowedMimeTypes.length} app type(s)`
      );
    }
  }

  return {
    status: failures.length === 0 ? 'PASS' : 'FAIL',
    failures,
    observations,
  };
}

function safeApiMessage(body) {
  if (!body || typeof body !== 'object') return 'No structured error returned.';
  const value = body.message ?? body.error ?? body.error_description;
  return typeof value === 'string' ? value.slice(0, 300) : 'Request rejected.';
}

async function listBuckets(url, serviceRoleKey) {
  const endpoint = `${url.replace(/\/+$/, '')}/storage/v1/bucket`;
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    redirect: 'error',
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    // Status is sufficient; never dump an untrusted response body.
  }

  if (!response.ok) {
    throw new Error(
      `Storage bucket metadata GET returned HTTP ${response.status}: ${safeApiMessage(body)}`
    );
  }
  if (!Array.isArray(body)) {
    throw new Error('Storage bucket metadata GET returned an unexpected shape.');
  }
  return body.map(normalizeBucket);
}

async function main() {
  console.log('== Supabase Storage readiness (read-only) ==');
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(
    `Env files discovered: ${loadedEnvFiles.length ? loadedEnvFiles.join(', ') : 'none'}`
  );
  console.log('Network operation: GET /storage/v1/bucket only');
  console.log('');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.log('[FAIL] Configuration');
    if (!url) console.log('    !! NEXT_PUBLIC_SUPABASE_URL is not configured.');
    if (!serviceRoleKey) {
      console.log('    !! SUPABASE_SERVICE_ROLE_KEY is not configured.');
    }
    console.log('');
    console.log(
      'RESULT: FAIL — cannot perform authenticated read-only bucket metadata check.'
    );
    process.exitCode = 1;
    return;
  }

  let buckets;
  try {
    buckets = await listBuckets(url, serviceRoleKey);
  } catch (error) {
    console.log('[FAIL] Storage metadata API');
    console.log(
      `    !! ${error instanceof Error ? error.message : 'Unknown read error.'}`
    );
    console.log('');
    console.log('RESULT: FAIL — bucket metadata could not be verified.');
    process.exitCode = 1;
    return;
  }

  const byId = new Map(buckets.map((bucket) => [bucket.id, bucket]));
  let allPass = true;
  for (const requirement of REQUIRED_BUCKETS) {
    const result = evaluateBucket(requirement, byId.get(requirement.id));
    console.log(
      `[${result.status}] ${requirement.id} — ${requirement.purpose}`
    );
    console.log(`    · Required by ${requirement.source}`);
    for (const observation of result.observations) {
      console.log(`    · ${observation}`);
    }
    for (const failure of result.failures) {
      console.log(`    !! ${failure}`);
    }
    console.log('');
    if (result.status !== 'PASS') allPass = false;
  }

  console.log(
    allPass
      ? 'RESULT: PASS — all required private Storage buckets are compatible with application upload limits.'
      : 'RESULT: FAIL — one or more required Storage buckets need Dashboard remediation.'
  );
  process.exitCode = allPass ? 0 : 1;
}

main().catch((error) => {
  console.error(
    `FATAL: ${error instanceof Error ? error.message : 'Unknown verifier error.'}`
  );
  process.exitCode = 1;
});
