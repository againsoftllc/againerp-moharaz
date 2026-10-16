import { apiFetch } from "@/lib/api/client";
import type {
  EmployeeLeaveBalanceCard,
  LeaveBalanceLine,
} from "@/lib/mock-data/hrm-leave-balances";

export type ApiHrmLeaveBalance = {
  id: string;
  company_id: string;
  employee_id: string | null;
  leave_type_id: string | null;
  leave_policy_id: string | null;
  year: string | null;
  allocated_days: string | number;
  used_days: string | number;
  remaining_days: string | number;
  carried_forward: string | number;
  manual_adjustment: string | number;
  adjustment_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ApiListResponse = {
  data: ApiHrmLeaveBalance[];
  meta: { count: number };
  errors: string[];
};

type ApiItemResponse = {
  data: ApiHrmLeaveBalance;
  errors: string[];
};

export type LeaveBalanceLookups = {
  employeeName: (id: string | null | undefined) => string;
  employeeCode: (id: string | null | undefined) => string;
  leaveTypeName: (id: string | null | undefined) => string;
  leavePolicyName: (id: string | null | undefined) => string;
};

function num(value: string | number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function apiBalanceToLine(
  row: ApiHrmLeaveBalance,
  lookups: LeaveBalanceLookups,
): LeaveBalanceLine {
  return {
    id: row.id,
    leaveTypeId: row.leave_type_id ?? "",
    leaveTypeName: lookups.leaveTypeName(row.leave_type_id),
    leavePolicyId: row.leave_policy_id ?? "",
    leavePolicy: lookups.leavePolicyName(row.leave_policy_id),
    allocatedDays: num(row.allocated_days),
    usedDays: num(row.used_days),
    remainingDays: num(row.remaining_days),
    carriedForward: num(row.carried_forward),
    manualAdjustment: num(row.manual_adjustment),
    adjustmentReason: row.adjustment_reason ?? "",
  };
}

export function groupBalancesIntoCards(
  rows: ApiHrmLeaveBalance[],
  lookups: LeaveBalanceLookups,
  year: number,
): EmployeeLeaveBalanceCard[] {
  const byEmp = new Map<string, LeaveBalanceLine[]>();
  for (const row of rows) {
    const empId = row.employee_id ?? "";
    if (!empId) continue;
    const list = byEmp.get(empId) ?? [];
    list.push(apiBalanceToLine(row, lookups));
    byEmp.set(empId, list);
  }
  return [...byEmp.entries()]
    .map(([employeeId, lines]) => ({
      employeeId,
      employeeName: lookups.employeeName(employeeId),
      employeeCode: lookups.employeeCode(employeeId),
      year,
      lines: lines.sort((a, b) => a.leaveTypeName.localeCompare(b.leaveTypeName)),
    }))
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
}

export async function listHrmLeaveBalances(params?: {
  employee_id?: string;
  leave_type_id?: string;
  year?: string;
}): Promise<ApiHrmLeaveBalance[]> {
  const qs = new URLSearchParams();
  qs.set("company_id", "default");
  if (params?.employee_id) qs.set("employee_id", params.employee_id);
  if (params?.leave_type_id) qs.set("leave_type_id", params.leave_type_id);
  if (params?.year) qs.set("year", params.year);
  const res = await apiFetch<ApiListResponse>(
    `/api/v1/hrm/leave-balances?${qs.toString()}`,
    { cache: "no-store" },
  );
  return res.data ?? [];
}

export async function createHrmLeaveBalance(input: {
  employeeId: string;
  leaveTypeId: string;
  leavePolicyId: string;
  year: string;
  allocatedDays?: number;
  usedDays?: number;
  carriedForward?: number;
  manualAdjustment?: number;
  adjustmentReason?: string;
}): Promise<ApiHrmLeaveBalance> {
  const res = await apiFetch<ApiItemResponse>("/api/v1/hrm/leave-balances", {
    method: "POST",
    body: JSON.stringify({
      company_id: "default",
      employee_id: input.employeeId,
      leave_type_id: input.leaveTypeId,
      leave_policy_id: input.leavePolicyId,
      year: input.year,
      allocated_days: input.allocatedDays ?? 0,
      used_days: input.usedDays ?? 0,
      carried_forward: input.carriedForward ?? 0,
      manual_adjustment: input.manualAdjustment ?? 0,
      adjustment_reason: input.adjustmentReason || undefined,
    }),
  });
  return res.data;
}

export async function updateHrmLeaveBalance(
  id: string,
  input: {
    allocatedDays?: number;
    usedDays?: number;
    carriedForward?: number;
    manualAdjustment?: number;
    adjustmentReason?: string;
  },
): Promise<ApiHrmLeaveBalance> {
  const body: Record<string, string | number> = {};
  if (input.allocatedDays != null) body.allocated_days = input.allocatedDays;
  if (input.usedDays != null) body.used_days = input.usedDays;
  if (input.carriedForward != null) body.carried_forward = input.carriedForward;
  if (input.manualAdjustment != null) body.manual_adjustment = input.manualAdjustment;
  if (input.adjustmentReason != null) body.adjustment_reason = input.adjustmentReason;
  const res = await apiFetch<ApiItemResponse>(
    `/api/v1/hrm/leave-balances/${encodeURIComponent(id)}?company_id=default`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  return res.data;
}

export async function deleteHrmLeaveBalance(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/leave-balances/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}
