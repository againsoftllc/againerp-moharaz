"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchStockQuants } from "@/lib/api/stock-quants";
import { stockQuantsSeed } from "@/lib/stock/stock-quant";
import { stockLotsSeed, type StockLotRow } from "@/lib/stock/stock-lot";

function mapQuantsToLots(
  quants: { id: string; product_name: string; lot_name?: string | null; quantity: number }[],
): StockLotRow[] {
  const rows = quants
    .filter((q) => q.lot_name !== null && q.lot_name !== undefined && q.lot_name !== "")
    .map((q) => ({
      id: q.id,
      lot_name: q.lot_name!,
      product_name: q.product_name,
      qty_on_hand: q.quantity,
    }));
  return rows.length > 0 ? rows : stockLotsSeed;
}

type UseStockLotsState = {
  lots: StockLotRow[];
  loading: boolean;
  error: string | null;
  fromApi: boolean;
  refetch: (search?: string) => Promise<void>;
};

export function useStockLots(initialSearch?: string): UseStockLotsState {
  const [lots, setLots] = useState<StockLotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromApi, setFromApi] = useState(false);

  const refetch = useCallback(async (search?: string) => {
    setLoading(true);
    setError(null);
    try {
      const quants = await fetchStockQuants({ search: search ?? initialSearch });
      setLots(mapQuantsToLots(quants));
      setFromApi(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load lots";
      setError(message);
      setLots(mapQuantsToLots(stockQuantsSeed));
      setFromApi(false);
    } finally {
      setLoading(false);
    }
  }, [initialSearch]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { lots, loading, error, fromApi, refetch };
}
