import type {
  BaseProvider,
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
} from "./types";

/**
 * Abstract base with shared lifecycle helpers.
 * Concrete providers override the abstract API methods.
 */
export abstract class AbstractProvider implements BaseProvider {
  abstract readonly meta: ProviderMeta;

  protected config: ProviderConfig | null = null;
  protected connected = false;
  protected stats = {
    dailyRequests: 0,
    failedRequests: 0,
    lastHealth: null as ProviderHealth | null,
  };

  async connect(config: ProviderConfig): Promise<void> {
    this.config = { ...config, options: { ...config.options } };
    this.connected = true;
    await this.onConnect(this.config);
  }

  async disconnect(): Promise<void> {
    await this.onDisconnect();
    this.connected = false;
    this.config = null;
  }

  protected requireConfig(): ProviderConfig {
    if (!this.config || !this.connected) {
      throw new ProviderValidationError(`${this.meta.name} is not connected. Call connect() first.`);
    }
    return this.config;
  }

  protected recordSuccess(): void {
    this.stats.dailyRequests += 1;
  }

  protected recordFailure(): void {
    this.stats.dailyRequests += 1;
    this.stats.failedRequests += 1;
  }

  async health(): Promise<ProviderHealth> {
    if (this.stats.lastHealth) {
      return {
        ...this.stats.lastHealth,
        dailyRequests: this.stats.dailyRequests,
        failedRequests: this.stats.failedRequests,
      };
    }
    return this.testConnection();
  }

  abstract testConnection(): Promise<ProviderHealth>;
  abstract searchProducts(params: ProviderSearchParams): Promise<ProviderSearchResult>;
  abstract getProduct(
    id: string,
    extras?: Record<string, string | number | boolean>,
  ): Promise<ProviderProductDetail>;
  abstract searchByImage(params: ProviderImageSearchParams): Promise<ProviderSearchResult>;
  abstract getCategories(extras?: Record<string, string | number | boolean>): Promise<ProviderCategory[]>;
  abstract getBrands(extras?: Record<string, string | number | boolean>): Promise<ProviderBrand[]>;
  abstract getCurrencies(): Promise<ProviderCurrency[]>;

  protected async onConnect(_config: ProviderConfig): Promise<void> {
    /* optional hook */
  }

  protected async onDisconnect(): Promise<void> {
    /* optional hook */
  }
}

export class ProviderValidationError extends Error {
  readonly kind = "validation" as const;
  constructor(message: string) {
    super(message);
    this.name = "ProviderValidationError";
  }
}

export class ProviderTimeoutError extends Error {
  readonly kind = "timeout" as const;
  constructor(message: string) {
    super(message);
    this.name = "ProviderTimeoutError";
  }
}

export class ProviderHttpError extends Error {
  readonly kind = "http" as const;
  readonly status: number;
  readonly body: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "ProviderHttpError";
    this.status = status;
    this.body = body;
  }
}

export class ProviderApiError extends Error {
  readonly kind = "provider" as const;
  readonly code?: string | number;
  readonly details?: unknown;
  constructor(message: string, code?: string | number, details?: unknown) {
    super(message);
    this.name = "ProviderApiError";
    this.code = code;
    this.details = details;
  }
}
