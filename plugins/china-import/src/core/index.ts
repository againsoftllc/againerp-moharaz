import { providerRegistry } from "./ProviderRegistry";
import { bootstrapProviders as bootstrapElim } from "../providers/elim";
import { MockProvider } from "../providers/mock";

let ready = false;

/**
 * Register all available providers once.
 * Safe to call from UI mount / explorer.
 */
export function bootstrapProviderEngine(): void {
  if (ready) return;
  bootstrapElim();
  if (!providerRegistry.has("mock")) {
    providerRegistry.register(
      {
        id: "mock",
        name: "Mock Provider",
        description: "Offline fixture data for Explorer and tests",
        version: "1.0.0",
        capabilities: [
          "search",
          "product_detail",
          "image_search",
          "categories",
          "brands",
          "currencies",
          "auth_test",
        ],
        implemented: true,
      },
      MockProvider,
    );
  }
  ready = true;
}

export { AbstractProvider } from "./BaseProvider";
export type { BaseProvider } from "./types";
export { ProviderRegistry, providerRegistry } from "./ProviderRegistry";
export { ProviderFactory, providerFactory } from "./ProviderFactory";
export { ProviderManager, providerManager } from "./ProviderManager";
export type * from "./types";
