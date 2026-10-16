"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  AttributeGroup,
  AttributeProfile,
  AttributeSpec,
} from "@/lib/mock-data/attribute-profiles";
import { apiFetch } from "@/lib/api/client";
import {
  apiAttributeToSpec,
  apiGroupToGroup,
  apiProfileToProfile,
  bulkSaveToApiPayload,
  partialProfileToApiUpdate,
  type ApiAttributeProfileListResponse,
  type ApiAttributeProfileResponse,
  type BulkSaveProfileInput,
  type CreateAttributeProfileInput,
  type UpdateAttributeProfileInput,
} from "@/lib/api/catalog-attribute-profiles";

type UseCatalogAttributeProfilesState = {
  profiles: AttributeProfile[];
  groups: AttributeGroup[];
  attributes: AttributeSpec[];
  total: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

export function useCatalogAttributeProfiles(): UseCatalogAttributeProfilesState {
  const [profiles, setProfiles] = useState<AttributeProfile[]>([]);
  const [groups, setGroups] = useState<AttributeGroup[]>([]);
  const [attributes, setAttributes] = useState<AttributeSpec[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<ApiAttributeProfileListResponse>(
        "/api/v1/catalog/attribute-profiles",
        { cache: "no-store" },
      );
      setProfiles((res.data ?? []).map(apiProfileToProfile));
      setGroups((res.groups ?? []).map(apiGroupToGroup));
      setAttributes((res.attributes ?? []).map(apiAttributeToSpec));
      setTotal(res.meta?.count ?? res.data?.length ?? 0);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load attribute profiles";
      setError(message);
      setProfiles([]);
      setGroups([]);
      setAttributes([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { profiles, groups, attributes, total, loading, error, refetch };
}

export async function fetchAttributeProfile(profileId: string): Promise<{
  profile: AttributeProfile;
  groups: AttributeGroup[];
  attributes: AttributeSpec[];
}> {
  const res = await apiFetch<ApiAttributeProfileResponse>(
    `/api/v1/catalog/attribute-profiles/${profileId}`,
  );
  const profile = apiProfileToProfile(res.data);
  const groups = res.data.groups.map(apiGroupToGroup);
  const attributes = res.data.groups.flatMap((group) =>
    (group.attributes ?? []).map(apiAttributeToSpec),
  );
  return { profile, groups, attributes };
}

export async function patchAttributeProfile(
  id: string,
  patch: Partial<AttributeProfile>,
): Promise<AttributeProfile> {
  const res = await apiFetch<ApiAttributeProfileResponse>(
    `/api/v1/catalog/attribute-profiles/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(partialProfileToApiUpdate(patch)),
    },
  );
  return apiProfileToProfile(res.data);
}

export async function deleteAttributeProfile(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/catalog/attribute-profiles/${id}`, { method: "DELETE" });
}

export async function deleteAttributeProfiles(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => deleteAttributeProfile(id)));
}

export async function reorderAttributeProfiles(orderedIds: string[]): Promise<void> {
  await apiFetch<ApiAttributeProfileListResponse>(
    "/api/v1/catalog/attribute-profiles/reorder",
    {
      method: "PATCH",
      body: JSON.stringify({ ordered_ids: orderedIds }),
    },
  );
}

export async function saveAttributeProfileBulk(
  input: BulkSaveProfileInput,
): Promise<AttributeProfile> {
  const payload = bulkSaveToApiPayload(input);
  const url = input.profileId
    ? `/api/v1/catalog/attribute-profiles/${input.profileId}/bulk`
    : "/api/v1/catalog/attribute-profiles/bulk";
  const res = await apiFetch<ApiAttributeProfileResponse>(url, {
    method: input.profileId ? "PUT" : "POST",
    body: JSON.stringify(payload),
  });
  return apiProfileToProfile(res.data);
}

/** Same as saveAttributeProfileBulk but returns flat AttributeSpec[] for all groups */
export async function saveAttributeProfileBulkWithSpecs(
  input: BulkSaveProfileInput,
): Promise<{ profile: AttributeProfile; attributes: AttributeSpec[] }> {
  const payload = bulkSaveToApiPayload(input);
  const url = input.profileId
    ? `/api/v1/catalog/attribute-profiles/${input.profileId}/bulk`
    : "/api/v1/catalog/attribute-profiles/bulk";
  const res = await apiFetch<ApiAttributeProfileResponse>(url, {
    method: input.profileId ? "PUT" : "POST",
    body: JSON.stringify(payload),
  });
  const attrs: AttributeSpec[] = (res.data.groups ?? []).flatMap(
    (g) => (g.attributes ?? []).map(apiAttributeToSpec),
  );
  return { profile: apiProfileToProfile(res.data), attributes: attrs };
}

export async function createAttributeProfile(
  input: CreateAttributeProfileInput,
): Promise<AttributeProfile> {
  const res = await apiFetch<ApiAttributeProfileResponse>("/api/v1/catalog/attribute-profiles", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      code: input.code,
      description: input.description ?? null,
      is_active: input.active ?? true,
      icon_url: input.iconUrl ?? null,
      image_url: input.imageUrl ?? null,
      category_labels: input.categoryLabels ?? [],
    }),
  });
  return apiProfileToProfile(res.data);
}

export async function updateAttributeProfile(
  id: string,
  input: UpdateAttributeProfileInput,
): Promise<AttributeProfile> {
  return patchAttributeProfile(id, {
    name: input.name,
    code: input.code,
    description: input.description,
    active: input.active,
    iconUrl: input.iconUrl,
    imageUrl: input.imageUrl,
    categoryLabels: input.categoryLabels,
  });
}
