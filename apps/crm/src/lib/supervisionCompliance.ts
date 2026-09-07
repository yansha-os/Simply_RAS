import { prisma } from '@/lib/prisma';

/** Heuristic target for 97155 vs 97153 minute ratio review — not a BACB/Medicaid certification. */
export const SUPERVISION_RATIO_HEURISTIC_PERCENT = 5.0;
/** @deprecated Use SUPERVISION_RATIO_HEURISTIC_PERCENT — kept for test alias stability */
export const BACB_MINIMUM_SUPERVISION_PERCENT = SUPERVISION_RATIO_HEURISTIC_PERCENT;
export const SUPERVISION_WARNING_THRESHOLD = 7.0; // Under 7% gets a soft warning for caseload review

export type SupervisionComplianceStatus = 'COMPLIANT' | 'WARNING' | 'CRITICAL' | 'NO_DIRECT_HOURS';

export type MonthlySupervisionSummary = {
  year: number;
  month: number; // 1-12
  monthLabel: string;
  directMinutes97153: number;
  directHours: number;
  supervisionMinutes97155: number;
  supervisionHours: number;
  supervisionRatio: number | null; // e.g. 6.25%
  isCompliant: boolean;
  status: SupervisionComplianceStatus;
  hoursNeededForCompliance: number;
  daysRemainingInMonth: number;
  rbtCount: number;
  clientCount: number;
};

export type RbtSupervisionRow = {
  rbtId: string;
  rbtName: string;
  directHours: number;
  supervisionHours: number;
  ratio: number | null;
  status: SupervisionComplianceStatus;
  hoursNeeded: number;
  assignedClientsCount: number;
  supervisingBcbaNames: string[];
};

export type ClientSupervisionRow = {
  clientId: string;
  clientName: string;
  directHours: number;
  supervisionHours: number;
  ratio: number | null;
  status: SupervisionComplianceStatus;
  hoursNeeded: number;
  bcbaName: string | null;
  rbtName: string | null;
};

/**
 * Pure helper to compute days remaining in a given month.
 */
export function getDaysRemainingInMonth(year: number, month: number, asOfDate: Date = new Date()): number {
  const safeYear = Number.isInteger(year) && year >= 1970 && year <= 2100 ? year : new Date().getFullYear();
  const safeMonth = Number.isInteger(month) && month >= 1 && month <= 12 ? month : new Date().getMonth() + 1;
  const safeAsOf = asOfDate instanceof Date && !isNaN(asOfDate.getTime()) ? asOfDate : new Date();

  const lastDayOfMonth = new Date(safeYear, safeMonth, 0).getDate();
  const currentDay =
    safeAsOf.getMonth() + 1 === safeMonth && safeAsOf.getFullYear() === safeYear
      ? safeAsOf.getDate()
      : 0;
  return Math.max(0, lastDayOfMonth - currentDay);
}

/**
 * Pure helper to evaluate supervision compliance numbers.
 */
export function evaluateSupervisionRatio(
  directMinutes: number,
  supervisionMinutes: number
): {
  ratio: number | null;
  isCompliant: boolean;
  status: SupervisionComplianceStatus;
  hoursNeeded: number;
} {
  const safeDirect = Number.isFinite(directMinutes) ? Math.max(0, directMinutes) : 0;
  const safeSupervision = Number.isFinite(supervisionMinutes) ? Math.max(0, supervisionMinutes) : 0;

  if (safeDirect <= 0) {
    if (safeSupervision > 0) {
      return {
        ratio: 100.0,
        isCompliant: true,
        status: 'COMPLIANT',
        hoursNeeded: 0,
      };
    }
    return {
      ratio: null,
      isCompliant: true,
      status: 'NO_DIRECT_HOURS',
      hoursNeeded: 0,
    };
  }

  const ratio = Number(((safeSupervision / safeDirect) * 100).toFixed(2));
  const isCompliant = ratio >= SUPERVISION_RATIO_HEURISTIC_PERCENT;

  let status: SupervisionComplianceStatus = 'COMPLIANT';
  if (ratio < SUPERVISION_RATIO_HEURISTIC_PERCENT) {
    status = 'CRITICAL';
  } else if (ratio < SUPERVISION_WARNING_THRESHOLD) {
    status = 'WARNING';
  }

  // Minutes needed to reach the utilization heuristic target (not a certification quota)
  const targetSupervisionMinutes = (safeDirect * SUPERVISION_RATIO_HEURISTIC_PERCENT) / 100;
  const deficitMinutes = Math.max(0, targetSupervisionMinutes - safeSupervision);
  const hoursNeeded = Number((deficitMinutes / 60).toFixed(2));

  return {
    ratio,
    isCompliant,
    status,
    hoursNeeded,
  };
}

/**
 * Loads monthly supervision scorecard for a given month and year.
 */
export async function getAgencySupervisionScorecard(
  year: number,
  month: number // 1-12
): Promise<MonthlySupervisionSummary & { rbtRows: RbtSupervisionRow[]; clientRows: ClientSupervisionRow[] }> {
  const safeYear = Number.isInteger(year) && year >= 1970 && year <= 2100 ? year : new Date().getFullYear();
  const safeMonth = Number.isInteger(month) && month >= 1 && month <= 12 ? month : new Date().getMonth() + 1;

  const startDate = new Date(safeYear, safeMonth - 1, 1);
  const endDate = new Date(safeYear, safeMonth, 0, 23, 59, 59, 999);

  const monthLabel = startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const daysRemainingInMonth = getDaysRemainingInMonth(safeYear, safeMonth);

  // Fetch all completed or scheduled sessions in the month
  const sessions = await prisma.session.findMany({
    where: {
      scheduledStart: {
        gte: startDate,
        lte: endDate,
      },
      status: { notIn: ['CANCELLED', 'NO_SHOW'] },
    },
    include: {
      client: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          bcba: { select: { firstName: true, lastName: true } },
          rbt: { select: { firstName: true, lastName: true } },
        },
      },
      rbt: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      bcba: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  let totalDirectMinutes = 0;
  let totalSupervisionMinutes = 0;

  const rbtMap = new Map<
    string,
    {
      rbtId: string;
      rbtName: string;
      directMinutes: number;
      supervisionMinutes: number;
      clients: Set<string>;
      bcbas: Set<string>;
    }
  >();

  const clientMap = new Map<
    string,
    {
      clientId: string;
      clientName: string;
      directMinutes: number;
      supervisionMinutes: number;
      bcbaName: string | null;
      rbtName: string | null;
    }
  >();

  for (const s of sessions) {
    const start = s.actualStart || s.scheduledStart;
    const end = s.actualEnd || s.scheduledEnd;
    const startTime = start instanceof Date && !isNaN(start.getTime()) ? start.getTime() : 0;
    const endTime = end instanceof Date && !isNaN(end.getTime()) ? end.getTime() : 0;
    const durationMinutes =
      startTime > 0 && endTime > startTime
        ? Math.max(0, Math.round((endTime - startTime) / (1000 * 60)))
        : 0;

    const is97153 = s.cptCode?.includes('97153') || s.cptCode === '97153';
    const is97155 = s.cptCode?.includes('97155') || s.cptCode === '97155';

    if (is97153) {
      totalDirectMinutes += durationMinutes;
    } else if (is97155) {
      totalSupervisionMinutes += durationMinutes;
    }

    // Accumulate for RBT
    if (s.rbtId && s.rbt) {
      const rbtKey = s.rbtId;
      if (!rbtMap.has(rbtKey)) {
        rbtMap.set(rbtKey, {
          rbtId: s.rbtId,
          rbtName: `${s.rbt.firstName} ${s.rbt.lastName}`.trim(),
          directMinutes: 0,
          supervisionMinutes: 0,
          clients: new Set(),
          bcbas: new Set(),
        });
      }
      const rbtEntry = rbtMap.get(rbtKey)!;
      if (is97153) rbtEntry.directMinutes += durationMinutes;
      if (is97155) rbtEntry.supervisionMinutes += durationMinutes;
      if (s.clientId) rbtEntry.clients.add(s.clientId);
      if (s.bcba) rbtEntry.bcbas.add(`${s.bcba.firstName} ${s.bcba.lastName}`.trim());
    }

    // Accumulate for Client
    if (s.clientId && s.client) {
      const clientKey = s.clientId;
      if (!clientMap.has(clientKey)) {
        clientMap.set(clientKey, {
          clientId: s.clientId,
          clientName: `${s.client.firstName} ${s.client.lastName}`.trim(),
          directMinutes: 0,
          supervisionMinutes: 0,
          bcbaName: s.client.bcba ? `${s.client.bcba.firstName} ${s.client.bcba.lastName}`.trim() : null,
          rbtName: s.client.rbt ? `${s.client.rbt.firstName} ${s.client.rbt.lastName}`.trim() : null,
        });
      }
      const clientEntry = clientMap.get(clientKey)!;
      if (is97153) clientEntry.directMinutes += durationMinutes;
      if (is97155) clientEntry.supervisionMinutes += durationMinutes;
    }
  }

  const overallEval = evaluateSupervisionRatio(totalDirectMinutes, totalSupervisionMinutes);

  const rbtRows: RbtSupervisionRow[] = Array.from(rbtMap.values()).map((rbt) => {
    const evaluation = evaluateSupervisionRatio(rbt.directMinutes, rbt.supervisionMinutes);
    return {
      rbtId: rbt.rbtId,
      rbtName: rbt.rbtName,
      directHours: Number((rbt.directMinutes / 60).toFixed(1)),
      supervisionHours: Number((rbt.supervisionMinutes / 60).toFixed(1)),
      ratio: evaluation.ratio,
      status: evaluation.status,
      hoursNeeded: evaluation.hoursNeeded,
      assignedClientsCount: rbt.clients.size,
      supervisingBcbaNames: Array.from(rbt.bcbas),
    };
  }).sort((a, b) => (a.ratio ?? 999) - (b.ratio ?? 999)); // sort lowest compliance first

  const clientRows: ClientSupervisionRow[] = Array.from(clientMap.values()).map((client) => {
    const evaluation = evaluateSupervisionRatio(client.directMinutes, client.supervisionMinutes);
    return {
      clientId: client.clientId,
      clientName: client.clientName,
      directHours: Number((client.directMinutes / 60).toFixed(1)),
      supervisionHours: Number((client.supervisionMinutes / 60).toFixed(1)),
      ratio: evaluation.ratio,
      status: evaluation.status,
      hoursNeeded: evaluation.hoursNeeded,
      bcbaName: client.bcbaName,
      rbtName: client.rbtName,
    };
  }).sort((a, b) => (a.ratio ?? 999) - (b.ratio ?? 999));

  return {
    year,
    month,
    monthLabel,
    directMinutes97153: totalDirectMinutes,
    directHours: Number((totalDirectMinutes / 60).toFixed(1)),
    supervisionMinutes97155: totalSupervisionMinutes,
    supervisionHours: Number((totalSupervisionMinutes / 60).toFixed(1)),
    supervisionRatio: overallEval.ratio,
    isCompliant: overallEval.isCompliant,
    status: overallEval.status,
    hoursNeededForCompliance: overallEval.hoursNeeded,
    daysRemainingInMonth,
    rbtCount: rbtRows.length,
    clientCount: clientRows.length,
    rbtRows,
    clientRows,
  };
}
