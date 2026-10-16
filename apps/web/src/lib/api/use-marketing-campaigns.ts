"use client";

import { useCallback, useEffect, useState } from "react";
import type { CampaignStatus, MarketingCampaign } from "@/lib/mock-data/marketing";
import { apiFetch } from "@/lib/api/client";
import {
  apiCampaignToMarketingCampaign,
  buildCampaignQuery,
  campaignUpdateToApiPayload,
  type ApiCampaignListResponse,
  type ApiCampaignResponse,
  type CampaignListParams,
  type UpdateCampaignInput,
} from "@/lib/api/marketing-campaigns";

export function useMarketingCampaigns(initialParams?: CampaignListParams) {
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [total, setTotal] = useState(0);
  const [runningCount, setRunningCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async (params?: CampaignListParams) => {
    setLoading(true);
    setError(null);
    try {
      const query = buildCampaignQuery(params ?? initialParams);
      const res = await apiFetch<ApiCampaignListResponse>(`/api/v1/marketing/campaigns${query}`);
      setCampaigns(res.data.map(apiCampaignToMarketingCampaign));
      setTotal(res.meta.count);
      setRunningCount(res.meta.running_count);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load campaigns");
      setCampaigns([]);
      setTotal(0);
      setRunningCount(0);
    } finally {
      setLoading(false);
    }
  }, [initialParams]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { campaigns, total, runningCount, loading, error, refetch };
}

export function useMarketingCampaign(campaignId: string) {
  const [campaign, setCampaign] = useState<MarketingCampaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!campaignId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<ApiCampaignResponse>(`/api/v1/marketing/campaigns/${campaignId}`);
      setCampaign(apiCampaignToMarketingCampaign(res.data));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load campaign");
      setCampaign(null);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { campaign, loading, error, refetch };
}

export async function updateMarketingCampaign(
  id: string,
  input: UpdateCampaignInput,
): Promise<MarketingCampaign> {
  const res = await apiFetch<ApiCampaignResponse>(`/api/v1/marketing/campaigns/${id}`, {
    method: "PATCH",
    body: JSON.stringify(campaignUpdateToApiPayload(input)),
  });
  return apiCampaignToMarketingCampaign(res.data);
}

export async function updateMarketingCampaignStatus(
  id: string,
  status: CampaignStatus,
): Promise<MarketingCampaign> {
  return updateMarketingCampaign(id, { status });
}
