/**
 * DB-backed StaffCredential lookups (P2 credential soft gate).
 * Pure rollup logic lives in staffCredentials.ts (unit-tested, no prisma).
 * Never throws — a failed lookup returns null/[] so credential checks can
 * never block a sign or convert.
 */

import { prisma } from '@/lib/prisma';
import {
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

/**
 * Warn-only credential lines for the people on a note: the supervising BCBA
 * and the session RBT. Empty array = all clear (or lookup failed — soft gate).
 */
export async function collectNoteCredentialWarnings(input: {
  bcbaUserId?: string | null;
  rbtUserId?: string | null;
}): Promise<string[]> {
  const warnings: string[] = [];
  const roles: Array<{ label: string; userId: string | null | undefined }> = [
    { label: 'Supervising BCBA', userId: input.bcbaUserId },
    { label: 'Session RBT', userId: input.rbtUserId },
  ];

  for (const { label, userId } of roles) {
    if (!userId) continue;
    const status = await getCredentialStatus(userId);
    if (!status || status.overall === 'ACTIVE' || status.overall === 'NOT_TRACKED') continue;
    const who = status.displayName ? `${label} ${status.displayName}` : label;
    warnings.push(`${who}: ${status.warnings.join(', ') || 'credential issue on file'}`);
  }

  return warnings;
}
