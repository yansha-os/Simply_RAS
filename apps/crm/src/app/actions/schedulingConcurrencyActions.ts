'use server';

import { prisma } from '@/lib/prisma';
import { requireClientAccess, requireStaff } from '@/lib/auth-guard';
import {
  validateSessionConcurrency,
  type ConcurrencyCheckResult,
  type ScheduledSessionSlot,
} from '@/lib/schedulingConcurrencyEngine';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CPT_RE = /^\d{5}$/;

export async function checkSessionSchedulingPreflight(params: {
  proposed: ScheduledSessionSlot;
}): Promise<{
  success: boolean;
  concurrency?: ConcurrencyCheckResult;
  headroomUnavailableReason?: string;
  error?: string;
}> {
  try {
    const gate = await requireStaff(['CEO', 'CLINICAL_DIRECTOR', 'CASE_COORDINATOR', 'BCBA', 'OPS_DIRECTOR']);
    if (!gate.ok) {
      return { success: false, error: gate.error };
    }

    const { proposed } = params;
    if (
      !UUID_RE.test(proposed.clientId) ||
      (proposed.rbtId != null && !UUID_RE.test(proposed.rbtId)) ||
      (proposed.bcbaId != null && !UUID_RE.test(proposed.bcbaId)) ||
      !CPT_RE.test(proposed.cptCode.trim())
    ) {
      return { success: false, error: 'Valid client, staff, and CPT identifiers are required.' };
    }

    const access = await requireClientAccess(proposed.clientId);
    if (!access.ok) {
      return { success: false, error: access.error };
    }

    const propStart = new Date(proposed.start);
    const propEnd = new Date(proposed.end);
    const durationMs = propEnd.getTime() - propStart.getTime();
    if (
      !Number.isFinite(propStart.getTime()) ||
      !Number.isFinite(propEnd.getTime()) ||
      durationMs <= 0 ||
      durationMs > 24 * 60 * 60 * 1000
    ) {
      return { success: false, error: 'Provide a valid session window no longer than 24 hours.' };
    }

    // Fetch surrounding sessions for the day (+/- 24 hours) for the client and staff
    const windowStart = new Date(propStart.getTime() - 24 * 60 * 60 * 1000);
    const windowEnd = new Date(propEnd.getTime() + 24 * 60 * 60 * 1000);

    const orClauses: Array<{ clientId?: string; rbtId?: string; bcbaId?: string }> = [
      { clientId: proposed.clientId },
    ];
    if (proposed.rbtId) orClauses.push({ rbtId: proposed.rbtId });
    if (proposed.bcbaId) orClauses.push({ bcbaId: proposed.bcbaId });

    const existingDbSessions = await prisma.session.findMany({
      where: {
        scheduledStart: { gte: windowStart, lte: windowEnd },
        status: { in: ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED'] },
        OR: orClauses,
      },
      select: {
        id: true,
        clientId: true,
        cptCode: true,
        scheduledStart: true,
        scheduledEnd: true,
        rbtId: true,
        bcbaId: true,
        location: true,
      },
    });

    const existingSlots: ScheduledSessionSlot[] = existingDbSessions.map((s) => ({
      id: s.id,
      clientId: s.clientId,
      cptCode: s.cptCode || '97153',
      start: s.scheduledStart,
      end: s.scheduledEnd,
      rbtId: s.rbtId,
      bcbaId: s.bcbaId,
      location: s.location,
    }));

    // This endpoint currently checks new sessions only. Do not trust a caller's
    // proposed ID, because matching an existing ID would suppress a real conflict.
    const concurrency = validateSessionConcurrency(
      { ...proposed, id: 'new-session-preflight' },
      existingSlots
    );

    return {
      success: true,
      concurrency,
      headroomUnavailableReason:
        'Weekly authorization headroom is unavailable because authorizations store total approved units, not a payer-approved weekly cap.',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to perform scheduling concurrency check.',
    };
  }
}
