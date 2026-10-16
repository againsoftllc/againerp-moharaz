/** Shared types for China Import plugin (Elim provider). */

export type ChinaImportEnvironment = "sandbox" | "production";

export type ElimPlatform = "taobao" | "alibaba";

export type ElimLang = "vi" | "en" | "zh";

export type ElimProductSort =
  | "PRICE_ASC"
  | "PRICE_DESC"
  | "SALE_QTY_ASC"
  | "SALE_QTY_DESC"
  | "RETENTION_ASC"
  | "RETENTION_DESC";

export type ElimSellerType = "factory" | "merchant" | "seller";

export type ElimQuoteType = "direct" | "by_sku" | "by_volume";

import type { ProviderId } from "../core/types";

/** Persisted API settings — never touches ERP product/inventory tables. */
export type ChinaImportSettings = {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  retryCount: number;
  environment: ChinaImportEnvironment;
  defaultPlatform: ElimPlatform;
  defaultLang: ElimLang;
  featureEnabled: boolean;
  /** Active marketplace provider (core stays provider-agnostic). */
  activeProviderId: ProviderId;
  debugMode: boolean;
};

export type ChinaImportSettingsInput = Partial<ChinaImportSettings>;

export type ConnectionTestResult = {
  ok: boolean;
  latencyMs: number;
  apiVersion: string | null;
  quota: QuotaInfo | null;
  message: string;
  checkedAt: string;
  raw?: unknown;
};

export type QuotaInfo = {
  used?: number;
  limit?: number;
  remaining?: number;
  resetAt?: string;
  raw?: Record<string, unknown>;
};

export type ApiLogLevel = "info" | "error" | "warn";

export type ApiLogEntry = {
  id: string;
  at: string;
  level: ApiLogLevel;
  method: string;
  path: string;
  status?: number;
  latencyMs?: number;
  request?: unknown;
  response?: unknown;
  error?: string;
};

export type ElimSimpleResponse = {
  success: boolean;
  code: number;
  message: string;
};

export type ElimProductListItem = {
  id: number | string;
  title: string;
  titleEn?: string;
  price: number;
  promotion_price?: number | null;
  retail_price?: number | null;
  whosesale_price?: number | null;
  dropship_price?: number | null;
  seller_type?: ElimSellerType | string;
  unit?: string;
  img_url?: string;
  link?: string;
  sales_volume?: number;
  retention_rate?: number;
  level?: number;
  shop_name?: string;
  currency?: string;
  [key: string]: unknown;
};

export type ElimPaginate = {
  total: number;
  current: number;
  size: number;
};

export type ElimProductListResponse = ElimSimpleResponse & {
  paginate?: ElimPaginate;
  items: ElimProductListItem[];
};

export type ElimProductDetail = ElimSimpleResponse & {
  id: string | number;
  mp_id?: string;
  title: string;
  titleEn?: string;
  description?: string;
  quote_type?: ElimQuoteType | string;
  price: number;
  price_range?: Array<{ moq: number; price: number; promotion_price?: number }>;
  promotion_price?: number | null;
  quantity?: number;
  unit?: string;
  shop_id?: string;
  shop_name?: string;
  moq?: number;
  category_id?: string;
  category_name?: string;
  img_urls?: string[];
  video_urls?: { thumbnail_url: string | null; detail_url: string | null };
  sold?: number | null;
  review?: Record<string, number>;
  level?: number;
  seller_type?: ElimSellerType | string;
  status?: string;
  skus?: unknown[];
  attributes?: Array<{ name: string; value: string }>;
  shipping_info?: unknown[];
  extra_info?: Array<{ key: string; value: string }>;
  currency?: string;
  [key: string]: unknown;
};

export type ElimUploadImageResponse = ElimSimpleResponse & {
  data?: { image_id: string | null };
};

export type ElimCategoryItem = {
  id: string | number;
  name: string;
  parent_id?: string | number | null;
  [key: string]: unknown;
};

export type ElimCategoryListResponse = ElimSimpleResponse & {
  items?: ElimCategoryItem[];
  data?: ElimCategoryItem[];
};

export type ProductSearchParams = {
  q: string;
  platform?: ElimPlatform;
  page?: number;
  size?: number;
  sort?: ElimProductSort;
  lang?: ElimLang;
  minPrice?: number;
  maxPrice?: number;
};

export type ImageSearchParams = {
  imgUrl?: string;
  imgId?: string;
  platform?: ElimPlatform;
  page?: number;
  size?: number;
  sort?: ElimProductSort;
  lang?: ElimLang;
};

export type ProductFindParams = {
  id: string;
  platform?: ElimPlatform;
  lang?: ElimLang;
};

export type ChinaImportView =
  | "dashboard"
  | "settings"
  | "search"
  | "image-search"
  | "product"
  | "raw"
  | "logs"
  | "explorer"
  | "mapping"
  | "import-queue"
  | "import-review"
  | "entity-mapping";

export type ChinaImportRouteState = {
  view: ChinaImportView;
  productId?: string;
  platform?: ElimPlatform;
};
