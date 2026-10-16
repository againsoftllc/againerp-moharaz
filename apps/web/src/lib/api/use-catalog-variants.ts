"use client";

import { useCallback, useState } from "react";
import type { CatalogVariantRow } from "@/lib/mock-data/variants";
import { apiFetch } from "@/lib/api/client";
import {
  apiVariantToRow,
  type ApiVariantListResponse,
} from "@/lib/api/catalog-variants";

type UseCatalogVariantsState = {
  variants: CatalogVariantRow[];
  total: number;
  loading: boolean;
  error: string | null;
  refetch: (params?: { search?: string; category?: string }) => Promise<void>;
};

export function useCatalogVariants(): UseCatalogVariantsState {
  const [variants, setVariants] = useState<CatalogVariantRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async (params?: { search?: string; category?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (params?.search?.trim()) query.set("search", params.search.trim());
      if (params?.category && params.category !== "all") query.set("category", params.category);
      const suffix = query.toString() ? `?${query.toString()}` : "";
      const res = await apiFetch<ApiVariantListResponse>(`/api/v1/catalog/variants${suffix}`);
      setVariants(res.data.map(apiVariantToRow));
      setTotal(res.meta.count);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load variants";
      setError(message);
      setVariants([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  return { variants, total, loading, error, refetch };
}
