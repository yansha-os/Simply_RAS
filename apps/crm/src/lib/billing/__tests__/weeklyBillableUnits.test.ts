import { describe, expect, it } from 'vitest';
import { REQUIRED_CHECKLIST_KEYS } from '@repo/db/session-note-attestation';

import {
  computeWeeklyBillableUnits,
  endOfWeekSunday,
  shiftWeek,
  startOfWeekMonday,
} from '../weeklyBillableUnits';

// Week boundaries are pinned to the clinic TZ (America/New_York, EDT = UTC-4
// in August). All dates below carry explicit offsets so the suite passes in
// any CI timezone. Week under test: Mon Aug 10 → Sun Aug 16 2026 (ET).
const MONDAY = new Date('2026-08-10T00:00:00.000-04:00');

type Note = {
  id: string;
  parentSigned: boolean;
  parentSignedAt: Date | string | null;
  parentSignerName: string | null;
  rbtSigned: boolean;
  rbtSignedAt: Date | string | null;
  rbtSignerName: string | null;
  bcbaSigned: boolean;
  bcbaSignedAt: Date | string | null;
  isConverted: boolean;
  billableUnits: number | null;
  checklistSnapshot: unknown;
  submissionFingerprint: string | null;
  openDeficiencyCount: number;
  convertedAt: Date | string | null;
  plutusClaimRef: string | null;
  bcbaSignerName: string | null;
};

function makeNote(overrides: Partial<Note> = {}): Note {
  const signedAt = '2026-08-12T14:00:00.000Z';
  return {
    id: 'n-1',
    parentSigned: true,
    parentSignedAt: signedAt,
    parentSignerName: 'Caregiver Name',
    rbtSigned: true,
    rbtSignedAt: signedAt,
    rbtSignerName: 'RBT Name',
    bcbaSigned: true,
    bcbaSignedAt: signedAt,
    isConverted: false,
    billableUnits: 4,
    checklistSnapshot: {
      schemaVersion: 1,
      passed: true,
      checkedAt: signedAt,
      items: REQUIRED_CHECKLIST_KEYS.map((key) => ({
        key,
        label: key,
        standard: 'BOTH',
        ok: true,
      })),
    },
    submissionFingerprint: 'a'.repeat(64),
    openDeficiencyCount: 0,
    convertedAt: null,
    plutusClaimRef: null,
    bcbaSignerName: 'Dr. Smith',
    ...overrides,
  };
}

function makeSession(
  start: Date,
  durationMinutes: number,
  note: Note | null,
  overrides: Partial<{
    id: string;
    cptCode: string | null;
    status: string;
  }> = {},
) {
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  return {
    id: overrides.id ?? 's-1',
    cptCode: overrides.cptCode !== undefined ? overrides.cptCode : '97153',
    status: overrides.status ?? 'COMPLETED',
    scheduledStart: start,
    scheduledEnd: end,
    actualStart: null,
    actualEnd: null,
    note,
    rbt: { firstName: 'Riley', lastName: 'Tran' },
  };
}

describe('week boundary helpers (clinic TZ = America/New_York)', () => {
  it('startOfWeekMonday returns clinic Monday 00:00 for mid-week dates', () => {
    const wednesday = new Date('2026-08-12T15:30:00-04:00');
    expect(startOfWeekMonday(wednesday).getTime()).toBe(MONDAY.getTime());
  });

  it('startOfWeekMonday maps Sunday back to the preceding Monday', () => {
    const sunday = new Date('2026-08-16T09:00:00-04:00');
    expect(startOfWeekMonday(sunday).getTime()).toBe(MONDAY.getTime());
  });

  it('pins to the clinic TZ: Sunday 10 pm ET is still the prior week even when it is Monday in UTC', () => {
    // 2026-08-17T02:00:00Z = Sunday Aug 16, 10 pm ET
    const sundayEveningEt = new Date('2026-08-17T02:00:00Z');
    expect(startOfWeekMonday(sundayEveningEt).getTime()).toBe(MONDAY.getTime());
  });

  it('endOfWeekSunday is clinic Sunday 23:59:59.999', () => {
    expect(endOfWeekSunday(MONDAY).getTime()).toBe(
      new Date('2026-08-16T23:59:59.999-04:00').getTime(),
    );
  });

  it('handles the DST fall-back week (EDT Monday → EST Sunday)', () => {
    // US DST ends Sun Nov 1 2026. Week: Mon Oct 26 (EDT) → Sun Nov 1 (EST).
    const monday = startOfWeekMonday(new Date('2026-10-28T12:00:00-04:00'));
    expect(monday.getTime()).toBe(new Date('2026-10-26T00:00:00-04:00').getTime());
    expect(endOfWeekSunday(monday).getTime()).toBe(
      new Date('2026-11-01T23:59:59.999-05:00').getTime(),
    );
  });

  it('shiftWeek moves whole weeks', () => {
    expect(shiftWeek(MONDAY, 1).getTime()).toBe(
      new Date('2026-08-17T00:00:00.000-04:00').getTime(),
    );
    expect(shiftWeek(MONDAY, -1).getTime()).toBe(
      new Date('2026-08-03T00:00:00.000-04:00').getTime(),
    );
  });
});

describe('computeWeeklyBillableUnits', () => {
  it('includes only complete durable attestation chains', () => {
    const week = computeWeeklyBillableUnits({
      clientId: 'c-1',
      weekStart: MONDAY,
      sessions: [
        makeSession(new Date('2026-08-12T10:00:00-04:00'), 60, makeNote(), { id: 's-signed' }),
        makeSession(
          new Date('2026-08-12T13:00:00-04:00'),
          60,
          makeNote({ bcbaSigned: false }),
          { id: 's-unsigned' },
        ),
        makeSession(
          new Date('2026-08-12T15:00:00-04:00'),
          60,
          makeNote({
            bcbaSigned: false,
            bcbaSignedAt: null,
            bcbaSignerName: null,
            isConverted: true,
          }),
          { id: 's-converted-invalid' },
        ),
        makeSession(new Date('2026-08-13T10:00:00-04:00'), 60, null, { id: 's-noteless' }),
      ],
    });

    expect(week.sessions.map((s) => s.sessionId)).toEqual(['s-signed']);
    expect(week.totals.sessions).toBe(1);
    expect(week.totals.integrityReviewCount).toBe(1);
    expect(week.manualReviewRequired).toBe(true);
  });

  it('excludes cancelled and no-show sessions even when signed', () => {
    const week = computeWeeklyBillableUnits({
      clientId: 'c-1',
      weekStart: MONDAY,
      sessions: [
        makeSession(new Date('2026-08-11T10:00:00-04:00'), 60, makeNote(), {
          id: 's-cancelled',
          status: 'CANCELLED',
        }),
        makeSession(new Date('2026-08-11T13:00:00-04:00'), 60, makeNote(), {
          id: 's-noshow',
          status: 'NO_SHOW',
        }),
      ],
    });

    expect(week.totals.sessions).toBe(0);
    expect(week.totals.units).toBe(0);
  });

  it('excludes sessions outside the Mon–Sun window', () => {
    const week = computeWeeklyBillableUnits({
      clientId: 'c-1',
      weekStart: MONDAY,
      sessions: [
        // Sunday of the previous week
        makeSession(new Date('2026-08-09T10:00:00-04:00'), 60, makeNote(), { id: 's-prev' }),
        // Monday of the next week
        makeSession(new Date('2026-08-17T10:00:00-04:00'), 60, makeNote(), { id: 's-next' }),
        // In-window
        makeSession(new Date('2026-08-14T10:00:00-04:00'), 60, makeNote(), { id: 's-in' }),
      ],
    });

    expect(week.sessions.map((s) => s.sessionId)).toEqual(['s-in']);
  });

  it('buckets a Sunday 8 pm ET session into the current week (UTC hosts saw next Monday)', () => {
    const week = computeWeeklyBillableUnits({
      clientId: 'c-1',
      weekStart: MONDAY,
      sessions: [
        // 2026-08-17T00:00:00Z — Sunday Aug 16, 8 pm ET
        makeSession(new Date('2026-08-16T20:00:00-04:00'), 60, makeNote(), { id: 's-sun-pm' }),
      ],
    });

    expect(week.sessions.map((s) => s.sessionId)).toEqual(['s-sun-pm']);
    const row = week.sessions[0];
    expect(row.dayIndex).toBe(6); // Sunday
    expect(week.days[6].dateIso).toBe('2026-08-16');
  });

  it('requires positive durable units and never falls back to duration', () => {
    const week = computeWeeklyBillableUnits({
      clientId: 'c-1',
      weekStart: MONDAY,
      sessions: [
        makeSession(new Date('2026-08-12T10:00:00-04:00'), 60, makeNote({ billableUnits: 6 }), {
          id: 's-note-units',
        }),
        // null billableUnits, 60 minutes → 4 units under the Medicaid 8-min rule
        makeSession(
          new Date('2026-08-13T10:00:00-04:00'),
          60,
          makeNote({ billableUnits: null }),
          { id: 's-duration' },
        ),
      ],
    });

    const noteRow = week.sessions.find((s) => s.sessionId === 's-note-units')!;
    expect(noteRow.units).toBe(6);
    expect(noteRow.unitsSource).toBe('NOTE_BILLABLE_UNITS');
    expect(week.sessions.find((s) => s.sessionId === 's-duration')).toBeUndefined();
    expect(week.totals.units).toBe(6);
    expect(week.totals.integrityReviewCount).toBe(1);
    expect(week.manualReviewRequired).toBe(true);
  });

  it('aggregates per-CPT totals and converted / awaiting counts', () => {
    const week = computeWeeklyBillableUnits({
      clientId: 'c-1',
      weekStart: MONDAY,
      sessions: [
        makeSession(new Date('2026-08-10T09:00:00-04:00'), 60, makeNote({ isConverted: true }), {
          id: 's-a',
          cptCode: '97153',
        }),
        makeSession(new Date('2026-08-11T09:00:00-04:00'), 60, makeNote(), {
          id: 's-b',
          cptCode: '97153',
        }),
        makeSession(new Date('2026-08-12T09:00:00-04:00'), 60, makeNote({ billableUnits: 2 }), {
          id: 's-c',
          cptCode: '97155',
        }),
      ],
    });

    const c97153 = week.byCpt.find((c) => c.cptCode === '97153')!;
    const c97155 = week.byCpt.find((c) => c.cptCode === '97155')!;
    expect(c97153.units).toBe(8);
    expect(c97153.sessionCount).toBe(2);
    expect(c97153.convertedCount).toBe(1);
    expect(c97155.units).toBe(2);
    expect(week.totals.converted).toBe(1);
    expect(week.totals.awaitingConvert).toBe(2);
  });
});
