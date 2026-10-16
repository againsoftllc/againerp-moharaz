import { apiFetch } from "@/lib/api/client";
import type { MasterRow } from "@/lib/mock-data/hrm-recruitment-setup";

export type ApiHrmLeavePolicy = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  leave_type_id: string | null;
  accrual_type: string;
  accrual_rate: string | number;
  carry_forward_limit: number;
  min_days_per_application: number;
  max_days_per_application: number;
  requires_approval: boolean;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ApiListResponse = {
  data: ApiHrmLeavePolicy[];
  meta: { count: number };
  errors: string[];
};

type ApiItemResponse = {
  data: ApiHrmLeavePolicy;
  errors: string[];
};

export type LeaveTypeNameLookup = (id: string | null | undefined) => string;

export function apiLeavePolicyToMasterRow(
  row: ApiHrmLeavePolicy,
  leaveTypeName?: LeaveTypeNameLookup,
): MasterRow {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    leave_type_id: row.leave_type_id ?? "",
    leaveType: leaveTypeName?.(row.leave_type_id) ?? row.leave_type_id ?? "",
    accrualType: row.accrual_type,
    accrualRate: Number(row.accrual_rate),
    carryForwardLimit: row.carry_forward_limit,
    minDaysPerApplication: row.min_days_per_application,
    maxDaysPerApplication: row.max_days_per_application,
    requiresApproval: row.requires_approval,
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

function toAccrualType(value: unknown): "monthly" | "yearly" {
  return String(value) === "monthly" ? "monthly" : "yearly";
}

export function masterPayloadToLeavePolicyWrite(payload: Omit<MasterRow, "id">) {
  return {
    company_id: "default",
    name: String(payload.name ?? "").trim(),
    description: blankToNull(payload.description) ?? undefined,
    leave_type_id: String(payload.leave_type_id ?? "").trim(),
    accrual_type: toAccrualType(payload.accrualType),
    accrual_rate: Number(payload.accrualRate ?? 0),
    carry_forward_limit: toInt(payload.carryForwardLimit, 0),
    min_days_per_application: toInt(payload.minDaysPerApplication, 1),
    max_days_per_application: toInt(payload.maxDaysPerApplication, 30),
    requires_approval:
      payload.requiresApproval === undefined
        ? true
        : payload.requiresApproval === true || payload.requiresApproval === "true",
    status: String(payload.status ?? "active"),
  };
}

export async function listHrmLeavePolicies(params?: {
  status?: string;
  leave_type_id?: string;
  q?: string;
}): Promise<ApiHrmLeavePolicy[]> {
  const qs = new URLSearchParams();
  qs.set("company_id", "default");
  if (params?.status) qs.set("status", params.status);
  if (params?.leave_type_id) qs.set("leave_type_id", params.leave_type_id);
  if (params?.q) qs.set("q", params.q);
  const res = await apiFetch<ApiListResponse>(
    `/api/v1/hrm/leave-policies?${qs.toString()}`,
    { cache: "no-store" },
  );
  return res.data ?? [];
}

export async function createHrmLeavePolicy(
  payload: Omit<MasterRow, "id">,
): Promise<ApiHrmLeavePolicy> {
  const res = await apiFetch<ApiItemResponse>("/api/v1/hrm/leave-policies", {
    method: "POST",
    body: JSON.stringify(masterPayloadToLeavePolicyWrite(payload)),
  });
  return res.data;
}

export async function updateHrmLeavePolicy(
  id: string,
  payload: Omit<MasterRow, "id">,
): Promise<ApiHrmLeavePolicy> {
  const { company_id: _c, ...patch } = masterPayloadToLeavePolicyWrite(payload);
  const res = await apiFetch<ApiItemResponse>(
    `/api/v1/hrm/leave-policies/${encodeURIComponent(id)}?company_id=default`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
  return res.data;
}

export async function deleteHrmLeavePolicy(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/leave-policies/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}
