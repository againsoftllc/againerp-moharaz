"use client";

import { useCallback, useEffect, useState } from "react";
import type { Product } from "@/lib/mock-data/products";
import { apiFetch, getApiBaseUrl } from "@/lib/api/client";
import { useAdminAuth } from "@/lib/store/admin-auth-store";
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

/** Module-specific product list: Inventory catalog vs Website products (same table, separate lists). */
export type CatalogProductScope = "inventory" | "website";

type UseCatalogProductsOptions = {
  /** Split Catalog vs Dropshipping product lists (server-side). */
  channel?: CatalogProductChannel;
  scope?: CatalogProductScope;
  /** Load only products of this status (server-side), e.g. "unlisted" or "published"; "!unlisted" leaves that status out. */
  status?: string;
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
  /** When the whole list was last loaded in full (a refresh with only the changes keeps this). */
  fullAt?: number;
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

function productListCacheKey(channel?: CatalogProductChannel, scope?: CatalogProductScope, status?: string) {
  const base = channel ?? "all";
  const keyed = scope ? `${base}:${scope}` : base;
  return status ? `${keyed}#${status}` : keyed;
}

/**
 * The list is also kept in this browser (IndexedDB), so opening the page again shows it at once and only the products that
 * changed since are fetched - not the whole catalog again. Bump CACHE_VERSION when the shape of a list row changes.
 * A full reload still happens on the Refresh button and when the saved copy is older than FULL_RELOAD_MS (stock, brand
 * names ... change outside the product's own row, so a copy must not live forever).
 */
const CACHE_VERSION = 1;
const FULL_RELOAD_MS = 6 * 60 * 60 * 1000;

function persistKey(key: string): string | null {
  const user = useAdminAuth.getState().user;
  if (!user) return null;
  return `v${CACHE_VERSION}|${getApiBaseUrl()}|${user.id}|${user.company_id ?? ""}|${key}`;
}

function openListDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open("againerp-lists", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("lists");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function readStoredList(key: string): Promise<ProductListCacheEntry | null> {
  const id = persistKey(key);
  const db = id ? await openListDb() : null;
  if (!id || !db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction("lists").objectStore("lists").get(id);
      req.onsuccess = () => resolve((req.result as ProductListCacheEntry | undefined) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeStoredList(key: string, entry: ProductListCacheEntry): Promise<void> {
  const id = persistKey(key);
  const db = id ? await openListDb() : null;
  if (!id || !db) return;
  try {
    db.transaction("lists", "readwrite").objectStore("lists").put(entry, id);
  } catch {
    /* storage full / blocked: the list just loads in full next time */
  }
}

const byNewest = (a: Product, b: Product) => {
  const diff = Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  return diff || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
};

async function loadProductList(
  channel?: CatalogProductChannel,
  scope?: CatalogProductScope,
  force = false,
  onPartial?: (entry: ProductListCacheEntry) => void,
  status?: string,
): Promise<ProductListCacheEntry> {
  const key = productListCacheKey(channel, scope, status);
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
    const listParams = () => {
      const params = new URLSearchParams();
      if (channel) params.set("channel", channel);
      if (scope) params.set("scope", scope);
      // "!unlisted" = everything except that status (the Products list hides the Unlisted ones)
      if (status?.startsWith("!")) params.set("exclude_status", status.slice(1));
      else if (status) params.set("status", status); // only the rows the screen needs (36k products incl. 24k drafts is too many to load for nothing)
      return params;
    };
    const fetchPage = (page: number, since?: string) => {
      const params = listParams();
      params.set("per_page", String(PRODUCT_LIST_PAGE_SIZE));
      params.set("page", String(page));
      params.set("fields", "list");
      if (since) params.set("updated_since", since);
      return apiFetch<ApiProductListResponse>(
        `/api/v1/catalog/products?${params}`,
        force || since ? { cache: "no-store" } : undefined,
      );
    };

    // Every page of a list request (page 1 first, the rest in parallel); `onProgress` gets the rows so far.
    const fetchAll = async (since: string | undefined, onProgress?: (rows: ApiCatalogProduct[], total: number) => void) => {
      const pages: ApiCatalogProduct[][] = [];
      const first = await fetchPage(1, since);
      pages[0] = first.data;
      const pageCount = Math.min(Math.ceil(first.meta.count / PRODUCT_LIST_PAGE_SIZE), PRODUCT_LIST_MAX_PAGES);
      let lastPartialAt = 0;
      const emitPartial = () => {
        if (!onProgress || Date.now() - lastPartialAt < PRODUCT_LIST_PARTIAL_MS) return;
        lastPartialAt = Date.now();
        onProgress(pages.flat(), first.meta.count);
      };
      if (pageCount > 1) emitPartial();
      let nextPage = 2;
      const worker = async () => {
        while (nextPage <= pageCount) {
          const page = nextPage;
          nextPage += 1;
          pages[page - 1] = (await fetchPage(page, since)).data;
          emitPartial();
        }
      };
      await Promise.all(Array.from({ length: Math.min(PRODUCT_LIST_CONCURRENCY, pageCount - 1) }, worker));
      return { rows: pages.flat(), total: first.meta.count };
    };

    const toProducts = (rows: ApiCatalogProduct[]) => {
      const seen = new Set<string>();
      return rows.filter((row) => !seen.has(row.id) && seen.add(row.id)).map(apiProductToProduct);
    };
    const finish = (entry: ProductListCacheEntry) => {
      productListCache.set(key, entry);
      void writeStoredList(key, entry);
      return entry;
    };

    // 1. A copy from earlier (this tab, or this browser's storage): show it now and fetch only what changed.
    const stored = !force ? (cached ?? (await readStoredList(key))) : null;
    if (stored && stored.products.length && Date.now() - (stored.fullAt ?? stored.savedAt) < FULL_RELOAD_MS) {
      onPartial?.(stored);
      try {
        const newest = stored.products.reduce((max, p) => (p.updatedAt > max ? p.updatedAt : max), "");
        const [changed, idRes] = await Promise.all([
          fetchAll(newest || undefined),
          apiFetch<{ data: string[] }>(`/api/v1/catalog/products/list-ids?${listParams()}`, { cache: "no-store" }),
        ]);
        const serverIds = new Set(idRes.data);
        const merged = new Map(stored.products.filter((p) => serverIds.has(p.id)).map((p) => [p.id, p]));
        for (const product of toProducts(changed.rows)) merged.set(product.id, product);
        // every id the server lists must now be here; if not (rows we never saw), do the full load below
        if ([...serverIds].every((id) => merged.has(id))) {
          const products = [...merged.values()].sort(byNewest);
          return finish({ products, total: products.length, savedAt: Date.now(), fullAt: stored.fullAt ?? stored.savedAt });
        }
      } catch {
        /* fall back to the full load */
      }
    }

    // 2. Nothing saved (or it is old / out of step): load everything.
    const all = await fetchAll(undefined, (rows, total) => onPartial?.({ products: toProducts(rows), total, savedAt: Date.now() }));
    const now = Date.now();
    return finish({ products: toProducts(all.rows), total: all.total, savedAt: now, fullAt: now });
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
  const scope = options.scope;
  const status = options.status;
  const cached = productListCache.get(productListCacheKey(channel, scope, status));
  const [products, setProducts] = useState<Product[]>(cached?.products ?? []);
  const [total, setTotal] = useState(cached?.total ?? 0);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    const currentCache = productListCache.get(productListCacheKey(channel, scope, status));
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
      const result = await loadProductList(channel, scope, force, (partial) => {
        // Show rows as pages arrive instead of a spinner for the whole catalog.
        setProducts(partial.products);
        setTotal(partial.total);
        setLoading(false);
      }, status);
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
  }, [channel, scope, status]);

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
    // scoped lists only gain the product when it belongs to that module
    if (key.endsWith(":inventory") && input.in_inventory === false) continue;
    if (key.endsWith(":website") && input.on_website === false) continue;
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
  return updateCatalogProduct(id, { status: "published" });
}

export async function unpublishProductFromApi(id: string): Promise<ProductDetail> {
  return updateCatalogProduct(id, { status: "unlisted" });
}

/** Runs `worker` over `items` a few at a time (a bulk action over hundreds of rows must not open hundreds of API
    requests at once — the API's database pool is small and the rest would time out). One failure never stops the
    others: the result lists what worked and what did not. */
export async function runBulk<T>(
  items: T[],
  worker: (item: T) => Promise<unknown>,
  limit = 4,
  onProgress?: (done: number, total: number) => void,
): Promise<{ ok: T[]; failed: { item: T; error: string }[] }> {
  const ok: T[] = [];
  const failed: { item: T; error: string }[] = [];
  let next = 0;
  let done = 0;
  const lane = async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        await worker(item);
        ok.push(item);
      } catch (err) {
        failed.push({ item, error: err instanceof Error ? err.message : String(err) });
      }
      onProgress?.(++done, items.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return { ok, failed };
}
