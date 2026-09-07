import { describe, expect, it } from 'vitest';
import {
  checkAuthorizedHoursHeadroom,
  validateSessionConcurrency,
  type ScheduledSessionSlot,
} from '../schedulingConcurrencyEngine';

describe('validateSessionConcurrency', () => {
  const existingSessions: ScheduledSessionSlot[] = [
    {
      id: 'sess-1',
      clientId: 'client-A',
      cptCode: '97153',
      start: '2026-06-10T09:00:00Z',
      end: '2026-06-10T12:00:00Z',
      rbtId: 'rbt-1',
      location: '123 Main St, Brooklyn',
    },
    {
      id: 'sess-2',
      clientId: 'client-B',
      cptCode: '97153',
      start: '2026-06-10T14:00:00Z',
      end: '2026-06-10T17:00:00Z',
      rbtId: 'rbt-2',
      location: '456 Oak Ave, Queens',
    },
  ];

  it('allows valid concurrent 97155 BCBA supervision over 97153 RBT session', () => {
    const proposed: ScheduledSessionSlot = {
      id: 'prop-1',
      clientId: 'client-A',
      cptCode: '97155',
      start: '2026-06-10T10:00:00Z',
      end: '2026-06-10T11:30:00Z',
      bcbaId: 'bcba-1',
    };

    const res = validateSessionConcurrency(proposed, existingSessions);
    expect(res.allowed).toBe(true);
    expect(res.classification).toBe('VALID_CONCURRENT_SUPERVISION');
    expect(res.conflictingSessionId).toBe('sess-1');
  });

  it('blocks invalid duplicate 97153 direct billing for the same client', () => {
    const proposed: ScheduledSessionSlot = {
      id: 'prop-2',
      clientId: 'client-A',
      cptCode: '97153',
      start: '2026-06-10T10:00:00Z',
      end: '2026-06-10T12:00:00Z',
      rbtId: 'rbt-99',
    };

    const res = validateSessionConcurrency(proposed, existingSessions);
    expect(res.allowed).toBe(false);
    expect(res.classification).toBe('INVALID_DUPLICATE_CLIENT_BILLING');
  });

  it('blocks double booking the same RBT with a different client', () => {
    const proposed: ScheduledSessionSlot = {
      id: 'prop-3',
      clientId: 'client-C',
      cptCode: '97153',
      start: '2026-06-10T11:00:00Z',
      end: '2026-06-10T13:00:00Z',
      rbtId: 'rbt-1', // already booked with client-A 09:00-12:00
    };

    const res = validateSessionConcurrency(proposed, existingSessions);
    expect(res.allowed).toBe(false);
    expect(res.classification).toBe('INVALID_STAFF_DOUBLE_BOOKING');
  });

  it('warns when travel buffer between in-home sessions is under 30 minutes', () => {
    const proposed: ScheduledSessionSlot = {
      id: 'prop-4',
      clientId: 'client-C',
      cptCode: '97153',
      start: '2026-06-10T12:15:00Z', // 15 mins after sess-1 ends at 12:00
      end: '2026-06-10T14:00:00Z',
      rbtId: 'rbt-1',
    };

    const res = validateSessionConcurrency(proposed, existingSessions);
    expect(res.allowed).toBe(true);
    expect(res.classification).toBe('TRAVEL_BUFFER_WARNING');
  });
});

describe('checkAuthorizedHoursHeadroom', () => {
  it('calculates remaining headroom and detects over-limit schedules', () => {
    const result = checkAuthorizedHoursHeadroom({
      cptCode: '97153',
      weeklyAuthorizedHours: 15,
      existingWeekSessions: [
        { cptCode: '97153', durationMinutes: 180 }, // 3 hrs
        { cptCode: '97153', durationMinutes: 180 }, // 3 hrs
        { cptCode: '97153', durationMinutes: 360 }, // 6 hrs = 12 hrs total
      ],
      proposedDurationMinutes: 240, // 4 hrs = 16 hrs total
    });

    expect(result.currentlyScheduledHours).toBe(12);
    expect(result.proposedSessionHours).toBe(4);
    expect(result.remainingHeadroomHours).toBe(-1);
    expect(result.isOverLimit).toBe(true);
  });
});
