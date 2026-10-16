"use client";

import { useCallback, useEffect, useState } from "react";
import type { ConfiguratorCategory, ConfiguratorStatus } from "@/lib/configurator/types";
import { apiFetch } from "@/lib/api/client";
import {
  apiCategoryToConfiguratorCategory,
  categoryToApiCreatePayload,
  categoryToApiUpdatePayload,
  partialCategoryToApiUpdate,
  type ApiConfiguratorCategoryListResponse,
  type ApiConfiguratorCategoryResponse,
  type CreateConfiguratorCategoryInput,
  type UpdateConfiguratorCategoryInput,
} from "@/lib/api/configurator-categories";

type UseConfiguratorCategoriesState = {
  categories: ConfiguratorCategory[];
  total: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

export function useConfiguratorCategories(profileId?: string): UseConfiguratorCategoriesState {
  const [categories, setCategories] = useState<ConfiguratorCategory[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = profileId ? `?profile_id=${encodeURIComponent(profileId)}` : "";
      const res = await apiFetch<ApiConfiguratorCategoryListResponse>(
        `/api/v1/configurator/categories${qs}`,
      );
      setCategories(res.data.map(apiCategoryToConfiguratorCategory));
      setTotal(res.meta.count);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load configurator categories";
      setError(message);
      setCategories([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { categories, total, loading, error, refetch };
}

export function useConfiguratorCategory(id: string) {
  const [category, setCategory] = useState<ConfiguratorCategory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<ApiConfiguratorCategoryResponse>(
        `/api/v1/configurator/categories/${id}`,
      );
      setCategory(apiCategoryToConfiguratorCategory(res.data));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load category";
      setError(message);
      setCategory(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { category, loading, error, refetch };
}

export async function createConfiguratorCategory(
  input: CreateConfiguratorCategoryInput,
): Promise<ConfiguratorCategory> {
  const res = await apiFetch<ApiConfiguratorCategoryResponse>("/api/v1/configurator/categories", {
    method: "POST",
    body: JSON.stringify(categoryToApiCreatePayload(input)),
  });
  return apiCategoryToConfiguratorCategory(res.data);
}

export async function updateConfiguratorCategory(
  id: string,
  input: UpdateConfiguratorCategoryInput,
): Promise<ConfiguratorCategory> {
  const res = await apiFetch<ApiConfiguratorCategoryResponse>(
    `/api/v1/configurator/categories/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(categoryToApiUpdatePayload(input)),
    },
  );
  return apiCategoryToConfiguratorCategory(res.data);
}

export async function patchConfiguratorCategory(
  id: string,
  patch: Partial<ConfiguratorCategory>,
): Promise<ConfiguratorCategory> {
  return updateConfiguratorCategory(id, partialCategoryToApiUpdate(patch));
}

export async function bulkSetConfiguratorCategoryStatus(
  ids: string[],
  status: ConfiguratorStatus,
): Promise<void> {
  await apiFetch<ApiConfiguratorCategoryListResponse>("/api/v1/configurator/categories/bulk/status", {
    method: "PATCH",
    body: JSON.stringify({ ids, status }),
  });
}

export async function deleteConfiguratorCategory(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/configurator/categories/${id}`, { method: "DELETE" });
}

export async function deleteConfiguratorCategories(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => deleteConfiguratorCategory(id)));
}
