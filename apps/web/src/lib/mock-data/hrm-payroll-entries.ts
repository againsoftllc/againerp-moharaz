import {
  formatPayrollDays,
  formatPayrollMoney,
  payrollEntryAvatar,
  type PayrollRunEntry,
} from "@/lib/mock-data/hrm-payroll-runs";

/** Flattened Workdo-style payroll entry row: a per-employee line item plus its run context. */

export type PayrollEntryRow = PayrollRunEntry & {
  runId: string;
  runTitle: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
};

export { formatPayrollDays, formatPayrollMoney, payrollEntryAvatar };
