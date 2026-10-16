"use client";

import { useCallback, useEffect, useState } from "react";
import type { ConfiguratorProfile, ConfiguratorStatus } from "@/lib/configurator/types";
import { apiFetch } from "@/lib/api/client";
import {
  apiProfileToConfiguratorProfile,
  partialProfileToApiUpdate,
  profileToApiCreatePayload,
  profileToApiUpdatePayload,
  type ApiConfiguratorProfileListResponse,
  type ApiConfiguratorProfileResponse,
  type CreateConfiguratorProfileInput,
  type UpdateConfiguratorProfileInput,
} from "@/lib/api/configurator-profiles";

type UseConfiguratorProfilesState = {
  profiles: ConfiguratorProfile[];
  total: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

export function useConfiguratorProfiles(): UseConfiguratorProfilesState {
  const [profiles, setProfiles] = useState<ConfiguratorProfile[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<ApiConfiguratorProfileListResponse>("/api/v1/configurator/profiles");
      setProfiles(res.data.map(apiProfileToConfiguratorProfile));
      setTotal(res.meta.count);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load configurator profiles";
      setError(message);
      setProfiles([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { profiles, total, loading, error, refetch };
}

export function useConfiguratorProfile(id: string) {
  const [profile, setProfile] = useState<ConfiguratorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<ApiConfiguratorProfileResponse>(`/api/v1/configurator/profiles/${id}`);
      setProfile(apiProfileToConfiguratorProfile(res.data));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load profile";
      setError(message);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { profile, loading, error, refetch };
}

export async function fetchConfiguratorProfile(id: string): Promise<ConfiguratorProfile> {
  const res = await apiFetch<ApiConfiguratorProfileResponse>(`/api/v1/configurator/profiles/${id}`);
  return apiProfileToConfiguratorProfile(res.data);
}

export async function createConfiguratorProfile(
  input: CreateConfiguratorProfileInput,
): Promise<ConfiguratorProfile> {
  const res = await apiFetch<ApiConfiguratorProfileResponse>("/api/v1/configurator/profiles", {
    method: "POST",
    body: JSON.stringify(profileToApiCreatePayload(input)),
  });
  return apiProfileToConfiguratorProfile(res.data);
}

export async function updateConfiguratorProfile(
  id: string,
  input: UpdateConfiguratorProfileInput,
): Promise<ConfiguratorProfile> {
  const res = await apiFetch<ApiConfiguratorProfileResponse>(`/api/v1/configurator/profiles/${id}`, {
    method: "PATCH",
    body: JSON.stringify(profileToApiUpdatePayload(input)),
  });
  return apiProfileToConfiguratorProfile(res.data);
}

export async function patchConfiguratorProfile(
  id: string,
  patch: Partial<ConfiguratorProfile>,
): Promise<ConfiguratorProfile> {
  return updateConfiguratorProfile(id, partialProfileToApiUpdate(patch));
}

export async function bulkSetConfiguratorProfileStatus(
  ids: string[],
  status: ConfiguratorStatus,
): Promise<void> {
  await apiFetch<ApiConfiguratorProfileListResponse>("/api/v1/configurator/profiles/bulk/status", {
    method: "PATCH",
    body: JSON.stringify({ ids, status }),
  });
}

export async function duplicateConfiguratorProfile(id: string): Promise<ConfiguratorProfile> {
  const res = await apiFetch<ApiConfiguratorProfileResponse>(
    `/api/v1/configurator/profiles/${id}/duplicate`,
    { method: "POST" },
  );
  return apiProfileToConfiguratorProfile(res.data);
}

export async function deleteConfiguratorProfile(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/configurator/profiles/${id}`, { method: "DELETE" });
}

export async function deleteConfiguratorProfiles(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => deleteConfiguratorProfile(id)));
}
