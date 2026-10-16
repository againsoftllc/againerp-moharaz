import { AbstractProvider } from "../../core/BaseProvider";
import type {
  ProviderBrand,
  ProviderCategory,
  ProviderCurrency,
  ProviderHealth,
  ProviderImageSearchParams,
  ProviderMeta,
  ProviderProductDetail,
  ProviderSearchParams,
  ProviderSearchResult,
} from "../../core/types";

const MOCK_PRODUCTS: ProviderProductDetail[] = [
  {
    id: "mock-1001",
    title: "Wireless Earbuds Pro",
    titleEn: "Wireless Earbuds Pro",
    price: 28.5,
    currency: "CNY",
    imageUrl: "https://placehold.co/400x400/png?text=Earbuds",
    supplier: "Mock Shenzhen Audio",
    platform: "mock",
    description: "Demo product for API Explorer without live credentials.",
    images: ["https://placehold.co/400x400/png?text=Earbuds"],
    categoryId: "cat-audio",
    categoryName: "Audio",
    attributes: [
      { name: "Color", value: "Black" },
      { name: "Battery", value: "30h" },
    ],
    moq: 2,
    raw: { mock: true, sku: "EB-PRO-01" },
  },
  {
    id: "mock-1002",
    title: "USB-C Hub 7-in-1",
    titleEn: "USB-C Hub 7-in-1",
    price: 45,
    currency: "CNY",
    imageUrl: "https://placehold.co/400x400/png?text=USB-Hub",
    supplier: "Mock Dongguan Hub Co",
    platform: "mock",
    description: "Expand laptop ports — mock listing.",
    images: ["https://placehold.co/400x400/png?text=USB-Hub"],
    categoryId: "cat-accessories",
    categoryName: "Accessories",
    attributes: [{ name: "Ports", value: "7" }],
    moq: 1,
    raw: { mock: true, sku: "HUB-7-01" },
  },
  {
    id: "mock-1003",
    title: "Silicone Phone Case",
    price: 3.2,
    currency: "CNY",
    imageUrl: "https://placehold.co/400x400/png?text=Case",
    supplier: "Mock Case Factory",
    platform: "mock",
    categoryId: "cat-phone",
    categoryName: "Phone Cases",
    moq: 50,
    raw: { mock: true, sku: "CASE-01" },
  },
];

/**
 * Offline mock provider for Explorer / demos.
 * No network calls — safe default when API key is missing.
 */
export class MockProvider extends AbstractProvider {
  readonly meta: ProviderMeta = {
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
  };

  async testConnection(): Promise<ProviderHealth> {
    this.recordSuccess();
    const health: ProviderHealth = {
      ok: true,
      connected: true,
      latencyMs: 12,
      apiVersion: "mock-1",
      quota: { used: this.stats.dailyRequests, limit: 10_000, remaining: 10_000 - this.stats.dailyRequests },
      message: "Connected (mock)",
      checkedAt: new Date().toISOString(),
      dailyRequests: this.stats.dailyRequests,
      failedRequests: this.stats.failedRequests,
    };
    this.stats.lastHealth = health;
    return health;
  }

  async searchProducts(params: ProviderSearchParams): Promise<ProviderSearchResult> {
    this.recordSuccess();
    const q = params.q.trim().toLowerCase();
    const filtered = MOCK_PRODUCTS.filter(
      (p) => !q || p.title.toLowerCase().includes(q) || p.id.includes(q),
    );
    const page = params.page ?? 1;
    const size = params.size ?? 20;
    const start = (page - 1) * size;
    const items = filtered.slice(start, start + size).map(({ raw, ...rest }) => ({ ...rest, raw }));
    return { items, page, size, total: filtered.length, raw: { mock: true, q, items } };
  }

  async getProduct(id: string): Promise<ProviderProductDetail> {
    this.recordSuccess();
    const found = MOCK_PRODUCTS.find((p) => p.id === id);
    if (!found) {
      this.recordFailure();
      throw new Error(`Mock product not found: ${id}`);
    }
    return { ...found };
  }

  async searchByImage(_params: ProviderImageSearchParams): Promise<ProviderSearchResult> {
    this.recordSuccess();
    return {
      items: MOCK_PRODUCTS.slice(0, 2),
      page: 1,
      size: 2,
      total: 2,
      raw: { mock: true, imageSearch: true },
    };
  }

  async getCategories(): Promise<ProviderCategory[]> {
    this.recordSuccess();
    return [
      { id: "cat-audio", name: "Audio", parentId: null },
      { id: "cat-accessories", name: "Accessories", parentId: null },
      { id: "cat-phone", name: "Phone Cases", parentId: "cat-accessories" },
    ];
  }

  async getBrands(): Promise<ProviderBrand[]> {
    this.recordSuccess();
    return [
      { id: "brand-mock-a", name: "MockAudio" },
      { id: "brand-mock-b", name: "HubWorks" },
    ];
  }

  async getCurrencies(): Promise<ProviderCurrency[]> {
    this.recordSuccess();
    return [
      { code: "CNY", name: "Chinese Yuan", symbol: "¥" },
      { code: "USD", name: "US Dollar", symbol: "$" },
    ];
  }
}
