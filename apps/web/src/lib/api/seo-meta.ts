import { apiFetch } from "@/lib/api/client";
import type { SchemaType, SeoEntityType, SeoMetaRecord } from "@/lib/mock-data/seo";

export type ApiSeoMeta = {
  id: string;
  entity_type: string;
  title: string;
  url: string;
  meta_title: string;
  meta_description: string;
  og_image: string | null;
  canonical_url: string | null;
  indexable: boolean;
  schema_type: string;
  score: number;
  issues: string[];
};

export type ApiSeoMetaListResponse = {
  data: ApiSeoMeta[];
  meta: { count: number; avg_score: number };
};

export type ApiSeoMetaResponse = {
  data: ApiSeoMeta;
};

export type UpdateSeoMetaInput = {
  meta_title?: string;
  meta_description?: string;
  og_image?: string | null;
  canonical_url?: string | null;
  indexable?: boolean;
  schema_type?: string;
};

export function apiSeoMetaToRecord(row: ApiSeoMeta): SeoMetaRecord {
  return {
    id: row.id,
    entityType: row.entity_type as SeoEntityType,
    title: row.title,
    url: row.url,
    metaTitle: row.meta_title,
    metaDescription: row.meta_description,
    ogImage: row.og_image ?? "",
    canonicalUrl: row.canonical_url ?? "",
    indexable: row.indexable,
    schemaType: row.schema_type as SchemaType,
    score: row.score,
    issues: row.issues ?? [],
  };
}

export function buildSeoMetaQuery(params?: { search?: string; entity_type?: string }): string {
  const q = new URLSearchParams();
  if (params?.search) q.set("search", params.search);
  if (params?.entity_type) q.set("entity_type", params.entity_type);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function partialSeoMetaToApiUpdate(patch: Partial<SeoMetaRecord>): UpdateSeoMetaInput {
  const payload: UpdateSeoMetaInput = {};
  if ("metaTitle" in patch) payload.meta_title = patch.metaTitle;
  if ("metaDescription" in patch) payload.meta_description = patch.metaDescription;
  if ("ogImage" in patch) payload.og_image = patch.ogImage || null;
  if ("canonicalUrl" in patch) payload.canonical_url = patch.canonicalUrl || null;
  if ("indexable" in patch) payload.indexable = patch.indexable;
  if ("schemaType" in patch) payload.schema_type = patch.schemaType;
  return payload;
}

export function seoMetaFormToApiUpdate(input: {
  metaTitle: string;
  metaDescription: string;
  ogImage: string;
  canonicalUrl: string;
  indexable: boolean;
  schemaType: SchemaType;
}): UpdateSeoMetaInput {
  return {
    meta_title: input.metaTitle,
    meta_description: input.metaDescription,
    og_image: input.ogImage || null,
    canonical_url: input.canonicalUrl || null,
    indexable: input.indexable,
    schema_type: input.schemaType,
  };
}

// --- transport -------------------------------------------------------------

const BASE = "/api/v1/seo/meta";

export async function fetchSeoMeta(params?: { search?: string; entity_type?: string }) {
  return apiFetch<ApiSeoMetaListResponse>(`${BASE}${buildSeoMetaQuery(params)}`);
}

export async function updateSeoMeta(id: string, input: UpdateSeoMetaInput) {
  const res = await apiFetch<ApiSeoMetaResponse>(`${BASE}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return res.data;
}
