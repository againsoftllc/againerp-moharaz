"use client";

import { useCallback, useEffect, useState } from "react";
import type { SavedBuild } from "@/lib/configurator/types";
import { apiFetch } from "@/lib/api/client";
import {
  apiBuildToSavedBuild,
  buildToApiUpdatePayload,
  partialBuildToApiUpdate,
  type ApiConfiguratorBuildListResponse,
  type ApiConfiguratorBuildResponse,
  type UpdateConfiguratorBuildInput,
} from "@/lib/api/configurator-builds";

type UseConfiguratorBuildsState = {
  builds: SavedBuild[];
  total: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

export function useConfiguratorBuilds(profileId?: string): UseConfiguratorBuildsState {
  const [builds, setBuilds] = useState<SavedBuild[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = profileId ? `?profile_id=${encodeURIComponent(profileId)}` : "";
      const res = await apiFetch<ApiConfiguratorBuildListResponse>(
        `/api/v1/configurator/builds${qs}`,
      );
      setBuilds(res.data.map(apiBuildToSavedBuild));
      setTotal(res.meta.count);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load saved builds";
      setError(message);
      setBuilds([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { builds, total, loading, error, refetch };
}

export function useConfiguratorBuild(id: string) {
  const [build, setBuild] = useState<SavedBuild | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<ApiConfiguratorBuildResponse>(`/api/v1/configurator/builds/${id}`);
      setBuild(apiBuildToSavedBuild(res.data));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load build";
      setError(message);
      setBuild(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { build, loading, error, refetch };
}

export async function updateConfiguratorBuild(
  id: string,
  input: UpdateConfiguratorBuildInput,
): Promise<SavedBuild> {
  const res = await apiFetch<ApiConfiguratorBuildResponse>(`/api/v1/configurator/builds/${id}`, {
    method: "PATCH",
    body: JSON.stringify(buildToApiUpdatePayload(input)),
  });
  return apiBuildToSavedBuild(res.data);
}

export async function patchConfiguratorBuild(
  id: string,
  patch: Partial<SavedBuild>,
): Promise<SavedBuild> {
  return updateConfiguratorBuild(id, partialBuildToApiUpdate(patch));
}

export async function bulkSetConfiguratorBuildStatus(
  ids: string[],
  status: SavedBuild["status"],
): Promise<void> {
  await apiFetch<ApiConfiguratorBuildListResponse>("/api/v1/configurator/builds/bulk/status", {
    method: "PATCH",
    body: JSON.stringify({ ids, status }),
  });
}

export async function deleteConfiguratorBuild(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/configurator/builds/${id}`, { method: "DELETE" });
}

export async function deleteConfiguratorBuilds(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => deleteConfiguratorBuild(id)));
}
