import { apiFetch } from "@/lib/api/client";

export type SiteStatus = "active" | "inactive" | "setup";

export type WorkspaceSite = {
  id: string;
  company_id: string;
  code: string;
  name: string;
  status: SiteStatus | string;
  plan: string;
  owner: string;
  primary_domain: string;
  domain_aliases: string;
  storefront_url_local: string;
  storefront_url_preview: string;
  storefront_url_production: string;
  git_repo_url: string;
  git_default_branch: string;
  vercel_project_id: string;
  vercel_project_name: string;
  vercel_team_slug: string;
  tagline: string;
  logo_url: string;
  logo_mobile_url: string;
  favicon_url: string;
  address: string;
  contact_phone: string;
  contact_email: string;
  whatsapp_number: string;
  copyright_text: string;
  business_hours: string;
  meta_title: string;
  meta_description: string;
  meta_keywords: string;
  options?: Record<string, unknown>;
  currency: string;
  timezone: string;
  notes: string;
  is_primary: boolean;
  branches: number;
  products: number;
  orders: number;
  created_at?: string;
  updated_at?: string;
};

export type WorkspaceSiteWrite = Partial<
  Omit<WorkspaceSite, "branches" | "products" | "orders" | "created_at" | "updated_at" | "company_id">
> & {
  code?: string;
  name?: string;
};

type ListResponse = { data: WorkspaceSite[]; total: number };
type ItemResponse = { data: WorkspaceSite };

export async function listWorkspaceSites(q?: string): Promise<WorkspaceSite[]> {
  const qs = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
  const res = await apiFetch<ListResponse>(`/api/v1/workspace/sites${qs}`);
  return res.data ?? [];
}

export async function getPrimaryWorkspaceSite(): Promise<WorkspaceSite> {
  const res = await apiFetch<ItemResponse>("/api/v1/workspace/sites/primary");
  return res.data;
}

export async function getWorkspaceSite(id: string): Promise<WorkspaceSite> {
  const res = await apiFetch<ItemResponse>(`/api/v1/workspace/sites/${encodeURIComponent(id)}`);
  return res.data;
}

export async function fetchSiteCorsOrigins(): Promise<string[]> {
  const res = await apiFetch<{ data: { origins: string[]; count: number } }>(
    "/api/v1/workspace/sites/cors-origins",
  );
  return res.data?.origins ?? [];
}

export async function refreshSiteCorsOrigins(): Promise<string[]> {
  const res = await apiFetch<{ data: { origins: string[]; count: number } }>(
    "/api/v1/workspace/sites/refresh-cors",
    { method: "POST" },
  );
  return res.data?.origins ?? [];
}

export async function createWorkspaceSite(payload: WorkspaceSiteWrite): Promise<WorkspaceSite> {
  const res = await apiFetch<ItemResponse>("/api/v1/workspace/sites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function updateWorkspaceSite(
  id: string,
  payload: WorkspaceSiteWrite,
): Promise<WorkspaceSite> {
  const res = await apiFetch<ItemResponse>(`/api/v1/workspace/sites/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.data;
}
