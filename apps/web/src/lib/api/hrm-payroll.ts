import { apiFetch } from "@/lib/api/client";
import type {
  PayrollFrequency,
  PayrollRun,
  PayrollRunEntry,
  PayrollRunStatus,
} from "@/lib/mock-data/hrm-payroll-runs";

export type ApiHrmPayrollRun = {
  id: string;
  company_id: string;
  title: string;
  payroll_frequency: string;
  pay_period_start: string | null;
  pay_period_end: string | null;
  pay_date: string | null;
  total_gross_pay: string | number;
  total_deductions: string | number;
  total_net_pay: string | number;
  employee_count: number;
  status: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ApiHrmPayrollEntry = {
  id: string;
  company_id: string;
  payroll_run_id: string | null;
  employee_id: string | null;
  basic_salary: string | number;
  component_earnings: string | number;
  total_earnings: string | number;
  total_deductions: string | number;
  gross_pay: string | number;
  net_pay: string | number;
  overtime_amount: string | number;
  per_day_salary: string | number;
  unpaid_leave_deduction: string | number;
  working_days: number;
  present_days: string | number;
  full_present_days: number;
  half_days: string | number;
  holiday_days: number;
  paid_leave_days: string | number;
  unpaid_leave_days: string | number;
  absent_days: number;
  overtime_hours: string | number;
  earnings_breakdown: Record<string, unknown>;
  deductions_breakdown: Record<string, unknown>;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ApiRunListResponse = {
  data: ApiHrmPayrollRun[];
  meta: { count: number; page: number; per_page: number };
  errors: string[];
};

type ApiRunItemResponse = {
  data: ApiHrmPayrollRun;
  errors: string[];
};

type ApiEntryListResponse = {
  data: ApiHrmPayrollEntry[];
  meta: { count: number; page: number; per_page: number };
  errors: string[];
};

type ApiEntryItemResponse = {
  data: ApiHrmPayrollEntry;
  errors: string[];
};

function num(value: string | number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function ymd(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function blankToUndef(value: string | null | undefined): string | undefined {
  const text = (value ?? "").trim();
  return text === "" ? undefined : text;
}

function mapFrequency(raw: string): PayrollFrequency {
  if (raw === "weekly" || raw === "biweekly" || raw === "monthly") return raw;
  return "monthly";
}

function mapRunStatus(raw: string): PayrollRunStatus {
  if (raw === "draft" || raw === "processing" || raw === "completed" || raw === "cancelled") {
    return raw;
  }
  if (raw === "approved") return "completed";
  return "draft";
}

export function apiPayrollEntryToRunEntry(
  row: ApiHrmPayrollEntry,
  employeeName: (id: string | null | undefined) => string,
): PayrollRunEntry {
  return {
    id: row.id,
    employeeId: row.employee_id ?? "",
    employeeName: employeeName(row.employee_id),
    basicSalary: num(row.basic_salary),
    workingDays: row.working_days ?? 0,
    presentDays: num(row.present_days),
    lopDays: num(row.unpaid_leave_days) + (row.absent_days ?? 0),
    grossPay: num(row.gross_pay),
    deductions: num(row.total_deductions),
    netPay: num(row.net_pay),
    overtimeAmount: num(row.overtime_amount),
    unpaidLeaveDeduction: num(row.unpaid_leave_deduction),
    notes: row.notes ?? "",
    payrollRunId: row.payroll_run_id ?? "",
  };
}

export function apiPayrollRunToUi(
  row: ApiHrmPayrollRun,
  entries: PayrollRunEntry[] = [],
): PayrollRun {
  return {
    id: row.id,
    title: row.title,
    frequency: mapFrequency(row.payroll_frequency),
    periodStart: ymd(row.pay_period_start),
    periodEnd: ymd(row.pay_period_end),
    payDate: ymd(row.pay_date),
    employeeCount: row.employee_count ?? entries.length,
    grossPay: num(row.total_gross_pay),
    netPay: num(row.total_net_pay),
    totalDeductions: num(row.total_deductions),
    status: mapRunStatus(row.status),
    notes: row.notes ?? "",
    entries,
  };
}

export async function listHrmPayrollRuns(params?: {
  page?: number;
  per_page?: number;
  status?: string;
}): Promise<{ rows: ApiHrmPayrollRun[]; total: number }> {
  const qs = new URLSearchParams();
  qs.set("company_id", "default");
  qs.set("page", String(params?.page ?? 1));
  qs.set("per_page", String(params?.per_page ?? 200));
  if (params?.status) qs.set("status", params.status);
  const res = await apiFetch<ApiRunListResponse>(
    `/api/v1/hrm/payroll-runs?${qs.toString()}`,
    { cache: "no-store" },
  );
  return { rows: res.data ?? [], total: res.meta?.count ?? res.data?.length ?? 0 };
}

export async function createHrmPayrollRun(input: {
  title: string;
  frequency: PayrollFrequency;
  periodStart: string;
  periodEnd: string;
  payDate?: string;
  notes?: string;
}): Promise<ApiHrmPayrollRun> {
  const res = await apiFetch<ApiRunItemResponse>("/api/v1/hrm/payroll-runs", {
    method: "POST",
    body: JSON.stringify({
      company_id: "default",
      title: input.title.trim(),
      payroll_frequency: input.frequency,
      pay_period_start: input.periodStart,
      pay_period_end: input.periodEnd,
      pay_date: blankToUndef(input.payDate) ?? input.periodEnd,
      notes: blankToUndef(input.notes),
    }),
  });
  return res.data;
}

export async function updateHrmPayrollRun(
  id: string,
  input: {
    title: string;
    frequency: PayrollFrequency;
    periodStart: string;
    periodEnd: string;
    payDate?: string;
    notes?: string;
  },
): Promise<ApiHrmPayrollRun> {
  const res = await apiFetch<ApiRunItemResponse>(
    `/api/v1/hrm/payroll-runs/${encodeURIComponent(id)}?company_id=default`,
    {
      method: "PATCH",
      body: JSON.stringify({
        title: input.title.trim(),
        payroll_frequency: input.frequency,
        pay_period_start: input.periodStart,
        pay_period_end: input.periodEnd,
        pay_date: blankToUndef(input.payDate),
        notes: blankToUndef(input.notes),
      }),
    },
  );
  return res.data;
}

export async function calculateHrmPayrollRun(id: string): Promise<ApiHrmPayrollRun> {
  const res = await apiFetch<ApiRunItemResponse>(
    `/api/v1/hrm/payroll-runs/${encodeURIComponent(id)}/calculate?company_id=default`,
    { method: "POST", body: JSON.stringify({}) },
  );
  return res.data;
}

export async function completeHrmPayrollRun(id: string): Promise<ApiHrmPayrollRun> {
  const res = await apiFetch<ApiRunItemResponse>(
    `/api/v1/hrm/payroll-runs/${encodeURIComponent(id)}/complete?company_id=default`,
    { method: "POST", body: JSON.stringify({}) },
  );
  return res.data;
}

export async function cancelHrmPayrollRun(id: string): Promise<ApiHrmPayrollRun> {
  const res = await apiFetch<ApiRunItemResponse>(
    `/api/v1/hrm/payroll-runs/${encodeURIComponent(id)}/cancel?company_id=default`,
    { method: "POST", body: JSON.stringify({}) },
  );
  return res.data;
}

export async function deleteHrmPayrollRun(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/payroll-runs/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}

export async function listHrmPayrollEntries(params?: {
  page?: number;
  per_page?: number;
  payroll_run_id?: string;
  employee_id?: string;
}): Promise<{ rows: ApiHrmPayrollEntry[]; total: number }> {
  const qs = new URLSearchParams();
  qs.set("company_id", "default");
  qs.set("page", String(params?.page ?? 1));
  qs.set("per_page", String(params?.per_page ?? 200));
  if (params?.payroll_run_id) qs.set("payroll_run_id", params.payroll_run_id);
  if (params?.employee_id) qs.set("employee_id", params.employee_id);
  const res = await apiFetch<ApiEntryListResponse>(
    `/api/v1/hrm/payroll-entries?${qs.toString()}`,
    { cache: "no-store" },
  );
  return { rows: res.data ?? [], total: res.meta?.count ?? res.data?.length ?? 0 };
}

export async function updateHrmPayrollEntry(
  id: string,
  input: {
    notes?: string;
    overtimeAmount?: number;
    unpaidLeaveDeduction?: number;
  },
): Promise<ApiHrmPayrollEntry> {
  const body: Record<string, string | number> = {};
  if (input.notes != null) body.notes = input.notes;
  if (input.overtimeAmount != null) body.overtime_amount = input.overtimeAmount;
  if (input.unpaidLeaveDeduction != null) {
    body.unpaid_leave_deduction = input.unpaidLeaveDeduction;
  }
  const res = await apiFetch<ApiEntryItemResponse>(
    `/api/v1/hrm/payroll-entries/${encodeURIComponent(id)}?company_id=default`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  return res.data;
}
