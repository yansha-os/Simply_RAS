/**
 * Parent treatment-plan typed-name e-sign helpers (schema-free).
 * Pure functions — safe to unit-test without Next/Prisma.
 */

export type ParentSignValidation =
  | {
      ok: true;
      signatureName: string;
      nameMatched: boolean;
      expectedGuardianName: string;
    }
  | { ok: false; error: string; code: 'EMPTY_NAME' | 'NO_GUARDIAN' | 'NOT_REVIEWED' };

export type ParentPlanGoalLine = {
  kind: 'skill' | 'caregiver' | 'behavior';
  label: string;
  detail: string | null;
};

export type ParentPlanReviewSummary = {
  hours97153: number;
  hours97155: number;
  hours97156: number;
  primaryLocations: string[];
  crisisPlan: string | null;
  goals: ParentPlanGoalLine[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeGuardianName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Prefer Client.guardianName; fall back to packet formData.g1Name. */
export function resolveExpectedGuardianName(opts: {
  guardianName?: string | null;
  formData?: unknown;
}): string | null {
  const fromClient = typeof opts.guardianName === 'string' ? opts.guardianName.trim() : '';
  if (fromClient) return fromClient;

  let form: unknown = opts.formData;
  if (typeof form === 'string') {
    try {
      form = JSON.parse(form);
    } catch {
      form = null;
    }
  }
  if (!isRecord(form)) return null;
  const g1 = form.g1Name;
  if (typeof g1 === 'string' && g1.trim()) return g1.trim();
  return null;
}

export function validateParentTreatmentPlanSign(input: {
  parentSignatureName: string;
  planReviewed: boolean;
  expectedGuardianName: string | null;
}): ParentSignValidation {
  if (!input.planReviewed) {
    return {
      ok: false,
      code: 'NOT_REVIEWED',
      error: 'Please review the treatment plan summary before signing.',
    };
  }

  const signatureName = input.parentSignatureName.trim();
  if (!signatureName) {
    return {
      ok: false,
      code: 'EMPTY_NAME',
      error: 'Type your full legal name to sign.',
    };
  }

  const expected = input.expectedGuardianName?.trim() || null;
  if (!expected) {
    return {
      ok: false,
      code: 'NO_GUARDIAN',
      error: 'Guardian name on file is missing. Please contact the clinic before signing.',
    };
  }

  return {
    ok: true,
    signatureName,
    expectedGuardianName: expected,
    nameMatched: normalizeGuardianName(signatureName) === normalizeGuardianName(expected),
  };
}

function rowLabel(row: Record<string, unknown>, primaryKeys: string[]): string {
  for (const key of primaryKeys) {
    const v = row[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return 'Goal';
}

function rowDetail(row: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = row[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/** Read-only parent review summary from existing treatmentPlan JSON — no invented content. */
export function buildParentPlanReviewSummary(treatmentPlan: unknown): ParentPlanReviewSummary {
  const plan = isRecord(treatmentPlan) ? treatmentPlan : {};
  const primaryLocations = Array.isArray(plan.primaryLocations)
    ? plan.primaryLocations.filter((l): l is string => typeof l === 'string' && l.trim().length > 0)
    : [];

  const goals: ParentPlanGoalLine[] = [];

  if (Array.isArray(plan.skillGoals)) {
    for (const raw of plan.skillGoals) {
      if (!isRecord(raw)) continue;
      goals.push({
        kind: 'skill',
        label: rowLabel(raw, ['domain', 'description']),
        detail: rowDetail(raw, ['description', 'mastery']),
      });
    }
  }

  if (Array.isArray(plan.parentGoals)) {
    for (const raw of plan.parentGoals) {
      if (!isRecord(raw)) continue;
      goals.push({
        kind: 'caregiver',
        label: rowLabel(raw, ['description']),
        detail: rowDetail(raw, ['mastery', 'baseline']),
      });
    }
  }

  if (Array.isArray(plan.brp)) {
    for (const raw of plan.brp) {
      if (!isRecord(raw)) continue;
      goals.push({
        kind: 'behavior',
        label: rowLabel(raw, ['behavior', 'description']),
        detail: rowDetail(raw, ['topography', 'function', 'ferb']),
      });
    }
  }

  const crisis =
    typeof plan.crisisPlan === 'string' && plan.crisisPlan.trim()
      ? plan.crisisPlan.trim()
      : null;

  return {
    hours97153: typeof plan.hours97153 === 'number' ? plan.hours97153 : Number(plan.hours97153) || 0,
    hours97155: typeof plan.hours97155 === 'number' ? plan.hours97155 : Number(plan.hours97155) || 0,
    hours97156: typeof plan.hours97156 === 'number' ? plan.hours97156 : Number(plan.hours97156) || 0,
    primaryLocations,
    crisisPlan: crisis,
    goals,
  };
}
