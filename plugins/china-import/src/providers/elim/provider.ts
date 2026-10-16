import {
  AbstractProvider,
  ProviderApiError,
  ProviderHttpError,
  ProviderTimeoutError,
  ProviderValidationError,
} from "../../core/BaseProvider";
import type {
  ProviderBrand,
  ProviderCategory,
  ProviderConfig,
  ProviderCurrency,
  ProviderHealth,
  ProviderImageSearchParams,
  ProviderMeta,
  ProviderProductDetail,
  ProviderSearchParams,
  ProviderSearchResult,
} from "../../core/types";
import type { ChinaImportSettings, ElimLang, ElimPlatform } from "../../types";
import { createElimClient, ElimHttpError, type ElimClient } from "./client";
import { listCategories } from "./categories";
import { findProduct, searchProducts, searchProductsByImage } from "./products";
import { uploadAndSearchByImage, uploadImage } from "./images";
import { mapElimCategories, mapElimProductDetail, mapElimSearchResult } from "./mapper";

function toChinaSettings(config: ProviderConfig): ChinaImportSettings {
  const platform = config.options?.platform === "alibaba" ? "alibaba" : "taobao";
  const lang =
    config.options?.lang === "vi" || config.options?.lang === "zh" || config.options?.lang === "en"
      ? (config.options.lang as ElimLang)
      : "en";

  return {
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    timeoutMs: config.timeoutMs,
    retryCount: config.retryCount,
    environment: config.environment,
    defaultPlatform: platform,
    defaultLang: lang,
    featureEnabled: true,
    activeProviderId: "elim",
    debugMode: false,
  };
}

function wrapError(error: unknown): never {
  if (error instanceof ProviderValidationError) throw error;
  if (error instanceof ElimHttpError) {
    throw new ProviderHttpError(error.message, error.status, error.body);
  }
  if (error instanceof Error) {
    if (error.message.toLowerCase().includes("timed out") || error.name === "AbortError") {
      throw new ProviderTimeoutError(error.message);
    }
    throw new ProviderApiError(error.message);
  }
  throw new ProviderApiError("Unknown provider error", undefined, error);
}

/**
 * Elim marketplace provider — implements BaseProvider.
 * Core / UI never import this class directly; use ProviderManager.
 */
export class ElimProvider extends AbstractProvider {
  readonly meta: ProviderMeta = {
    id: "elim",
    name: "Elim API",
    description: "Taobao / 1688 product search via Elim openapi",
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

  private client: ElimClient | null = null;

  protected async onConnect(config: ProviderConfig): Promise<void> {
    this.client = createElimClient(toChinaSettings(config));
  }

  protected async onDisconnect(): Promise<void> {
    this.client = null;
  }

  private requireClient(): ElimClient {
    this.requireConfig();
    if (!this.client) throw new ProviderValidationError("Elim client not initialized");
    return this.client;
  }

  private platform(): ElimPlatform {
    return this.config?.options?.platform === "alibaba" ? "alibaba" : "taobao";
  }

  private lang(): ElimLang {
    const v = this.config?.options?.lang;
    return v === "vi" || v === "zh" || v === "en" ? v : "en";
  }

  async testConnection(): Promise<ProviderHealth> {
    const checkedAt = new Date().toISOString();
    try {
      const client = this.requireClient();
      const started = performance.now();
      const result = await client.request<Record<string, unknown>>({
        method: "POST",
        path: "/v1/products/search",
        body: {
          q: "test",
          platform: this.platform(),
          page: 1,
          size: 1,
          lang: this.lang(),
        },
      });
      const latencyMs = Math.round(performance.now() - started);
      this.recordSuccess();

      const quotaRemaining = result.headers.get("x-ratelimit-remaining") || result.headers.get("x-quota-remaining");
      const quotaLimit = result.headers.get("x-ratelimit-limit") || result.headers.get("x-quota-limit");
      const apiVersion =
        result.headers.get("x-api-version") ||
        result.headers.get("api-version") ||
        (typeof result.data?.version === "string" ? result.data.version : null) ||
        "v1";

      const health: ProviderHealth = {
        ok: true,
        connected: true,
        latencyMs: result.latencyMs || latencyMs,
        apiVersion,
        quota:
          quotaRemaining || quotaLimit
            ? {
                remaining: quotaRemaining ? Number(quotaRemaining) : undefined,
                limit: quotaLimit ? Number(quotaLimit) : undefined,
              }
            : null,
        message: "Connected",
        checkedAt,
        dailyRequests: this.stats.dailyRequests,
        failedRequests: this.stats.failedRequests,
        raw: result.data,
      };
      this.stats.lastHealth = health;
      return health;
    } catch (error) {
      this.recordFailure();
      const message = error instanceof Error ? error.message : "Connection failed";
      const health: ProviderHealth = {
        ok: false,
        connected: false,
        latencyMs: 0,
        apiVersion: null,
        quota: null,
        message,
        checkedAt,
        dailyRequests: this.stats.dailyRequests,
        failedRequests: this.stats.failedRequests,
      };
      this.stats.lastHealth = health;
      return health;
    }
  }

  async searchProducts(params: ProviderSearchParams): Promise<ProviderSearchResult> {
    try {
      const client = this.requireClient();
      const platform =
        params.extras?.platform === "alibaba" || params.extras?.platform === "taobao"
          ? (params.extras.platform as ElimPlatform)
          : this.platform();
      const data = await searchProducts(client, {
        q: params.q,
        page: params.page,
        size: params.size,
        sort: params.sort as never,
        minPrice: params.minPrice,
        maxPrice: params.maxPrice,
        platform,
        lang: (params.extras?.lang as ElimLang) || this.lang(),
      });
      this.recordSuccess();
      return mapElimSearchResult(data, platform);
    } catch (error) {
      this.recordFailure();
      wrapError(error);
    }
  }

  async getProduct(
    id: string,
    extras?: Record<string, string | number | boolean>,
  ): Promise<ProviderProductDetail> {
    try {
      const client = this.requireClient();
      const platform =
        extras?.platform === "alibaba" || extras?.platform === "taobao"
          ? (extras.platform as ElimPlatform)
          : this.platform();
      const data = await findProduct(client, {
        id,
        platform,
        lang: (extras?.lang as ElimLang) || this.lang(),
      });
      this.recordSuccess();
      return mapElimProductDetail(data, platform);
    } catch (error) {
      this.recordFailure();
      wrapError(error);
    }
  }

  async searchByImage(params: ProviderImageSearchParams): Promise<ProviderSearchResult> {
    try {
      const client = this.requireClient();
      const platform =
        params.extras?.platform === "alibaba" || params.extras?.platform === "taobao"
          ? (params.extras.platform as ElimPlatform)
          : this.platform();

      if (params.file) {
        const { results } = await uploadAndSearchByImage(client, params.file, {
          platform,
          page: params.page,
          size: params.size,
          lang: (params.extras?.lang as ElimLang) || this.lang(),
        });
        this.recordSuccess();
        return mapElimSearchResult(results, platform);
      }

      const data = await searchProductsByImage(client, {
        imgUrl: params.imgUrl,
        imgId: params.imgId,
        platform,
        page: params.page,
        size: params.size,
        lang: (params.extras?.lang as ElimLang) || this.lang(),
      });
      this.recordSuccess();
      return mapElimSearchResult(data, platform);
    } catch (error) {
      this.recordFailure();
      wrapError(error);
    }
  }

  async getCategories(
    extras?: Record<string, string | number | boolean>,
  ): Promise<ProviderCategory[]> {
    try {
      const client = this.requireClient();
      const platform =
        extras?.platform === "alibaba" || extras?.platform === "taobao"
          ? (extras.platform as ElimPlatform)
          : this.platform();
      const data = await listCategories(client, {
        platform,
        lang: (extras?.lang as ElimLang) || this.lang(),
        parentId: extras?.parentId as string | number | undefined,
      });
      this.recordSuccess();
      return mapElimCategories(data.items ?? data.data);
    } catch (error) {
      this.recordFailure();
      wrapError(error);
    }
  }

  async getBrands(): Promise<ProviderBrand[]> {
    // Elim public docs do not expose a dedicated brands endpoint yet.
    this.recordSuccess();
    return [];
  }

  async getCurrencies(): Promise<ProviderCurrency[]> {
    this.recordSuccess();
    return [
      { code: "CNY", name: "Chinese Yuan", symbol: "¥" },
      { code: "USD", name: "US Dollar", symbol: "$" },
      { code: "VND", name: "Vietnamese Dong", symbol: "₫" },
    ];
  }

  /** Explorer helper — upload image for image search. */
  async uploadImageFile(file: File | Blob): Promise<{ imageId: string | null; raw: unknown }> {
    try {
      const client = this.requireClient();
      const data = await uploadImage(client, file, this.platform());
      this.recordSuccess();
      return { imageId: data.data?.image_id ?? null, raw: data };
    } catch (error) {
      this.recordFailure();
      wrapError(error);
    }
  }
}

export function createElimProvider(): ElimProvider {
  return new ElimProvider();
}
