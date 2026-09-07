const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_IP = 30;
const MAX_PER_IP_AND_EMAIL = 5;
const SWEEP_THRESHOLD = 10_000;

const attemptLog = new Map<string, number[]>();

function freshAttempts(key: string, now: number): number[] {
  const cutoff = now - WINDOW_MS;
  const fresh = (attemptLog.get(key) ?? []).filter((stamp) => stamp > cutoff);
  if (fresh.length === 0) attemptLog.delete(key);
  else attemptLog.set(key, fresh);
  return fresh;
}

function record(key: string, attempts: number[], now: number): void {
  attemptLog.set(key, [...attempts, now]);
}

export function checkAndRecordPublicApplicationAttempt(
  ip: string,
  email: string,
  now = Date.now()
): { allowed: boolean } {
  if (attemptLog.size >= SWEEP_THRESHOLD) {
    for (const key of attemptLog.keys()) freshAttempts(key, now);
  }

  const normalizedIp = ip.trim().slice(0, 128) || 'unknown';
  const normalizedEmail = email.trim().toLowerCase().slice(0, 254);
  const ipKey = `ip:${normalizedIp}`;
  const identityKey = `identity:${normalizedIp}|${normalizedEmail}`;
  const ipAttempts = freshAttempts(ipKey, now);
  const identityAttempts = freshAttempts(identityKey, now);
  if (
    ipAttempts.length >= MAX_PER_IP ||
    identityAttempts.length >= MAX_PER_IP_AND_EMAIL
  ) {
    return { allowed: false };
  }
  record(ipKey, ipAttempts, now);
  record(identityKey, identityAttempts, now);
  return { allowed: true };
}

export function resetPublicApplicationRateLimiter(): void {
  attemptLog.clear();
}
