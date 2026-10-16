"use client";

import { useCallback, useEffect, useState } from "react";
import type { CatalogFacetFilter } from "@/lib/mock-data/catalog-filters";
import { apiFetch } from "@/lib/api/client";
import {
  apiFilterToFilter,
  filterToApiCreatePayload,
  filterToApiUpdatePayload,
  partialFilterToApiUpdate,
  type ApiFilterListResponse,
  type ApiFilterResponse,
  type CreateCatalogFilterInput,
  type UpdateCatalogFilterInput,
} from "@/lib/api/catalog-filters";

type UseCatalogFiltersState = {
  filters: CatalogFacetFilter[];
  total: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

export function useCatalogFilters(): UseCatalogFiltersState {
  const [filters, setFilters] = useState<CatalogFacetFilter[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<ApiFilterListResponse>("/api/v1/catalog/filters");
      setFilters(res.data.map(apiFilterToFilter));
      setTotal(res.meta.count);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load filters";
      setError(message);
      setFilters([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { filters, total, loading, error, refetch };
}

export async function fetchCatalogFilter(id: string): Promise<CatalogFacetFilter> {
  const res = await apiFetch<ApiFilterResponse>(`/api/v1/catalog/filters/${id}`);
  return apiFilterToFilter(res.data);
}

export async function createCatalogFilter(input: CreateCatalogFilterInput): Promise<CatalogFacetFilter> {
  const res = await apiFetch<ApiFilterResponse>("/api/v1/catalog/filters", {
    method: "POST",
    body: JSON.stringify(filterToApiCreatePayload(input)),
  });
  return apiFilterToFilter(res.data);
}

export async function updateCatalogFilter(
  id: string,
  input: UpdateCatalogFilterInput,
): Promise<CatalogFacetFilter> {
  const res = await apiFetch<ApiFilterResponse>(`/api/v1/catalog/filters/${id}`, {
    method: "PATCH",
    body: JSON.stringify(filterToApiUpdatePayload(input)),
  });
  return apiFilterToFilter(res.data);
}

export async function patchCatalogFilter(
  id: string,
  patch: Partial<CatalogFacetFilter>,
): Promise<CatalogFacetFilter> {
  return updateCatalogFilter(id, partialFilterToApiUpdate(patch));
}

export async function reorderCatalogFilters(orderedIds: string[]): Promise<void> {
  await apiFetch<ApiFilterListResponse>("/api/v1/catalog/filters/reorder", {
    method: "PATCH",
    body: JSON.stringify({ ordered_ids: orderedIds }),
  });
}

export async function deleteCatalogFilter(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/catalog/filters/${id}`, { method: "DELETE" });
}

export async function deleteCatalogFilters(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => deleteCatalogFilter(id)));
}

export async function bulkPatchCatalogFilters(
  targets: CatalogFacetFilter[],
  patch: Partial<CatalogFacetFilter>,
): Promise<void> {
  const payload = partialFilterToApiUpdate(patch);
  await Promise.all(targets.map((f) => updateCatalogFilter(f.id, payload)));
}
