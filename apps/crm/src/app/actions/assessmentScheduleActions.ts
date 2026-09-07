'use server';

import { prisma } from '@/lib/prisma';
import { requireClientAccess } from '@/lib/auth-guard';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ClientAssessmentScheduleSnapshot = {
  sessionId: string | null;
  sessionStatus: string | null;
  sessionScheduledStart: string | null;
  treatmentPlanScheduledAt: string | null;
  /** True when a durable 97151 Session exists for this client. */
  hasDurableSession: boolean;
};

function readTreatmentPlanAssessmentAt(raw: unknown): string | null {
  if (!raw) return null;
  let plan: unknown = raw;
  if (typeof plan === 'string') {
    try {
      plan = JSON.parse(plan);
    } catch {
      return null;
    }
  }
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return null;
  const at = (plan as Record<string, unknown>).assessmentScheduledAt;
  if (at == null || String(at).trim() === '') return null;
  const d = at instanceof Date ? at : new Date(String(at));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Read-only: durable 97151 assessment Session + treatmentPlan.assessmentScheduledAt for chart honesty.
 */
export async function getClientAssessmentSchedule(clientId: string): Promise<
  | { success: true; data: ClientAssessmentScheduleSnapshot }
  | { success: false; error: string }
> {
  try {
    if (!UUID_RE.test(clientId)) {
      return { success: false, error: 'Client id is required.' };
    }

    const gate = await requireClientAccess(clientId);
    if (!gate.ok) return { success: false, error: gate.error };

    const [client, assessmentSession] = await Promise.all([
      prisma.client.findUnique({
        where: { id: clientId },
        select: { treatmentPlan: true },
      }),
      prisma.session.findFirst({
        where: { clientId, cptCode: '97151' },
        orderBy: { scheduledStart: 'asc' },
        select: { id: true, status: true, scheduledStart: true },
      }),
    ]);

    if (!client) {
      return { success: false, error: 'Client not found.' };
    }

    return {
      success: true,
      data: {
        sessionId: assessmentSession?.id ?? null,
        sessionStatus: assessmentSession?.status ?? null,
        sessionScheduledStart: assessmentSession?.scheduledStart?.toISOString() ?? null,
        treatmentPlanScheduledAt: readTreatmentPlanAssessmentAt(client.treatmentPlan),
        hasDurableSession: Boolean(assessmentSession),
      },
    };
  } catch (error) {
    console.error(
      'getClientAssessmentSchedule failed:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return { success: false, error: 'Failed to load assessment schedule.' };
  }
}
