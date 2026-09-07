/**
 * Caregiver Training & Family Guidance Engine (CPT 97156)
 *
 * Provides structured clinical validation, Behavioral Skills Training (BST)
 * scoring, caregiver fidelity analytics, and carryover assignment tracking.
 */

export interface BstWorkflowSteps {
  instruction: boolean;
  modeling: boolean;
  rehearsal: boolean;
  feedback: boolean;
}

export interface CaregiverGoalProgress {
  goalId: string;
  goalDescription: string;
  baselineFidelityPct: number;
  currentFidelityPct: number;
  status: 'INTRODUCED' | 'IN_PROGRESS' | 'MASTERED' | 'ON_HOLD';
  notes?: string;
}

export interface CaregiverTrainingNotePayload {
  caregiverNames: string[];
  setting: 'HOME' | 'CLINIC' | 'TELEHEALTH' | 'COMMUNITY';
  sessionMinutes: number;
  bstSteps: BstWorkflowSteps;
  caregiverFidelityScore: number; // 0 to 100
  goalsAddressed: CaregiverGoalProgress[];
  caregiverReceptivity: 'HIGHLY_RECEPTIVE' | 'MODERATE' | 'NEEDS_SUPPORT' | 'RESISTANT';
  barriersIdentified?: string[];
  carryoverAssignments: string;
  bcbaClinicalNarrative: string;
  nextSessionFocus?: string;
}

export interface CaregiverTrainingValidationResult {
  ok: boolean;
  errors: string[];
  fidelityTier: 'EXEMPLARY' | 'PROFICIENT' | 'EMERGING' | 'NEEDS_INTERVENTION';
  bstCompleted: boolean;
  estimatedUnits: number;
}

export interface CaregiverFidelityTrend {
  averageFidelity: number;
  fidelityTrajectory: 'IMPROVING' | 'STABLE' | 'DECLINING';
  totalSessionsCount: number;
  totalTrainingMinutes: number;
  masteredGoalsCount: number;
  activeGoalsCount: number;
}

/**
 * Validates a CPT 97156 Caregiver Training session note for clinical & payer compliance
 */
export function validateCaregiverTrainingNote(
  payload: Partial<CaregiverTrainingNotePayload>
): CaregiverTrainingValidationResult {
  const errors: string[] = [];

  const safeNames = Array.isArray(payload.caregiverNames)
    ? payload.caregiverNames.filter((n) => typeof n === 'string' && n.trim().length > 0)
    : [];

  if (safeNames.length === 0) {
    errors.push('At least one participating caregiver name is required.');
  }

  const minutes = typeof payload.sessionMinutes === 'number' && Number.isFinite(payload.sessionMinutes)
    ? Math.max(0, Math.floor(payload.sessionMinutes))
    : 0;

  if (minutes < 15) {
    errors.push('CPT 97156 requires a minimum of 15 minutes duration.');
  }

  const bst = payload.bstSteps || {
    instruction: false,
    modeling: false,
    rehearsal: false,
    feedback: false,
  };

  const bstCompleted = bst.instruction && bst.modeling && bst.rehearsal && bst.feedback;
  if (!bstCompleted) {
    errors.push('All 4 Behavioral Skills Training (BST) components (Instruction, Modeling, Rehearsal, Feedback) are required for 97156 standard.');
  }

  const fidelity = typeof payload.caregiverFidelityScore === 'number' && Number.isFinite(payload.caregiverFidelityScore)
    ? Math.min(100, Math.max(0, payload.caregiverFidelityScore))
    : null;

  if (fidelity === null) {
    errors.push('A valid caregiver implementation fidelity score (0–100%) is required.');
  }

  const goals = Array.isArray(payload.goalsAddressed) ? payload.goalsAddressed : [];
  if (goals.length === 0) {
    errors.push('At least one caregiver goal must be addressed during the session.');
  }

  const narrative = typeof payload.bcbaClinicalNarrative === 'string'
    ? payload.bcbaClinicalNarrative.trim()
    : '';

  if (narrative.length < 20) {
    errors.push('A comprehensive BCBA clinical narrative (minimum 20 characters) is required.');
  }

  const carryover = typeof payload.carryoverAssignments === 'string'
    ? payload.carryoverAssignments.trim()
    : '';

  if (carryover.length === 0) {
    errors.push('Caregiver carryover / home practice assignments must be documented.');
  }

  // Determine fidelity tier
  let fidelityTier: CaregiverTrainingValidationResult['fidelityTier'] = 'EMERGING';
  const score = fidelity ?? 0;
  if (score >= 90) {
    fidelityTier = 'EXEMPLARY';
  } else if (score >= 75) {
    fidelityTier = 'PROFICIENT';
  } else if (score >= 60) {
    fidelityTier = 'EMERGING';
  } else {
    fidelityTier = 'NEEDS_INTERVENTION';
  }

  const estimatedUnits = Math.floor(minutes / 15);

  return {
    ok: errors.length === 0,
    errors,
    fidelityTier,
    bstCompleted,
    estimatedUnits,
  };
}

/**
 * Computes historical fidelity trends and mastery statistics across multiple 97156 sessions
 */
export function analyzeCaregiverProgress(
  sessions: Array<{
    date: Date | string;
    fidelityScore: number;
    minutes: number;
    goals?: CaregiverGoalProgress[];
  }>
): CaregiverFidelityTrend {
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return {
      averageFidelity: 0,
      fidelityTrajectory: 'STABLE',
      totalSessionsCount: 0,
      totalTrainingMinutes: 0,
      masteredGoalsCount: 0,
      activeGoalsCount: 0,
    };
  }

  const validSessions = sessions
    .filter((s) => typeof s.fidelityScore === 'number' && Number.isFinite(s.fidelityScore))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (validSessions.length === 0) {
    return {
      averageFidelity: 0,
      fidelityTrajectory: 'STABLE',
      totalSessionsCount: 0,
      totalTrainingMinutes: 0,
      masteredGoalsCount: 0,
      activeGoalsCount: 0,
    };
  }

  const totalFidelity = validSessions.reduce((acc, s) => acc + s.fidelityScore, 0);
  const averageFidelity = Math.round(totalFidelity / validSessions.length);

  const totalMinutes = validSessions.reduce(
    (acc, s) => acc + (typeof s.minutes === 'number' && Number.isFinite(s.minutes) ? s.minutes : 0),
    0
  );

  // Compute trajectory by comparing first half to second half
  let fidelityTrajectory: CaregiverFidelityTrend['fidelityTrajectory'] = 'STABLE';
  if (validSessions.length >= 2) {
    const midpoint = Math.floor(validSessions.length / 2);
    const firstHalf = validSessions.slice(0, midpoint);
    const secondHalf = validSessions.slice(midpoint);

    const firstAvg = firstHalf.reduce((a, b) => a + b.fidelityScore, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b.fidelityScore, 0) / secondHalf.length;

    if (secondAvg - firstAvg >= 5) {
      fidelityTrajectory = 'IMPROVING';
    } else if (firstAvg - secondAvg >= 5) {
      fidelityTrajectory = 'DECLINING';
    }
  }

  // Aggregate goals from the most recent session
  const latestSession = validSessions[validSessions.length - 1];
  const latestGoals = Array.isArray(latestSession.goals) ? latestSession.goals : [];

  const masteredGoalsCount = latestGoals.filter((g) => g.status === 'MASTERED').length;
  const activeGoalsCount = latestGoals.filter((g) => g.status === 'IN_PROGRESS' || g.status === 'INTRODUCED').length;

  return {
    averageFidelity,
    fidelityTrajectory,
    totalSessionsCount: validSessions.length,
    totalTrainingMinutes: totalMinutes,
    masteredGoalsCount,
    activeGoalsCount,
  };
}
