/** Provider-agnostic domain types — plugin UI/services never import Elim types directly. */

export type ProviderId =
  | "elim"
  | "mock"
  | "alibaba-official"
  | "1688"
  | "taobao"
  | "pinduoduo"
  | "ot-api"
  | "aliexpress";

export type ProviderStatus = "registered" | "active" | "disabled" | "error";

export type ProviderCapability =
  | "search"
  | "product_detail"
  | "image_search"
  | "categories"
  | "brands"
  | "currencies"
  | "auth_test";

export type ProviderConfig = {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  retryCount: number;
  environment: "sandbox" | "production";
  /** Free-form provider options (marketplace, lang, etc.). */
  options?: Record<string, string | number | boolean>;
};

export type ProviderMeta = {
  id: ProviderId;
  name: string;
  description: string;
  version: string;
  capabilities: ProviderCapability[];
  /** True when implementation is ready (not a stub). */
  implemented: boolean;
};

export type ProviderQuota = {
  used?: number;
  limit?: number;
  remaining?: number;
  resetAt?: string;
  raw?: Record<string, unknown>;
};

export type ProviderHealth = {
  ok: boolean;
  connected: boolean;
  latencyMs: number;
  apiVersion: string | null;
  quota: ProviderQuota | null;
  message: string;
  checkedAt: string;
  dailyRequests: number;
  failedRequests: number;
  raw?: unknown;
};

export type ProviderProduct = {
  id: string;
  title: string;
  titleEn?: string;
  price: number;
  currency: string;
  imageUrl?: string;
  supplier?: string;
  platform?: string;
  link?: string;
  /** Original provider payload for Raw JSON. */
  raw: Record<string, unknown>;
};

export type ProviderProductDetail = ProviderProduct & {
  description?: string;
  images?: string[];
  categoryId?: string;
  categoryName?: string;
  attributes?: Array<{ name: string; value: string }>;
  skus?: unknown[];
  moq?: number;
  [key: string]: unknown;
};

export type ProviderSearchParams = {
  q: string;
  page?: number;
  size?: number;
  sort?: string;
  minPrice?: number;
  maxPrice?: number;
  /** Provider-specific extras (Elim: platform/lang). */
  extras?: Record<string, string | number | boolean>;
};

export type ProviderSearchResult = {
  items: ProviderProduct[];
  page: number;
  size: number;
  total: number;
  raw: unknown;
};

export type ProviderImageSearchParams = {
  imgUrl?: string;
  imgId?: string;
  file?: File | Blob;
  page?: number;
  size?: number;
  extras?: Record<string, string | number | boolean>;
};

export type ProviderCategory = {
  id: string;
  name: string;
  parentId?: string | null;
  raw?: Record<string, unknown>;
};

export type ProviderBrand = {
  id: string;
  name: string;
  raw?: Record<string, unknown>;
};

export type ProviderCurrency = {
  code: string;
  name: string;
  symbol?: string;
};

export type ProviderErrorKind =
  | "http"
  | "provider"
  | "validation"
  | "timeout"
  | "unknown";

export type ProviderErrorInfo = {
  kind: ProviderErrorKind;
  message: string;
  status?: number;
  code?: string | number;
  details?: unknown;
};

/** Contract every China marketplace provider must implement. */
export interface BaseProvider {
  readonly meta: ProviderMeta;

  connect(config: ProviderConfig): Promise<void>;
  disconnect(): Promise<void>;
  testConnection(): Promise<ProviderHealth>;
  health(): Promise<ProviderHealth>;

  searchProducts(params: ProviderSearchParams): Promise<ProviderSearchResult>;
  getProduct(id: string, extras?: Record<string, string | number | boolean>): Promise<ProviderProductDetail>;
  searchByImage(params: ProviderImageSearchParams): Promise<ProviderSearchResult>;

  getCategories(extras?: Record<string, string | number | boolean>): Promise<ProviderCategory[]>;
  getBrands(extras?: Record<string, string | number | boolean>): Promise<ProviderBrand[]>;
  getCurrencies(): Promise<ProviderCurrency[]>;
}

export type ProviderConstructor = new () => BaseProvider;
