import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logError, errorMeta } from '@/lib/logger';
import { getOnboardingEncryptionReadiness } from '@/lib/onboardingSensitiveStorage';

/**
 * Liveness/readiness probe for uptime checks (docs/OPERATIONS.md §3).
 *
 * Unauthenticated BY DESIGN — external pingers must be able to poll it.
 * Therefore the response contains only app/time and non-secret subsystem
 * readiness flags. No versions, env names or values, connection strings, or PHI.
 *
 * 200 = app ready. 503 = a required dependency or configuration is unavailable.
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
  const encryption = getOnboardingEncryptionReadiness();
  const ok = db === 'ok' && encryption === 'ok';
  return NextResponse.json(
    { ok, app: 'hrm', time: new Date().toISOString(), db, encryption },
    { status: ok ? 200 : 503 }
  );
}
