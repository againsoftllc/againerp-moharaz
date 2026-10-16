import { apiFetch } from "@/lib/api/client";
import type { HrmShift, ShiftStatus } from "@/lib/mock-data/hrm-shifts";

export type ApiHrmShift = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  break_duration: number;
  break_start_time: string | null;
  break_end_time: string | null;
  grace_period: number;
  is_night_shift: boolean;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ApiListResponse = {
  data: ApiHrmShift[];
  meta: { count: number };
  errors: string[];
};

type ApiItemResponse = {
  data: ApiHrmShift;
  errors: string[];
};

function blankToUndef(value: string | null | undefined): string | undefined {
  const text = (value ?? "").trim();
  return text === "" ? undefined : text;
}

function mapStatus(raw: string): ShiftStatus {
  return raw === "inactive" ? "inactive" : "active";
}

export function apiShiftToHrmShift(row: ApiHrmShift): HrmShift {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    startTime: row.start_time ?? "",
    endTime: row.end_time ?? "",
    breakDuration: row.break_duration ?? 0,
    breakStartTime: row.break_start_time ?? "",
    breakEndTime: row.break_end_time ?? "",
    gracePeriod: row.grace_period ?? 0,
    isNightShift: row.is_night_shift,
    status: mapStatus(row.status),
  };
}

export function shiftToWritePayload(row: Omit<HrmShift, "id">) {
  return {
    company_id: "default",
    name: row.name.trim(),
    description: blankToUndef(row.description),
    start_time: blankToUndef(row.startTime),
    end_time: blankToUndef(row.endTime),
    break_duration: Number(row.breakDuration) || 0,
    break_start_time: blankToUndef(row.breakStartTime),
    break_end_time: blankToUndef(row.breakEndTime),
    grace_period: Number(row.gracePeriod) || 0,
    is_night_shift: Boolean(row.isNightShift),
    status: row.status,
  };
}

export async function listHrmShifts(params?: {
  status?: string;
  q?: string;
}): Promise<HrmShift[]> {
  const qs = new URLSearchParams();
  qs.set("company_id", "default");
  if (params?.status) qs.set("status", params.status);
  if (params?.q) qs.set("q", params.q);
  const res = await apiFetch<ApiListResponse>(`/api/v1/hrm/shifts?${qs.toString()}`, {
    cache: "no-store",
  });
  return (res.data ?? []).map(apiShiftToHrmShift);
}

export async function createHrmShift(payload: Omit<HrmShift, "id">): Promise<HrmShift> {
  const res = await apiFetch<ApiItemResponse>("/api/v1/hrm/shifts", {
    method: "POST",
    body: JSON.stringify(shiftToWritePayload(payload)),
  });
  return apiShiftToHrmShift(res.data);
}

export async function updateHrmShift(
  id: string,
  payload: Omit<HrmShift, "id">,
): Promise<HrmShift> {
  const { company_id: _c, ...patch } = shiftToWritePayload(payload);
  const res = await apiFetch<ApiItemResponse>(
    `/api/v1/hrm/shifts/${encodeURIComponent(id)}?company_id=default`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
  return apiShiftToHrmShift(res.data);
}

export async function deleteHrmShift(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/shifts/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}
