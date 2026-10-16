import { apiFetch } from "@/lib/api/client";

export type ApiHrmAttendanceRecord = {
  id: string;
  company_id: string;
  employee_id: string | null;
  biometric_id: string | null;
  shift_id: string | null;
  attendance_policy_id: string | null;
  date: string | null;
  clock_in: string | null;
  clock_out: string | null;
  total_hours: string | number;
  break_hours: string | number;
  overtime_hours: string | number;
  overtime_amount: string | number;
  is_late: boolean;
  is_early_departure: boolean;
  is_absent: boolean;
  is_holiday: boolean;
  is_weekend: boolean;
  status: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ApiListResponse = {
  data: ApiHrmAttendanceRecord[];
  meta: { count: number; page: number; per_page: number };
  errors: string[];
};

type ApiItemResponse = {
  data: ApiHrmAttendanceRecord;
  errors: string[];
};

function blankToUndef(value: string | null | undefined): string | undefined {
  const text = (value ?? "").trim();
  return text === "" ? undefined : text;
}

function num(value: string | number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function ymdFromApi(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export async function listHrmAttendanceRecords(params?: {
  page?: number;
  per_page?: number;
  employee_id?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
}): Promise<{ rows: ApiHrmAttendanceRecord[]; total: number }> {
  const qs = new URLSearchParams();
  qs.set("company_id", "default");
  qs.set("page", String(params?.page ?? 1));
  qs.set("per_page", String(params?.per_page ?? 200));
  if (params?.employee_id) qs.set("employee_id", params.employee_id);
  if (params?.status) qs.set("status", params.status);
  if (params?.date_from) qs.set("date_from", params.date_from);
  if (params?.date_to) qs.set("date_to", params.date_to);
  const res = await apiFetch<ApiListResponse>(
    `/api/v1/hrm/attendance-records?${qs.toString()}`,
    { cache: "no-store" },
  );
  return { rows: res.data ?? [], total: res.meta?.count ?? res.data?.length ?? 0 };
}

export async function createHrmAttendanceRecord(input: {
  employeeId: string;
  date: string;
  shiftId?: string;
  attendancePolicyId?: string;
  clockIn?: string;
  clockOut?: string;
  totalHours?: number;
  breakHours?: number;
  overtimeHours?: number;
  overtimeAmount?: number;
  isLate?: boolean;
  isEarlyDeparture?: boolean;
  isAbsent?: boolean;
  isHoliday?: boolean;
  isWeekend?: boolean;
  status?: string;
  notes?: string;
}): Promise<ApiHrmAttendanceRecord> {
  const res = await apiFetch<ApiItemResponse>("/api/v1/hrm/attendance-records", {
    method: "POST",
    body: JSON.stringify({
      company_id: "default",
      employee_id: input.employeeId,
      date: input.date,
      shift_id: blankToUndef(input.shiftId),
      attendance_policy_id: blankToUndef(input.attendancePolicyId),
      clock_in: blankToUndef(input.clockIn),
      clock_out: blankToUndef(input.clockOut),
      total_hours: input.totalHours ?? 0,
      break_hours: input.breakHours ?? 0,
      overtime_hours: input.overtimeHours ?? 0,
      overtime_amount: input.overtimeAmount ?? 0,
      is_late: Boolean(input.isLate),
      is_early_departure: Boolean(input.isEarlyDeparture),
      is_absent: Boolean(input.isAbsent),
      is_holiday: Boolean(input.isHoliday),
      is_weekend: Boolean(input.isWeekend),
      status: input.status ?? "present",
      notes: blankToUndef(input.notes),
    }),
  });
  return res.data;
}

export async function updateHrmAttendanceRecord(
  id: string,
  input: {
    shiftId?: string;
    attendancePolicyId?: string;
    clockIn?: string;
    clockOut?: string;
    totalHours?: number;
    breakHours?: number;
    overtimeHours?: number;
    overtimeAmount?: number;
    isLate?: boolean;
    isEarlyDeparture?: boolean;
    isAbsent?: boolean;
    isHoliday?: boolean;
    isWeekend?: boolean;
    status?: string;
    notes?: string;
  },
): Promise<ApiHrmAttendanceRecord> {
  const body: Record<string, string | number | boolean | undefined> = {
    shift_id: blankToUndef(input.shiftId),
    attendance_policy_id: blankToUndef(input.attendancePolicyId),
    clock_in: blankToUndef(input.clockIn),
    clock_out: blankToUndef(input.clockOut),
    notes: blankToUndef(input.notes),
  };
  if (input.totalHours != null) body.total_hours = input.totalHours;
  if (input.breakHours != null) body.break_hours = input.breakHours;
  if (input.overtimeHours != null) body.overtime_hours = input.overtimeHours;
  if (input.overtimeAmount != null) body.overtime_amount = input.overtimeAmount;
  if (input.isLate != null) body.is_late = input.isLate;
  if (input.isEarlyDeparture != null) body.is_early_departure = input.isEarlyDeparture;
  if (input.isAbsent != null) body.is_absent = input.isAbsent;
  if (input.isHoliday != null) body.is_holiday = input.isHoliday;
  if (input.isWeekend != null) body.is_weekend = input.isWeekend;
  if (input.status) body.status = input.status;

  const res = await apiFetch<ApiItemResponse>(
    `/api/v1/hrm/attendance-records/${encodeURIComponent(id)}?company_id=default`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  return res.data;
}

export async function deleteHrmAttendanceRecord(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/attendance-records/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}

export { num as attendanceNum };
