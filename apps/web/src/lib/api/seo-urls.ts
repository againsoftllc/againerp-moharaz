import { apiFetch } from "@/lib/api/client";
import type { SeoEntityType, UrlRecord, UrlStatus } from "@/lib/mock-data/seo";

export type ApiSeoUrl = {
  id: string;
  entity_type: string;
  entity_id: string | null;
  title: string;
  slug: string;
  canonical_url: string;
  status: string;
  indexable: boolean;
  redirect_to: string;
  views_30d: number;
  /** True once status/indexable were set by hand; the entity sync then leaves them alone. */
  status_locked: boolean;
  created_at: string;
  updated_at: string;
};

export type ApiSeoUrlMeta = {
  count: number;
  active_count: number;
  redirect_count: number;
  noindex_count: number;
  draft_count: number;
  views_30d_total: number;
};

export type ApiSeoUrlListResponse = {
  data: ApiSeoUrl[];
  meta: ApiSeoUrlMeta;
};

export type ApiSeoUrlResponse = {
  data: ApiSeoUrl;
};

export type SeoUrlListParams = {
  search?: string;
  entity_type?: string;
  status?: string;
};

export type UpdateSeoUrlInput = {
  slug?: string;
  canonical_url?: string;
  status?: string;
  indexable?: boolean;
  redirect_to?: string;
  /** Pass false to hand status/indexable back to the entity sync. */
  status_locked?: boolean;
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toISOString().slice(0, 10);
}

export function apiUrlToRecord(row: ApiSeoUrl): UrlRecord {
  return {
    id: row.id,
    entityType: row.entity_type as SeoEntityType,
    title: row.title,
    slug: row.slug,
    canonicalUrl: row.canonical_url,
    status: row.status as UrlStatus,
    indexable: row.indexable,
    redirectTo: row.redirect_to,
    updatedAt: formatDate(row.updated_at),
    views30d: row.views_30d,
  };
}

export function buildSeoUrlQuery(params?: SeoUrlListParams): string {
  const q = new URLSearchParams();
  if (params?.search) q.set("search", params.search);
  if (params?.entity_type && params.entity_type !== "all") q.set("entity_type", params.entity_type);
  if (params?.status && params.status !== "all") q.set("status", params.status);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function partialUrlToApiUpdate(patch: Partial<UrlRecord>): UpdateSeoUrlInput {
  const payload: UpdateSeoUrlInput = {};
  if ("slug" in patch) payload.slug = patch.slug;
  if ("canonicalUrl" in patch) payload.canonical_url = patch.canonicalUrl ?? "";
  if ("status" in patch) payload.status = patch.status;
  if ("indexable" in patch) payload.indexable = patch.indexable;
  if ("redirectTo" in patch) payload.redirect_to = patch.redirectTo ?? "";
  return payload;
}

export function urlFormToApiUpdate(input: {
  slug: string;
  canonicalUrl: string;
  status: UrlStatus;
  indexable: boolean;
  redirectTo: string;
}): UpdateSeoUrlInput {
  return {
    slug: input.slug,
    canonical_url: input.canonicalUrl,
    status: input.status,
    indexable: input.indexable,
    redirect_to: input.redirectTo,
  };
}

// --- transport -------------------------------------------------------------

const BASE = "/api/v1/seo/urls";

export async function fetchSeoUrls(params?: SeoUrlListParams) {
  return apiFetch<ApiSeoUrlListResponse>(`${BASE}${buildSeoUrlQuery(params)}`);
}

export async function updateSeoUrl(id: string, input: UpdateSeoUrlInput) {
  const res = await apiFetch<ApiSeoUrlResponse>(`${BASE}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return res.data;
}

/** Re-derive every record from the catalogue and website content. */
export async function syncSeoUrls() {
  return apiFetch<{ synced: number; count: number }>(`${BASE}/sync`, { method: "POST" });
}
