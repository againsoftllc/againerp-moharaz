/**
 * Attribute profile helpers for Aladin interactive product create.
 * Uses AgainERP catalog APIs via consumerAuthorizedFetch (no Center gateway).
 */

import { consumerAuthorizedFetch } from "@/lib/commerce/catalog-consumer-server";

export type ProfileSchemaField = {
  id: string;
  groupId: string;
  group: string;
  field: string;
  fieldType?: string;
  unit?: string | null;
  predefinedValues?: string[];
};

export type AttributeProfileLite = {
  id: string;
  name: string;
  categoryLabels: string[];
};

type ApiAttributeField = {
  id: string;
  group_id: string;
  name: string;
  field_type?: string;
  unit?: string | null;
  predefined_values?: string[];
};

type ApiAttributeGroup = {
  id: string;
  name: string;
  attributes?: ApiAttributeField[];
};

export async function loadProfileSchema(
  profileId: string,
  authorization: string | null,
): Promise<{ profileName: string; schema: ProfileSchemaField[] } | null> {
  if (!authorization) return null;
  try {
    const body = await consumerAuthorizedFetch<{
      data?: { name?: string; groups?: ApiAttributeGroup[] };
    }>(`/api/v1/catalog/attribute-profiles/${profileId}`, authorization);
    const groups = body.data?.groups ?? [];
    const schema: ProfileSchemaField[] = [];
    for (const group of groups) {
      for (const attr of group.attributes ?? []) {
        schema.push({
          id: attr.id,
          groupId: attr.group_id,
          group: group.name,
          field: attr.name,
          fieldType: attr.field_type,
          unit: attr.unit ?? null,
          predefinedValues: attr.predefined_values ?? [],
        });
      }
    }
    return {
      profileName: body.data?.name ?? "",
      schema,
    };
  } catch {
    return null;
  }
}

export async function listAttributeProfilesLite(
  authorization: string | null,
): Promise<AttributeProfileLite[]> {
  if (!authorization) return [];
  try {
    const body = await consumerAuthorizedFetch<{
      data?: Array<{ id: string; name: string; is_active: boolean; category_labels?: string[] }>;
    }>("/api/v1/catalog/attribute-profiles", authorization);
    return (body.data ?? [])
      .filter((row) => row.is_active)
      .map((row) => ({
        id: row.id,
        name: row.name,
        categoryLabels: row.category_labels ?? [],
      }));
  } catch {
    return [];
  }
}

/** Picks the profile whose name/category labels best match the extracted product text. */
export function pickBestAttributeProfile(
  profiles: AttributeProfileLite[],
  hints: { name?: string; brand?: string; text?: string },
): AttributeProfileLite | null {
  if (!profiles.length) return null;

  const haystack = [hints.name, hints.brand, hints.text]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  let best: AttributeProfileLite | null = null;
  let bestScore = 0;

  for (const profile of profiles) {
    const needles = [profile.name, ...profile.categoryLabels].map((s) => s.toLowerCase());
    let score = 0;
    for (const needle of needles) {
      if (needle && haystack.includes(needle)) score += needle.length;
    }
    if (score > bestScore) {
      bestScore = score;
      best = profile;
    }
  }

  return best ?? profiles[0];
}

export function authHeaderFromRequest(request: Request): string | null {
  return request.headers.get("authorization");
}
