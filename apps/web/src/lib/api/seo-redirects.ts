import { apiFetch } from "@/lib/api/client";
import type { RedirectRule, RedirectStatus, RedirectType } from "@/lib/mock-data/seo";

export type ApiSeoRedirect = {
  id: string;
  from_path: string;
  to_path: string | null;
  redirect_type: string;
  status: string;
  hits_30d: number;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type ApiSeoRedirectMeta = {
  count: number;
  active_count: number;
  draft_count: number;
  disabled_count: number;
  hits_30d_total: number;
};

export type ApiSeoRedirectListResponse = {
  data: ApiSeoRedirect[];
  meta: ApiSeoRedirectMeta;
};

export type ApiSeoRedirectResponse = {
  data: ApiSeoRedirect;
};

export type SeoRedirectListParams = {
  search?: string;
  redirect_type?: string;
  status?: string;
};

export type CreateSeoRedirectInput = {
  from: string;
  to?: string;
  type: RedirectType;
  status: RedirectStatus;
  note?: string;
};

export type UpdateSeoRedirectInput = Partial<CreateSeoRedirectInput>;

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toISOString().slice(0, 10);
}

export function apiRedirectToRule(row: ApiSeoRedirect): RedirectRule {
  return {
    id: row.id,
    from: row.from_path,
    to: row.to_path ?? "",
    type: row.redirect_type as RedirectType,
    status: row.status as RedirectStatus,
    hits30d: row.hits_30d,
    createdAt: formatDate(row.created_at),
    updatedAt: formatDate(row.updated_at),
    note: row.note ?? undefined,
  };
}

export function buildSeoRedirectQuery(params?: SeoRedirectListParams): string {
  const q = new URLSearchParams();
  if (params?.search) q.set("search", params.search);
  if (params?.redirect_type && params.redirect_type !== "all") {
    q.set("redirect_type", params.redirect_type);
  }
  if (params?.status && params.status !== "all") q.set("status", params.status);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function redirectInputToApiPayload(input: CreateSeoRedirectInput) {
  return {
    from_path: input.from.trim(),
    to_path: input.type === "410" ? null : (input.to ?? "").trim() || null,
    redirect_type: input.type,
    status: input.status,
    note: input.note?.trim() || null,
  };
}

export function redirectUpdateToApiPayload(input: UpdateSeoRedirectInput) {
  const payload: Record<string, string | null> = {};
  if ("from" in input && input.from !== undefined) payload.from_path = input.from.trim();
  if ("to" in input && input.to !== undefined) payload.to_path = input.to.trim() || null;
  if ("type" in input && input.type !== undefined) payload.redirect_type = input.type;
  if ("status" in input && input.status !== undefined) payload.status = input.status;
  if ("note" in input) payload.note = input.note?.trim() || null;
  return payload;
}

// --- transport -------------------------------------------------------------

const BASE = "/api/v1/seo/redirects";

export async function fetchSeoRedirects(params?: SeoRedirectListParams) {
  return apiFetch<ApiSeoRedirectListResponse>(`${BASE}${buildSeoRedirectQuery(params)}`);
}

export async function createSeoRedirect(input: CreateSeoRedirectInput) {
  const res = await apiFetch<ApiSeoRedirectResponse>(BASE, {
    method: "POST",
    body: JSON.stringify(redirectInputToApiPayload(input)),
  });
  return res.data;
}

export async function updateSeoRedirect(id: string, input: UpdateSeoRedirectInput) {
  const res = await apiFetch<ApiSeoRedirectResponse>(`${BASE}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(redirectUpdateToApiPayload(input)),
  });
  return res.data;
}

export async function deleteSeoRedirect(id: string) {
  await apiFetch<void>(`${BASE}/${id}`, { method: "DELETE" });
}
