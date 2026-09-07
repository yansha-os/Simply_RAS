export type PayerRoundingRule =
  | 'CMS_8_MINUTE' // Commercial / standard midpoint (8-22m = 1, 23-37m = 2, ...)
  | 'MEDICAID_STRICT_15' // NY Medicaid strict (1-15m = 1, 16-30m = 2, ...)
  | 'EXACT_15_FLOOR'; // Exact completed 15m intervals (0-14m = 0, 15-29m = 1, ...)

export type CptCode =
  | '97151'
  | '97152'
  | '97153'
  | '97154'
  | '97155'
  | '97156'
  | '97157'
  | '97158'
  | string;

export const STANDARD_MUE_DAILY_LIMITS: Record<string, number> = {
  '97151': 32, // Assessment (8 hrs max per day)
  '97152': 16, // Tech assessment (4 hrs max per day)
  '97153': 32, // Direct RBT treatment (8 hrs max per day)
  '97154': 16, // Group tech treatment (4 hrs max per day)
  '97155': 8,  // BCBA protocol mod (2 hrs max per day standard)
  '97156': 8,  // Family guidance (2 hrs max per day standard)
  '97157': 8,  // Multi-family group (2 hrs max per day)
  '97158': 8,  // Group adaptive behavior treatment (2 hrs max per day)
};

/**
 * Calculates billable 15-minute units based on duration minutes and payer rounding model.
 */
export function calculateBillableUnits(
  durationMinutes: number,
  rule: PayerRoundingRule = 'CMS_8_MINUTE'
): number {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0 || isNaN(durationMinutes)) {
    return 0;
  }

  const mins = Math.round(durationMinutes);
  if (mins <= 0) return 0;

  switch (rule) {
    case 'CMS_8_MINUTE': {
      // CMS 8-Minute Midpoint Rule:
      // < 8 min = 0 units
      // 8 - 22 min = 1 unit
      // 23 - 37 min = 2 units
      // 38 - 52 min = 3 units
      // 53 - 67 min = 4 units
      // ...
      if (mins < 8) return 0;
      return Math.floor((mins + 7) / 15);
    }
    case 'MEDICAID_STRICT_15': {
      // Strict 15-minute ceiling
      return Math.ceil(mins / 15);
    }
    case 'EXACT_15_FLOOR': {
      // Completed 15m blocks only
      return Math.floor(mins / 15);
    }
    default:
      return Math.floor((mins + 7) / 15);
  }
}

/**
 * Validates daily units against Maximum Unlikely Edits (MUE) thresholds.
 */
export function validateMueDailyLimits(
  cptCode: CptCode,
  totalDailyUnits: number,
  customMueLimit?: number
): {
  isWithinLimit: boolean;
  maxUnits: number;
  exceededBy: number;
  warning: string | null;
} {
  const codeKey = (cptCode || '').replace(/[^0-9]/g, '');
  const units = Number.isFinite(totalDailyUnits) ? Math.max(0, Math.round(totalDailyUnits)) : 0;
  const standardLimit = STANDARD_MUE_DAILY_LIMITS[codeKey] ?? 32;
  const limit =
    typeof customMueLimit === 'number' && Number.isFinite(customMueLimit) && customMueLimit > 0
      ? customMueLimit
      : standardLimit;

  if (units <= limit) {
    return {
      isWithinLimit: true,
      maxUnits: limit,
      exceededBy: 0,
      warning: null,
    };
  }

  const exceededBy = units - limit;
  return {
    isWithinLimit: false,
    maxUnits: limit,
    exceededBy,
    warning: `Daily unit count (${units} units / ${(units * 15) / 60}h) exceeds MUE limit of ${limit} units for CPT ${cptCode}. Claim will likely be rejected or audited.`,
  };
}

export type PaBurnDownStatus =
  | 'HEALTHY'
  | 'REAUTH_DUE_DATE'
  | 'REAUTH_DUE_UNITS'
  | 'EXHAUSTED'
  | 'EXPIRED';

export type PaBurnDownAnalysis = {
  authorizedUnits: number;
  usedUnits: number;
  remainingUnits: number;
  percentUsed: number;
  projectedExhaustionDate: Date | null;
  daysUntilExpiration: number;
  isExpiringSoon: boolean; // within 30 days
  isNearingLimit: boolean; // >= 80% used
  status: PaBurnDownStatus;
  statusMessage: string;
};

/**
 * Calculates Prior Authorization (PA) burn-down projection and re-authorization alerts.
 */
export function analyzePriorAuthBurnDown(params: {
  authorizedUnits: number;
  usedUnits: number;
  weeklyScheduledUnits: number;
  authEndDate: Date | string;
  asOfDate?: Date;
}): PaBurnDownAnalysis {
  const authorizedUnits = Number.isFinite(params.authorizedUnits) ? Math.max(0, params.authorizedUnits) : 0;
  const usedUnits = Number.isFinite(params.usedUnits) ? Math.max(0, params.usedUnits) : 0;
  const weeklyScheduledUnits = Number.isFinite(params.weeklyScheduledUnits)
    ? Math.max(0, params.weeklyScheduledUnits)
    : 0;

  const asOf =
    params.asOfDate instanceof Date && !isNaN(params.asOfDate.getTime())
      ? params.asOfDate
      : new Date();

  const rawEndDate =
    params.authEndDate instanceof Date
      ? params.authEndDate
      : new Date(params.authEndDate || '');
  const isValidEndDate = !isNaN(rawEndDate.getTime());
  const endDate = isValidEndDate ? rawEndDate : asOf;

  const remainingUnits = Math.max(0, authorizedUnits - usedUnits);
  const percentUsed =
    authorizedUnits > 0 ? Number(((usedUnits / authorizedUnits) * 100).toFixed(1)) : 0;

  const msPerDay = 1000 * 60 * 60 * 24;
  const daysUntilExpiration = isValidEndDate
    ? Math.ceil((endDate.getTime() - asOf.getTime()) / msPerDay)
    : 0;

  let projectedExhaustionDate: Date | null = null;
  if (weeklyScheduledUnits > 0 && remainingUnits > 0) {
    const dailyUnitBurnRate = weeklyScheduledUnits / 7;
    const daysOfUnitsLeft = Math.floor(remainingUnits / dailyUnitBurnRate);
    projectedExhaustionDate = new Date(asOf.getTime() + daysOfUnitsLeft * msPerDay);
  }

  const isExpired = !isValidEndDate || daysUntilExpiration <= 0;
  const isExhausted = remainingUnits === 0 && authorizedUnits > 0;
  const isExpiringSoon = daysUntilExpiration > 0 && daysUntilExpiration <= 30;
  const isNearingLimit = percentUsed >= 80.0 && !isExhausted;

  let status: PaBurnDownStatus = 'HEALTHY';
  let statusMessage = 'Authorization is active and on track.';

  if (isExpired) {
    status = 'EXPIRED';
    statusMessage = 'Authorization has expired. Treatment cannot continue without active PA.';
  } else if (isExhausted) {
    status = 'EXHAUSTED';
    statusMessage = 'All authorized units have been utilized. Re-authorization required immediately.';
  } else if (isExpiringSoon) {
    status = 'REAUTH_DUE_DATE';
    statusMessage = `Authorization expires in ${daysUntilExpiration} days. Submit re-auth packet now.`;
  } else if (isNearingLimit) {
    status = 'REAUTH_DUE_UNITS';
    statusMessage = `${percentUsed}% of authorized units used (${remainingUnits} units remaining). Initiate re-auth.`;
  }

  return {
    authorizedUnits,
    usedUnits,
    remainingUnits,
    percentUsed,
    projectedExhaustionDate,
    daysUntilExpiration,
    isExpiringSoon,
    isNearingLimit,
    status,
    statusMessage,
  };
}
