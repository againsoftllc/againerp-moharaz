"use client";

import { useCallback, useEffect, useState } from "react";
import { stockMoveAnalysisSeed, type StockMoveAnalysisRow } from "@/lib/stock/stock-move-analysis";

type UseStockMoveAnalysisState = {
  rows: StockMoveAnalysisRow[];
  loading: boolean;
  fromApi: boolean;
  refetch: () => Promise<void>;
};

/** Moves analysis — mock seed (API enrichment later). */
export function useStockMoveAnalysis(): UseStockMoveAnalysisState {
  const [rows, setRows] = useState<StockMoveAnalysisRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromApi, setFromApi] = useState(false);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      setRows(stockMoveAnalysisSeed);
      setFromApi(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { rows, loading, fromApi, refetch };
}
