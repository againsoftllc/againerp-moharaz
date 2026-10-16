"use client";

import { useCallback, useEffect, useState } from "react";
import type { WebsiteLayout } from "@/lib/mock-data/website-layouts";
import { fetchWebsiteLayouts } from "@/lib/api/website-layouts";

export function useWebsiteLayouts() {
  const [layouts, setLayouts] = useState<WebsiteLayout[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchWebsiteLayouts();
      setLayouts(rows);
      setTotal(rows.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load layouts");
      setLayouts([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { layouts, setLayouts, total, loading, error, refetch };
}
