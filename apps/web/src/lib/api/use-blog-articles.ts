"use client";

import { useCallback, useEffect, useState } from "react";
import type { BlogArticle } from "@/lib/blog/blog-article";
import {
  createBlogArticle,
  fetchBlogArticles,
  updateBlogArticle,
  type CreateBlogArticleInput,
  type UpdateBlogArticleInput,
} from "@/lib/api/blog-articles";

type UseBlogArticlesState = {
  articles: BlogArticle[];
  total: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  saveArticle: (id: string | null, input: CreateBlogArticleInput | UpdateBlogArticleInput) => Promise<BlogArticle>;
};

export function useBlogArticles(): UseBlogArticlesState {
  const [articles, setArticles] = useState<BlogArticle[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchBlogArticles();
      setArticles(rows);
      setTotal(rows.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load blog articles");
      setArticles([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const saveArticle = useCallback(
    async (id: string | null, input: CreateBlogArticleInput | UpdateBlogArticleInput) => {
      const saved = id ? await updateBlogArticle(id, input) : await createBlogArticle(input as CreateBlogArticleInput);
      setArticles((rows) => {
        const idx = rows.findIndex((row) => row.id === saved.id);
        if (idx === -1) return [saved, ...rows];
        const next = [...rows];
        next[idx] = saved;
        return next;
      });
      setTotal((count) => (id ? count : count + 1));
      return saved;
    },
    [],
  );

  return { articles, total, loading, error, refetch, saveArticle };
}
