/** Workdo Contract Types: duration, probation, notice, contracts count. */

export type ContractTypeStatus = "active" | "inactive";

export type ContractType = {
  id: string;
  name: string;
  description: string;
  /** null = Permanent */
  durationMonths: number | null;
  probationMonths: number;
  noticeDays: number;
  contractsCount: number;
  locked: boolean;
  status: ContractTypeStatus;
  createdAt: string;
};

export const CONTRACT_TYPE_STATUS_LABEL: Record<ContractTypeStatus, string> = {
  active: "Active",
  inactive: "Inactive",
};

export const CONTRACT_TYPE_STATUS_OPTIONS = (
  Object.keys(CONTRACT_TYPE_STATUS_LABEL) as ContractTypeStatus[]
).map((k) => ({ value: k, label: CONTRACT_TYPE_STATUS_LABEL[k] }));

export function formatDuration(months: number | null): string {
  if (months === null) return "Permanent";
  return `${months} ${months === 1 ? "month" : "months"}`;
}

export function formatProbation(months: number): string {
  return `${months} ${months === 1 ? "month" : "months"}`;
}

export function formatNotice(days: number): string {
  return `${days} ${days === 1 ? "day" : "days"}`;
}

export const CONTRACT_TYPES_SEED: ContractType[] = [
  {
    id: "ctype_1",
    name: "Permanent Full-time",
    description: "Indefinite full-time employment with full benefits.",
    durationMonths: null,
    probationMonths: 6,
    noticeDays: 60,
    contractsCount: 6,
    locked: false,
    status: "active",
    createdAt: "2025-09-19",
  },
  {
    id: "ctype_2",
    name: "Fixed-term Contract",
    description: "Time-bound employment with a defined end date.",
    durationMonths: 12,
    probationMonths: 3,
    noticeDays: 30,
    contractsCount: 2,
    locked: false,
    status: "active",
    createdAt: "2025-09-19",
  },
  {
    id: "ctype_3",
    name: "Part-time Contract",
    description: "Reduced-hours employment with prorated benefits.",
    durationMonths: null,
    probationMonths: 3,
    noticeDays: 30,
    contractsCount: 1,
    locked: false,
    status: "active",
    createdAt: "2025-09-19",
  },
  {
    id: "ctype_4",
    name: "Temporary Contract",
    description: "Short-term temporary staffing arrangement.",
    durationMonths: 6,
    probationMonths: 1,
    noticeDays: 15,
    contractsCount: 0,
    locked: false,
    status: "active",
    createdAt: "2025-09-19",
  },
  {
    id: "ctype_5",
    name: "Consultant Agreement",
    description: "Independent contractor / consultant engagement.",
    durationMonths: 12,
    probationMonths: 0,
    noticeDays: 15,
    contractsCount: 1,
    locked: false,
    status: "active",
    createdAt: "2025-09-19",
  },
  {
    id: "ctype_6",
    name: "Internship Contract",
    description: "Student or graduate internship placement.",
    durationMonths: 3,
    probationMonths: 0,
    noticeDays: 7,
    contractsCount: 0,
    locked: false,
    status: "active",
    createdAt: "2025-09-19",
  },
];

export function createContractTypeId(existing: ContractType[]): string {
  const n = existing.reduce((max, r) => {
    const m = /^ctype_(\d+)$/.exec(r.id);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return `ctype_${n + 1}`;
}

export function todayYmd(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
