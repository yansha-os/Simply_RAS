export type ClinicalGoalStatus = 'New' | 'Continuing' | 'On Hold' | 'Mastered' | string;

export type ClinicalSkillGoal = {
  kind: 'skill';
  domain: string;
  description: string;
  mastery: string;
  baseline: string;
  currentLevel: string;
  targetDate: string;
  status: ClinicalGoalStatus;
};

export type ClinicalBrpGoal = {
  kind: 'brp';
  behavior: string;
  function: string;
  mastery: string;
  baseline: string;
  currentLevel: string;
  targetDate: string;
  status: ClinicalGoalStatus;
  risk: string;
};

export type ClinicalParentGoal = {
  kind: 'parent';
  description: string;
  mastery: string;
  baseline: string;
  currentLevel: string;
  targetDate: string;
  status: ClinicalGoalStatus;
};

export type ClinicalDomainSummary = {
  key: string;
  label: string;
  severity: string;
  description: string;
};

export type ClinicalGoalsSnapshot = {
  hasPlan: boolean;
  planStatus: string | null;
  bcbaSubmittedAt: string | null;
  domains: ClinicalDomainSummary[];
  skillGoals: ClinicalSkillGoal[];
  brpGoals: ClinicalBrpGoal[];
  parentGoals: ClinicalParentGoal[];
  counts: {
    total: number;
    skill: number;
    brp: number;
    parent: number;
    mastered: number;
    active: number;
  };
};

function asRecord(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, any>;
  }
  return {};
}

function str(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function statusOf(v: unknown): ClinicalGoalStatus {
  const s = str(v);
  return s || 'New';
}

/** Pure parser for Client.treatmentPlan JSON → clinical goals snapshot. */
export function parseClinicalGoalsFromTreatmentPlan(raw: unknown): ClinicalGoalsSnapshot {
  const plan = asRecord(raw);
  const skillRaw = Array.isArray(plan.skillGoals) ? plan.skillGoals : [];
  const brpRaw = Array.isArray(plan.brp) ? plan.brp : [];
  const parentRaw = Array.isArray(plan.parentGoals) ? plan.parentGoals : [];

  const skillGoals: ClinicalSkillGoal[] = skillRaw.map((g: any) => ({
    kind: 'skill' as const,
    domain: str(g?.domain) || 'Unassigned',
    description: str(g?.description),
    mastery: str(g?.mastery),
    baseline: str(g?.baseline),
    currentLevel: str(g?.currentLevel),
    targetDate: str(g?.targetDate),
    status: statusOf(g?.status),
  }));

  const brpGoals: ClinicalBrpGoal[] = brpRaw.map((b: any) => ({
    kind: 'brp' as const,
    behavior: str(b?.behavior),
    function: str(b?.function),
    mastery: str(b?.mastery),
    baseline: str(b?.baseline),
    currentLevel: str(b?.currentLevel),
    targetDate: str(b?.targetDate),
    status: statusOf(b?.status),
    risk: str(b?.risk) || 'Low',
  }));

  const parentGoals: ClinicalParentGoal[] = parentRaw.map((p: any) => ({
    kind: 'parent' as const,
    description: str(p?.description),
    mastery: str(p?.mastery),
    baseline: str(p?.baseline),
    currentLevel: str(p?.currentLevel),
    targetDate: str(p?.targetDate),
    status: statusOf(p?.status),
  }));

  const domains: ClinicalDomainSummary[] = [
    {
      key: 'langComm',
      label: 'Language / Communication',
      severity: str(plan.langCommSeverity),
      description: str(plan.langCommDescription),
    },
    {
      key: 'socialEmotional',
      label: 'Social / Emotional',
      severity: str(plan.socialEmotionalSeverity),
      description: str(plan.socialEmotionalDescription),
    },
    {
      key: 'adaptive',
      label: 'Adaptive Functioning',
      severity: str(plan.adaptiveSeverity),
      description: str(plan.adaptiveDescription),
    },
  ];

  const hasMeaningfulContent =
    skillGoals.length > 0 ||
    brpGoals.length > 0 ||
    parentGoals.length > 0 ||
    domains.some((d) => d.severity || d.description) ||
    Boolean(plan.status) ||
    Boolean(plan.signature) ||
    Boolean(plan.bcbaSubmittedAt);

  const allStatuses = [
    ...skillGoals.map((g) => g.status),
    ...brpGoals.map((g) => g.status),
    ...parentGoals.map((g) => g.status),
  ];
  const mastered = allStatuses.filter((s) => s === 'Mastered').length;
  const total = skillGoals.length + brpGoals.length + parentGoals.length;

  return {
    hasPlan: hasMeaningfulContent || Object.keys(plan).length > 0,
    planStatus: str(plan.status) || null,
    bcbaSubmittedAt: str(plan.bcbaSubmittedAt) || null,
    domains,
    skillGoals,
    brpGoals,
    parentGoals,
    counts: {
      total,
      skill: skillGoals.length,
      brp: brpGoals.length,
      parent: parentGoals.length,
      mastered,
      active: total - mastered,
    },
  };
}

/**
 * Allowed SkillTarget.targetStatus values. BASELINE / IN_PROGRESS are the only
 * statuses HRM Session Studio Collect loads — MASTERED / ON_HOLD / DISCONTINUED
 * targets drop out of RBT data collection automatically.
 */
export const SKILL_TARGET_STATUSES = [
  'BASELINE',
  'IN_PROGRESS',
  'MASTERED',
  'ON_HOLD',
  'DISCONTINUED',
] as const;

export type SkillTargetStatus = (typeof SKILL_TARGET_STATUSES)[number];

/** Pure: does this status keep the target visible in Studio Collect? */
export function isCollectActiveStatus(status: string): boolean {
  const s = str(status).toUpperCase();
  return s === 'BASELINE' || s === 'IN_PROGRESS';
}

/** Map TP goal status → SkillTarget.targetStatus (Session Studio Collect filter). */
export function mapGoalStatusToSkillTargetStatus(status: ClinicalGoalStatus): string {
  const s = str(status).toLowerCase();
  if (s === 'mastered') return 'MASTERED';
  if (s === 'on hold') return 'ON_HOLD';
  if (s === 'continuing') return 'IN_PROGRESS';
  return 'BASELINE';
}

export type SkillTargetSyncPayload = {
  domain: string;
  title: string;
  description: string | null;
  measurementType: string;
  targetStatus: string;
  masteryCriteria: string | null;
  baselineData: number | null;
};

export type BehaviorTargetSyncPayload = {
  behaviorName: string;
  definition: string;
  measurementType: string;
  antecedents: string | null;
  consequences: string | null;
  replacementBehavior: string | null;
};

function parseBaselineFloat(raw: string): number | null {
  if (!raw) return null;
  const n = Number.parseFloat(raw.replace(/[^0-9.+-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Pure: TP skill goals → SkillTarget create/update payloads (skips empty titles). */
export function skillGoalsToSkillTargetPayloads(
  goals: ClinicalSkillGoal[],
): SkillTargetSyncPayload[] {
  const out: SkillTargetSyncPayload[] = [];
  for (const g of goals) {
    const title = str(g.description).slice(0, 200);
    if (!title) continue;
    out.push({
      domain: str(g.domain) || 'Unassigned',
      title,
      description: [str(g.currentLevel) && `Current: ${str(g.currentLevel)}`, str(g.targetDate) && `Target date: ${str(g.targetDate)}`]
        .filter(Boolean)
        .join(' · ') || null,
      measurementType: 'TRIAL',
      targetStatus: mapGoalStatusToSkillTargetStatus(g.status),
      masteryCriteria: str(g.mastery) || '80% over 3 sessions',
      baselineData: parseBaselineFloat(str(g.baseline)),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Mastery criteria — pure parse + evaluate against per-session % independent.
// Used by the Clinical Chart Progress tab to show honest mastery tracking.
// ---------------------------------------------------------------------------

export type MasteryCriteriaParsed = {
  /** Threshold percent, 1–100 */
  percent: number;
  /** Consecutive sessions required at/above the threshold (min 1) */
  sessions: number;
};

/**
 * Pure: parse free-text mastery criteria like "80% over 3 sessions",
 * "90% across 2 consecutive days", "80%". Returns null when no percent found.
 */
export function parseMasteryCriteria(raw: string | null | undefined): MasteryCriteriaParsed | null {
  const s = str(raw);
  if (!s) return null;
  const pctMatch = s.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
  if (!pctMatch) return null;
  const percent = Number.parseFloat(pctMatch[1]);
  if (!Number.isFinite(percent) || percent <= 0 || percent > 100) return null;
  const sessMatch = s.match(/(\d{1,2})\s*(?:consecutive\s*)?(?:sessions?|days?|opportunities)/i);
  const sessions = sessMatch ? Number.parseInt(sessMatch[1], 10) : 1;
  return { percent, sessions: Math.max(1, sessions) };
}

export type MasteryEvaluation =
  | { state: 'no-criteria' }
  | { state: 'no-data'; percent: number; sessions: number }
  | {
      state: 'met' | 'on-track' | 'below';
      percent: number;
      sessions: number;
      /** Consecutive most-recent sessions at/above the threshold */
      streak: number;
    };

/**
 * Pure: evaluate mastery from per-session % independent, most-recent first.
 * Null percents (sessions without scoreable trials) are skipped, not counted
 * against the streak.
 */
export function evaluateMastery(
  criteria: string | null | undefined,
  sessionPercentsRecentFirst: Array<number | null>,
): MasteryEvaluation {
  const parsed = parseMasteryCriteria(criteria);
  if (!parsed) return { state: 'no-criteria' };

  const points = sessionPercentsRecentFirst.filter((p): p is number => p != null);
  if (points.length === 0) {
    return { state: 'no-data', percent: parsed.percent, sessions: parsed.sessions };
  }

  let streak = 0;
  for (const p of points) {
    if (p >= parsed.percent) streak += 1;
    else break;
  }

  const state = streak >= parsed.sessions ? 'met' : streak > 0 ? 'on-track' : 'below';
  return { state, percent: parsed.percent, sessions: parsed.sessions, streak };
}

/** Pure: TP BRP goals → BehaviorTarget create/update payloads. */
export function brpGoalsToBehaviorTargetPayloads(
  goals: ClinicalBrpGoal[],
): BehaviorTargetSyncPayload[] {
  const out: BehaviorTargetSyncPayload[] = [];
  for (const b of goals) {
    const behaviorName = str(b.behavior).slice(0, 200);
    if (!behaviorName) continue;
    const defParts = [
      str(b.function) && `Function: ${str(b.function)}`,
      str(b.mastery) && `Mastery: ${str(b.mastery)}`,
      str(b.baseline) && `Baseline: ${str(b.baseline)}`,
      str(b.risk) && `Risk: ${str(b.risk)}`,
    ].filter(Boolean);
    out.push({
      behaviorName,
      definition: defParts.join(' · ') || `Behavior reduction target: ${behaviorName}`,
      measurementType: 'FREQUENCY',
      antecedents: null,
      consequences: null,
      replacementBehavior: null,
    });
  }
  return out;
}
