import { EMPLOYEES_SEED, type Employee } from "@/lib/mock-data/employees";

export type TimesheetStatus = "pending" | "approved" | "rejected";

export type TimesheetEntry = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  date: string;
  hours: number;
  project: string;
  description: string;
  status: TimesheetStatus;
  submittedOn: string;
  approvedAt: string;
  rejectionReason: string;
};

export const TIMESHEET_PROJECTS = [
  "Testing",
  "Documentation",
  "Bug Fixes",
  "Mobile App",
  "ERP Core",
  "HR Onboarding",
  "Warehouse Ops",
  "Customer Portal",
] as const;

export const TIMESHEET_STATUS_OPTIONS: { value: TimesheetStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

export const TIMESHEET_STATUS_LABEL: Record<TimesheetStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const DESCRIPTIONS = [
  "Implemented regression suite for attendance module.",
  "Updated user manual sections for leave policies.",
  "Fixed clock-out edge case on half-day entries.",
  "Built employee self-service timesheet screen.",
  "Refactored payroll component mapping.",
  "Prepared onboarding checklist for new hires.",
  "Reconciled warehouse shift punch logs.",
  "Designed customer portal dashboard widgets.",
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function ymd(y: number, m: number, d: number) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function addDays(base: Date, n: number) {
  const x = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

function toYmd(d: Date) {
  return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

const ACTIVE = EMPLOYEES_SEED.filter((e) => e.status !== "terminated" && e.status !== "inactive");

/** Seed ~18 Workdo-style timesheet rows across recent dates. */
export function buildTimesheetSeed(now = new Date()): TimesheetEntry[] {
  const rows: TimesheetEntry[] = [];
  const statuses: TimesheetStatus[] = [
    "pending",
    "pending",
    "pending",
    "pending",
    "approved",
    "approved",
    "rejected",
  ];

  for (let i = 0; i < 18; i++) {
    const emp = ACTIVE[i % ACTIVE.length] as Employee;
    const h = hash(`${emp.id}:ts:${i}`);
    const workDate = addDays(now, -((i % 12) + 1));
    // skip weekends for nicer data
    while (workDate.getDay() === 0 || workDate.getDay() === 6) {
      workDate.setDate(workDate.getDate() - 1);
    }
    const submitted = addDays(workDate, (h % 2) + 1);
    const status = statuses[i % statuses.length]!;
    const hours = [4, 5.5, 6, 6.5, 7, 7.5, 8, 8.5][h % 8]!;
    const project = TIMESHEET_PROJECTS[h % TIMESHEET_PROJECTS.length]!;
    const approvedAt =
      status === "approved" ? toYmd(addDays(submitted, 1)) : status === "rejected" ? toYmd(submitted) : "";

    rows.push({
      id: `ts_${pad2(i + 1)}`,
      employeeId: emp.id,
      employeeName: emp.name,
      employeeCode: emp.employeeCode,
      date: toYmd(workDate),
      hours,
      project,
      description: DESCRIPTIONS[h % DESCRIPTIONS.length]!,
      status,
      submittedOn: toYmd(submitted),
      approvedAt,
      rejectionReason: status === "rejected" ? "Hours exceed approved project budget." : "",
    });
  }

  // Sort newest work date first (Workdo-ish)
  return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id.localeCompare(b.id)));
}

export const TIMESHEET_SEED: TimesheetEntry[] = buildTimesheetSeed(new Date(2026, 6, 22));

export function formatHours(hours: number) {
  return `${hours.toFixed(2)}h`;
}

export function createTimesheetId(existing: TimesheetEntry[]) {
  let max = 0;
  for (const r of existing) {
    const n = Number(r.id.replace(/\D/g, ""));
    if (n > max) max = n;
  }
  return `ts_${pad2(max + 1)}`;
}
