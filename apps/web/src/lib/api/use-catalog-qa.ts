"use client";

import { useCallback, useEffect, useState } from "react";
import type { CatalogQa, QaStatus } from "@/lib/mock-data/catalog-qa";
import { apiFetch } from "@/lib/api/client";
import { createSoftListCache } from "@/lib/api/soft-list-cache";
import {
  apiProductQaToQa,
  buildQaQuery,
  productQaCreateToApiPayload,
  productQaUpdateToApiPayload,
  type ApiProductQaListResponse,
  type ApiProductQaResponse,
  type CreateProductQaInput,
  type QaListParams,
  type UpdateProductQaInput,
} from "@/lib/api/catalog-qa";

type UseCatalogQaState = {
  items: CatalogQa[];
  total: number;
  pendingCount: number;
  loading: boolean;
  error: string | null;
  refetch: (params?: QaListParams) => Promise<void>;
};

const qaListCache = createSoftListCache<CatalogQa>();

function cacheKey(params?: QaListParams) {
  return buildQaQuery(params) || "default";
}

export function useCatalogQa(initialParams?: QaListParams): UseCatalogQaState {
  const key = cacheKey(initialParams);
  const seeded = qaListCache.get(key);
  const [items, setItems] = useState<CatalogQa[]>(seeded?.items ?? []);
  const [total, setTotal] = useState(seeded?.total ?? 0);
  const [pendingCount, setPendingCount] = useState(seeded?.meta?.pendingCount ?? 0);
  const [loading, setLoading] = useState(!seeded);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(
    async (params?: QaListParams) => {
      const k = cacheKey(params ?? initialParams);
      const current = qaListCache.get(k);
      const hasRows = Boolean(current?.items.length);
      if (!hasRows) setLoading(true);
      setError(null);
      try {
        const entry = await qaListCache.load(
          k,
          async () => {
            const query = buildQaQuery(params ?? initialParams);
            const res = await apiFetch<ApiProductQaListResponse>(`/api/v1/catalog/qa${query}`, {
              cache: "no-store",
            });
            return {
              items: (res.data ?? []).map(apiProductQaToQa),
              total: res.meta?.count ?? res.data?.length ?? 0,
              meta: { pendingCount: res.meta?.pending_count ?? 0 },
            };
          },
          { force: true },
        );
        setItems(entry.items);
        setTotal(entry.total);
        setPendingCount(entry.meta?.pendingCount ?? 0);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load Q&A";
        setError(message);
        if (!hasRows) {
          setItems([]);
          setTotal(0);
          setPendingCount(0);
        }
      } finally {
        setLoading(false);
      }
    },
    [initialParams],
  );

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { items, total, pendingCount, loading, error, refetch };
}

export async function createCatalogQa(input: CreateProductQaInput): Promise<CatalogQa> {
  const res = await apiFetch<ApiProductQaResponse>(`/api/v1/catalog/qa`, {
    method: "POST",
    body: JSON.stringify(productQaCreateToApiPayload(input)),
  });
  qaListCache.clear();
  return apiProductQaToQa(res.data);
}

export async function updateCatalogQa(id: string, input: UpdateProductQaInput): Promise<CatalogQa> {
  const res = await apiFetch<ApiProductQaResponse>(`/api/v1/catalog/qa/${id}`, {
    method: "PATCH",
    body: JSON.stringify(productQaUpdateToApiPayload(input)),
  });
  qaListCache.clear();
  return apiProductQaToQa(res.data);
}

export async function updateCatalogQaStatus(id: string, status: QaStatus): Promise<CatalogQa> {
  return updateCatalogQa(id, { status });
}
