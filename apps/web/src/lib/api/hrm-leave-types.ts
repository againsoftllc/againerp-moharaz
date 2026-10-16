import { apiFetch } from "@/lib/api/client";
import type { MasterRow } from "@/lib/mock-data/hrm-recruitment-setup";

export type ApiHrmLeaveType = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  max_days_per_year: number;
  is_paid: boolean;
  color: string;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ApiListResponse = {
  data: ApiHrmLeaveType[];
  meta: { count: number };
  errors: string[];
};

type ApiItemResponse = {
  data: ApiHrmLeaveType;
  errors: string[];
};

export function apiLeaveTypeToMasterRow(row: ApiHrmLeaveType): MasterRow {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    maxDaysPerYear: row.max_days_per_year,
    isPaid: row.is_paid,
    color: row.color,
    status: row.status,
  };
}

function blankToNull(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function toInt(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : fallback;
}

export function masterPayloadToLeaveTypeWrite(payload: Omit<MasterRow, "id">) {
  return {
    company_id: "default",
    name: String(payload.name ?? "").trim(),
    description: blankToNull(payload.description) ?? undefined,
    max_days_per_year: toInt(payload.maxDaysPerYear, 0),
    is_paid: payload.isPaid === true || payload.isPaid === "true",
    color: String(payload.color ?? "#3B82F6").trim() || "#3B82F6",
    status: String(payload.status ?? "active"),
  };
}

export async function listHrmLeaveTypes(params?: {
  status?: string;
  q?: string;
}): Promise<MasterRow[]> {
  const qs = new URLSearchParams();
  qs.set("company_id", "default");
  if (params?.status) qs.set("status", params.status);
  if (params?.q) qs.set("q", params.q);
  const res = await apiFetch<ApiListResponse>(
    `/api/v1/hrm/leave-types?${qs.toString()}`,
    { cache: "no-store" },
  );
  return (res.data ?? []).map(apiLeaveTypeToMasterRow);
}

export async function createHrmLeaveType(
  payload: Omit<MasterRow, "id">,
): Promise<MasterRow> {
  const res = await apiFetch<ApiItemResponse>("/api/v1/hrm/leave-types", {
    method: "POST",
    body: JSON.stringify(masterPayloadToLeaveTypeWrite(payload)),
  });
  return apiLeaveTypeToMasterRow(res.data);
}

export async function updateHrmLeaveType(
  id: string,
  payload: Omit<MasterRow, "id">,
): Promise<MasterRow> {
  const { company_id: _c, ...patch } = masterPayloadToLeaveTypeWrite(payload);
  const res = await apiFetch<ApiItemResponse>(
    `/api/v1/hrm/leave-types/${encodeURIComponent(id)}?company_id=default`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
  return apiLeaveTypeToMasterRow(res.data);
}

export async function deleteHrmLeaveType(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/leave-types/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}
