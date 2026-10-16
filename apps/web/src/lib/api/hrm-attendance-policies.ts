import { apiFetch } from "@/lib/api/client";
import type {
  AttendancePolicy,
  AttendancePolicyStatus,
} from "@/lib/mock-data/hrm-attendance-policies";

export type ApiHrmAttendancePolicy = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  late_arrival_grace: number;
  early_departure_grace: number;
  half_day_threshold: string | number;
  overtime_rate_per_hour: string | number;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ApiListResponse = {
  data: ApiHrmAttendancePolicy[];
  meta: { count: number };
  errors: string[];
};

type ApiItemResponse = {
  data: ApiHrmAttendancePolicy;
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

function mapStatus(raw: string): AttendancePolicyStatus {
  return raw === "inactive" ? "inactive" : "active";
}

export function apiPolicyToAttendancePolicy(row: ApiHrmAttendancePolicy): AttendancePolicy {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    lateArrivalGrace: row.late_arrival_grace ?? 0,
    earlyDepartureGrace: row.early_departure_grace ?? 0,
    halfDayThreshold: num(row.half_day_threshold),
    overtimeRatePerHour: num(row.overtime_rate_per_hour),
    status: mapStatus(row.status),
  };
}

export function policyToWritePayload(row: Omit<AttendancePolicy, "id">) {
  return {
    company_id: "default",
    name: row.name.trim(),
    description: blankToUndef(row.description),
    late_arrival_grace: Number(row.lateArrivalGrace) || 0,
    early_departure_grace: Number(row.earlyDepartureGrace) || 0,
    half_day_threshold: Number(row.halfDayThreshold) || 0,
    overtime_rate_per_hour: Number(row.overtimeRatePerHour) || 0,
    status: row.status,
  };
}

export async function listHrmAttendancePolicies(params?: {
  status?: string;
  q?: string;
}): Promise<AttendancePolicy[]> {
  const qs = new URLSearchParams();
  qs.set("company_id", "default");
  if (params?.status) qs.set("status", params.status);
  if (params?.q) qs.set("q", params.q);
  const res = await apiFetch<ApiListResponse>(
    `/api/v1/hrm/attendance-policies?${qs.toString()}`,
    { cache: "no-store" },
  );
  return (res.data ?? []).map(apiPolicyToAttendancePolicy);
}

export async function createHrmAttendancePolicy(
  payload: Omit<AttendancePolicy, "id">,
): Promise<AttendancePolicy> {
  const res = await apiFetch<ApiItemResponse>("/api/v1/hrm/attendance-policies", {
    method: "POST",
    body: JSON.stringify(policyToWritePayload(payload)),
  });
  return apiPolicyToAttendancePolicy(res.data);
}

export async function updateHrmAttendancePolicy(
  id: string,
  payload: Omit<AttendancePolicy, "id">,
): Promise<AttendancePolicy> {
  const { company_id: _c, ...patch } = policyToWritePayload(payload);
  const res = await apiFetch<ApiItemResponse>(
    `/api/v1/hrm/attendance-policies/${encodeURIComponent(id)}?company_id=default`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
  return apiPolicyToAttendancePolicy(res.data);
}

export async function deleteHrmAttendancePolicy(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/attendance-policies/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}
