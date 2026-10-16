"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Ban,
  Check,
  CircleDashed,
  Clock3,
  Download,
  Filter,
  Flag,
  Minus,
  Pencil,
  Plus,
  Search,
  Star,
  Timer,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { employeeAvatarUrl } from "@/lib/mock-data/employees";
import {
  ATTENDANCE_MONTHS,
  ATTENDANCE_STATUS_OPTIONS,
  PUNCH_TYPE_LABEL,
  STATUS_LABEL,
  buildLiveMonthRows,
  calcHours,
  dayKey,
  daysInMonth,
  isWeekend,
  monthName,
  resolveLiveDayDetail,
  toYmd,
  weekdayShort,
  type AttendanceDayCell,
  type AttendanceDayDetail,
  type AttendanceDayFlag,
  type AttendanceDayStatus,
  type AttendanceEmployeeLite,
  type AttendanceOverrideMap,
  type AttendancePunch,
} from "@/lib/mock-data/hrm-attendance-grid";
import {
  createHrmAttendanceRecord,
  deleteHrmAttendanceRecord,
  listHrmAttendanceRecords,
  updateHrmAttendanceRecord,
  ymdFromApi,
  attendanceNum,
  type ApiHrmAttendanceRecord,
} from "@/lib/api/hrm-attendance-records";
import { listHrmEmployees, type ApiHrmEmployee } from "@/lib/api/hrm-employees";
import { listHrmShifts } from "@/lib/api/hrm-shifts";
import { listHrmAttendancePolicies } from "@/lib/api/hrm-attendance-policies";
import { listHrmDesignations } from "@/lib/api/hrm-designations";
import type { HrmShift } from "@/lib/mock-data/hrm-shifts";
import type { AttendancePolicy } from "@/lib/mock-data/hrm-attendance-policies";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const GREEN_BTN =
  "rounded-none bg-[#4caf50] text-white hover:bg-[#43a047] border-transparent";

/** API only persists these five statuses — day_off / future / not_added are derived, not stored. */
const API_STATUS_OPTIONS = ATTENDANCE_STATUS_OPTIONS.filter(
  (o) => o.value !== "day_off" && o.value !== "not_added",
);

/** Records fetched from the API carry a real UUID id; unsaved/derived cells use a synthetic `att_` id. */
function isSyntheticId(id: string) {
  return id.startsWith("att_");
}

type LegendItem = { key: string; label: string; node: ReactNode };

type DayFocus = { employee: AttendanceEmployeeLite; day: number };

type FormState = {
  employeeId: string;
  date: string;
  shiftId: string;
  attendancePolicyId: string;
  clockIn: string;
  clockOut: string;
  breakHours: string;
  status: AttendanceDayStatus;
  isLate: boolean;
  isEarly: boolean;
  notes: string;
};

function emptyForm(
  employees: AttendanceEmployeeLite[],
  shifts: HrmShift[],
  policies: AttendancePolicy[],
  defaults?: Partial<FormState>,
): FormState {
  const now = new Date();
  return {
    employeeId: employees[0]?.id ?? "",
    date: toYmd(now.getFullYear(), now.getMonth() + 1, now.getDate()),
    shiftId: shifts[0]?.id ?? "",
    attendancePolicyId: policies[0]?.id ?? "",
    clockIn: "09:00",
    clockOut: "18:00",
    breakHours: "0",
    status: "present",
    isLate: false,
    isEarly: false,
    notes: "",
    ...defaults,
  };
}

function formFromDetail(
  d: AttendanceDayDetail,
  shifts: HrmShift[],
  policies: AttendancePolicy[],
): FormState {
  const shift = shifts.find((s) => s.name === d.shift);
  const policy = policies.find((p) => p.name === d.attendancePolicy);
  const status: AttendanceDayStatus =
    d.status === "future" || d.status === "day_off" || d.status === "not_added"
      ? "present"
      : d.status;
  return {
    employeeId: d.employeeId,
    date: d.date,
    shiftId: shift?.id ?? shifts[0]?.id ?? "",
    attendancePolicyId: policy?.id ?? policies[0]?.id ?? "",
    clockIn: d.clockIn || "09:00",
    clockOut: d.clockOut || "18:00",
    breakHours: String(d.breakHours ?? 0),
    status,
    isLate: d.flags.includes("late"),
    isEarly: d.flags.includes("early_departure"),
    notes: d.notes,
  };
}

const API_PERSISTED_STATUSES = new Set(["present", "absent", "half_day", "on_leave", "holiday"]);

/** Map an API attendance record into the shared `AttendanceDayDetail` shape used by the grid/sheets. */
function apiRecordToDetail(
  record: ApiHrmAttendanceRecord,
  employee: AttendanceEmployeeLite,
  shiftName: string,
  policyName: string,
): AttendanceDayDetail {
  const status: AttendanceDayStatus = API_PERSISTED_STATUSES.has(record.status)
    ? (record.status as AttendanceDayStatus)
    : "present";
  const flags: AttendanceDayFlag[] = [];
  if (record.is_late) flags.push("late");
  if (record.is_early_departure) flags.push("early_departure");
  const overtimeHours = attendanceNum(record.overtime_hours);
  if (overtimeHours > 0) flags.push("overtime");

  const clockIn = record.clock_in ?? "";
  const clockOut = record.clock_out ?? "";
  const punches: AttendancePunch[] = [];
  if (clockIn) {
    punches.push({
      id: `${record.id}_in`,
      type: "clock_in",
      time: clockIn,
      source: "manual",
      note: flags.includes("late") ? "Late arrival" : undefined,
    });
  }
  if (clockOut) {
    punches.push({
      id: `${record.id}_out`,
      type: "clock_out",
      time: clockOut,
      source: "manual",
      note: flags.includes("early_departure") ? "Early departure" : undefined,
    });
  }

  return {
    id: record.id,
    employeeId: employee.id,
    employeeName: employee.name,
    employeeCode: employee.employeeCode,
    date: ymdFromApi(record.date),
    shift: shiftName,
    attendancePolicy: policyName,
    clockIn,
    clockOut,
    breakHours: attendanceNum(record.break_hours),
    overtimeHours,
    overtimeAmount: attendanceNum(record.overtime_amount),
    totalHours: attendanceNum(record.total_hours),
    notes: record.notes ?? "",
    status,
    flags,
    presentCredit: status === "present" ? 1 : status === "half_day" ? 0.5 : 0,
    punches,
  };
}

async function fetchAllAttendanceRecords(
  dateFrom: string,
  dateTo: string,
): Promise<ApiHrmAttendanceRecord[]> {
  const perPage = 200;
  const first = await listHrmAttendanceRecords({
    date_from: dateFrom,
    date_to: dateTo,
    per_page: perPage,
    page: 1,
  });
  let rows = first.rows;
  const totalPages = Math.ceil(first.total / perPage);
  if (totalPages > 1) {
    const rest = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, i) =>
        listHrmAttendanceRecords({ date_from: dateFrom, date_to: dateTo, per_page: perPage, page: i + 2 }),
      ),
    );
    rows = rows.concat(...rest.map((r) => r.rows));
  }
  return rows;
}

function StatusIcon({ status, className }: { status: AttendanceDayStatus; className?: string }) {
  const c = cn("size-3.5 shrink-0", className);
  switch (status) {
    case "present":
      return <Check className={cn(c, "text-emerald-600")} strokeWidth={3} />;
    case "absent":
      return <X className={cn(c, "text-red-500")} strokeWidth={3} />;
    case "half_day":
      return (
        <span className={cn("text-[11px] font-bold leading-none text-amber-500", className)}>½</span>
      );
    case "on_leave":
      return <Flag className={cn(c, "fill-red-500 text-red-500")} />;
    case "holiday":
      return <Star className={cn(c, "fill-amber-400 text-amber-400")} />;
    case "day_off":
      return <Ban className={cn(c, "text-muted-foreground/70")} />;
    case "future":
      return <Minus className={cn(c, "text-muted-foreground/50")} />;
    case "not_added":
      return <CircleDashed className={cn(c, "text-muted-foreground/60")} />;
    default:
      return null;
  }
}

function FlagIcon({ flag }: { flag: AttendanceDayFlag }) {
  switch (flag) {
    case "late":
      return <Clock3 className="size-3 text-orange-500" />;
    case "early_departure":
      return <ArrowLeft className="size-3 text-rose-400" strokeWidth={3} />;
    case "overtime":
      return <Timer className="size-3 text-sky-500" />;
    default:
      return null;
  }
}

function DayCellIcons({ cell }: { cell: AttendanceDayCell }) {
  return (
    <div className="flex flex-col items-center justify-center gap-0.5 py-0.5">
      <StatusIcon status={cell.status} />
      {cell.flags.length > 0 ? (
        <div className="flex items-center gap-0.5">
          {cell.flags.map((f) => (
            <FlagIcon key={f} flag={f} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

const LEGEND: LegendItem[] = [
  { key: "present", label: "Present", node: <StatusIcon status="present" /> },
  { key: "absent", label: "Absent", node: <StatusIcon status="absent" /> },
  { key: "half_day", label: "Half Day", node: <StatusIcon status="half_day" /> },
  { key: "on_leave", label: "On Leave", node: <StatusIcon status="on_leave" /> },
  { key: "holiday", label: "Holiday", node: <StatusIcon status="holiday" /> },
  { key: "day_off", label: "Day Off", node: <StatusIcon status="day_off" /> },
  { key: "future", label: "Future", node: <StatusIcon status="future" /> },
  { key: "not_added", label: "Attendance Not Added", node: <StatusIcon status="not_added" /> },
  { key: "late", label: "Late", node: <FlagIcon flag="late" /> },
  { key: "early", label: "Early Departure", node: <FlagIcon flag="early_departure" /> },
  { key: "ot", label: "Overtime", node: <FlagIcon flag="overtime" /> },
];

function punchTone(type: AttendancePunch["type"]) {
  switch (type) {
    case "clock_in":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "clock_out":
      return "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300";
    case "break_start":
    case "break_end":
      return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    default:
      return "border-border bg-muted/40";
  }
}

function FieldSelect({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
      {label}
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground disabled:opacity-60"
      >
        {options.length === 0 ? <option value="">None</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function AttendanceFormFields({
  form,
  setForm,
  employees,
  shifts,
  policies,
  lockEmployeeDate,
}: {
  form: FormState;
  setForm: (next: FormState) => void;
  employees: AttendanceEmployeeLite[];
  shifts: HrmShift[];
  policies: AttendancePolicy[];
  lockEmployeeDate?: boolean;
}) {
  const previewHours = calcHours(form.clockIn, form.clockOut);

  return (
    <div className="space-y-3">
      <FieldSelect
        label="Employee *"
        value={form.employeeId}
        disabled={lockEmployeeDate}
        onChange={(employeeId) => setForm({ ...form, employeeId })}
        options={employees.map((e) => ({
          value: e.id,
          label: `${e.name} (${e.employeeCode})`,
        }))}
      />
      <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
        Date *
        <Input
          type="date"
          value={form.date}
          disabled={lockEmployeeDate}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
          className="h-9 rounded-none"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <FieldSelect
          label="Shift"
          value={form.shiftId}
          onChange={(shiftId) => setForm({ ...form, shiftId })}
          options={shifts.map((s) => ({ value: s.id, label: s.name }))}
        />
        <FieldSelect
          label="Attendance Policy"
          value={form.attendancePolicyId}
          onChange={(attendancePolicyId) => setForm({ ...form, attendancePolicyId })}
          options={policies.map((p) => ({ value: p.id, label: p.name }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          Clock In
          <Input
            type="time"
            value={form.clockIn}
            onChange={(e) => setForm({ ...form, clockIn: e.target.value })}
            className="h-9 rounded-none"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          Clock Out
          <Input
            type="time"
            value={form.clockOut}
            onChange={(e) => setForm({ ...form, clockOut: e.target.value })}
            className="h-9 rounded-none"
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          Break Hours
          <Input
            type="number"
            min={0}
            step={0.25}
            value={form.breakHours}
            onChange={(e) => setForm({ ...form, breakHours: e.target.value })}
            className="h-9 rounded-none"
          />
        </label>
        <FieldSelect
          label="Status *"
          value={form.status}
          onChange={(status) => setForm({ ...form, status: status as AttendanceDayStatus })}
          options={API_STATUS_OPTIONS}
        />
      </div>
      <div className="rounded-none border border-border bg-muted/20 px-3 py-2 text-xs">
        <span className="text-muted-foreground">Total hours (auto): </span>
        <span className="font-medium tabular-nums text-foreground">{previewHours.toFixed(2)}</span>
        <span className="ml-2 text-muted-foreground">· break not included</span>
      </div>
      <div className="flex flex-wrap gap-4 text-sm text-foreground">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.isLate}
            onChange={(e) => setForm({ ...form, isLate: e.target.checked })}
            className="rounded-none"
          />
          Is Late
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.isEarly}
            onChange={(e) => setForm({ ...form, isEarly: e.target.checked })}
            className="rounded-none"
          />
          Early Departure
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
        Notes
        <Textarea
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          className="min-h-[80px] rounded-none"
          placeholder="Optional notes…"
        />
      </label>
    </div>
  );
}

function DayDetailSheet({
  open,
  onOpenChange,
  detail,
  employee,
  canWrite,
  onEdit,
  onDelete,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  detail: AttendanceDayDetail | null;
  employee: AttendanceEmployeeLite | null;
  canWrite: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onAdd: () => void;
}) {
  if (!detail || !employee) return null;
  const hasPunches = detail.punches.length > 0;
  const canAdd = isSyntheticId(detail.id);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        title={`Attendance — ${detail.date}`}
        resizable
        resizeMaxWidth={720}
        closeButton="chevron"
        className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
        aria-describedby={undefined}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="shrink-0 border-b border-border px-4 py-3 pr-10">
            <div className="flex items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={employee.avatarUrl ?? employeeAvatarUrl(employee.id, employee.gender)}
                alt=""
                className="size-11 shrink-0 rounded-none border border-border object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold">{employee.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {employee.designation} · {employee.employeeCode}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Badge className="rounded-none text-[10px] font-normal" variant="outline">
                    {STATUS_LABEL[detail.status]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{detail.date}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <dl className="divide-y divide-border rounded-none border border-border text-sm">
              {(
                [
                  ["Shift", detail.shift || "—"],
                  ["Policy", detail.attendancePolicy || "—"],
                  ["Clock In", detail.clockIn || "—"],
                  ["Clock Out", detail.clockOut || "—"],
                  ["Break Hours", String(detail.breakHours)],
                  ["Total Hours", detail.totalHours ? detail.totalHours.toFixed(2) : "—"],
                  ["Overtime Hours", detail.overtimeHours ? detail.overtimeHours.toFixed(2) : "—"],
                  ["OT Amount", detail.overtimeAmount ? `৳ ${detail.overtimeAmount}` : "—"],
                  ["Late", detail.flags.includes("late") ? "Yes" : "No"],
                  ["Early Departure", detail.flags.includes("early_departure") ? "Yes" : "No"],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-3 px-3 py-2">
                  <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
                  <dd className="text-right text-sm">{value}</dd>
                </div>
              ))}
            </dl>

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Punch times
              </h3>
              {hasPunches ? (
                <ol className="relative space-y-0 border-l border-border pl-4">
                  {detail.punches.map((p) => (
                    <li key={p.id} className="relative pb-3 last:pb-0">
                      <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-none border-2 border-background bg-foreground" />
                      <div
                        className={cn(
                          "rounded-none border px-2.5 py-2",
                          punchTone(p.type),
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold">{PUNCH_TYPE_LABEL[p.type]}</span>
                          <span className="font-mono text-sm font-medium tabular-nums">{p.time}</span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-2 text-[11px] opacity-80">
                          <span className="capitalize">{p.source}</span>
                          {p.note ? <span>· {p.note}</span> : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="rounded-none border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                  No punch times for this day.
                </p>
              )}
            </div>

            {detail.notes ? (
              <div className="rounded-none border border-border bg-muted/20 px-3 py-2 text-sm">
                <p className="mb-0.5 text-xs text-muted-foreground">Notes</p>
                <p>{detail.notes}</p>
              </div>
            ) : null}
          </div>

          {canWrite ? (
            <div className="flex shrink-0 flex-wrap gap-2 border-t border-border px-4 py-3">
              {canAdd ? (
                <Button type="button" size="sm" className={cn("flex-1", GREEN_BTN)} onClick={onAdd}>
                  <Plus className="size-3.5" />
                  Add Record
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 rounded-none"
                    onClick={onEdit}
                  >
                    <Pencil className="size-3.5" />
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-none text-destructive hover:text-destructive"
                    onClick={onDelete}
                  >
                    <Trash2 className="size-3.5" />
                    Delete
                  </Button>
                </>
              )}
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function RecordFormSheet({
  open,
  onOpenChange,
  mode,
  form,
  setForm,
  employees,
  shifts,
  policies,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode: "add" | "edit";
  form: FormState;
  setForm: (next: FormState) => void;
  employees: AttendanceEmployeeLite[];
  shifts: HrmShift[];
  policies: AttendancePolicy[];
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        title={mode === "add" ? "Add Attendance Record" : "Edit Attendance Record"}
        resizable
        resizeMaxWidth={720}
        closeButton="chevron"
        className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
        aria-describedby={undefined}
      >
        <div className="flex h-full min-h-0 flex-col">
          <SheetHeader className="shrink-0 space-y-1 border-b border-border px-4 py-3 pr-10 text-left">
            <SheetTitle className="text-base">
              {mode === "add" ? "Add Record" : "Edit Record"}
            </SheetTitle>
            <SheetDescription className="text-xs">
              Punch times auto-build totals; status controls what gets persisted.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <AttendanceFormFields
              form={form}
              setForm={setForm}
              employees={employees}
              shifts={shifts}
              policies={policies}
              lockEmployeeDate={mode === "edit"}
            />
          </div>
          <div className="flex shrink-0 gap-2 border-t border-border px-4 py-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1 rounded-none"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className={cn("flex-1", GREEN_BTN)}
              onClick={onSave}
              disabled={saving || employees.length === 0}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function downloadCsv(filename: string, rows: string[][]) {
  const esc = (v: string) => `"${v.replaceAll('"', '""')}"`;
  const body = rows.map((r) => r.map((c) => esc(c)).join(",")).join("\n");
  const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function HrmAttendanceRecords() {
  const canWrite = useAdminCanWrite();
  const now = new Date();
  const importRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [employees, setEmployees] = useState<AttendanceEmployeeLite[]>([]);
  const [shifts, setShifts] = useState<HrmShift[]>([]);
  const [policies, setPolicies] = useState<AttendancePolicy[]>([]);

  const [draftEmployeeId, setDraftEmployeeId] = useState("all");
  const [draftMonth, setDraftMonth] = useState(now.getMonth() + 1);
  const [draftYear, setDraftYear] = useState(now.getFullYear());
  const [employeeId, setEmployeeId] = useState("all");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);

  const [overrides, setOverrides] = useState<AttendanceOverrideMap>({});
  const [dayFocus, setDayFocus] = useState<DayFocus | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [form, setForm] = useState<FormState>(() => emptyForm([], [], []));

  const years = useMemo(() => {
    const y = new Date().getFullYear();
    return [y - 1, y, y + 1];
  }, []);

  const shiftsById = useMemo(() => new Map(shifts.map((s) => [s.id, s])), [shifts]);
  const policiesById = useMemo(() => new Map(policies.map((p) => [p.id, p])), [policies]);
  const employeesById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const loadMasters = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, shiftRows, policyRows, desigRows] = await Promise.all([
        listHrmEmployees({ page: 1, per_page: 200 }),
        listHrmShifts(),
        listHrmAttendancePolicies(),
        listHrmDesignations(),
      ]);
      const desigMap = new Map(desigRows.map((d) => [String(d.id), String(d.name ?? "")]));
      const activeEmployees: AttendanceEmployeeLite[] = empRes.rows
        .filter(
          (e: ApiHrmEmployee) =>
            e.employee_status !== "terminated" && e.employee_status !== "inactive",
        )
        .map((e) => ({
          id: e.id,
          name: e.name,
          employeeCode: e.employee_code,
          designation: e.designation_id ? desigMap.get(e.designation_id) ?? "" : "",
          avatarUrl: employeeAvatarUrl(e.id),
        }));
      setEmployees(activeEmployees);
      setShifts(shiftRows);
      setPolicies(policyRows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load attendance masters");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMasters();
  }, [loadMasters]);

  const loadMonthRecords = useCallback(async () => {
    setRecordsLoading(true);
    try {
      const dateFrom = toYmd(year, month, 1);
      const dateTo = toYmd(year, month, daysInMonth(year, month));
      const records = await fetchAllAttendanceRecords(dateFrom, dateTo);
      const next: AttendanceOverrideMap = {};
      for (const rec of records) {
        if (!rec.employee_id || !rec.date) continue;
        const emp = employeesById.get(rec.employee_id) ?? {
          id: rec.employee_id,
          name: "Unknown",
          employeeCode: "",
          designation: "",
        };
        const shiftName = rec.shift_id ? shiftsById.get(rec.shift_id)?.name ?? "" : "";
        const policyName = rec.attendance_policy_id
          ? policiesById.get(rec.attendance_policy_id)?.name ?? ""
          : "";
        const key = dayKey(rec.employee_id, ymdFromApi(rec.date));
        next[key] = apiRecordToDetail(rec, emp, shiftName, policyName);
      }
      setOverrides(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load attendance records");
      setOverrides({});
    } finally {
      setRecordsLoading(false);
    }
  }, [year, month, employeesById, shiftsById, policiesById]);

  useEffect(() => {
    if (loading) return;
    void loadMonthRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, loading, employees, shifts, policies]);

  const allRows = useMemo(
    () => buildLiveMonthRows(year, month, employees, overrides),
    [year, month, employees, overrides],
  );

  const filtered = useMemo(() => {
    let rows = allRows;
    if (employeeId !== "all") {
      rows = rows.filter((r) => r.employee.id === employeeId);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          r.employee.name.toLowerCase().includes(q) ||
          r.employee.designation.toLowerCase().includes(q) ||
          r.employee.employeeCode.toLowerCase().includes(q),
      );
    }
    return rows;
  }, [allRows, employeeId, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  const dayCount = daysInMonth(year, month);
  const dayNums = useMemo(() => Array.from({ length: dayCount }, (_, i) => i + 1), [dayCount]);

  const activeDetail = useMemo(() => {
    if (!dayFocus) return null;
    return resolveLiveDayDetail(dayFocus.employee, year, month, dayFocus.day, overrides);
  }, [dayFocus, year, month, overrides]);

  function applyFilters() {
    setEmployeeId(draftEmployeeId);
    setMonth(draftMonth);
    setYear(draftYear);
    setPage(1);
  }

  function resetFilters() {
    const m = now.getMonth() + 1;
    const y = now.getFullYear();
    setDraftEmployeeId("all");
    setDraftMonth(m);
    setDraftYear(y);
    setEmployeeId("all");
    setMonth(m);
    setYear(y);
    setSearch("");
    setPage(1);
  }

  function runSearch() {
    setPage(1);
  }

  function openDay(employee: AttendanceEmployeeLite, day: number) {
    setDayFocus({ employee, day });
    setDetailOpen(true);
  }

  function openAdd(prefill?: Partial<FormState>) {
    setFormMode("add");
    setForm(emptyForm(employees, shifts, policies, prefill));
    setFormOpen(true);
  }

  function openEditFromDetail() {
    if (!activeDetail) return;
    setFormMode("edit");
    setForm(formFromDetail(activeDetail, shifts, policies));
    setDetailOpen(false);
    setFormOpen(true);
  }

  async function saveForm() {
    const emp = employeesById.get(form.employeeId);
    if (!emp) {
      toast.error("Select an employee");
      return;
    }
    if (!form.date) {
      toast.error("Date is required");
      return;
    }

    const useTimes = form.status === "present" || form.status === "half_day";
    const clockIn = useTimes ? form.clockIn : "";
    const clockOut = useTimes ? form.clockOut : "";
    const breakHours = Number(form.breakHours) || 0;
    const totalHours = calcHours(clockIn, clockOut);
    const overtimeHours =
      form.status === "present" && totalHours > 8
        ? Math.round((totalHours - 8) * 100) / 100
        : 0;
    const policy = policiesById.get(form.attendancePolicyId);
    const overtimeAmount =
      overtimeHours > 0
        ? Math.round(overtimeHours * (policy?.overtimeRatePerHour || 600) * 100) / 100
        : 0;
    const [y, m, d] = form.date.split("-").map(Number);
    const weekend = y && m && d ? isWeekend(y, m, d) : false;

    const payload = {
      employeeId: emp.id,
      date: form.date,
      shiftId: form.shiftId || undefined,
      attendancePolicyId: form.attendancePolicyId || undefined,
      clockIn: clockIn || undefined,
      clockOut: clockOut || undefined,
      totalHours,
      breakHours,
      overtimeHours,
      overtimeAmount,
      isLate: useTimes ? form.isLate : false,
      isEarlyDeparture: useTimes ? form.isEarly : false,
      isAbsent: form.status === "absent",
      isHoliday: form.status === "holiday",
      isWeekend: weekend,
      status: form.status,
      notes: form.notes.trim() || undefined,
    };

    const key = dayKey(emp.id, form.date);
    const existingId =
      formMode === "edit" && activeDetail && !isSyntheticId(activeDetail.id)
        ? activeDetail.id
        : null;

    setSaving(true);
    try {
      const saved = existingId
        ? await updateHrmAttendanceRecord(existingId, payload)
        : await createHrmAttendanceRecord(payload);

      const shiftName = saved.shift_id ? shiftsById.get(saved.shift_id)?.name ?? "" : "";
      const policyName = saved.attendance_policy_id
        ? policiesById.get(saved.attendance_policy_id)?.name ?? ""
        : "";
      const detail = apiRecordToDetail(saved, emp, shiftName, policyName);
      setOverrides((prev) => ({ ...prev, [key]: detail }));

      if (y !== year || m !== month) {
        setYear(y);
        setMonth(m);
        setDraftYear(y);
        setDraftMonth(m);
      }

      setFormOpen(false);
      toast.success(existingId ? "Attendance record updated" : "Attendance record added");

      setDayFocus({ employee: emp, day: d });
      setDetailOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteDetail() {
    if (!dayFocus || !activeDetail || isSyntheticId(activeDetail.id)) return;
    try {
      await deleteHrmAttendanceRecord(activeDetail.id);
      const key = dayKey(dayFocus.employee.id, activeDetail.date);
      setOverrides((prev) => ({ ...prev, [key]: null }));
      setDetailOpen(false);
      toast.success("Attendance record deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  function exportMonth() {
    const header = [
      "Employee",
      "Employee Code",
      "Date",
      "Status",
      "Shift",
      "Policy",
      "Clock In",
      "Clock Out",
      "Break Hours",
      "Total Hours",
      "Overtime Hours",
      "Late",
      "Early Departure",
      "Notes",
    ];
    const rows: string[][] = [header];
    for (const row of filtered) {
      for (const day of dayNums) {
        const d = resolveLiveDayDetail(row.employee, year, month, day, overrides);
        if (d.status === "day_off" || d.status === "not_added" || d.status === "future") continue;
        rows.push([
          d.employeeName,
          d.employeeCode,
          d.date,
          STATUS_LABEL[d.status],
          d.shift,
          d.attendancePolicy,
          d.clockIn,
          d.clockOut,
          String(d.breakHours),
          String(d.totalHours),
          String(d.overtimeHours),
          d.flags.includes("late") ? "Yes" : "No",
          d.flags.includes("early_departure") ? "Yes" : "No",
          d.notes,
        ]);
      }
    }
    downloadCsv(`attendance-${year}-${String(month).padStart(2, "0")}.csv`, rows);
    toast.success(`Exported ${rows.length - 1} rows`);
  }

  function onImportFile(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      void (async () => {
        const text = String(reader.result ?? "");
        const lines = text.split(/\r?\n/).filter(Boolean);
        let applied = 0;
        let failed = 0;
        // Expected: EmployeeCode,Date,ClockIn,ClockOut,Status
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(",").map((c) => c.replace(/^"|"$/g, "").trim());
          if (cols.length < 5) continue;
          const [code, date, clockIn, clockOut, statusRaw] = cols;
          const emp = employees.find((e) => e.employeeCode === code || e.name === code);
          if (!emp || !date) continue;
          const statusKey = (statusRaw.toLowerCase().replace(/\s+/g, "_") ||
            "present") as AttendanceDayStatus;
          const status = API_STATUS_OPTIONS.some((s) => s.value === statusKey)
            ? statusKey
            : "present";
          const useTimes = status === "present" || status === "half_day";
          const totalHours = useTimes ? calcHours(clockIn, clockOut, 0) : 0;
          try {
            const saved = await createHrmAttendanceRecord({
              employeeId: emp.id,
              date,
              shiftId: shifts[0]?.id,
              attendancePolicyId: policies[0]?.id,
              clockIn: useTimes ? clockIn : undefined,
              clockOut: useTimes ? clockOut : undefined,
              totalHours,
              breakHours: 0,
              status,
              isAbsent: status === "absent",
              isHoliday: status === "holiday",
              notes: `Imported from ${file.name}`,
            });
            const [y, m] = date.split("-").map(Number);
            if (y === year && m === month) {
              const shiftName = saved.shift_id ? shiftsById.get(saved.shift_id)?.name ?? "" : "";
              const policyName = saved.attendance_policy_id
                ? policiesById.get(saved.attendance_policy_id)?.name ?? ""
                : "";
              const detail = apiRecordToDetail(saved, emp, shiftName, policyName);
              setOverrides((prev) => ({ ...prev, [dayKey(emp.id, date)]: detail }));
            }
            applied += 1;
          } catch {
            failed += 1;
          }
        }
        if (applied) toast.success(`Imported ${applied} record${applied === 1 ? "" : "s"}`);
        if (failed) toast.error(`${failed} row${failed === 1 ? "" : "s"} failed to import`);
        if (!applied && !failed) toast.error("No valid rows found");
      })();
    };
    reader.readAsText(file);
  }

  if (loading) {
    return <ContentDataSkeleton label="Loading attendance records…" />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <input
        ref={importRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          onImportFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Attendance Records</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="rounded-none" onClick={exportMonth}>
            <Download className="size-3.5" />
            Export
          </Button>
          {canWrite ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-none"
                onClick={() => importRef.current?.click()}
              >
                <Upload className="size-3.5" />
                Import
              </Button>
              <Button type="button" size="sm" className={GREEN_BTN} onClick={() => openAdd()}>
                <Plus className="size-3.5" />
                Add Record
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search..."
            className="h-9 rounded-none pl-8"
          />
        </div>
        <Button type="button" size="sm" className={cn("h-9", GREEN_BTN)} onClick={runSearch}>
          Search
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 rounded-none"
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <Filter className="size-3.5" />
          {filtersOpen ? "Hide Filters" : "Show Filters"}
        </Button>
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          Per Page
          <select
            value={perPage}
            onChange={(e) => {
              setPerPage(Number(e.target.value));
              setPage(1);
            }}
            className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
          >
            {[50, 100, 500, 1000].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      {filtersOpen ? (
        <div className="rounded-none border border-border bg-card p-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-xs text-muted-foreground">
              Employee
              <select
                value={draftEmployeeId}
                onChange={(e) => setDraftEmployeeId(e.target.value)}
                className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="all">All Employees</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[120px] flex-col gap-1 text-xs text-muted-foreground">
              Month
              <select
                value={draftMonth}
                onChange={(e) => setDraftMonth(Number(e.target.value))}
                className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
              >
                {ATTENDANCE_MONTHS.map((label, i) => (
                  <option key={label} value={i + 1}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[100px] flex-col gap-1 text-xs text-muted-foreground">
              Year
              <select
                value={draftYear}
                onChange={(e) => setDraftYear(Number(e.target.value))}
                className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" className={cn("h-9", GREEN_BTN)} onClick={applyFilters}>
                Apply Filters
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 rounded-none"
                onClick={resetFilters}
              >
                Reset Filters
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-none border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        {LEGEND.map((item) => (
          <span key={item.key} className="inline-flex items-center gap-1.5">
            <span className="inline-flex size-4 items-center justify-center">{item.node}</span>
            {item.label}
          </span>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-none border border-border bg-card">
        <table className="w-max min-w-full border-collapse text-sm">
          <thead className="sticky top-0 z-20 bg-card">
            <tr className="border-b border-border">
              <th
                rowSpan={2}
                className="sticky left-0 z-30 min-w-[220px] border-r border-border bg-card px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Employee
              </th>
              <th
                colSpan={dayCount}
                className="border-b border-border px-2 py-1.5 text-center text-sm font-semibold text-foreground"
              >
                {monthName(month)} {year}
                {recordsLoading ? " · loading…" : ""}
              </th>
              <th
                rowSpan={2}
                className="sticky right-0 z-30 min-w-[72px] border-l border-border bg-card px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Total
              </th>
            </tr>
            <tr className="border-b border-border">
              {dayNums.map((day) => {
                const weekend = isWeekend(year, month, day);
                return (
                  <th
                    key={day}
                    className={cn(
                      "min-w-[40px] px-0.5 py-1 text-center text-[10px] font-medium leading-tight text-muted-foreground",
                      weekend && "bg-muted/50",
                    )}
                  >
                    <div className="tabular-nums text-foreground">{day}</div>
                    <div>{weekdayShort(year, month, day)}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td
                  colSpan={dayCount + 2}
                  className="px-4 py-10 text-center text-sm text-muted-foreground"
                >
                  {recordsLoading ? "Loading attendance…" : "No attendance rows for this filter."}
                </td>
              </tr>
            ) : (
              pageRows.map((row) => (
                <tr key={row.employee.id} className="border-b border-border last:border-b-0">
                  <td className="sticky left-0 z-10 border-r border-border bg-card px-3 py-2">
                    <div className="flex items-center gap-2.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={row.employee.avatarUrl ?? employeeAvatarUrl(row.employee.id)}
                        alt=""
                        className="size-9 shrink-0 rounded-none border border-border object-cover"
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">
                          {row.employee.name}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {row.employee.designation}
                        </div>
                      </div>
                    </div>
                  </td>
                  {dayNums.map((day) => {
                    const cell = row.days[day];
                    const weekend = isWeekend(year, month, day);
                    return (
                      <td
                        key={day}
                        className={cn(
                          "h-12 min-w-[40px] border-l border-border/60 p-0 text-center align-middle",
                          weekend && "bg-muted/40",
                        )}
                      >
                        <button
                          type="button"
                          className="flex h-full w-full cursor-pointer items-center justify-center hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          title={`${row.employee.name} — ${day} ${monthName(month)} (view punches)`}
                          onClick={() => openDay(row.employee, day)}
                        >
                          {cell ? <DayCellIcons cell={cell} /> : null}
                        </button>
                      </td>
                    );
                  })}
                  <td className="sticky right-0 z-10 border-l border-border bg-card px-2 text-center text-sm font-medium tabular-nums text-foreground">
                    {Number.isInteger(row.presentTotal)
                      ? row.presentTotal
                      : row.presentTotal.toFixed(1)}
                    /{row.workingDays}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > perPage ? (
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <span>
            {(pageSafe - 1) * perPage + 1}–{Math.min(pageSafe * perPage, filtered.length)} of{" "}
            {filtered.length}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-none"
            disabled={pageSafe <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-none"
            disabled={pageSafe >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      ) : null}

      <DayDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        detail={activeDetail}
        employee={dayFocus?.employee ?? null}
        canWrite={canWrite}
        onEdit={openEditFromDetail}
        onDelete={() => void deleteDetail()}
        onAdd={() => {
          if (!dayFocus) return;
          setDetailOpen(false);
          openAdd({
            employeeId: dayFocus.employee.id,
            date: toYmd(year, month, dayFocus.day),
          });
        }}
      />

      <RecordFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        form={form}
        setForm={setForm}
        employees={employees}
        shifts={shifts}
        policies={policies}
        saving={saving}
        onSave={() => void saveForm()}
      />
    </div>
  );
}
