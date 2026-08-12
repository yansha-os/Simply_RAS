import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/(dashboard)/portal-case/actions/clinical-support', () => ({
  scheduleAssessment: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import {
  deriveAssessmentState,
  formatAssessmentDateEt,
  validateAssessmentSchedule,
} from './BcbaAssessmentTab';

describe('deriveAssessmentState', () => {
  it('allows scheduling only at the Assessment PA approved gate', () => {
    expect(
      deriveAssessmentState({
        status: 'PA_APPROVED',
        treatmentPlan: {},
      })
    ).toMatchObject({
      phase: 'ready',
      canSchedule: true,
      assessmentAt: null,
    });

    expect(
      deriveAssessmentState({
        status: 'PA_SUBMITTED',
        treatmentPlan: {},
      })
    ).toMatchObject({
      phase: 'locked',
      canSchedule: false,
      assessmentAt: null,
    });
  });

  it('reports scheduled only when status and a valid persisted date agree', () => {
    const state = deriveAssessmentState({
      status: 'ASSESSMENT_SCHEDULED',
      treatmentPlan: {
        assessmentScheduledAt: '2026-08-20T14:30:00.000Z',
      },
    });

    expect(state.phase).toBe('scheduled');
    expect(state.canSchedule).toBe(false);
    expect(state.assessmentAt?.toISOString()).toBe('2026-08-20T14:30:00.000Z');
  });

  it('requires reconciliation when advanced status has no persisted date', () => {
    expect(
      deriveAssessmentState({
        status: 'REPORT_ASSEMBLED',
        treatmentPlan: {},
      })
    ).toMatchObject({
      phase: 'reconcile',
      canSchedule: false,
      assessmentAt: null,
      dateIssue: 'missing',
    });
  });

  it('requires reconciliation when a date exists before scheduled status', () => {
    expect(
      deriveAssessmentState({
        status: 'PA_APPROVED',
        treatmentPlan: {
          assessmentScheduledAt: '2026-08-20T14:30:00.000Z',
        },
      })
    ).toMatchObject({
      phase: 'reconcile',
      canSchedule: false,
      dateIssue: null,
      hasReachedAssessmentStage: false,
    });
  });

  it('flags malformed persisted schedule data instead of displaying it', () => {
    expect(
      deriveAssessmentState({
        status: 'ASSESSMENT_SCHEDULED',
        treatmentPlan: { assessmentScheduledAt: 'not-a-date' },
      })
    ).toMatchObject({
      phase: 'reconcile',
      assessmentAt: null,
      dateIssue: 'invalid',
    });
  });

  it('supports legacy JSON-string treatment plan payloads without inventing values', () => {
    const state = deriveAssessmentState({
      status: 'ASSESSMENT_SCHEDULED',
      treatmentPlan: JSON.stringify({
        assessmentScheduledAt: '2026-01-15T20:30:00.000Z',
      }),
    });

    expect(state.phase).toBe('scheduled');
    expect(state.assessmentAt?.toISOString()).toBe('2026-01-15T20:30:00.000Z');
  });
});

describe('validateAssessmentSchedule', () => {
  const now = new Date('2026-08-12T12:00:00.000Z');

  it('requires a date before the local prep confirmation', () => {
    expect(validateAssessmentSchedule('', false, now)).toBe(
      'Choose an assessment date and time.'
    );
  });

  it('requires the explicit session-only materials confirmation', () => {
    expect(validateAssessmentSchedule('2026-08-20T10:30', false, now)).toBe(
      'Confirm that the requested assessment materials and forms are prepared.'
    );
  });

  it('rejects past clinic times', () => {
    expect(validateAssessmentSchedule('2026-08-12T07:00', true, now)).toBe(
      'Assessment date and time must be in the future.'
    );
  });

  it('rejects a nonexistent ET wall-clock time during the DST jump', () => {
    expect(
      validateAssessmentSchedule(
        '2027-03-14T02:30',
        true,
        new Date('2027-03-01T12:00:00.000Z')
      )
    ).toBe(
      'Choose a valid ET date and time. Times skipped during daylight saving are unavailable.'
    );
  });

  it('accepts a valid future ET wall-clock time', () => {
    expect(validateAssessmentSchedule('2026-08-20T10:30', true, now)).toBeNull();
  });
});

describe('formatAssessmentDateEt', () => {
  it('always renders the persisted instant in Eastern Time with its zone', () => {
    expect(formatAssessmentDateEt(new Date('2026-08-12T20:10:00.000Z'))).toBe(
      'Aug 12, 2026, 4:10 PM EDT'
    );
  });
});
