import { apiFetch } from "@/lib/api/client";
import type { MasterRow } from "@/lib/mock-data/hrm-recruitment-setup";

export type ApiHrmDesignation = {
  id: string;
  company_id: string;
  name: string;
  department_id: string | null;
  description: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ApiListResponse = {
  data: ApiHrmDesignation[];
  meta: { count: number };
  errors: string[];
};

type ApiItemResponse = {
  data: ApiHrmDesignation;
  errors: string[];
};

export function apiDesignationToMasterRow(row: ApiHrmDesignation): MasterRow {
  return {
    id: row.id,
    name: row.name,
    department_id: row.department_id ?? "",
    description: row.description ?? "",
    status: row.status,
  };
}

function blankToNull(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

export function masterPayloadToDesignationWrite(payload: Omit<MasterRow, "id">) {
  return {
    company_id: "default",
    name: String(payload.name ?? "").trim(),
    department_id: String(payload.department_id ?? "").trim(),
    description: blankToNull(payload.description) ?? undefined,
    status: String(payload.status ?? "active"),
  };
}

export async function listHrmDesignations(params?: {
  status?: string;
  department_id?: string;
  q?: string;
}): Promise<MasterRow[]> {
  const qs = new URLSearchParams();
  qs.set("company_id", "default");
  if (params?.status) qs.set("status", params.status);
  if (params?.department_id) qs.set("department_id", params.department_id);
  if (params?.q) qs.set("q", params.q);
  const res = await apiFetch<ApiListResponse>(
    `/api/v1/hrm/designations?${qs.toString()}`,
    { cache: "no-store" },
  );
  return (res.data ?? []).map(apiDesignationToMasterRow);
}

export async function createHrmDesignation(
  payload: Omit<MasterRow, "id">,
): Promise<MasterRow> {
  const res = await apiFetch<ApiItemResponse>("/api/v1/hrm/designations", {
    method: "POST",
    body: JSON.stringify(masterPayloadToDesignationWrite(payload)),
  });
  return apiDesignationToMasterRow(res.data);
}

export async function updateHrmDesignation(
  id: string,
  payload: Omit<MasterRow, "id">,
): Promise<MasterRow> {
  const { company_id: _c, ...patch } = masterPayloadToDesignationWrite(payload);
  const res = await apiFetch<ApiItemResponse>(
    `/api/v1/hrm/designations/${encodeURIComponent(id)}?company_id=default`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
  return apiDesignationToMasterRow(res.data);
}

export async function deleteHrmDesignation(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/designations/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}
