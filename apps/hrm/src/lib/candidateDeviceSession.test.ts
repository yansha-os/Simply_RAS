import { describe, expect, it } from 'vitest';
import {
  CANDIDATE_SESSION_MAX_AGE_MS,
  isCandidateDeviceSessionCurrent,
} from './candidateDeviceSession';

describe('candidate device session lifetime', () => {
  const now = new Date('2026-09-06T12:00:00.000Z').getTime();

  it('accepts a non-revoked session within the absolute lifetime', () => {
    expect(
      isCandidateDeviceSessionCurrent(
        { boundAt: new Date(now - CANDIDATE_SESSION_MAX_AGE_MS + 1), revokedAt: null },
        now
      )
    ).toBe(true);
  });

  it('rejects expired, revoked, and future-dated sessions', () => {
    expect(
      isCandidateDeviceSessionCurrent(
        { boundAt: new Date(now - CANDIDATE_SESSION_MAX_AGE_MS - 1), revokedAt: null },
        now
      )
    ).toBe(false);
    expect(
      isCandidateDeviceSessionCurrent(
        { boundAt: new Date(now - 1), revokedAt: new Date(now) },
        now
      )
    ).toBe(false);
    expect(
      isCandidateDeviceSessionCurrent(
        { boundAt: new Date(now + 1), revokedAt: null },
        now
      )
    ).toBe(false);
  });
});
