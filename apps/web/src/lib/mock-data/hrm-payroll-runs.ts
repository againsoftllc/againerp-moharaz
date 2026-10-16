import { employeeAvatarUrl } from "@/lib/mock-data/employees";

/** Workdo demo: payroll run list + detail (KPI cards, calc reference, employee entries). */

export type PayrollFrequency = "monthly" | "weekly" | "biweekly";
export type PayrollRunStatus = "draft" | "processing" | "completed" | "cancelled";

export type PayrollRunEntry = {
  id: string;
  employeeId: string;
  employeeName: string;
  basicSalary: number;
  workingDays: number;
  presentDays: number;
  lopDays: number;
  grossPay: number;
  deductions: number;
  netPay: number;
  overtimeAmount?: number;
  unpaidLeaveDeduction?: number;
  notes?: string;
  payrollRunId?: string;
};

export type PayrollRun = {
  id: string;
  title: string;
  frequency: PayrollFrequency;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  employeeCount: number;
  grossPay: number;
  netPay: number;
  totalDeductions: number;
  status: PayrollRunStatus;
  notes: string;
  entries: PayrollRunEntry[];
};

export const PAYROLL_FREQUENCY_LABEL: Record<PayrollFrequency, string> = {
  monthly: "Monthly",
  weekly: "Weekly",
  biweekly: "Bi-weekly",
};

export const PAYROLL_RUN_STATUS_LABEL: Record<PayrollRunStatus, string> = {
  draft: "Draft",
  processing: "Processing",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const PAYROLL_FREQUENCY_OPTIONS = (
  Object.keys(PAYROLL_FREQUENCY_LABEL) as PayrollFrequency[]
).map((k) => ({ value: k, label: PAYROLL_FREQUENCY_LABEL[k] }));

export const PAYROLL_RUN_STATUS_OPTIONS = (
  Object.keys(PAYROLL_RUN_STATUS_LABEL) as PayrollRunStatus[]
).map((k) => ({ value: k, label: PAYROLL_RUN_STATUS_LABEL[k] }));

export function payrollEntryAvatar(employeeId: string) {
  return employeeAvatarUrl(employeeId);
}

export function formatPayrollMoney(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatPayPeriod(start: string, end: string): string {
  return `${start} to ${end}`;
}

export function formatPayrollDays(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
