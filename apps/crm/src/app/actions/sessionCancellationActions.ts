'use server';

import { prisma } from '@/lib/prisma';
import { requireClientAccess, requireStaff } from '@/lib/auth-guard';
import {
  calculateAttendanceScorecard,
  type AttendanceScorecard,
  type CancellationReasonCategory,
} from '@/lib/sessionCancellationCoordinator';
import { revalidatePath } from 'next/cache';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CANCELLATION_REASONS = new Set<CancellationReasonCategory>([
  'CLIENT_ILLNESS',
  'STAFF_ILLNESS',
  'WEATHER_EMERGENCY',
  'FAMILY_VACATION',
  'SCHEDULE_CONFLICT',
  'TRANSPORTATION_ISSUE',
  'UNEXCUSED_NO_SHOW',
  'OTHER',
]);

export async function logSessionCancellation(
  sessionId: string,
  params: {
    status: 'CANCELLED' | 'NO_SHOW';
    reasonCategory: CancellationReasonCategory;
    reasonNotes?: string;
  }
): Promise<{
  success: boolean;
  makeUpEligibilityUnavailableReason?: string;
  error?: string;
}> {
  try {
    const gate = await requireStaff(['CEO', 'CLINICAL_DIRECTOR', 'BCBA', 'CASE_COORDINATOR', 'OPS_DIRECTOR']);
    if (!gate.ok) {
      return { success: false, error: gate.error };
    }

    const reasonNotes = params.reasonNotes?.trim();
    if (
      !UUID_RE.test(sessionId) ||
      !['CANCELLED', 'NO_SHOW'].includes(params.status) ||
      !CANCELLATION_REASONS.has(params.reasonCategory) ||
      (reasonNotes?.length ?? 0) > 1_000
    ) {
      return { success: false, error: 'Valid cancellation details are required.' };
    }

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        clientId: true,
        status: true,
        updatedAt: true,
      },
    });

    if (!session) {
      return { success: false, error: 'Session not found.' };
    }

    const access = await requireClientAccess(session.clientId);
    if (!access.ok) {
      return { success: false, error: access.error };
    }

    if (session.status !== 'SCHEDULED') {
      return { success: false, error: 'Only scheduled sessions can be cancelled or marked no-show.' };
    }

    const update = await prisma.session.updateMany({
      where: {
        id: sessionId,
        clientId: session.clientId,
        status: 'SCHEDULED',
        updatedAt: session.updatedAt,
      },
      data: {
        status: params.status,
        location: reasonNotes ? `[${params.reasonCategory}] ${reasonNotes}` : params.reasonCategory,
      },
    });
    if (update.count !== 1) {
      return { success: false, error: 'Session changed before cancellation was saved. Refresh and try again.' };
    }

    revalidatePath(`/client/${session.clientId}`);
    revalidatePath('/notes');
    revalidatePath('/portal-billing/claims');

    return {
      success: true,
      makeUpEligibilityUnavailableReason:
        'Make-up eligibility requires payer-specific weekly authorization limits and current rendered-unit totals; no recommendation was generated.',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to record session cancellation.',
    };
  }
}

export async function getClientAttendanceScorecard(clientId: string): Promise<{
  success: boolean;
  scorecard?: AttendanceScorecard;
  error?: string;
}> {
  try {
    if (!UUID_RE.test(clientId)) {
      return { success: false, error: 'Client ID is required.' };
    }

    const access = await requireClientAccess(clientId);
    if (!access.ok) {
      return { success: false, error: access.error };
    }

    const sessions = await prisma.session.findMany({
      where: { clientId },
      select: {
        status: true,
        scheduledStart: true,
        scheduledEnd: true,
        location: true,
      },
      orderBy: { scheduledStart: 'desc' },
      take: 50,
    });

    const parsedSessions = sessions.map((s) => ({
      status: s.status,
      scheduledStart: s.scheduledStart,
      scheduledEnd: s.scheduledEnd,
      cancellationReason: s.location,
    }));

    const scorecard = calculateAttendanceScorecard(parsedSessions);

    return {
      success: true,
      scorecard,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to compute attendance scorecard.',
    };
  }
}
