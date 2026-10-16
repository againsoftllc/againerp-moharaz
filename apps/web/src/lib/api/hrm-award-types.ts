import { apiFetch } from "@/lib/api/client";
import type { MasterRow } from "@/lib/mock-data/hrm-recruitment-setup";

export type ApiHrmAwardType = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ApiListResponse = {
  data: ApiHrmAwardType[];
  meta: { count: number };
  errors: string[];
};

type ApiItemResponse = {
  data: ApiHrmAwardType;
  errors: string[];
};

export function apiAwardTypeToMasterRow(row: ApiHrmAwardType): MasterRow {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    status: row.status,
  };
}

function blankToNull(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

export function masterPayloadToAwardTypeWrite(payload: Omit<MasterRow, "id">) {
  return {
    company_id: "default",
    name: String(payload.name ?? "").trim(),
    description: blankToNull(payload.description) ?? undefined,
    status: String(payload.status ?? "active"),
  };
}

export async function listHrmAwardTypes(params?: {
  status?: string;
  q?: string;
}): Promise<MasterRow[]> {
  const qs = new URLSearchParams();
  qs.set("company_id", "default");
  if (params?.status) qs.set("status", params.status);
  if (params?.q) qs.set("q", params.q);
  const res = await apiFetch<ApiListResponse>(
    `/api/v1/hrm/award-types?${qs.toString()}`,
    { cache: "no-store" },
  );
  return (res.data ?? []).map(apiAwardTypeToMasterRow);
}

export async function createHrmAwardType(
  payload: Omit<MasterRow, "id">,
): Promise<MasterRow> {
  const res = await apiFetch<ApiItemResponse>("/api/v1/hrm/award-types", {
    method: "POST",
    body: JSON.stringify(masterPayloadToAwardTypeWrite(payload)),
  });
  return apiAwardTypeToMasterRow(res.data);
}

export async function updateHrmAwardType(
  id: string,
  payload: Omit<MasterRow, "id">,
): Promise<MasterRow> {
  const { company_id: _c, ...patch } = masterPayloadToAwardTypeWrite(payload);
  const res = await apiFetch<ApiItemResponse>(
    `/api/v1/hrm/award-types/${encodeURIComponent(id)}?company_id=default`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
  return apiAwardTypeToMasterRow(res.data);
}

export async function deleteHrmAwardType(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/award-types/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}
