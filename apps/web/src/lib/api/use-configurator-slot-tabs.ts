"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";

export type ConfiguratorSlotTab = {
  id: string;
  profileId: string;
  name: string;
  slug: string;
  sortOrder: number;
  slotCount: number;
};

type ApiSlotTab = {
  id: string;
  profile_id: string;
  name: string;
  slug: string;
  sort_order: number;
  slot_count: number;
};

function fromApi(row: ApiSlotTab): ConfiguratorSlotTab {
  return {
    id: row.id,
    profileId: row.profile_id,
    name: row.name,
    slug: row.slug,
    sortOrder: row.sort_order,
    slotCount: row.slot_count,
  };
}

export function useConfiguratorSlotTabs(profileId: string | undefined): {
  tabs: ConfiguratorSlotTab[];
  loading: boolean;
  refetch: () => Promise<void>;
} {
  const [tabs, setTabs] = useState<ConfiguratorSlotTab[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!profileId) {
      setTabs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<{ data: ApiSlotTab[] }>(
        `/api/v1/configurator/slot-tabs?profile_id=${encodeURIComponent(profileId)}`,
      );
      setTabs(res.data.map(fromApi));
    } catch {
      setTabs([]);
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { tabs, loading, refetch };
}

export async function createConfiguratorSlotTab(input: {
  profileId: string;
  name: string;
  slug?: string;
  sortOrder?: number;
}): Promise<ConfiguratorSlotTab> {
  const res = await apiFetch<{ data: ApiSlotTab }>("/api/v1/configurator/slot-tabs", {
    method: "POST",
    body: JSON.stringify({
      profile_id: input.profileId,
      name: input.name,
      slug: input.slug ?? "",
      sort_order: input.sortOrder ?? 0,
    }),
  });
  return fromApi(res.data);
}

export async function updateConfiguratorSlotTab(
  id: string,
  input: { name?: string; sortOrder?: number },
): Promise<ConfiguratorSlotTab> {
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.sortOrder !== undefined) payload.sort_order = input.sortOrder;
  const res = await apiFetch<{ data: ApiSlotTab }>(`/api/v1/configurator/slot-tabs/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return fromApi(res.data);
}

export async function deleteConfiguratorSlotTab(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/configurator/slot-tabs/${id}`, { method: "DELETE" });
}
