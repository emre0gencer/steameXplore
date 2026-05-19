interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export const TTL = {
  SHORT:  5  * 60 * 1000, //  5 min — inventory, recent games, achievements, stats
  MEDIUM: 10 * 60 * 1000, // 10 min — owned games, friends, level/badges, groups
  LONG:   60 * 60 * 1000, // 60 min — bans, schema (rarely changes)
} as const;

export async function withCache<T>(
  key: string,
  ttlMs: number,
  factory: () => Promise<T>
): Promise<T> {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (entry && Date.now() < entry.expiresAt) {
    return entry.data;
  }
  const data = await factory();
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
  return data;
}
