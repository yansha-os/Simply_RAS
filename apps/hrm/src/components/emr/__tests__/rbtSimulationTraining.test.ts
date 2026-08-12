import { describe, expect, it } from 'vitest';

import {
  completionScopeForPersistResult,
  getSimulationReadiness,
  validatePracticeRepair,
  type SimulationEvidence,
} from '../rbtSimulationTraining';

const noEvidence: SimulationEvidence = {
  dtt: false,
  taskAnalysis: false,
  measurement: false,
  interval: false,
  abc: false,
  acknowledgment: false,
};

describe('getSimulationReadiness', () => {
  it('does not complete a seeded practice screen without trainee interactions', () => {
    expect(getSimulationReadiness(noEvidence)).toEqual({
      completed: 0,
      total: 6,
      ready: false,
      missing: ['dtt', 'taskAnalysis', 'measurement', 'interval', 'abc', 'acknowledgment'],
    });
  });

  it('requires evidence from every practice procedure and the typed acknowledgment', () => {
    expect(
      getSimulationReadiness({
        dtt: true,
        taskAnalysis: true,
        measurement: true,
        interval: true,
        abc: true,
        acknowledgment: true,
      })
    ).toEqual({
      completed: 6,
      total: 6,
      ready: true,
      missing: [],
    });
  });
});

describe('completionScopeForPersistResult', () => {
  it('distinguishes durable onboarding progress from a browser-session attempt', () => {
    expect(completionScopeForPersistResult(true)).toBe('PERSISTED');
    expect(completionScopeForPersistResult(false)).toBe('LOCAL_SESSION');
  });
});

describe('validatePracticeRepair', () => {
  it('requires the field that the sample says is missing', () => {
    expect(validatePracticeRepair('MISSING_PARENT_SIGNATURE', '', 'Narrative')).toBe(
      'PRACTICE_ACKNOWLEDGMENT_REQUIRED'
    );
    expect(validatePracticeRepair('MISSING_SOAP_NOTE', 'Elena Miller', '   ')).toBe(
      'PRACTICE_NARRATIVE_REQUIRED'
    );
  });

  it('accepts a locally complete sample without implying a live claim', () => {
    expect(
      validatePracticeRepair(
        'MISSING_PARENT_SIGNATURE',
        'Elena Miller',
        'Fictional practice narrative'
      )
    ).toBeNull();
  });
});
