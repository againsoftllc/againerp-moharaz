"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchInventoryDashboard, type ApiInventoryDashboard } from "@/lib/api/inventory";
import { fetchSalesDashboard, type SalesDashboard } from "@/lib/api/sales-dashboard";
import {
  fetchPurchaseDashboard,
  type ApiPurchaseDashboard,
} from "@/lib/api/purchase-orders";

export type WorkspaceOverview = {
  sales: SalesDashboard | null;
  inventory: ApiInventoryDashboard | null;
  purchase: ApiPurchaseDashboard | null;
};

export function useWorkspaceOverview() {
  const [data, setData] = useState<WorkspaceOverview>({
    sales: null,
    inventory: null,
    purchase: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [salesRes, inventoryRes, purchaseRes] = await Promise.allSettled([
      fetchSalesDashboard(),
      fetchInventoryDashboard(),
      fetchPurchaseDashboard(),
    ]);

    const next: WorkspaceOverview = {
      sales: salesRes.status === "fulfilled" ? salesRes.value : null,
      inventory: inventoryRes.status === "fulfilled" ? inventoryRes.value : null,
      purchase: purchaseRes.status === "fulfilled" ? purchaseRes.value : null,
    };
    setData(next);

    const failed = [salesRes, inventoryRes, purchaseRes].filter((r) => r.status === "rejected");
    if (!next.sales && !next.inventory) {
      setError("Live dashboard data is unavailable. Check API connection and try refresh.");
    } else if (failed.length) {
      setError("Some modules failed to load — showing available live data.");
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { ...data, loading, error, reload };
}
