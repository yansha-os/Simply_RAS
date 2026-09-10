import { describe, expect, it } from 'vitest';
import {
  buildJobAppTasks,
  buildOnboardingTasks,
  buildPayHoldTasks,
  completedTaskStepsFromAudit,
  filterTasks,
  formatTaskDateEt,
  mergeCompletedTaskSteps,
  resolveTaskSurface,
  sortTaskItems,
  type PayrollTaskSource,
  type TaskItem,
} from './RbtTasksModel';

function payrollSession(
  overrides: Partial<PayrollTaskSource> = {}
): PayrollTaskSource {
  return {
    sessionId: 'session-1',
    noteId: null,
    clientName: 'A. Client',
    cptCode: '97153',
    scheduledStart: '2026-08-12T14:00:00.000Z',
    scheduledEnd: '2026-08-12T15:00:00.000Z',
    status: 'COMPLETED',
    rbtSigned: false,
    bcbaSigned: false,
    isConverted: false,
    payable: false,
    holdReason: 'Missing session note — pay held',
    ...overrides,
  };
}

describe('RBT task model', () => {
  it('formats task deadlines in clinic Eastern Time', () => {
    expect(formatTaskDateEt('2026-08-13T15:00:00.000Z')).toBe(
      'Aug 13, 2026, 11:00 AM ET'
    );
  });

  it('creates pay-hold work only for actionable sessions and gives it a 24-hour ET deadline', () => {
    const tasks = buildPayHoldTasks([
      payrollSession({ sessionId: 'completed' }),
      payrollSession({
        sessionId: 'scheduled',
        status: 'SCHEDULED',
        holdReason: 'Session scheduled; note not submitted',
      }),
      payrollSession({
        sessionId: 'payable',
        payable: true,
        noteId: 'note-1',
        rbtSigned: true,
        bcbaSigned: true,
      }),
      payrollSession({
        sessionId: 'bcba-owned',
        noteId: 'note-2',
        rbtSigned: true,
        holdReason: 'Awaiting BCBA e-sign — pay held',
      }),
    ]);

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      id: 'pay-db-completed',
      meta: 'Due Aug 13, 2026, 11:00 AM ET',
      dueAt: '2026-08-13T15:00:00.000Z',
    });
  });

  it('derives onboarding completion from persisted source flags', () => {
    expect(
      buildOnboardingTasks({
        tasksDone: true,
        tasksCompletedSteps: [1, 2],
        availabilityDone: true,
        simulationDone: true,
        interviewBooked: true,
        interviewPassed: true,
        certUploaded: true,
      })
    ).toEqual([]);
  });

  it('keeps only active persisted case applications', () => {
    const tasks = buildJobAppTasks([
      {
        id: 'active',
        status: 'MESSAGING',
        opening: {
          caseCode: 'CASE-1',
          clientInitials: 'AC',
          borough: 'Queens',
        },
      },
      {
        id: 'done',
        status: 'APPROVED',
        opening: {
          caseCode: 'CASE-2',
          clientInitials: 'BC',
          borough: 'Brooklyn',
        },
      },
    ]);

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      id: 'job-db-active',
      href: '/rbt/communication',
    });
  });

  it('filters task categories and sorts the oldest deadline first within priority', () => {
    const tasks: TaskItem[] = [
      {
        id: 'later',
        kind: 'PAY_HOLD',
        priority: 5,
        title: 'Later',
        detail: 'Later deadline',
        href: '/later',
        cta: 'Open',
        tone: 'rose',
        dueAt: '2026-08-14T15:00:00.000Z',
      },
      {
        id: 'job',
        kind: 'JOB_APP',
        priority: 15,
        title: 'Job',
        detail: 'Application',
        href: '/job',
        cta: 'Open',
        tone: 'sky',
      },
      {
        id: 'earlier',
        kind: 'PAY_HOLD',
        priority: 5,
        title: 'Earlier',
        detail: 'Earlier deadline',
        href: '/earlier',
        cta: 'Open',
        tone: 'rose',
        dueAt: '2026-08-13T15:00:00.000Z',
      },
    ];

    expect(filterTasks(tasks, 'PAY_HOLD').map((task) => task.id)).toEqual([
      'later',
      'earlier',
    ]);
    expect(sortTaskItems(tasks).map((task) => task.id)).toEqual([
      'earlier',
      'later',
      'job',
    ]);
  });

  it('limits task surfaces to the resolved RBT or applicant owner role', () => {
    expect(resolveTaskSurface('RBT')).toBe('LIVE');
    expect(resolveTaskSurface('APPLICANT')).toBe('ONBOARDING');
    expect(resolveTaskSurface('HEAD_HR')).toBe('DENIED');
    expect(resolveTaskSurface('NONE')).toBe('DENIED');
  });

  it('reconciles durable audit completion with the progress snapshot', () => {
    const auditSteps = completedTaskStepsFromAudit([
      { stepNumber: 2, actionType: 'SIGNED' },
      { stepNumber: 20, actionType: 'FORM_SUBMITTED' },
      { stepNumber: 4, actionType: 'QUIZ_FAILED' },
      { stepNumber: 1, actionType: 'UPLOADED' },
      { stepNumber: 20, actionType: 'SIGNED' },
      { stepNumber: 99, actionType: 'UPLOADED' },
    ]);

    expect(auditSteps).toEqual([2, 20]);
    expect(mergeCompletedTaskSteps([1, 2], auditSteps)).toEqual([1, 2, 20]);
  });
});
