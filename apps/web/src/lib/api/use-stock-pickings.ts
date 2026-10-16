"use client";

import { useCallback, useEffect, useState } from "react";
import type { StockPicking, StockPickingTypeCode } from "@/lib/stock/stock-picking";
import {
  fetchStockPickings,
  patchStockPicking,
  type StockPickingListParams,
  type UpdateStockPickingInput,
} from "@/lib/api/stock-pickings";
import {
  stockPickingsIncomingSeed,
  stockPickingsOutgoingSeed,
} from "@/lib/stock/stock-picking";

type UseStockPickingsState = {
  pickings: StockPicking[];
  loading: boolean;
  error: string | null;
  /** True when the current list came from the API (not offline mock seed). */
  fromApi: boolean;
  refetch: (params?: StockPickingListParams) => Promise<void>;
  savePicking: (picking: StockPicking) => Promise<StockPicking>;
};

function fallbackSeed(code?: StockPickingTypeCode): StockPicking[] {
  if (code === "outgoing") return stockPickingsOutgoingSeed;
  if (code === "incoming") return stockPickingsIncomingSeed;
  return [...stockPickingsIncomingSeed, ...stockPickingsOutgoingSeed];
}

export function useStockPickings(
  pickingTypeCode: StockPickingTypeCode,
  initialSearch?: string,
): UseStockPickingsState {
  const [pickings, setPickings] = useState<StockPicking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromApi, setFromApi] = useState(false);

  const refetch = useCallback(
    async (params?: StockPickingListParams) => {
      setLoading(true);
      setError(null);
      try {
        const rows = await fetchStockPickings({
          picking_type_code: pickingTypeCode,
          search: params?.search ?? initialSearch,
        });
        setPickings(rows);
        setFromApi(true);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load pickings";
        setError(message);
        setPickings(fallbackSeed(pickingTypeCode));
        setFromApi(false);
      } finally {
        setLoading(false);
      }
    },
    [pickingTypeCode, initialSearch],
  );

  const savePicking = useCallback(
    async (picking: StockPicking): Promise<StockPicking> => {
      const payload: UpdateStockPickingInput = {
        partner_id: picking.partner_id,
        partner_name: picking.partner_name,
        scheduled_date: picking.scheduled_date,
        date_deadline: picking.date_deadline,
        origin: picking.origin,
        state: picking.state,
        user_id: picking.user_id,
        user_name: picking.user_name,
        carrier_tracking_ref: picking.carrier_tracking_ref,
        weight: picking.weight ?? 0,
        priority: picking.priority,
        note: picking.note,
        location_id: picking.location_id,
        location_dest_id: picking.location_dest_id,
      };
      try {
        const saved = await patchStockPicking(picking.id, payload);
        setPickings((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
        setFromApi(true);
        return saved;
      } catch {
        setPickings((prev) => {
          const idx = prev.findIndex((p) => p.id === picking.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = picking;
            return next;
          }
          return [...prev, picking];
        });
        return picking;
      }
    },
    [],
  );

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { pickings, loading, error, fromApi, refetch, savePicking };
}
