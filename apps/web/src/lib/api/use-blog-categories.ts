"use client";

import { useCallback, useEffect, useState } from "react";
import type { BlogCategory } from "@/lib/blog/blog-category";
import {
  createBlogCategory,
  fetchBlogCategories,
  updateBlogCategory,
  type CreateBlogCategoryInput,
  type UpdateBlogCategoryInput,
} from "@/lib/api/blog-categories";

type UseBlogCategoriesState = {
  categories: BlogCategory[];
  total: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  saveCategory: (
    id: string | null,
    input: CreateBlogCategoryInput | UpdateBlogCategoryInput,
  ) => Promise<BlogCategory>;
};

export function useBlogCategories(): UseBlogCategoriesState {
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchBlogCategories();
      setCategories(rows);
      setTotal(rows.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load blog categories");
      setCategories([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const saveCategory = useCallback(
    async (id: string | null, input: CreateBlogCategoryInput | UpdateBlogCategoryInput) => {
      const saved = id
        ? await updateBlogCategory(id, input)
        : await createBlogCategory(input as CreateBlogCategoryInput);
      setCategories((rows) => {
        const idx = rows.findIndex((row) => row.id === saved.id);
        if (idx === -1) return [...rows, saved].sort((a, b) => a.sortOrder - b.sortOrder);
        const next = [...rows];
        next[idx] = saved;
        return next.sort((a, b) => a.sortOrder - b.sortOrder);
      });
      setTotal((count) => (id ? count : count + 1));
      return saved;
    },
    [],
  );

  return { categories, total, loading, error, refetch, saveCategory };
}
