import { apiFetch } from "@/lib/api/client";
import type { MasterRow } from "@/lib/mock-data/hrm-recruitment-setup";

export type ApiHrmDepartment = {
  id: string;
  company_id: string;
  name: string;
  branch_id: string | null;
  description: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ApiListResponse = {
  data: ApiHrmDepartment[];
  meta: { count: number };
  errors: string[];
};

type ApiItemResponse = {
  data: ApiHrmDepartment;
  errors: string[];
};

export function apiDepartmentToMasterRow(row: ApiHrmDepartment): MasterRow {
  return {
    id: row.id,
    name: row.name,
    branch_id: row.branch_id ?? "",
    description: row.description ?? "",
    status: row.status,
  };
}

function blankToNull(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

export function masterPayloadToDepartmentWrite(payload: Omit<MasterRow, "id">) {
  return {
    company_id: "default",
    name: String(payload.name ?? "").trim(),
    branch_id: String(payload.branch_id ?? "").trim(),
    description: blankToNull(payload.description) ?? undefined,
    status: String(payload.status ?? "active"),
  };
}

export async function listHrmDepartments(params?: {
  status?: string;
  branch_id?: string;
  q?: string;
}): Promise<MasterRow[]> {
  const qs = new URLSearchParams();
  qs.set("company_id", "default");
  if (params?.status) qs.set("status", params.status);
  if (params?.branch_id) qs.set("branch_id", params.branch_id);
  if (params?.q) qs.set("q", params.q);
  const res = await apiFetch<ApiListResponse>(
    `/api/v1/hrm/departments?${qs.toString()}`,
    { cache: "no-store" },
  );
  return (res.data ?? []).map(apiDepartmentToMasterRow);
}

export async function createHrmDepartment(
  payload: Omit<MasterRow, "id">,
): Promise<MasterRow> {
  const res = await apiFetch<ApiItemResponse>("/api/v1/hrm/departments", {
    method: "POST",
    body: JSON.stringify(masterPayloadToDepartmentWrite(payload)),
  });
  return apiDepartmentToMasterRow(res.data);
}

export async function updateHrmDepartment(
  id: string,
  payload: Omit<MasterRow, "id">,
): Promise<MasterRow> {
  const { company_id: _c, ...patch } = masterPayloadToDepartmentWrite(payload);
  const res = await apiFetch<ApiItemResponse>(
    `/api/v1/hrm/departments/${encodeURIComponent(id)}?company_id=default`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
  return apiDepartmentToMasterRow(res.data);
}

export async function deleteHrmDepartment(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/departments/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}
