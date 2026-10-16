"use client";

import { useCallback, useEffect, useState } from "react";
import type { Product } from "@/lib/mock-data/products";
import { apiFetch } from "@/lib/api/client";
import {
  apiProductToProduct,
  productListFields,
  checkCatalogProductSlug,
  fetchCatalogProductDetail,
  fetchProductInventory,
  fetchProductSpecs,
  productToApiPayload,
  productToApiUpdatePayload,
  replaceProductMedia,
  replaceProductSpecs,
  replaceProductVariants,
  upsertProductInventory,
  type ProductSpecs,
  type ApiCatalogProduct,
  type ApiProductDetailResponse,
  type ApiProductListResponse,
  type CreateCatalogProductInput,
  type ProductDetail,
  type ProductInventoryInput,
  type ProductInventoryRecord,
  type UpdateCatalogProductInput,
  type VariantUpsertInput,
} from "@/lib/api/catalog-products";

export type CatalogProductChannel = "catalog" | "dropshipping";

type UseCatalogProductsOptions = {
  /** Split Catalog vs Dropshipping product lists (server-side). */
  channel?: CatalogProductChannel;
};

type UseCatalogProductsState = {
  products: Product[];
  total: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

type ProductListCacheEntry = {
  products: Product[];
  total: number;
  savedAt: number;
};

const PRODUCT_LIST_CACHE_MS = 30_000;
const PRODUCT_LIST_PAGE_SIZE = 200;
/** Pages fetched at the same time after the first one. */
const PRODUCT_LIST_CONCURRENCY = 4;
/** Partial rows are pushed to the grid at most this often while pages arrive. */
const PRODUCT_LIST_PARTIAL_MS = 400;
/** Safety stop so a bad `count` can never spin the loader forever (100k products). */
const PRODUCT_LIST_MAX_PAGES = 500;
const productListCache = new Map<string, ProductListCacheEntry>();
const productListRequests = new Map<string, Promise<ProductListCacheEntry>>();

function productListCacheKey(channel?: CatalogProductChannel) {
  return channel ?? "all";
}

async function loadProductList(
  channel?: CatalogProductChannel,
  force = false,
  onPartial?: (entry: ProductListCacheEntry) => void,
): Promise<ProductListCacheEntry> {
  const key = productListCacheKey(channel);
  const cached = productListCache.get(key);
  if (!force && cached && Date.now() - cached.savedAt < PRODUCT_LIST_CACHE_MS) {
    return cached;
  }

  const pending = productListRequests.get(key);
  if (!force && pending) return pending;

  const request = (async () => {
    // The grid filters and searches client-side, so a partial list silently
    // hides matches — load the whole catalog. `fields=list` drops the long
    // text the grid never shows; pages after the first load in parallel, and
    // the first page is shown while the rest arrive.
    const fetchPage = (page: number) => {
      const params = new URLSearchParams({
        per_page: String(PRODUCT_LIST_PAGE_SIZE),
        page: String(page),
        fields: "list",
      });
      if (channel) params.set("channel", channel);
      return apiFetch<ApiProductListResponse>(
        `/api/v1/catalog/products?${params}`,
        force ? { cache: "no-store" } : undefined,
      );
    };

    const pages: ApiCatalogProduct[][] = [];
    const buildEntry = () => {
      const seen = new Set<string>();
      return {
        products: pages
          .flat()
          .filter((row) => !seen.has(row.id) && seen.add(row.id))
          .map(apiProductToProduct),
        total,
        savedAt: Date.now(),
      };
    };

    const first = await fetchPage(1);
    const total = first.meta.count;
    pages[0] = first.data;
    const pageCount = Math.min(
      Math.ceil(total / PRODUCT_LIST_PAGE_SIZE),
      PRODUCT_LIST_MAX_PAGES,
    );
    let lastPartialAt = 0;
    const emitPartial = () => {
      if (!onPartial || Date.now() - lastPartialAt < PRODUCT_LIST_PARTIAL_MS) return;
      lastPartialAt = Date.now();
      onPartial(buildEntry());
    };
    if (pageCount > 1) emitPartial();

    let nextPage = 2;
    const worker = async () => {
      while (nextPage <= pageCount) {
        const page = nextPage;
        nextPage += 1;
        const res = await fetchPage(page);
        pages[page - 1] = res.data;
        emitPartial();
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(PRODUCT_LIST_CONCURRENCY, pageCount - 1) }, worker),
    );

    const entry = buildEntry();
    productListCache.set(key, entry);
    return entry;
  })();

  productListRequests.set(key, request);
  try {
    return await request;
  } finally {
    if (productListRequests.get(key) === request) {
      productListRequests.delete(key);
    }
  }
}

export function useCatalogProducts(
  options: UseCatalogProductsOptions = {},
): UseCatalogProductsState {
  const channel = options.channel;
  const cached = productListCache.get(productListCacheKey(channel));
  const [products, setProducts] = useState<Product[]>(cached?.products ?? []);
  const [total, setTotal] = useState(cached?.total ?? 0);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    const currentCache = productListCache.get(productListCacheKey(channel));
    const hasRows = Boolean(currentCache?.products.length);
    if (
      !force &&
      currentCache &&
      Date.now() - currentCache.savedAt < PRODUCT_LIST_CACHE_MS
    ) {
      setProducts(currentCache.products);
      setTotal(currentCache.total);
      setLoading(false);
      return;
    }

    // Soft refresh when we already have rows — keep the grid visible (Center clients pattern).
    if (!hasRows) setLoading(true);
    setError(null);
    try {
      const result = await loadProductList(channel, force, (partial) => {
        // Show rows as pages arrive instead of a spinner for the whole catalog.
        setProducts(partial.products);
        setTotal(partial.total);
        setLoading(false);
      });
      setProducts(result.products);
      setTotal(result.total);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load products";
      setError(message);
      if (!hasRows) {
        setProducts([]);
        setTotal(0);
      }
    } finally {
      setLoading(false);
    }
  }, [channel]);

  useEffect(() => {
    const timer = setTimeout(() => void load(false), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const refetch = useCallback(() => load(true), [load]);

  return { products, total, loading, error, refetch };
}

export async function fetchCatalogProduct(id: string): Promise<Product> {
  const detail = await fetchCatalogProductDetail(id);
  // Keep list caches warm so Aladin "Open product" finds the row immediately.
  for (const key of ["catalog", "dropshipping", "all"] as const) {
    const entry = productListCache.get(key);
    if (!entry) continue;
    if (entry.products.some((p) => p.id === id)) continue;
    productListCache.set(key, {
      ...entry,
      products: [detail, ...entry.products],
      total: entry.total + 1,
      savedAt: Date.now(),
    });
  }
  return detail;
}

export { fetchCatalogProductDetail, fetchProductSpecs, replaceProductMedia, replaceProductSpecs, replaceProductVariants, checkCatalogProductSlug, fetchProductInventory, upsertProductInventory };
export type { ProductDetail, ProductSpecs, VariantUpsertInput, ProductInventoryInput, ProductInventoryRecord };

export async function createCatalogProduct(input: CreateCatalogProductInput): Promise<ProductDetail> {
  const res = await apiFetch<ApiProductDetailResponse>("/api/v1/catalog/products", {
    method: "POST",
    body: JSON.stringify(productToApiPayload(input)),
  });
  const detail = await fetchCatalogProductDetail(res.data.id);
  const asProduct = apiProductToProduct(detail);
  for (const [key, entry] of productListCache.entries()) {
    if (entry.products.some((p) => p.id === detail.id)) continue;
    productListCache.set(key, {
      ...entry,
      products: [asProduct, ...entry.products],
      total: entry.total + 1,
      savedAt: Date.now(),
    });
  }
  return detail;
}

export async function updateCatalogProduct(
  id: string,
  input: UpdateCatalogProductInput,
): Promise<ProductDetail> {
  const res = await apiFetch<ApiProductDetailResponse>(`/api/v1/catalog/products/${id}`, {
    method: "PATCH",
    body: JSON.stringify(productToApiUpdatePayload(input)),
  });
  const detail = await fetchCatalogProductDetail(res.data.id);
  // Keep list cache in sync so soft reloads don't wipe live-edit values.
  for (const [key, entry] of productListCache.entries()) {
    const idx = entry.products.findIndex((p) => p.id === id);
    if (idx < 0) continue;
    const next = entry.products.slice();
    next[idx] = { ...next[idx], ...productListFields(detail) } as typeof next[number];
    productListCache.set(key, { ...entry, products: next });
  }
  return detail;
}

export async function archiveCatalogProducts(ids: string[]): Promise<void> {
  await Promise.all(
    ids.map((id) =>
      updateCatalogProduct(id, { status: "archived" }),
    ),
  );
}

export async function duplicateCatalogProduct(id: string): Promise<ProductDetail> {
  const res = await apiFetch<ApiProductDetailResponse>(`/api/v1/catalog/products/${id}/duplicate`, {
    method: "POST",
  });
  return fetchCatalogProductDetail(res.data.id);
}

export async function deleteCatalogProduct(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/catalog/products/${id}`, { method: "DELETE" });
}

export async function publishProductToApi(id: string): Promise<ProductDetail> {
  return updateCatalogProduct(id, { status: "published", visibility: "public" });
}

export async function unpublishProductFromApi(id: string): Promise<ProductDetail> {
  return updateCatalogProduct(id, { status: "draft", visibility: "private" });
}
