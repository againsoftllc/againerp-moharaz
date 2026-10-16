import { employeeAvatarUrl } from "@/lib/mock-data/employees";

export type PromotionStatus = "pending" | "approved" | "rejected";

/** Workdo demo list: Employee, Previous/New Designation, Promotion Date, Effective Date, Status, Document. */
export type Promotion = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  department: string;
  previousDesignation: string;
  newDesignation: string;
  /** API designation_id for the new designation */
  designationId?: string;
  currentSalary: number;
  newSalary: number;
  promotionDate: string;
  effectiveDate: string;
  description: string;
  document: string;
  status: PromotionStatus;
};

export const PROMOTION_STATUS_LABEL: Record<PromotionStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

export const PROMOTION_STATUS_OPTIONS = (
  Object.keys(PROMOTION_STATUS_LABEL) as PromotionStatus[]
).map((k) => ({ value: k, label: PROMOTION_STATUS_LABEL[k] }));

export const PROMOTION_EMPLOYEES = [
  {
    id: "emp_04",
    name: "Nusrat Jahan",
    email: "nusrat.jahan@example.com",
    department: "Technology",
    designation: "Software Engineer",
    salary: 65000,
  },
  {
    id: "emp_06",
    name: "Imran Hossain",
    email: "imran.hossain@example.com",
    department: "Customer Support",
    designation: "Support Agent",
    salary: 35000,
  },
  {
    id: "emp_05",
    name: "Farzana Islam",
    email: "farzana.islam@example.com",
    department: "Human Resources",
    designation: "HR Executive",
    salary: 42000,
  },
  {
    id: "emp_01",
    name: "Karim Ahmed",
    email: "karim.ahmed@example.com",
    department: "Sales",
    designation: "Sales Executive",
    salary: 40000,
  },
  {
    id: "emp_02",
    name: "Sadia Rahman",
    email: "sadia.rahman@example.com",
    department: "Finance",
    designation: "Finance Analyst",
    salary: 48000,
  },
  {
    id: "emp_03",
    name: "Tanvir Hasan",
    email: "tanvir.hasan@example.com",
    department: "Technology",
    designation: "Software Engineer",
    salary: 62000,
  },
] as const;

/** Designations available as new (promoted) titles — Workdo-style. */
export const PROMOTION_DESIGNATIONS = [
  "Software Engineer",
  "Senior Software Engineer",
  "Tech Lead",
  "Support Agent",
  "Support Team Lead",
  "HR Executive",
  "HR Manager",
  "HR Business Partner",
  "Sales Executive",
  "Sales Manager",
  "Finance Analyst",
  "Senior Finance Analyst",
  "Accountant",
  "Marketing Executive",
  "Marketing Manager",
] as const;

export function promotionAvatar(employeeId: string) {
  return employeeAvatarUrl(employeeId);
}

export function formatMoney(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function createPromotionId(existing: Promotion[]) {
  let max = 0;
  for (const r of existing) {
    const n = Number(r.id.replace(/\D/g, ""));
    if (n > max) max = n;
  }
  return `prm_${String(max + 1).padStart(2, "0")}`;
}

/** Seed aligned to Workdo demo promotions list. */
export const PROMOTIONS_SEED: Promotion[] = [
  {
    id: "prm_01",
    employeeId: "emp_04",
    employeeName: "Nusrat Jahan",
    employeeEmail: "nusrat.jahan@example.com",
    department: "Technology",
    previousDesignation: "Software Engineer",
    newDesignation: "Senior Software Engineer",
    currentSalary: 65000,
    newSalary: 85000,
    promotionDate: "2026-01-20",
    effectiveDate: "2026-02-01",
    description: "Strong delivery on ERP modules and mentoring of juniors.",
    document: "nusrat-promotion-letter.pdf",
    status: "approved",
  },
  {
    id: "prm_02",
    employeeId: "emp_06",
    employeeName: "Imran Hossain",
    employeeEmail: "imran.hossain@example.com",
    department: "Customer Support",
    previousDesignation: "Support Agent",
    newDesignation: "Support Team Lead",
    currentSalary: 35000,
    newSalary: 48000,
    promotionDate: "2026-02-15",
    effectiveDate: "2026-03-01",
    description: "Consistent CSAT scores and coaching of new agents.",
    document: "imran-promotion-letter.pdf",
    status: "pending",
  },
  {
    id: "prm_03",
    employeeId: "emp_05",
    employeeName: "Farzana Islam",
    employeeEmail: "farzana.islam@example.com",
    department: "Human Resources",
    previousDesignation: "HR Manager",
    newDesignation: "Accountant",
    currentSalary: 42000,
    newSalary: 45000,
    promotionDate: "2026-01-05",
    effectiveDate: "2026-01-15",
    description: "Role change request — declined after review.",
    document: "",
    status: "rejected",
  },
  {
    id: "prm_04",
    employeeId: "emp_01",
    employeeName: "Karim Ahmed",
    employeeEmail: "karim.ahmed@example.com",
    department: "Sales",
    previousDesignation: "Sales Executive",
    newDesignation: "Sales Manager",
    currentSalary: 40000,
    newSalary: 58000,
    promotionDate: "2026-02-01",
    effectiveDate: "2026-02-15",
    description: "Top regional revenue contributor in Q4.",
    document: "karim-promotion-letter.pdf",
    status: "approved",
  },
];
