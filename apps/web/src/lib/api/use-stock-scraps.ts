"use client";

import { useCallback, useEffect, useState } from "react";
import type { StockScrap } from "@/lib/stock/stock-scrap";
import { stockScrapsSeed } from "@/lib/stock/stock-scrap";
import {
  fetchStockScraps,
  patchStockScrap,
  type StockScrapListParams,
  type UpdateStockScrapInput,
} from "@/lib/api/stock-scraps";

type UseStockScrapsState = {
  scraps: StockScrap[];
  loading: boolean;
  error: string | null;
  fromApi: boolean;
  refetch: (params?: StockScrapListParams) => Promise<void>;
  saveScrap: (id: string, input: UpdateStockScrapInput) => Promise<StockScrap>;
};

export function useStockScraps(initialSearch?: string): UseStockScrapsState {
  const [scraps, setScraps] = useState<StockScrap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromApi, setFromApi] = useState(false);

  const refetch = useCallback(
    async (params?: StockScrapListParams) => {
      setLoading(true);
      setError(null);
      try {
        const rows = await fetchStockScraps({ search: params?.search ?? initialSearch });
        setScraps(rows);
        setFromApi(true);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load scraps";
        setError(message);
        setScraps(stockScrapsSeed);
        setFromApi(false);
      } finally {
        setLoading(false);
      }
    },
    [initialSearch],
  );

  const saveScrap = useCallback(async (id: string, input: UpdateStockScrapInput) => {
    try {
      const saved = await patchStockScrap(id, input);
      setScraps((prev) => prev.map((s) => (s.id === saved.id ? saved : s)));
      setFromApi(true);
      return saved;
    } catch {
      setScraps((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...input } : s)),
      );
      const row = scraps.find((s) => s.id === id);
      return row!;
    }
  }, [scraps]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { scraps, loading, error, fromApi, refetch, saveScrap };
}
