import { CooldownError } from './errors';
export { CooldownError } from './errors';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;   // fresh until this timestamp
  staleUntil: number;  // serve as stale (SWR) until this timestamp, then evict
}

const store = new Map<string, CacheEntry<unknown>>();
const pending = new Map<string, Promise<unknown>>();
const failedAt = new Map<string, number>();

export const TTL = {
  SHORT:     5 * 60 * 1000,        //  5 min — recent games, achievements, stats
  MEDIUM:   10 * 60 * 1000,        // 10 min — owned games, friends, level/badges, groups
  LONG:     60 * 60 * 1000,        // 60 min — inventory, bans, schema
  VERY_LONG: 24 * 60 * 60 * 1000, // 24 h  — badge card prices (stable, expensive to fetch)
} as const;

// After expiry, stale data is still served (and a refresh runs in background) for this window.
const STALE_GRACE_MS = 24 * 60 * 60 * 1000; // 24h
// After a factory throws (e.g. Steam 429 / rwgrsn:-2), back off this long before invoking it again.
// Steam's burst-detection window is ~1–2 min, so use 120 s.
const FAILURE_COOLDOWN_MS = 120_000;

export function peekCache<T>(key: string): T | undefined {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return undefined;
  if (Date.now() < entry.staleUntil) return entry.data;
  store.delete(key);
  return undefined;
}

export async function withCache<T>(
  key: string,
  ttlMs: number,
  factory: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const entry = store.get(key) as CacheEntry<T> | undefined;

  // Fresh: return immediately, no Steam call
  if (entry && now < entry.expiresAt) return entry.data;

  const hasStale = !!entry && now < entry.staleUntil;
  const lastFail = failedAt.get(key);
  const recentlyFailed = lastFail !== undefined && now - lastFail < FAILURE_COOLDOWN_MS;

  // Negative-caching: backoff window after a recent factory failure
  if (recentlyFailed) {
    if (hasStale) return entry!.data;
    const wait = Math.ceil((FAILURE_COOLDOWN_MS - (now - lastFail!)) / 1000);
    throw new CooldownError(wait);
  }

  // In-flight dedup: reuse an already-running factory for the same key
  let promise = pending.get(key) as Promise<T> | undefined;
  if (!promise) {
    promise = (async () => {
      try {
        const data = await factory();
        const at = Date.now();
        store.set(key, {
          data,
          expiresAt: at + ttlMs,
          staleUntil: at + ttlMs + STALE_GRACE_MS,
        });
        failedAt.delete(key);
        return data;
      } catch (err) {
        failedAt.set(key, Date.now());
        throw err;
      } finally {
        pending.delete(key);
      }
    })();
    pending.set(key, promise);
  }

  // Stale-while-revalidate: serve stale immediately, refresh runs in background
  if (hasStale) {
    promise.catch(() => {}); // prevent unhandled rejection — caller already has data
    return entry!.data;
  }

  // No usable cache: wait for fresh fetch
  return promise;
}
