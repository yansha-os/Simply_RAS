'use server';

import { extractSubmissionFingerprint } from '@repo/db/session-note-attestation';

import { prisma } from '@/lib/prisma';
import { requireClientAccess } from '@/lib/auth-guard';

export type ClientSessionHistoryRow = {
  sessionId: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: string;
  cptCode: string | null;
  location: string | null;
  rbtName: string | null;
  note: {
    id: string;
    rbtSigned: boolean;
    bcbaSigned: boolean;
    isConverted: boolean;
    billableUnits: number | null;
    updatedAt: string;
    submissionFingerprint: string | null;
  } | null;
};

/**
 * Read-only clinical chart: recent Sessions + SessionNote sign/convert summary.
 * Uses existing Prisma models only (no schema changes).
 */
export async function getClientSessionHistory(clientId: string, limit = 30) {
  try {
    if (!clientId) {
      return { success: false as const, error: 'Client id is required.' };
    }

    const gate = await requireClientAccess(clientId);
    if (!gate.ok) {
      return { success: false as const, error: gate.error };
    }

    const take = Math.min(Math.max(limit, 1), 100);

    const sessions = await prisma.session.findMany({
      where: { clientId },
      include: {
        rbt: { select: { firstName: true, lastName: true } },
        // Session.note is one-to-one (SessionNote?) — direct object, not array
        note: {
          select: {
            id: true,
            rbtSigned: true,
            bcbaSigned: true,
            isConverted: true,
            billableUnits: true,
            updatedAt: true,
            structuredContent: true,
          },
        },
      },
      orderBy: { scheduledStart: 'desc' },
      take,
    });

    const data: ClientSessionHistoryRow[] = sessions.map((s) => ({
      sessionId: s.id,
      scheduledStart: s.scheduledStart.toISOString(),
      scheduledEnd: s.scheduledEnd.toISOString(),
      status: s.status,
      cptCode: s.cptCode,
      location: s.location,
      rbtName: s.rbt ? `${s.rbt.firstName} ${s.rbt.lastName}` : null,
      note: s.note
        ? {
            id: s.note.id,
            rbtSigned: s.note.rbtSigned,
            bcbaSigned: s.note.bcbaSigned,
            isConverted: s.note.isConverted,
            billableUnits: s.note.billableUnits,
            updatedAt: s.note.updatedAt.toISOString(),
            submissionFingerprint: extractSubmissionFingerprint(
              s.note.structuredContent,
            ),
          }
        : null,
    }));

    return { success: true as const, data };
  } catch (error) {
    console.error(
      'getClientSessionHistory failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return { success: false as const, error: 'Failed to load session history.' };
  }
}
