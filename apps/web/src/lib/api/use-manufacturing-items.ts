"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchItems, type ItemRecord } from "@/lib/api/items";

export function useManufacturingItems(search = "") {
  const [items, setItems] = useState<ItemRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchItems({
        module: "manufacturing",
        per_page: 200,
        q: search.trim() || undefined,
      });
      setItems(res.data);
      setTotal(res.meta.count);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load manufactured items");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { items, total, loading, error, refetch };
}
