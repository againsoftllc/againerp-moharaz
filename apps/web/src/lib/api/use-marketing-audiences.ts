"use client";

import { useCallback, useEffect, useState } from "react";
import type { AudienceSegment } from "@/lib/mock-data/marketing";
import { apiFetch } from "@/lib/api/client";
import {
  apiAudienceToAudienceSegment,
  audienceUpdateToApiPayload,
  buildAudienceQuery,
  type ApiAudienceListResponse,
  type ApiAudienceResponse,
  type AudienceListParams,
  type UpdateAudienceInput,
} from "@/lib/api/marketing-audiences";

export function useMarketingAudiences(initialParams?: AudienceListParams) {
  const [audiences, setAudiences] = useState<AudienceSegment[]>([]);
  const [total, setTotal] = useState(0);
  const [totalMembers, setTotalMembers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async (params?: AudienceListParams) => {
    setLoading(true);
    setError(null);
    try {
      const query = buildAudienceQuery(params ?? initialParams);
      const res = await apiFetch<ApiAudienceListResponse>(`/api/v1/marketing/audiences${query}`);
      setAudiences(res.data.map(apiAudienceToAudienceSegment));
      setTotal(res.meta.count);
      setTotalMembers(res.meta.total_members);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audiences");
      setAudiences([]);
      setTotal(0);
      setTotalMembers(0);
    } finally {
      setLoading(false);
    }
  }, [initialParams]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { audiences, total, totalMembers, loading, error, refetch };
}

export function useMarketingAudience(audienceId: string) {
  const [audience, setAudience] = useState<AudienceSegment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!audienceId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<ApiAudienceResponse>(`/api/v1/marketing/audiences/${audienceId}`);
      setAudience(apiAudienceToAudienceSegment(res.data));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audience");
      setAudience(null);
    } finally {
      setLoading(false);
    }
  }, [audienceId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { audience, loading, error, refetch };
}

export async function updateMarketingAudience(
  id: string,
  input: UpdateAudienceInput,
): Promise<AudienceSegment> {
  const res = await apiFetch<ApiAudienceResponse>(`/api/v1/marketing/audiences/${id}`, {
    method: "PATCH",
    body: JSON.stringify(audienceUpdateToApiPayload(input)),
  });
  return apiAudienceToAudienceSegment(res.data);
}
