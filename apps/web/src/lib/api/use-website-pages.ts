"use client";

import { useCallback, useEffect, useState } from "react";
import type { WebsiteManagedPage } from "@/lib/website/pages/types";
import {
  fetchWebsitePage,
  fetchWebsitePages,
} from "@/lib/api/website-pages";

export function useWebsitePages() {
  const [pages, setPages] = useState<WebsiteManagedPage[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchWebsitePages();
      setPages(rows);
      setTotal(rows.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pages");
      setPages([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { pages, setPages, total, loading, error, refetch };
}

export function useWebsitePage(pageId: string) {
  const [page, setPage] = useState<WebsiteManagedPage | null>(null);
  const [loading, setLoading] = useState(Boolean(pageId));
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!pageId) {
      setPage(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const row = await fetchWebsitePage(pageId);
      setPage(row);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load page");
      setPage(null);
    } finally {
      setLoading(false);
    }
  }, [pageId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { page, setPage, loading, error, refetch };
}
