import { describe, expect, it } from 'vitest';
import { compileParentPortalSummary } from '../parentPortalEngine';

describe('compileParentPortalSummary', () => {
  const client = {
    id: 'client-12345678',
    firstName: 'Maya',
    lastName: 'Lin',
    guardianName: 'Elena Lin',
  };

  const skillTargets = [
    {
      id: 't-1',
      domain: 'Language',
      title: 'Vocal Manding for Water',
      targetStatus: 'MASTERED',
      updatedAt: '2026-06-01T00:00:00Z',
    },
    {
      id: 't-2',
      domain: 'Social',
      title: 'Waving Hello to Peers',
      targetStatus: 'IN_PROGRESS',
      updatedAt: '2026-06-01T00:00:00Z',
    },
  ];

  const sessions = [
    {
      id: 's-1',
      status: 'COMPLETED',
      cptCode: '97153',
      scheduledStart: '2026-06-01T09:00:00Z',
      scheduledEnd: '2026-06-01T11:00:00Z', // 2 hrs
    },
    {
      id: 's-2',
      status: 'SCHEDULED',
      cptCode: '97156',
      scheduledStart: '2026-12-01T15:00:00Z',
      scheduledEnd: '2026-12-01T16:00:00Z',
      bcba: { firstName: 'Sarah', lastName: 'Connor' },
    },
  ];

  it('compiles family-friendly summary with milestone badges and next session', () => {
    const summary = compileParentPortalSummary({
      client,
      skillTargets,
      sessions,
    });

    expect(summary.clientId).toBe('client-12345678');
    expect(summary.clientName).toBe('Maya Lin');
    expect(summary.caregiverName).toBe('Elena Lin');
    expect(summary.totalMasteredGoals).toBe(1);
    expect(summary.inProgressGoalsCount).toBe(1);
    expect(summary.milestones.length).toBeGreaterThanOrEqual(1);
    expect(summary.milestones[0].title).toContain('First Skill Mastered');
    expect(summary.homeworkTasks.length).toBeGreaterThanOrEqual(1);

    expect(summary.nextScheduledSession).toBeDefined();
    expect(summary.nextScheduledSession?.isTelehealth).toBe(true);
    expect(summary.nextScheduledSession?.telehealthRoomUrl).toBeNull();
  });

  it('handles client with zero sessions and no mastered goals gracefully', () => {
    const summary = compileParentPortalSummary({
      client: { id: 'c-0', firstName: 'Baby', lastName: 'Doe' },
      skillTargets: [],
      sessions: [],
    });

    expect(summary.totalMasteredGoals).toBe(0);
    expect(summary.attendanceRatePct).toBe(100);
    expect(summary.nextScheduledSession).toBeNull();
    expect(summary.homeworkTasks.length).toBeGreaterThanOrEqual(1);
  });
});
