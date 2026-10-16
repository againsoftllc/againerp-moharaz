import { apiFetch } from "@/lib/api/client";
import type { ApiHrmPayrollEntry } from "@/lib/api/hrm-payroll";
import type { Payslip, PayslipStatus, PayslipStub } from "@/lib/mock-data/hrm-payslips";

export type ApiHrmPayslip = {
  id: string;
  company_id: string;
  payroll_entry_id: string | null;
  employee_id: string | null;
  payslip_number: string | null;
  pay_period_start: string | null;
  pay_period_end: string | null;
  pay_date: string | null;
  file_path: string | null;
  status: string;
  sent_at: string | null;
  downloaded_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ApiListResponse = {
  data: ApiHrmPayslip[];
  meta: { count: number; page: number; per_page: number };
  errors: string[];
};

type ApiItemResponse = {
  data: ApiHrmPayslip;
  errors: string[];
};

export type PayslipLookups = {
  employeeName: (id: string | null | undefined) => string;
  employeeCode: (id: string | null | undefined) => string;
  department: (id: string | null | undefined) => string;
  designation: (id: string | null | undefined) => string;
  entryById: (id: string | null | undefined) => ApiHrmPayrollEntry | undefined;
};

function num(value: string | number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function ymd(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function mapStatus(raw: string): PayslipStatus {
  if (raw === "downloaded" || raw === "sent" || raw === "generated") return raw;
  return "generated";
}

function breakdownLines(obj: Record<string, unknown> | undefined) {
  if (!obj || typeof obj !== "object") return [];
  return Object.entries(obj).map(([label, amount]) => ({
    label,
    amount: num(amount as string | number),
  }));
}

function stubFromEntry(
  entry: ApiHrmPayrollEntry | undefined,
  periodStart: string,
  periodEnd: string,
): PayslipStub {
  if (!entry) {
    return {
      periodStart,
      periodEnd,
      workingDays: 0,
      presentDays: 0,
      absentDays: 0,
      halfDays: 0,
      holidayDays: 0,
      paidLeave: 0,
      unpaidLeave: 0,
      lopDays: 0,
      effectivePaidDays: 0,
      overtimeHours: 0,
      basicSalary: 0,
      allowanceLines: [],
      deductionLines: [],
      lopDeduction: 0,
      unpaidLeaveAmount: 0,
      overtimeEarnings: 0,
    };
  }
  return {
    periodStart,
    periodEnd,
    workingDays: entry.working_days ?? 0,
    presentDays: num(entry.present_days),
    absentDays: entry.absent_days ?? 0,
    halfDays: num(entry.half_days),
    holidayDays: entry.holiday_days ?? 0,
    paidLeave: num(entry.paid_leave_days),
    unpaidLeave: num(entry.unpaid_leave_days),
    lopDays: num(entry.unpaid_leave_days) + (entry.absent_days ?? 0),
    effectivePaidDays: num(entry.present_days),
    overtimeHours: num(entry.overtime_hours),
    basicSalary: num(entry.basic_salary),
    allowanceLines: breakdownLines(entry.earnings_breakdown),
    deductionLines: breakdownLines(entry.deductions_breakdown),
    lopDeduction: num(entry.unpaid_leave_deduction),
    unpaidLeaveAmount: num(entry.unpaid_leave_deduction),
    overtimeEarnings: num(entry.overtime_amount),
  };
}

export function apiPayslipToUi(row: ApiHrmPayslip, lookups: PayslipLookups): Payslip {
  const entry = lookups.entryById(row.payroll_entry_id);
  const periodStart = ymd(row.pay_period_start);
  const periodEnd = ymd(row.pay_period_end);
  const periodKey = periodStart ? periodStart.slice(0, 7) : "";
  const stub = stubFromEntry(entry, periodStart, periodEnd);
  const gross = entry ? num(entry.gross_pay) : 0;
  const deductions = entry ? num(entry.total_deductions) : 0;
  const net = entry ? num(entry.net_pay) : 0;
  const basic = entry ? num(entry.basic_salary) : 0;
  return {
    id: row.id,
    employeeId: row.employee_id ?? "",
    employeeName: lookups.employeeName(row.employee_id),
    employeeCode: lookups.employeeCode(row.employee_id),
    designation: lookups.designation(row.employee_id),
    department: lookups.department(row.employee_id),
    periodKey,
    payDate: ymd(row.pay_date),
    netPay: net,
    status: mapStatus(row.status),
    generatedOn: ymd(row.created_at),
    basicSalary: basic,
    allowances: Math.max(0, gross - basic),
    deductions,
    grossPay: gross,
    stub,
    payrollEntryId: row.payroll_entry_id ?? "",
    payslipNumber: row.payslip_number ?? "",
  };
}

export async function listHrmPayslips(params?: {
  page?: number;
  per_page?: number;
  employee_id?: string;
  status?: string;
}): Promise<{ rows: ApiHrmPayslip[]; total: number }> {
  const qs = new URLSearchParams();
  qs.set("company_id", "default");
  qs.set("page", String(params?.page ?? 1));
  qs.set("per_page", String(params?.per_page ?? 200));
  if (params?.employee_id) qs.set("employee_id", params.employee_id);
  if (params?.status) qs.set("status", params.status);
  const res = await apiFetch<ApiListResponse>(`/api/v1/hrm/payslips?${qs.toString()}`, {
    cache: "no-store",
  });
  return { rows: res.data ?? [], total: res.meta?.count ?? res.data?.length ?? 0 };
}

export async function markHrmPayslipSent(id: string): Promise<ApiHrmPayslip> {
  const res = await apiFetch<ApiItemResponse>(
    `/api/v1/hrm/payslips/${encodeURIComponent(id)}/mark-sent?company_id=default`,
    { method: "POST", body: JSON.stringify({}) },
  );
  return res.data;
}

export async function markHrmPayslipDownloaded(id: string): Promise<ApiHrmPayslip> {
  const res = await apiFetch<ApiItemResponse>(
    `/api/v1/hrm/payslips/${encodeURIComponent(id)}/mark-downloaded?company_id=default`,
    { method: "POST", body: JSON.stringify({}) },
  );
  return res.data;
}
