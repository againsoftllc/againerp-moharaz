import { apiFetch } from "@/lib/api/client";
import type { MasterRow } from "@/lib/mock-data/hrm-recruitment-setup";

export type ApiHrmHoliday = {
  id: string;
  company_id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  category: string | null;
  description: string | null;
  is_recurring: boolean;
  is_paid: boolean;
  is_half_day: boolean;
  branch_ids: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ApiListResponse = {
  data: ApiHrmHoliday[];
  meta: { count: number };
  errors: string[];
};

type ApiItemResponse = {
  data: ApiHrmHoliday;
  errors: string[];
};

export type BranchNameLookup = (id: string | null | undefined) => string;

export function apiHolidayToMasterRow(
  row: ApiHrmHoliday,
  branchName?: BranchNameLookup,
): MasterRow {
  const branchId = row.branch_ids?.[0] ?? "";
  return {
    id: row.id,
    name: row.name,
    category: row.category ?? "",
    startDate: row.start_date ?? "",
    endDate: row.end_date ?? row.start_date ?? "",
    branch_id: branchId,
    branch: branchId ? (branchName?.(branchId) ?? branchId) : "All branches",
    isPaid: row.is_paid,
    isHalfDay: row.is_half_day,
    isRecurring: row.is_recurring,
    description: row.description ?? "",
  };
}

function blankToNull(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

export function masterPayloadToHolidayWrite(payload: Omit<MasterRow, "id">) {
  const branchId = String(payload.branch_id ?? "").trim();
  const start = String(payload.startDate ?? "").trim();
  const end = String(payload.endDate ?? "").trim() || start;
  return {
    company_id: "default",
    name: String(payload.name ?? "").trim(),
    start_date: start,
    end_date: end || undefined,
    category: blankToNull(payload.category) ?? undefined,
    description: blankToNull(payload.description) ?? undefined,
    is_recurring: payload.isRecurring === true || payload.isRecurring === "true",
    is_paid: payload.isPaid === true || payload.isPaid === "true",
    is_half_day: payload.isHalfDay === true || payload.isHalfDay === "true",
    branch_ids: branchId ? [branchId] : [],
  };
}

export async function listHrmHolidays(params?: {
  branch_id?: string;
  q?: string;
}): Promise<ApiHrmHoliday[]> {
  const qs = new URLSearchParams();
  qs.set("company_id", "default");
  if (params?.branch_id) qs.set("branch_id", params.branch_id);
  if (params?.q) qs.set("q", params.q);
  const res = await apiFetch<ApiListResponse>(
    `/api/v1/hrm/holidays?${qs.toString()}`,
    { cache: "no-store" },
  );
  return res.data ?? [];
}

export async function createHrmHoliday(
  payload: Omit<MasterRow, "id">,
): Promise<ApiHrmHoliday> {
  const res = await apiFetch<ApiItemResponse>("/api/v1/hrm/holidays", {
    method: "POST",
    body: JSON.stringify(masterPayloadToHolidayWrite(payload)),
  });
  return res.data;
}

export async function updateHrmHoliday(
  id: string,
  payload: Omit<MasterRow, "id">,
): Promise<ApiHrmHoliday> {
  const { company_id: _c, ...patch } = masterPayloadToHolidayWrite(payload);
  const res = await apiFetch<ApiItemResponse>(
    `/api/v1/hrm/holidays/${encodeURIComponent(id)}?company_id=default`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
  return res.data;
}

export async function deleteHrmHoliday(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/holidays/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}
