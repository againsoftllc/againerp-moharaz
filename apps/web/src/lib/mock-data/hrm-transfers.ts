import { employeeAvatarUrl } from "@/lib/mock-data/employees";

export type TransferStatus = "pending" | "approved" | "rejected";

/** Workdo demo: Employee, Transfer Type, From→To, Transfer/Effective Date, Status, Documents. */
export type Transfer = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  fromBranch: string;
  toBranch: string;
  fromDepartment: string;
  toDepartment: string;
  fromDesignation: string;
  toDesignation: string;
  toBranchId?: string;
  toDepartmentId?: string;
  toDesignationId?: string;
  transferDate: string;
  effectiveDate: string;
  description: string;
  document: string;
  status: TransferStatus;
};

export const TRANSFER_STATUS_LABEL: Record<TransferStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

export const TRANSFER_STATUS_OPTIONS = (
  Object.keys(TRANSFER_STATUS_LABEL) as TransferStatus[]
).map((k) => ({ value: k, label: TRANSFER_STATUS_LABEL[k] }));

export const TRANSFER_BRANCHES = [
  "City Center",
  "Main Office",
  "Dhaka HQ",
  "Gazipur DC",
  "Chittagong",
] as const;

export const TRANSFER_DEPARTMENTS = [
  "Information Technology",
  "Finance & Accounting",
  "Human Resources",
  "Technology",
  "Finance",
  "Operations",
  "Customer Support",
  "Marketing",
  "Sales",
] as const;

export const TRANSFER_DESIGNATIONS = [
  "HR Executive",
  "Recruiter",
  "Software Engineer",
  "Senior Software Engineer",
  "Support Agent",
  "Support Team Lead",
  "Finance Analyst",
  "Accountant",
  "Sales Executive",
  "Sales Manager",
  "Operations Coordinator",
] as const;

export const TRANSFER_EMPLOYEES = [
  {
    id: "emp_04",
    name: "Nusrat Jahan",
    email: "nusrat.jahan@example.com",
    branch: "Dhaka HQ",
    department: "Technology",
    designation: "Software Engineer",
  },
  {
    id: "emp_07",
    name: "Rafiq Ahmed",
    email: "rafiq.ahmed@example.com",
    branch: "Dhaka HQ",
    department: "Operations",
    designation: "Operations Coordinator",
  },
  {
    id: "emp_09",
    name: "Mehnaz Chowdhury",
    email: "mehnaz.chowdhury@example.com",
    branch: "City Center",
    department: "Human Resources",
    designation: "HR Executive",
  },
  {
    id: "emp_10",
    name: "Ashik Rahman",
    email: "ashik.rahman@example.com",
    branch: "Gazipur DC",
    department: "Customer Support",
    designation: "Support Agent",
  },
  {
    id: "emp_02",
    name: "Sadia Rahman",
    email: "sadia.rahman@example.com",
    branch: "Main Office",
    department: "Finance & Accounting",
    designation: "Finance Analyst",
  },
  {
    id: "emp_01",
    name: "Karim Ahmed",
    email: "karim.ahmed@example.com",
    branch: "Dhaka HQ",
    department: "Sales",
    designation: "Sales Executive",
  },
] as const;

export function transferAvatar(employeeId: string) {
  return employeeAvatarUrl(employeeId);
}

export function createTransferId(existing: Transfer[]) {
  let max = 0;
  for (const r of existing) {
    const n = Number(r.id.replace(/\D/g, ""));
    if (n > max) max = n;
  }
  return `trf_${String(max + 1).padStart(2, "0")}`;
}

/** Workdo "Transfer Type" — dimensions that change. */
export function transferTypeLabel(row: Transfer): string {
  const parts: string[] = [];
  if (row.fromBranch !== row.toBranch) parts.push("Branch");
  if (row.fromDepartment !== row.toDepartment) parts.push("Department");
  if (row.fromDesignation !== row.toDesignation) parts.push("Designation");
  return parts.length ? parts.join(", ") : "—";
}

/** From → To lines for list/view (only changed dimensions). */
export function transferPathLines(row: Transfer): string[] {
  const lines: string[] = [];
  if (row.fromBranch !== row.toBranch) {
    lines.push(`${row.fromBranch} → ${row.toBranch}`);
  }
  if (row.fromDepartment !== row.toDepartment) {
    lines.push(`${row.fromDepartment} → ${row.toDepartment}`);
  }
  if (row.fromDesignation !== row.toDesignation) {
    lines.push(`${row.fromDesignation} → ${row.toDesignation}`);
  }
  return lines.length ? lines : ["—"];
}

/** Seed aligned to Workdo Employee Transfers list. */
export const TRANSFERS_SEED: Transfer[] = [
  {
    id: "trf_01",
    employeeId: "emp_09",
    employeeName: "Mehnaz Chowdhury",
    employeeEmail: "mehnaz.chowdhury@example.com",
    fromBranch: "City Center",
    toBranch: "Main Office",
    fromDepartment: "Information Technology",
    toDepartment: "Finance & Accounting",
    fromDesignation: "HR Executive",
    toDesignation: "Recruiter",
    transferDate: "2026-01-12",
    effectiveDate: "2026-02-01",
    description: "Cross-functional move to support recruiting in finance ops.",
    document: "mehnaz-transfer.pdf",
    status: "approved",
  },
  {
    id: "trf_02",
    employeeId: "emp_07",
    employeeName: "Rafiq Ahmed",
    employeeEmail: "rafiq.ahmed@example.com",
    fromBranch: "Dhaka HQ",
    toBranch: "Gazipur DC",
    fromDepartment: "Operations",
    toDepartment: "Operations",
    fromDesignation: "Operations Coordinator",
    toDesignation: "Operations Coordinator",
    transferDate: "2026-02-15",
    effectiveDate: "2026-03-01",
    description: "DC capacity expansion.",
    document: "rafiq-transfer.pdf",
    status: "pending",
  },
  {
    id: "trf_03",
    employeeId: "emp_10",
    employeeName: "Ashik Rahman",
    employeeEmail: "ashik.rahman@example.com",
    fromBranch: "Gazipur DC",
    toBranch: "Dhaka HQ",
    fromDepartment: "Customer Support",
    toDepartment: "Customer Support",
    fromDesignation: "Support Agent",
    toDesignation: "Support Team Lead",
    transferDate: "2026-01-20",
    effectiveDate: "2026-02-01",
    description: "HQ queue surge — promote within support.",
    document: "",
    status: "pending",
  },
  {
    id: "trf_04",
    employeeId: "emp_04",
    employeeName: "Nusrat Jahan",
    employeeEmail: "nusrat.jahan@example.com",
    fromBranch: "Dhaka HQ",
    toBranch: "Chittagong",
    fromDepartment: "Technology",
    toDepartment: "Technology",
    fromDesignation: "Software Engineer",
    toDesignation: "Senior Software Engineer",
    transferDate: "2026-02-01",
    effectiveDate: "2026-02-15",
    description: "Regional tech lead coverage.",
    document: "nusrat-transfer.pdf",
    status: "approved",
  },
];
