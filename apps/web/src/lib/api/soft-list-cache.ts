/**
 * Soft list cache for catalog/module AG Grid pages.
 * Keeps rows on screen during refetch (Center clients / products pattern).
 */

export type SoftListEntry<T> = {
  items: T[];
  total: number;
  meta?: Record<string, number>;
  savedAt: number;
};

export type SoftListCache<T> = {
  get: (key: string) => SoftListEntry<T> | undefined;
  set: (key: string, entry: SoftListEntry<T>) => void;
  clear: () => void;
  load: (
    key: string,
    fetcher: () => Promise<Omit<SoftListEntry<T>, "savedAt">>,
    opts?: { force?: boolean; ttlMs?: number },
  ) => Promise<SoftListEntry<T>>;
};

const DEFAULT_TTL_MS = 30_000;

export function createSoftListCache<T>(defaultTtlMs = DEFAULT_TTL_MS): SoftListCache<T> {
  const cache = new Map<string, SoftListEntry<T>>();
  const pending = new Map<string, Promise<SoftListEntry<T>>>();

  return {
    get(key) {
      return cache.get(key);
    },
    set(key, entry) {
      cache.set(key, entry);
    },
    clear() {
      cache.clear();
      pending.clear();
    },
    async load(key, fetcher, opts) {
      const force = opts?.force ?? false;
      const ttlMs = opts?.ttlMs ?? defaultTtlMs;
      const cached = cache.get(key);
      if (!force && cached && Date.now() - cached.savedAt < ttlMs) {
        return cached;
      }

      const inflight = pending.get(key);
      if (!force && inflight) return inflight;

      const request = (async () => {
        const result = await fetcher();
        const entry: SoftListEntry<T> = {
          items: result.items,
          total: result.total,
          meta: result.meta,
          savedAt: Date.now(),
        };
        cache.set(key, entry);
        return entry;
      })();

      pending.set(key, request);
      try {
        return await request;
      } finally {
        if (pending.get(key) === request) pending.delete(key);
      }
    },
  };
}

/** True when UI should show a blocking skeleton (no rows yet). */
export function shouldHardLoadList(rowCount: number, loading: boolean): boolean {
  return loading && rowCount === 0;
}
