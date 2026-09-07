import { describe, expect, it } from 'vitest';
import {
  evaluateTargetMastery,
  getPromptIndependenceScore,
  analyzeAbcBehaviorFunctions,
  type TargetTrialScore,
} from '../clinicalMasteryEngine';

describe('clinicalMasteryEngine', () => {
  describe('getPromptIndependenceScore', () => {
    it('returns 100 for IND and 0 for FULL_PHYSICAL', () => {
      expect(getPromptIndependenceScore('IND')).toBe(100);
      expect(getPromptIndependenceScore('VERBAL')).toBe(75);
      expect(getPromptIndependenceScore('GESTURAL')).toBe(50);
      expect(getPromptIndependenceScore('MODEL')).toBe(25);
      expect(getPromptIndependenceScore('PARTIAL_PHYSICAL')).toBe(10);
      expect(getPromptIndependenceScore('FULL_PHYSICAL')).toBe(0);
    });
  });

  describe('evaluateTargetMastery', () => {
    it('evaluates baseline when no sessions exist', () => {
      const res = evaluateTargetMastery([]);
      expect(res.currentPhase).toBe('BASELINE');
      expect(res.isMastered).toBe(false);
    });

    it('identifies mastery when 3 consecutive sessions meet 80% with 2 therapists', () => {
      const scores: TargetTrialScore[] = [
        {
          sessionId: 's1',
          sessionDate: '2026-08-01',
          totalTrials: 10,
          independentTrials: 6,
          promptedTrials: 2,
          incorrectTrials: 2,
          accuracyPercent: 60,
          therapistId: 't1',
        },
        {
          sessionId: 's2',
          sessionDate: '2026-08-03',
          totalTrials: 10,
          independentTrials: 8,
          promptedTrials: 1,
          incorrectTrials: 1,
          accuracyPercent: 80,
          therapistId: 't1',
        },
        {
          sessionId: 's3',
          sessionDate: '2026-08-05',
          totalTrials: 10,
          independentTrials: 9,
          promptedTrials: 1,
          incorrectTrials: 0,
          accuracyPercent: 90,
          therapistId: 't2',
        },
        {
          sessionId: 's4',
          sessionDate: '2026-08-07',
          totalTrials: 10,
          independentTrials: 10,
          promptedTrials: 0,
          incorrectTrials: 0,
          accuracyPercent: 100,
          therapistId: 't1',
        },
      ];

      const res = evaluateTargetMastery(scores, {
        requiredAccuracyPercent: 80,
        consecutiveSessionsRequired: 3,
        uniqueTherapistsRequired: 2,
      });

      expect(res.isMastered).toBe(true);
      expect(res.currentPhase).toBe('MASTERED');
      expect(res.consecutiveSessionsMet).toBe(3);
      expect(res.uniqueTherapistsCount).toBe(2);
      expect(res.trend).toBe('UPWARD');
    });

    it('requires generalization if 3 sessions met but with only 1 therapist', () => {
      const scores: TargetTrialScore[] = [
        {
          sessionId: 's1',
          sessionDate: '2026-08-01',
          totalTrials: 10,
          independentTrials: 9,
          promptedTrials: 1,
          incorrectTrials: 0,
          accuracyPercent: 90,
          therapistId: 't1',
        },
        {
          sessionId: 's2',
          sessionDate: '2026-08-03',
          totalTrials: 10,
          independentTrials: 9,
          promptedTrials: 1,
          incorrectTrials: 0,
          accuracyPercent: 90,
          therapistId: 't1',
        },
        {
          sessionId: 's3',
          sessionDate: '2026-08-05',
          totalTrials: 10,
          independentTrials: 9,
          promptedTrials: 1,
          incorrectTrials: 0,
          accuracyPercent: 90,
          therapistId: 't1',
        },
      ];

      const res = evaluateTargetMastery(scores, {
        requiredAccuracyPercent: 80,
        consecutiveSessionsRequired: 3,
        uniqueTherapistsRequired: 2,
      });

      expect(res.isMastered).toBe(false);
      expect(res.currentPhase).toBe('GENERALIZATION');
      expect(res.consecutiveSessionsMet).toBe(3);
      expect(res.uniqueTherapistsCount).toBe(1);
    });
  });

  describe('analyzeAbcBehaviorFunctions', () => {
    it('aggregates behavior functions accurately', () => {
      const incidents = [
        {
          antecedent: 'Demanded to clean up blocks',
          behavior: 'Tantrum and screaming',
          consequence: 'Allowed 2 minute break',
          perceivedFunction: 'ESCAPE',
        },
        {
          antecedent: 'Math worksheet presented',
          behavior: 'Swiped papers off table',
          consequence: 'Task delayed',
        },
        {
          antecedent: 'Therapist talking to parent',
          behavior: 'Climbing on bookshelf',
          consequence: 'Therapist provided verbal attention',
          perceivedFunction: 'ATTENTION',
        },
      ];

      const res = analyzeAbcBehaviorFunctions(incidents);
      expect(res.totalIncidents).toBe(3);
      expect(res.escapeCount).toBe(2);
      expect(res.attentionCount).toBe(1);
      expect(res.primaryHypothesizedFunction).toBe('ESCAPE');
      expect(res.escapePercent).toBe(66.7);
    });

    describe('1% edge cases & defensive resilience', () => {
      it('handles null, undefined, and non-array inputs in evaluateTargetMastery', () => {
        // @ts-expect-error Exercises the runtime guard against untyped external input.
        const res1 = evaluateTargetMastery(null);
        expect(res1.currentPhase).toBe('BASELINE');
        expect(res1.averageAccuracy).toBe(0);

        // @ts-expect-error Exercises the runtime guard against untyped external input.
        const res2 = evaluateTargetMastery(undefined);
        expect(res2.isMastered).toBe(false);
      });

      it('handles sessions with NaN accuracy and missing therapistId', () => {
        const scores: TargetTrialScore[] = [
          {
            sessionId: 's1',
            sessionDate: '2026-08-01',
            totalTrials: 0,
            independentTrials: 0,
            promptedTrials: 0,
            incorrectTrials: 0,
            accuracyPercent: NaN,
            therapistId: '',
          },
        ];

        const res = evaluateTargetMastery(scores);
        expect(Number.isFinite(res.averageAccuracy)).toBe(true);
        expect(res.isMastered).toBe(false);
      });

      it('handles empty / malformed / null array in analyzeAbcBehaviorFunctions', () => {
        const res1 = analyzeAbcBehaviorFunctions([]);
        expect(res1.totalIncidents).toBe(0);
        expect(res1.primaryHypothesizedFunction).toBe('UNDETERMINED');

        // @ts-expect-error Exercises the runtime guard against untyped external input.
        const res2 = analyzeAbcBehaviorFunctions(null);
        expect(res2.totalIncidents).toBe(0);

        const res3 = analyzeAbcBehaviorFunctions([
          { antecedent: '', behavior: '', consequence: '' },
          // @ts-expect-error Exercises filtering of a malformed array member.
          null,
        ]);
        expect(res3.totalIncidents).toBe(1);
      });
    });
  });
});
