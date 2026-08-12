import {
  addClinicDays,
  clinicDayIndexMonday,
  clinicWallClock,
  CLINIC_TIME_ZONE,
  startOfClinicDay,
} from '@/lib/clinicTimezone';
import {
  derivePayHoldFromFlags,
  estimateUnitsFromWindow,
  resolvePayrollUnits,
} from '@/lib/rbtPayHolds';

const etDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CLINIC_TIME_ZONE,
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const etTimestampFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CLINIC_TIME_ZONE,
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const monthFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CLINIC_TIME_ZONE,
  month: 'short',
});

export function formatManagerEtDate(date: Date): string {
  return etDateFormatter.format(date);
}

export function formatManagerEtTimestamp(date: Date): string {
  return `${etTimestampFormatter.format(date)} ET`;
}

function formatWeekLabel(start: Date, endInclusive: Date): string {
  const startWall = clinicWallClock(start);
  const endWall = clinicWallClock(endInclusive);
  const startMonth = monthFormatter.format(start);
  const endMonth = monthFormatter.format(endInclusive);

  if (startWall.year === endWall.year && startWall.month === endWall.month) {
    return `${startMonth} ${startWall.day}–${endWall.day}, ${startWall.year} ET`;
  }
  if (startWall.year === endWall.year) {
    return `${startMonth} ${startWall.day}–${endMonth} ${endWall.day}, ${startWall.year} ET`;
  }
  return `${startMonth} ${startWall.day}, ${startWall.year}–${endMonth} ${endWall.day}, ${endWall.year} ET`;
}

export function getRbtManagerWeekWindow(now: Date): {
  start: Date;
  endExclusive: Date;
  label: string;
} {
  const clinicToday = startOfClinicDay(now);
  const start = addClinicDays(clinicToday, -clinicDayIndexMonday(now));
  const endExclusive = addClinicDays(start, 7);
  const endInclusive = new Date(endExclusive.getTime() - 1);

  return {
    start,
    endExclusive,
    label: formatWeekLabel(start, endInclusive),
  };
}

export type RbtManagerSessionMetricInput = {
  rbtId: string | null;
  status: string;
  cptCode: string | null;
  scheduledStart: Date;
  scheduledEnd: Date;
  actualStart: Date | null;
  actualEnd: Date | null;
  note: {
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
    billableUnits: number | null;
    checklistSnapshot: unknown;
    openDeficiencyCount: number;
    submissionFingerprint: string | null;
  } | null;
};

export type RbtManagerStaffWorkMetrics = {
  sessionsThisWeek: number;
  completedSessions: number;
  inProgressSessions: number;
  payrollReadyHours: number;
  payrollReadySessions: number;
  payrollHeldSessions: number;
  openTasks: number;
  overdueTasks: number;
  estimatedUnitSessions: number;
};

function emptyWorkMetrics(): RbtManagerStaffWorkMetrics {
  return {
    sessionsThisWeek: 0,
    completedSessions: 0,
    inProgressSessions: 0,
    payrollReadyHours: 0,
    payrollReadySessions: 0,
    payrollHeldSessions: 0,
    openTasks: 0,
    overdueTasks: 0,
    estimatedUnitSessions: 0,
  };
}

export function summarizeRbtManagerWork(input: {
  userIds: string[];
  sessions: RbtManagerSessionMetricInput[];
  openTaskCounts: ReadonlyMap<string, number>;
  overdueTaskCounts: ReadonlyMap<string, number>;
}): {
  byUserId: Record<string, RbtManagerStaffWorkMetrics>;
  totals: RbtManagerStaffWorkMetrics;
} {
  const byUserId: Record<string, RbtManagerStaffWorkMetrics> = {};
  for (const userId of input.userIds) {
    byUserId[userId] = {
      ...emptyWorkMetrics(),
      openTasks: input.openTaskCounts.get(userId) ?? 0,
      overdueTasks: input.overdueTaskCounts.get(userId) ?? 0,
    };
  }

  for (const session of input.sessions) {
    if (!session.rbtId) continue;
    const metrics = byUserId[session.rbtId];
    if (!metrics) continue;
    if (!['SCHEDULED', 'IN_PROGRESS', 'COMPLETED'].includes(session.status)) continue;

    metrics.sessionsThisWeek += 1;
    if (session.status === 'COMPLETED') metrics.completedSessions += 1;
    if (session.status === 'IN_PROGRESS') metrics.inProgressSessions += 1;

    if (session.cptCode === '97151') continue;

    const note = session.note;
    const { payable } = derivePayHoldFromFlags({
      hasNote: Boolean(note),
      sessionStatus: session.status,
      parentSigned: Boolean(note?.parentSigned),
      parentSignedAt: note?.parentSignedAt ?? null,
      parentSignerName: note?.parentSignerName ?? null,
      rbtSigned: Boolean(note?.rbtSigned),
      rbtSignedAt: note?.rbtSignedAt ?? null,
      rbtSignerName: note?.rbtSignerName ?? null,
      bcbaSigned: Boolean(note?.bcbaSigned),
      bcbaSignedAt: note?.bcbaSignedAt ?? null,
      bcbaSignerName: note?.bcbaSignerName ?? null,
      isConverted: Boolean(note?.isConverted),
      checklistSnapshot: note?.checklistSnapshot ?? null,
      openDeficiencyCount: note?.openDeficiencyCount ?? 0,
      billableUnits: note?.billableUnits ?? null,
      submissionFingerprint: note?.submissionFingerprint ?? null,
    });
    const isOperationalHold =
      !payable && (session.status === 'COMPLETED' || session.status === 'IN_PROGRESS');

    if (!payable && !isOperationalHold) continue;

    const start = session.actualStart ?? session.scheduledStart;
    const end = session.actualEnd ?? session.scheduledEnd;
    const fallbackUnits = estimateUnitsFromWindow(start.getTime(), end.getTime());
    const { units, source } = resolvePayrollUnits(note?.billableUnits, fallbackUnits);

    if (source === 'ESTIMATE') metrics.estimatedUnitSessions += 1;
    if (payable) {
      metrics.payrollReadySessions += 1;
      metrics.payrollReadyHours += units / 4;
    } else {
      metrics.payrollHeldSessions += 1;
    }
  }

  const totals = Object.values(byUserId).reduce<RbtManagerStaffWorkMetrics>(
    (sum, metrics) => {
      sum.sessionsThisWeek += metrics.sessionsThisWeek;
      sum.completedSessions += metrics.completedSessions;
      sum.inProgressSessions += metrics.inProgressSessions;
      sum.payrollReadyHours += metrics.payrollReadyHours;
      sum.payrollReadySessions += metrics.payrollReadySessions;
      sum.payrollHeldSessions += metrics.payrollHeldSessions;
      sum.openTasks += metrics.openTasks;
      sum.overdueTasks += metrics.overdueTasks;
      sum.estimatedUnitSessions += metrics.estimatedUnitSessions;
      return sum;
    },
    emptyWorkMetrics(),
  );

  totals.payrollReadyHours = Math.round(totals.payrollReadyHours * 100) / 100;
  for (const metrics of Object.values(byUserId)) {
    metrics.payrollReadyHours = Math.round(metrics.payrollReadyHours * 100) / 100;
  }

  return { byUserId, totals };
}
