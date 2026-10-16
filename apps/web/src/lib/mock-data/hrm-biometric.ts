import { EMPLOYEES_SEED, type Employee } from "@/lib/mock-data/employees";

export type BiometricPunchStatus = "Clock In" | "Clock Out";
export type BiometricVerifyType = "Fingerprint" | "Face" | "Card" | "Password";
export type BiometricSyncStatus = "synced" | "pending" | "failed";

export type BiometricPunch = {
  id: string;
  time: string; // HH:MM:SS
  status: BiometricPunchStatus;
  verifyType: BiometricVerifyType;
  terminal: string;
};

export type BiometricDayRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  designation: string;
  date: string;
  clockIn: string;
  clockOut: string;
  totalEntries: number;
  punches: BiometricPunch[];
  status: BiometricSyncStatus;
  terminal: string;
};

const TERMINALS = ["ZKTeco-Gate-A", "ZKTeco-Gate-B", "ZKTeco-WH-01", "ZKTeco-HQ-Lobby"] as const;
const VERIFY: BiometricVerifyType[] = ["Fingerprint", "Face", "Card", "Fingerprint"];

const ACTIVE = EMPLOYEES_SEED.filter((e) => e.status !== "terminated" && e.status !== "inactive");

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

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

/** Monday of the week containing `d` (local). */
export function startOfWeekMonday(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = x.getDay(); // 0 Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  x.setDate(x.getDate() + diff);
  return x;
}

export function weekDays(monday: Date) {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

function hmss(h: number, m: number, s: number) {
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

function buildPunches(emp: Employee, date: string): BiometricPunch[] {
  const h = hash(`${emp.id}:${date}:bio`);
  const r = h % 100;
  // Weekend / sparse empty
  const day = parseYmd(date).getDay();
  if (day === 0 || day === 6) {
    if (r > 15) return []; // mostly no punches on weekend
  }

  const late = r > 82;
  const multi = r < 28; // break punches → 4x
  const inH = late ? 9 : 9;
  const inM = late ? 12 + (h % 20) : h % 8;
  const inS = h % 60;
  const outH = multi ? 18 : 18;
  const outM = multi ? 20 + (h % 15) : 25 + (h % 20);
  const terminal = TERMINALS[h % TERMINALS.length]!;
  const verify = VERIFY[h % VERIFY.length]!;

  const punches: BiometricPunch[] = [
    {
      id: `${emp.id}_${date}_in`,
      time: hmss(inH, inM, inS),
      status: "Clock In",
      verifyType: verify,
      terminal,
    },
  ];

  if (multi) {
    punches.push({
      id: `${emp.id}_${date}_bout`,
      time: hmss(13, 0 + (h % 10), h % 40),
      status: "Clock Out",
      verifyType: VERIFY[(h + 1) % VERIFY.length]!,
      terminal,
    });
    punches.push({
      id: `${emp.id}_${date}_bin`,
      time: hmss(13, 45 + (h % 8), (h * 3) % 60),
      status: "Clock In",
      verifyType: VERIFY[(h + 2) % VERIFY.length]!,
      terminal,
    });
  }

  punches.push({
    id: `${emp.id}_${date}_out`,
    time: hmss(outH, outM, (h * 7) % 60),
    status: "Clock Out",
    verifyType: VERIFY[(h + 3) % VERIFY.length]!,
    terminal: TERMINALS[(h + 1) % TERMINALS.length]!,
  });

  return punches;
}

export function buildBiometricRecordsForDate(date: string): BiometricDayRecord[] {
  const rows: BiometricDayRecord[] = [];
  for (const emp of ACTIVE) {
    const punches = buildPunches(emp, date);
    if (punches.length === 0) continue;
    const clockIns = punches.filter((p) => p.status === "Clock In");
    const clockOuts = punches.filter((p) => p.status === "Clock Out");
    const clockIn = clockIns[0]?.time ?? "";
    const clockOut = clockOuts[clockOuts.length - 1]?.time ?? "";
    const h = hash(`${emp.id}:${date}:st`);
    const status: BiometricSyncStatus = h % 17 === 0 ? "pending" : h % 41 === 0 ? "failed" : "synced";

    rows.push({
      id: `bio_${emp.id}_${date}`,
      employeeId: emp.id,
      employeeName: emp.name,
      employeeCode: emp.employeeCode,
      designation: emp.designation,
      date,
      clockIn,
      clockOut,
      totalEntries: punches.length,
      punches,
      status,
      terminal: punches[0]?.terminal ?? TERMINALS[0],
    });
  }
  return rows.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
}

export function monthLabel(d: Date) {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function weekdayShortUpper(d: Date) {
  return d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
}
