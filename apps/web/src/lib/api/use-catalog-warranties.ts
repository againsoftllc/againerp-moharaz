"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import type {
  ApiCatalogWarranty,
  ApiWarrantyListResponse,
  ApiWarrantyResponse,
} from "@/lib/api/catalog-warranties";

export type UseCatalogWarrantiesState = {
  rows: ApiCatalogWarranty[];
  warranties: string[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

/** Admin-managed, backend-persisted warranty list — shared across the whole company. */
export function useCatalogWarranties(): UseCatalogWarrantiesState {
  const [rows, setRows] = useState<ApiCatalogWarranty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<ApiWarrantyListResponse>("/api/v1/catalog/warranties");
      setRows(res.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load warranties");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { rows, warranties: rows.map((r) => r.name), loading, error, refetch: load };
}

export async function createCatalogWarranty(name: string): Promise<ApiCatalogWarranty> {
  const res = await apiFetch<ApiWarrantyResponse>("/api/v1/catalog/warranties", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return res.data;
}

export async function renameCatalogWarranty(id: string, name: string): Promise<ApiCatalogWarranty> {
  const res = await apiFetch<ApiWarrantyResponse>(`/api/v1/catalog/warranties/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
  return res.data;
}

export async function deleteCatalogWarranty(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/catalog/warranties/${id}`, { method: "DELETE" });
}
