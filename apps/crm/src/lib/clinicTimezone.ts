/**
 * Clinic timezone helpers — all billing/scheduling day + week boundaries are
 * computed in the clinic's timezone (America/New_York), never the host TZ.
 * Uses Intl only (no date libs) so it behaves identically on any server/CI TZ.
 *
 * Keep byte-identical with apps/hrm/src/lib/clinicTimezone.ts (cross-app copy).
 */

export const CLINIC_TIME_ZONE = 'America/New_York';

export type ClinicWallClock = {
  year: number;
  month: number; // 1–12
  day: number; // 1–31
  hour: number; // 0–23
  minute: number;
  second: number;
  /** 0 = Monday … 6 = Sunday */
  weekdayMondayIndex: number;
};

const WEEKDAY_TO_MONDAY_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CLINIC_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  weekday: 'short',
  hourCycle: 'h23',
});

/** Clinic wall-clock fields for a given instant. */
export function clinicWallClock(date: Date): ClinicWallClock {
  const parts: Record<string, string> = {};
  for (const p of partsFormatter.formatToParts(date)) {
    parts[p.type] = p.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekdayMondayIndex: WEEKDAY_TO_MONDAY_INDEX[parts.weekday] ?? 0,
  };
}

/** Clinic-TZ offset (ms ahead of UTC — negative for New York) at an instant. */
function clinicOffsetMs(date: Date): number {
  const w = clinicWallClock(date);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second, date.getUTCMilliseconds());
  return asUtc - date.getTime();
}

/** The instant when the clinic wall clock reads y-m-d h:m:s.ms (DST-safe). */
export function clinicWallTimeToDate(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0,
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const offset1 = clinicOffsetMs(new Date(utcGuess));
  let ts = utcGuess - offset1;
  const offset2 = clinicOffsetMs(new Date(ts));
  if (offset2 !== offset1) ts = utcGuess - offset2;
  return new Date(ts);
}

const DATETIME_LOCAL_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Parse a `datetime-local` input value ("YYYY-MM-DDTHH:mm[:ss]", no TZ
 * designator) as clinic wall-clock time and return the UTC instant
 * (DST-safe). Returns null for anything that is not a valid
 * datetime-local string — callers can then fall back to `new Date(value)`
 * for already-zoned ISO strings.
 */
export function clinicWallClockToUtc(dateTimeLocal: string): Date | null {
  const m = DATETIME_LOCAL_RE.exec(dateTimeLocal.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  const second = Number(s ?? 0);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  const date = clinicWallTimeToDate(Number(y), month, day, hour, minute, second);
  if (Number.isNaN(date.getTime())) return null;
  const reconstructed = clinicWallClock(date);
  if (
    reconstructed.year !== Number(y) ||
    reconstructed.month !== month ||
    reconstructed.day !== day ||
    reconstructed.hour !== hour ||
    reconstructed.minute !== minute ||
    reconstructed.second !== second
  ) {
    return null;
  }
  return date;
}

/** YYYY-MM-DD of the instant in the clinic timezone. */
export function clinicDateKey(date: Date): string {
  const w = clinicWallClock(date);
  return `${w.year}-${String(w.month).padStart(2, '0')}-${String(w.day).padStart(2, '0')}`;
}

/** 0 = Monday … 6 = Sunday, evaluated in the clinic timezone. */
export function clinicDayIndexMonday(date: Date): number {
  return clinicWallClock(date).weekdayMondayIndex;
}

/** Clinic 00:00:00.000 of the clinic calendar day containing the instant. */
export function startOfClinicDay(date: Date): Date {
  const w = clinicWallClock(date);
  return clinicWallTimeToDate(w.year, w.month, w.day);
}

/** Clinic 23:59:59.999 of the clinic calendar day containing the instant. */
export function endOfClinicDay(date: Date): Date {
  const w = clinicWallClock(date);
  return clinicWallTimeToDate(w.year, w.month, w.day, 23, 59, 59, 999);
}

/**
 * Add clinic calendar days, preserving the wall-clock time across DST
 * (adding 1 day to clinic-midnight always yields the next clinic-midnight).
 */
export function addClinicDays(date: Date, days: number): Date {
  const w = clinicWallClock(date);
  const rolled = new Date(Date.UTC(w.year, w.month - 1, w.day + days));
  return clinicWallTimeToDate(
    rolled.getUTCFullYear(),
    rolled.getUTCMonth() + 1,
    rolled.getUTCDate(),
    w.hour,
    w.minute,
    w.second,
    date.getUTCMilliseconds(),
  );
}

/**
 * Date-only DB values (auth start/end dates) are stored at (or near) UTC
 * midnight; their UTC calendar date is the intended calendar date. These map
 * that calendar date to clinic-TZ day boundaries for inclusive window checks.
 */
export function startOfClinicDayForDateOnly(date: Date): Date {
  return clinicWallTimeToDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function endOfClinicDayForDateOnly(date: Date): Date {
  return clinicWallTimeToDate(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    23,
    59,
    59,
    999,
  );
}
