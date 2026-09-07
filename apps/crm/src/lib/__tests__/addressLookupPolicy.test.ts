import { beforeEach, describe, expect, it } from 'vitest';
import {
  checkAddressLookupRateLimit,
  isValidCoordinatePair,
  resetAddressLookupRateLimit,
} from '../addressLookupPolicy';

beforeEach(() => resetAddressLookupRateLimit());

describe('address lookup public-route policy', () => {
  it('accepts valid global coordinates and rejects invalid ranges', () => {
    expect(isValidCoordinatePair(40.7128, -74.006)).toBe(true);
    expect(isValidCoordinatePair(91, -74)).toBe(false);
    expect(isValidCoordinatePair(40, -181)).toBe(false);
    expect(isValidCoordinatePair(Number.NaN, -74)).toBe(false);
  });

  it('limits each client key to 60 requests per minute', () => {
    for (let index = 0; index < 60; index += 1) {
      expect(checkAddressLookupRateLimit('203.0.113.5', index).allowed).toBe(true);
    }
    const blocked = checkAddressLookupRateLimit('203.0.113.5', 60);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(checkAddressLookupRateLimit('203.0.113.6', 60).allowed).toBe(true);
  });
});
