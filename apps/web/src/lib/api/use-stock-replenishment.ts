"use client";

import { useCallback, useEffect, useState } from "react";
import type { StockOrderpoint } from "@/lib/stock/stock-orderpoint";
import { stockOrderpointsSeed } from "@/lib/stock/stock-orderpoint";
import {
  fetchReplenishment,
  patchOrderpoint,
  type ReplenishmentListParams,
  type UpdateOrderpointInput,
} from "@/lib/api/stock-replenishment";

type UseReplenishmentState = {
  orderpoints: StockOrderpoint[];
  loading: boolean;
  error: string | null;
  fromApi: boolean;
  refetch: (params?: ReplenishmentListParams) => Promise<void>;
  saveOrderpoint: (id: string, input: UpdateOrderpointInput) => Promise<StockOrderpoint>;
};

export function useReplenishment(
  initialSearch?: string,
  filters?: Pick<ReplenishmentListParams, "to_reorder" | "not_snoozed">,
): UseReplenishmentState {
  const [orderpoints, setOrderpoints] = useState<StockOrderpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromApi, setFromApi] = useState(false);

  const refetch = useCallback(
    async (params?: ReplenishmentListParams) => {
      setLoading(true);
      setError(null);
      try {
        const rows = await fetchReplenishment({
          search: params?.search ?? initialSearch,
          to_reorder: params?.to_reorder ?? filters?.to_reorder,
          not_snoozed: params?.not_snoozed ?? filters?.not_snoozed,
        });
        setOrderpoints(rows);
        setFromApi(true);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load replenishment";
        setError(message);
        setOrderpoints(stockOrderpointsSeed);
        setFromApi(false);
      } finally {
        setLoading(false);
      }
    },
    [initialSearch, filters?.to_reorder, filters?.not_snoozed],
  );

  const saveOrderpoint = useCallback(async (id: string, input: UpdateOrderpointInput) => {
    try {
      const saved = await patchOrderpoint(id, input);
      setOrderpoints((prev) => prev.map((o) => (o.id === saved.id ? saved : o)));
      setFromApi(true);
      return saved;
    } catch {
      setOrderpoints((prev) =>
        prev.map((o) => (o.id === id ? { ...o, ...input } : o)),
      );
      const row = orderpoints.find((o) => o.id === id);
      return row!;
    }
  }, [orderpoints]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { orderpoints, loading, error, fromApi, refetch, saveOrderpoint };
}
