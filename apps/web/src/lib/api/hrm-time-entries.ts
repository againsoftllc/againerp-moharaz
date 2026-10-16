import { apiFetch } from "@/lib/api/client";
import type { TimesheetEntry, TimesheetStatus } from "@/lib/mock-data/hrm-timesheet";

export type ApiHrmTimeEntry = {
  id: string;
  company_id: string;
  employee_id: string | null;
  date: string | null;
  hours: string | number;
  description: string | null;
  project: string | null;
  status: string;
  manager_comments: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ApiListResponse = {
  data: ApiHrmTimeEntry[];
  meta: { count: number; page: number; per_page: number };
  errors: string[];
};

type ApiItemResponse = {
  data: ApiHrmTimeEntry;
  errors: string[];
};

export type TimeEntryLookups = {
  employeeName: (id: string | null | undefined) => string;
  employeeCode: (id: string | null | undefined) => string;
};

function blankToUndef(value: string | null | undefined): string | undefined {
  const text = (value ?? "").trim();
  return text === "" ? undefined : text;
}

function mapStatus(raw: string): TimesheetStatus {
  if (raw === "approved" || raw === "rejected" || raw === "pending") return raw;
  return "pending";
}

function ymd(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function num(value: string | number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function apiTimeEntryToTimesheet(
  row: ApiHrmTimeEntry,
  lookups: TimeEntryLookups,
): TimesheetEntry {
  return {
    id: row.id,
    employeeId: row.employee_id ?? "",
    employeeName: lookups.employeeName(row.employee_id),
    employeeCode: lookups.employeeCode(row.employee_id),
    date: ymd(row.date),
    hours: num(row.hours),
    project: row.project ?? "",
    description: row.description ?? "",
    status: mapStatus(row.status),
    submittedOn: ymd(row.created_at),
    approvedAt: ymd(row.approved_at),
    rejectionReason: row.manager_comments ?? "",
  };
}

export async function listHrmTimeEntries(params?: {
  page?: number;
  per_page?: number;
  employee_id?: string;
  status?: string;
}): Promise<{ rows: ApiHrmTimeEntry[]; total: number }> {
  const qs = new URLSearchParams();
  qs.set("company_id", "default");
  qs.set("page", String(params?.page ?? 1));
  qs.set("per_page", String(params?.per_page ?? 200));
  if (params?.employee_id) qs.set("employee_id", params.employee_id);
  if (params?.status) qs.set("status", params.status);
  const res = await apiFetch<ApiListResponse>(
    `/api/v1/hrm/time-entries?${qs.toString()}`,
    { cache: "no-store" },
  );
  return { rows: res.data ?? [], total: res.meta?.count ?? res.data?.length ?? 0 };
}

export async function createHrmTimeEntry(input: {
  employeeId: string;
  date: string;
  hours: number;
  description?: string;
  project?: string;
}): Promise<ApiHrmTimeEntry> {
  const res = await apiFetch<ApiItemResponse>("/api/v1/hrm/time-entries", {
    method: "POST",
    body: JSON.stringify({
      company_id: "default",
      employee_id: input.employeeId,
      date: input.date,
      hours: input.hours,
      description: blankToUndef(input.description),
      project: blankToUndef(input.project),
    }),
  });
  return res.data;
}

export async function updateHrmTimeEntry(
  id: string,
  input: {
    date: string;
    hours: number;
    description?: string;
    project?: string;
  },
): Promise<ApiHrmTimeEntry> {
  const res = await apiFetch<ApiItemResponse>(
    `/api/v1/hrm/time-entries/${encodeURIComponent(id)}?company_id=default`,
    {
      method: "PATCH",
      body: JSON.stringify({
        date: input.date,
        hours: input.hours,
        description: blankToUndef(input.description),
        project: blankToUndef(input.project),
      }),
    },
  );
  return res.data;
}

export async function approveHrmTimeEntry(
  id: string,
  managerComments?: string,
): Promise<ApiHrmTimeEntry> {
  const res = await apiFetch<ApiItemResponse>(
    `/api/v1/hrm/time-entries/${encodeURIComponent(id)}/approve?company_id=default`,
    {
      method: "POST",
      body: JSON.stringify({ manager_comments: blankToUndef(managerComments) }),
    },
  );
  return res.data;
}

export async function rejectHrmTimeEntry(
  id: string,
  managerComments?: string,
): Promise<ApiHrmTimeEntry> {
  const res = await apiFetch<ApiItemResponse>(
    `/api/v1/hrm/time-entries/${encodeURIComponent(id)}/reject?company_id=default`,
    {
      method: "POST",
      body: JSON.stringify({ manager_comments: blankToUndef(managerComments) }),
    },
  );
  return res.data;
}

export async function deleteHrmTimeEntry(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/time-entries/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}
