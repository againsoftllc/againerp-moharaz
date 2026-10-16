import { employeeAvatarUrl } from "@/lib/mock-data/employees";

export type WarningSeverity = "verbal" | "written" | "final";
export type WarningType = "performance" | "attendance" | "conduct";
export type WarningStatus = "draft" | "issued";

/** Workdo demo: Employee, Subject, Type, Severity, Date, Status, Improvement Plan, Documents. */
export type Warning = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  subject: string;
  type: WarningType;
  severity: WarningSeverity;
  date: string;
  status: WarningStatus;
  improvementPlan: boolean;
  improvementPlanNotes: string;
  description: string;
  document: string;
};

export const WARNING_SEVERITY_LABEL: Record<WarningSeverity, string> = {
  verbal: "Verbal",
  written: "Written",
  final: "Final",
};

export const WARNING_TYPE_LABEL: Record<WarningType, string> = {
  performance: "performance",
  attendance: "attendance",
  conduct: "conduct",
};

export const WARNING_STATUS_LABEL: Record<WarningStatus, string> = {
  draft: "Draft",
  issued: "Issued",
};

export const WARNING_SEVERITY_OPTIONS = (
  Object.keys(WARNING_SEVERITY_LABEL) as WarningSeverity[]
).map((k) => ({ value: k, label: WARNING_SEVERITY_LABEL[k] }));

export const WARNING_TYPE_OPTIONS = (Object.keys(WARNING_TYPE_LABEL) as WarningType[]).map(
  (k) => ({ value: k, label: WARNING_TYPE_LABEL[k] }),
);

export const WARNING_STATUS_OPTIONS = (Object.keys(WARNING_STATUS_LABEL) as WarningStatus[]).map(
  (k) => ({ value: k, label: WARNING_STATUS_LABEL[k] }),
);

export const WARNING_EMPLOYEES = [
  {
    id: "emp_12",
    name: "Jahidul Islam",
    email: "jahidul.islam@example.com",
  },
  {
    id: "emp_13",
    name: "Priya Das",
    email: "priya.das@example.com",
  },
  {
    id: "emp_14",
    name: "Mahbub Alam",
    email: "mahbub.alam@example.com",
  },
  {
    id: "emp_06",
    name: "Imran Hossain",
    email: "imran.hossain@example.com",
  },
  {
    id: "emp_01",
    name: "Karim Ahmed",
    email: "karim.ahmed@example.com",
  },
  {
    id: "emp_05",
    name: "Farzana Islam",
    email: "farzana.islam@example.com",
  },
] as const;

export function warningAvatar(employeeId: string) {
  return employeeAvatarUrl(employeeId);
}

export function createWarningId(existing: Warning[]) {
  let max = 0;
  for (const r of existing) {
    const n = Number(r.id.replace(/\D/g, ""));
    if (n > max) max = n;
  }
  return `wrn_${String(max + 1).padStart(2, "0")}`;
}

/** Seed aligned to Workdo Warnings list. */
export const WARNINGS_SEED: Warning[] = [
  {
    id: "wrn_01",
    employeeId: "emp_12",
    employeeName: "Jahidul Islam",
    employeeEmail: "jahidul.islam@example.com",
    subject: "Missed Deadlines",
    type: "performance",
    severity: "written",
    date: "2026-01-05",
    status: "issued",
    improvementPlan: true,
    improvementPlanNotes: "Weekly check-ins for the next 30 days; clear delivery targets.",
    description: "Repeated missed sprint deadlines in December.",
    document: "jahidul-warning.pdf",
  },
  {
    id: "wrn_02",
    employeeId: "emp_13",
    employeeName: "Priya Das",
    employeeEmail: "priya.das@example.com",
    subject: "Productivity Concerns",
    type: "performance",
    severity: "final",
    date: "2025-12-20",
    status: "issued",
    improvementPlan: true,
    improvementPlanNotes: "PIP with measurable KPIs over 60 days.",
    description: "Continued underperformance after prior written warning.",
    document: "priya-warning.pdf",
  },
  {
    id: "wrn_03",
    employeeId: "emp_14",
    employeeName: "Mahbub Alam",
    employeeEmail: "mahbub.alam@example.com",
    subject: "Frequent Tardiness",
    type: "attendance",
    severity: "written",
    date: "2026-01-12",
    status: "draft",
    improvementPlan: false,
    improvementPlanNotes: "",
    description: "Late check-ins recorded 8 times in two weeks.",
    document: "",
  },
  {
    id: "wrn_04",
    employeeId: "emp_06",
    employeeName: "Imran Hossain",
    employeeEmail: "imran.hossain@example.com",
    subject: "Customer Escalation Tone",
    type: "conduct",
    severity: "verbal",
    date: "2026-02-01",
    status: "issued",
    improvementPlan: false,
    improvementPlanNotes: "",
    description: "Unprofessional tone on a recorded support call.",
    document: "imran-verbal-warning.pdf",
  },
];
