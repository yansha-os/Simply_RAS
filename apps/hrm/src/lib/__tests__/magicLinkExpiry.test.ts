import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { newMagicLinkExpiry } from '../magicLinkExpiry';

describe('newMagicLinkExpiry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-12T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('expires exactly 30 days after issuance', () => {
    const expiry = newMagicLinkExpiry();
    expect(expiry.getTime() - Date.now()).toBe(30 * 24 * 60 * 60 * 1000);
    expect(expiry.toISOString()).toBe('2026-09-11T12:00:00.000Z');
  });

  it('always lands in the future relative to issuance', () => {
    expect(newMagicLinkExpiry().getTime()).toBeGreaterThan(Date.now());
  });
});
