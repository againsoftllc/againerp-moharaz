import { EMPLOYEES_SEED, type Employee } from "@/lib/mock-data/employees";

/** Primary day status (one per cell). */
export type AttendanceDayStatus =
  | "present"
  | "absent"
  | "half_day"
  | "on_leave"
  | "holiday"
  | "day_off"
  | "future"
  | "not_added";

/** Secondary markers stacked under the primary icon. */
export type AttendanceDayFlag = "late" | "early_departure" | "overtime";

export type AttendancePunchType = "clock_in" | "break_start" | "break_end" | "clock_out";

export type AttendancePunch = {
  id: string;
  type: AttendancePunchType;
  time: string;
  source: "web" | "biometric" | "manual";
  note?: string;
};

export type AttendanceDayCell = {
  status: AttendanceDayStatus;
  flags: AttendanceDayFlag[];
  /** Contribution toward present total (0 | 0.5 | 1). */
  presentCredit: number;
};

/** Full day record shown in day-click popup / Add Record. */
export type AttendanceDayDetail = AttendanceDayCell & {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  date: string;
  shift: string;
  attendancePolicy: string;
  clockIn: string;
  clockOut: string;
  breakHours: number;
  overtimeHours: number;
  overtimeAmount: number;
  totalHours: number;
  notes: string;
  punches: AttendancePunch[];
};

export type AttendanceMonthRow = {
  employee: Employee;
  days: Record<number, AttendanceDayCell>;
  presentTotal: number;
  workingDays: number;
};

export type AttendanceOverrideMap = Record<string, AttendanceDayDetail | null>;

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const HOLIDAYS_BY_YM: Record<string, number[]> = {
  "2026-07": [17],
};

const SHIFTS = ["General", "Morning", "Evening", "Night"] as const;
const POLICIES = [
  "Standard Office Policy",
  "Warehouse Shift Policy",
  "Probation Attendance Policy",
] as const;

export const ATTENDANCE_STATUS_OPTIONS: { value: AttendanceDayStatus; label: string }[] = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "half_day", label: "Half Day" },
  { value: "on_leave", label: "On Leave" },
  { value: "holiday", label: "Holiday" },
  { value: "day_off", label: "Day Off" },
  { value: "not_added", label: "Attendance Not Added" },
];

export const ATTENDANCE_SHIFT_OPTIONS = SHIFTS.map((s) => ({ value: s, label: s }));
export const ATTENDANCE_POLICY_OPTIONS = POLICIES.map((p) => ({ value: p, label: p }));

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function ymKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function toYmd(year: number, month: number, day: number) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function dayKey(employeeId: string, date: string) {
  return `${employeeId}:${date}`;
}

export function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

export function isWeekend(year: number, month: number, day: number) {
  const dow = new Date(year, month - 1, day).getDay();
  return dow === 0 || dow === 6;
}

export function weekdayShort(year: number, month: number, day: number) {
  return WEEKDAY_SHORT[new Date(year, month - 1, day).getDay()];
}

export function monthName(month: number) {
  return new Date(2000, month - 1, 1).toLocaleDateString("en-US", { month: "long" });
}

function todayParts() {
  const t = new Date();
  return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() };
}

export function isFutureDay(year: number, month: number, day: number) {
  const { y, m, d } = todayParts();
  if (year > y) return true;
  if (year < y) return false;
  if (month > m) return true;
  if (month < m) return false;
  return day > d;
}

function countWorkingDays(year: number, month: number, holidays: Set<number>) {
  const n = daysInMonth(year, month);
  let w = 0;
  for (let day = 1; day <= n; day++) {
    if (isWeekend(year, month, day)) continue;
    if (holidays.has(day)) continue;
    w += 1;
  }
  return w;
}

function presentCreditFor(status: AttendanceDayStatus): number {
  if (status === "present") return 1;
  if (status === "half_day") return 0.5;
  return 0;
}

function pickStatus(
  empId: string,
  year: number,
  month: number,
  day: number,
  holidays: Set<number>,
): AttendanceDayCell {
  if (isFutureDay(year, month, day)) {
    return { status: "future", flags: [], presentCredit: 0 };
  }
  if (isWeekend(year, month, day)) {
    return { status: "day_off", flags: [], presentCredit: 0 };
  }
  if (holidays.has(day)) {
    return { status: "holiday", flags: [], presentCredit: 0 };
  }

  const h = hash(`${empId}:${year}-${month}-${day}`);
  const r = h % 100;

  if (r < 3) return { status: "not_added", flags: [], presentCredit: 0 };
  if (r < 7) return { status: "on_leave", flags: [], presentCredit: 0 };
  if (r < 11) return { status: "absent", flags: [], presentCredit: 0 };
  if (r < 16) {
    const flags: AttendanceDayFlag[] = [];
    if (h % 5 === 0) flags.push("late");
    return { status: "half_day", flags, presentCredit: 0.5 };
  }

  const flags: AttendanceDayFlag[] = [];
  if (r >= 85 && r < 93) flags.push("late");
  if (r >= 93 && r < 96) flags.push("early_departure");
  if (r >= 96) flags.push("overtime");
  if (r === 88) flags.push("overtime");

  return { status: "present", flags, presentCredit: 1 };
}

function minsToHm(mins: number) {
  const m = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

function parseHm(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Worked span from clock in → out. Break hours are stored separately and not deducted. */
export function calcHours(clockIn: string, clockOut: string, _breakHours: number = 0): number {
  const a = parseHm(clockIn);
  const b = parseHm(clockOut);
  if (a == null || b == null || b <= a) return 0;
  const raw = (b - a) / 60;
  return Math.max(0, Math.round(raw * 100) / 100);
}

function buildPunches(
  idBase: string,
  cell: AttendanceDayCell,
  clockIn: string,
  clockOut: string,
  breakHours: number,
): AttendancePunch[] {
  if (
    cell.status === "absent" ||
    cell.status === "on_leave" ||
    cell.status === "holiday" ||
    cell.status === "day_off" ||
    cell.status === "future" ||
    cell.status === "not_added" ||
    !clockIn
  ) {
    return [];
  }

  const punches: AttendancePunch[] = [
    {
      id: `${idBase}_in`,
      type: "clock_in",
      time: clockIn,
      source: cell.flags.includes("late") ? "web" : "biometric",
      note: cell.flags.includes("late") ? "Late arrival" : undefined,
    },
  ];

  if (breakHours > 0 && clockOut) {
    const inM = parseHm(clockIn) ?? 9 * 60;
    const outM = parseHm(clockOut) ?? 18 * 60;
    const mid = Math.floor((inM + outM) / 2);
    const breakMins = Math.round(breakHours * 60);
    punches.push({
      id: `${idBase}_bs`,
      type: "break_start",
      time: minsToHm(mid),
      source: "web",
    });
    punches.push({
      id: `${idBase}_be`,
      type: "break_end",
      time: minsToHm(mid + breakMins),
      source: "web",
    });
  }

  if (clockOut) {
    punches.push({
      id: `${idBase}_out`,
      type: "clock_out",
      time: clockOut,
      source: cell.flags.includes("early_departure") ? "manual" : "biometric",
      note: cell.flags.includes("early_departure")
        ? "Early departure"
        : cell.flags.includes("overtime")
          ? "Overtime"
          : undefined,
    });
  }

  return punches;
}

function defaultShiftPolicy(employee: Employee, h: number) {
  const warehouse = /warehouse|picker|packer/i.test(employee.designation + employee.department);
  return {
    shift: warehouse ? "Morning" : SHIFTS[h % SHIFTS.length],
    attendancePolicy: warehouse ? "Warehouse Shift Policy" : "Standard Office Policy",
  };
}

/** Build punch/detail payload for a grid cell (seed or override-ready). */
export function buildAttendanceDayDetail(
  employee: Employee,
  year: number,
  month: number,
  day: number,
  cell?: AttendanceDayCell,
): AttendanceDayDetail {
  const date = toYmd(year, month, day);
  const holidays = new Set(HOLIDAYS_BY_YM[ymKey(year, month)] ?? []);
  const base = cell ?? pickStatus(employee.id, year, month, day, holidays);
  const h = hash(`${employee.id}:${date}`);
  const { shift, attendancePolicy } = defaultShiftPolicy(employee, h);
  const id = `att_${employee.id}_${date}`;

  if (
    base.status === "future" ||
    base.status === "day_off" ||
    base.status === "holiday" ||
    base.status === "not_added" ||
    base.status === "absent" ||
    base.status === "on_leave"
  ) {
    const notes =
      base.status === "on_leave"
        ? "Approved leave."
        : base.status === "absent"
          ? "No punch recorded — marked absent."
          : base.status === "holiday"
            ? "Company holiday."
            : base.status === "day_off"
              ? "Weekly day off."
              : base.status === "not_added"
                ? "Attendance not added yet."
                : "Future date.";

    return {
      ...base,
      id,
      employeeId: employee.id,
      employeeName: employee.name,
      employeeCode: employee.employeeCode,
      date,
      shift,
      attendancePolicy,
      clockIn: "",
      clockOut: "",
      breakHours: 0,
      overtimeHours: 0,
      overtimeAmount: 0,
      totalHours: 0,
      notes,
      punches: [],
    };
  }

  const late = base.flags.includes("late");
  const early = base.flags.includes("early_departure");
  const ot = base.flags.includes("overtime");
  const half = base.status === "half_day";

  let clockInMins = 9 * 60 + (late ? 15 + (h % 25) : h % 8);
  if (shift === "Morning") clockInMins = 7 * 60 + (late ? 20 : h % 6);
  if (shift === "Evening") clockInMins = 14 * 60 + (late ? 18 : h % 5);
  if (shift === "Night") clockInMins = 22 * 60 + (late ? 12 : h % 4);

  let clockOutMins = half
    ? clockInMins + 4 * 60 + 5
    : clockInMins + 9 * 60 + (ot ? 60 + (h % 40) : 5);
  if (early) clockOutMins = clockInMins + 7 * 60 + (h % 20);

  const clockIn = minsToHm(clockInMins);
  const clockOut = minsToHm(clockOutMins);
  const breakHours = half ? 0 : 1;
  const totalHours = calcHours(clockIn, clockOut, breakHours);
  const overtimeHours = ot ? Math.max(0, Math.round((totalHours - 8) * 100) / 100) : 0;

  return {
    ...base,
    id,
    employeeId: employee.id,
    employeeName: employee.name,
    employeeCode: employee.employeeCode,
    date,
    shift,
    attendancePolicy,
    clockIn,
    clockOut,
    breakHours,
    overtimeHours,
    overtimeAmount: overtimeHours > 0 ? Math.round(overtimeHours * 600) : 0,
    totalHours,
    notes: half
      ? "Half day."
      : late
        ? "Late by policy grace check."
        : early
          ? "Left before shift end."
          : ot
            ? "Overtime approved."
            : "",
    punches: buildPunches(id, base, clockIn, clockOut, breakHours),
  };
}

export function detailToCell(detail: AttendanceDayDetail): AttendanceDayCell {
  return {
    status: detail.status,
    flags: detail.flags,
    presentCredit: presentCreditFor(detail.status),
  };
}

export function buildFlagsFromForm(input: {
  status: AttendanceDayStatus;
  isLate: boolean;
  isEarly: boolean;
  overtimeHours: number;
}): AttendanceDayFlag[] {
  const flags: AttendanceDayFlag[] = [];
  if (input.status === "present" || input.status === "half_day") {
    if (input.isLate) flags.push("late");
    if (input.isEarly) flags.push("early_departure");
    if (input.overtimeHours > 0) flags.push("overtime");
  }
  return flags;
}

export function createDetailFromForm(input: {
  employee: Employee;
  date: string;
  shift: string;
  attendancePolicy: string;
  clockIn: string;
  clockOut: string;
  breakHours: number;
  status: AttendanceDayStatus;
  notes: string;
  isLate: boolean;
  isEarly: boolean;
}): AttendanceDayDetail {
  const totalHours = calcHours(input.clockIn, input.clockOut, input.breakHours);
  const overtimeHours =
    input.status === "present" && totalHours > 8
      ? Math.round((totalHours - 8) * 100) / 100
      : 0;
  const flags = buildFlagsFromForm({
    status: input.status,
    isLate: input.isLate,
    isEarly: input.isEarly,
    overtimeHours,
  });
  const cell: AttendanceDayCell = {
    status: input.status,
    flags,
    presentCredit: presentCreditFor(input.status),
  };
  const id = `att_${input.employee.id}_${input.date}`;
  return {
    ...cell,
    id,
    employeeId: input.employee.id,
    employeeName: input.employee.name,
    employeeCode: input.employee.employeeCode,
    date: input.date,
    shift: input.shift,
    attendancePolicy: input.attendancePolicy,
    clockIn: input.clockIn,
    clockOut: input.clockOut,
    breakHours: input.breakHours,
    overtimeHours,
    overtimeAmount: overtimeHours > 0 ? Math.round(overtimeHours * 600) : 0,
    totalHours,
    notes: input.notes,
    punches: buildPunches(id, cell, input.clockIn, input.clockOut, input.breakHours),
  };
}

export function buildAttendanceMonthRows(
  year: number,
  month: number,
  overrides: AttendanceOverrideMap = {},
  employees: Employee[] = EMPLOYEES_SEED.filter(
    (e) => e.status !== "terminated" && e.status !== "inactive",
  ),
): AttendanceMonthRow[] {
  const holidays = new Set(HOLIDAYS_BY_YM[ymKey(year, month)] ?? []);
  const workingDays = countWorkingDays(year, month, holidays);
  const n = daysInMonth(year, month);

  return employees.map((employee) => {
    const days: Record<number, AttendanceDayCell> = {};
    let presentTotal = 0;
    for (let day = 1; day <= n; day++) {
      const date = toYmd(year, month, day);
      const key = dayKey(employee.id, date);
      const ov = overrides[key];
      let cell: AttendanceDayCell;
      if (ov === null) {
        cell = { status: "not_added", flags: [], presentCredit: 0 };
      } else if (ov) {
        cell = detailToCell(ov);
      } else {
        cell = pickStatus(employee.id, year, month, day, holidays);
      }
      days[day] = cell;
      presentTotal += cell.presentCredit;
    }
    return { employee, days, presentTotal, workingDays };
  });
}

export function resolveDayDetail(
  employee: Employee,
  year: number,
  month: number,
  day: number,
  overrides: AttendanceOverrideMap,
): AttendanceDayDetail {
  const date = toYmd(year, month, day);
  const key = dayKey(employee.id, date);
  const ov = overrides[key];
  if (ov) return ov;
  if (ov === null) {
    return buildAttendanceDayDetail(employee, year, month, day, {
      status: "not_added",
      flags: [],
      presentCredit: 0,
    });
  }
  return buildAttendanceDayDetail(employee, year, month, day);
}

/**
 * Live (API-backed) grid support — no random seed data. Days without a
 * persisted attendance record simply resolve to future / day_off / not_added
 * with empty punches, instead of `pickStatus`'s fake generator.
 */
export type AttendanceEmployeeLite = {
  id: string;
  name: string;
  employeeCode: string;
  designation: string;
  gender?: Employee["gender"];
  avatarUrl?: string;
};

export type LiveAttendanceMonthRow = {
  employee: AttendanceEmployeeLite;
  days: Record<number, AttendanceDayCell>;
  presentTotal: number;
  workingDays: number;
};

function liveBaseDetail(
  employee: AttendanceEmployeeLite,
  year: number,
  month: number,
  day: number,
): AttendanceDayDetail {
  const date = toYmd(year, month, day);
  const id = `att_${employee.id}_${date}`;
  let status: AttendanceDayStatus = "not_added";
  let notes = "Attendance not added yet.";
  if (isFutureDay(year, month, day)) {
    status = "future";
    notes = "Future date.";
  } else if (isWeekend(year, month, day)) {
    status = "day_off";
    notes = "Weekly day off.";
  }
  return {
    id,
    employeeId: employee.id,
    employeeName: employee.name,
    employeeCode: employee.employeeCode,
    date,
    shift: "",
    attendancePolicy: "",
    clockIn: "",
    clockOut: "",
    breakHours: 0,
    overtimeHours: 0,
    overtimeAmount: 0,
    totalHours: 0,
    notes,
    status,
    flags: [],
    presentCredit: 0,
    punches: [],
  };
}

/** `id` on the returned detail is a real record id unless it starts with `att_` (no record persisted yet). */
export function resolveLiveDayDetail(
  employee: AttendanceEmployeeLite,
  year: number,
  month: number,
  day: number,
  overrides: AttendanceOverrideMap,
): AttendanceDayDetail {
  const date = toYmd(year, month, day);
  const ov = overrides[dayKey(employee.id, date)];
  if (ov) return ov;
  return liveBaseDetail(employee, year, month, day);
}

export function buildLiveMonthRows(
  year: number,
  month: number,
  employees: AttendanceEmployeeLite[],
  overrides: AttendanceOverrideMap,
): LiveAttendanceMonthRow[] {
  const n = daysInMonth(year, month);
  let workingDays = 0;
  for (let day = 1; day <= n; day++) {
    if (!isWeekend(year, month, day)) workingDays += 1;
  }
  return employees.map((employee) => {
    const days: Record<number, AttendanceDayCell> = {};
    let presentTotal = 0;
    for (let day = 1; day <= n; day++) {
      const cell = detailToCell(resolveLiveDayDetail(employee, year, month, day, overrides));
      days[day] = cell;
      presentTotal += cell.presentCredit;
    }
    return { employee, days, presentTotal, workingDays };
  });
}

export const ATTENDANCE_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export const PUNCH_TYPE_LABEL: Record<AttendancePunchType, string> = {
  clock_in: "Clock In",
  break_start: "Break Start",
  break_end: "Break End",
  clock_out: "Clock Out",
};

export const STATUS_LABEL: Record<AttendanceDayStatus, string> = {
  present: "Present",
  absent: "Absent",
  half_day: "Half Day",
  on_leave: "On Leave",
  holiday: "Holiday",
  day_off: "Day Off",
  future: "Future",
  not_added: "Attendance Not Added",
};
