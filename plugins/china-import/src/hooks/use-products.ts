"use client";

import { useCallback, useState } from "react";
import type {
  ElimPlatform,
  ElimProductDetail,
  ElimProductListResponse,
  ImageSearchParams,
  ProductSearchParams,
} from "../types";
import type { ProviderProduct, ProviderProductDetail, ProviderSearchResult } from "../core/types";
import { connectionService, toProviderConfig } from "../services/connection.service";
import { bootstrapProviderEngine, providerManager } from "../core";

function toLegacyList(result: ProviderSearchResult): ElimProductListResponse {
  return {
    success: true,
    code: 200,
    message: "ok",
    paginate: {
      total: result.total,
      current: result.page,
      size: result.size,
    },
    items: result.items.map((item) => ({
      id: item.id,
      title: item.title,
      titleEn: item.titleEn,
      price: item.price,
      img_url: item.imageUrl,
      shop_name: item.supplier,
      currency: item.currency,
      link: item.link,
      ...(item.raw ?? {}),
    })),
  };
}

function toLegacyDetail(product: ProviderProductDetail): ElimProductDetail {
  return {
    success: true,
    code: 200,
    message: "ok",
    id: product.id,
    title: product.title,
    titleEn: product.titleEn,
    price: product.price,
    description: product.description,
    shop_name: product.supplier,
    category_id: product.categoryId,
    category_name: product.categoryName,
    img_urls: product.images,
    attributes: product.attributes,
    skus: product.skus,
    moq: product.moq,
    currency: product.currency,
    ...(product.raw ?? {}),
  };
}

async function withProvider() {
  bootstrapProviderEngine();
  const settings = connectionService.getSettings();
  return providerManager.activate(settings.activeProviderId, toProviderConfig(settings));
}

export function useProductSearch() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ElimProductListResponse | null>(null);

  const search = useCallback(async (params: ProductSearchParams) => {
    setLoading(true);
    setError(null);
    try {
      const provider = await withProvider();
      const result = await provider.searchProducts({
        q: params.q,
        page: params.page,
        size: params.size,
        sort: params.sort,
        minPrice: params.minPrice,
        maxPrice: params.maxPrice,
        extras: {
          platform: params.platform ?? "taobao",
          lang: params.lang ?? "en",
        },
      });
      const legacy = toLegacyList(result);
      setData(legacy);
      return legacy;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Search failed";
      setError(message);
      setData(null);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setData(null);
    setError(null);
  }, []);

  return { loading, error, data, search, clear, setData };
}

export function useProductDetail() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [product, setProduct] = useState<ElimProductDetail | null>(null);

  const load = useCallback(async (id: string, platform?: ElimPlatform) => {
    setLoading(true);
    setError(null);
    try {
      const provider = await withProvider();
      const result = await provider.getProduct(id, { platform: platform ?? "taobao" });
      const legacy = toLegacyDetail(result);
      setProduct(legacy);
      return legacy;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load product";
      setError(message);
      setProduct(null);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, product, load, setProduct };
}

export function useImageSearch() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ElimProductListResponse | null>(null);
  const [imageId, setImageId] = useState<string | null>(null);

  const searchByUrlOrId = useCallback(async (params: ImageSearchParams) => {
    setLoading(true);
    setError(null);
    try {
      const provider = await withProvider();
      const result = await provider.searchByImage({
        imgUrl: params.imgUrl,
        imgId: params.imgId,
        page: params.page,
        size: params.size,
        extras: {
          platform: params.platform ?? "taobao",
          lang: params.lang ?? "en",
        },
      });
      if (params.imgId) setImageId(params.imgId);
      const legacy = toLegacyList(result);
      setData(legacy);
      return legacy;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Image search failed";
      setError(message);
      setData(null);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const searchByFile = useCallback(
    async (file: File, params?: Omit<ImageSearchParams, "imgUrl" | "imgId">) => {
      setLoading(true);
      setError(null);
      try {
        const provider = await withProvider();
        const result = await provider.searchByImage({
          file,
          page: params?.page,
          size: params?.size,
          extras: {
            platform: params?.platform ?? "taobao",
            lang: params?.lang ?? "en",
          },
        });
        setImageId(null);
        const legacy = toLegacyList(result);
        setData(legacy);
        return legacy;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Image upload/search failed";
        setError(message);
        setData(null);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { loading, error, data, imageId, searchByUrlOrId, searchByFile, setData };
}

export type { ProviderProduct, ProviderSearchResult };
