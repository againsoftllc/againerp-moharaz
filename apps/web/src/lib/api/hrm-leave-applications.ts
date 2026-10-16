import { apiFetch } from "@/lib/api/client";
import type { LeaveAppStatus, LeaveApplicationRow } from "@/lib/mock-data/hrm-leave-applications";

export type ApiHrmLeaveApplication = {
  id: string;
  company_id: string;
  employee_id: string | null;
  leave_type_id: string | null;
  leave_policy_id: string | null;
  start_date: string | null;
  end_date: string | null;
  total_days: number;
  reason: string | null;
  attachment: string | null;
  status: string;
  manager_comments: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ApiListResponse = {
  data: ApiHrmLeaveApplication[];
  meta: { count: number; page: number; per_page: number };
  errors: string[];
};

type ApiItemResponse = {
  data: ApiHrmLeaveApplication;
  errors: string[];
};

export type LeaveAppLookups = {
  employeeName: (id: string | null | undefined) => string;
  employeeCode: (id: string | null | undefined) => string;
  employeeEmail: (id: string | null | undefined) => string;
  employeeDesignation: (id: string | null | undefined) => string;
  leaveTypeName: (id: string | null | undefined) => string;
  leaveTypeIsPaid: (id: string | null | undefined) => boolean;
  leavePolicyName: (id: string | null | undefined) => string;
};

function blankToUndef(value: string | null | undefined): string | undefined {
  const text = (value ?? "").trim();
  return text === "" ? undefined : text;
}

function mapStatus(raw: string): LeaveAppStatus {
  if (raw === "approved" || raw === "rejected" || raw === "pending") return raw;
  return "pending";
}

function ymd(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function apiLeaveAppToRow(
  row: ApiHrmLeaveApplication,
  lookups: LeaveAppLookups,
): LeaveApplicationRow {
  return {
    id: row.id,
    employeeId: row.employee_id ?? "",
    employeeName: lookups.employeeName(row.employee_id),
    employeeCode: lookups.employeeCode(row.employee_id),
    employeeEmail: lookups.employeeEmail(row.employee_id),
    designation: lookups.employeeDesignation(row.employee_id),
    leaveTypeId: row.leave_type_id ?? "",
    leaveTypeName: lookups.leaveTypeName(row.leave_type_id),
    leavePolicyId: row.leave_policy_id ?? "",
    leavePolicy: lookups.leavePolicyName(row.leave_policy_id),
    startDate: ymd(row.start_date),
    endDate: ymd(row.end_date),
    totalDays: row.total_days ?? 0,
    reason: row.reason ?? "",
    attachment: row.attachment ?? "",
    status: mapStatus(row.status),
    appliedOn: ymd(row.created_at),
    approvedAt: ymd(row.approved_at),
    isPaid: lookups.leaveTypeIsPaid(row.leave_type_id),
  };
}

export async function listHrmLeaveApplications(params?: {
  page?: number;
  per_page?: number;
  employee_id?: string;
  status?: string;
  leave_type_id?: string;
}): Promise<{ rows: ApiHrmLeaveApplication[]; total: number }> {
  const qs = new URLSearchParams();
  qs.set("company_id", "default");
  qs.set("page", String(params?.page ?? 1));
  qs.set("per_page", String(params?.per_page ?? 200));
  if (params?.employee_id) qs.set("employee_id", params.employee_id);
  if (params?.status) qs.set("status", params.status);
  if (params?.leave_type_id) qs.set("leave_type_id", params.leave_type_id);
  const res = await apiFetch<ApiListResponse>(
    `/api/v1/hrm/leave-applications?${qs.toString()}`,
    { cache: "no-store" },
  );
  return { rows: res.data ?? [], total: res.meta?.count ?? res.data?.length ?? 0 };
}

export async function createHrmLeaveApplication(input: {
  employeeId: string;
  leaveTypeId: string;
  leavePolicyId: string;
  startDate: string;
  endDate: string;
  reason?: string;
  attachment?: string;
}): Promise<ApiHrmLeaveApplication> {
  const res = await apiFetch<ApiItemResponse>("/api/v1/hrm/leave-applications", {
    method: "POST",
    body: JSON.stringify({
      company_id: "default",
      employee_id: input.employeeId,
      leave_type_id: input.leaveTypeId,
      leave_policy_id: input.leavePolicyId,
      start_date: input.startDate,
      end_date: input.endDate,
      reason: blankToUndef(input.reason),
      attachment: blankToUndef(input.attachment),
    }),
  });
  return res.data;
}

export async function updateHrmLeaveApplication(
  id: string,
  input: {
    leaveTypeId: string;
    leavePolicyId: string;
    startDate: string;
    endDate: string;
    reason?: string;
    attachment?: string;
  },
): Promise<ApiHrmLeaveApplication> {
  const res = await apiFetch<ApiItemResponse>(
    `/api/v1/hrm/leave-applications/${encodeURIComponent(id)}?company_id=default`,
    {
      method: "PATCH",
      body: JSON.stringify({
        leave_type_id: input.leaveTypeId,
        leave_policy_id: input.leavePolicyId,
        start_date: input.startDate,
        end_date: input.endDate,
        reason: blankToUndef(input.reason),
        attachment: blankToUndef(input.attachment),
      }),
    },
  );
  return res.data;
}

export async function approveHrmLeaveApplication(
  id: string,
  managerComments?: string,
): Promise<ApiHrmLeaveApplication> {
  const res = await apiFetch<ApiItemResponse>(
    `/api/v1/hrm/leave-applications/${encodeURIComponent(id)}/approve?company_id=default`,
    {
      method: "POST",
      body: JSON.stringify({
        manager_comments: blankToUndef(managerComments),
      }),
    },
  );
  return res.data;
}

export async function rejectHrmLeaveApplication(
  id: string,
  managerComments?: string,
): Promise<ApiHrmLeaveApplication> {
  const res = await apiFetch<ApiItemResponse>(
    `/api/v1/hrm/leave-applications/${encodeURIComponent(id)}/reject?company_id=default`,
    {
      method: "POST",
      body: JSON.stringify({
        manager_comments: blankToUndef(managerComments),
      }),
    },
  );
  return res.data;
}

export async function deleteHrmLeaveApplication(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/leave-applications/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}
