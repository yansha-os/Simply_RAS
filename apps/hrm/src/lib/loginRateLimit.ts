/**
 * Sliding-window rate limiter for staff login attempts (readiness gap 18).
 *
 * LIMITATION: the attempt log is in-memory, so each server process enforces
 * the limit independently. With the current 2-server topology an attacker can
 * get at most 2x the budget — acceptable for now. Move the log to a shared
 * store (Redis/Postgres) if the topology grows.
 */

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;
// Sweep stale keys once the map grows past this, so it can't grow unbounded.
const SWEEP_THRESHOLD = 10_000;

const attemptLog = new Map<string, number[]>();

/** Bucket per email + IP so one attacker can't lock out everyone. */
export function loginRateLimitKey(email: string, ip: string): string {
  return `${email.toLowerCase().trim()}|${ip}`;
}

function pruneKey(key: string, now: number): number[] {
  const cutoff = now - WINDOW_MS;
  const fresh = (attemptLog.get(key) ?? []).filter((t) => t > cutoff);
  if (fresh.length === 0) {
    attemptLog.delete(key);
  } else {
    attemptLog.set(key, fresh);
  }
  return fresh;
}

/** True when this email+IP has exhausted its attempt budget for the window. */
export function isLoginRateLimited(key: string, now: number = Date.now()): boolean {
  return pruneKey(key, now).length >= MAX_ATTEMPTS;
}

/** Record one attempt. Call before verifying credentials. */
export function recordLoginAttempt(key: string, now: number = Date.now()): void {
  if (attemptLog.size >= SWEEP_THRESHOLD) {
    const cutoff = now - WINDOW_MS;
    for (const [k, stamps] of attemptLog) {
      if (!stamps.some((t) => t > cutoff)) attemptLog.delete(k);
    }
  }
  const fresh = pruneKey(key, now);
  fresh.push(now);
  attemptLog.set(key, fresh);
}

/** Clear the bucket after a successful sign-in so legit users aren't penalized. */
export function clearLoginAttempts(key: string): void {
  attemptLog.delete(key);
}

/** Test-only: wipe all state between test cases. */
export function resetLoginRateLimiter(): void {
  attemptLog.clear();
}
