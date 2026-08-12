'use server';

import { extractSubmissionFingerprint } from '@repo/db/session-note-attestation';

import { prisma } from '@/lib/prisma';
import {
  computeClientAuthUnitBalances,
  type ClientAuthUnitBalances,
} from '@/lib/billing/authUnits';
import { requireClientAccess } from '@/lib/auth-guard';

/**
 * Read-only: authorized vs remaining units for a client.
 * Used = sum(SessionNote.billableUnits) only for durable attestation chains,
 * within each Authorization / PARequest date window (matched by Session.cptCode).
 * Does not mutate billing status gates or SessionNote fields. No EDI.
 */
export async function getClientAuthUnitBalances(
  clientId: string,
): Promise<{ success: true; data: ClientAuthUnitBalances } | { success: false; error: string }> {
  try {
    if (!clientId) {
      return { success: false, error: 'Client id is required.' };
    }

    const gate = await requireClientAccess(clientId);
    if (!gate.ok) return { success: false, error: gate.error };

    const [authorizations, paRequests, sessions] = await Promise.all([
      prisma.authorization.findMany({
        where: { clientId },
        include: { cptCodes: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.pARequest.findMany({
        where: { clientId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.session.findMany({
        where: { clientId },
        select: {
          id: true,
          status: true,
          cptCode: true,
          scheduledStart: true,
          scheduledEnd: true,
          actualStart: true,
          actualEnd: true,
          // Session.note is 1:1 (SessionNote?) — never treat as array
          note: {
            select: {
              billableUnits: true,
              parentSigned: true,
              parentSignedAt: true,
              parentSignerName: true,
              rbtSigned: true,
              rbtSignedAt: true,
              rbtSignerName: true,
              bcbaSigned: true,
              bcbaSignedAt: true,
              bcbaSignerName: true,
              isConverted: true,
              checklistSnapshot: true,
              structuredContent: true,
              deficiencies: {
                where: { status: 'OPEN' },
                select: { id: true },
              },
            },
          },
        },
        orderBy: { scheduledStart: 'asc' },
      }),
    ]);

    const data = computeClientAuthUnitBalances({
      clientId,
      authorizations,
      paRequests,
      sessions: sessions.map((session) => ({
        ...session,
        note: session.note
          ? {
              billableUnits: session.note.billableUnits,
              parentSigned: session.note.parentSigned,
              parentSignedAt: session.note.parentSignedAt,
              parentSignerName: session.note.parentSignerName,
              rbtSigned: session.note.rbtSigned,
              rbtSignedAt: session.note.rbtSignedAt,
              rbtSignerName: session.note.rbtSignerName,
              bcbaSigned: session.note.bcbaSigned,
              bcbaSignedAt: session.note.bcbaSignedAt,
              bcbaSignerName: session.note.bcbaSignerName,
              isConverted: session.note.isConverted,
              checklistSnapshot: session.note.checklistSnapshot,
              openDeficiencyCount: session.note.deficiencies.length,
              submissionFingerprint: extractSubmissionFingerprint(
                session.note.structuredContent,
              ),
            }
          : null,
      })),
    });

    return { success: true, data };
  } catch (error) {
    console.error(
      'Action failed [getClientAuthUnitBalances]:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return { success: false, error: 'Failed to load authorization unit balances.' };
  }
}
