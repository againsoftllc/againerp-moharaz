import { employeeAvatarUrl } from "@/lib/mock-data/employees";

/** Workdo demo: month strip, Employee, Pay Date, Net Pay, Status, Generated On + Pay Stub preview. */

export type PayslipStatus = "generated" | "downloaded" | "sent";

export type PayslipLine = {
  label: string;
  amount: number;
};

export type PayslipStub = {
  periodStart: string;
  periodEnd: string;
  workingDays: number;
  presentDays: number;
  absentDays: number;
  halfDays: number;
  holidayDays: number;
  paidLeave: number;
  unpaidLeave: number;
  lopDays: number;
  effectivePaidDays: number;
  overtimeHours: number;
  basicSalary: number;
  allowanceLines: PayslipLine[];
  deductionLines: PayslipLine[];
  lopDeduction: number;
  /** Dollar impact of unpaid leave (Workdo Gross formula). */
  unpaidLeaveAmount: number;
  overtimeEarnings: number;
};

export type Payslip = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  designation: string;
  department: string;
  /** YYYY-MM — month bar filter */
  periodKey: string;
  payDate: string;
  netPay: number;
  status: PayslipStatus;
  generatedOn: string;
  basicSalary: number;
  allowances: number;
  deductions: number;
  grossPay: number;
  stub: PayslipStub;
  payrollEntryId?: string;
  payslipNumber?: string;
};

export const PAYSLIP_STATUS_LABEL: Record<PayslipStatus, string> = {
  generated: "Generated",
  downloaded: "Downloaded",
  sent: "Sent",
};

export const PAYSLIP_STATUS_OPTIONS = (
  Object.keys(PAYSLIP_STATUS_LABEL) as PayslipStatus[]
).map((k) => ({ value: k, label: PAYSLIP_STATUS_LABEL[k] }));

export const PAYSLIP_YEAR = 2026;

export const PAYSLIP_MONTHS = [
  { key: "01", short: "Jan" },
  { key: "02", short: "Feb" },
  { key: "03", short: "Mar" },
  { key: "04", short: "Apr" },
  { key: "05", short: "May" },
  { key: "06", short: "Jun" },
  { key: "07", short: "Jul" },
  { key: "08", short: "Aug" },
  { key: "09", short: "Sep" },
  { key: "10", short: "Oct" },
  { key: "11", short: "Nov" },
  { key: "12", short: "Dec" },
] as const;

export function periodLabel(periodKey: string): string {
  const [, mm] = periodKey.split("-");
  const hit = PAYSLIP_MONTHS.find((m) => m.key === mm);
  return hit ? `${hit.short} ${PAYSLIP_YEAR}` : periodKey;
}

export function periodKeyForMonth(monthKey: string): string {
  return `${PAYSLIP_YEAR}-${monthKey}`;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function sumLines(lines: PayslipLine[]) {
  return round2(lines.reduce((s, l) => s + l.amount, 0));
}

/** Derive list-row totals from stub (Workdo gross/net formulas). */
export function totalsFromStub(stub: PayslipStub) {
  const componentEarnings = sumLines(stub.allowanceLines);
  const totalEarnings = round2(stub.basicSalary + componentEarnings);
  const totalDeductions = sumLines(stub.deductionLines);
  const grossPay = round2(
    totalEarnings - stub.lopDeduction - stub.unpaidLeaveAmount + stub.overtimeEarnings,
  );
  const netPay = round2(grossPay - totalDeductions);
  return {
    allowances: componentEarnings,
    deductions: totalDeductions,
    grossPay,
    netPay,
    totalEarnings,
    componentEarnings,
  };
}

export function payslipAvatar(employeeId: string) {
  return employeeAvatarUrl(employeeId);
}

export function formatNetPay(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDays(n: number): string {
  return n.toFixed(2);
}
