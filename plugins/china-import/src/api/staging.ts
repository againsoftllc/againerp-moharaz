/** Staging API client — never writes to catalog/inventory tables. */

const STAGING_PREFIX = "/api/v1/plugins/china-import/staging";

function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("againerp-admin-auth");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { token?: string } };
    return parsed.state?.token ?? null;
  } catch {
    return null;
  }
}

export class StagingApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "StagingApiError";
    this.status = status;
  }
}

export async function stagingFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`${STAGING_PREFIX}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new StagingApiError(text || res.statusText, res.status);
  }
  return res.json() as Promise<T>;
}

export type StagingQueueMeta = {
  count: number;
  pending_jobs: number;
  completed_jobs: number;
  failed_jobs: number;
  warning_items: number;
  pending_items: number;
};

export type StagingImage = {
  id: string;
  item_id: string;
  url: string;
  thumbnail_url?: string | null;
  position: number;
  width?: number | null;
  height?: number | null;
  is_primary: boolean;
  status: string;
};

export type StagingVariant = {
  id: string;
  item_id: string;
  sku: string;
  barcode?: string | null;
  price?: string | null;
  sale_price?: string | null;
  stock?: number | null;
  weight?: string | null;
  image_url?: string | null;
  attributes_json?: Record<string, unknown> | null;
  status: string;
};

export type StagingError = {
  id: string;
  kind: string;
  field?: string | null;
  message: string;
  severity: string;
};

export type StagingItem = {
  id: string;
  job_id: string;
  provider: string;
  provider_product_id: string;
  status: string;
  title: string;
  currency: string;
  base_price?: string | null;
  sale_price?: string | null;
  brand_name?: string | null;
  category_name?: string | null;
  supplier_name?: string | null;
  universal_json?: Record<string, unknown> | null;
  raw_json?: Record<string, unknown> | null;
  validation_json?: Record<string, unknown> | null;
  draft_json?: Record<string, unknown> | null;
  warning_count: number;
  error_count: number;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
  created_at: string;
  updated_at: string;
  images: StagingImage[];
  variants: StagingVariant[];
  errors: StagingError[];
};

export type StagingJob = {
  id: string;
  provider: string;
  status: string;
  user_email: string;
  item_count: number;
  success_count: number;
  error_count: number;
  warning_count: number;
  source_label?: string | null;
  duration_ms?: number | null;
  created_at: string;
};

export type CreateStagingJobInput = {
  provider: string;
  source_label?: string;
  notes?: string;
  products: Array<{
    provider_product_id: string;
    universal: Record<string, unknown>;
    raw?: Record<string, unknown>;
  }>;
};

export function buildItemQuery(params?: {
  status?: string;
  provider?: string;
  brand?: string;
  category?: string;
  q?: string;
  job_id?: string;
}): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  if (params.status) sp.set("status", params.status);
  if (params.provider) sp.set("provider", params.provider);
  if (params.brand) sp.set("brand", params.brand);
  if (params.category) sp.set("category", params.category);
  if (params.q) sp.set("q", params.q);
  if (params.job_id) sp.set("job_id", params.job_id);
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export async function listStagingJobs(status?: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return stagingFetch<{ data: StagingJob[]; meta: StagingQueueMeta }>(`/jobs${qs}`);
}

export async function listStagingItems(params?: Parameters<typeof buildItemQuery>[0]) {
  return stagingFetch<{ data: StagingItem[]; meta: StagingQueueMeta }>(
    `/items${buildItemQuery(params)}`,
  );
}

export async function getStagingItem(id: string) {
  return stagingFetch<{ data: StagingItem }>(`/items/${id}`);
}

export async function createStagingJob(input: CreateStagingJobInput) {
  return stagingFetch<{ data: { id: string; items: StagingItem[] } }>("/jobs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function reviewStagingItem(
  id: string,
  status: "approved" | "rejected",
  review_notes?: string,
) {
  return stagingFetch<{ data: StagingItem }>(`/items/${id}/review`, {
    method: "PATCH",
    body: JSON.stringify({ status, review_notes }),
  });
}

export async function saveStagingDraft(id: string, draft_json: Record<string, unknown>) {
  return stagingFetch<{ data: StagingItem }>(`/items/${id}/draft`, {
    method: "PATCH",
    body: JSON.stringify({ draft_json }),
  });
}

export async function bulkStagingAction(
  item_ids: string[],
  action: "approve" | "reject" | "delete" | "export",
) {
  return stagingFetch<{ action: string; count: number; data?: unknown[] }>("/items/bulk", {
    method: "POST",
    body: JSON.stringify({ item_ids, action }),
  });
}

export async function patchStagingImage(
  id: string,
  patch: { is_primary?: boolean; status?: string; url?: string },
) {
  return stagingFetch<StagingImage>(`/images/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteStagingImage(id: string) {
  return stagingFetch<{ ok: boolean }>(`/images/${id}`, { method: "DELETE" });
}
