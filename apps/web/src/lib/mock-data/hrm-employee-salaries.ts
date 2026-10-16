import { employeeAvatarUrl } from "@/lib/mock-data/employees";

/** Workdo demo: Employee, Basic Salary, Status, Created At + View/Edit/Lock/History/Delete. */

export type SalaryStatus = "active" | "inactive";

export type SalaryComponentChip = {
  name: string;
  kind: "earning" | "deduction";
};

export type EmployeeSalary = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  department: string;
  designation: string;
  basicSalary: number;
  allowances: number;
  deductions: number;
  netSalary: number;
  effectiveDate: string;
  createdAt: string;
  status: SalaryStatus;
  locked: boolean;
  /** Assigned salary components (Workdo detail chips). */
  components: SalaryComponentChip[];
  /** API assignments for save/edit. */
  componentAssignments?: {
    salaryComponentId: string;
    amountOverride: number | null;
    isEnabled: boolean;
    name: string;
    kind: "earning" | "deduction";
  }[];
  notes: string;
};

export const DEFAULT_SALARY_COMPONENTS: SalaryComponentChip[] = [
  { name: "House Rent Allowance (HRA)", kind: "earning" },
  { name: "Transport Allowance", kind: "earning" },
  { name: "Provident Fund (PF)", kind: "deduction" },
  { name: "Employee State Insurance (ESI)", kind: "deduction" },
  { name: "Professional Tax", kind: "deduction" },
  { name: "Income Tax (TDS)", kind: "deduction" },
];

export const DEFAULT_SALARY_NOTES = "Salary setup for employee";

export const SALARY_STATUS_LABEL: Record<SalaryStatus, string> = {
  active: "Active",
  inactive: "Inactive",
};

export const SALARY_STATUS_OPTIONS = (
  Object.keys(SALARY_STATUS_LABEL) as SalaryStatus[]
).map((k) => ({ value: k, label: SALARY_STATUS_LABEL[k] }));

export const SALARY_EMPLOYEES = [
  {
    id: "emp_01",
    name: "Karim Ahmed",
    code: "EMP1001",
    designation: "Software Engineer",
    department: "IT",
  },
  {
    id: "emp_02",
    name: "Nusrat Jahan",
    code: "EMP1004",
    designation: "Finance Analyst",
    department: "Finance",
  },
  {
    id: "emp_03",
    name: "Tanvir Hasan",
    code: "EMP1003",
    designation: "HR Executive",
    department: "HR",
  },
  {
    id: "emp_04",
    name: "Farzana Islam",
    code: "EMP1005",
    designation: "Product Manager",
    department: "Product",
  },
  {
    id: "emp_05",
    name: "Rafiqul Islam",
    code: "EMP1006",
    designation: "Sales Lead",
    department: "Sales",
  },
  {
    id: "emp_06",
    name: "Sadia Rahman",
    code: "EMP1007",
    designation: "QA Engineer",
    department: "IT",
  },
  {
    id: "emp_07",
    name: "Imran Hossain",
    code: "EMP1008",
    designation: "Accountant",
    department: "Finance",
  },
  {
    id: "emp_08",
    name: "Ayesha Khan",
    code: "EMP1009",
    designation: "Operations Lead",
    department: "Operations",
  },
] as const;

function salary(
  id: string,
  emp: (typeof SALARY_EMPLOYEES)[number],
  basicSalary: number,
  status: SalaryStatus = "active",
): EmployeeSalary {
  const allowances = Math.round(basicSalary * 0.2 * 100) / 100;
  const deductions = Math.round(basicSalary * 0.08 * 100) / 100;
  return {
    id,
    employeeId: emp.id,
    employeeName: emp.name,
    employeeCode: emp.code,
    department: emp.department,
    designation: emp.designation,
    basicSalary,
    allowances,
    deductions,
    netSalary: Math.round((basicSalary + allowances - deductions) * 100) / 100,
    effectiveDate: "2025-09-01",
    createdAt: "2025-09-19",
    status,
    locked: false,
    components: [...DEFAULT_SALARY_COMPONENTS],
    notes: DEFAULT_SALARY_NOTES,
  };
}

const e = SALARY_EMPLOYEES;

export const EMPLOYEE_SALARIES_SEED: EmployeeSalary[] = [
  salary("es_1", e[0]!, 75000),
  salary("es_2", e[1]!, 70000),
  salary("es_3", e[2]!, 20000),
  salary("es_4", e[3]!, 60000),
  salary("es_5", e[4]!, 55000),
  salary("es_6", e[5]!, 15000),
  salary("es_7", e[6]!, 45000),
  salary("es_8", e[7]!, 40000),
];

export type SalaryHistoryEntry = {
  id: string;
  effectiveDate: string;
  basicSalary: number;
  note: string;
};

export const SALARY_HISTORY: Record<string, SalaryHistoryEntry[]> = {
  es_1: [
    { id: "h1", effectiveDate: "2025-09-01", basicSalary: 75000, note: "Current" },
    { id: "h2", effectiveDate: "2024-09-01", basicSalary: 68000, note: "Annual revision" },
  ],
  es_2: [
    { id: "h3", effectiveDate: "2025-09-01", basicSalary: 70000, note: "Current" },
    { id: "h4", effectiveDate: "2024-03-01", basicSalary: 62000, note: "Promotion" },
  ],
};

export function createEmployeeSalaryId(existing: EmployeeSalary[]): string {
  const n = existing.reduce((max, r) => {
    const m = /^es_(\d+)$/.exec(r.id);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return `es_${n + 1}`;
}

export function salaryAvatar(employeeId: string) {
  return employeeAvatarUrl(employeeId);
}

export function formatSalary(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}
