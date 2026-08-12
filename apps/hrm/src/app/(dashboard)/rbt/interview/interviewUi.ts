import {
  addClinicDays,
  clinicWallClock,
  clinicWallTimeToDate,
} from '../../../../lib/clinicTimezone';

export type InterviewRecordForView = {
  status: string;
  recommendation: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
};

export type InterviewPortalRecord = InterviewRecordForView & {
  id: string;
  interviewerUserId: string | null;
  interviewerName: string | null;
  meetingLink: string | null;
  hrJoinedAt: string | null;
  completedAt: string | null;
};

export type InterviewHrMember = {
  id: string;
  name: string;
  role: string;
};

export type InterviewPortalSnapshot = {
  candidate: {
    firstName: string;
    stage: string;
    activationStatus: string;
  };
  interviewBooked: boolean;
  interviewPassed: boolean;
  interview: InterviewPortalRecord | null;
  hrMembers: InterviewHrMember[];
};

export type InterviewPortalResult =
  | { success: true; data: InterviewPortalSnapshot }
  | {
      success: false;
      reason: 'NO_SESSION' | 'INACTIVE_SESSION' | 'NOT_FOUND' | 'UNAVAILABLE';
      error: string;
    };

export type InterviewViewInput = {
  stage: string;
  activationStatus: string;
  interviewBooked: boolean;
  interviewPassed: boolean;
  interview: InterviewRecordForView | null;
};

export type InterviewView =
  | 'LOCKED'
  | 'CLOSED'
  | 'BOOKING'
  | 'SCHEDULED'
  | 'REVIEWED'
  | 'APPROVED';

export const INTERVIEW_TIME_SLOTS_ET = [
  '09:00 AM ET',
  '09:30 AM ET',
  '10:00 AM ET',
  '11:00 AM ET',
  '01:30 PM ET',
  '04:00 PM ET',
] as const;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{1,2}):(\d{2})\s*(AM|PM)(?:\s*(?:ET|EST|EDT))?$/i;

function parseDateParts(date: string) {
  const match = DATE_RE.exec(date.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendarCheck = new Date(Date.UTC(year, month - 1, day));

  if (
    calendarCheck.getUTCFullYear() !== year ||
    calendarCheck.getUTCMonth() + 1 !== month ||
    calendarCheck.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

export function parseInterviewSlotEt(date: string, time: string): Date | null {
  const dateParts = parseDateParts(date);
  const timeMatch = TIME_RE.exec(time.trim());
  if (!dateParts || !timeMatch) return null;

  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const period = timeMatch[3].toUpperCase();
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;

  if (period === 'PM' && hour !== 12) hour += 12;
  if (period === 'AM' && hour === 12) hour = 0;

  return clinicWallTimeToDate(
    dateParts.year,
    dateParts.month,
    dateParts.day,
    hour,
    minute
  );
}

export function normalizeInterviewTimeEt(time: string): string {
  const match = TIME_RE.exec(time.trim());
  if (!match) return time.trim();
  return `${match[1].padStart(2, '0')}:${match[2]} ${match[3].toUpperCase()} ET`;
}

export function isInterviewJoinWindowOpen(
  date: string,
  time: string,
  now = new Date()
): boolean {
  const scheduledAt = parseInterviewSlotEt(date, time);
  if (!scheduledAt) return false;
  const deltaMs = now.getTime() - scheduledAt.getTime();
  return deltaMs >= -5 * 60_000 && deltaMs <= 60 * 60_000;
}

export function getDefaultInterviewDateEt(now = new Date()): string {
  let candidate = addClinicDays(now, 1);
  while (clinicWallClock(candidate).weekdayMondayIndex > 4) {
    candidate = addClinicDays(candidate, 1);
  }
  const wall = clinicWallClock(candidate);
  return `${wall.year}-${String(wall.month).padStart(2, '0')}-${String(wall.day).padStart(2, '0')}`;
}

export function formatInterviewDateEt(date: string): string {
  const parts = parseDateParts(date);
  if (!parts) return date;
  const instant = clinicWallTimeToDate(parts.year, parts.month, parts.day, 12);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(instant);
}

export function isSafeInterviewMeetingUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'meet.jit.si' || url.hostname === 'meet.google.com')
    );
  } catch {
    return false;
  }
}

export function deriveInterviewView(input: InterviewViewInput): InterviewView {
  if (input.interviewPassed) return 'APPROVED';

  const status = input.interview?.status.toUpperCase();
  if (status === 'COMPLETED') return 'REVIEWED';
  if (
    (status === 'SCHEDULED' || status === 'IN_PROGRESS') &&
    input.interview?.scheduledDate &&
    input.interview.scheduledTime
  ) {
    return 'SCHEDULED';
  }
  if (status === 'CANCELLED' || status === 'NO_SHOW') return 'BOOKING';
  if (input.stage === 'REJECTED' || input.activationStatus === 'REJECTED') {
    return 'CLOSED';
  }

  const isActivated =
    input.activationStatus === 'INVITATION_SENT' ||
    input.activationStatus === 'ACTIVE' ||
    input.activationStatus === 'ACCOUNT_ACTIVE';
  if (!isActivated || input.stage === 'HIRED') return 'LOCKED';

  return 'BOOKING';
}
