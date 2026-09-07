'use server';

import type { Role } from '@repo/db';
import { prisma } from '@/lib/prisma';
import { requireClientAccess, requireStaff } from '@/lib/auth-guard';
import {
  analyzeCaregiverProgress,
  type CaregiverGoalProgress,
  type CaregiverFidelityTrend,
  type CaregiverTrainingNotePayload,
} from '@/lib/caregiverTrainingEngine';

const CAREGIVER_NOTE_ROLES = ['BCBA', 'CLINICAL_DIRECTOR', 'CEO'] satisfies Role[];
const CAREGIVER_GOAL_STATUSES = [
  'INTRODUCED',
  'IN_PROGRESS',
  'MASTERED',
  'ON_HOLD',
] as const;

function parseCaregiverGoals(value: unknown): CaregiverGoalProgress[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const goal = entry as Record<string, unknown>;
    if (
      typeof goal.goalId !== 'string' ||
      typeof goal.goalDescription !== 'string' ||
      typeof goal.baselineFidelityPct !== 'number' ||
      !Number.isFinite(goal.baselineFidelityPct) ||
      typeof goal.currentFidelityPct !== 'number' ||
      !Number.isFinite(goal.currentFidelityPct) ||
      typeof goal.status !== 'string' ||
      !CAREGIVER_GOAL_STATUSES.includes(
        goal.status as (typeof CAREGIVER_GOAL_STATUSES)[number]
      )
    ) {
      return [];
    }
    return [{
      goalId: goal.goalId,
      goalDescription: goal.goalDescription,
      baselineFidelityPct: goal.baselineFidelityPct,
      currentFidelityPct: goal.currentFidelityPct,
      status: goal.status as CaregiverGoalProgress['status'],
      ...(typeof goal.notes === 'string' ? { notes: goal.notes } : {}),
    }];
  });
}

export async function submitCaregiverTrainingNote(
  _sessionId: string,
  _payload: CaregiverTrainingNotePayload
): Promise<{
  success: boolean;
  error?: string;
  units?: number;
}> {
  const gate = await requireStaff(CAREGIVER_NOTE_ROLES);
  if (!gate.ok) {
    return { success: false, error: gate.error };
  }
  void _sessionId;
  void _payload;

  // Isolated prototype: CRM must not auto-complete sessions or set bcbaSigned.
  // Session Studio (HRM) owns note delivery and attestation.
  return {
    success: false,
    error:
      'Caregiver training drafts are isolated. Submit 97156 notes through HRM Session Studio — CRM will not auto-complete or auto-sign notes.',
  };
}

export async function getCaregiverTrainingSummary(clientId: string): Promise<{
  success: boolean;
  trend?: CaregiverFidelityTrend;
  recentNotes?: Array<{
    sessionId: string;
    date: string;
    fidelityScore: number;
    minutes: number;
    signerName: string | null;
  }>;
  error?: string;
}> {
  try {
    if (!clientId) {
      return { success: false, error: 'Client ID is required.' };
    }

    const access = await requireClientAccess(clientId);
    if (!access.ok) {
      return { success: false, error: access.error };
    }

    const sessions = await prisma.session.findMany({
      where: {
        clientId,
        cptCode: '97156',
        status: 'COMPLETED',
      },
      include: {
        note: true,
      },
      orderBy: { scheduledStart: 'desc' },
      take: 20,
    });

    const parsedHistory = sessions.flatMap((s) => {
      const rawStructured = s.note?.structuredContent as Record<string, unknown> | null;
      const fidelity = rawStructured?.caregiverFidelityScore;
      if (
        typeof fidelity !== 'number' ||
        !Number.isFinite(fidelity) ||
        fidelity < 0 ||
        fidelity > 100
      ) {
        return [];
      }

      const intervalStart = s.actualStart ?? s.scheduledStart;
      const intervalEnd = s.actualEnd ?? s.scheduledEnd;
      const durationMinutes = Math.max(
        0,
        Math.round((intervalEnd.getTime() - intervalStart.getTime()) / 60_000)
      );

      return [{
        sessionId: s.id,
        date: s.scheduledStart.toISOString(),
        fidelityScore: fidelity,
        minutes: durationMinutes,
        signerName: s.note?.bcbaSignerName || null,
        goals: parseCaregiverGoals(rawStructured?.goalsAddressed),
      }];
    });

    const trend = analyzeCaregiverProgress(parsedHistory);

    return {
      success: true,
      trend,
      recentNotes: parsedHistory.map((p) => ({
        sessionId: p.sessionId,
        date: p.date,
        fidelityScore: p.fidelityScore,
        minutes: p.minutes,
        signerName: p.signerName,
      })),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve caregiver training summary.',
    };
  }
}
