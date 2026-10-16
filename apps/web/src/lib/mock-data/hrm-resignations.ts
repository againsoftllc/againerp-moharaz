import { employeeAvatarUrl } from "@/lib/mock-data/employees";

export type ResignationStatus = "pending" | "rejected" | "completed";

/** Workdo demo: Employee, Resignation Date, Last Working Day, Notice Period, Status, Documents. */
export type Resignation = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  resignationDate: string;
  lastWorkingDay: string;
  noticePeriod: string;
  status: ResignationStatus;
  description: string;
  document: string;
};

export const RESIGNATION_STATUS_LABEL: Record<ResignationStatus, string> = {
  pending: "Pending",
  rejected: "Rejected",
  completed: "Completed",
};

export const RESIGNATION_STATUS_OPTIONS = (
  Object.keys(RESIGNATION_STATUS_LABEL) as ResignationStatus[]
).map((k) => ({ value: k, label: RESIGNATION_STATUS_LABEL[k] }));

export const NOTICE_PERIOD_OPTIONS = [
  "2 weeks",
  "1 month",
  "30 days",
  "45 days",
  "60 days",
  "90 days",
] as const;

export const RESIGNATION_EMPLOYEES = [
  {
    id: "emp_11",
    name: "Lamia Sultana",
    email: "lamia.sultana@example.com",
  },
  {
    id: "emp_15",
    name: "Ruma Begum",
    email: "ruma.begum@example.com",
  },
  {
    id: "emp_02",
    name: "Sadia Rahman",
    email: "sadia.rahman@example.com",
  },
  {
    id: "emp_03",
    name: "Tanvir Hasan",
    email: "tanvir.hasan@example.com",
  },
  {
    id: "emp_08",
    name: "Sumaiya Akter",
    email: "sumaiya.akter@example.com",
  },
] as const;

export function resignationAvatar(employeeId: string) {
  return employeeAvatarUrl(employeeId);
}

export function createResignationId(existing: Resignation[]) {
  let max = 0;
  for (const r of existing) {
    const n = Number(r.id.replace(/\D/g, ""));
    if (n > max) max = n;
  }
  return `rsg_${String(max + 1).padStart(2, "0")}`;
}

/** Seed aligned to Workdo Resignations list. */
export const RESIGNATIONS_SEED: Resignation[] = [
  {
    id: "rsg_01",
    employeeId: "emp_11",
    employeeName: "Lamia Sultana",
    employeeEmail: "lamia.sultana@example.com",
    resignationDate: "2026-02-01",
    lastWorkingDay: "2026-02-28",
    noticePeriod: "1 month",
    status: "pending",
    description: "Relocation abroad.",
    document: "lamia-resignation.pdf",
  },
  {
    id: "rsg_02",
    employeeId: "emp_15",
    employeeName: "Ruma Begum",
    employeeEmail: "ruma.begum@example.com",
    resignationDate: "2026-02-15",
    lastWorkingDay: "2026-03-15",
    noticePeriod: "1 month",
    status: "pending",
    description: "Career change.",
    document: "ruma-resignation.pdf",
  },
  {
    id: "rsg_03",
    employeeId: "emp_02",
    employeeName: "Sadia Rahman",
    employeeEmail: "sadia.rahman@example.com",
    resignationDate: "2025-12-01",
    lastWorkingDay: "2025-12-15",
    noticePeriod: "2 weeks",
    status: "rejected",
    description: "Retention offer accepted — resignation withdrawn.",
    document: "",
  },
  {
    id: "rsg_04",
    employeeId: "emp_03",
    employeeName: "Tanvir Hasan",
    employeeEmail: "tanvir.hasan@example.com",
    resignationDate: "2025-11-10",
    lastWorkingDay: "2026-01-09",
    noticePeriod: "60 days",
    status: "completed",
    description: "Joined another organization.",
    document: "tanvir-resignation.pdf",
  },
  {
    id: "rsg_05",
    employeeId: "emp_08",
    employeeName: "Sumaiya Akter",
    employeeEmail: "sumaiya.akter@example.com",
    resignationDate: "2026-01-05",
    lastWorkingDay: "2026-02-04",
    noticePeriod: "30 days",
    status: "completed",
    description: "Personal reasons.",
    document: "sumaiya-resignation.pdf",
  },
];
