import { EMPLOYEES_SEED } from "@/lib/mock-data/employees";
import {
  LEAVE_TYPE_META,
  type LeaveTypeKey,
} from "@/lib/mock-data/hrm-leave-applications";

export type LeaveBalanceLine = {
  id: string;
  leaveTypeId: string;
  leaveTypeName: string;
  leavePolicyId: string;
  leavePolicy: string;
  allocatedDays: number;
  usedDays: number;
  remainingDays: number;
  carriedForward: number;
  manualAdjustment: number;
  adjustmentReason: string;
};

export type EmployeeLeaveBalanceCard = {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  year: number;
  lines: LeaveBalanceLine[];
};

export type SyncHistoryEntry = {
  id: string;
  at: string;
  action: string;
  detail: string;
};

const ACTIVE = EMPLOYEES_SEED.filter((e) => e.status !== "terminated" && e.status !== "inactive");

const DEFAULT_ALLOCATION: Record<LeaveTypeKey, { total: number; policy: string }> = {
  annual: { total: 23, policy: "Standard Leave Policy" },
  sick: { total: 10, policy: "Standard Leave Policy" },
  emergency: { total: 5, policy: "Emergency Leave Policy" },
  compensatory: { total: 5, policy: "Comp Off Policy" },
  personal: { total: 5, policy: "Unpaid Personal Policy" },
  marriage: { total: 7, policy: "Marriage Leave Policy" },
};

const LEAVE_ORDER: LeaveTypeKey[] = [
  "annual",
  "sick",
  "emergency",
  "compensatory",
  "personal",
  "marriage",
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function buildLeaveBalanceCards(year = 2026): EmployeeLeaveBalanceCard[] {
  return ACTIVE.map((emp) => {
    const h = hash(`${emp.id}:bal:${year}`);
    const lines: LeaveBalanceLine[] = LEAVE_ORDER.map((leaveType, idx) => {
      const alloc = DEFAULT_ALLOCATION[leaveType];
      const carried = leaveType === "annual" ? h % 3 : 0;
      const allocatedDays = alloc.total + carried;
      const usedDays = Math.min(allocatedDays, (h >> (idx * 2)) % (Math.max(2, Math.floor(allocatedDays / 2)) + 1));
      const remainingDays = allocatedDays - usedDays;
      return {
        id: `${emp.id}_${leaveType}`,
        leaveTypeId: leaveType,
        leaveTypeName: LEAVE_TYPE_META[leaveType].label,
        leavePolicyId: alloc.policy,
        leavePolicy: alloc.policy,
        allocatedDays,
        usedDays,
        remainingDays,
        carriedForward: carried,
        manualAdjustment: 0,
        adjustmentReason: "",
      };
    });
    return {
      employeeId: emp.id,
      employeeName: emp.name,
      employeeCode: emp.employeeCode,
      year,
      lines,
    };
  });
}

export const LEAVE_BALANCES_SEED: EmployeeLeaveBalanceCard[] = buildLeaveBalanceCards(2026);

export const LEAVE_BALANCE_SYNC_HISTORY_SEED: SyncHistoryEntry[] = [
  {
    id: "sync_01",
    at: "2026-01-04 06:00",
    action: "Re-sync",
    detail: "Synced balances for year 2026 (all employees).",
  },
  {
    id: "sync_02",
    at: "2025-12-31 23:10",
    action: "Year-end carry forward",
    detail: "Carried unused annual leave into 2026.",
  },
  {
    id: "sync_03",
    at: "2025-07-01 09:00",
    action: "Sync Balances",
    detail: "Applied new leave types to active employees.",
  },
];

export { LEAVE_TYPE_META, LEAVE_ORDER };
