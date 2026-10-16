import type { BuildComponentContext, CompatibilityEvaluationResult } from "@/lib/compatibility/types";

type CacheEntry = {
  result: CompatibilityEvaluationResult;
  expiresAt: number;
};

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

function stableSerialize(components: BuildComponentContext[]): string {
  const sorted = [...components].sort((a, b) =>
    a.componentProfileId.localeCompare(b.componentProfileId),
  );
  return JSON.stringify(
    sorted.map((c) => ({
      id: c.componentProfileId,
      attrs: Object.keys(c.attributes)
        .sort()
        .reduce(
          (acc, k) => {
            acc[k] = c.attributes[k];
            return acc;
          },
          {} as Record<string, string | number | boolean>,
        ),
    })),
  );
}

function hashKey(configuratorProfileId: string, components: BuildComponentContext[]): string {
  return `${configuratorProfileId}:${stableSerialize(components)}`;
}

/** In-memory compatibility evaluation cache (prototype — production: Redis) */
class CompatibilityCache {
  private store = new Map<string, CacheEntry>();
  private ttlMs: number;

  constructor(ttlMs = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  get(
    configuratorProfileId: string,
    components: BuildComponentContext[],
  ): CompatibilityEvaluationResult | null {
    const key = hashKey(configuratorProfileId, components);
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return { ...entry.result, cached: true };
  }

  set(
    configuratorProfileId: string,
    components: BuildComponentContext[],
    result: CompatibilityEvaluationResult,
  ): void {
    const key = hashKey(configuratorProfileId, components);
    this.store.set(key, {
      result: { ...result, cached: false },
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  invalidate(configuratorProfileId?: string): void {
    if (!configuratorProfileId) {
      this.store.clear();
      return;
    }
    for (const key of this.store.keys()) {
      if (key.startsWith(`${configuratorProfileId}:`)) {
        this.store.delete(key);
      }
    }
  }

  stats(): { size: number; ttlMs: number } {
    return { size: this.store.size, ttlMs: this.ttlMs };
  }
}

export const compatibilityCache = new CompatibilityCache();

export function evaluateWithCache(
  configuratorProfileId: string,
  components: BuildComponentContext[],
  evaluate: () => CompatibilityEvaluationResult,
): CompatibilityEvaluationResult {
  const cached = compatibilityCache.get(configuratorProfileId, components);
  if (cached) return cached;

  const result = evaluate();
  compatibilityCache.set(configuratorProfileId, components, result);
  return result;
}
