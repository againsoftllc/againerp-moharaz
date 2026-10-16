import type { ProviderConstructor, ProviderId, ProviderMeta } from "./types";

type RegistryEntry = {
  meta: ProviderMeta;
  ctor: ProviderConstructor;
  enabled: boolean;
};

/**
 * Static registry of provider constructors.
 * Core never imports a concrete marketplace SDK — only registry entries.
 */
export class ProviderRegistry {
  private readonly entries = new Map<ProviderId, RegistryEntry>();

  register(meta: ProviderMeta, ctor: ProviderConstructor): void {
    this.entries.set(meta.id, { meta, ctor, enabled: meta.implemented });
  }

  unregister(id: ProviderId): boolean {
    return this.entries.delete(id);
  }

  enable(id: ProviderId): void {
    const entry = this.require(id);
    entry.enabled = true;
  }

  disable(id: ProviderId): void {
    const entry = this.require(id);
    entry.enabled = false;
  }

  has(id: ProviderId): boolean {
    return this.entries.has(id);
  }

  getMeta(id: ProviderId): ProviderMeta | undefined {
    return this.entries.get(id)?.meta;
  }

  isEnabled(id: ProviderId): boolean {
    return Boolean(this.entries.get(id)?.enabled);
  }

  list(): ProviderMeta[] {
    return Array.from(this.entries.values()).map((e) => ({ ...e.meta }));
  }

  listEnabled(): ProviderMeta[] {
    return Array.from(this.entries.values())
      .filter((e) => e.enabled)
      .map((e) => ({ ...e.meta }));
  }

  getConstructor(id: ProviderId): ProviderConstructor {
    const entry = this.require(id);
    if (!entry.enabled) {
      throw new Error(`Provider "${id}" is disabled`);
    }
    return entry.ctor;
  }

  private require(id: ProviderId): RegistryEntry {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`Provider "${id}" is not registered`);
    return entry;
  }
}

export const providerRegistry = new ProviderRegistry();
