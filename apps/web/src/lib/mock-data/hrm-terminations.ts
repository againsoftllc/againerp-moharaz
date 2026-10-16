import { employeeAvatarUrl } from "@/lib/mock-data/employees";

export type TerminationStatus = "in_progress" | "completed";
export type TerminationType =
  | "retirement"
  | "voluntary"
  | "involuntary"
  | "layoff"
  | "contract_end";

/** Workdo demo: Employee, Type, Termination Date, Notice Date, Status, Documents. */
export type Termination = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  type: TerminationType;
  terminationDate: string;
  noticeDate: string;
  status: TerminationStatus;
  description: string;
  finalSettlement: string;
  document: string;
};

export const TERMINATION_STATUS_LABEL: Record<TerminationStatus, string> = {
  in_progress: "In progress",
  completed: "Completed",
};

export const TERMINATION_TYPE_LABEL: Record<TerminationType, string> = {
  retirement: "retirement",
  voluntary: "voluntary",
  involuntary: "involuntary",
  layoff: "layoff",
  contract_end: "contract end",
};

export const TERMINATION_STATUS_OPTIONS = (
  Object.keys(TERMINATION_STATUS_LABEL) as TerminationStatus[]
).map((k) => ({ value: k, label: TERMINATION_STATUS_LABEL[k] }));

export const TERMINATION_TYPE_OPTIONS = (Object.keys(TERMINATION_TYPE_LABEL) as TerminationType[]).map(
  (k) => ({ value: k, label: TERMINATION_TYPE_LABEL[k] }),
);

export const TERMINATION_EMPLOYEES = [
  {
    id: "emp_14",
    name: "Mahbub Alam",
    email: "mahbub.alam@example.com",
  },
  {
    id: "emp_12",
    name: "Jahidul Islam",
    email: "jahidul.islam@example.com",
  },
  {
    id: "emp_15",
    name: "Ruma Begum",
    email: "ruma.begum@example.com",
  },
  {
    id: "emp_07",
    name: "Rafiq Ahmed",
    email: "rafiq.ahmed@example.com",
  },
] as const;

export function terminationAvatar(employeeId: string) {
  return employeeAvatarUrl(employeeId);
}

export function createTerminationId(existing: Termination[]) {
  let max = 0;
  for (const r of existing) {
    const n = Number(r.id.replace(/\D/g, ""));
    if (n > max) max = n;
  }
  return `trm_${String(max + 1).padStart(2, "0")}`;
}

/** Seed aligned to Workdo Terminations list. */
export const TERMINATIONS_SEED: Termination[] = [
  {
    id: "trm_01",
    employeeId: "emp_14",
    employeeName: "Mahbub Alam",
    employeeEmail: "mahbub.alam@example.com",
    type: "involuntary",
    terminationDate: "2026-01-31",
    noticeDate: "2026-01-15",
    status: "completed",
    description: "Gross misconduct after final warning.",
    finalSettlement: "Salary till 31 Jan; leave encashment cleared.",
    document: "mahbub-termination.pdf",
  },
  {
    id: "trm_02",
    employeeId: "emp_12",
    employeeName: "Jahidul Islam",
    employeeEmail: "jahidul.islam@example.com",
    type: "layoff",
    terminationDate: "2026-02-20",
    noticeDate: "2026-02-01",
    status: "in_progress",
    description: "Role elimination — restructure.",
    finalSettlement: "Severance + notice pay under review.",
    document: "jahidul-termination.pdf",
  },
  {
    id: "trm_03",
    employeeId: "emp_15",
    employeeName: "Ruma Begum",
    employeeEmail: "ruma.begum@example.com",
    type: "retirement",
    terminationDate: "2026-03-31",
    noticeDate: "2026-01-31",
    status: "in_progress",
    description: "Mandatory retirement age reached.",
    finalSettlement: "Gratuity and PF settlement in progress.",
    document: "",
  },
  {
    id: "trm_04",
    employeeId: "emp_07",
    employeeName: "Rafiq Ahmed",
    employeeEmail: "rafiq.ahmed@example.com",
    type: "retirement",
    terminationDate: "2025-12-15",
    noticeDate: "2025-11-15",
    status: "completed",
    description: "Voluntary early retirement.",
    finalSettlement: "Full and final settled.",
    document: "rafiq-retirement.pdf",
  },
];
