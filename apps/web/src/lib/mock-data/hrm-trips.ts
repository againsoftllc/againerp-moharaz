import { employeeAvatarUrl } from "@/lib/mock-data/employees";

export type TripStatus = "planned" | "ongoing" | "completed" | "cancelled";
export type AdvanceStatus = "none" | "requested" | "approved" | "paid" | "reconciled";
export type ExpenseStatus = "none" | "pending" | "approved" | "paid";

export type TripExpense = {
  id: string;
  category: string;
  amount: number;
  date: string;
  note: string;
};

/** Workdo demo: Employee, Destination, Start/End, Status, Advance, Expenses, Expenses action. */
export type Trip = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  purpose: string;
  destination: string;
  startDate: string;
  endDate: string;
  description: string;
  expectedOutcomes: string;
  status: TripStatus;
  advanceAmount: number;
  advanceStatus: AdvanceStatus;
  totalExpenses: number;
  expenseStatus: ExpenseStatus;
  expenses: TripExpense[];
};

export const TRIP_STATUS_LABEL: Record<TripStatus, string> = {
  planned: "Planned",
  ongoing: "Ongoing",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const ADVANCE_STATUS_LABEL: Record<AdvanceStatus, string> = {
  none: "—",
  requested: "Requested",
  approved: "Approved",
  paid: "Paid",
  reconciled: "Reconciled",
};

export const EXPENSE_STATUS_LABEL: Record<ExpenseStatus, string> = {
  none: "—",
  pending: "Pending",
  approved: "Approved",
  paid: "Paid",
};

export const TRIP_STATUS_OPTIONS = (Object.keys(TRIP_STATUS_LABEL) as TripStatus[]).map((k) => ({
  value: k,
  label: TRIP_STATUS_LABEL[k],
}));

export const ADVANCE_STATUS_OPTIONS = (
  Object.keys(ADVANCE_STATUS_LABEL) as AdvanceStatus[]
).map((k) => ({ value: k, label: ADVANCE_STATUS_LABEL[k] }));

export const EXPENSE_STATUS_OPTIONS = (Object.keys(EXPENSE_STATUS_LABEL) as ExpenseStatus[]).map(
  (k) => ({ value: k, label: EXPENSE_STATUS_LABEL[k] }),
);

export const TRIP_EMPLOYEES = [
  {
    id: "emp_01",
    name: "Karim Ahmed",
    email: "karim.ahmed@example.com",
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
    id: "emp_04",
    name: "Nusrat Jahan",
    email: "nusrat.jahan@example.com",
  },
  {
    id: "emp_05",
    name: "Farzana Islam",
    email: "farzana.islam@example.com",
  },
] as const;

export function tripAvatar(employeeId: string) {
  return employeeAvatarUrl(employeeId);
}

export function formatTripMoney(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function createTripId(existing: Trip[]) {
  let max = 0;
  for (const r of existing) {
    const n = Number(r.id.replace(/\D/g, ""));
    if (n > max) max = n;
  }
  return `trp_${String(max + 1).padStart(2, "0")}`;
}

/** Seed aligned to Workdo Trips list. */
export const TRIPS_SEED: Trip[] = [
  {
    id: "trp_01",
    employeeId: "emp_01",
    employeeName: "Karim Ahmed",
    employeeEmail: "karim.ahmed@example.com",
    purpose: "Client kickoff",
    destination: "Dubai, UAE",
    startDate: "2026-01-20",
    endDate: "2026-01-24",
    description: "Onsite workshop with regional partner.",
    expectedOutcomes: "Signed SOW draft.",
    status: "ongoing",
    advanceAmount: 0,
    advanceStatus: "none",
    totalExpenses: 10000,
    expenseStatus: "pending",
    expenses: [
      {
        id: "tex_01",
        category: "Flights",
        amount: 6500,
        date: "2026-01-18",
        note: "DXB round trip",
      },
      {
        id: "tex_02",
        category: "Hotel",
        amount: 3500,
        date: "2026-01-20",
        note: "4 nights",
      },
    ],
  },
  {
    id: "trp_02",
    employeeId: "emp_02",
    employeeName: "Sadia Rahman",
    employeeEmail: "sadia.rahman@example.com",
    purpose: "Payroll conference",
    destination: "Bangalore, India",
    startDate: "2026-02-10",
    endDate: "2026-02-14",
    description: "Industry payroll compliance summit.",
    expectedOutcomes: "Updated compliance checklist.",
    status: "planned",
    advanceAmount: 12668.33,
    advanceStatus: "reconciled",
    totalExpenses: 0,
    expenseStatus: "none",
    expenses: [],
  },
  {
    id: "trp_03",
    employeeId: "emp_03",
    employeeName: "Tanvir Hasan",
    employeeEmail: "tanvir.hasan@example.com",
    purpose: "Vendor audit",
    destination: "Chittagong, Bangladesh",
    startDate: "2026-01-18",
    endDate: "2026-01-19",
    description: "Warehouse vendor quality audit.",
    expectedOutcomes: "Audit report filed.",
    status: "ongoing",
    advanceAmount: 8000,
    advanceStatus: "approved",
    totalExpenses: 7600,
    expenseStatus: "pending",
    expenses: [
      {
        id: "tex_03",
        category: "Transport",
        amount: 4200,
        date: "2026-01-18",
        note: "Intercity travel",
      },
      {
        id: "tex_04",
        category: "Meals",
        amount: 3400,
        date: "2026-01-19",
        note: "Team meals",
      },
    ],
  },
  {
    id: "trp_04",
    employeeId: "emp_04",
    employeeName: "Nusrat Jahan",
    employeeEmail: "nusrat.jahan@example.com",
    purpose: "Partner meetup",
    destination: "Tokyo, Japan",
    startDate: "2025-11-05",
    endDate: "2025-11-10",
    description: "Cancelled due to visa delay.",
    expectedOutcomes: "—",
    status: "cancelled",
    advanceAmount: 21005.7,
    advanceStatus: "approved",
    totalExpenses: 0,
    expenseStatus: "none",
    expenses: [],
  },
  {
    id: "trp_05",
    employeeId: "emp_05",
    employeeName: "Farzana Islam",
    employeeEmail: "farzana.islam@example.com",
    purpose: "HR summit",
    destination: "Singapore",
    startDate: "2025-12-01",
    endDate: "2025-12-04",
    description: "Regional HR leadership summit.",
    expectedOutcomes: "Networking + playbook notes.",
    status: "completed",
    advanceAmount: 9500,
    advanceStatus: "reconciled",
    totalExpenses: 11200,
    expenseStatus: "paid",
    expenses: [
      {
        id: "tex_05",
        category: "Flights",
        amount: 7200,
        date: "2025-11-28",
        note: "SIN round trip",
      },
      {
        id: "tex_06",
        category: "Hotel",
        amount: 4000,
        date: "2025-12-01",
        note: "3 nights",
      },
    ],
  },
];
