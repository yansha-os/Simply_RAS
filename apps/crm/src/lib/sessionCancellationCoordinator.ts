/**
 * Session Cancellation, No-Show & Make-Up Session Coordinator
 *
 * Tracks attendance integrity, analyzes cancellation taxonomies, computes
 * compliance scorecards, and generates compliant make-up session slots.
 */

export type CancellationReasonCategory =
  | 'CLIENT_ILLNESS'
  | 'STAFF_ILLNESS'
  | 'WEATHER_EMERGENCY'
  | 'FAMILY_VACATION'
  | 'SCHEDULE_CONFLICT'
  | 'TRANSPORTATION_ISSUE'
  | 'UNEXCUSED_NO_SHOW'
  | 'OTHER';

export interface CancellationRecord {
  sessionId: string;
  clientId: string;
  scheduledStart: Date | string;
  scheduledEnd: Date | string;
  durationMinutes: number;
  cptCode: string;
  status: 'CANCELLED' | 'NO_SHOW';
  reasonCategory: CancellationReasonCategory;
  reasonNotes?: string;
  cancelledBy: 'CLIENT' | 'STAFF' | 'AGENCY';
  cancelledAt: Date | string;
}

export interface AttendanceScorecard {
  totalScheduledSessions: number;
  completedSessions: number;
  cancelledSessions: number;
  noShowSessions: number;
  attendanceRatePct: number; // 0 to 100
  noShowRatePct: number;
  totalLostHours: number;
  complianceTier: 'COMPLIANT' | 'MONITORING' | 'AT_RISK';
  reasonBreakdown: Record<CancellationReasonCategory, number>;
  primaryCancellationDriver: CancellationReasonCategory | 'NONE';
}

export interface MakeUpEligibility {
  eligible: boolean;
  maxMakeUpHoursAllowed: number;
  recommendedTimeSlots: Array<{
    date: string; // YYYY-MM-DD
    startTime: string; // HH:mm
    endTime: string; // HH:mm
    durationMinutes: number;
    estimatedUnits: number;
  }>;
  policyNotes: string[];
}

export interface ScheduledSessionSlot {
  date: string; // YYYY-MM-DD
  startMinutes: number; // minutes from midnight
  endMinutes: number;
  status: string;
}

const REASON_LABELS: Record<CancellationReasonCategory, string> = {
  CLIENT_ILLNESS: 'Client / Child Illness',
  STAFF_ILLNESS: 'RBT / Therapist Illness',
  WEATHER_EMERGENCY: 'Severe Weather / Emergency',
  FAMILY_VACATION: 'Planned Family Vacation',
  SCHEDULE_CONFLICT: 'Medical / School Appointment Conflict',
  TRANSPORTATION_ISSUE: 'Transit / Commute Delay',
  UNEXCUSED_NO_SHOW: 'Unexcused Absence / No-Show',
  OTHER: 'Other Operational Reason',
};

export function getCancellationReasonLabel(reason: CancellationReasonCategory): string {
  return REASON_LABELS[reason] || reason;
}

/**
 * Computes the client attendance scorecard from session history
 */
export function calculateAttendanceScorecard(
  sessions: Array<{
    status: string;
    scheduledStart: Date | string;
    scheduledEnd: Date | string;
    cancellationReason?: string | null;
  }>
): AttendanceScorecard {
  const breakdown: Record<CancellationReasonCategory, number> = {
    CLIENT_ILLNESS: 0,
    STAFF_ILLNESS: 0,
    WEATHER_EMERGENCY: 0,
    FAMILY_VACATION: 0,
    SCHEDULE_CONFLICT: 0,
    TRANSPORTATION_ISSUE: 0,
    UNEXCUSED_NO_SHOW: 0,
    OTHER: 0,
  };

  let completed = 0;
  let cancelled = 0;
  let noShow = 0;
  let totalLostMinutes = 0;

  for (const s of sessions) {
    const start = new Date(s.scheduledStart).getTime();
    const end = new Date(s.scheduledEnd).getTime();
    const duration = Number.isFinite(start) && Number.isFinite(end) && end > start
      ? (end - start) / 60000
      : 0;

    if (s.status === 'COMPLETED') {
      completed++;
    } else if (s.status === 'NO_SHOW') {
      noShow++;
      breakdown.UNEXCUSED_NO_SHOW++;
      totalLostMinutes += duration;
    } else if (s.status === 'CANCELLED') {
      cancelled++;
      totalLostMinutes += duration;
      const rawReason = (s.cancellationReason || '').toUpperCase();
      if (rawReason.includes('CLIENT') || rawReason.includes('CHILD') || rawReason.includes('SICK')) {
        breakdown.CLIENT_ILLNESS++;
      } else if (rawReason.includes('STAFF') || rawReason.includes('RBT') || rawReason.includes('THERAPIST')) {
        breakdown.STAFF_ILLNESS++;
      } else if (rawReason.includes('WEATHER') || rawReason.includes('STORM') || rawReason.includes('SNOW')) {
        breakdown.WEATHER_EMERGENCY++;
      } else if (rawReason.includes('VACATION') || rawReason.includes('TRIP') || rawReason.includes('HOLIDAY')) {
        breakdown.FAMILY_VACATION++;
      } else if (rawReason.includes('CONFLICT') || rawReason.includes('APPOINTMENT') || rawReason.includes('DOCTOR')) {
        breakdown.SCHEDULE_CONFLICT++;
      } else if (rawReason.includes('TRANSIT') || rawReason.includes('COMMUTE') || rawReason.includes('CAR')) {
        breakdown.TRANSPORTATION_ISSUE++;
      } else {
        breakdown.OTHER++;
      }
    }
  }

  const total = completed + cancelled + noShow;
  const attendanceRatePct = total > 0 ? Math.round((completed / total) * 100) : 100;
  const noShowRatePct = total > 0 ? Math.round((noShow / total) * 100) : 0;
  const totalLostHours = Math.round((totalLostMinutes / 60) * 10) / 10;

  let complianceTier: AttendanceScorecard['complianceTier'] = 'COMPLIANT';
  if (total >= 4) {
    if (attendanceRatePct < 70 || noShowRatePct >= 20) {
      complianceTier = 'AT_RISK';
    } else if (attendanceRatePct < 85 || noShowRatePct >= 10) {
      complianceTier = 'MONITORING';
    }
  }

  let primaryCancellationDriver: CancellationReasonCategory | 'NONE' = 'NONE';
  let maxCount = 0;
  for (const [key, count] of Object.entries(breakdown)) {
    if (count > maxCount) {
      maxCount = count;
      primaryCancellationDriver = key as CancellationReasonCategory;
    }
  }

  return {
    totalScheduledSessions: total,
    completedSessions: completed,
    cancelledSessions: cancelled,
    noShowSessions: noShow,
    attendanceRatePct,
    noShowRatePct,
    totalLostHours,
    complianceTier,
    reasonBreakdown: breakdown,
    primaryCancellationDriver,
  };
}

/**
 * Evaluates make-up eligibility and suggests make-up session windows
 */
export function evaluateMakeUpSessionEligibility(params: {
  cancelledDurationMinutes: number;
  weeklyAuthorizedHours: number;
  currentWeeklyRenderedHours: number;
  currentWeeklyScheduledHours: number;
  dailyMueHoursLimit?: number; // default 8 hours (32 units)
  daysRemainingInWeek: number;
}): MakeUpEligibility {
  const dailyMue = params.dailyMueHoursLimit ?? 8;
  const cancelledHours = params.cancelledDurationMinutes / 60;
  const currentTotalHours = params.currentWeeklyRenderedHours + params.currentWeeklyScheduledHours;
  const headroomHours = Math.max(0, params.weeklyAuthorizedHours - currentTotalHours);

  const maxMakeUpHoursAllowed = Math.min(cancelledHours, headroomHours);
  const eligible = maxMakeUpHoursAllowed > 0 && params.daysRemainingInWeek > 0;

  const policyNotes: string[] = [];

  if (!eligible) {
    if (headroomHours <= 0) {
      policyNotes.push('Weekly authorized hours cap already reached. Make-up would exceed prior authorization.');
    }
    if (params.daysRemainingInWeek <= 0) {
      policyNotes.push('No remaining days in the active billing week. Make-up must be scheduled in a subsequent week with available auth headroom.');
    }
  } else {
    policyNotes.push(`Eligible for up to ${maxMakeUpHoursAllowed.toFixed(1)} hours of make-up sessions this week.`);
    policyNotes.push(`Daily session length must not exceed MUE limit of ${dailyMue} hours (32 units).`);
  }

  // Generate recommended make-up slots
  const recommendedTimeSlots: MakeUpEligibility['recommendedTimeSlots'] = [];

  if (eligible) {
    const slotDuration = Math.min(120, Math.round(maxMakeUpHoursAllowed * 60)); // 2-hr slots or remaining
    const units = Math.floor(slotDuration / 15);

    // Standard Saturday morning make-up slot
    recommendedTimeSlots.push({
      date: 'Weekend Make-Up',
      startTime: '10:00',
      endTime: slotDuration === 120 ? '12:00' : '11:30',
      durationMinutes: slotDuration,
      estimatedUnits: units,
    });

    // Standard weekday late afternoon slot
    if (slotDuration <= 90) {
      recommendedTimeSlots.push({
        date: 'Weekday Extension',
        startTime: '16:30',
        endTime: slotDuration === 90 ? '18:00' : '17:30',
        durationMinutes: slotDuration,
        estimatedUnits: units,
      });
    }
  }

  return {
    eligible,
    maxMakeUpHoursAllowed,
    recommendedTimeSlots,
    policyNotes,
  };
}
