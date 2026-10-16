"use client";

import { useCallback, useEffect, useState } from "react";
import type { CategoryPageContent, WebsiteCategoryPage } from "@/lib/website/website-category-page";
import { defaultCategoryPageContent } from "@/lib/website/website-category-page";
import {
  fetchWebsiteCategoryPage,
  updateWebsiteCategoryPage,
} from "@/lib/api/website-category-page";

type State = {
  page: WebsiteCategoryPage | null;
  content: CategoryPageContent;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  saveContent: (content: CategoryPageContent) => Promise<WebsiteCategoryPage>;
};

export function useWebsiteCategoryPage(): State {
  const [page, setPage] = useState<WebsiteCategoryPage | null>(null);
  const [content, setContent] = useState<CategoryPageContent>(() => defaultCategoryPageContent());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const row = await fetchWebsiteCategoryPage();
      setPage(row);
      setContent(row.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load category page");
      setPage(null);
      setContent(defaultCategoryPageContent());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const saveContent = useCallback(async (next: CategoryPageContent) => {
    const saved = await updateWebsiteCategoryPage({ content: next });
    setPage(saved);
    setContent(saved.content);
    return saved;
  }, []);

  return { page, content, loading, error, refetch, saveContent };
}
