/** Workdo Employee Contracts: number, assignee, duration progress, amount. */

export type EmployeeContractStatus = "draft" | "active" | "expired" | "terminated";

export type EmployeeContract = {
  id: string;
  contractNumber: string;
  contractName: string;
  employeeName: string;
  startDate: string;
  endDate: string;
  amount: number;
  status: EmployeeContractStatus;
  notes: string;
};

export const EMPLOYEE_CONTRACT_STATUS_LABEL: Record<EmployeeContractStatus, string> = {
  draft: "Draft",
  active: "Active",
  expired: "Expired",
  terminated: "Terminated",
};

export const EMPLOYEE_CONTRACT_STATUS_OPTIONS = (
  Object.keys(EMPLOYEE_CONTRACT_STATUS_LABEL) as EmployeeContractStatus[]
).map((k) => ({ value: k, label: EMPLOYEE_CONTRACT_STATUS_LABEL[k] }));

export const CONTRACT_NAME_OPTIONS = [
  "Permanent Full-time",
  "Part-time Contract",
  "Fixed-term Contract",
  "Probationary Contract",
  "Consultant Agreement",
  "Internship Contract",
] as const;

export const CONTRACT_EMPLOYEES = [
  "Ashlee Bernhard",
  "Karim Ahmed",
  "Sadia Rahman",
  "Nusrat Jahan",
  "Tanvir Hasan",
  "Farzana Islam",
  "Imran Hossain",
  "Ayesha Khan",
  "Rafiqul Islam",
  "Mehedi Hasan",
] as const;

/** Format duration between two YMD dates as "X Years Y Months". */
export function formatContractDuration(startDate: string, endDate: string): string {
  const s = parseYmd(startDate);
  const e = parseYmd(endDate);
  if (!s || !e || e < s) return "—";
  let months =
    (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  if (e.getDate() < s.getDate()) months -= 1;
  months = Math.max(0, months);
  const years = Math.floor(months / 12);
  const rem = months % 12;
  const yLabel = years === 1 ? "1 Years" : `${years} Years`;
  const mLabel = rem === 1 ? "1 Months" : `${rem} Months`;
  if (years === 0) return mLabel;
  if (rem === 0) return yLabel;
  return `${yLabel} ${mLabel}`;
}

/** 0–100 elapsed progress of the contract (clamped). */
export function contractElapsedPct(startDate: string, endDate: string, now = new Date()): number {
  const s = parseYmd(startDate);
  const e = parseYmd(endDate);
  if (!s || !e || e <= s) return 0;
  const total = e.getTime() - s.getTime();
  const elapsed = now.getTime() - s.getTime();
  if (elapsed <= 0) return 0;
  if (elapsed >= total) return 100;
  return Math.round((elapsed / total) * 100);
}

export function daysUntilExpiry(endDate: string, now = new Date()): number | null {
  const e = parseYmd(endDate);
  if (!e) return null;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const ms = e.getTime() - startOfToday.getTime();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function isNearExpire(row: EmployeeContract, withinDays = 30): boolean {
  if (row.status !== "active") return false;
  const d = daysUntilExpiry(row.endDate);
  return d !== null && d >= 0 && d <= withinDays;
}

export function formatContractAmount(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

function parseYmd(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export const EMPLOYEE_CONTRACTS_SEED: EmployeeContract[] = [
  {
    id: "ec_1",
    contractNumber: "EMP - 2025 - 0010",
    contractName: "Permanent Full-time",
    employeeName: "Ashlee Bernhard",
    startDate: "2025-08-11",
    endDate: "2027-06-30",
    amount: 88000,
    status: "active",
    notes: "",
  },
  {
    id: "ec_2",
    contractNumber: "EMP - 2025 - 0009",
    contractName: "Part-time Contract",
    employeeName: "Karim Ahmed",
    startDate: "2025-01-15",
    endDate: "2026-08-15",
    amount: 42000,
    status: "active",
    notes: "",
  },
  {
    id: "ec_3",
    contractNumber: "EMP - 2025 - 0008",
    contractName: "Permanent Full-time",
    employeeName: "Sadia Rahman",
    startDate: "2024-06-01",
    endDate: "2026-08-05",
    amount: 72000,
    status: "active",
    notes: "Near expiry — renewal pending",
  },
  {
    id: "ec_4",
    contractNumber: "EMP - 2025 - 0007",
    contractName: "Fixed-term Contract",
    employeeName: "Nusrat Jahan",
    startDate: "2025-03-01",
    endDate: "2026-08-12",
    amount: 55000,
    status: "active",
    notes: "Near expiry",
  },
  {
    id: "ec_5",
    contractNumber: "EMP - 2024 - 0012",
    contractName: "Permanent Full-time",
    employeeName: "Tanvir Hasan",
    startDate: "2024-02-01",
    endDate: "2027-01-31",
    amount: 95000,
    status: "active",
    notes: "",
  },
  {
    id: "ec_6",
    contractNumber: "EMP - 2024 - 0011",
    contractName: "Consultant Agreement",
    employeeName: "Farzana Islam",
    startDate: "2024-09-01",
    endDate: "2026-08-31",
    amount: 60000,
    status: "active",
    notes: "",
  },
  {
    id: "ec_7",
    contractNumber: "EMP - 2025 - 0005",
    contractName: "Probationary Contract",
    employeeName: "Imran Hossain",
    startDate: "2025-11-01",
    endDate: "2026-10-31",
    amount: 48000,
    status: "active",
    notes: "",
  },
  {
    id: "ec_8",
    contractNumber: "EMP - 2025 - 0004",
    contractName: "Permanent Full-time",
    employeeName: "Ayesha Khan",
    startDate: "2025-04-01",
    endDate: "2028-03-31",
    amount: 78000,
    status: "active",
    notes: "",
  },
  {
    id: "ec_9",
    contractNumber: "EMP - 2023 - 0003",
    contractName: "Fixed-term Contract",
    employeeName: "Rafiqul Islam",
    startDate: "2023-01-01",
    endDate: "2024-12-31",
    amount: 50000,
    status: "expired",
    notes: "Completed full term",
  },
  {
    id: "ec_10",
    contractNumber: "EMP - 2024 - 0002",
    contractName: "Internship Contract",
    employeeName: "Mehedi Hasan",
    startDate: "2024-06-01",
    endDate: "2024-11-30",
    amount: 12000,
    status: "terminated",
    notes: "Ended early by mutual agreement",
  },
];

export function createEmployeeContractId(existing: EmployeeContract[]): string {
  const n = existing.reduce((max, r) => {
    const m = /^ec_(\d+)$/.exec(r.id);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return `ec_${n + 1}`;
}

export function nextContractNumber(existing: EmployeeContract[]): string {
  const year = new Date().getFullYear();
  const seq = existing.reduce((max, r) => {
    const m = /EMP\s*-\s*(\d{4})\s*-\s*(\d+)/i.exec(r.contractNumber);
    if (!m) return max;
    if (Number(m[1]) !== year) return max;
    return Math.max(max, Number(m[2]));
  }, 0);
  return `EMP - ${year} - ${String(seq + 1).padStart(4, "0")}`;
}
