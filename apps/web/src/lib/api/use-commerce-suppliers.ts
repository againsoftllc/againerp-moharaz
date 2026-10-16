"use client";

import { useCallback, useEffect, useState } from "react";
import type { Supplier, SupplierDetail, SupplierStatus } from "@/lib/mock-data/suppliers";
import { apiFetch } from "@/lib/api/client";
import {
  apiSupplierToSupplier,
  apiSupplierToSupplierDetail,
  buildSupplierQuery,
  supplierCreateToApiPayload,
  supplierUpdateToApiPayload,
  type ApiSupplierListResponse,
  type ApiSupplierResponse,
  type CreateSupplierInput,
  type SupplierListParams,
  type UpdateSupplierInput,
} from "@/lib/api/commerce-suppliers";

type UseCommerceSuppliersState = {
  suppliers: Supplier[];
  total: number;
  totalSpendYtd: number;
  loading: boolean;
  error: string | null;
  refetch: (params?: SupplierListParams) => Promise<void>;
};

export function useCommerceSuppliers(initialParams?: SupplierListParams): UseCommerceSuppliersState {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [total, setTotal] = useState(0);
  const [totalSpendYtd, setTotalSpendYtd] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async (params?: SupplierListParams) => {
    setLoading(true);
    setError(null);
    try {
      const query = buildSupplierQuery(params ?? initialParams);
      const res = await apiFetch<ApiSupplierListResponse>(`/api/v1/commerce/suppliers${query}`);
      setSuppliers(res.data.map(apiSupplierToSupplier));
      setTotal(res.meta.count);
      setTotalSpendYtd(Number(res.meta.total_spend_ytd));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load suppliers";
      setError(message);
      setSuppliers([]);
      setTotal(0);
      setTotalSpendYtd(0);
    } finally {
      setLoading(false);
    }
  }, [initialParams]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { suppliers, total, totalSpendYtd, loading, error, refetch };
}

export function useCommerceSupplier(supplierId: string) {
  const [supplier, setSupplier] = useState<SupplierDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!supplierId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<ApiSupplierResponse>(`/api/v1/commerce/suppliers/${supplierId}`);
      setSupplier(apiSupplierToSupplierDetail(res.data));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load supplier";
      setError(message);
      setSupplier(null);
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { supplier, loading, error, refetch };
}

export async function fetchCommerceSupplier(id: string): Promise<SupplierDetail> {
  const res = await apiFetch<ApiSupplierResponse>(`/api/v1/commerce/suppliers/${id}`);
  return apiSupplierToSupplierDetail(res.data);
}

export async function updateCommerceSupplier(id: string, input: UpdateSupplierInput): Promise<SupplierDetail> {
  const res = await apiFetch<ApiSupplierResponse>(`/api/v1/commerce/suppliers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(supplierUpdateToApiPayload(input)),
  });
  return apiSupplierToSupplierDetail(res.data);
}

export async function updateCommerceSupplierStatus(id: string, status: SupplierStatus): Promise<SupplierDetail> {
  return updateCommerceSupplier(id, { status });
}

export async function createCommerceSupplier(input: CreateSupplierInput): Promise<SupplierDetail> {
  const res = await apiFetch<ApiSupplierResponse>("/api/v1/commerce/suppliers", {
    method: "POST",
    body: JSON.stringify(supplierCreateToApiPayload(input)),
  });
  return apiSupplierToSupplierDetail(res.data);
}

export async function deleteCommerceSupplier(id: string): Promise<void> {
  await apiFetch(`/api/v1/commerce/suppliers/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function bulkDeleteCommerceSuppliers(
  ids: string[],
): Promise<{ deleted: number; skipped: string[] }> {
  const res = await apiFetch<{ data: { deleted: number; skipped: string[] } }>(
    "/api/v1/commerce/suppliers/bulk-delete",
    {
      method: "POST",
      body: JSON.stringify({ ids }),
    },
  );
  return res.data;
}
