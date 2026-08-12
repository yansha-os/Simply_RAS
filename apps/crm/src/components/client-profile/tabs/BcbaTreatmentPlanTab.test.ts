import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/(dashboard)/portal-case/actions/clinical-support', () => ({
  getGoalTemplates: vi.fn(),
  saveGoalTemplate: vi.fn(),
  saveTreatmentPlan: vi.fn(),
}));

vi.mock('@/app/actions/clinicalGoalsActions', () => ({
  syncTreatmentPlanTargetsToSessionStudio: vi.fn(),
}));

import {
  formatTreatmentPlanActionError,
  normalizeTreatmentPlanDraft,
  resolveAssignedBcbaIdentity,
  validateTreatmentPlanSubmission,
  type AssignedBcbaIdentity,
} from './BcbaTreatmentPlanTab';

const assignedAuthor: AssignedBcbaIdentity = {
  id: 'bcba-1',
  name: 'Morgan Lee',
  email: 'morgan@example.com',
};

function validPlan() {
  return {
    assessorName: assignedAuthor.name,
    assessorCredentials: 'BCBA',
    assessmentStartDate: '2026-08-01',
    assessmentEndDate: '2026-08-08',
    hours97151Eval: '8',
    hours97151Plan: '2',
    hours97153: '25',
    hours97155: '2',
    hours97156: '1',
    servicePeriodStart: '2026-09',
    servicePeriodEnd: '2027-02',
    primaryLocations: ['Home'],
    serviceSchedule: { mon: '3:00 PM–6:00 PM' },
    skillGoals: [
      {
        domain: 'Communication',
        description: 'Request a break using the selected communication system.',
        baseline: '0 independent opportunities',
        currentLevel: 'Baseline',
        mastery: '80% across three consecutive sessions',
        targetDate: '2027-01',
        status: 'New',
      },
    ],
    parentGoals: [
      {
        description: 'Implement the clinician-authored prompting procedure.',
        baseline: 'Not yet assessed',
        currentLevel: 'Baseline',
        mastery: '80% fidelity across three observations',
        targetDate: '2027-01',
        status: 'New',
      },
    ],
    brp: [],
    medicalNecessity: 'Clinician-authored rationale.',
    generalizationPlan: 'Clinician-authored generalization plan.',
    dischargeCriteria: 'Clinician-authored discharge criteria.',
    signature: assignedAuthor.name,
  };
}

describe('normalizeTreatmentPlanDraft', () => {
  it('returns a crash-safe draft for malformed JSON and malformed nested values', () => {
    expect(normalizeTreatmentPlanDraft('{not-json')).toMatchObject({
      brp: [],
      skillGoals: [],
      parentGoals: [],
      careCoordinationMeetings: [],
      primaryLocations: [],
      serviceSchedule: {
        mon: '',
        tue: '',
        wed: '',
        thu: '',
        fri: '',
        sat: '',
        sun: '',
      },
      toolScores: {},
    });

    const normalized = normalizeTreatmentPlanDraft({
      assessorName: { unsafe: true },
      brp: [null, 'bad-row'],
      skillGoals: [null, { description: 7, domain: 'Communication' }],
      parentGoals: 'not-an-array',
      careCoordinationMeetings: {},
      primaryLocations: ['Home', null, 'Home', 7],
      serviceSchedule: [],
      toolScores: 'not-an-object',
    });

    expect(normalized.assessorName).toBe('');
    expect(normalized.brp).toEqual([]);
    expect(normalized.skillGoals).toHaveLength(1);
    expect(normalized.skillGoals[0].description).toBe('7');
    expect(normalized.parentGoals).toEqual([]);
    expect(normalized.careCoordinationMeetings).toEqual([]);
    expect(normalized.primaryLocations).toEqual(['Home']);
    expect(normalized.serviceSchedule.mon).toBe('');
    expect(normalized.toolScores).toEqual({});
  });

  it('does not invent assessment tools or service recommendations', () => {
    const normalized = normalizeTreatmentPlanDraft({});

    expect(normalized.assessmentTool).toBe('');
    expect(normalized.hoursSupervision).toBe('');
    expect(normalized.hoursDirect).toBe('');
  });
});

describe('resolveAssignedBcbaIdentity', () => {
  it('uses the assigned BCBA database relation as the author identity', () => {
    expect(
      resolveAssignedBcbaIdentity({
        bcbaId: 'bcba-1',
        bcba: {
          id: 'bcba-1',
          firstName: ' Morgan ',
          lastName: ' Lee ',
          email: 'morgan@example.com',
        },
      }),
    ).toEqual(assignedAuthor);
  });

  it('rejects absent, incomplete, or mismatched relation data', () => {
    expect(resolveAssignedBcbaIdentity({ bcbaId: 'bcba-1', bcba: null })).toBeNull();
    expect(
      resolveAssignedBcbaIdentity({
        bcbaId: 'bcba-1',
        bcba: { id: 'bcba-1', firstName: 'Morgan', lastName: '' },
      }),
    ).toBeNull();
    expect(
      resolveAssignedBcbaIdentity({
        bcbaId: 'bcba-1',
        bcba: { id: 'different-user', firstName: 'Morgan', lastName: 'Lee' },
      }),
    ).toBeNull();
  });
});

describe('validateTreatmentPlanSubmission', () => {
  it('accepts an explicit, internally complete plan without requiring a behavior-reduction claim', () => {
    expect(validateTreatmentPlanSubmission(validPlan(), assignedAuthor)).toEqual({
      isValid: true,
      issues: [],
    });
  });

  it('requires a verified assigned BCBA identity', () => {
    const withoutAuthor = validateTreatmentPlanSubmission(validPlan(), null);
    expect(withoutAuthor.issues.map((issue) => issue.field)).toContain('author');
  });

  it('does not accept browser-entered text as signer identity', () => {
    const plan = validPlan();
    delete (plan as Partial<typeof plan>).signature;

    expect(validateTreatmentPlanSubmission(plan, assignedAuthor)).toEqual({
      isValid: true,
      issues: [],
    });
  });

  it('validates every explicit service recommendation and service window', () => {
    const result = validateTreatmentPlanSubmission(
      {
        ...validPlan(),
        hours97151Eval: '',
        hours97153: 'not-a-number',
        hours97155: '-1',
        servicePeriodStart: '2027-03',
        servicePeriodEnd: '2027-02',
        primaryLocations: [],
        serviceSchedule: {},
      },
      assignedAuthor,
    );

    expect(result.issues.map((issue) => issue.field)).toEqual(
      expect.arrayContaining([
        'hours97151Eval',
        'hours97153',
        'hours97155',
        'servicePeriodEnd',
        'primaryLocations',
        'serviceSchedule',
      ]),
    );
  });

  it('validates every authored skill, caregiver, and behavior-reduction row', () => {
    const result = validateTreatmentPlanSubmission(
      {
        ...validPlan(),
        skillGoals: [{ domain: 'Communication', description: '' }],
        parentGoals: [{ description: 'Caregiver objective' }],
        brp: [{ behavior: 'Elopement', function: '' }],
      },
      assignedAuthor,
    );

    expect(result.issues.map((issue) => issue.field)).toEqual(
      expect.arrayContaining([
        'skillGoals.0.description',
        'skillGoals.0.baseline',
        'skillGoals.0.currentLevel',
        'skillGoals.0.mastery',
        'skillGoals.0.targetDate',
        'parentGoals.0.baseline',
        'parentGoals.0.currentLevel',
        'parentGoals.0.mastery',
        'parentGoals.0.targetDate',
        'brp.0.function',
        'brp.0.baseline',
        'brp.0.topography',
        'brp.0.ferb',
        'brp.0.proactive',
        'brp.0.reactive',
        'brp.0.mastery',
        'brp.0.currentLevel',
        'brp.0.targetDate',
      ]),
    );
  });

  it('rejects malformed target months in every authored goal type', () => {
    const plan = validPlan();
    const result = validateTreatmentPlanSubmission(
      {
        ...plan,
        skillGoals: [{ ...plan.skillGoals[0], targetDate: '2026-99' }],
        parentGoals: [{ ...plan.parentGoals[0], targetDate: 'next spring' }],
        brp: [
          {
            behavior: 'Elopement',
            function: 'Escape',
            baseline: 'Baseline documented',
            topography: 'Operational definition',
            ferb: 'Replacement response',
            proactive: 'Antecedent strategy',
            reactive: 'Response strategy',
            mastery: 'Mastery criteria',
            currentLevel: 'Baseline',
            targetDate: '2026-00',
          },
        ],
      },
      assignedAuthor,
    );

    expect(result.issues.map((issue) => issue.field)).toEqual(
      expect.arrayContaining([
        'skillGoals.0.targetDate',
        'parentGoals.0.targetDate',
        'brp.0.targetDate',
      ]),
    );
  });
});

describe('formatTreatmentPlanActionError', () => {
  it('surfaces server errors and safely falls back for thrown or malformed values', () => {
    expect(
      formatTreatmentPlanActionError(
        { success: false, error: 'Pipeline gate denied submission.' },
        'Unable to save.',
      ),
    ).toBe('Pipeline gate denied submission.');
    expect(formatTreatmentPlanActionError(new Error('Network unavailable.'), 'Unable to save.')).toBe(
      'Network unavailable.',
    );
    expect(formatTreatmentPlanActionError({ success: false }, 'Unable to save.')).toBe(
      'Unable to save.',
    );
  });
});
