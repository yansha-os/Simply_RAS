/**
 * DB-backed StaffCredential lookups for HRM Session Studio claim-ready gate.
 */

import { prisma } from '@/lib/prisma';
import {
  evaluateCredentialHardStop,
  summarizeStaffCredentials,
  type StaffCredentialStatus,
} from '@/lib/staffCredentials';

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
      error: `Credential hard stop — resolve before claim-ready handoff: ${verdict.blockers.join(' · ')}`,
    };
  }
  return { ok: true, warnings: verdict.warnings };
}
