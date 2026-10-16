"use client";

import { useCallback, useEffect, useState } from "react";
import type { Category } from "@/lib/mock-data/categories";
import { apiFetch } from "@/lib/api/client";
import {
  apiCategoryToCategory,
  categoryToApiCreatePayload,
  categoryToApiUpdatePayload,
  partialCategoryToApiUpdate,
  type ApiCategoryListResponse,
  type ApiCategoryResponse,
  type CreateCatalogCategoryInput,
  type UpdateCatalogCategoryInput,
} from "@/lib/api/catalog-categories";

export type CatalogCategoryChannel = "catalog" | "dropshipping";

type UseCatalogCategoriesOptions = {
  /** Split Catalog vs Dropshipping (frontstore) category trees (server-side). */
  channel?: CatalogCategoryChannel;
};

type UseCatalogCategoriesState = {
  categories: Category[];
  total: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

type CategoryListCacheEntry = {
  categories: Category[];
  total: number;
  savedAt: number;
};

const CATEGORY_LIST_CACHE_MS = 30_000;
const categoryListCache = new Map<string, CategoryListCacheEntry>();
const categoryListRequests = new Map<string, Promise<CategoryListCacheEntry>>();

function categoryListCacheKey(channel?: CatalogCategoryChannel) {
  return channel ?? "all";
}

async function loadCategoryList(
  channel?: CatalogCategoryChannel,
  force = false,
): Promise<CategoryListCacheEntry> {
  const key = categoryListCacheKey(channel);
  const cached = categoryListCache.get(key);
  if (!force && cached && Date.now() - cached.savedAt < CATEGORY_LIST_CACHE_MS) {
    return cached;
  }

  const pending = categoryListRequests.get(key);
  if (!force && pending) return pending;

  const request = (async () => {
    const params = new URLSearchParams();
    if (channel) params.set("channel", channel);
    const qs = params.toString();
    const res = await apiFetch<ApiCategoryListResponse>(
      qs ? `/api/v1/catalog/categories?${qs}` : "/api/v1/catalog/categories",
      force ? { cache: "no-store" } : undefined,
    );
    const entry = {
      categories: res.data.map(apiCategoryToCategory),
      total: res.meta.count,
      savedAt: Date.now(),
    };
    categoryListCache.set(key, entry);
    return entry;
  })();

  categoryListRequests.set(key, request);
  try {
    return await request;
  } finally {
    if (categoryListRequests.get(key) === request) {
      categoryListRequests.delete(key);
    }
  }
}

export function useCatalogCategories(
  options: UseCatalogCategoriesOptions = {},
): UseCatalogCategoriesState {
  const channel = options.channel;
  const cached = categoryListCache.get(categoryListCacheKey(channel));
  const [categories, setCategories] = useState<Category[]>(cached?.categories ?? []);
  const [total, setTotal] = useState(cached?.total ?? 0);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    const currentCache = categoryListCache.get(categoryListCacheKey(channel));
    const hasRows = Boolean(currentCache?.categories.length);
    if (
      !force &&
      currentCache &&
      Date.now() - currentCache.savedAt < CATEGORY_LIST_CACHE_MS
    ) {
      setCategories(currentCache.categories);
      setTotal(currentCache.total);
      setLoading(false);
      return;
    }

    if (!hasRows) setLoading(true);
    setError(null);
    try {
      const result = await loadCategoryList(channel, force);
      setCategories(result.categories);
      setTotal(result.total);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load categories";
      setError(message);
      if (!hasRows) {
        setCategories([]);
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

  return { categories, total, loading, error, refetch };
}

export async function fetchCatalogCategory(id: string): Promise<Category> {
  const res = await apiFetch<ApiCategoryResponse>(`/api/v1/catalog/categories/${id}`);
  return apiCategoryToCategory(res.data);
}

export async function createCatalogCategory(input: CreateCatalogCategoryInput): Promise<Category> {
  const res = await apiFetch<ApiCategoryResponse>("/api/v1/catalog/categories", {
    method: "POST",
    body: JSON.stringify(categoryToApiCreatePayload(input)),
  });
  categoryListCache.clear();
  return apiCategoryToCategory(res.data);
}

export async function updateCatalogCategory(
  id: string,
  input: UpdateCatalogCategoryInput,
): Promise<Category> {
  const res = await apiFetch<ApiCategoryResponse>(`/api/v1/catalog/categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(categoryToApiUpdatePayload(input)),
  });
  categoryListCache.clear();
  return apiCategoryToCategory(res.data);
}

export async function patchCatalogCategory(id: string, patch: Partial<Category>): Promise<Category> {
  return updateCatalogCategory(id, partialCategoryToApiUpdate(patch));
}

export async function reorderCatalogCategories(
  parentId: string | null,
  orderedIds: string[],
): Promise<void> {
  await apiFetch<ApiCategoryListResponse>("/api/v1/catalog/categories/reorder", {
    method: "PATCH",
    body: JSON.stringify({ parent_id: parentId, ordered_ids: orderedIds }),
  });
  categoryListCache.clear();
}

export async function deleteCatalogCategory(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/catalog/categories/${id}`, { method: "DELETE" });
  categoryListCache.clear();
}

export async function deleteCatalogCategories(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => deleteCatalogCategory(id)));
  categoryListCache.clear();
}

export async function bulkPatchCatalogCategories(
  targets: Category[],
  patch: Partial<Category>,
): Promise<void> {
  const payload = partialCategoryToApiUpdate(patch);
  await Promise.all(targets.map((c) => updateCatalogCategory(c.id, payload)));
}
