/** Smart mapping API — provider independent. */

const MAPPING_PREFIX = "/api/v1/plugins/china-import/mapping";

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

export class MappingApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "MappingApiError";
    this.status = status;
  }
}

async function mappingFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`${MAPPING_PREFIX}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new MappingApiError(text || res.statusText, res.status);
  }
  return res.json() as Promise<T>;
}

export type MappingEntityType = "brand" | "category" | "attribute" | "supplier";

export type MappingCandidate = {
  id: string;
  name: string;
  score?: number;
  entity_type?: string;
  slug?: string;
  path?: string;
  code?: string;
  vendor_code?: string;
  source?: string;
  reason?: string;
};

export type EntityMapping = {
  id: string;
  provider: string;
  entity_type: MappingEntityType;
  provider_entity_id: string;
  provider_name: string;
  provider_path?: string[] | null;
  erp_entity_id?: string | null;
  erp_entity_name?: string | null;
  status: string;
  match_method: string;
  confidence: number;
  suggestions: MappingCandidate[];
  conflicts: MappingCandidate[];
  metadata?: Record<string, unknown> | null;
  source_item_id?: string | null;
  merged_into_id?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  review_notes?: string | null;
  created_at: string;
  updated_at: string;
};

export type MappingDashboardMeta = {
  total: number;
  by_entity_type: Record<string, number>;
  by_status: Record<string, number>;
  pending_review: number;
  approved: number;
  conflicts: number;
  rules: number;
};

export type MappingRule = {
  id: string;
  entity_type: MappingEntityType;
  provider?: string | null;
  pattern_type: string;
  pattern_value: string;
  erp_entity_id: string;
  erp_entity_name: string;
  priority: number;
  is_active: boolean;
  notes?: string | null;
};

function buildQuery(params?: Record<string, string | undefined>): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export async function getMappingDashboard() {
  return mappingFetch<{ meta: MappingDashboardMeta }>("/dashboard");
}

export async function listEntityMappings(params?: {
  entity_type?: string;
  provider?: string;
  status?: string;
  q?: string;
}) {
  return mappingFetch<{ data: EntityMapping[]; meta: MappingDashboardMeta }>(
    `/mappings${buildQuery(params)}`,
  );
}

export async function scanUniversalMapping(universal: Record<string, unknown>, source_item_id?: string) {
  return mappingFetch<{ data: EntityMapping[] }>("/mappings/scan", {
    method: "POST",
    body: JSON.stringify({ universal, source_item_id }),
  });
}

export async function scanItemMapping(item_id: string) {
  return mappingFetch<{ data: EntityMapping[] }>("/mappings/scan-item", {
    method: "POST",
    body: JSON.stringify({ item_id }),
  });
}

export async function approveEntityMapping(
  id: string,
  patch?: { erp_entity_id?: string; erp_entity_name?: string; review_notes?: string },
) {
  return mappingFetch<{ data: EntityMapping }>(`/mappings/${id}/approve`, {
    method: "PATCH",
    body: JSON.stringify(patch ?? {}),
  });
}

export async function rejectEntityMapping(id: string, review_notes?: string) {
  return mappingFetch<{ data: EntityMapping }>(`/mappings/${id}/reject`, {
    method: "PATCH",
    body: JSON.stringify({ review_notes }),
  });
}

export async function manualEntityMapping(
  id: string,
  erp_entity_id: string,
  erp_entity_name: string,
  review_notes?: string,
) {
  return mappingFetch<{ data: EntityMapping }>(`/mappings/${id}/manual`, {
    method: "PATCH",
    body: JSON.stringify({ erp_entity_id, erp_entity_name, review_notes }),
  });
}

export async function resolveMappingConflict(
  id: string,
  erp_entity_id: string,
  erp_entity_name: string,
  review_notes?: string,
) {
  return mappingFetch<{ data: EntityMapping }>(`/mappings/${id}/resolve`, {
    method: "PATCH",
    body: JSON.stringify({ erp_entity_id, erp_entity_name, review_notes }),
  });
}

export async function mergeEntityMappings(target_id: string, source_ids: string[]) {
  return mappingFetch<{ data: EntityMapping }>("/mappings/merge", {
    method: "POST",
    body: JSON.stringify({ target_id, source_ids }),
  });
}

export async function listMappingRules(entity_type?: string) {
  return mappingFetch<MappingRule[]>(`/rules${buildQuery({ entity_type })}`);
}
