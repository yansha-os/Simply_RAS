import {
  CLINIC_TIME_ZONE,
  addClinicDays,
  clinicDateKey,
  clinicWallTimeToDate,
} from '@/lib/clinicTimezone';
import {
  derivePayHoldFromFlags,
  estimateUnitsFromWindow,
  resolvePayrollUnits,
} from '@/lib/rbtPayHolds';

export const DEFAULT_FINANCE_PAYROLL_RATE = 28;
export const MAX_FINANCE_PAYROLL_RANGE_DAYS = 31;
export const DEFAULT_FINANCE_PAYROLL_RANGE_DAYS = 14;

export type FinancePayrollRangeInput = {
  from?: string;
  to?: string;
};

export type FinancePayrollRange = {
  from: string;
  to: string;
  dayCount: number;
  timeZone: typeof CLINIC_TIME_ZONE;
  start: Date;
  end: Date;
};

export type FinancePayrollSessionInput = {
  sessionId: string;
  rbtId: string;
  rbtName: string;
  sessionStatus: string;
  startMs: number;
  endMs: number;
  noteUnits: number | null;
  hasNote: boolean;
  parentSigned: boolean;
  parentSignedAt: Date | string | null;
  parentSignerName: string | null;
  rbtSigned: boolean;
  rbtSignedAt: Date | string | null;
  rbtSignerName: string | null;
  bcbaSigned: boolean;
  bcbaSignedAt: Date | string | null;
  bcbaSignerName: string | null;
  isConverted: boolean;
  checklistSnapshot: unknown;
  openDeficiencyCount: number;
  submissionFingerprint: string | null;
};

export type FinancePayrollRate = {
  hourlyRate: number;
  source: 'SIGNED_LS54' | 'DEFAULT_ESTIMATE';
};

export type FinancePayrollStaffRow = {
  rbtId: string;
  rbtName: string;
  hourlyRate: number;
  rateSource: FinancePayrollRate['source'];
  sessionCount: number;
  noteUnits: number;
  estimatedUnits: number;
  totalUnits: number;
  grossEstimate: number;
  payableSessionCount: number;
  payableUnits: number;
  payableEstimate: number;
  heldSessionCount: number;
  heldUnits: number;
  heldEstimate: number;
};

export type FinancePayrollHold = {
  reason: string;
  sessionCount: number;
  units: number;
  amountEstimate: number;
};

export type FinancePayrollTotals = {
  staffCount: number;
  sessionCount: number;
  noteUnitSessionCount: number;
  estimatedUnitSessionCount: number;
  noteUnits: number;
  estimatedUnits: number;
  totalUnits: number;
  grossEstimate: number;
  payableSessionCount: number;
  payableUnits: number;
  payableEstimate: number;
  heldSessionCount: number;
  heldUnits: number;
  heldEstimate: number;
  defaultRateStaffCount: number;
};

export type FinancePayrollRollup = {
  totals: FinancePayrollTotals;
  staff: FinancePayrollStaffRow[];
  holds: FinancePayrollHold[];
};

export type FinancePayrollReport = FinancePayrollRollup & {
  range: Omit<FinancePayrollRange, 'start' | 'end'>;
  generatedAt: string;
};

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDateKey(value: string): {
  year: number;
  month: number;
  day: number;
  epochDay: number;
} | null {
  const match = DATE_KEY_RE.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    return null;
  }

  return {
    year,
    month,
    day,
    epochDay: Math.floor(utcDate.getTime() / 86_400_000),
  };
}

export function normalizeFinancePayrollRange(
  input: FinancePayrollRangeInput,
  now = new Date(),
):
  | { ok: true; range: FinancePayrollRange }
  | { ok: false; error: string } {
  const hasFrom = Boolean(input.from);
  const hasTo = Boolean(input.to);
  if (hasFrom !== hasTo) {
    return { ok: false, error: 'Choose both a start date and an end date.' };
  }

  const to = input.to || clinicDateKey(now);
  const from =
    input.from ||
    clinicDateKey(addClinicDays(now, -(DEFAULT_FINANCE_PAYROLL_RANGE_DAYS - 1)));
  const parsedFrom = parseDateKey(from);
  const parsedTo = parseDateKey(to);
  if (!parsedFrom || !parsedTo) {
    return { ok: false, error: 'Use valid dates in YYYY-MM-DD format.' };
  }

  const dayCount = parsedTo.epochDay - parsedFrom.epochDay + 1;
  if (dayCount < 1) {
    return { ok: false, error: 'The end date must be on or after the start date.' };
  }
  if (dayCount > MAX_FINANCE_PAYROLL_RANGE_DAYS) {
    return {
      ok: false,
      error: `Payroll reports are limited to ${MAX_FINANCE_PAYROLL_RANGE_DAYS} days.`,
    };
  }

  return {
    ok: true,
    range: {
      from,
      to,
      dayCount,
      timeZone: CLINIC_TIME_ZONE,
      start: clinicWallTimeToDate(
        parsedFrom.year,
        parsedFrom.month,
        parsedFrom.day,
      ),
      end: clinicWallTimeToDate(
        parsedTo.year,
        parsedTo.month,
        parsedTo.day,
        23,
        59,
        59,
        999,
      ),
    },
  };
}

export function readSignedLs54Rate(
  status: string | null | undefined,
  payload: unknown,
): number | null {
  if (status !== 'SIGNED' || !payload || typeof payload !== 'object') return null;
  const rateOfPay = (payload as { rateOfPay?: unknown }).rateOfPay;
  if (
    typeof rateOfPay !== 'number' ||
    !Number.isFinite(rateOfPay) ||
    rateOfPay <= 0
  ) {
    return null;
  }
  return Math.round(rateOfPay * 100) / 100;
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function emptyStaffRow(
  input: FinancePayrollSessionInput,
  rate: FinancePayrollRate,
): FinancePayrollStaffRow {
  return {
    rbtId: input.rbtId,
    rbtName: input.rbtName,
    hourlyRate: rate.hourlyRate,
    rateSource: rate.source,
    sessionCount: 0,
    noteUnits: 0,
    estimatedUnits: 0,
    totalUnits: 0,
    grossEstimate: 0,
    payableSessionCount: 0,
    payableUnits: 0,
    payableEstimate: 0,
    heldSessionCount: 0,
    heldUnits: 0,
    heldEstimate: 0,
  };
}

function resolvedRate(rate: FinancePayrollRate | undefined): FinancePayrollRate {
  if (
    rate &&
    Number.isFinite(rate.hourlyRate) &&
    rate.hourlyRate > 0 &&
    rate.source === 'SIGNED_LS54'
  ) {
    return {
      hourlyRate: roundCurrency(rate.hourlyRate),
      source: 'SIGNED_LS54',
    };
  }
  return {
    hourlyRate: DEFAULT_FINANCE_PAYROLL_RATE,
    source: 'DEFAULT_ESTIMATE',
  };
}

export function buildFinancePayrollRollup(
  sessions: FinancePayrollSessionInput[],
  ratesByRbt: Record<string, FinancePayrollRate>,
): FinancePayrollRollup {
  const staffById = new Map<string, FinancePayrollStaffRow>();
  const holdsByReason = new Map<string, FinancePayrollHold>();
  let noteUnitSessionCount = 0;
  let estimatedUnitSessionCount = 0;

  for (const input of sessions) {
    const rate = resolvedRate(ratesByRbt[input.rbtId]);
    const staff =
      staffById.get(input.rbtId) || emptyStaffRow(input, rate);
    staffById.set(input.rbtId, staff);

    const fallbackUnits = estimateUnitsFromWindow(input.startMs, input.endMs);
    const unitResult = resolvePayrollUnits(input.noteUnits, fallbackUnits);
    const amountEstimate = roundCurrency(
      unitResult.units * (staff.hourlyRate / 4),
    );
    const payGate = derivePayHoldFromFlags({
      hasNote: input.hasNote,
      sessionStatus: input.sessionStatus,
      parentSigned: input.parentSigned,
      parentSignedAt: input.parentSignedAt,
      parentSignerName: input.parentSignerName,
      rbtSigned: input.rbtSigned,
      rbtSignedAt: input.rbtSignedAt,
      rbtSignerName: input.rbtSignerName,
      bcbaSigned: input.bcbaSigned,
      bcbaSignedAt: input.bcbaSignedAt,
      bcbaSignerName: input.bcbaSignerName,
      isConverted: input.isConverted,
      checklistSnapshot: input.checklistSnapshot,
      openDeficiencyCount: input.openDeficiencyCount,
      billableUnits: input.noteUnits,
      submissionFingerprint: input.submissionFingerprint,
    });

    staff.sessionCount += 1;
    staff.totalUnits += unitResult.units;
    staff.grossEstimate = roundCurrency(
      staff.grossEstimate + amountEstimate,
    );
    if (unitResult.source === 'NOTE') {
      staff.noteUnits += unitResult.units;
      noteUnitSessionCount += 1;
    } else {
      staff.estimatedUnits += unitResult.units;
      estimatedUnitSessionCount += 1;
    }

    if (payGate.payable) {
      staff.payableSessionCount += 1;
      staff.payableUnits += unitResult.units;
      staff.payableEstimate = roundCurrency(
        staff.payableEstimate + amountEstimate,
      );
      continue;
    }

    staff.heldSessionCount += 1;
    staff.heldUnits += unitResult.units;
    staff.heldEstimate = roundCurrency(
      staff.heldEstimate + amountEstimate,
    );
    const reason = payGate.holdReason || 'Pay held pending documentation';
    const hold = holdsByReason.get(reason) || {
      reason,
      sessionCount: 0,
      units: 0,
      amountEstimate: 0,
    };
    hold.sessionCount += 1;
    hold.units += unitResult.units;
    hold.amountEstimate = roundCurrency(
      hold.amountEstimate + amountEstimate,
    );
    holdsByReason.set(reason, hold);
  }

  const staff = [...staffById.values()].sort(
    (a, b) =>
      b.heldEstimate - a.heldEstimate ||
      b.payableEstimate - a.payableEstimate ||
      a.rbtName.localeCompare(b.rbtName),
  );
  const totals: FinancePayrollTotals = {
    staffCount: staff.length,
    sessionCount: sessions.length,
    noteUnitSessionCount,
    estimatedUnitSessionCount,
    noteUnits: staff.reduce((sum, row) => sum + row.noteUnits, 0),
    estimatedUnits: staff.reduce((sum, row) => sum + row.estimatedUnits, 0),
    totalUnits: staff.reduce((sum, row) => sum + row.totalUnits, 0),
    grossEstimate: roundCurrency(
      staff.reduce((sum, row) => sum + row.grossEstimate, 0),
    ),
    payableSessionCount: staff.reduce(
      (sum, row) => sum + row.payableSessionCount,
      0,
    ),
    payableUnits: staff.reduce((sum, row) => sum + row.payableUnits, 0),
    payableEstimate: roundCurrency(
      staff.reduce((sum, row) => sum + row.payableEstimate, 0),
    ),
    heldSessionCount: staff.reduce(
      (sum, row) => sum + row.heldSessionCount,
      0,
    ),
    heldUnits: staff.reduce((sum, row) => sum + row.heldUnits, 0),
    heldEstimate: roundCurrency(
      staff.reduce((sum, row) => sum + row.heldEstimate, 0),
    ),
    defaultRateStaffCount: staff.filter(
      (row) => row.rateSource === 'DEFAULT_ESTIMATE',
    ).length,
  };

  return {
    totals,
    staff,
    holds: [...holdsByReason.values()].sort(
      (a, b) =>
        b.amountEstimate - a.amountEstimate ||
        b.sessionCount - a.sessionCount ||
        a.reason.localeCompare(b.reason),
    ),
  };
}
