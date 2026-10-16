"use client";

import { useCallback, useEffect, useState } from "react";
import type { StockItem, Warehouse } from "@/lib/mock-data/inventory";
import { apiFetch } from "@/lib/api/client";
import {
  apiStockToStockItem,
  apiWarehouseToWarehouse,
  buildStockQuery,
  stockUpdateToApiPayload,
  type ApiStockListResponse,
  type ApiStockResponse,
  type ApiWarehouseListResponse,
  type StockListParams,
  type UpdateStockLevelInput,
} from "@/lib/api/inventory";

type UseInventoryWarehousesState = {
  warehouses: Warehouse[];
  total: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

export function useInventoryWarehouses(enabled = true): UseInventoryWarehousesState {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!enabled) {
      setWarehouses([]);
      setTotal(0);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<ApiWarehouseListResponse>("/api/v1/inventory/warehouses");
      setWarehouses(res.data.map(apiWarehouseToWarehouse));
      setTotal(res.meta.count);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load warehouses";
      setError(message);
      setWarehouses([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { warehouses, total, loading, error, refetch };
}

type UseInventoryStockState = {
  items: StockItem[];
  total: number;
  totalUnits: number;
  totalValue: number;
  loading: boolean;
  error: string | null;
  refetch: (params?: StockListParams) => Promise<void>;
};

export function useInventoryStock(initialParams?: StockListParams): UseInventoryStockState {
  const [items, setItems] = useState<StockItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalUnits, setTotalUnits] = useState(0);
  const [totalValue, setTotalValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async (params?: StockListParams) => {
    setLoading(true);
    setError(null);
    try {
      const query = buildStockQuery(params ?? initialParams);
      const res = await apiFetch<ApiStockListResponse>(`/api/v1/inventory/stock${query}`);
      setItems(res.data.map(apiStockToStockItem));
      setTotal(res.meta.count);
      setTotalUnits(res.meta.total_units);
      setTotalValue(Number(res.meta.total_value));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load stock";
      setError(message);
      setItems([]);
      setTotal(0);
      setTotalUnits(0);
      setTotalValue(0);
    } finally {
      setLoading(false);
    }
  }, [initialParams]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { items, total, totalUnits, totalValue, loading, error, refetch };
}

export async function updateInventoryStock(
  id: string,
  input: UpdateStockLevelInput,
): Promise<StockItem> {
  const res = await apiFetch<ApiStockResponse>(`/api/v1/inventory/stock/${id}`, {
    method: "PATCH",
    body: JSON.stringify(stockUpdateToApiPayload(input)),
  });
  return apiStockToStockItem(res.data);
}
