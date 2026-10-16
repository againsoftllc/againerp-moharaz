import type {
  ElimProductDetail,
  ElimProductListResponse,
  ImageSearchParams,
  ProductFindParams,
  ProductSearchParams,
} from "../../types";
import type { ElimClient } from "./client";

/** Keyword product search — browse only, never imports into ERP. */
export async function searchProducts(
  client: ElimClient,
  params: ProductSearchParams,
): Promise<ElimProductListResponse> {
  const settings = client.getSettings();
  const body: Record<string, unknown> = {
    q: params.q,
    platform: params.platform ?? settings.defaultPlatform,
    page: params.page ?? 1,
    size: params.size ?? 20,
    lang: params.lang ?? settings.defaultLang,
  };

  if (params.sort) body.sort = params.sort;

  if (params.minPrice != null || params.maxPrice != null) {
    body.filter = {
      price_range: {
        min: params.minPrice,
        max: params.maxPrice,
      },
    };
  }

  const { data } = await client.request<ElimProductListResponse>({
    method: "POST",
    path: "/v1/products/search",
    body,
  });
  return data;
}

/** Full product detail from Elim — display + raw JSON only. */
export async function findProduct(
  client: ElimClient,
  params: ProductFindParams,
): Promise<ElimProductDetail> {
  const settings = client.getSettings();
  const { data } = await client.request<ElimProductDetail>({
    method: "POST",
    path: "/v1/products/find",
    body: {
      id: params.id,
      platform: params.platform ?? settings.defaultPlatform,
      lang: params.lang ?? settings.defaultLang,
    },
  });
  return data;
}

/** Image search by URL or uploaded image id. */
export async function searchProductsByImage(
  client: ElimClient,
  params: ImageSearchParams,
): Promise<ElimProductListResponse> {
  if (!params.imgUrl && !params.imgId) {
    throw new Error("Either imgUrl or imgId is required.");
  }
  if (params.imgUrl && params.imgId) {
    throw new Error("Use only one of imgUrl or imgId.");
  }

  const settings = client.getSettings();
  const body: Record<string, unknown> = {
    platform: params.platform ?? settings.defaultPlatform,
    page: params.page ?? 1,
    size: params.size ?? 20,
    lang: params.lang ?? settings.defaultLang,
  };
  if (params.imgUrl) body.img_url = params.imgUrl;
  if (params.imgId) body.img_id = params.imgId;
  if (params.sort) body.sort = params.sort;

  const { data } = await client.request<ElimProductListResponse>({
    method: "POST",
    path: "/v1/products/search-img",
    body,
  });
  return data;
}
