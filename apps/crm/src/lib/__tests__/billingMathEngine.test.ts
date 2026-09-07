import { describe, expect, it } from 'vitest';
import {
  calculateBillableUnits,
  validateMueDailyLimits,
  analyzePriorAuthBurnDown,
} from '../billingMathEngine';

describe('billingMathEngine', () => {
  describe('calculateBillableUnits', () => {
    describe('CMS 8-minute rule', () => {
      it('returns 0 units for under 8 minutes', () => {
        expect(calculateBillableUnits(0, 'CMS_8_MINUTE')).toBe(0);
        expect(calculateBillableUnits(7, 'CMS_8_MINUTE')).toBe(0);
      });

      it('calculates units across standard 8-minute boundaries', () => {
        expect(calculateBillableUnits(8, 'CMS_8_MINUTE')).toBe(1);
        expect(calculateBillableUnits(22, 'CMS_8_MINUTE')).toBe(1);
        expect(calculateBillableUnits(23, 'CMS_8_MINUTE')).toBe(2);
        expect(calculateBillableUnits(37, 'CMS_8_MINUTE')).toBe(2);
        expect(calculateBillableUnits(38, 'CMS_8_MINUTE')).toBe(3);
        expect(calculateBillableUnits(52, 'CMS_8_MINUTE')).toBe(3);
        expect(calculateBillableUnits(53, 'CMS_8_MINUTE')).toBe(4);
        expect(calculateBillableUnits(60, 'CMS_8_MINUTE')).toBe(4);
        expect(calculateBillableUnits(67, 'CMS_8_MINUTE')).toBe(4);
        expect(calculateBillableUnits(68, 'CMS_8_MINUTE')).toBe(5);
        expect(calculateBillableUnits(120, 'CMS_8_MINUTE')).toBe(8);
      });
    });

    describe('Medicaid strict 15-minute rule', () => {
      it('calculates units using ceiling intervals', () => {
        expect(calculateBillableUnits(1, 'MEDICAID_STRICT_15')).toBe(1);
        expect(calculateBillableUnits(15, 'MEDICAID_STRICT_15')).toBe(1);
        expect(calculateBillableUnits(16, 'MEDICAID_STRICT_15')).toBe(2);
        expect(calculateBillableUnits(30, 'MEDICAID_STRICT_15')).toBe(2);
        expect(calculateBillableUnits(31, 'MEDICAID_STRICT_15')).toBe(3);
      });
    });

    describe('Exact 15-minute floor', () => {
      it('calculates only completed 15-minute increments', () => {
        expect(calculateBillableUnits(14, 'EXACT_15_FLOOR')).toBe(0);
        expect(calculateBillableUnits(15, 'EXACT_15_FLOOR')).toBe(1);
        expect(calculateBillableUnits(29, 'EXACT_15_FLOOR')).toBe(1);
        expect(calculateBillableUnits(30, 'EXACT_15_FLOOR')).toBe(2);
      });
    });
  });

  describe('validateMueDailyLimits', () => {
    it('passes when within daily MUE limits', () => {
      // 97153 max is 32 units (8h)
      const res = validateMueDailyLimits('97153', 24);
      expect(res.isWithinLimit).toBe(true);
      expect(res.warning).toBeNull();
    });

    it('flags warning when exceeding MUE limit', () => {
      // 97155 max is 8 units (2h)
      const res = validateMueDailyLimits('97155', 10);
      expect(res.isWithinLimit).toBe(false);
      expect(res.exceededBy).toBe(2);
      expect(res.warning).toContain('exceeds MUE limit of 8 units');
    });
  });

  describe('analyzePriorAuthBurnDown', () => {
    const asOfDate = new Date('2026-08-19T00:00:00Z');

    it('evaluates healthy authorization status', () => {
      const res = analyzePriorAuthBurnDown({
        authorizedUnits: 1000,
        usedUnits: 200,
        weeklyScheduledUnits: 40,
        authEndDate: '2026-12-31T00:00:00Z',
        asOfDate,
      });

      expect(res.status).toBe('HEALTHY');
      expect(res.percentUsed).toBe(20.0);
      expect(res.remainingUnits).toBe(800);
      expect(res.isExpiringSoon).toBe(false);
      expect(res.isNearingLimit).toBe(false);
    });

    it('triggers REAUTH_DUE_UNITS when >= 80% used', () => {
      const res = analyzePriorAuthBurnDown({
        authorizedUnits: 1000,
        usedUnits: 850,
        weeklyScheduledUnits: 40,
        authEndDate: '2026-12-31T00:00:00Z',
        asOfDate,
      });

      expect(res.status).toBe('REAUTH_DUE_UNITS');
      expect(res.percentUsed).toBe(85.0);
      expect(res.isNearingLimit).toBe(true);
    });

    it('triggers REAUTH_DUE_DATE when expiring in <= 30 days', () => {
      const res = analyzePriorAuthBurnDown({
        authorizedUnits: 1000,
        usedUnits: 400,
        weeklyScheduledUnits: 40,
        authEndDate: '2026-09-05T00:00:00Z', // 17 days away
        asOfDate,
      });

      expect(res.status).toBe('REAUTH_DUE_DATE');
      expect(res.isExpiringSoon).toBe(true);
    });

    it('identifies EXPIRED and EXHAUSTED states', () => {
      const expired = analyzePriorAuthBurnDown({
        authorizedUnits: 1000,
        usedUnits: 500,
        weeklyScheduledUnits: 40,
        authEndDate: '2026-08-10T00:00:00Z', // past
        asOfDate,
      });
      expect(expired.status).toBe('EXPIRED');

      const exhausted = analyzePriorAuthBurnDown({
        authorizedUnits: 1000,
        usedUnits: 1000,
        weeklyScheduledUnits: 40,
        authEndDate: '2026-12-31T00:00:00Z',
        asOfDate,
      });
      expect(exhausted.status).toBe('EXHAUSTED');
    });

    describe('1% edge cases & defensive resilience', () => {
      it('handles NaN, negative, and non-finite duration in calculateBillableUnits', () => {
        expect(calculateBillableUnits(NaN, 'CMS_8_MINUTE')).toBe(0);
        expect(calculateBillableUnits(-15, 'CMS_8_MINUTE')).toBe(0);
        expect(calculateBillableUnits(Infinity, 'CMS_8_MINUTE')).toBe(0);
        expect(calculateBillableUnits(-0, 'CMS_8_MINUTE')).toBe(0);
      });

      it('handles invalid / empty authEndDate in analyzePriorAuthBurnDown without returning NaN', () => {
        const res = analyzePriorAuthBurnDown({
          authorizedUnits: 500,
          usedUnits: 100,
          weeklyScheduledUnits: 20,
          authEndDate: 'not-a-valid-date',
          asOfDate,
        });

        expect(res.status).toBe('EXPIRED');
        expect(Number.isFinite(res.daysUntilExpiration)).toBe(true);
        expect(res.daysUntilExpiration).toBe(0);
        expect(Number.isFinite(res.percentUsed)).toBe(true);
      });

      it('handles 0 authorized units without division by zero', () => {
        const res = analyzePriorAuthBurnDown({
          authorizedUnits: 0,
          usedUnits: 0,
          weeklyScheduledUnits: 10,
          authEndDate: '2026-12-31T00:00:00Z',
          asOfDate,
        });

        expect(res.percentUsed).toBe(0);
        expect(res.remainingUnits).toBe(0);
        expect(res.projectedExhaustionDate).toBeNull();
      });

      it('handles non-numeric or negative unit inputs in validateMueDailyLimits', () => {
        const res1 = validateMueDailyLimits('97153', NaN);
        expect(res1.isWithinLimit).toBe(true);
        expect(res1.exceededBy).toBe(0);

        const res2 = validateMueDailyLimits('unknown-code', 10);
        expect(res2.maxUnits).toBe(32);
        expect(res2.isWithinLimit).toBe(true);
      });
    });
  });
});
