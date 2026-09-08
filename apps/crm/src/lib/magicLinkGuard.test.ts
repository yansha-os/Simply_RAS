import { describe, expect, it } from 'vitest';
import { magicLinkStatus } from './magicLinkGuard';

const LIVE_PACKET = {
  magicLinkToken: 'opaque-token',
  magicLinkExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
  magicLinkRevokedAt: null,
  deviceFingerprint: null,
};

describe('magicLinkStatus', () => {
  it('accepts an unrevoked link with a future expiry', () => {
    expect(magicLinkStatus(LIVE_PACKET)).toEqual({ ok: true });
  });

  it('fails closed when a legacy link has no expiry', () => {
    expect(magicLinkStatus({ ...LIVE_PACKET, magicLinkExpiresAt: null })).toMatchObject({
      ok: false,
    });
  });

  it('fails closed when the expiry is invalid', () => {
    expect(
      magicLinkStatus({ ...LIVE_PACKET, magicLinkExpiresAt: new Date(Number.NaN) })
    ).toMatchObject({ ok: false });
  });
});
