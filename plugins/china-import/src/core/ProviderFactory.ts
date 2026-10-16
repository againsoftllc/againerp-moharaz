import type { BaseProvider, ProviderConfig, ProviderId } from "./types";
import { providerRegistry, type ProviderRegistry } from "./ProviderRegistry";

/**
 * Creates provider instances from the registry.
 * Callers receive BaseProvider — never a concrete class type.
 */
export class ProviderFactory {
  constructor(private readonly registry: ProviderRegistry = providerRegistry) {}

  create(id: ProviderId): BaseProvider {
    const Ctor = this.registry.getConstructor(id);
    return new Ctor();
  }

  async createAndConnect(id: ProviderId, config: ProviderConfig): Promise<BaseProvider> {
    const provider = this.create(id);
    await provider.connect(config);
    return provider;
  }
}

export const providerFactory = new ProviderFactory();
