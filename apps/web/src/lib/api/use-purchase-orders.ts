"use client";

import { useCallback, useEffect, useState } from "react";
import type { PurchaseOrder, PurchaseOrderStatus } from "@/lib/mock-data/purchase-orders";
import {
  apiPurchaseOrderToPurchaseOrder,
  cancelPurchaseOrder,
  confirmPurchaseOrder,
  createPurchaseOrder,
  fetchPurchaseOrder,
  fetchPurchaseOrderHistory,
  fetchPurchaseOrders,
  updatePurchaseOrderStatus,
  type ApiPurchaseStatusHistory,
  type CreatePurchaseOrderInput,
  type PurchaseOrderListParams,
} from "@/lib/api/purchase-orders";

type UsePurchaseOrdersState = {
  orders: PurchaseOrder[];
  total: number;
  loading: boolean;
  error: string | null;
  refetch: (params?: PurchaseOrderListParams) => Promise<void>;
};

export function usePurchaseOrders(initialParams?: PurchaseOrderListParams): UsePurchaseOrdersState {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async (params?: PurchaseOrderListParams) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchPurchaseOrders(params ?? initialParams);
      setOrders(res.data.map(apiPurchaseOrderToPurchaseOrder));
      setTotal(res.meta.count);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load purchase orders");
      setOrders([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [initialParams]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { orders, total, loading, error, refetch };
}

export function usePurchaseOrder(orderId: string) {
  const [order, setOrder] = useState<PurchaseOrder | null>(null);
  const [history, setHistory] = useState<ApiPurchaseStatusHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    try {
      const [detail, hist] = await Promise.all([
        fetchPurchaseOrder(orderId),
        fetchPurchaseOrderHistory(orderId).catch(() => []),
      ]);
      setOrder(apiPurchaseOrderToPurchaseOrder(detail));
      setHistory(hist);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load purchase order");
      setOrder(null);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { order, history, loading, error, refetch };
}

export async function createPurchaseOrderRecord(
  input: CreatePurchaseOrderInput,
): Promise<PurchaseOrder> {
  const row = await createPurchaseOrder(input);
  return apiPurchaseOrderToPurchaseOrder(row);
}

export async function setPurchaseOrderStatus(
  id: string,
  status: PurchaseOrderStatus,
): Promise<PurchaseOrder> {
  if (status === "confirmed") {
    const row = await confirmPurchaseOrder(id);
    return apiPurchaseOrderToPurchaseOrder(row);
  }
  if (status === "cancelled") {
    const row = await cancelPurchaseOrder(id);
    return apiPurchaseOrderToPurchaseOrder(row);
  }
  const row = await updatePurchaseOrderStatus(id, status);
  return apiPurchaseOrderToPurchaseOrder(row);
}
