import { describe, expect, it } from 'vitest';

import {
  estimateCommute,
  extractZipFromAddress,
  formatZipRoute,
  normalizeZip,
  scoreJobMatch,
  zipMatchLabel,
  type MatchInput,
} from '../jobBoardMatching';

describe('normalizeZip', () => {
  it('accepts 5-digit zips and strips ZIP+4 extensions', () => {
    expect(normalizeZip('11372')).toBe('11372');
    expect(normalizeZip('11372-1234')).toBe('11372');
    expect(normalizeZip(' 1 1 3 7 2 ')).toBe('11372');
  });

  it('rejects short, empty, and missing values', () => {
    expect(normalizeZip('123')).toBeNull();
    expect(normalizeZip('')).toBeNull();
    expect(normalizeZip(null)).toBeNull();
    expect(normalizeZip(undefined)).toBeNull();
    expect(normalizeZip('abcde')).toBeNull();
  });
});

describe('extractZipFromAddress', () => {
  it('finds the ZIP in a full street address', () => {
    expect(extractZipFromAddress('37-11 74th St, Jackson Heights, NY 11372')).toBe('11372');
    expect(extractZipFromAddress('424 Grandview Ave, Staten Island, NY 10303-2200')).toBe('10303');
  });

  it('returns null when no 5-digit group exists', () => {
    expect(extractZipFromAddress('Somewhere in Queens')).toBeNull();
    expect(extractZipFromAddress(null)).toBeNull();
  });
});

describe('estimateCommute', () => {
  it('returns the 8-minute floor for a same-ZIP commute', () => {
    const c = estimateCommute('11372', '11372', null, 'CAR');
    expect(c.zipMatchKind).toBe('exact');
    expect(c.distanceMiles).toBe(0);
    expect(c.etaMinutes).toBe(8);
    expect(c.method).toBe('zip-centroid');
  });

  it('returns all-null when neither endpoint resolves', () => {
    expect(estimateCommute(null, null, null, 'CAR')).toEqual({
      distanceMiles: null,
      etaMinutes: null,
      method: 'unknown',
      zipMatchKind: 'unknown',
    });
  });

  it('slower travel modes yield longer ETAs over the same route', () => {
    const car = estimateCommute('11372', '11101', null, 'CAR').etaMinutes!;
    const transit = estimateCommute('11372', '11101', null, 'PUBLIC_TRANSIT').etaMinutes!;
    const walking = estimateCommute('11372', '11101', null, 'WALKING').etaMinutes!;
    expect(car).toBeLessThan(transit);
    expect(transit).toBeLessThan(walking);
  });

  it('falls back to a borough centroid for a listing with borough only', () => {
    const c = estimateCommute('11372', null, 'Brooklyn', 'CAR');
    expect(c.zipMatchKind).toBe('borough');
    expect(c.distanceMiles).not.toBeNull();
    expect(c.method).toBe('borough-centroid');
  });

  it('uses a same-prefix neighbor for an unmapped NYC ZIP', () => {
    // 11374 (Rego Park) is not in the centroid table but shares prefix 113 with mapped ZIPs
    const c = estimateCommute('11374', '11101', null, 'CAR');
    expect(c.zipMatchKind).toBe('prefix');
    expect(c.distanceMiles).not.toBeNull();
  });
});

describe('formatZipRoute / zipMatchLabel', () => {
  it('formats both-present, half-missing, and all-missing routes honestly', () => {
    expect(formatZipRoute('11372', '11101')).toBe('11372 → 11101');
    expect(formatZipRoute('11372', null)).toBe('11372 → listing ZIP missing');
    expect(formatZipRoute(null, '11101')).toBe('Set home ZIP → 11101');
    expect(formatZipRoute(null, null)).toBeNull();
  });

  it('labels every match kind', () => {
    expect(zipMatchLabel('exact')).toBe('Same ZIP');
    expect(zipMatchLabel('centroid')).toBe('ZIP commute');
    expect(zipMatchLabel('prefix')).toBe('Nearby ZIP area');
    expect(zipMatchLabel('borough')).toBe('Borough estimate');
    expect(zipMatchLabel('unknown')).toBe('Distance unknown');
  });
});

function matchInput(overrides: Partial<MatchInput> = {}): MatchInput {
  return {
    rbtZip: '11372',
    clientZip: '11101',
    clientBorough: 'Queens',
    preferredBoroughs: [],
    transportation: 'CAR',
    maxTravelMiles: 10,
    weeklyHours: null,
    alreadyApplied: false,
    ...overrides,
  };
}

describe('scoreJobMatch', () => {
  it('recommends a same-ZIP listing with a strong score', () => {
    const res = scoreJobMatch(matchInput({ clientZip: '11372' }));
    expect(res.matchScore).toBeGreaterThanOrEqual(80);
    expect(res.recommended).toBe(true);
    expect(res.withinRadius).toBe(true);
    expect(res.matchReason).toContain('Same ZIP');
  });

  it('clamps the score at 99 even when every bonus stacks', () => {
    const res = scoreJobMatch(
      matchInput({
        clientZip: '11372',
        preferredBoroughs: ['queens'],
        weeklyHours: 15,
        alreadyApplied: true,
      })
    );
    expect(res.matchScore).toBe(99);
  });

  it('matches preferred boroughs case-insensitively and penalizes misses', () => {
    const hit = scoreJobMatch(matchInput({ preferredBoroughs: ['qUeEnS'] }));
    const miss = scoreJobMatch(matchInput({ preferredBoroughs: ['Bronx'] }));
    expect(hit.matchScore).toBeGreaterThan(miss.matchScore);
    expect(miss.matchReason).toContain('Outside preferred boroughs');
  });

  it('never recommends when the RBT has no home ZIP', () => {
    const res = scoreJobMatch(matchInput({ rbtZip: null }));
    expect(res.recommended).toBe(false);
    expect(res.matchReason).toContain('Set your home ZIP');
    expect(res.zipRoute).toBe('Set home ZIP → 11101');
  });

  it('penalizes and refuses to recommend listings beyond the travel radius', () => {
    // Jackson Heights → Staten Island south shore, tiny radius
    const res = scoreJobMatch(
      matchInput({ clientZip: '10312', clientBorough: 'Staten Island', maxTravelMiles: 2 })
    );
    expect(res.withinRadius).toBe(false);
    expect(res.recommended).toBe(false);
    expect(res.matchScore).toBeLessThan(80);
  });

  it('keeps the score within [0, 99] and reports at most two reasons', () => {
    const res = scoreJobMatch(
      matchInput({
        clientZip: '10312',
        clientBorough: 'Staten Island',
        preferredBoroughs: ['Manhattan'],
        maxTravelMiles: 1,
        transportation: 'WALKING',
      })
    );
    expect(res.matchScore).toBeGreaterThanOrEqual(0);
    expect(res.matchScore).toBeLessThanOrEqual(99);
    expect(res.matchReason.split(' · ').length).toBeLessThanOrEqual(2);
  });

  it('reports an honest reason when the listing has no ZIP or borough', () => {
    const res = scoreJobMatch(matchInput({ clientZip: null, clientBorough: null }));
    expect(res.distanceMiles).toBeNull();
    expect(res.matchReason).toContain('Listing missing ZIP & borough');
  });
});
