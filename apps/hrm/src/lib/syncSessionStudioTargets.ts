/**
 * Idempotent TP → SkillTarget / BehaviorTarget bridge for Session Studio Collect.
 * Mirrors CRM clinicalGoalsActions.syncTreatmentPlanTargetsToSessionStudio (create/update by title).
 * Safe to call when SkillTargets are empty but Client.treatmentPlan has goals.
 */

type SkillGoal = {
  domain?: unknown;
  description?: unknown;
  mastery?: unknown;
  baseline?: unknown;
  currentLevel?: unknown;
  targetDate?: unknown;
  status?: unknown;
};

type BrpGoal = {
  behavior?: unknown;
  function?: unknown;
  mastery?: unknown;
  baseline?: unknown;
  risk?: unknown;
};

function asRecord(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function str(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function mapGoalStatus(status: unknown): string {
  const s = str(status).toLowerCase();
  if (s === 'mastered') return 'MASTERED';
  if (s === 'on hold') return 'ON_HOLD';
  if (s === 'continuing') return 'IN_PROGRESS';
  return 'BASELINE';
}

function parseBaselineFloat(raw: string): number | null {
  if (!raw) return null;
  const n = Number.parseFloat(raw.replace(/[^0-9.+-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function treatmentPlanHasSyncableGoals(treatmentPlan: unknown): boolean {
  const plan = asRecord(treatmentPlan);
  const skills = Array.isArray(plan.skillGoals) ? plan.skillGoals : [];
  const brp = Array.isArray(plan.brp) ? plan.brp : [];
  const hasSkill = skills.some((g) => str((g as SkillGoal)?.description).length > 0);
  const hasBrp = brp.some((b) => str((b as BrpGoal)?.behavior).length > 0);
  return hasSkill || hasBrp;
}

export type SyncTargetsFromPlanResult = {
  skillsCreated: number;
  skillsUpdated: number;
  behaviorsCreated: number;
  behaviorsUpdated: number;
  skippedEmpty: number;
};

/**
 * Pure payloads from treatmentPlan JSON (no DB).
 */
export function payloadsFromTreatmentPlan(treatmentPlan: unknown): {
  skills: Array<{
    domain: string;
    title: string;
    description: string | null;
    measurementType: string;
    targetStatus: string;
    masteryCriteria: string | null;
    baselineData: number | null;
  }>;
  behaviors: Array<{
    behaviorName: string;
    definition: string;
    measurementType: string;
  }>;
  skippedEmpty: number;
} {
  const plan = asRecord(treatmentPlan);
  const skillRaw = Array.isArray(plan.skillGoals) ? (plan.skillGoals as SkillGoal[]) : [];
  const brpRaw = Array.isArray(plan.brp) ? (plan.brp as BrpGoal[]) : [];

  const skills: ReturnType<typeof payloadsFromTreatmentPlan>['skills'] = [];
  let skippedEmpty = 0;

  for (const g of skillRaw) {
    const title = str(g?.description).slice(0, 200);
    if (!title) {
      skippedEmpty += 1;
      continue;
    }
    skills.push({
      domain: str(g?.domain) || 'Unassigned',
      title,
      description:
        [str(g?.currentLevel) && `Current: ${str(g.currentLevel)}`, str(g?.targetDate) && `Target date: ${str(g.targetDate)}`]
          .filter(Boolean)
          .join(' · ') || null,
      measurementType: 'TRIAL',
      targetStatus: mapGoalStatus(g?.status),
      masteryCriteria: str(g?.mastery) || '80% over 3 sessions',
      baselineData: parseBaselineFloat(str(g?.baseline)),
    });
  }

  const behaviors: ReturnType<typeof payloadsFromTreatmentPlan>['behaviors'] = [];
  for (const b of brpRaw) {
    const behaviorName = str(b?.behavior).slice(0, 200);
    if (!behaviorName) {
      skippedEmpty += 1;
      continue;
    }
    const defParts = [
      str(b?.function) && `Function: ${str(b.function)}`,
      str(b?.mastery) && `Mastery: ${str(b.mastery)}`,
      str(b?.baseline) && `Baseline: ${str(b.baseline)}`,
      str(b?.risk) && `Risk: ${str(b.risk)}`,
    ].filter(Boolean);
    behaviors.push({
      behaviorName,
      definition: defParts.join(' · ') || `Behavior reduction target: ${behaviorName}`,
      measurementType: 'FREQUENCY',
    });
  }

  return { skills, behaviors, skippedEmpty };
}

/** CRM deep-link for Clinical Goals tab (sync CTA). */
export function crmClinicalGoalsUrl(clientId: string): string {
  const base = (process.env.NEXT_PUBLIC_CRM_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/client/${clientId}?tab=clinical_goals`;
}
