"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import type { ApiStockListResponse } from "@/lib/api/inventory";
import { apiStockToStockItem } from "@/lib/api/inventory";
import {
  inventoryProductsSeed,
  type InventoryProductRow,
} from "@/lib/stock/inventory-product";

function aggregateStockToProducts(items: ReturnType<typeof apiStockToStockItem>[]): InventoryProductRow[] {
  const map = new Map<string, InventoryProductRow>();
  for (const item of items) {
    const existing = map.get(item.name);
    const forecast = item.onHand + item.incoming - item.reserved;
    if (existing) {
      existing.qty_on_hand += item.onHand;
      existing.qty_forecast += forecast;
      existing.cost = item.unitCost;
    } else {
      map.set(item.name, {
        id: item.id,
        name: item.name,
        internal_reference: item.sku !== item.name ? item.sku : "",
        sales_price: 1,
        cost: item.unitCost,
        qty_on_hand: item.onHand,
        qty_forecast: forecast,
        category: "Goods",
      });
    }
  }
  const rows = Array.from(map.values());
  return rows.length > 0 ? rows : inventoryProductsSeed;
}

type UseInventoryProductsState = {
  products: InventoryProductRow[];
  loading: boolean;
  error: string | null;
  fromApi: boolean;
  refetch: (search?: string) => Promise<void>;
};

export function useInventoryProducts(initialSearch?: string): UseInventoryProductsState {
  const [products, setProducts] = useState<InventoryProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromApi, setFromApi] = useState(false);

  const refetch = useCallback(async (search?: string) => {
    setLoading(true);
    setError(null);
    try {
      const q = search ?? initialSearch;
      const query = q?.trim() ? `?search=${encodeURIComponent(q.trim())}` : "";
      const res = await apiFetch<ApiStockListResponse>(`/api/v1/inventory/stock${query}`);
      const items = res.data.map(apiStockToStockItem);
      const rows = aggregateStockToProducts(items);
      setProducts(rows.length >= 3 ? rows : inventoryProductsSeed);
      setFromApi(rows.length >= 3);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load products";
      setError(message);
      setProducts(inventoryProductsSeed);
      setFromApi(false);
    } finally {
      setLoading(false);
    }
  }, [initialSearch]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { products, loading, error, fromApi, refetch };
}
