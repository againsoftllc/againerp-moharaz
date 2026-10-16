"use client";

import { useCallback, useEffect, useState } from "react";
import type { StockQuant } from "@/lib/stock/stock-quant";
import { stockQuantsSeed } from "@/lib/stock/stock-quant";
import {
  applyAllStockQuants,
  fetchStockQuants,
  patchStockQuant,
  type StockQuantListParams,
  type UpdateStockQuantInput,
} from "@/lib/api/stock-quants";

type UseStockQuantsState = {
  quants: StockQuant[];
  loading: boolean;
  error: string | null;
  fromApi: boolean;
  refetch: (params?: StockQuantListParams) => Promise<void>;
  saveQuant: (id: string, input: UpdateStockQuantInput) => Promise<StockQuant>;
  applyAll: () => Promise<number>;
};

export function useStockQuants(initialSearch?: string): UseStockQuantsState {
  const [quants, setQuants] = useState<StockQuant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromApi, setFromApi] = useState(false);

  const refetch = useCallback(
    async (params?: StockQuantListParams) => {
      setLoading(true);
      setError(null);
      try {
        const rows = await fetchStockQuants({ search: params?.search ?? initialSearch });
        setQuants(rows);
        setFromApi(true);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load inventory lines";
        setError(message);
        setQuants(stockQuantsSeed);
        setFromApi(false);
      } finally {
        setLoading(false);
      }
    },
    [initialSearch],
  );

  const saveQuant = useCallback(async (id: string, input: UpdateStockQuantInput) => {
    try {
      const saved = await patchStockQuant(id, input);
      setQuants((prev) => prev.map((q) => (q.id === saved.id ? saved : q)));
      setFromApi(true);
      return saved;
    } catch {
      setQuants((prev) =>
        prev.map((q) => {
          if (q.id !== id) return q;
          const counted = input.inventory_quantity ?? q.inventory_quantity;
          const diff =
            counted === null || counted === undefined
              ? null
              : counted - q.quantity;
          return { ...q, inventory_quantity: counted, inventory_diff_quantity: diff };
        }),
      );
      const row = quants.find((q) => q.id === id);
      return row!;
    }
  }, [quants]);

  const applyAll = useCallback(async () => {
    try {
      const applied = await applyAllStockQuants();
      await refetch();
      setFromApi(true);
      return applied;
    } catch {
      setQuants((prev) =>
        prev.map((q) => {
          if (q.inventory_quantity === null || q.inventory_quantity === undefined) return q;
          return {
            ...q,
            quantity: q.inventory_quantity,
            inventory_diff_quantity: 0,
          };
        }),
      );
      return quants.filter((q) => q.inventory_quantity !== null && q.inventory_quantity !== undefined).length;
    }
  }, [refetch, quants]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { quants, loading, error, fromApi, refetch, saveQuant, applyAll };
}
