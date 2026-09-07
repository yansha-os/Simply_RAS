import { describe, expect, it } from 'vitest';

import {
  addClinicDays,
  clinicDateKey,
  clinicDayIndexMonday,
  clinicWallClock,
  clinicWallClockToUtc,
  clinicWallTimeToDate,
  endOfClinicDay,
  endOfClinicDayForDateOnly,
  startOfClinicDay,
  startOfClinicDayForDateOnly,
} from '../clinicTimezone';

// America/New_York 2026: DST starts Mar 8 (EST→EDT), ends Nov 1.

describe('clinicDateKey — clinic-day boundaries, not host/UTC days', () => {
  it('rolls the clinic date at 05:00Z in winter (EST, UTC-5)', () => {
    expect(clinicDateKey(new Date('2026-01-15T04:59:00Z'))).toBe('2026-01-14');
    expect(clinicDateKey(new Date('2026-01-15T05:00:00Z'))).toBe('2026-01-15');
  });

  it('rolls the clinic date at 04:00Z in summer (EDT, UTC-4)', () => {
    expect(clinicDateKey(new Date('2026-07-01T03:59:00Z'))).toBe('2026-06-30');
    expect(clinicDateKey(new Date('2026-07-01T04:00:00Z'))).toBe('2026-07-01');
  });
});

describe('clinicWallTimeToDate', () => {
  it('maps clinic midnight to the correct UTC instant in winter and summer', () => {
    expect(clinicWallTimeToDate(2026, 1, 15).toISOString()).toBe('2026-01-15T05:00:00.000Z');
    expect(clinicWallTimeToDate(2026, 7, 15).toISOString()).toBe('2026-07-15T04:00:00.000Z');
  });

  it('round-trips arbitrary wall times through clinicWallClock', () => {
    const d = clinicWallTimeToDate(2026, 8, 12, 14, 30, 45);
    const w = clinicWallClock(d);
    expect([w.year, w.month, w.day, w.hour, w.minute, w.second]).toEqual([
      2026, 8, 12, 14, 30, 45,
    ]);
  });
});

describe('DST-day boundaries (spring forward 2026-03-08)', () => {
  it('startOfClinicDay is midnight EST and endOfClinicDay is 23:59:59.999 EDT', () => {
    const noon = new Date('2026-03-08T17:00:00Z');
    expect(startOfClinicDay(noon).toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(endOfClinicDay(noon).toISOString()).toBe('2026-03-09T03:59:59.999Z');
  });

  it('the spring-forward clinic day is 23 wall-clock hours long', () => {
    const start = startOfClinicDay(new Date('2026-03-08T17:00:00Z'));
    const end = endOfClinicDay(new Date('2026-03-08T17:00:00Z'));
    const hours = (end.getTime() - start.getTime()) / 3_600_000;
    expect(Math.round(hours)).toBe(23);
  });
});

describe('addClinicDays — preserves wall-clock time across DST', () => {
  it('keeps 9:00 AM clinic time when crossing the spring-forward boundary', () => {
    const friday9am = clinicWallTimeToDate(2026, 3, 7, 9, 0);
    const next = addClinicDays(friday9am, 1);
    expect(clinicDateKey(next)).toBe('2026-03-08');
    expect(clinicWallClock(next).hour).toBe(9);
    // Only 23 real hours elapsed because an hour was skipped
    expect(next.getTime() - friday9am.getTime()).toBe(23 * 3_600_000);
  });

  it('supports negative day offsets', () => {
    const d = clinicWallTimeToDate(2026, 8, 12, 10, 0);
    expect(clinicDateKey(addClinicDays(d, -12))).toBe('2026-07-31');
  });
});

describe('clinicDayIndexMonday', () => {
  it('returns Monday=0 through Sunday=6 in clinic time', () => {
    // 2026-08-12 is a Wednesday
    expect(clinicDayIndexMonday(new Date('2026-08-12T16:00:00Z'))).toBe(2);
    // 2026-03-08 is a Sunday
    expect(clinicDayIndexMonday(new Date('2026-03-08T17:00:00Z'))).toBe(6);
  });

  it('attributes a late-UTC-evening instant to the previous clinic day', () => {
    // 2026-08-13T02:00Z is still Wednesday 10 PM in the clinic
    expect(clinicDayIndexMonday(new Date('2026-08-13T02:00:00Z'))).toBe(2);
  });
});

describe('clinicWallClockToUtc — datetime-local strings as clinic wall-clock', () => {
  it('interprets a winter (EST, UTC-5) datetime-local as clinic time', () => {
    expect(clinicWallClockToUtc('2026-01-15T15:30')?.toISOString()).toBe(
      '2026-01-15T20:30:00.000Z'
    );
  });

  it('interprets a summer (EDT, UTC-4) datetime-local as clinic time', () => {
    expect(clinicWallClockToUtc('2026-07-15T15:30')?.toISOString()).toBe(
      '2026-07-15T19:30:00.000Z'
    );
  });

  it('accepts an optional seconds component', () => {
    expect(clinicWallClockToUtc('2026-01-15T15:30:45')?.toISOString()).toBe(
      '2026-01-15T20:30:45.000Z'
    );
  });

  it('handles the spring-forward boundary (2026-03-08, EST→EDT)', () => {
    // 01:59 is still EST (UTC-5)
    expect(clinicWallClockToUtc('2026-03-08T01:59')?.toISOString()).toBe(
      '2026-03-08T06:59:00.000Z'
    );
    // 03:00 is EDT (UTC-4) — only 1 real minute after 01:59 EST
    expect(clinicWallClockToUtc('2026-03-08T03:00')?.toISOString()).toBe(
      '2026-03-08T07:00:00.000Z'
    );
    // Same afternoon wall time is one UTC hour earlier than the EST day before
    expect(clinicWallClockToUtc('2026-03-07T15:30')?.toISOString()).toBe(
      '2026-03-07T20:30:00.000Z'
    );
    expect(clinicWallClockToUtc('2026-03-08T15:30')?.toISOString()).toBe(
      '2026-03-08T19:30:00.000Z'
    );
  });

  it('handles the fall-back boundary (2026-11-01, EDT→EST)', () => {
    // Same afternoon wall time is one UTC hour later than the EDT day before
    expect(clinicWallClockToUtc('2026-10-31T15:30')?.toISOString()).toBe(
      '2026-10-31T19:30:00.000Z'
    );
    expect(clinicWallClockToUtc('2026-11-01T15:30')?.toISOString()).toBe(
      '2026-11-01T20:30:00.000Z'
    );
  });

  it('round-trips through clinicWallClock', () => {
    const d = clinicWallClockToUtc('2026-08-12T09:15');
    expect(d).not.toBeNull();
    const w = clinicWallClock(d!);
    expect([w.year, w.month, w.day, w.hour, w.minute]).toEqual([2026, 8, 12, 9, 15]);
  });

  it('returns null for zoned ISO strings and garbage (caller falls back to new Date)', () => {
    expect(clinicWallClockToUtc('2026-01-15T15:30:00.000Z')).toBeNull();
    expect(clinicWallClockToUtc('2026-01-15T15:30-05:00')).toBeNull();
    expect(clinicWallClockToUtc('2026-01-15')).toBeNull();
    expect(clinicWallClockToUtc('')).toBeNull();
    expect(clinicWallClockToUtc('not-a-date')).toBeNull();
  });

  it('rejects out-of-range field values instead of silently rolling over', () => {
    expect(clinicWallClockToUtc('2026-13-01T10:00')).toBeNull();
    expect(clinicWallClockToUtc('2026-01-32T10:00')).toBeNull();
    expect(clinicWallClockToUtc('2026-01-15T24:00')).toBeNull();
    expect(clinicWallClockToUtc('2026-01-15T10:60')).toBeNull();
    expect(clinicWallClockToUtc('2026-02-31T10:00')).toBeNull();
    expect(clinicWallClockToUtc('2026-03-08T02:30')).toBeNull();
  });
});

describe('date-only DB values (auth windows)', () => {
  it('maps the UTC calendar date to clinic-day boundaries regardless of stored time', () => {
    const stored = new Date('2026-03-08T00:00:00Z');
    expect(startOfClinicDayForDateOnly(stored).toISOString()).toBe(
      '2026-03-08T05:00:00.000Z'
    );
    expect(endOfClinicDayForDateOnly(stored).toISOString()).toBe(
      '2026-03-09T03:59:59.999Z'
    );
  });

  it('keeps an auth end date valid through the whole clinic day', () => {
    const authEnd = new Date('2026-06-30T00:00:00Z');
    const lastMoment = endOfClinicDayForDateOnly(authEnd);
    // 11:59 PM EDT on June 30 is still within the window
    expect(lastMoment.getTime()).toBeGreaterThanOrEqual(
      new Date('2026-07-01T03:59:00Z').getTime()
    );
    expect(clinicDateKey(lastMoment)).toBe('2026-06-30');
  });
});
