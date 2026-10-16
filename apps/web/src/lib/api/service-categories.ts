"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";

export type ServiceCategory = {
  id: string;
  company_id: string;
  parent_id: string | null;
  name: string;
  created_at: string;
  updated_at: string;
};

export type ServiceCategoryNode = ServiceCategory & { children: ServiceCategoryNode[] };

type ServiceCategoryListResponse = { data: ServiceCategory[] };
type ServiceCategoryResponse = { data: ServiceCategory };

export async function fetchServiceCategories(): Promise<ServiceCategory[]> {
  const res = await apiFetch<ServiceCategoryListResponse>("/api/v1/service-categories");
  return res.data;
}

export async function createServiceCategory(
  name: string,
  parentId?: string | null,
): Promise<ServiceCategory> {
  const res = await apiFetch<ServiceCategoryResponse>("/api/v1/service-categories", {
    method: "POST",
    body: JSON.stringify({ name, parent_id: parentId ?? null }),
  });
  return res.data;
}

export function buildServiceCategoryTree(categories: ServiceCategory[]): ServiceCategoryNode[] {
  const byId = new Map<string, ServiceCategoryNode>();
  categories.forEach((c) => byId.set(c.id, { ...c, children: [] }));
  const roots: ServiceCategoryNode[] = [];
  byId.forEach((node) => {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  });
  const sortRec = (nodes: ServiceCategoryNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

export type FlatServiceCategory = { id: string; name: string; depth: number };

export function flattenServiceCategoryTree(
  nodes: ServiceCategoryNode[],
  depth = 0,
): FlatServiceCategory[] {
  const out: FlatServiceCategory[] = [];
  for (const node of nodes) {
    out.push({ id: node.id, name: node.name, depth });
    out.push(...flattenServiceCategoryTree(node.children, depth + 1));
  }
  return out;
}

export function useServiceCategories() {
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCategories(await fetchServiceCategories());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load categories");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { categories, loading, error, refetch };
}
