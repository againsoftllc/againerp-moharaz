import { apiFetch } from "@/lib/api/client";
import type {
  BiometricDayRecord,
  BiometricPunch,
  BiometricSyncStatus,
  BiometricVerifyType,
} from "@/lib/mock-data/hrm-biometric";

type ApiListResponse<T> = {
  data: T[];
  meta?: Record<string, unknown>;
  errors?: string[];
};

type ApiItemResponse<T> = {
  data: T;
  errors?: string[];
};

type ApiPunch = {
  id: string;
  time: string;
  status: string;
  verify_type: string;
  terminal: string;
  punch_time?: string | null;
  employee_code?: string | null;
  serial_number?: string | null;
  matched?: boolean;
};

type ApiDayRecord = {
  id: string;
  employee_id: string | null;
  employee_name: string;
  employee_code: string;
  designation: string;
  date: string;
  clock_in: string;
  clock_out: string;
  total_entries: number;
  punches: ApiPunch[];
  status: string;
  terminal: string;
  attendance_record_id: string | null;
};

type ApiSyncResult = {
  synced: number;
  skipped: number;
  unmatched: number;
  attendance_record_ids: string[];
};

function mapVerify(raw: string): BiometricVerifyType {
  if (raw === "Face" || raw === "Card" || raw === "Password" || raw === "Fingerprint") {
    return raw;
  }
  return "Fingerprint";
}

function mapStatus(raw: string): BiometricSyncStatus {
  if (raw === "synced" || raw === "failed" || raw === "pending") return raw;
  return "pending";
}

function mapPunch(p: ApiPunch): BiometricPunch {
  return {
    id: p.id,
    time: p.time,
    status: p.status === "Clock Out" ? "Clock Out" : "Clock In",
    verifyType: mapVerify(p.verify_type),
    terminal: p.terminal,
  };
}

export function apiDayToBiometric(row: ApiDayRecord): BiometricDayRecord {
  return {
    id: row.id,
    employeeId: row.employee_id ?? "",
    employeeName: row.employee_name,
    employeeCode: row.employee_code,
    designation: row.designation || "—",
    date: row.date,
    clockIn: row.clock_in || "",
    clockOut: row.clock_out || "",
    totalEntries: row.total_entries ?? row.punches?.length ?? 0,
    punches: (row.punches ?? []).map(mapPunch),
    status: mapStatus(row.status),
    terminal: row.terminal || "",
  };
}

export async function listHrmBiometricDayRecords(params: {
  date: string;
  q?: string;
}): Promise<{ rows: BiometricDayRecord[]; meta: Record<string, unknown> }> {
  const qs = new URLSearchParams();
  qs.set("company_id", "default");
  qs.set("date", params.date);
  if (params.q) qs.set("q", params.q);
  const res = await apiFetch<ApiListResponse<ApiDayRecord>>(
    `/api/v1/hrm/biometric/day-records?${qs.toString()}`,
    { cache: "no-store" },
  );
  return {
    rows: (res.data ?? []).map(apiDayToBiometric),
    meta: res.meta ?? {},
  };
}

export async function syncHrmBiometric(params: {
  date: string;
  employeeId?: string;
}): Promise<ApiSyncResult> {
  const res = await apiFetch<ApiItemResponse<ApiSyncResult>>(
    "/api/v1/hrm/biometric/sync",
    {
      method: "POST",
      body: JSON.stringify({
        company_id: "default",
        date: params.date,
        employee_id: params.employeeId || null,
      }),
    },
  );
  return res.data;
}

export async function listHrmBiometricUnmatched(params?: {
  from_date?: string;
  to_date?: string;
}): Promise<
  {
    employee_code: string;
    punch_count: number;
    last_punch_at: string | null;
    serial_numbers: string[];
  }[]
> {
  const qs = new URLSearchParams();
  qs.set("company_id", "default");
  if (params?.from_date) qs.set("from_date", params.from_date);
  if (params?.to_date) qs.set("to_date", params.to_date);
  const res = await apiFetch<
    ApiListResponse<{
      employee_code: string;
      punch_count: number;
      last_punch_at: string | null;
      serial_numbers: string[];
    }>
  >(`/api/v1/hrm/biometric/unmatched?${qs.toString()}`, { cache: "no-store" });
  return res.data ?? [];
}
