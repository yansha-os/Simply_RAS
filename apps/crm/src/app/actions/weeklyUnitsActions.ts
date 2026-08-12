'use server';

import { extractSubmissionFingerprint } from '@repo/db/session-note-attestation';

import { prisma } from '@/lib/prisma';
import {
  computeWeeklyBillableUnits,
  startOfWeekMonday,
  type WeeklyBillableUnitsWeek,
} from '@/lib/billing/weeklyBillableUnits';
import { requireClientAccess } from '@/lib/auth-guard';

/**
 * Read-only: Mon–Sun CPT/units from durably attested SessionNotes for a client week.
 * Does not mutate notes or auth balances (AuthUnitsPanel / Track 2A owns burn-down).
 */
export async function getClientWeeklyBillableUnits(
  clientId: string,
  weekStartIso?: string | null,
): Promise<
  { success: true; data: WeeklyBillableUnitsWeek } | { success: false; error: string }
> {
  try {
    if (!clientId) {
      return { success: false, error: 'Client id is required.' };
    }

    const gate = await requireClientAccess(clientId);
    if (!gate.ok) return { success: false, error: gate.error };

    const weekStart = weekStartIso
      ? startOfWeekMonday(new Date(weekStartIso))
      : startOfWeekMonday(new Date());

    if (Number.isNaN(weekStart.getTime())) {
      return { success: false, error: 'Invalid week start.' };
    }

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    // Pad query window slightly for timezone edge (service date derived in lib)
    const queryStart = new Date(weekStart);
    queryStart.setDate(queryStart.getDate() - 1);
    const queryEnd = new Date(weekEnd);
    queryEnd.setDate(queryEnd.getDate() + 1);

    const sessions = await prisma.session.findMany({
      where: {
        clientId,
        OR: [
          { actualStart: { gte: queryStart, lte: queryEnd } },
          {
            actualStart: null,
            scheduledStart: { gte: queryStart, lte: queryEnd },
          },
        ],
      },
      select: {
        id: true,
        cptCode: true,
        status: true,
        scheduledStart: true,
        scheduledEnd: true,
        actualStart: true,
        actualEnd: true,
        note: {
          select: {
            id: true,
            parentSigned: true,
            parentSignedAt: true,
            parentSignerName: true,
            rbtSigned: true,
            rbtSignedAt: true,
            rbtSignerName: true,
            bcbaSigned: true,
            bcbaSignedAt: true,
            isConverted: true,
            billableUnits: true,
            checklistSnapshot: true,
            structuredContent: true,
            deficiencies: {
              where: { status: 'OPEN' },
              select: { id: true },
            },
            convertedAt: true,
            plutusClaimRef: true,
            bcbaSignerName: true,
          },
        },
        rbt: { select: { firstName: true, lastName: true } },
      },
      orderBy: { scheduledStart: 'asc' },
    });

    const data = computeWeeklyBillableUnits({
      clientId,
      weekStart,
      sessions: sessions.map((session) => ({
        ...session,
        note: session.note
          ? {
              id: session.note.id,
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
              billableUnits: session.note.billableUnits,
              checklistSnapshot: session.note.checklistSnapshot,
              submissionFingerprint: extractSubmissionFingerprint(
                session.note.structuredContent,
              ),
              openDeficiencyCount: session.note.deficiencies.length,
              convertedAt: session.note.convertedAt,
              plutusClaimRef: session.note.plutusClaimRef,
            }
          : null,
      })),
    });

    return { success: true, data };
  } catch (error) {
    console.error(
      'Action failed [getClientWeeklyBillableUnits]:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return { success: false, error: 'Failed to load weekly billable units.' };
  }
}
