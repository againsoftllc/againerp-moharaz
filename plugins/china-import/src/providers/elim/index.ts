import { AbstractProvider, ProviderValidationError } from "../../core/BaseProvider";
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
import { providerRegistry } from "../../core/ProviderRegistry";
import { ElimProvider } from "./provider";

export { ElimProvider, createElimProvider } from "./provider";
export { mapElimProduct, mapElimSearchResult, mapElimProductDetail, mapElimCategories } from "./mapper";

export {
  buildElimAuthHeaders,
  assertApiKey,
  ElimAuthError,
} from "./auth";
export { ElimClient, createElimClient, ElimHttpError } from "./client";
export type { ElimRequestOptions, ElimRequestResult } from "./client";
export { searchProducts, findProduct, searchProductsByImage } from "./products";
export { listCategories } from "./categories";
export { uploadImage, uploadAndSearchByImage } from "./images";
export {
  appendApiLog,
  clearApiLogs,
  getApiLogs,
  subscribeApiLogs,
  logRequest,
  logResponse,
  logApiError,
} from "./logger";

/** Future marketplace stubs — registered but not implemented. */
const FUTURE_STUBS: ProviderMeta[] = [
  {
    id: "alibaba-official",
    name: "Alibaba Official",
    description: "Official Alibaba Open Platform (planned)",
    version: "0.0.0",
    capabilities: ["search", "product_detail"],
    implemented: false,
  },
  {
    id: "1688",
    name: "1688",
    description: "1688.com direct API (planned)",
    version: "0.0.0",
    capabilities: ["search", "product_detail", "image_search"],
    implemented: false,
  },
  {
    id: "taobao",
    name: "Taobao",
    description: "Taobao Open API (planned)",
    version: "0.0.0",
    capabilities: ["search", "product_detail"],
    implemented: false,
  },
  {
    id: "pinduoduo",
    name: "Pinduoduo",
    description: "Pinduoduo API (planned)",
    version: "0.0.0",
    capabilities: ["search", "product_detail"],
    implemented: false,
  },
  {
    id: "ot-api",
    name: "OT API",
    description: "OT sourcing API (planned)",
    version: "0.0.0",
    capabilities: ["search", "product_detail", "image_search"],
    implemented: false,
  },
  {
    id: "aliexpress",
    name: "AliExpress",
    description: "AliExpress Open Platform (planned)",
    version: "0.0.0",
    capabilities: ["search", "product_detail"],
    implemented: false,
  },
];

function createStubConstructor(meta: ProviderMeta) {
  return class UnimplementedProvider extends AbstractProvider {
    readonly meta = meta;

    protected async onConnect(_config: ProviderConfig): Promise<void> {
      throw new ProviderValidationError(`${meta.name} is not implemented yet`);
    }

    async testConnection(): Promise<ProviderHealth> {
      throw new ProviderValidationError(`${meta.name} is not implemented yet`);
    }

    async searchProducts(_params: ProviderSearchParams): Promise<ProviderSearchResult> {
      throw new ProviderValidationError(`${meta.name} is not implemented yet`);
    }

    async getProduct(_id: string): Promise<ProviderProductDetail> {
      throw new ProviderValidationError(`${meta.name} is not implemented yet`);
    }

    async searchByImage(_params: ProviderImageSearchParams): Promise<ProviderSearchResult> {
      throw new ProviderValidationError(`${meta.name} is not implemented yet`);
    }

    async getCategories(): Promise<ProviderCategory[]> {
      throw new ProviderValidationError(`${meta.name} is not implemented yet`);
    }

    async getBrands(): Promise<ProviderBrand[]> {
      throw new ProviderValidationError(`${meta.name} is not implemented yet`);
    }

    async getCurrencies(): Promise<ProviderCurrency[]> {
      throw new ProviderValidationError(`${meta.name} is not implemented yet`);
    }
  };
}

let bootstrapped = false;

/** Idempotent Elim + future-stub registration. */
export function bootstrapProviders(): void {
  if (bootstrapped) return;
  bootstrapped = true;

  providerRegistry.register(
    {
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
    },
    ElimProvider,
  );

  for (const stub of FUTURE_STUBS) {
    providerRegistry.register(stub, createStubConstructor(stub));
    providerRegistry.disable(stub.id);
  }
}
