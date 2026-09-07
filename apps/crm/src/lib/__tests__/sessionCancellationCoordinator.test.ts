import { describe, expect, it } from 'vitest';
import {
  calculateAttendanceScorecard,
  evaluateMakeUpSessionEligibility,
} from '../sessionCancellationCoordinator';

describe('calculateAttendanceScorecard', () => {
  it('computes compliant attendance scorecard for high completion rate', () => {
    const sessions = [
      { status: 'COMPLETED', scheduledStart: '2026-02-01T09:00:00Z', scheduledEnd: '2026-02-01T11:00:00Z' },
      { status: 'COMPLETED', scheduledStart: '2026-02-02T09:00:00Z', scheduledEnd: '2026-02-02T11:00:00Z' },
      { status: 'COMPLETED', scheduledStart: '2026-02-03T09:00:00Z', scheduledEnd: '2026-02-03T11:00:00Z' },
      { status: 'COMPLETED', scheduledStart: '2026-02-04T09:00:00Z', scheduledEnd: '2026-02-04T11:00:00Z' },
      {
        status: 'CANCELLED',
        scheduledStart: '2026-02-05T09:00:00Z',
        scheduledEnd: '2026-02-05T11:00:00Z',
        cancellationReason: 'Client child had a fever',
      },
    ];

    const card = calculateAttendanceScorecard(sessions);
    expect(card.totalScheduledSessions).toBe(5);
    expect(card.completedSessions).toBe(4);
    expect(card.cancelledSessions).toBe(1);
    expect(card.noShowSessions).toBe(0);
    expect(card.attendanceRatePct).toBe(80);
    expect(card.totalLostHours).toBe(2);
    expect(card.complianceTier).toBe('MONITORING');
    expect(card.reasonBreakdown.CLIENT_ILLNESS).toBe(1);
    expect(card.primaryCancellationDriver).toBe('CLIENT_ILLNESS');
  });

  it('flags at-risk tier for frequent no-shows', () => {
    const sessions = [
      { status: 'COMPLETED', scheduledStart: '2026-02-01T09:00:00Z', scheduledEnd: '2026-02-01T11:00:00Z' },
      { status: 'NO_SHOW', scheduledStart: '2026-02-02T09:00:00Z', scheduledEnd: '2026-02-02T11:00:00Z' },
      { status: 'NO_SHOW', scheduledStart: '2026-02-03T09:00:00Z', scheduledEnd: '2026-02-03T11:00:00Z' },
      { status: 'COMPLETED', scheduledStart: '2026-02-04T09:00:00Z', scheduledEnd: '2026-02-04T11:00:00Z' },
    ];

    const card = calculateAttendanceScorecard(sessions);
    expect(card.noShowRatePct).toBe(50);
    expect(card.complianceTier).toBe('AT_RISK');
  });

  it('handles empty session history gracefully', () => {
    const card = calculateAttendanceScorecard([]);
    expect(card.totalScheduledSessions).toBe(0);
    expect(card.attendanceRatePct).toBe(100);
    expect(card.complianceTier).toBe('COMPLIANT');
  });
});

describe('evaluateMakeUpSessionEligibility', () => {
  it('allows make-up within weekly authorized headroom', () => {
    const res = evaluateMakeUpSessionEligibility({
      cancelledDurationMinutes: 120, // 2 hours
      weeklyAuthorizedHours: 15,
      currentWeeklyRenderedHours: 8,
      currentWeeklyScheduledHours: 3, // total 11 hrs (headroom = 4 hrs)
      daysRemainingInWeek: 3,
    });

    expect(res.eligible).toBe(true);
    expect(res.maxMakeUpHoursAllowed).toBe(2);
    expect(res.recommendedTimeSlots.length).toBeGreaterThan(0);
  });

  it('blocks make-up when weekly auth headroom is exhausted', () => {
    const res = evaluateMakeUpSessionEligibility({
      cancelledDurationMinutes: 120,
      weeklyAuthorizedHours: 15,
      currentWeeklyRenderedHours: 10,
      currentWeeklyScheduledHours: 5, // total 15 hrs (headroom = 0)
      daysRemainingInWeek: 2,
    });

    expect(res.eligible).toBe(false);
    expect(res.maxMakeUpHoursAllowed).toBe(0);
    expect(res.policyNotes.some((n) => n.includes('Weekly authorized hours cap'))).toBe(true);
  });
});
