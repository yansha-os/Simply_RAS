import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logError, errorMeta } from '@/lib/logger';

/**
 * Liveness/readiness probe for uptime checks (docs/OPERATIONS.md §3).
 *
 * Unauthenticated BY DESIGN — external pingers must be able to poll it.
 * Therefore the response must never contain anything beyond app name,
 * timestamp, and an ok/error flag for the DB probe. No versions, no env,
 * no connection strings, no PHI.
 *
 * 200 = app up and DB reachable. 503 = app up but DB probe failed
 * (pooler exhaustion, Supabase outage, bad DATABASE_URL).
 */

export const dynamic = 'force-dynamic';

const DB_PROBE_TIMEOUT_MS = 3_000;

async function probeDb(): Promise<'ok' | 'error'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`db probe timed out after ${DB_PROBE_TIMEOUT_MS}ms`)),
          DB_PROBE_TIMEOUT_MS
        );
      }),
    ]);
    return 'ok';
  } catch (err) {
    logError('health.db_probe_failed', errorMeta(err));
    return 'error';
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function GET() {
  const db = await probeDb();
  const ok = db === 'ok';
  return NextResponse.json(
    { ok, app: 'hrm', time: new Date().toISOString(), db },
    { status: ok ? 200 : 503 }
  );
}
