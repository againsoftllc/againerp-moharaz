import { apiFetch } from "@/lib/api/client";
import type {
  AttendanceRegularization,
  RegularizationStatus,
} from "@/lib/mock-data/hrm-regularizations";

export type ApiHrmAttendanceRegularization = {
  id: string;
  company_id: string;
  employee_id: string | null;
  attendance_record_id: string | null;
  date: string | null;
  requested_clock_in: string | null;
  requested_clock_out: string | null;
  original_clock_in: string | null;
  original_clock_out: string | null;
  reason: string | null;
  status: string;
  manager_comments: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ApiListResponse = {
  data: ApiHrmAttendanceRegularization[];
  meta: { count: number; page: number; per_page: number };
  errors: string[];
};

type ApiItemResponse = {
  data: ApiHrmAttendanceRegularization;
  errors: string[];
};

export type RegularizationLookups = {
  employeeName: (id: string | null | undefined) => string;
  employeeCode: (id: string | null | undefined) => string;
};

function blankToUndef(value: string | null | undefined): string | undefined {
  const text = (value ?? "").trim();
  return text === "" ? undefined : text;
}

function mapStatus(raw: string): RegularizationStatus {
  if (raw === "approved" || raw === "rejected" || raw === "pending") return raw;
  return "pending";
}

function ymd(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function apiRegularizationToUi(
  row: ApiHrmAttendanceRegularization,
  lookups: RegularizationLookups,
): AttendanceRegularization {
  return {
    id: row.id,
    employeeId: row.employee_id ?? "",
    employeeName: lookups.employeeName(row.employee_id),
    employeeCode: lookups.employeeCode(row.employee_id),
    attendanceRecordId: row.attendance_record_id ?? "",
    attendanceRecord: row.attendance_record_id ?? "",
    date: ymd(row.date),
    originalClockIn: row.original_clock_in ?? "",
    originalClockOut: row.original_clock_out ?? "",
    requestedClockIn: row.requested_clock_in ?? "",
    requestedClockOut: row.requested_clock_out ?? "",
    reason: row.reason ?? "",
    status: mapStatus(row.status),
    requestedOn: ymd(row.created_at),
    approvedAt: ymd(row.approved_at),
  };
}

export async function listHrmAttendanceRegularizations(params?: {
  page?: number;
  per_page?: number;
  employee_id?: string;
  status?: string;
}): Promise<{ rows: ApiHrmAttendanceRegularization[]; total: number }> {
  const qs = new URLSearchParams();
  qs.set("company_id", "default");
  qs.set("page", String(params?.page ?? 1));
  qs.set("per_page", String(params?.per_page ?? 200));
  if (params?.employee_id) qs.set("employee_id", params.employee_id);
  if (params?.status) qs.set("status", params.status);
  const res = await apiFetch<ApiListResponse>(
    `/api/v1/hrm/attendance-regularizations?${qs.toString()}`,
    { cache: "no-store" },
  );
  return { rows: res.data ?? [], total: res.meta?.count ?? res.data?.length ?? 0 };
}

export async function createHrmAttendanceRegularization(input: {
  employeeId: string;
  attendanceRecordId: string;
  date: string;
  requestedClockIn?: string;
  requestedClockOut?: string;
  reason?: string;
}): Promise<ApiHrmAttendanceRegularization> {
  const res = await apiFetch<ApiItemResponse>("/api/v1/hrm/attendance-regularizations", {
    method: "POST",
    body: JSON.stringify({
      company_id: "default",
      employee_id: input.employeeId,
      attendance_record_id: input.attendanceRecordId,
      date: input.date,
      requested_clock_in: blankToUndef(input.requestedClockIn),
      requested_clock_out: blankToUndef(input.requestedClockOut),
      reason: blankToUndef(input.reason),
    }),
  });
  return res.data;
}

export async function updateHrmAttendanceRegularization(
  id: string,
  input: {
    requestedClockIn?: string;
    requestedClockOut?: string;
    reason?: string;
  },
): Promise<ApiHrmAttendanceRegularization> {
  const res = await apiFetch<ApiItemResponse>(
    `/api/v1/hrm/attendance-regularizations/${encodeURIComponent(id)}?company_id=default`,
    {
      method: "PATCH",
      body: JSON.stringify({
        requested_clock_in: blankToUndef(input.requestedClockIn),
        requested_clock_out: blankToUndef(input.requestedClockOut),
        reason: blankToUndef(input.reason),
      }),
    },
  );
  return res.data;
}

export async function approveHrmAttendanceRegularization(
  id: string,
  managerComments?: string,
): Promise<ApiHrmAttendanceRegularization> {
  const res = await apiFetch<ApiItemResponse>(
    `/api/v1/hrm/attendance-regularizations/${encodeURIComponent(id)}/approve?company_id=default`,
    {
      method: "POST",
      body: JSON.stringify({ manager_comments: blankToUndef(managerComments) }),
    },
  );
  return res.data;
}

export async function rejectHrmAttendanceRegularization(
  id: string,
  managerComments?: string,
): Promise<ApiHrmAttendanceRegularization> {
  const res = await apiFetch<ApiItemResponse>(
    `/api/v1/hrm/attendance-regularizations/${encodeURIComponent(id)}/reject?company_id=default`,
    {
      method: "POST",
      body: JSON.stringify({ manager_comments: blankToUndef(managerComments) }),
    },
  );
  return res.data;
}

export async function deleteHrmAttendanceRegularization(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/attendance-regularizations/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}
