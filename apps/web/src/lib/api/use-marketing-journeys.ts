"use client";

import { useCallback, useEffect, useState } from "react";
import type { MarketingJourney } from "@/lib/mock-data/marketing";
import { apiFetch } from "@/lib/api/client";
import {
  apiJourneyToMarketingJourney,
  buildJourneyQuery,
  journeyUpdateToApiPayload,
  type ApiJourneyListResponse,
  type ApiJourneyResponse,
  type JourneyListParams,
  type JourneyStatus,
  type UpdateJourneyInput,
} from "@/lib/api/marketing-journeys";

export function useMarketingJourneys(initialParams?: JourneyListParams) {
  const [journeys, setJourneys] = useState<MarketingJourney[]>([]);
  const [total, setTotal] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async (params?: JourneyListParams) => {
    setLoading(true);
    setError(null);
    try {
      const query = buildJourneyQuery(params ?? initialParams);
      const res = await apiFetch<ApiJourneyListResponse>(`/api/v1/marketing/journeys${query}`);
      setJourneys(res.data.map(apiJourneyToMarketingJourney));
      setTotal(res.meta.count);
      setActiveCount(res.meta.active_count);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load journeys");
      setJourneys([]);
      setTotal(0);
      setActiveCount(0);
    } finally {
      setLoading(false);
    }
  }, [initialParams]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { journeys, total, activeCount, loading, error, refetch };
}

export function useMarketingJourney(journeyId: string) {
  const [journey, setJourney] = useState<MarketingJourney | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!journeyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<ApiJourneyResponse>(`/api/v1/marketing/journeys/${journeyId}`);
      setJourney(apiJourneyToMarketingJourney(res.data));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load journey");
      setJourney(null);
    } finally {
      setLoading(false);
    }
  }, [journeyId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { journey, loading, error, refetch };
}

export async function updateMarketingJourney(
  id: string,
  input: UpdateJourneyInput,
): Promise<MarketingJourney> {
  const res = await apiFetch<ApiJourneyResponse>(`/api/v1/marketing/journeys/${id}`, {
    method: "PATCH",
    body: JSON.stringify(journeyUpdateToApiPayload(input)),
  });
  return apiJourneyToMarketingJourney(res.data);
}

export async function updateMarketingJourneyStatus(
  id: string,
  status: JourneyStatus,
): Promise<MarketingJourney> {
  return updateMarketingJourney(id, { status });
}
