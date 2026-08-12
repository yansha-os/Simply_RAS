import { describe, expect, it } from 'vitest';

import {
  calculateBillingUnits,
  generateX12_837P_Payload,
  type ClaimHeaderInput,
} from '../edi837Generator';

describe('calculateBillingUnits — MEDICAID_8_MIN (audit H2)', () => {
  it('returns 0 below the 8-minute floor', () => {
    expect(calculateBillingUnits(0, 'MEDICAID_8_MIN')).toBe(0);
    expect(calculateBillingUnits(7, 'MEDICAID_8_MIN')).toBe(0);
  });

  it('matches the CMS tier table at every documented boundary', () => {
    // tier: [minMinutes, maxMinutes, units]
    const tiers: Array<[number, number, number]> = [
      [8, 22, 1],
      [23, 37, 2],
      [38, 52, 3],
      [53, 67, 4],
      [68, 82, 5],
      [83, 97, 6],
    ];
    for (const [lo, hi, units] of tiers) {
      expect(calculateBillingUnits(lo, 'MEDICAID_8_MIN')).toBe(units);
      expect(calculateBillingUnits(hi, 'MEDICAID_8_MIN')).toBe(units);
    }
  });

  it('keeps counting past 97 minutes (regression: 98–104 min undercounted to 6)', () => {
    expect(calculateBillingUnits(97, 'MEDICAID_8_MIN')).toBe(6);
    expect(calculateBillingUnits(98, 'MEDICAID_8_MIN')).toBe(7);
    expect(calculateBillingUnits(104, 'MEDICAID_8_MIN')).toBe(7);
    expect(calculateBillingUnits(105, 'MEDICAID_8_MIN')).toBe(7);
    expect(calculateBillingUnits(112, 'MEDICAID_8_MIN')).toBe(7);
    expect(calculateBillingUnits(113, 'MEDICAID_8_MIN')).toBe(8);
  });

  it('agrees with the HRM closed form floor((min + 7) / 15) for all durations', () => {
    for (let minutes = 8; minutes <= 600; minutes++) {
      expect(calculateBillingUnits(minutes, 'MEDICAID_8_MIN')).toBe(
        Math.floor((minutes + 7) / 15)
      );
    }
  });
});

describe('calculateBillingUnits — STRICT_15_MIN', () => {
  it('floors to full 15-minute units with no rounding up', () => {
    expect(calculateBillingUnits(14, 'STRICT_15_MIN')).toBe(0);
    expect(calculateBillingUnits(15, 'STRICT_15_MIN')).toBe(1);
    expect(calculateBillingUnits(29, 'STRICT_15_MIN')).toBe(1);
    expect(calculateBillingUnits(30, 'STRICT_15_MIN')).toBe(2);
    expect(calculateBillingUnits(98, 'STRICT_15_MIN')).toBe(6);
  });
});

describe('generateX12_837P_Payload uses the corrected unit math', () => {
  const header = (durationMinutes: number): ClaimHeaderInput => ({
    claimId: 'TEST-1',
    patientFirstName: 'Test',
    patientLastName: 'Patient',
    memberId: 'MEM123',
    payerName: 'Test Payer',
    renderingProviderNpi: '1234567890',
    renderingProviderName: 'Test RBT',
    serviceDate: '2026-08-12',
    lines: [
      {
        cptCode: '97153',
        modifier: 'HN',
        durationMinutes,
        payerRules: 'MEDICAID_8_MIN',
        ratePerUnit: 20,
      },
    ],
  });

  it('bills 7 units (not 6) for a 98-minute Medicaid line', () => {
    const result = generateX12_837P_Payload(header(98));
    expect(result.totalUnits).toBe(7);
    expect(result.totalBilledAmount).toBe(140);
    expect(result.rawEdiText).toContain('SV1*HC:97153:HN*140.00*UN*7');
  });
});
