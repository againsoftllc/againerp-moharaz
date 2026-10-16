import { EMPLOYEES_SEED, type Employee } from "@/lib/mock-data/employees";

export type LeaveAppStatus = "pending" | "approved" | "rejected";

export type LeaveTypeKey =
  | "annual"
  | "sick"
  | "emergency"
  | "compensatory"
  | "personal"
  | "marriage";

export type LeaveApplicationRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  employeeEmail: string;
  designation: string;
  leaveTypeId: string;
  leaveTypeName: string;
  leavePolicyId: string;
  leavePolicy: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  attachment: string;
  status: LeaveAppStatus;
  appliedOn: string;
  approvedAt: string;
  isPaid: boolean;
};

/** Pick a chip style for a leave type name (API-driven types). */
export function leaveTypeVisual(name: string) {
  const keys = Object.keys(LEAVE_TYPE_META) as LeaveTypeKey[];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const meta = LEAVE_TYPE_META[keys[h % keys.length]!];
  return { ...meta, label: name || meta.label };
}

export const LEAVE_TYPE_META: Record<
  LeaveTypeKey,
  { label: string; color: string; bg: string; border: string }
> = {
  annual: {
    label: "Annual Leave",
    color: "text-teal-800 dark:text-teal-200",
    bg: "bg-teal-500/25",
    border: "border-teal-500/40",
  },
  sick: {
    label: "Sick Leave",
    color: "text-rose-800 dark:text-rose-200",
    bg: "bg-rose-500/25",
    border: "border-rose-500/40",
  },
  emergency: {
    label: "Emergency Leave",
    color: "text-amber-900 dark:text-amber-200",
    bg: "bg-amber-400/35",
    border: "border-amber-500/40",
  },
  compensatory: {
    label: "Compensatory Leave",
    color: "text-sky-900 dark:text-sky-200",
    bg: "bg-sky-400/30",
    border: "border-sky-500/40",
  },
  personal: {
    label: "Personal Leave",
    color: "text-lime-900 dark:text-lime-200",
    bg: "bg-lime-400/30",
    border: "border-lime-500/40",
  },
  marriage: {
    label: "Marriage Leave",
    color: "text-orange-900 dark:text-orange-200",
    bg: "bg-orange-400/35",
    border: "border-orange-500/40",
  },
};

export const LEAVE_TYPE_OPTIONS = (Object.keys(LEAVE_TYPE_META) as LeaveTypeKey[]).map((k) => ({
  value: k,
  label: LEAVE_TYPE_META[k].label,
}));

export const LEAVE_APP_STATUS_LABEL: Record<LeaveAppStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const ACTIVE = EMPLOYEES_SEED.filter((e) => e.status !== "terminated" && e.status !== "inactive");

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function toYmd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseYmd(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

export function startOfWeekMonday(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = x.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  x.setDate(x.getDate() + diff);
  return x;
}

export function weekDays(monday: Date) {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function monthLabel(d: Date) {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function weekdayShort(d: Date) {
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

/** Inclusive calendar days (simple mock; weekends counted). */
export function calcLeaveDays(start: string, end: string) {
  const a = parseYmd(start);
  const b = parseYmd(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart <= bEnd && aEnd >= bStart;
}

export function createLeaveId(existing: LeaveApplicationRow[]) {
  let max = 0;
  for (const r of existing) {
    const n = Number(r.id.replace(/\D/g, ""));
    if (n > max) max = n;
  }
  return `leave_${pad2(max + 1)}`;
}

function emp(i: number): Employee {
  return ACTIVE[i % ACTIVE.length]!;
}

function seedRow(
  idx: number,
  employeeIdx: number,
  leaveType: LeaveTypeKey,
  leavePolicy: string,
  rest: Pick<
    LeaveApplicationRow,
    | "startDate"
    | "endDate"
    | "totalDays"
    | "reason"
    | "attachment"
    | "status"
    | "appliedOn"
    | "approvedAt"
    | "isPaid"
  >,
): LeaveApplicationRow {
  const e = emp(employeeIdx);
  return {
    id: `leave_${pad2(idx)}`,
    employeeId: e.id,
    employeeName: e.name,
    employeeCode: e.employeeCode,
    employeeEmail: e.email,
    designation: e.designation,
    leaveTypeId: leaveType,
    leaveTypeName: LEAVE_TYPE_META[leaveType].label,
    leavePolicyId: `${leaveType}_policy`,
    leavePolicy,
    ...rest,
  };
}

/** Rich Workdo-style seed spanning July–Aug 2026 for timeline + pending table. */
export const LEAVE_APPLICATIONS_UI_SEED: LeaveApplicationRow[] = [
  seedRow(1, 0, "sick", "Standard Leave Policy", {
    startDate: "2026-07-20",
    endDate: "2026-07-21",
    totalDays: 2,
    reason: "Fever and doctor rest advice.",
    attachment: "",
    status: "approved",
    appliedOn: "2026-07-18",
    approvedAt: "2026-07-19",
    isPaid: true,
  }),
  seedRow(2, 1, "sick", "Standard Leave Policy", {
    startDate: "2026-07-22",
    endDate: "2026-07-25",
    totalDays: 4,
    reason: "Recovering from seasonal illness.",
    attachment: "",
    status: "approved",
    appliedOn: "2026-07-20",
    approvedAt: "2026-07-21",
    isPaid: true,
  }),
  seedRow(3, 2, "personal", "Unpaid Personal Policy", {
    startDate: "2026-07-21",
    endDate: "2026-07-21",
    totalDays: 1,
    reason: "Personal errand.",
    attachment: "",
    status: "approved",
    appliedOn: "2026-07-19",
    approvedAt: "2026-07-20",
    isPaid: false,
  }),
  seedRow(4, 5, "emergency", "Emergency Leave Policy", {
    startDate: "2026-07-24",
    endDate: "2026-07-24",
    totalDays: 1,
    reason: "Family emergency.",
    attachment: "",
    status: "pending",
    appliedOn: "2026-07-23",
    approvedAt: "",
    isPaid: true,
  }),
  seedRow(5, 3, "marriage", "Marriage Leave Policy", {
    startDate: "2026-08-24",
    endDate: "2026-08-26",
    totalDays: 3,
    reason: "Wedding ceremonies.",
    attachment: "invite.pdf",
    status: "pending",
    appliedOn: "2026-07-02",
    approvedAt: "",
    isPaid: true,
  }),
  seedRow(6, 4, "compensatory", "Comp Off Policy", {
    startDate: "2026-08-17",
    endDate: "2026-08-18",
    totalDays: 2,
    reason: "Comp off for weekend deployment.",
    attachment: "",
    status: "pending",
    appliedOn: "2026-07-02",
    approvedAt: "",
    isPaid: true,
  }),
  seedRow(7, 6, "personal", "Unpaid Personal Policy", {
    startDate: "2026-07-06",
    endDate: "2026-07-08",
    totalDays: 3,
    reason: "Home relocation.",
    attachment: "",
    status: "pending",
    appliedOn: "2026-07-02",
    approvedAt: "",
    isPaid: false,
  }),
  seedRow(8, 6, "marriage", "Marriage Leave Policy", {
    startDate: "2026-07-14",
    endDate: "2026-07-18",
    totalDays: 5,
    reason: "Sibling wedding travel.",
    attachment: "",
    status: "pending",
    appliedOn: "2026-07-02",
    approvedAt: "",
    isPaid: true,
  }),
  seedRow(9, 7, "annual", "Standard Leave Policy", {
    startDate: "2026-07-27",
    endDate: "2026-07-29",
    totalDays: 3,
    reason: "Family trip.",
    attachment: "",
    status: "pending",
    appliedOn: "2026-07-02",
    approvedAt: "",
    isPaid: true,
  }),
  seedRow(10, 8, "personal", "Unpaid Personal Policy", {
    startDate: "2026-08-10",
    endDate: "2026-08-12",
    totalDays: 3,
    reason: "Personal matters.",
    attachment: "",
    status: "pending",
    appliedOn: "2026-07-02",
    approvedAt: "",
    isPaid: false,
  }),
  seedRow(11, 9, "annual", "Standard Leave Policy", {
    startDate: "2026-06-10",
    endDate: "2026-06-12",
    totalDays: 3,
    reason: "Insufficient notice — rejected.",
    attachment: "",
    status: "rejected",
    appliedOn: "2026-06-01",
    approvedAt: "",
    isPaid: true,
  }),
  seedRow(12, 10, "sick", "Standard Leave Policy", {
    startDate: "2026-06-20",
    endDate: "2026-06-21",
    totalDays: 2,
    reason: "Medical certificate missing.",
    attachment: "",
    status: "rejected",
    appliedOn: "2026-06-18",
    approvedAt: "",
    isPaid: true,
  }),
];

export const ACTIVE_LEAVE_EMPLOYEES = ACTIVE;
