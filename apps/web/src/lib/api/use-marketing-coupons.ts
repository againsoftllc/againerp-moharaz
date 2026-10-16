"use client";

import { useCallback, useEffect, useState } from "react";
import type { MarketingCoupon } from "@/lib/mock-data/marketing";
import { apiFetch } from "@/lib/api/client";
import {
  apiCouponToMarketingCoupon,
  buildCouponQuery,
  type ApiCouponListResponse,
} from "@/lib/api/marketing-coupons";

export function useMarketingCoupons() {
  const [coupons, setCoupons] = useState<MarketingCoupon[]>([]);
  const [total, setTotal] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async (params?: { search?: string; status?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<ApiCouponListResponse>(`/api/v1/marketing/coupons${buildCouponQuery(params)}`);
      setCoupons(res.data.map(apiCouponToMarketingCoupon));
      setTotal(res.meta.count);
      setActiveCount(res.meta.active_count);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load coupons");
      setCoupons([]);
      setTotal(0);
      setActiveCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { coupons, total, activeCount, loading, error, refetch };
}
