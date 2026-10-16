"use client";

import { useCallback, useEffect, useState } from "react";
import type { Brand } from "@/lib/mock-data/brands";
import { apiFetch } from "@/lib/api/client";
import { createSoftListCache } from "@/lib/api/soft-list-cache";
import {
  apiBrandToBrand,
  brandToApiCreatePayload,
  brandToApiUpdatePayload,
  partialBrandToApiUpdate,
  type ApiBrandListResponse,
  type ApiBrandResponse,
  type CreateCatalogBrandInput,
  type UpdateCatalogBrandInput,
} from "@/lib/api/catalog-brands";

export type CatalogBrandChannel = "catalog" | "dropshipping";

type UseCatalogBrandsOptions = {
  channel?: CatalogBrandChannel;
};

type UseCatalogBrandsState = {
  brands: Brand[];
  total: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

const brandListCache = createSoftListCache<Brand>();

function cacheKey(channel?: CatalogBrandChannel) {
  return channel ?? "all";
}

export function useCatalogBrands(options: UseCatalogBrandsOptions = {}): UseCatalogBrandsState {
  const channel = options.channel;
  const key = cacheKey(channel);
  const seeded = brandListCache.get(key);
  const [brands, setBrands] = useState<Brand[]>(seeded?.items ?? []);
  const [total, setTotal] = useState(seeded?.total ?? 0);
  const [loading, setLoading] = useState(!seeded);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (force = false) => {
      const current = brandListCache.get(key);
      if (!force && current && Date.now() - current.savedAt < 30_000) {
        setBrands(current.items);
        setTotal(current.total);
        setLoading(false);
        return;
      }
      const hasRows = Boolean(current?.items.length);
      if (!hasRows) setLoading(true);
      setError(null);
      try {
        const entry = await brandListCache.load(
          key,
          async () => {
            const params = new URLSearchParams();
            if (channel) params.set("channel", channel);
            const qs = params.toString();
            const res = await apiFetch<ApiBrandListResponse>(
              qs ? `/api/v1/catalog/brands?${qs}` : "/api/v1/catalog/brands",
              force ? { cache: "no-store" } : undefined,
            );
            return {
              items: (res.data ?? []).map(apiBrandToBrand),
              total: res.meta?.count ?? res.data?.length ?? 0,
            };
          },
          { force },
        );
        setBrands(entry.items);
        setTotal(entry.total);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load brands";
        setError(message);
        if (!hasRows) {
          setBrands([]);
          setTotal(0);
        }
      } finally {
        setLoading(false);
      }
    },
    [channel, key],
  );

  useEffect(() => {
    const timer = setTimeout(() => void load(false), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const refetch = useCallback(() => load(true), [load]);

  return { brands, total, loading, error, refetch };
}

export async function fetchCatalogBrand(id: string): Promise<Brand> {
  const res = await apiFetch<ApiBrandResponse>(`/api/v1/catalog/brands/${id}`);
  return apiBrandToBrand(res.data);
}

export async function createCatalogBrand(input: CreateCatalogBrandInput): Promise<Brand> {
  const res = await apiFetch<ApiBrandResponse>("/api/v1/catalog/brands", {
    method: "POST",
    body: JSON.stringify(brandToApiCreatePayload(input)),
  });
  brandListCache.clear();
  return apiBrandToBrand(res.data);
}

export async function updateCatalogBrand(
  id: string,
  input: UpdateCatalogBrandInput,
): Promise<Brand> {
  const res = await apiFetch<ApiBrandResponse>(`/api/v1/catalog/brands/${id}`, {
    method: "PATCH",
    body: JSON.stringify(brandToApiUpdatePayload(input)),
  });
  brandListCache.clear();
  return apiBrandToBrand(res.data);
}

export async function patchCatalogBrand(id: string, patch: Partial<Brand>): Promise<Brand> {
  return updateCatalogBrand(id, partialBrandToApiUpdate(patch));
}

export async function reorderCatalogBrands(orderedIds: string[]): Promise<void> {
  await apiFetch<ApiBrandListResponse>("/api/v1/catalog/brands/reorder", {
    method: "PATCH",
    body: JSON.stringify({ ordered_ids: orderedIds }),
  });
  brandListCache.clear();
}

export async function deleteCatalogBrand(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/catalog/brands/${id}`, { method: "DELETE" });
  brandListCache.clear();
}

export async function deleteCatalogBrands(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => deleteCatalogBrand(id)));
  brandListCache.clear();
}

export async function bulkPatchCatalogBrands(
  targets: Brand[],
  patch: Partial<Brand>,
): Promise<void> {
  const payload = partialBrandToApiUpdate(patch);
  await Promise.all(targets.map((b) => updateCatalogBrand(b.id, payload)));
}
