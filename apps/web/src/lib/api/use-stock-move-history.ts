"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchStockMoveHistory, type StockMoveHistoryListParams } from "@/lib/api/stock-movements";
import { stockMoveHistorySeed, type StockMoveHistoryRow } from "@/lib/stock/stock-move-history";

type UseStockMoveHistoryState = {
  rows: StockMoveHistoryRow[];
  total: number;
  loading: boolean;
  error: string | null;
  fromApi: boolean;
  refetch: (params?: StockMoveHistoryListParams) => Promise<void>;
};

export function useStockMoveHistory(): UseStockMoveHistoryState {
  const [rows, setRows] = useState<StockMoveHistoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromApi, setFromApi] = useState(false);

  const refetch = useCallback(async (params?: StockMoveHistoryListParams) => {
    setLoading(true);
    setError(null);
    try {
      const { rows: next, count } = await fetchStockMoveHistory({ limit: 100, ...params });
      const useSeed = next.length === 0;
      setRows(useSeed ? stockMoveHistorySeed : next);
      setTotal(useSeed ? stockMoveHistorySeed.length : count);
      setFromApi(!useSeed);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load moves history";
      setError(message);
      setRows(stockMoveHistorySeed);
      setTotal(stockMoveHistorySeed.length);
      setFromApi(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { rows, total, loading, error, fromApi, refetch };
}
