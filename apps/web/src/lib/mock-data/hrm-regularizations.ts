import { EMPLOYEES_SEED, type Employee } from "@/lib/mock-data/employees";

export type RegularizationStatus = "pending" | "approved" | "rejected";

export type AttendanceRegularization = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  /** FK to attendance record (API). */
  attendanceRecordId?: string;
  attendanceRecord: string;
  date: string;
  originalClockIn: string;
  originalClockOut: string;
  requestedClockIn: string;
  requestedClockOut: string;
  reason: string;
  status: RegularizationStatus;
  requestedOn: string;
  approvedAt: string;
};

export const REGULARIZATION_STATUS_LABEL: Record<RegularizationStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

export const REGULARIZATION_STATUS_OPTIONS: { value: RegularizationStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const REASONS = [
  "Was at client site for meeting, could not access office attendance system",
  "Was working from home, forgot to mark attendance on the system",
  "ID card was not working properly at the biometric terminal",
  "Network outage during clock-out; punched later from backup device",
  "Shift handover delayed; clock-out time should reflect overtime",
  "Medical appointment mid-day; requested half-day correction",
  "Travel delay due to traffic; arrived earlier than recorded punch",
  "Biometric face recognition failed; supervisor verified presence",
];

const ACTIVE = EMPLOYEES_SEED.filter((e) => e.status !== "terminated" && e.status !== "inactive");

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function ymd(y: number, m: number, d: number) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function toYmd(d: Date) {
  return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function addDays(d: Date, n: number) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

function hm(h: number, m: number) {
  return `${pad2(h)}:${pad2(m)}`;
}

export function buildRegularizationSeed(now = new Date(2026, 6, 22)): AttendanceRegularization[] {
  const rows: AttendanceRegularization[] = [];
  // Mix of pending / approved / rejected like a real queue (demo screenshot is mostly pending)
  const statusCycle: RegularizationStatus[] = [
    "pending",
    "pending",
    "pending",
    "pending",
    "pending",
    "pending",
    "approved",
    "approved",
    "rejected",
  ];

  for (let i = 0; i < 18; i++) {
    const emp = ACTIVE[i % ACTIVE.length] as Employee;
    const h = hash(`${emp.id}:reg:${i}`);
    const target = addDays(now, 20 + (i % 40)); // future-ish work dates like demo Dec
    // keep weekdays
    while (target.getDay() === 0 || target.getDay() === 6) {
      target.setDate(target.getDate() + 1);
    }
    const requestedOn = addDays(now, -((i % 14) + 1));
    const status = statusCycle[i % statusCycle.length]!;
    const origIn = hm(9, 0);
    const origOut = hm(18, 0);
    const reqIn = hm(8, 30 + (h % 30));
    const reqOut = hm(18, 15 + (h % 50));
    const date = toYmd(target);

    rows.push({
      id: `reg_${pad2(i + 1)}`,
      employeeId: emp.id,
      employeeName: emp.name,
      employeeCode: emp.employeeCode,
      attendanceRecord: `ATT-${date.replaceAll("-", "")}-${emp.employeeCode}`,
      date,
      originalClockIn: origIn,
      originalClockOut: origOut,
      requestedClockIn: reqIn,
      requestedClockOut: reqOut,
      reason: REASONS[h % REASONS.length]!,
      status,
      requestedOn: toYmd(requestedOn),
      approvedAt: status === "approved" ? toYmd(addDays(requestedOn, 1)) : "",
    });
  }

  return rows.sort((a, b) => {
    if (a.status === "pending" && b.status !== "pending") return -1;
    if (b.status === "pending" && a.status !== "pending") return 1;
    return a.date < b.date ? 1 : a.date > b.date ? -1 : a.id.localeCompare(b.id);
  });
}

export const REGULARIZATION_SEED: AttendanceRegularization[] = buildRegularizationSeed();

export function createRegularizationId(existing: AttendanceRegularization[]) {
  let max = 0;
  for (const r of existing) {
    const n = Number(r.id.replace(/\D/g, ""));
    if (n > max) max = n;
  }
  return `reg_${pad2(max + 1)}`;
}

export function todayYmd() {
  const t = new Date();
  return ymd(t.getFullYear(), t.getMonth() + 1, t.getDate());
}
