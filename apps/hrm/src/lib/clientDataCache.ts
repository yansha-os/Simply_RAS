/**
 * Lightweight client cache (memory + optional sessionStorage) with TTL.
 * Use for server-action reads that are expensive and rarely change between navigations.
 */

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  storedAt: number;
};

const memory = new Map<string, CacheEntry<unknown>>();

const DEFAULT_TTL_MS = 10_000;

function canUseSessionStorage() {
  return typeof window !== 'undefined' && typeof sessionStorage !== 'undefined';
}

export function getCached<T>(key: string): T | null {
  const mem = memory.get(key) as CacheEntry<T> | undefined;
  if (mem && mem.expiresAt > Date.now()) return mem.value;

  if (canUseSessionStorage()) {
    try {
      const raw = sessionStorage.getItem(`ras_cache:${key}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CacheEntry<T>;
      if (parsed.expiresAt > Date.now()) {
        memory.set(key, parsed as CacheEntry<unknown>);
        return parsed.value;
      }
      sessionStorage.removeItem(`ras_cache:${key}`);
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Returns value even if expired (for stale-while-revalidate), or null if missing. */
export function getCachedStale<T>(key: string): { value: T; fresh: boolean } | null {
  const mem = memory.get(key) as CacheEntry<T> | undefined;
  if (mem) {
    return { value: mem.value, fresh: mem.expiresAt > Date.now() };
  }
  if (canUseSessionStorage()) {
    try {
      const raw = sessionStorage.getItem(`ras_cache:${key}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CacheEntry<T>;
      memory.set(key, parsed as CacheEntry<unknown>);
      return { value: parsed.value, fresh: parsed.expiresAt > Date.now() };
    } catch {
      return null;
    }
  }
  return null;
}

export function setCached<T>(key: string, value: T, ttlMs = DEFAULT_TTL_MS) {
  const entry: CacheEntry<T> = {
    value,
    expiresAt: Date.now() + ttlMs,
    storedAt: Date.now(),
  };
  memory.set(key, entry as CacheEntry<unknown>);
  if (canUseSessionStorage()) {
    try {
      sessionStorage.setItem(`ras_cache:${key}`, JSON.stringify(entry));
    } catch {
      /* quota / private mode */
    }
  }
}

export function invalidateCache(keyOrPrefix: string) {
  for (const key of [...memory.keys()]) {
    if (key === keyOrPrefix || key.startsWith(keyOrPrefix)) {
      memory.delete(key);
    }
  }
  if (canUseSessionStorage()) {
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (!k?.startsWith('ras_cache:')) continue;
        const bare = k.slice('ras_cache:'.length);
        if (bare === keyOrPrefix || bare.startsWith(keyOrPrefix)) {
          toRemove.push(k);
        }
      }
      toRemove.forEach((k) => sessionStorage.removeItem(k));
    } catch {
      /* ignore */
    }
  }
}

/**
 * Stale-while-revalidate helper.
 * - If fresh cache: return it (no network).
 * - If stale/missing: optionally paint stale via onStale, then fetch and cache.
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: {
    ttlMs?: number;
    force?: boolean;
    onStale?: (value: T) => void;
  }
): Promise<T> {
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
  if (!options?.force) {
    const hit = getCachedStale<T>(key);
    if (hit?.fresh) return hit.value;
    if (hit && !hit.fresh) options?.onStale?.(hit.value);
  }

  const value = await fetcher();
  setCached(key, value, ttlMs);
  return value;
}

export const CACHE_KEYS = {
  atsCandidates: 'ats:candidates',
  helpTicketsActive: 'ats:help-tickets:active',
  applicantProgress: (candidateId: string) => `applicant:progress:${candidateId}`,
  applicantSession: 'applicant:session',
} as const;
