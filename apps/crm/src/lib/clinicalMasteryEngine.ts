export type PromptLevel =
  | 'IND'
  | 'VERBAL'
  | 'GESTURAL'
  | 'MODEL'
  | 'PARTIAL_PHYSICAL'
  | 'FULL_PHYSICAL';

export type GoalPhase =
  | 'BASELINE'
  | 'ACQUISITION'
  | 'MASTERED'
  | 'GENERALIZATION'
  | 'MAINTENANCE';

export type TargetTrialScore = {
  sessionId: string;
  sessionDate: Date | string;
  totalTrials: number;
  independentTrials: number;
  promptedTrials: number;
  incorrectTrials: number;
  accuracyPercent: number; // (independent / total) * 100
  therapistId: string;
};

export type MasteryCriteriaConfig = {
  requiredAccuracyPercent?: number; // default 80%
  consecutiveSessionsRequired?: number; // default 3 sessions
  uniqueTherapistsRequired?: number; // default 2 therapists for generalization
};

export type GoalMasteryEvaluation = {
  currentPhase: GoalPhase;
  isMastered: boolean;
  consecutiveSessionsMet: number;
  consecutiveSessionsRequired: number;
  uniqueTherapistsCount: number;
  uniqueTherapistsRequired: number;
  averageAccuracy: number;
  trend: 'UPWARD' | 'STABLE' | 'DOWNWARD';
  recommendation: string;
};

/**
 * Calculates prompt independence score (0 - 100%) for a given trial.
 */
export function getPromptIndependenceScore(promptLevel?: PromptLevel | string | null): number {
  if (!promptLevel) return 100; // Independent by default if correct without prompt
  const p = String(promptLevel).toUpperCase();
  switch (p) {
    case 'IND':
    case 'INDEPENDENT':
      return 100;
    case 'VERBAL':
      return 75;
    case 'GESTURAL':
      return 50;
    case 'MODEL':
      return 25;
    case 'PARTIAL_PHYSICAL':
      return 10;
    case 'FULL_PHYSICAL':
      return 0;
    default:
      return 50;
  }
}

/**
 * Evaluates whether a clinical target has satisfied mastery criteria across consecutive sessions.
 */
export function evaluateTargetMastery(
  sessionScores: TargetTrialScore[],
  criteria: MasteryCriteriaConfig = {}
): GoalMasteryEvaluation {
  const targetAccuracy =
    typeof criteria.requiredAccuracyPercent === 'number' &&
    Number.isFinite(criteria.requiredAccuracyPercent)
      ? Math.max(1, Math.min(100, criteria.requiredAccuracyPercent))
      : 80.0;
  const targetConsecutive =
    typeof criteria.consecutiveSessionsRequired === 'number' &&
    Number.isInteger(criteria.consecutiveSessionsRequired) &&
    criteria.consecutiveSessionsRequired > 0
      ? criteria.consecutiveSessionsRequired
      : 3;
  const targetTherapists =
    typeof criteria.uniqueTherapistsRequired === 'number' &&
    Number.isInteger(criteria.uniqueTherapistsRequired) &&
    criteria.uniqueTherapistsRequired > 0
      ? criteria.uniqueTherapistsRequired
      : 2;

  const validScores = (Array.isArray(sessionScores) ? sessionScores : []).filter(
    (s): s is TargetTrialScore => Boolean(s && typeof s === 'object')
  );

  if (validScores.length === 0) {
    return {
      currentPhase: 'BASELINE',
      isMastered: false,
      consecutiveSessionsMet: 0,
      consecutiveSessionsRequired: targetConsecutive,
      uniqueTherapistsCount: 0,
      uniqueTherapistsRequired: targetTherapists,
      averageAccuracy: 0,
      trend: 'STABLE',
      recommendation: 'Collect baseline data across initial sessions.',
    };
  }

  // Sort chronological with defensive timestamp fallback
  const sorted = [...validScores].sort((a, b) => {
    const timeA = new Date(a.sessionDate || '').getTime() || 0;
    const timeB = new Date(b.sessionDate || '').getTime() || 0;
    return timeA - timeB;
  });

  const totalAccuracySum = sorted.reduce((sum, s) => {
    const acc = Number.isFinite(s.accuracyPercent)
      ? Math.max(0, Math.min(100, s.accuracyPercent))
      : 0;
    return sum + acc;
  }, 0);
  const averageAccuracy = Number((totalAccuracySum / sorted.length).toFixed(1));

  // Determine trend across last 3+ sessions
  let trend: 'UPWARD' | 'STABLE' | 'DOWNWARD' = 'STABLE';
  if (sorted.length >= 3) {
    const recent = sorted.slice(-3);
    const firstAcc = Number.isFinite(recent[0].accuracyPercent) ? recent[0].accuracyPercent : 0;
    const lastAcc = Number.isFinite(recent[2].accuracyPercent) ? recent[2].accuracyPercent : 0;
    if (lastAcc > firstAcc + 5) {
      trend = 'UPWARD';
    } else if (lastAcc < firstAcc - 5) {
      trend = 'DOWNWARD';
    }
  }

  // Count consecutive passing sessions from the most recent session backwards
  let consecutiveMet = 0;
  const meetingTherapists = new Set<string>();

  for (let i = sorted.length - 1; i >= 0; i--) {
    const session = sorted[i];
    const acc = Number.isFinite(session.accuracyPercent) ? session.accuracyPercent : 0;
    if (acc >= targetAccuracy) {
      consecutiveMet++;
      if (session.therapistId && typeof session.therapistId === 'string') {
        meetingTherapists.add(session.therapistId.trim());
      }
    } else {
      break;
    }
  }

  const uniqueTherapistsCount = meetingTherapists.size;
  const isMastered =
    consecutiveMet >= targetConsecutive && uniqueTherapistsCount >= targetTherapists;

  let currentPhase: GoalPhase = 'ACQUISITION';
  let recommendation = `Continue target acquisition (${consecutiveMet}/${targetConsecutive} passing sessions).`;

  if (isMastered) {
    currentPhase = 'MASTERED';
    recommendation = `Target mastery achieved (${consecutiveMet} consecutive sessions at >= ${targetAccuracy}% with ${uniqueTherapistsCount} therapists). Advance to Generalization.`;
  } else if (consecutiveMet >= targetConsecutive && uniqueTherapistsCount < targetTherapists) {
    currentPhase = 'GENERALIZATION';
    recommendation = `Target accuracy met, but requires generalization probe with a 2nd therapist (${uniqueTherapistsCount}/${targetTherapists} therapists).`;
  } else if (trend === 'DOWNWARD' && sorted.length >= 4) {
    recommendation = 'Target is showing downward trend. Review prompt hierarchy, reinforcer efficacy, or antecedent modifications.';
  }

  return {
    currentPhase,
    isMastered,
    consecutiveSessionsMet: consecutiveMet,
    consecutiveSessionsRequired: targetConsecutive,
    uniqueTherapistsCount,
    uniqueTherapistsRequired: targetTherapists,
    averageAccuracy,
    trend,
    recommendation,
  };
}

export type AbcIncident = {
  id?: string;
  antecedent: string;
  behavior: string;
  consequence: string;
  perceivedFunction?: 'ESCAPE' | 'ATTENTION' | 'TANGIBLE' | 'SENSORY' | string;
  durationSeconds?: number;
};

export type BehaviorFunctionBreakdown = {
  totalIncidents: number;
  escapeCount: number;
  escapePercent: number;
  attentionCount: number;
  attentionPercent: number;
  tangibleCount: number;
  tangiblePercent: number;
  sensoryCount: number;
  sensoryPercent: number;
  primaryHypothesizedFunction: 'ESCAPE' | 'ATTENTION' | 'TANGIBLE' | 'SENSORY' | 'UNDETERMINED';
  topAntecedents: { antecedent: string; count: number }[];
  topConsequences: { consequence: string; count: number }[];
};

/**
 * Analyzes Antecedent-Behavior-Consequence (ABC) data to determine functional behavior distribution.
 */
export function analyzeAbcBehaviorFunctions(incidents: AbcIncident[]): BehaviorFunctionBreakdown {
  const safeIncidents = (Array.isArray(incidents) ? incidents : []).filter(
    (item): item is AbcIncident => Boolean(item && typeof item === 'object')
  );

  if (safeIncidents.length === 0) {
    return {
      totalIncidents: 0,
      escapeCount: 0,
      escapePercent: 0,
      attentionCount: 0,
      attentionPercent: 0,
      tangibleCount: 0,
      tangiblePercent: 0,
      sensoryCount: 0,
      sensoryPercent: 0,
      primaryHypothesizedFunction: 'UNDETERMINED',
      topAntecedents: [],
      topConsequences: [],
    };
  }

  let escapeCount = 0;
  let attentionCount = 0;
  let tangibleCount = 0;
  let sensoryCount = 0;

  const antecedentMap = new Map<string, number>();
  const consequenceMap = new Map<string, number>();

  for (const item of safeIncidents) {
    const a = String(item.antecedent || '').toLowerCase();
    const c = String(item.consequence || '').toLowerCase();
    const f = String(item.perceivedFunction || '').toUpperCase();

    // Map by explicit function or heuristic keywords
    if (f === 'ESCAPE' || a.includes('demand') || a.includes('task') || a.includes('transition') || c.includes('break') || c.includes('delayed')) {
      escapeCount++;
    } else if (f === 'ATTENTION' || a.includes('alone') || a.includes('diverted') || c.includes('reprimand') || c.includes('comfort') || c.includes('talked')) {
      attentionCount++;
    } else if (f === 'TANGIBLE' || a.includes('denied') || a.includes('item removed') || c.includes('given item') || c.includes('snack')) {
      tangibleCount++;
    } else if (f === 'SENSORY' || a.includes('noise') || a.includes('lights') || c.includes('sensory') || c.includes('self-stim')) {
      sensoryCount++;
    } else {
      escapeCount++; // default baseline category
    }

    if (item.antecedent && typeof item.antecedent === 'string') {
      const trimmed = item.antecedent.trim();
      if (trimmed) antecedentMap.set(trimmed, (antecedentMap.get(trimmed) || 0) + 1);
    }
    if (item.consequence && typeof item.consequence === 'string') {
      const trimmed = item.consequence.trim();
      if (trimmed) consequenceMap.set(trimmed, (consequenceMap.get(trimmed) || 0) + 1);
    }
  }

  const total = safeIncidents.length;
  const escapePercent = Number(((escapeCount / total) * 100).toFixed(1));
  const attentionPercent = Number(((attentionCount / total) * 100).toFixed(1));
  const tangiblePercent = Number(((tangibleCount / total) * 100).toFixed(1));
  const sensoryPercent = Number(((sensoryCount / total) * 100).toFixed(1));

  const counts = [
    { fn: 'ESCAPE' as const, count: escapeCount },
    { fn: 'ATTENTION' as const, count: attentionCount },
    { fn: 'TANGIBLE' as const, count: tangibleCount },
    { fn: 'SENSORY' as const, count: sensoryCount },
  ].sort((a, b) => b.count - a.count);

  const primaryHypothesizedFunction = counts[0].count > 0 ? counts[0].fn : 'UNDETERMINED';

  const topAntecedents = Array.from(antecedentMap.entries())
    .map(([antecedent, count]) => ({ antecedent, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const topConsequences = Array.from(consequenceMap.entries())
    .map(([consequence, count]) => ({ consequence, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalIncidents: total,
    escapeCount,
    escapePercent,
    attentionCount,
    attentionPercent,
    tangibleCount,
    tangiblePercent,
    sensoryCount,
    sensoryPercent,
    primaryHypothesizedFunction,
    topAntecedents,
    topConsequences,
  };
}
