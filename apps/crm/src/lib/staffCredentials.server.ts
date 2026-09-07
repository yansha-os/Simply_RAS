/**
 * DB-backed StaffCredential lookups (Phase 3 billing enclosed).
 * Pure rollup logic lives in staffCredentials.ts (unit-tested, no prisma).
 */

import { prisma } from '@/lib/prisma';
import { endOfClinicDayForDateOnly } from '@/lib/clinicTimezone';
import {
  evaluateCredentialHardStop,
  summarizeStaffCredentials,
  type StaffCredentialStatus,
} from '@/lib/staffCredentials';

/** Credential status (active/expired/missing per type) for one staff user. */
export async function getCredentialStatus(userId: string): Promise<StaffCredentialStatus | null> {
  try {
    if (!userId) return null;
    const [user, credentials] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, firstName: true, lastName: true },
      }),
      prisma.staffCredential.findMany({
        where: { userId },
        select: { credentialType: true, isCredentialed: true, expirationDate: true },
      }),
    ]);
    if (!user) return null;

    const displayName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || null;
    return summarizeStaffCredentials({
      userId,
      displayName,
      role: user.role ? String(user.role) : null,
      credentials,
    });
  } catch (error) {
    console.error(
      'getCredentialStatus failed:',
      error instanceof Error ? error.message : 'Unknown',
    );
    return null;
  }
}

function npiFromCredentials(
  credentials: Array<{
    credentialType: string;
    credentialNumber: string | null;
    isCredentialed: boolean;
    expirationDate: Date | null;
  }>,
): string {
  const now = new Date();
  const row = credentials.find(
    (c) =>
      c.credentialType.toUpperCase() === 'NPI' &&
      c.isCredentialed &&
      /^\d{10}$/.test(c.credentialNumber?.trim() ?? '') &&
      (!c.expirationDate || endOfClinicDayForDateOnly(c.expirationDate) >= now),
  );
  return row?.credentialNumber?.trim() || '';
}

/** Rendering / supervising NPI from StaffCredential rows (Plutus export). */
export async function getStaffNpi(userId: string | null | undefined): Promise<string> {
  if (!userId) return '';
  try {
    const credentials = await prisma.staffCredential.findMany({
      where: { userId },
      select: {
        credentialType: true,
        credentialNumber: true,
        isCredentialed: true,
        expirationDate: true,
      },
    });
    return npiFromCredentials(credentials);
  } catch {
    return '';
  }
}

/**
 * Phase 3 hard stop for ACTIVE clients — expired/missing BACB license blocks
 * claim-ready submit, BCBA sign, and Plutus convert.
 */
export async function assertNoteCredentialHardStop(input: {
  clientStatus: string;
  bcbaUserId?: string | null;
  rbtUserId?: string | null;
}): Promise<
  | { ok: true; warnings: string[] }
  | { ok: false; code: 'CREDENTIAL_HARD_STOP'; error: string; blockers: string[] }
> {
  const [rbtStatus, bcbaStatus] = await Promise.all([
    input.rbtUserId ? getCredentialStatus(input.rbtUserId) : Promise.resolve(null),
    input.bcbaUserId ? getCredentialStatus(input.bcbaUserId) : Promise.resolve(null),
  ]);

  const verdict = evaluateCredentialHardStop({
    clientStatus: input.clientStatus,
    rbtStatus,
    bcbaStatus,
  });

  if (!verdict.ok) {
    return {
      ok: false,
      code: verdict.code,
      blockers: verdict.blockers,
      error: `Credential hard stop — resolve before billing handoff: ${verdict.blockers.join(' · ')}`,
    };
  }
  return { ok: true, warnings: verdict.warnings };
}

/**
 * Post-commit warn lines for converted notes (non-blocking on non-ACTIVE).
 * @deprecated Prefer assertNoteCredentialHardStop pre-flight for enforcement.
 */
export async function collectNoteCredentialWarnings(input: {
  bcbaUserId?: string | null;
  rbtUserId?: string | null;
  clientStatus?: string;
}): Promise<string[]> {
  const verdict = await assertNoteCredentialHardStop({
    clientStatus: input.clientStatus ?? 'ACTIVE',
    bcbaUserId: input.bcbaUserId,
    rbtUserId: input.rbtUserId,
  });
  if (!verdict.ok) return verdict.blockers;
  return verdict.warnings;
}
