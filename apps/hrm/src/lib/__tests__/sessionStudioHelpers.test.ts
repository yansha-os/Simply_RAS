import { describe, expect, it } from 'vitest';

import {
  buildChecklistSnapshot,
  buildModalitiesSnapshot,
  buildTrialModalityBlocks,
  hasObjectiveDatum,
  isDemoStudioTargetId,
  narrativeHasVaguePhrase,
  parsePlaceOfService,
  passesCaregiverParticipationQuality,
  passesClientResponseQuality,
  passesPlanNextQuality,
  summarizeProgress,
  taPercentIndependent,
  type BillingCheckItem,
  type StudioTaStep,
  type StudioTrial,
} from '../sessionStudio';
import * as sessionStudio from '../sessionStudio';

type BillingFactsResult =
  | {
      ok: true;
      cptCode: '97153';
      placeOfService: { code: string; label: string; display: string };
    }
  | {
      ok: false;
      code: string;
      error: string;
    };

type ResolveRbtStudioBillingFacts = (input: {
  persistedCptCode: string | null | undefined;
  persistedPlaceOfServiceCode: string | null | undefined;
  persistedLocation: string | null | undefined;
  proposedCptCode?: string | null;
  proposedPlaceOfService?: string | null;
}) => BillingFactsResult;

function billingFactsResolver(): ResolveRbtStudioBillingFacts {
  const resolver = (
    sessionStudio as typeof sessionStudio & {
      resolveRbtStudioBillingFacts?: ResolveRbtStudioBillingFacts;
    }
  ).resolveRbtStudioBillingFacts;
  expect(resolver).toBeTypeOf('function');
  return resolver!;
}

function trial(overrides: Partial<StudioTrial> = {}): StudioTrial {
  return {
    id: 'tr-1',
    targetId: 't-uuid',
    targetLabel: 'Mand',
    response: 'CORRECT',
    at: '2026-08-12T15:00:00Z',
    ...overrides,
  };
}

describe('taPercentIndependent', () => {
  it('scores only INDEPENDENT/PROMPTED steps, ignoring NOT_RUN and INCORRECT in the denominator only when unscored', () => {
    const steps: StudioTaStep[] = [
      { order: 1, instruction: 'a', status: 'INDEPENDENT' },
      { order: 2, instruction: 'b', status: 'INDEPENDENT' },
      { order: 3, instruction: 'c', status: 'PROMPTED' },
      { order: 4, instruction: 'd', status: 'NOT_RUN' },
    ];
    expect(taPercentIndependent(steps)).toBe(67);
  });

  it('returns 0 when nothing was scored', () => {
    expect(taPercentIndependent([])).toBe(0);
    expect(
      taPercentIndependent([{ order: 1, instruction: 'a', status: 'NOT_RUN' }])
    ).toBe(0);
  });
});

describe('hasObjectiveDatum (SoT §5)', () => {
  it('accepts any single modality as an objective datum', () => {
    expect(hasObjectiveDatum({ trials: [trial()] })).toBe(true);
    expect(
      hasObjectiveDatum({
        trials: [],
        frequencies: [{ id: 'f', behaviorName: 'Hits', count: 1, at: '' }],
      })
    ).toBe(true);
    expect(
      hasObjectiveDatum({
        trials: [],
        durations: [{ id: 'd', behaviorName: 'Flop', seconds: 30, at: '' }],
      })
    ).toBe(true);
    expect(
      hasObjectiveDatum({
        trials: [],
        probes: [{ id: 'p', targetLabel: 'Colors', result: 'CORRECT', at: '' }],
      })
    ).toBe(true);
  });

  it('rejects zero-count frequencies and unscored task analyses', () => {
    expect(
      hasObjectiveDatum({
        trials: [],
        frequencies: [{ id: 'f', behaviorName: 'Hits', count: 0, at: '' }],
        taskAnalyses: [
          {
            id: 'ta',
            targetLabel: 'Handwash',
            chainType: 'TOTAL_TASK',
            steps: [
              { order: 1, instruction: 'a', status: 'NOT_RUN' },
              { order: 2, instruction: 'b', status: 'INCORRECT' },
            ],
            at: '',
          },
        ],
      })
    ).toBe(false);
    expect(hasObjectiveDatum({ trials: [] })).toBe(false);
  });
});

describe('narrative quality gates (SoT §4.2 / §4.4)', () => {
  it('flags vague boilerplate phrases case-insensitively', () => {
    expect(narrativeHasVaguePhrase('Overall a Good Session today')).toBe(true);
    expect(narrativeHasVaguePhrase('nothing to report')).toBe(true);
    expect(narrativeHasVaguePhrase('Client emitted 4 independent mands')).toBe(false);
  });

  it('rejects a client response that clears the length floor with vague padding only', () => {
    const vague = 'Good session, went well, nothing to report today at all.';
    expect(vague.length).toBeGreaterThanOrEqual(40);
    expect(passesClientResponseQuality(vague)).toBe(false);
  });

  it('accepts a substantive client response of 40+ chars', () => {
    expect(
      passesClientResponseQuality(
        'Client required verbal prompts on 2 of 6 mand trials and self-corrected once.'
      )
    ).toBe(true);
    expect(passesClientResponseQuality('too short')).toBe(false);
  });

  it('holds plan-next to a 20-char substantive bar', () => {
    expect(passesPlanNextQuality('Fade to gestural prompts on mand targets.')).toBe(true);
    expect(passesPlanNextQuality('went well')).toBe(false);
  });

  it('requires a caregiver narrative only when the caregiver was present', () => {
    expect(passesCaregiverParticipationQuality('NO', '')).toBe(true);
    expect(passesCaregiverParticipationQuality('', '')).toBe(true);
    expect(passesCaregiverParticipationQuality('YES', 'brief')).toBe(false);
    expect(
      passesCaregiverParticipationQuality('YES', 'Modeled prompt fading with mom; reviewed carryover.')
    ).toBe(true);
  });
});

describe('parsePlaceOfService', () => {
  it('parses explicit CMS-code strings', () => {
    expect(parsePlaceOfService('12 - Home')).toEqual({ code: '12', label: 'Home', display: '12 - Home' });
    expect(parsePlaceOfService('03')).toEqual({ code: '03', label: 'School', display: '03 - School' });
    expect(parsePlaceOfService('11 -')).toEqual({ code: '11', label: 'Clinic', display: '11 - Clinic' });
  });

  it('infers codes from free text and defaults to 12 - Home', () => {
    expect(parsePlaceOfService('Client home').code).toBe('12');
    expect(parsePlaceOfService('at School').code).toBe('03');
    expect(parsePlaceOfService('office visit').code).toBe('11');
    expect(parsePlaceOfService('')).toEqual({ code: '12', label: 'Home', display: '12 - Home' });
    expect(parsePlaceOfService('Community park')).toEqual({
      code: '12',
      label: 'Community park',
      display: '12 - Community park',
    });
  });
});

describe('RBT Studio durable CPT / POS authority', () => {
  it('returns normalized note facts only from the persisted Session', () => {
    const result = billingFactsResolver()({
      persistedCptCode: '97153',
      persistedPlaceOfServiceCode: '12',
      persistedLocation: '12 - Home Session',
      proposedCptCode: '97153',
      proposedPlaceOfService: '12 - Home',
    });

    expect(result).toEqual({
      ok: true,
      cptCode: '97153',
      placeOfService: {
        code: '12',
        label: 'Home Session',
        display: '12 - Home Session',
      },
    });
  });

  it('rejects a forged client CPT instead of overriding the persisted code', () => {
    const result = billingFactsResolver()({
      persistedCptCode: '97153',
      persistedPlaceOfServiceCode: '12',
      persistedLocation: '12 - Home',
      proposedCptCode: '97155',
      proposedPlaceOfService: '12 - Home',
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'SESSION_CPT_MISMATCH',
    });
  });

  it('routes persisted 97155 to the qualified-clinician workflow', () => {
    const result = billingFactsResolver()({
      persistedCptCode: '97155',
      persistedPlaceOfServiceCode: '11',
      persistedLocation: '11 - Clinic',
      proposedCptCode: '97155',
      proposedPlaceOfService: '11 - Clinic',
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'QUALIFIED_CLINICIAN_WORKFLOW_REQUIRED',
    });
    if (!result.ok) {
      expect(result.error).toMatch(/qualified clinician|BCBA/i);
    }
  });

  it.each([
    {
      name: 'missing CPT',
      persistedCptCode: null,
      persistedPlaceOfServiceCode: '12',
      persistedLocation: '12 - Home',
      code: 'SESSION_CPT_MISSING',
    },
    {
      name: 'unknown CPT',
      persistedCptCode: '99999',
      persistedPlaceOfServiceCode: '12',
      persistedLocation: '12 - Home',
      code: 'SESSION_CPT_UNSUPPORTED',
    },
    {
      name: 'missing POS',
      persistedCptCode: '97153',
      persistedPlaceOfServiceCode: null,
      persistedLocation: '12 - Home',
      code: 'SESSION_POS_MISSING',
    },
    {
      name: 'unknown POS',
      persistedCptCode: '97153',
      persistedPlaceOfServiceCode: '88',
      persistedLocation: '88 - Unknown',
      code: 'SESSION_POS_UNSUPPORTED',
    },
    {
      name: 'inconsistent POS',
      persistedCptCode: '97153',
      persistedPlaceOfServiceCode: '12',
      persistedLocation: '03 - School',
      code: 'SESSION_POS_INCONSISTENT',
    },
  ])('fails closed for $name', (entry) => {
    const result = billingFactsResolver()({
      persistedCptCode: entry.persistedCptCode,
      persistedPlaceOfServiceCode: entry.persistedPlaceOfServiceCode,
      persistedLocation: entry.persistedLocation,
    });

    expect(result).toMatchObject({ ok: false, code: entry.code });
    if (!result.ok) {
      expect(result.error).toMatch(/manual review|Operations|Clinical/i);
    }
  });
});

describe('isDemoStudioTargetId', () => {
  it('matches only short demo ids like t1 / b12', () => {
    expect(isDemoStudioTargetId('t1')).toBe(true);
    expect(isDemoStudioTargetId('b12')).toBe(true);
    expect(isDemoStudioTargetId(' T3 ')).toBe(true);
    expect(isDemoStudioTargetId('x1')).toBe(false);
    expect(isDemoStudioTargetId('t')).toBe(false);
    expect(isDemoStudioTargetId('123e4567-e89b-42d3-a456-426614174000')).toBe(false);
    expect(isDemoStudioTargetId('')).toBe(false);
    expect(isDemoStudioTargetId(null)).toBe(false);
    expect(isDemoStudioTargetId(undefined)).toBe(false);
  });
});

describe('summarizeProgress', () => {
  it('returns empty string for no trials', () => {
    expect(summarizeProgress([])).toBe('');
  });

  it('groups trials per target with independence percentage', () => {
    const text = summarizeProgress([
      trial(),
      trial({ id: 'tr-2', response: 'PROMPTED' }),
      trial({ id: 'tr-3', response: 'INCORRECT' }),
      trial({ id: 'tr-4', targetLabel: 'Listener', response: 'CORRECT' }),
    ]);
    expect(text).toContain('Mand: 1 independent / 1 prompted / 1 incorrect (33% independent, n=3).');
    expect(text).toContain('Listener: 1 independent / 0 prompted / 0 incorrect (100% independent, n=1).');
  });
});

describe('buildTrialModalityBlocks', () => {
  it('groups by target, indexes trials, maps scores, and defaults prompt levels', () => {
    const blocks = buildTrialModalityBlocks([
      { targetId: 'a', targetLabel: 'Mand', response: 'CORRECT', at: '1' },
      { targetId: 'a', targetLabel: 'Mand', response: 'PROMPTED', at: '2' },
      { targetId: 'a', targetLabel: 'Mand', response: 'INCORRECT', at: '3' },
      { targetId: 'b', targetLabel: 'Tact', response: 'CORRECT', promptLevel: 'Gestural', at: '4' },
    ]);
    expect(blocks).toHaveLength(2);
    const mand = blocks.find((b) => b.targetLabel === 'Mand')!;
    expect(mand.trials.map((t) => t.trialIndex)).toEqual([1, 2, 3]);
    expect(mand.trials.map((t) => t.score)).toEqual(['+', 'P', '-']);
    expect(mand.trials[0].promptLevel).toBe('Independent');
    expect(mand.trials[1].promptLevel).toBe('Verbal');
    expect(mand.trials[2].promptLevel).toBeUndefined();
    expect(mand.summary).toEqual({ correct: 1, prompted: 1, incorrect: 1, percentIndependent: 33 });
    const tact = blocks.find((b) => b.targetLabel === 'Tact')!;
    expect(tact.trials[0].promptLevel).toBe('Gestural');
  });
});

describe('buildModalitiesSnapshot', () => {
  it('filters zero-count frequencies and computes rate per hour', () => {
    const snap = buildModalitiesSnapshot({
      trials: [],
      frequencies: [
        { id: 'f1', behaviorName: 'Hits', count: 10, observationMinutes: 30, at: '' },
        { id: 'f2', behaviorName: 'Kicks', count: 0, at: '' },
      ],
    });
    expect(snap.frequency).toHaveLength(1);
    expect(snap.frequency[0].ratePerHour).toBe(20);
  });

  it('groups duration episodes per behavior with a total', () => {
    const snap = buildModalitiesSnapshot({
      trials: [],
      durations: [
        { id: 'd1', behaviorName: 'Flop', seconds: 30, at: '1' },
        { id: 'd2', behaviorName: 'Flop', seconds: 45, at: '2' },
        { id: 'd3', behaviorName: 'Scream', seconds: 10, at: '3' },
      ],
    });
    expect(snap.duration).toHaveLength(2);
    const flop = snap.duration.find((d) => d.behaviorName === 'Flop')!;
    expect(flop.episodes).toHaveLength(2);
    expect(flop.totalSeconds).toBe(75);
  });

  it('drops task analyses with no scored steps and defaults ABC fields', () => {
    const snap = buildModalitiesSnapshot({
      trials: [],
      taskAnalyses: [
        {
          id: 'ta1',
          targetLabel: 'Handwash',
          chainType: 'FORWARD',
          steps: [{ order: 1, instruction: 'a', status: 'NOT_RUN' }],
          at: '',
        },
      ],
      abcEvents: [{ antecedent: 'Demand', behavior: 'Flop', consequence: 'Redirect' }],
    });
    expect(snap.taskAnalysis).toHaveLength(0);
    expect(snap.abcEvents[0].durationSeconds).toBe(0);
    expect(snap.abcEvents[0].behaviorTargetId).toBeNull();
  });
});

describe('buildChecklistSnapshot', () => {
  const items: BillingCheckItem[] = [
    { key: 'SESSION_TIME', label: 'Time', hint: '', standard: 'BOTH', ok: true },
    { key: 'UNITS', label: 'Units', hint: '', standard: 'MEDICAID', ok: true },
  ];

  it('passes only when every item is ok, with a stable timestamp', () => {
    const snap = buildChecklistSnapshot(items, '2026-08-12T15:00:00.000Z');
    expect(snap.passed).toBe(true);
    expect(snap.checkedAt).toBe('2026-08-12T15:00:00.000Z');
    expect(snap.items).toEqual([
      { key: 'SESSION_TIME', label: 'Time', standard: 'BOTH', ok: true },
      { key: 'UNITS', label: 'Units', standard: 'MEDICAID', ok: true },
    ]);
  });

  it('fails when any item is not ok', () => {
    const snap = buildChecklistSnapshot([items[0], { ...items[1], ok: false }]);
    expect(snap.passed).toBe(false);
  });
});
