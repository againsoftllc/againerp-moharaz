"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProductCollection } from "@/lib/mock-data/collections";
import { apiFetch } from "@/lib/api/client";
import {
  apiCollectionToCollection,
  collectionToApiCreatePayload,
  collectionToApiUpdatePayload,
  partialCollectionToApiUpdate,
  type ApiCollectionListResponse,
  type ApiCollectionResponse,
  type CreateCatalogCollectionInput,
  type UpdateCatalogCollectionInput,
} from "@/lib/api/catalog-collections";

type UseCatalogCollectionsState = {
  collections: ProductCollection[];
  total: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

export function useCatalogCollections(): UseCatalogCollectionsState {
  const [collections, setCollections] = useState<ProductCollection[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<ApiCollectionListResponse>("/api/v1/catalog/collections");
      setCollections(res.data.map(apiCollectionToCollection));
      setTotal(res.meta.count);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load collections";
      setError(message);
      setCollections([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { collections, total, loading, error, refetch };
}

export async function fetchCatalogCollection(id: string): Promise<ProductCollection> {
  const res = await apiFetch<ApiCollectionResponse>(`/api/v1/catalog/collections/${id}`);
  return apiCollectionToCollection(res.data);
}

export async function createCatalogCollection(
  input: CreateCatalogCollectionInput,
): Promise<ProductCollection> {
  const res = await apiFetch<ApiCollectionResponse>("/api/v1/catalog/collections", {
    method: "POST",
    body: JSON.stringify(collectionToApiCreatePayload(input)),
  });
  return apiCollectionToCollection(res.data);
}

export async function updateCatalogCollection(
  id: string,
  input: UpdateCatalogCollectionInput,
): Promise<ProductCollection> {
  const res = await apiFetch<ApiCollectionResponse>(`/api/v1/catalog/collections/${id}`, {
    method: "PATCH",
    body: JSON.stringify(collectionToApiUpdatePayload(input)),
  });
  return apiCollectionToCollection(res.data);
}

export async function patchCatalogCollection(
  id: string,
  patch: Partial<ProductCollection>,
): Promise<ProductCollection> {
  return updateCatalogCollection(id, partialCollectionToApiUpdate(patch));
}

export async function reorderCatalogCollections(orderedIds: string[]): Promise<void> {
  await apiFetch<ApiCollectionListResponse>("/api/v1/catalog/collections/reorder", {
    method: "PATCH",
    body: JSON.stringify({ ordered_ids: orderedIds }),
  });
}

export async function deleteCatalogCollection(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/catalog/collections/${id}`, { method: "DELETE" });
}

export async function deleteCatalogCollections(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => deleteCatalogCollection(id)));
}

export async function bulkPatchCatalogCollections(
  targets: ProductCollection[],
  patch: Partial<ProductCollection>,
): Promise<void> {
  const payload = partialCollectionToApiUpdate(patch);
  await Promise.all(targets.map((c) => updateCatalogCollection(c.id, payload)));
}
