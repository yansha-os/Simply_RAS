import { beforeEach, describe, expect, it } from 'vitest';
import {
  checkAndRecordPublicApplicationAttempt,
  resetPublicApplicationRateLimiter,
} from '../publicApplicationRateLimit';

beforeEach(() => resetPublicApplicationRateLimiter());

describe('public application rate limiter', () => {
  it('limits repeated submissions for the same IP and email', () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(
        checkAndRecordPublicApplicationAttempt('203.0.113.10', 'person@example.com', attempt)
      ).toEqual({ allowed: true });
    }
    expect(
      checkAndRecordPublicApplicationAttempt('203.0.113.10', 'person@example.com', 6)
    ).toEqual({ allowed: false });
  });

  it('expires old attempts after the window', () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      checkAndRecordPublicApplicationAttempt('203.0.113.10', 'person@example.com', attempt);
    }
    expect(
      checkAndRecordPublicApplicationAttempt(
        '203.0.113.10',
        'person@example.com',
        60 * 60 * 1000 + 1
      )
    ).toEqual({ allowed: true });
  });
});
