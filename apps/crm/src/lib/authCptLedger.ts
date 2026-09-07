/**
 * Multi-Payer Prior Authorization & Auth CPT Code Ledger Engine
 *
 * Provides real-time CPT unit burndown tracking (authorized vs scheduled vs rendered vs converted),
 * weekly burn rate forecasting, utilization health classification, and automated re-auth triggers.
 */

export interface AuthCptLedgerLine {
  cptCode: string;
  serviceDescription: string;
  authorizedUnits: number;
  scheduledUnits: number;
  renderedUnits: number;
  convertedUnits: number;
  remainingUnits: number;
  utilizationRate: number; // 0.0 to 1.0+
  weeklyBurnRateUnits: number;
  projectedExhaustionDate: string | null; // ISO date string or null if not exhausting
  projectedTotalUnitsAtEnd: number;
  utilizationHealth: 'HEALTHY' | 'UNDERUTILIZED' | 'CRITICAL_BURN' | 'EXHAUSTED';
}

export type AuthLedgerAlertKind =
  | 'RE_AUTH_TRIGGER_60_DAYS'
  | 'RE_AUTH_T45_WINDOW'
  | 'EXPIRING_URGENT_30_DAYS'
  | 'HIGH_UTILIZATION_80_PCT'
  | 'EXHAUSTION_HARD_STOP'
  | 'UNDERUTILIZATION_RISK';

export interface AuthLedgerAlert {
  kind: AuthLedgerAlertKind;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  cptCode?: string;
  message: string;
  actionRecommendation: string;
}

export interface AuthCptLedgerSummary {
  authorizationId: string;
  authNumber: string | null;
  authType: string;
  startDate: string | null;
  endDate: string | null;
  daysRemaining: number | null;
  totalAuthorizedUnits: number;
  totalRenderedUnits: number;
  totalRemainingUnits: number;
  overallUtilizationRate: number;
  cptLines: AuthCptLedgerLine[];
  alerts: AuthLedgerAlert[];
  reAuthRecommended: boolean;
}

export interface RawAuthInput {
  id: string;
  type?: string;
  status?: string;
  authNumber?: string | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  unitsApproved?: number | null;
  cptCodes?: Array<{
    code: string;
    unitsApproved?: number | null;
  }>;
}

export interface RawSessionInput {
  id: string;
  cptCode?: string | null;
  status: string; // 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW'
  scheduledStart: Date | string;
  scheduledEnd: Date | string;
  actualStart?: Date | string | null;
  actualEnd?: Date | string | null;
  note?: {
    billableUnits?: number | null;
    rbtSigned?: boolean;
    bcbaSigned?: boolean;
    isConverted?: boolean;
  } | null;
}

const CPT_DESCRIPTIONS: Record<string, string> = {
  '97151': 'Behavior Identification Assessment / Re-assessment (BCBA)',
  '97152': 'Behavior Identification Supporting Assessment (RBT)',
  '97153': 'Adaptive Behavior Treatment by Protocol (Direct RBT 1:1)',
  '97154': 'Group Adaptive Behavior Treatment by Protocol',
  '97155': 'Adaptive Behavior Treatment with Protocol Modification (BCBA Supervision)',
  '97156': 'Family Adaptive Behavior Guidance / Caregiver Training (BCBA)',
  '97157': 'Multiple-Family Group Adaptive Behavior Guidance',
  '97158': 'Group Adaptive Behavior Treatment with Protocol Modification',
  '0373T': 'Adaptive Behavior Treatment with Protocol Mod (High Intensity)',
};

/**
 * Normalizes CPT strings (e.g. ' 97153 ' -> '97153')
 */
export function normalizeCptCode(code: string | null | undefined): string {
  if (!code || typeof code !== 'string') return '';
  return code.trim().toUpperCase();
}

/**
 * Computes estimated 15-min units from timestamps if billableUnits is not present
 */
function estimateUnitsFromDates(start: Date | string, end: Date | string): number {
  try {
    const s = typeof start === 'string' ? new Date(start).getTime() : start.getTime();
    const e = typeof end === 'string' ? new Date(end).getTime() : end.getTime();
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return 0;
    const durationMinutes = (e - s) / 60000;
    return Math.floor(durationMinutes / 15);
  } catch {
    return 0;
  }
}

/**
 * Builds the comprehensive CPT ledger and burndown analytics for an authorization
 */
export function computeAuthCptLedger(
  auth: RawAuthInput,
  sessions: RawSessionInput[],
  asOfDate: Date = new Date()
): AuthCptLedgerSummary {
  const authId = auth?.id || 'unknown-auth';
  const authNumber = auth?.authNumber || null;
  const authType = auth?.type || 'TREATMENT';

  const startDateStr = auth?.startDate
    ? typeof auth.startDate === 'string'
      ? auth.startDate
      : auth.startDate.toISOString()
    : null;

  const endDateStr = auth?.endDate
    ? typeof auth.endDate === 'string'
      ? auth.endDate
      : auth.endDate.toISOString()
    : null;

  const startMs = startDateStr ? new Date(startDateStr).getTime() : null;
  const endMs = endDateStr ? new Date(endDateStr).getTime() : null;
  const asOfMs = asOfDate.getTime();

  let daysRemaining: number | null = null;
  if (endMs && Number.isFinite(endMs)) {
    daysRemaining = Math.max(0, Math.ceil((endMs - asOfMs) / (1000 * 60 * 60 * 24)));
  }

  // Group approved units by CPT
  const cptApprovedMap = new Map<string, number>();
  const rawCptCodes = Array.isArray(auth?.cptCodes) ? auth.cptCodes : [];

  if (rawCptCodes.length > 0) {
    for (const line of rawCptCodes) {
      const code = normalizeCptCode(line.code);
      if (!code) continue;
      const units = typeof line.unitsApproved === 'number' && Number.isFinite(line.unitsApproved)
        ? Math.max(0, Math.floor(line.unitsApproved))
        : 0;
      cptApprovedMap.set(code, (cptApprovedMap.get(code) || 0) + units);
    }
  } else if (typeof auth?.unitsApproved === 'number' && Number.isFinite(auth.unitsApproved)) {
    // Aggregate authorization units have no defensible CPT attribution.
    cptApprovedMap.set('UNATTRIBUTED', Math.max(0, Math.floor(auth.unitsApproved)));
  }

  // Preserve an honest empty ledger without inventing a CPT code.
  if (cptApprovedMap.size === 0) {
    cptApprovedMap.set('UNATTRIBUTED', 0);
  }

  // Filter sessions within authorization date window
  const inWindowSessions = sessions.filter((s) => {
    if (!s.scheduledStart) return false;
    const sessionMs = typeof s.scheduledStart === 'string'
      ? new Date(s.scheduledStart).getTime()
      : s.scheduledStart.getTime();

    if (!Number.isFinite(sessionMs)) return false;
    if (startMs && sessionMs < startMs) return false;
    if (endMs && sessionMs > endMs + 86400000) return false; // allow through end of end day
    return true;
  });

  // Calculate total elapsed weeks in auth for burn rate
  let elapsedWeeks = 1;
  if (startMs && Number.isFinite(startMs) && asOfMs > startMs) {
    const elapsedDays = Math.max(1, (asOfMs - startMs) / (1000 * 60 * 60 * 24));
    elapsedWeeks = Math.max(1, elapsedDays / 7);
  }

  let totalWeeksInAuth = 0;
  if (startMs && endMs && endMs > startMs) {
    totalWeeksInAuth = Math.max(1, (endMs - startMs) / (1000 * 60 * 60 * 24 * 7));
  }

  const cptLines: AuthCptLedgerLine[] = [];
  const alerts: AuthLedgerAlert[] = [];

  let totalAuth = 0;
  let totalRendered = 0;
  let totalRemaining = 0;

  for (const [code, authorizedUnits] of cptApprovedMap.entries()) {
    totalAuth += authorizedUnits;

    // Filter sessions matching this CPT code
    const matchingSessions = inWindowSessions.filter((s) => {
      const sessionCpt = normalizeCptCode(s.cptCode);
      return sessionCpt === code;
    });

    let scheduledUnits = 0;
    let renderedUnits = 0;
    let convertedUnits = 0;

    for (const session of matchingSessions) {
      const isCancelled = session.status === 'CANCELLED' || session.status === 'NO_SHOW';
      if (isCancelled) continue;

      if (session.status === 'SCHEDULED' || session.status === 'IN_PROGRESS') {
        scheduledUnits += estimateUnitsFromDates(session.scheduledStart, session.scheduledEnd);
      } else if (session.status === 'COMPLETED') {
        const durableUnits =
          session.note?.rbtSigned === true &&
          session.note.bcbaSigned === true &&
          typeof session.note.billableUnits === 'number' &&
          Number.isInteger(session.note.billableUnits) &&
          session.note.billableUnits >= 0
            ? session.note.billableUnits
            : 0;
        renderedUnits += durableUnits;
        if (session.note?.isConverted === true) {
          convertedUnits += durableUnits;
        }
      }
    }

    totalRendered += renderedUnits;

    const remainingUnits = Math.max(0, authorizedUnits - renderedUnits);
    totalRemaining += remainingUnits;

    const utilizationRate = authorizedUnits > 0
      ? Math.round((renderedUnits / authorizedUnits) * 1000) / 1000
      : renderedUnits > 0 ? 1.0 : 0.0;

    const weeklyBurnRate = Math.round((renderedUnits / elapsedWeeks) * 10) / 10;

    let projectedExhaustionDate: string | null = null;
    if (weeklyBurnRate > 0 && remainingUnits > 0 && asOfMs) {
      const weeksUntilExhaustion = remainingUnits / weeklyBurnRate;
      const exhaustionMs = asOfMs + weeksUntilExhaustion * 7 * 24 * 60 * 60 * 1000;
      projectedExhaustionDate = new Date(exhaustionMs).toISOString().split('T')[0];
    }

    const projectedTotalUnitsAtEnd = Math.round(weeklyBurnRate * totalWeeksInAuth);

    let utilizationHealth: AuthCptLedgerLine['utilizationHealth'] = 'HEALTHY';
    if (authorizedUnits > 0 && renderedUnits >= authorizedUnits) {
      utilizationHealth = 'EXHAUSTED';
    } else if (utilizationRate >= 0.85) {
      utilizationHealth = 'CRITICAL_BURN';
    } else if (elapsedWeeks >= 4 && utilizationRate < 0.5 && authorizedUnits > 0) {
      utilizationHealth = 'UNDERUTILIZED';
    }

    cptLines.push({
      cptCode: code,
      serviceDescription:
        code === 'UNATTRIBUTED'
          ? 'Aggregate authorized units — CPT attribution unavailable'
          : CPT_DESCRIPTIONS[code] || `CPT ${code} ABA Service`,
      authorizedUnits,
      scheduledUnits,
      renderedUnits,
      convertedUnits,
      remainingUnits,
      utilizationRate,
      weeklyBurnRateUnits: weeklyBurnRate,
      projectedExhaustionDate,
      projectedTotalUnitsAtEnd,
      utilizationHealth,
    });

    // Generate CPT-specific alerts
    if (authorizedUnits > 0 && remainingUnits === 0) {
      alerts.push({
        kind: 'EXHAUSTION_HARD_STOP',
        severity: 'CRITICAL',
        cptCode: code,
        message: `CPT ${code} authorized units are 100% exhausted (${renderedUnits}/${authorizedUnits} units).`,
        actionRecommendation: 'Hold further scheduling for this code or submit an immediate mid-cycle re-authorization request.',
      });
    } else if (authorizedUnits > 0 && utilizationRate >= 0.8) {
      alerts.push({
        kind: 'HIGH_UTILIZATION_80_PCT',
        severity: 'WARNING',
        cptCode: code,
        message: `CPT ${code} has reached ${Math.round(utilizationRate * 100)}% utilization (${remainingUnits} units remaining).`,
        actionRecommendation: 'Begin preparing clinical assessment and re-authorization documentation.',
      });
    }
  }

  // Generate Date-based alerts
  let reAuthRecommended = false;

  if (daysRemaining !== null) {
    if (daysRemaining <= 30 && daysRemaining > 0) {
      reAuthRecommended = true;
      alerts.push({
        kind: 'EXPIRING_URGENT_30_DAYS',
        severity: 'CRITICAL',
        message: `Authorization expires in ${daysRemaining} days (${endDateStr?.split('T')[0]}).`,
        actionRecommendation: 'Immediate submission of Re-Authorization Packet required to avoid service disruption.',
      });
    } else if (daysRemaining <= 45 && daysRemaining > 30) {
      reAuthRecommended = true;
      alerts.push({
        kind: 'RE_AUTH_T45_WINDOW',
        severity: 'WARNING',
        message: `Authorization enters T-45 re-auth window (${daysRemaining} days remaining until ${endDateStr?.split('T')[0]}).`,
        actionRecommendation: 'Open Re-Auth Compiler on the client Billing tab; assemble BCBA packet from live trial progress.',
      });
    } else if (daysRemaining <= 60 && daysRemaining > 45) {
      reAuthRecommended = true;
      alerts.push({
        kind: 'RE_AUTH_TRIGGER_60_DAYS',
        severity: 'INFO',
        message: `Authorization renewal horizon in ${daysRemaining} days.`,
        actionRecommendation: 'Schedule 97151 re-assessment and begin Re-Auth Compiler prep.',
      });
    }
  }

  const overallUtilizationRate = totalAuth > 0
    ? Math.round((totalRendered / totalAuth) * 1000) / 1000
    : 0;

  if (overallUtilizationRate >= 0.75) {
    reAuthRecommended = true;
  }

  return {
    authorizationId: authId,
    authNumber,
    authType,
    startDate: startDateStr,
    endDate: endDateStr,
    daysRemaining,
    totalAuthorizedUnits: totalAuth,
    totalRenderedUnits: totalRendered,
    totalRemainingUnits: totalRemaining,
    overallUtilizationRate,
    cptLines,
    alerts,
    reAuthRecommended,
  };
}
