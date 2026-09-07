const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;
const SWEEP_THRESHOLD = 5_000;
const attempts = new Map<string, number[]>();

export const MAX_ADDRESS_QUERY_LENGTH = 200;

export function isValidCoordinatePair(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

export function checkAddressLookupRateLimit(
  ip: string,
  now = Date.now()
): { allowed: boolean; retryAfterSeconds: number } {
  const key = ip.trim().slice(0, 128) || 'unknown';
  const cutoff = now - WINDOW_MS;
  if (attempts.size >= SWEEP_THRESHOLD) {
    for (const [candidate, timestamps] of attempts) {
      if (!timestamps.some((timestamp) => timestamp > cutoff)) attempts.delete(candidate);
    }
  }
  const recent = (attempts.get(key) ?? []).filter((timestamp) => timestamp > cutoff);
  if (recent.length >= MAX_REQUESTS) {
    const retryAfterSeconds = Math.max(1, Math.ceil((recent[0] + WINDOW_MS - now) / 1000));
    attempts.set(key, recent);
    return { allowed: false, retryAfterSeconds };
  }
  recent.push(now);
  attempts.set(key, recent);
  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetAddressLookupRateLimit(): void {
  attempts.clear();
}
