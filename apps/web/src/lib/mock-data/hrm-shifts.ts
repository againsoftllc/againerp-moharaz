export type ShiftStatus = "active" | "inactive";

export type HrmShift = {
  id: string;
  name: string;
  description: string;
  startTime: string;
  endTime: string;
  breakDuration: number;
  breakStartTime: string;
  breakEndTime: string;
  gracePeriod: number;
  isNightShift: boolean;
  status: ShiftStatus;
};

export const SHIFT_STATUS_OPTIONS: { value: ShiftStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

export const SHIFT_STATUS_LABEL: Record<ShiftStatus, string> = {
  active: "Active",
  inactive: "Inactive",
};

/** Parse HH:MM to minutes from midnight. */
export function parseHm(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Working hours = span(start→end) − breakDuration/60 (night shifts wrap past midnight). */
export function calcWorkingHours(
  startTime: string,
  endTime: string,
  breakDurationMin: number,
  isNightShift: boolean,
): number {
  const a = parseHm(startTime);
  const b = parseHm(endTime);
  if (a == null || b == null) return 0;
  let span = b - a;
  if (isNightShift || span <= 0) span += 24 * 60;
  const raw = span / 60 - (Number.isFinite(breakDurationMin) ? breakDurationMin / 60 : 0);
  return Math.max(0, Math.round(raw * 10) / 10);
}

export const SHIFTS_SEED: HrmShift[] = [
  {
    id: "shift_morning",
    name: "Morning Shift",
    description: "Standard morning shift for regular office hours",
    startTime: "09:00",
    endTime: "18:00",
    breakDuration: 60,
    breakStartTime: "13:00",
    breakEndTime: "14:00",
    gracePeriod: 15,
    isNightShift: false,
    status: "active",
  },
  {
    id: "shift_evening",
    name: "Evening Shift",
    description: "Evening shift for extended business hours",
    startTime: "14:00",
    endTime: "23:00",
    breakDuration: 60,
    breakStartTime: "18:00",
    breakEndTime: "19:00",
    gracePeriod: 15,
    isNightShift: false,
    status: "active",
  },
  {
    id: "shift_night",
    name: "Night Shift",
    description: "Night shift for 24/7 operations and support",
    startTime: "22:00",
    endTime: "07:00",
    breakDuration: 60,
    breakStartTime: "02:00",
    breakEndTime: "03:00",
    gracePeriod: 15,
    isNightShift: true,
    status: "active",
  },
];

export function createShiftId(existing: HrmShift[]) {
  let max = 0;
  for (const r of existing) {
    const n = Number(r.id.replace(/\D/g, ""));
    if (n > max) max = n;
  }
  return `shift_${String(max + 1).padStart(2, "0")}`;
}
