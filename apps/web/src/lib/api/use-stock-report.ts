"use client";

import { useCallback, useEffect, useState } from "react";
import type { StockItem } from "@/lib/mock-data/inventory";
import { apiFetch } from "@/lib/api/client";
import {
  apiStockToStockItem,
  buildStockQuery,
  type ApiStockListResponse,
  type StockListParams,
} from "@/lib/api/inventory";
import { stockReportSeed, type StockReportRow } from "@/lib/stock/stock-report";

function aggregateToReportRows(items: StockItem[]): StockReportRow[] {
  const map = new Map<string, StockReportRow>();
  for (const item of items) {
    const key = item.name;
    const totalValue = item.onHand * item.unitCost;
    const existing = map.get(key);
    if (existing) {
      existing.qty_on_hand += item.onHand;
      existing.qty_free += item.available;
      existing.total_value += totalValue;
      existing.incoming += item.incoming;
      existing.outgoing += item.reserved;
    } else {
      map.set(key, {
        id: item.id,
        product_name: item.name,
        qty_on_hand: item.onHand,
        qty_free: item.available,
        unit_cost: item.unitCost,
        total_value: totalValue,
        incoming: item.incoming,
        outgoing: item.reserved,
      });
    }
  }
  return Array.from(map.values());
}

type UseStockReportState = {
  rows: StockReportRow[];
  loading: boolean;
  error: string | null;
  fromApi: boolean;
  refetch: (params?: StockListParams) => Promise<void>;
};

export function useStockReport(initialSearch?: string): UseStockReportState {
  const [rows, setRows] = useState<StockReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromApi, setFromApi] = useState(false);

  const refetch = useCallback(async (params?: StockListParams) => {
    setLoading(true);
    setError(null);
    try {
      const query = buildStockQuery({ search: params?.search ?? initialSearch });
      const res = await apiFetch<ApiStockListResponse>(`/api/v1/inventory/stock${query}`);
      const items = res.data.map(apiStockToStockItem);
      const aggregated = aggregateToReportRows(items);
      setRows(aggregated.length > 0 ? aggregated : stockReportSeed);
      setFromApi(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load stock report";
      setError(message);
      setRows(stockReportSeed);
      setFromApi(false);
    } finally {
      setLoading(false);
    }
  }, [initialSearch]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { rows, loading, error, fromApi, refetch };
}
