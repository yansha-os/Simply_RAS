import { describe, expect, it } from 'vitest';
import {
  evaluateSupervisionRatio,
  getDaysRemainingInMonth,
} from '../supervisionCompliance';

describe('supervisionCompliance', () => {
  describe('evaluateSupervisionRatio', () => {
    it('returns compliant with NO_DIRECT_HOURS when 0 direct minutes', () => {
      const res = evaluateSupervisionRatio(0, 0);
      expect(res.ratio).toBeNull();
      expect(res.isCompliant).toBe(true);
      expect(res.status).toBe('NO_DIRECT_HOURS');
      expect(res.hoursNeeded).toBe(0);
    });

    it('handles 100% compliance when direct minutes is 0 but supervision minutes is positive', () => {
      const res = evaluateSupervisionRatio(0, 60);
      expect(res.ratio).toBe(100.0);
      expect(res.isCompliant).toBe(true);
      expect(res.status).toBe('COMPLIANT');
      expect(res.hoursNeeded).toBe(0);
    });

    it('handles NaN and negative values defensively', () => {
      const res1 = evaluateSupervisionRatio(NaN, NaN);
      expect(res1.status).toBe('NO_DIRECT_HOURS');
      expect(res1.isCompliant).toBe(true);

      const res2 = evaluateSupervisionRatio(-100, -50);
      expect(res2.status).toBe('NO_DIRECT_HOURS');
      expect(res2.isCompliant).toBe(true);
    });

    it('returns critical when supervision is below 5%', () => {
      // 100 hours direct (6000m), 3 hours supervision (180m) = 3%
      const res = evaluateSupervisionRatio(6000, 180);
      expect(res.ratio).toBe(3.0);
      expect(res.isCompliant).toBe(false);
      expect(res.status).toBe('CRITICAL');
      // Needs 5 hours total (300m) -> 120m needed = 2.0 hours
      expect(res.hoursNeeded).toBe(2.0);
    });

    it('returns warning when supervision is between 5% and 7%', () => {
      // 100 hours direct (6000m), 6 hours supervision (360m) = 6%
      const res = evaluateSupervisionRatio(6000, 360);
      expect(res.ratio).toBe(6.0);
      expect(res.isCompliant).toBe(true);
      expect(res.status).toBe('WARNING');
      expect(res.hoursNeeded).toBe(0);
    });

    it('returns compliant when supervision meets or exceeds 7%', () => {
      // 100 hours direct (6000m), 10 hours supervision (600m) = 10%
      const res = evaluateSupervisionRatio(6000, 600);
      expect(res.ratio).toBe(10.0);
      expect(res.isCompliant).toBe(true);
      expect(res.status).toBe('COMPLIANT');
      expect(res.hoursNeeded).toBe(0);
    });
  });

  describe('getDaysRemainingInMonth', () => {
    it('computes days remaining correctly', () => {
      // As of August 19 in August (31 days)
      const asOf = new Date(2026, 7, 19); // month index 7 = August
      const remaining = getDaysRemainingInMonth(2026, 8, asOf);
      expect(remaining).toBe(12); // 31 - 19 = 12
    });

    it('handles out-of-range month or invalid date safely', () => {
      const remaining1 = getDaysRemainingInMonth(2026, 13);
      expect(Number.isFinite(remaining1)).toBe(true);
      expect(remaining1).toBeGreaterThanOrEqual(0);

      // @ts-expect-error Exercises the runtime guard against untyped external input.
      const remaining2 = getDaysRemainingInMonth(NaN, NaN, 'invalid-date');
      expect(Number.isFinite(remaining2)).toBe(true);
      expect(remaining2).toBeGreaterThanOrEqual(0);
    });
  });
});
