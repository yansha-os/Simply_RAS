import { describe, expect, it } from 'vitest';
import {
  normalizeGuardianName,
  resolveExpectedGuardianName,
  validateParentTreatmentPlanSign,
  buildParentPlanReviewSummary,
} from '../parentTreatmentPlanSign';

describe('parentTreatmentPlanSign', () => {
  describe('normalizeGuardianName', () => {
    it('normalizes casing and multiple spaces', () => {
      expect(normalizeGuardianName('  Jane   Doe  ')).toBe('jane doe');
    });

    it('handles non-string / null / undefined safely', () => {
      expect(normalizeGuardianName(null)).toBe('');
      expect(normalizeGuardianName(undefined)).toBe('');
      expect(normalizeGuardianName(123)).toBe('');
    });
  });

  describe('resolveExpectedGuardianName', () => {
    it('prefers client guardian name', () => {
      const res = resolveExpectedGuardianName({
        guardianName: 'Sarah Connor',
        formData: { g1Name: 'Other Name' },
      });
      expect(res).toBe('Sarah Connor');
    });

    it('falls back to packet formData.g1Name', () => {
      const res = resolveExpectedGuardianName({
        guardianName: '',
        formData: { g1Name: 'John Connor' },
      });
      expect(res).toBe('John Connor');
    });

    it('handles stringified json formData', () => {
      const res = resolveExpectedGuardianName({
        guardianName: null,
        formData: JSON.stringify({ g1Name: 'Kyle Reese' }),
      });
      expect(res).toBe('Kyle Reese');
    });

    it('returns null on empty/invalid inputs', () => {
      expect(resolveExpectedGuardianName({})).toBeNull();
      expect(resolveExpectedGuardianName({ formData: 'invalid json' })).toBeNull();
    });
  });

  describe('validateParentTreatmentPlanSign', () => {
    it('validates matching guardian signature when plan is reviewed', () => {
      const res = validateParentTreatmentPlanSign({
        parentSignatureName: 'Jane Doe',
        planReviewed: true,
        expectedGuardianName: 'jane doe',
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.nameMatched).toBe(true);
      }
    });

    it('flags name mismatch when signed name differs from record', () => {
      const res = validateParentTreatmentPlanSign({
        parentSignatureName: 'John Doe',
        planReviewed: true,
        expectedGuardianName: 'Jane Doe',
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.nameMatched).toBe(false);
      }
    });

    it('rejects when plan has not been reviewed', () => {
      const res = validateParentTreatmentPlanSign({
        parentSignatureName: 'Jane Doe',
        planReviewed: false,
        expectedGuardianName: 'Jane Doe',
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe('NOT_REVIEWED');
      }
    });

    it('rejects when signature name is empty or whitespace', () => {
      const res = validateParentTreatmentPlanSign({
        parentSignatureName: '   ',
        planReviewed: true,
        expectedGuardianName: 'Jane Doe',
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe('EMPTY_NAME');
      }
    });

    it('rejects when expected guardian name is missing', () => {
      const res = validateParentTreatmentPlanSign({
        parentSignatureName: 'Jane Doe',
        planReviewed: true,
        expectedGuardianName: '',
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe('NO_GUARDIAN');
      }
    });
  });

  describe('buildParentPlanReviewSummary', () => {
    it('extracts hours and goal summaries defensively', () => {
      const plan = {
        hours97153: 15,
        hours97155: 2,
        hours97156: 1,
        primaryLocations: ['Home', 'Clinic'],
        crisisPlan: 'Contact supervisor immediately',
        skillGoals: [{ domain: 'Communication', description: 'Manding for items', mastery: '80%' }],
        parentGoals: [{ description: 'Carryover routines', mastery: '100%', baseline: '0%' }],
        brp: [{ behavior: 'Aggression', topography: 'Hitting', function: 'Escape', ferb: 'Break request' }],
      };

      const summary = buildParentPlanReviewSummary(plan);
      expect(summary.hours97153).toBe(15);
      expect(summary.hours97155).toBe(2);
      expect(summary.hours97156).toBe(1);
      expect(summary.primaryLocations).toEqual(['Home', 'Clinic']);
      expect(summary.crisisPlan).toBe('Contact supervisor immediately');
      expect(summary.goals.length).toBe(3);
    });

    it('handles NaN hours and malformed arrays gracefully', () => {
      const summary = buildParentPlanReviewSummary({
        hours97153: NaN,
        hours97155: 'not a number',
        skillGoals: null,
      });

      expect(Number.isFinite(summary.hours97153)).toBe(true);
      expect(summary.hours97153).toBe(0);
      expect(summary.hours97155).toBe(0);
      expect(summary.goals).toEqual([]);
    });
  });
});
