"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchMarketingHappyHours,
  type ApiMarketingHappyHour,
} from "@/lib/api/marketing-happy-hours";

export function useMarketingHappyHours() {
  const [campaigns, setCampaigns] = useState<ApiMarketingHappyHour[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async (params?: { search?: string; status?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchMarketingHappyHours(params);
      setCampaigns(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Happy Hour");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { campaigns, loading, error, refetch };
}
