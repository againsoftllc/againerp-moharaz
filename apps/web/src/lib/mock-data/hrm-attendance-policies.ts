export type AttendancePolicyStatus = "active" | "inactive";

export type AttendancePolicy = {
  id: string;
  name: string;
  description: string;
  lateArrivalGrace: number;
  earlyDepartureGrace: number;
  halfDayThreshold: number;
  overtimeRatePerHour: number;
  status: AttendancePolicyStatus;
};

export const ATTENDANCE_POLICY_STATUS_OPTIONS: {
  value: AttendancePolicyStatus;
  label: string;
}[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

export const ATTENDANCE_POLICY_STATUS_LABEL: Record<AttendancePolicyStatus, string> = {
  active: "Active",
  inactive: "Inactive",
};

/** Workdo demo-style seed policies. */
export const ATTENDANCE_POLICIES_SEED: AttendancePolicy[] = [
  {
    id: "pol_standard",
    name: "Standard Attendance Policy",
    description: "Default attendance policy with standard grace periods for office staff.",
    lateArrivalGrace: 15,
    earlyDepartureGrace: 15,
    halfDayThreshold: 4,
    overtimeRatePerHour: 150,
    status: "active",
  },
  {
    id: "pol_flexible",
    name: "Flexible Attendance Policy",
    description: "Flexible attendance policy with extended grace periods for hybrid teams.",
    lateArrivalGrace: 30,
    earlyDepartureGrace: 30,
    halfDayThreshold: 4,
    overtimeRatePerHour: 175,
    status: "active",
  },
  {
    id: "pol_strict",
    name: "Strict Attendance Policy",
    description: "Strict attendance policy with minimal grace period for shift-critical roles.",
    lateArrivalGrace: 5,
    earlyDepartureGrace: 5,
    halfDayThreshold: 4,
    overtimeRatePerHour: 200,
    status: "active",
  },
];

export function formatMoney(amount: number) {
  return `$${amount.toFixed(2)}`;
}

export function createPolicyId(existing: AttendancePolicy[]) {
  let max = 0;
  for (const r of existing) {
    const n = Number(r.id.replace(/\D/g, ""));
    if (n > max) max = n;
  }
  return `pol_${String(max + 1).padStart(2, "0")}`;
}
