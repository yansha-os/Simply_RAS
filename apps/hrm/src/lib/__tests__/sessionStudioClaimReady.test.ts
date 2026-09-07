import { describe, expect, it } from 'vitest';

import {
  assertClaimReadyForSubmit,
  evaluateClaimReady,
  type ClaimReadyEvalInput,
} from '../sessionStudioClaimReady';

/** Fully claim-ready 97153 note — each test knocks out one field. */
function completeInput(overrides: Partial<ClaimReadyEvalInput> = {}): ClaimReadyEvalInput {
  return {
    clockedIn: true,
    clockedOut: true,
    cptCode: '97153',
    placeOfService: '12',
    caregiverPresent: 'YES',
    caregiverName: 'Maria Lopez',
    caregiverParticipation:
      'Caregiver observed manding trials, practiced prompt fading with coaching, and reviewed carryover plan.',
    goalsAddressed: 'Manding; tacting colors',
    trials: [
      {
        id: 'trial-1',
        targetId: '4f7c1a2e-9d3b-4e5f-8a6c-112233445566',
        targetLabel: 'Mands for preferred item',
        response: 'CORRECT',
        at: '2026-08-12T10:05:00.000Z',
      },
    ],
    objectiveData:
      'Manding: 8/10 independent (80%), tacting colors: 5/8 prompted at gestural level.',
    interventions: ['DTT'],
    clientResponse:
      'Client responded to differential reinforcement with 80% independent mands across 10 trials, with reduced latency after prompt fading from gestural to independent.',
    barriersSafety: 'None noted.',
    planNext:
      'Continue manding targets with prompt fade to independent; introduce two new tacting targets; probe maintenance on mastered items.',
    rbtSignature: 'Riley Tran, RBT',
    caregiverSignature: 'Maria Lopez',
    sessionSeconds: 60 * 60, // 60 min → 4 units
    ...overrides,
  };
}

describe('evaluateClaimReady — hard blocks', () => {
  it('is claim-ready when every SoT minimum is met', () => {
    const result = evaluateClaimReady(completeInput());
    expect(result.blocks).toEqual([]);
    expect(result.claimReady).toBe(true);
    expect(result.readyCount).toBe(result.totalCount);
  });

  it('blocks when session is too short for a billable unit (8-min rule)', () => {
    const result = evaluateClaimReady(completeInput({ sessionSeconds: 5 * 60 }));
    expect(result.claimReady).toBe(false);
    expect(result.blocks.map((b) => b.key)).toContain('UNITS');
  });

  it('blocks when not clocked out (EVV times incomplete)', () => {
    const result = evaluateClaimReady(completeInput({ clockedOut: false }));
    expect(result.claimReady).toBe(false);
    expect(result.blocks.map((b) => b.key)).toContain('SESSION_TIME');
  });

  it('blocks when caregiver is present but unnamed', () => {
    const result = evaluateClaimReady(completeInput({ caregiverName: '' }));
    expect(result.claimReady).toBe(false);
    expect(result.blocks.map((b) => b.key)).toContain('PERSONS_PRESENT');
  });

  it('accepts caregiver NO without a name', () => {
    const result = evaluateClaimReady(
      completeInput({
        caregiverPresent: 'NO',
        caregiverName: '',
        caregiverParticipation: '',
      }),
    );
    expect(result.blocks.map((b) => b.key)).not.toContain('PERSONS_PRESENT');
    expect(result.blocks.map((b) => b.key)).not.toContain('CAREGIVER_DEBRIEF');
  });

  it('blocks vague-only client response even past the character floor', () => {
    const result = evaluateClaimReady(
      completeInput({
        clientResponse: 'Good session good session good session good session!!',
      }),
    );
    expect(result.claimReady).toBe(false);
    expect(result.blocks.map((b) => b.key)).toContain('CLIENT_RESPONSE');
  });

  it('blocks when only demo t#/b# targets were collected', () => {
    const result = evaluateClaimReady(
      completeInput({
        trials: [
          {
            id: 'trial-1',
            targetId: 't1',
            targetLabel: 'Demo target',
            response: 'CORRECT',
            at: '2026-08-12T10:05:00.000Z',
          },
        ],
      }),
    );
    expect(result.claimReady).toBe(false);
    expect(result.blocks.map((b) => b.key)).toContain('DURABLE_TARGETS');
  });

  it('blocks missing signatures', () => {
    const result = evaluateClaimReady(
      completeInput({ rbtSignature: '', caregiverSignature: '' }),
    );
    const keys = result.blocks.map((b) => b.key);
    expect(keys).toContain('RBT_SIGN');
    expect(keys).toContain('CAREGIVER_SIGN');
  });

  it('blocks when no objective datum was collected', () => {
    const result = evaluateClaimReady(completeInput({ trials: [] }));
    expect(result.claimReady).toBe(false);
    expect(result.blocks.map((b) => b.key)).toContain('GOALS_DATA');
  });
});

describe('evaluateClaimReady — soft warnings', () => {
  it('missing goals label warns but does not block', () => {
    const result = evaluateClaimReady(completeInput({ goalsAddressed: '' }));
    expect(result.claimReady).toBe(true);
    expect(result.blocks).toEqual([]);
    expect(result.warnings.map((w) => w.key)).toContain('GOALS_LABEL');
  });
});

describe('assertClaimReadyForSubmit', () => {
  it('accepts a complete note', () => {
    const res = assertClaimReadyForSubmit(completeInput());
    expect(res.ok).toBe(true);
  });

  it('rejects an incomplete note with missing keys and a readable error', () => {
    const res = assertClaimReadyForSubmit(
      completeInput({ rbtSignature: '', planNext: '' }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.missingKeys).toContain('RBT_SIGN');
      expect(res.missingKeys).toContain('PLAN_NEXT');
      expect(res.error).toContain('not claim-ready');
    }
  });

  describe('1% edge cases & defensive resilience', () => {
    it('handles undefined/null trials, probes, interventions safely', () => {
      const malformedInput = {
        ...completeInput(),
        trials: undefined,
        probes: undefined,
        interventions: undefined,
        frequencies: undefined,
        durations: undefined,
        taskAnalyses: undefined,
      } as unknown as ClaimReadyEvalInput;
      const res = evaluateClaimReady(malformedInput);
      expect(res.claimReady).toBe(false);
      expect(Array.isArray(res.blocks)).toBe(true);
    });

    it('handles NaN/negative sessionSeconds safely', () => {
      const res1 = evaluateClaimReady(completeInput({ sessionSeconds: NaN }));
      expect(res1.claimReady).toBe(false);

      const res2 = evaluateClaimReady(completeInput({ sessionSeconds: -500 }));
      expect(res2.claimReady).toBe(false);
    });
  });
});
