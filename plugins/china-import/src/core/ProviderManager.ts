import type {
  BaseProvider,
  ProviderConfig,
  ProviderConstructor,
  ProviderHealth,
  ProviderId,
  ProviderMeta,
  ProviderStatus,
} from "./types";
import { providerFactory, type ProviderFactory } from "./ProviderFactory";
import { providerRegistry, type ProviderRegistry } from "./ProviderRegistry";

const ACTIVE_PROVIDER_KEY = "againerp.plugin.china-import.active-provider";
const HEALTH_STATS_KEY = "againerp.plugin.china-import.health-stats";

type CachedInstance = {
  provider: BaseProvider;
  configKey: string;
  status: ProviderStatus;
};

function configFingerprint(config: ProviderConfig): string {
  return JSON.stringify({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey ? "***" + config.apiKey.slice(-4) : "",
    timeoutMs: config.timeoutMs,
    retryCount: config.retryCount,
    environment: config.environment,
    options: config.options ?? {},
  });
}

/**
 * Provider Manager — register / load / activate / disable / health / cache.
 * UI and services talk only to this manager + BaseProvider.
 */
export class ProviderManager {
  private readonly cache = new Map<ProviderId, CachedInstance>();
  private activeId: ProviderId | null = null;
  private healthStats = { dailyRequests: 0, failedRequests: 0 };

  constructor(
    private readonly registry: ProviderRegistry = providerRegistry,
    private readonly factory: ProviderFactory = providerFactory,
  ) {
    this.hydrate();
  }

  private hydrate(): void {
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem(ACTIVE_PROVIDER_KEY) as ProviderId | null;
      if (saved && this.registry.has(saved)) this.activeId = saved;
      const statsRaw = window.localStorage.getItem(HEALTH_STATS_KEY);
      if (statsRaw) {
        const parsed = JSON.parse(statsRaw) as { dailyRequests?: number; failedRequests?: number };
        this.healthStats = {
          dailyRequests: Number(parsed.dailyRequests) || 0,
          failedRequests: Number(parsed.failedRequests) || 0,
        };
      }
    } catch {
      /* ignore */
    }
  }

  private persistActive(): void {
    if (typeof window === "undefined") return;
    if (this.activeId) window.localStorage.setItem(ACTIVE_PROVIDER_KEY, this.activeId);
    else window.localStorage.removeItem(ACTIVE_PROVIDER_KEY);
    window.localStorage.setItem(HEALTH_STATS_KEY, JSON.stringify(this.healthStats));
  }

  registerProvider(meta: ProviderMeta, ctor: ProviderConstructor): void {
    this.registry.register(meta, ctor);
  }

  listProviders(): ProviderMeta[] {
    return this.registry.list();
  }

  getActiveProviderId(): ProviderId | null {
    return this.activeId;
  }

  async activate(id: ProviderId, config: ProviderConfig): Promise<BaseProvider> {
    if (!this.registry.isEnabled(id) && !this.registry.getMeta(id)?.implemented) {
      throw new Error(`Provider "${id}" is not available`);
    }
    this.registry.enable(id);
    const provider = await this.load(id, config);
    this.activeId = id;
    this.persistActive();
    return provider;
  }

  disable(id: ProviderId): void {
    this.registry.disable(id);
    const cached = this.cache.get(id);
    if (cached) {
      void cached.provider.disconnect();
      this.cache.delete(id);
    }
    if (this.activeId === id) {
      this.activeId = null;
      this.persistActive();
    }
  }

  /** Load (or reuse cached) connected provider instance. */
  async load(id: ProviderId, config: ProviderConfig): Promise<BaseProvider> {
    const key = configFingerprint(config);
    const existing = this.cache.get(id);
    if (existing && existing.configKey === key && existing.status === "active") {
      return existing.provider;
    }

    if (existing) {
      await existing.provider.disconnect().catch(() => undefined);
      this.cache.delete(id);
    }

    const provider = await this.factory.createAndConnect(id, config);
    this.cache.set(id, { provider, configKey: key, status: "active" });
    return provider;
  }

  getCached(id: ProviderId): BaseProvider | null {
    return this.cache.get(id)?.provider ?? null;
  }

  async getActive(config: ProviderConfig): Promise<BaseProvider> {
    const id = this.activeId ?? "elim";
    return this.load(id, config);
  }

  async healthCheck(id?: ProviderId, config?: ProviderConfig): Promise<ProviderHealth> {
    const target = id ?? this.activeId ?? "elim";
    let provider = this.cache.get(target)?.provider;
    if (!provider && config) {
      provider = await this.load(target, config);
    }
    if (!provider) {
      return {
        ok: false,
        connected: false,
        latencyMs: 0,
        apiVersion: null,
        quota: null,
        message: "Provider not loaded",
        checkedAt: new Date().toISOString(),
        dailyRequests: this.healthStats.dailyRequests,
        failedRequests: this.healthStats.failedRequests,
      };
    }

    const health = await provider.testConnection();
    this.healthStats.dailyRequests = Math.max(this.healthStats.dailyRequests, health.dailyRequests);
    this.healthStats.failedRequests = Math.max(this.healthStats.failedRequests, health.failedRequests);
    if (!health.ok) this.healthStats.failedRequests += 1;
    else this.healthStats.dailyRequests += 1;
    this.persistActive();

    return {
      ...health,
      dailyRequests: this.healthStats.dailyRequests,
      failedRequests: this.healthStats.failedRequests,
    };
  }

  clearCache(): void {
    for (const entry of this.cache.values()) {
      void entry.provider.disconnect().catch(() => undefined);
    }
    this.cache.clear();
  }
}

export const providerManager = new ProviderManager();
