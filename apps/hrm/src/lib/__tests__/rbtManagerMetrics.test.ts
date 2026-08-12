import { describe, expect, it } from 'vitest';
import { REQUIRED_CHECKLIST_KEYS } from '@repo/db/session-note-attestation';
import {
  formatManagerEtDate,
  formatManagerEtTimestamp,
  getRbtManagerWeekWindow,
  summarizeRbtManagerWork,
} from '../rbtManagerMetrics';

const SIGNED_AT = '2026-08-12T14:00:00.000Z';

function durableNote() {
  return {
    parentSigned: true,
    parentSignedAt: SIGNED_AT,
    parentSignerName: 'Caregiver Name',
    rbtSigned: true,
    rbtSignedAt: SIGNED_AT,
    rbtSignerName: 'RBT Name',
    bcbaSigned: true,
    bcbaSignedAt: SIGNED_AT,
    bcbaSignerName: 'BCBA Name',
    isConverted: false,
    billableUnits: 8,
    checklistSnapshot: {
      schemaVersion: 1,
      passed: true,
      checkedAt: SIGNED_AT,
      items: REQUIRED_CHECKLIST_KEYS.map((key) => ({
        key,
        label: key,
        standard: 'BOTH',
        ok: true,
      })),
    },
    openDeficiencyCount: 0,
    submissionFingerprint: 'a'.repeat(64),
  };
}

describe('RBT manager metric dates', () => {
  it('uses clinic-local Monday boundaries across daylight saving time', () => {
    const window = getRbtManagerWeekWindow(new Date('2026-03-08T16:00:00.000Z'));

    expect(window.start.toISOString()).toBe('2026-03-02T05:00:00.000Z');
    expect(window.endExclusive.toISOString()).toBe('2026-03-09T04:00:00.000Z');
    expect(window.label).toBe('Mar 2–8, 2026 ET');
  });

  it('formats dates and timestamps in Eastern Time', () => {
    const instant = new Date('2026-08-13T01:30:00.000Z');

    expect(formatManagerEtDate(instant)).toBe('Aug 12, 2026');
    expect(formatManagerEtTimestamp(instant)).toBe('Aug 12, 2026, 9:30 PM ET');
  });
});

describe('RBT manager work summaries', () => {
  it('derives session, payroll, and task metrics from persisted records', () => {
    const result = summarizeRbtManagerWork({
      userIds: ['rbt-1', 'rbt-2'],
      sessions: [
        {
          rbtId: 'rbt-1',
          status: 'COMPLETED',
          cptCode: '97153',
          scheduledStart: new Date('2026-08-11T13:00:00.000Z'),
          scheduledEnd: new Date('2026-08-11T15:00:00.000Z'),
          actualStart: null,
          actualEnd: null,
          note: durableNote(),
        },
        {
          rbtId: 'rbt-1',
          status: 'COMPLETED',
          cptCode: '97153',
          scheduledStart: new Date('2026-08-12T13:00:00.000Z'),
          scheduledEnd: new Date('2026-08-12T14:00:00.000Z'),
          actualStart: null,
          actualEnd: null,
          note: null,
        },
        {
          rbtId: 'rbt-2',
          status: 'SCHEDULED',
          cptCode: '97153',
          scheduledStart: new Date('2026-08-14T13:00:00.000Z'),
          scheduledEnd: new Date('2026-08-14T14:00:00.000Z'),
          actualStart: null,
          actualEnd: null,
          note: null,
        },
      ],
      openTaskCounts: new Map([
        ['rbt-1', 3],
        ['rbt-2', 1],
      ]),
      overdueTaskCounts: new Map([['rbt-1', 1]]),
    });

    expect(result.byUserId['rbt-1']).toMatchObject({
      sessionsThisWeek: 2,
      completedSessions: 2,
      payrollReadyHours: 2,
      payrollReadySessions: 1,
      payrollHeldSessions: 1,
      openTasks: 3,
      overdueTasks: 1,
    });
    expect(result.byUserId['rbt-2']).toMatchObject({
      sessionsThisWeek: 1,
      payrollHeldSessions: 0,
      openTasks: 1,
    });
    expect(result.totals).toEqual({
      sessionsThisWeek: 3,
      completedSessions: 2,
      inProgressSessions: 0,
      payrollReadyHours: 2,
      payrollReadySessions: 1,
      payrollHeldSessions: 1,
      openTasks: 4,
      overdueTasks: 1,
      estimatedUnitSessions: 1,
    });
  });

  it('excludes assessment sessions from payroll while retaining session counts', () => {
    const result = summarizeRbtManagerWork({
      userIds: ['rbt-1'],
      sessions: [
        {
          rbtId: 'rbt-1',
          status: 'COMPLETED',
          cptCode: '97151',
          scheduledStart: new Date('2026-08-11T13:00:00.000Z'),
          scheduledEnd: new Date('2026-08-11T15:00:00.000Z'),
          actualStart: null,
          actualEnd: null,
          note: durableNote(),
        },
      ],
      openTaskCounts: new Map(),
      overdueTaskCounts: new Map(),
    });

    expect(result.totals.sessionsThisWeek).toBe(1);
    expect(result.totals.payrollReadyHours).toBe(0);
    expect(result.totals.payrollReadySessions).toBe(0);
  });
});
