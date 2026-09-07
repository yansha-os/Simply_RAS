import { describe, expect, it } from 'vitest';

function calculateBacbSupervisionRatio(
  directMinutes97153: number,
  supervisionMinutes97155: number
): { ratio: number | null; isCompliant: boolean } {
  if (directMinutes97153 <= 0 && supervisionMinutes97155 <= 0) {
    return { ratio: null, isCompliant: false };
  }
  if (directMinutes97153 <= 0) {
    return { ratio: 100, isCompliant: true };
  }
  const ratio = (supervisionMinutes97155 / directMinutes97153) * 100;
  return {
    ratio,
    isCompliant: ratio >= 5.0,
  };
}

describe('BACB Supervision Ratio Calculator', () => {
  it('returns null when no session minutes exist', () => {
    const res = calculateBacbSupervisionRatio(0, 0);
    expect(res.ratio).toBeNull();
    expect(res.isCompliant).toBe(false);
  });

  it('marks ratio as non-compliant when supervision is below 5%', () => {
    // 2 hours supervision (120m) out of 50 hours direct (3000m) = 4%
    const res = calculateBacbSupervisionRatio(3000, 120);
    expect(res.ratio).toBe(4.0);
    expect(res.isCompliant).toBe(false);
  });

  it('marks ratio as compliant when supervision meets or exceeds 5%', () => {
    // 3 hours supervision (180m) out of 50 hours direct (3000m) = 6%
    const res = calculateBacbSupervisionRatio(3000, 180);
    expect(res.ratio).toBe(6.0);
    expect(res.isCompliant).toBe(true);
  });
});
