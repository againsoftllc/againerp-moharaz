"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchMarketingOffers,
  type ApiMarketingOffer,
} from "@/lib/api/marketing-offers";

export function useMarketingOffers() {
  const [offers, setOffers] = useState<ApiMarketingOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async (params?: { search?: string; status?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchMarketingOffers(params);
      setOffers(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load offers");
      setOffers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { offers, loading, error, refetch };
}
