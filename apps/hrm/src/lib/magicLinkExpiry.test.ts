import { describe, expect, it } from 'vitest';
import { isMagicLinkExpiryCurrent } from './magicLinkExpiry';

describe('isMagicLinkExpiryCurrent', () => {
  const now = new Date('2026-09-08T00:00:00.000Z').getTime();

  it('accepts only a finite future expiry', () => {
    expect(isMagicLinkExpiryCurrent(new Date(now + 1), now)).toBe(true);
    expect(isMagicLinkExpiryCurrent(new Date(now), now)).toBe(false);
    expect(isMagicLinkExpiryCurrent(new Date(now - 1), now)).toBe(false);
    expect(isMagicLinkExpiryCurrent(new Date(Number.NaN), now)).toBe(false);
    expect(isMagicLinkExpiryCurrent(null, now)).toBe(false);
  });
});
