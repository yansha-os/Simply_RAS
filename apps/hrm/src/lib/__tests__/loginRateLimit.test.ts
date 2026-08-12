import { describe, it, expect, beforeEach } from 'vitest';
import {
  loginRateLimitKey,
  isLoginRateLimited,
  recordLoginAttempt,
  clearLoginAttempts,
  resetLoginRateLimiter,
} from '@/lib/loginRateLimit';

const T0 = 1_000_000_000_000; // fixed base timestamp
const MINUTE = 60 * 1000;

describe('loginRateLimitKey', () => {
  it('normalizes email casing/whitespace and includes the IP', () => {
    expect(loginRateLimitKey('  Staff@Example.com ', '1.2.3.4')).toBe(
      'staff@example.com|1.2.3.4'
    );
  });
});

describe('login rate limiter', () => {
  beforeEach(() => {
    resetLoginRateLimiter();
  });

  it('allows the first 5 attempts and blocks the 6th', () => {
    const key = loginRateLimitKey('a@b.com', '1.1.1.1');
    for (let i = 0; i < 5; i++) {
      expect(isLoginRateLimited(key, T0 + i)).toBe(false);
      recordLoginAttempt(key, T0 + i);
    }
    expect(isLoginRateLimited(key, T0 + 5)).toBe(true);
  });

  it('unblocks once attempts age out of the 15-minute window', () => {
    const key = loginRateLimitKey('a@b.com', '1.1.1.1');
    for (let i = 0; i < 5; i++) {
      recordLoginAttempt(key, T0 + i * MINUTE);
    }
    expect(isLoginRateLimited(key, T0 + 5 * MINUTE)).toBe(true);
    // 15 min after the first attempt, one slot frees up (sliding window).
    expect(isLoginRateLimited(key, T0 + 15 * MINUTE + 1)).toBe(false);
    // But most attempts are still fresh, so one more attempt re-blocks.
    recordLoginAttempt(key, T0 + 15 * MINUTE + 1);
    expect(isLoginRateLimited(key, T0 + 15 * MINUTE + 2)).toBe(true);
    // 15 min after the last attempt everything has aged out.
    expect(isLoginRateLimited(key, T0 + 31 * MINUTE)).toBe(false);
  });

  it('tracks each email+IP bucket independently', () => {
    const blocked = loginRateLimitKey('a@b.com', '1.1.1.1');
    for (let i = 0; i < 5; i++) recordLoginAttempt(blocked, T0 + i);
    expect(isLoginRateLimited(blocked, T0 + 10)).toBe(true);

    expect(isLoginRateLimited(loginRateLimitKey('other@b.com', '1.1.1.1'), T0 + 10)).toBe(false);
    expect(isLoginRateLimited(loginRateLimitKey('a@b.com', '9.9.9.9'), T0 + 10)).toBe(false);
  });

  it('clearLoginAttempts resets the bucket after a successful sign-in', () => {
    const key = loginRateLimitKey('a@b.com', '1.1.1.1');
    for (let i = 0; i < 5; i++) recordLoginAttempt(key, T0 + i);
    expect(isLoginRateLimited(key, T0 + 10)).toBe(true);

    clearLoginAttempts(key);
    expect(isLoginRateLimited(key, T0 + 11)).toBe(false);
  });
});
