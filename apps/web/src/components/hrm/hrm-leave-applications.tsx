"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Filter,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { employeeAvatarUrl } from "@/lib/mock-data/employees";
import {
  LEAVE_APP_STATUS_LABEL,
  addDays,
  calcLeaveDays,
  leaveTypeVisual,
  monthLabel,
  rangesOverlap,
  startOfWeekMonday,
  toYmd,
  weekDays,
  weekdayShort,
  type LeaveAppStatus,
  type LeaveApplicationRow,
} from "@/lib/mock-data/hrm-leave-applications";
import {
  apiLeaveAppToRow,
  approveHrmLeaveApplication,
  createHrmLeaveApplication,
  deleteHrmLeaveApplication,
  listHrmLeaveApplications,
  rejectHrmLeaveApplication,
  updateHrmLeaveApplication,
  type LeaveAppLookups,
} from "@/lib/api/hrm-leave-applications";
import { listHrmLeaveTypes } from "@/lib/api/hrm-leave-types";
import { listHrmLeavePolicies, type ApiHrmLeavePolicy } from "@/lib/api/hrm-leave-policies";
import { listHrmEmployees, type ApiHrmEmployee } from "@/lib/api/hrm-employees";
import { listHrmDesignations } from "@/lib/api/hrm-designations";
import type { MasterRow } from "@/lib/mock-data/hrm-recruitment-setup";
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

type ListTab = "pending" | "rejected";

type EmpOption = {
  id: string;
  name: string;
  code: string;
  email: string;
  designation: string;
  status: string;
};

type FormState = {
  employeeId: string;
  leaveTypeId: string;
  leavePolicyId: string;
  startDate: string;
  endDate: string;
  reason: string;
  attachment: string;
};

function todayYmd() {
  return toYmd(new Date());
}

function emptyForm(
  employees: EmpOption[],
  leaveTypes: MasterRow[],
  leavePolicies: ApiHrmLeavePolicy[],
): FormState {
  const firstType = leaveTypes[0];
  const firstPolicy = firstType
    ? leavePolicies.find((p) => p.leave_type_id === firstType.id)
    : leavePolicies[0];
  const today = todayYmd();
  return {
    employeeId: employees[0]?.id ?? "",
    leaveTypeId: firstType ? String(firstType.id) : "",
    leavePolicyId: firstPolicy ? firstPolicy.id : "",
    startDate: today,
    endDate: today,
    reason: "",
    attachment: "",
  };
}

function formFromRow(row: LeaveApplicationRow): FormState {
  return {
    employeeId: row.employeeId,
    leaveTypeId: row.leaveTypeId,
    leavePolicyId: row.leavePolicyId,
    startDate: row.startDate,
    endDate: row.endDate,
    reason: row.reason,
    attachment: row.attachment,
  };
}

function statusBadgeClass(status: LeaveAppStatus) {
  switch (status) {
    case "approved":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "rejected":
      return "border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300";
    default:
      return "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300";
  }
}

function downloadCsv(filename: string, rows: string[][]) {
  const esc = (v: string) => `"${String(v).replaceAll('"', '""')}"`;
  const body = rows.map((r) => r.map((c) => esc(c)).join(",")).join("\n");
  const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildLookups(
  employees: ApiHrmEmployee[],
  designations: Map<string, string>,
  leaveTypes: MasterRow[],
  leavePolicies: ApiHrmLeavePolicy[],
): LeaveAppLookups {
  const empById = new Map(employees.map((e) => [e.id, e]));
  const typeById = new Map(leaveTypes.map((t) => [String(t.id), t]));
  const policyById = new Map(leavePolicies.map((p) => [p.id, p]));
  return {
    employeeName: (id) => (id ? empById.get(id)?.name ?? "—" : "—"),
    employeeCode: (id) => (id ? empById.get(id)?.employee_code ?? "" : ""),
    employeeEmail: (id) => (id ? empById.get(id)?.email ?? "" : ""),
    employeeDesignation: (id) => {
      if (!id) return "";
      const desigId = empById.get(id)?.designation_id;
      return desigId ? designations.get(desigId) ?? "" : "";
    },
    leaveTypeName: (id) => (id ? String(typeById.get(id)?.name ?? "—") : "—"),
    leaveTypeIsPaid: (id) => (id ? Boolean(typeById.get(id)?.isPaid) : false),
    leavePolicyName: (id) => (id ? policyById.get(id)?.name ?? "—" : "—"),
  };
}

export function HrmLeaveApplications() {
  const canWrite = useAdminCanWrite();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [rows, setRows] = useState<LeaveApplicationRow[]>([]);
  const [employees, setEmployees] = useState<EmpOption[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<MasterRow[]>([]);
  const [leavePolicies, setLeavePolicies] = useState<ApiHrmLeavePolicy[]>([]);
  const [lookups, setLookups] = useState<LeaveAppLookups | null>(null);

  const today = todayYmd();

  const [anchorMonth, setAnchorMonth] = useState(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(new Date()));
  const [timelineEmployeeId, setTimelineEmployeeId] = useState("all");

  const [listTab, setListTab] = useState<ListTab>("pending");
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftType, setDraftType] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);

  const [viewRow, setViewRow] = useState<LeaveApplicationRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm([], [], []));

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [desigRows, typeRows, policyRows, empRes, appRes] = await Promise.all([
        listHrmDesignations(),
        listHrmLeaveTypes(),
        listHrmLeavePolicies(),
        listHrmEmployees({ page: 1, per_page: 200 }),
        listHrmLeaveApplications({ per_page: 200 }),
      ]);

      const desigMap = new Map(desigRows.map((d) => [String(d.id), String(d.name ?? "")]));
      const nextLookups = buildLookups(empRes.rows, desigMap, typeRows, policyRows);
      const empOptions: EmpOption[] = empRes.rows.map((e) => ({
        id: e.id,
        name: e.name,
        code: e.employee_code,
        email: e.email ?? "",
        designation: e.designation_id ? desigMap.get(e.designation_id) ?? "" : "",
        status: e.employee_status,
      }));

      setEmployees(empOptions);
      setLeaveTypes(typeRows);
      setLeavePolicies(policyRows);
      setLookups(nextLookups);
      setRows(appRes.rows.map((r) => apiLeaveAppToRow(r, nextLookups)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load leave applications");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const activeEmployees = useMemo(
    () => employees.filter((e) => e.status !== "terminated" && e.status !== "inactive"),
    [employees],
  );

  const days = weekDays(weekStart);
  const weekEnd = toYmd(days[6]!);
  const weekStartYmd = toYmd(days[0]!);

  const timelineEmployees = useMemo(() => {
    let list = activeEmployees;
    if (timelineEmployeeId !== "all") {
      list = list.filter((e) => e.id === timelineEmployeeId);
    }
    return list;
  }, [activeEmployees, timelineEmployeeId]);

  const timelineLeaves = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.status !== "rejected" &&
          rangesOverlap(r.startDate, r.endDate, weekStartYmd, weekEnd) &&
          (timelineEmployeeId === "all" || r.employeeId === timelineEmployeeId),
      ),
    [rows, weekStartYmd, weekEnd, timelineEmployeeId],
  );

  const listRows = useMemo(() => {
    let list = rows.filter((r) =>
      listTab === "pending" ? r.status === "pending" : r.status === "rejected",
    );
    if (typeFilter !== "all") list = list.filter((r) => r.leaveTypeId === typeFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.employeeName.toLowerCase().includes(q) ||
          r.employeeEmail.toLowerCase().includes(q) ||
          r.leaveTypeName.toLowerCase().includes(q) ||
          r.reason.toLowerCase().includes(q),
      );
    }
    return list;
  }, [rows, listTab, typeFilter, search]);

  const totalPages = Math.max(1, Math.ceil(listRows.length / perPage));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = listRows.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  const filteredPolicies = useMemo(
    () => leavePolicies.filter((p) => p.leave_type_id === form.leaveTypeId),
    [leavePolicies, form.leaveTypeId],
  );

  const selectedFormLeaveType = useMemo(
    () => leaveTypes.find((t) => String(t.id) === form.leaveTypeId),
    [leaveTypes, form.leaveTypeId],
  );

  function shiftMonth(delta: number) {
    const next = new Date(anchorMonth.getFullYear(), anchorMonth.getMonth() + delta, 1);
    setAnchorMonth(next);
    setWeekStart(startOfWeekMonday(next));
  }

  function shiftWeek(delta: number) {
    const next = addDays(weekStart, delta * 7);
    setWeekStart(next);
    setAnchorMonth(new Date(next.getFullYear(), next.getMonth(), 1));
  }

  function openAdd() {
    setFormMode("add");
    setEditId(null);
    setForm(emptyForm(activeEmployees, leaveTypes, leavePolicies));
    setFormOpen(true);
  }

  function openEdit(row: LeaveApplicationRow) {
    setFormMode("edit");
    setEditId(row.id);
    setForm(formFromRow(row));
    setViewRow(null);
    setFormOpen(true);
  }

  async function saveForm() {
    if (!lookups) {
      toast.error("Still loading — try again");
      return;
    }
    if (!form.employeeId) {
      toast.error("Select an employee");
      return;
    }
    if (!form.leaveTypeId) {
      toast.error("Select a leave type");
      return;
    }
    if (!form.leavePolicyId) {
      toast.error("Select a leave policy");
      return;
    }
    if (!form.startDate || !form.endDate) {
      toast.error("Start and end dates are required");
      return;
    }
    const daysCount = calcLeaveDays(form.startDate, form.endDate);
    if (daysCount <= 0) {
      toast.error("End date must be on or after start date");
      return;
    }

    const input = {
      employeeId: form.employeeId,
      leaveTypeId: form.leaveTypeId,
      leavePolicyId: form.leavePolicyId,
      startDate: form.startDate,
      endDate: form.endDate,
      reason: form.reason.trim(),
      attachment: form.attachment.trim(),
    };

    setSaving(true);
    try {
      if (formMode === "edit" && editId) {
        const updated = await updateHrmLeaveApplication(editId, input);
        const mapped = apiLeaveAppToRow(updated, lookups);
        setRows((prev) => prev.map((r) => (r.id === editId ? mapped : r)));
        setViewRow((v) => (v?.id === editId ? mapped : v));
        toast.success("Leave application updated");
      } else {
        const created = await createHrmLeaveApplication(input);
        const mapped = apiLeaveAppToRow(created, lookups);
        setRows((prev) => [mapped, ...prev]);
        toast.success("Leave application added");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function approve(row: LeaveApplicationRow) {
    try {
      const updated = await approveHrmLeaveApplication(row.id);
      const mapped = lookups ? apiLeaveAppToRow(updated, lookups) : row;
      setRows((prev) => prev.map((r) => (r.id === row.id ? mapped : r)));
      setViewRow((v) => (v?.id === row.id ? mapped : v));
      toast.success(`Approved — ${row.employeeName}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approve failed");
    }
  }

  async function reject(row: LeaveApplicationRow) {
    try {
      const updated = await rejectHrmLeaveApplication(row.id);
      const mapped = lookups ? apiLeaveAppToRow(updated, lookups) : row;
      setRows((prev) => prev.map((r) => (r.id === row.id ? mapped : r)));
      setViewRow((v) => (v?.id === row.id ? mapped : v));
      toast.message(`Rejected — ${row.employeeName}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reject failed");
    }
  }

  async function remove(row: LeaveApplicationRow) {
    if (!window.confirm(`Delete leave application for “${row.employeeName}”?`)) return;
    try {
      await deleteHrmLeaveApplication(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setViewRow((v) => (v?.id === row.id ? null : v));
      toast.success("Leave application deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  function exportCsv() {
    const header = [
      "Employee",
      "Email",
      "Leave Type",
      "Start Date",
      "End Date",
      "Days",
      "Status",
      "Applied On",
      "Paid",
      "Reason",
    ];
    const data = rows.map((r) => [
      r.employeeName,
      r.employeeEmail,
      r.leaveTypeName,
      r.startDate,
      r.endDate,
      String(r.totalDays),
      LEAVE_APP_STATUS_LABEL[r.status],
      r.appliedOn,
      r.isPaid ? "Paid" : "Unpaid",
      r.reason,
    ]);
    downloadCsv(`leave-applications-${today}.csv`, [header, ...data]);
    toast.success(`Exported ${data.length} rows`);
  }

  if (loading) {
    return <ContentDataSkeleton label="Loading leave applications…" />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Leave Applications</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="rounded-none" onClick={exportCsv}>
            <Download className="size-3.5" />
            Export
          </Button>
          {canWrite ? (
            <Button type="button" size="sm" className={GREEN_BTN} onClick={openAdd}>
              <Plus className="size-3.5" />
              Add Leave Application
            </Button>
          ) : null}
        </div>
      </div>

      {/* Month + employee filter */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-none border border-border bg-card px-3 py-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-none"
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[120px] text-center text-sm font-semibold">{monthLabel(anchorMonth)}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-none"
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Employee
          <select
            value={timelineEmployeeId}
            onChange={(e) => setTimelineEmployeeId(e.target.value)}
            className="h-9 min-w-[180px] rounded-none border border-border bg-background px-2 text-sm text-foreground"
          >
            <option value="all">All Employees</option>
            {activeEmployees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-none border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-none bg-teal-500/30 ring-1 ring-inset ring-teal-500/50" />
          Today
        </span>
        {leaveTypes.map((t) => {
          const visual = leaveTypeVisual(String(t.name ?? ""));
          return (
            <span key={String(t.id)} className="inline-flex items-center gap-1.5">
              <span className={cn("size-3 rounded-none border", visual.bg, visual.border)} />
              {visual.label}
            </span>
          );
        })}
      </div>

      {/* Timeline grid */}
      <div className="overflow-auto rounded-none border border-border bg-card">
        <div
          className="grid min-w-[860px]"
          style={{ gridTemplateColumns: `220px repeat(7, minmax(88px, 1fr))` }}
        >
          <div className="sticky left-0 z-20 flex items-center gap-1 border-b border-r border-border bg-muted/50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-none"
              onClick={() => shiftWeek(-1)}
              aria-label="Previous week"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            Employee
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="ml-auto h-6 w-6 rounded-none"
              onClick={() => shiftWeek(1)}
              aria-label="Next week"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
          {days.map((d) => {
            const ymd = toYmd(d);
            const isToday = ymd === today;
            return (
              <div
                key={ymd}
                className={cn(
                  "border-b border-border px-1 py-2 text-center text-xs font-medium",
                  isToday
                    ? "bg-teal-500/15 text-teal-900 dark:text-teal-200"
                    : "bg-muted/40 text-muted-foreground",
                )}
              >
                <div className="tabular-nums text-foreground">{d.getDate()}</div>
                <div>{weekdayShort(d)}</div>
              </div>
            );
          })}

          {timelineEmployees.map((employee) => {
            const leaves = timelineLeaves.filter((l) => l.employeeId === employee.id);
            return (
              <div key={employee.id} className="contents">
                <div className="sticky left-0 z-10 flex items-center gap-2 border-b border-r border-border bg-card px-3 py-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={employeeAvatarUrl(employee.id)}
                    alt=""
                    className="size-8 shrink-0 rounded-none border border-border object-cover"
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{employee.name}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {employee.designation}
                    </div>
                  </div>
                </div>
                <div
                  className="relative col-span-7 min-h-[56px] border-b border-border"
                  style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
                >
                  {days.map((d) => {
                    const ymd = toYmd(d);
                    const isToday = ymd === today;
                    return (
                      <div
                        key={ymd}
                        className={cn(
                          "border-l border-border/60",
                          isToday && "bg-teal-500/10",
                        )}
                      />
                    );
                  })}
                  {leaves.map((leave) => {
                    const startIdx = Math.max(
                      0,
                      days.findIndex((d) => toYmd(d) >= leave.startDate),
                    );
                    let endIdx = -1;
                    for (let i = days.length - 1; i >= 0; i--) {
                      if (toYmd(days[i]!) <= leave.endDate) {
                        endIdx = i;
                        break;
                      }
                    }
                    if (endIdx < startIdx) return null;
                    const meta = leaveTypeVisual(leave.leaveTypeName);
                    const leftPct = (startIdx / 7) * 100;
                    const widthPct = ((endIdx - startIdx + 1) / 7) * 100;
                    return (
                      <button
                        key={leave.id}
                        type="button"
                        className={cn(
                          "absolute top-1.5 bottom-1.5 z-[5] flex flex-col justify-center overflow-hidden rounded-none border px-1.5 py-0.5 text-left",
                          meta.bg,
                          meta.border,
                          meta.color,
                        )}
                        style={{ left: `calc(${leftPct}% + 2px)`, width: `calc(${widthPct}% - 4px)` }}
                        onClick={() => setViewRow(leave)}
                        title={`${meta.label} · ${leave.startDate} → ${leave.endDate}`}
                      >
                        <span className="truncate text-[11px] font-semibold leading-tight">
                          {meta.label}
                        </span>
                        <span className="truncate text-[10px] opacity-80">
                          {leave.isPaid ? "Paid Leave" : "Unpaid Leave"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pending / Rejected list */}
      <div className="rounded-none border border-border bg-card">
        <div className="flex flex-wrap items-center gap-4 border-b border-border px-3">
          {(
            [
              { id: "pending" as const, label: "Pending Leaves" },
              { id: "rejected" as const, label: "Rejected Leaves" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={cn(
                "border-b-2 px-1 py-2.5 text-sm font-medium transition-colors",
                listTab === tab.id
                  ? "border-[#4caf50] text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
              onClick={() => {
                setListTab(tab.id);
                setPage(1);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative min-w-[180px] flex-1">
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
          <Button
            type="button"
            size="sm"
            className={cn("h-9", GREEN_BTN)}
            onClick={() => setPage(1)}
          >
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
            Filters
          </Button>
          <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            Per Page:
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
          <div className="flex flex-wrap items-end gap-3 border-b border-border p-3">
            <label className="flex min-w-[160px] flex-col gap-1 text-xs text-muted-foreground">
              Leave Type
              <select
                value={draftType}
                onChange={(e) => setDraftType(e.target.value)}
                className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="all">All</option>
                {leaveTypes.map((t) => (
                  <option key={String(t.id)} value={String(t.id)}>
                    {String(t.name)}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              size="sm"
              className={cn("h-9", GREEN_BTN)}
              onClick={() => {
                setTypeFilter(draftType);
                setPage(1);
              }}
            >
              Apply Filters
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-none"
              onClick={() => {
                setDraftType("all");
                setTypeFilter("all");
                setSearch("");
                setPage(1);
              }}
            >
              Reset
            </Button>
          </div>
        ) : null}

        <div className="overflow-auto">
          <table className="w-full min-w-[920px] border-collapse text-sm">
            <thead className="bg-muted/50">
              <tr className="border-b border-border text-left">
                <th className="w-12 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  #
                </th>
                <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Employee
                </th>
                <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Leave Type
                </th>
                <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Start Date
                </th>
                <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  End Date
                </th>
                <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Days
                </th>
                <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Status
                </th>
                <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Applied On
                </th>
                <th className="w-[1%] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No {listTab} leave applications.
                  </td>
                </tr>
              ) : (
                pageRows.map((row, idx) => {
                  const meta = leaveTypeVisual(row.leaveTypeName);
                  return (
                    <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-muted/20">
                      <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                        {(pageSafe - 1) * perPage + idx + 1}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={employeeAvatarUrl(row.employeeId)}
                            alt=""
                            className="size-8 shrink-0 rounded-none border border-border object-cover"
                          />
                          <div className="min-w-0">
                            <div className="truncate font-medium">{row.employeeName}</div>
                            <div className="truncate text-xs text-muted-foreground">{row.employeeEmail}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={cn("size-2 rounded-none", meta.bg, "ring-1 ring-inset", meta.border)} />
                          {row.leaveTypeName}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">{row.startDate}</td>
                      <td className="px-3 py-2.5 tabular-nums">{row.endDate}</td>
                      <td className="px-3 py-2.5 tabular-nums">{row.totalDays}</td>
                      <td className="px-3 py-2.5">
                        <Badge
                          variant="outline"
                          className={cn(
                            "rounded-none text-[10px] font-normal",
                            statusBadgeClass(row.status),
                          )}
                        >
                          {LEAVE_APP_STATUS_LABEL[row.status]}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">{row.appliedOn}</td>
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-none"
                            onClick={() => setViewRow(row)}
                            aria-label="View"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {canWrite ? (
                            <>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-none"
                                onClick={() => openEdit(row)}
                                aria-label="Edit"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              {listTab === "pending" ? (
                                <>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 rounded-none text-emerald-600"
                                    onClick={() => void approve(row)}
                                    aria-label="Approve"
                                  >
                                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 rounded-none text-destructive"
                                    onClick={() => void reject(row)}
                                    aria-label="Reject"
                                  >
                                    <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                                  </Button>
                                </>
                              ) : null}
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-none text-destructive"
                                onClick={() => void remove(row)}
                                aria-label="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {listRows.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
            <span>
              Showing {(pageSafe - 1) * perPage + 1}–
              {Math.min(pageSafe * perPage, listRows.length)} of {listRows.length}
            </span>
            <div className="flex items-center gap-2">
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
              <span>
                Page {pageSafe}/{totalPages}
              </span>
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
          </div>
        ) : null}
      </div>

      {/* View sheet */}
      <Sheet open={!!viewRow} onOpenChange={(o) => !o && setViewRow(null)}>
        <SheetContent
          side="right"
          title={viewRow ? `Leave — ${viewRow.employeeName}` : "Leave"}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          {viewRow ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="shrink-0 border-b border-border px-4 py-3 pr-10">
                <div className="flex items-start gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={employeeAvatarUrl(viewRow.employeeId)}
                    alt=""
                    className="size-11 shrink-0 rounded-none border border-border object-cover"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold">{viewRow.employeeName}</p>
                    <p className="text-xs text-muted-foreground">{viewRow.employeeEmail}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-none text-[10px] font-normal",
                          statusBadgeClass(viewRow.status),
                        )}
                      >
                        {LEAVE_APP_STATUS_LABEL[viewRow.status]}
                      </Badge>
                      {(() => {
                        const meta = leaveTypeVisual(viewRow.leaveTypeName);
                        return (
                          <span
                            className={cn(
                              "inline-flex rounded-none border px-2 py-0.5 text-[10px] font-medium",
                              meta.bg,
                              meta.border,
                              meta.color,
                            )}
                          >
                            {viewRow.leaveTypeName}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                <dl className="divide-y divide-border rounded-none border border-border text-sm">
                  {(
                    [
                      ["Leave Policy", viewRow.leavePolicy],
                      ["Start Date", viewRow.startDate],
                      ["End Date", viewRow.endDate],
                      ["Total Days", String(viewRow.totalDays)],
                      ["Paid / Unpaid", viewRow.isPaid ? "Paid Leave" : "Unpaid Leave"],
                      ["Applied On", viewRow.appliedOn],
                      ["Approved At", viewRow.approvedAt || "—"],
                      ["Attachment", viewRow.attachment || "—"],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="flex items-start justify-between gap-3 px-3 py-2">
                      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
                      <dd className="text-right text-sm">{value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="rounded-none border border-border bg-muted/20 px-3 py-2 text-sm">
                  <p className="mb-1 text-xs text-muted-foreground">Reason</p>
                  <p>{viewRow.reason || "—"}</p>
                </div>
              </div>
              {canWrite && viewRow.status === "pending" ? (
                <div className="flex shrink-0 flex-wrap gap-2 border-t border-border px-4 py-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-none"
                    onClick={() => openEdit(viewRow)}
                  >
                    <Pencil className="size-3.5" />
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className={cn("rounded-none", GREEN_BTN)}
                    onClick={() => void approve(viewRow)}
                  >
                    <Check className="size-3.5" />
                    Approve
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-none text-destructive"
                    onClick={() => void reject(viewRow)}
                  >
                    <X className="size-3.5" />
                    Reject
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Form sheet */}
      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent
          side="right"
          title={formMode === "add" ? "Add Leave Application" : "Edit Leave Application"}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="shrink-0 space-y-1 border-b border-border px-4 py-3 pr-10 text-left">
              <SheetTitle className="text-base">
                {formMode === "add" ? "Add Leave Application" : "Edit Leave Application"}
              </SheetTitle>
              <SheetDescription className="text-xs">
                Employee, leave type, policy, dates, reason, attachment.
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Employee *
                <select
                  value={form.employeeId}
                  onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                  className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                >
                  {activeEmployees.length === 0 ? (
                    <option value="">No employees</option>
                  ) : (
                    activeEmployees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Leave Type *
                <select
                  value={form.leaveTypeId}
                  onChange={(e) => {
                    const nextTypeId = e.target.value;
                    const nextPolicy = leavePolicies.find((p) => p.leave_type_id === nextTypeId);
                    setForm({ ...form, leaveTypeId: nextTypeId, leavePolicyId: nextPolicy?.id ?? "" });
                  }}
                  className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                >
                  {leaveTypes.length === 0 ? (
                    <option value="">No leave types</option>
                  ) : (
                    leaveTypes.map((t) => (
                      <option key={String(t.id)} value={String(t.id)}>
                        {String(t.name)}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Leave Policy *
                <select
                  value={form.leavePolicyId}
                  onChange={(e) => setForm({ ...form, leavePolicyId: e.target.value })}
                  className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                >
                  {filteredPolicies.length === 0 ? (
                    <option value="">No policies for this type</option>
                  ) : (
                    filteredPolicies.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Start Date *
                  <Input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  End Date *
                  <Input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-3 rounded-none border border-border bg-muted/20 px-3 py-2 text-xs">
                <span>
                  <span className="text-muted-foreground">Total days (auto): </span>
                  <span className="font-medium tabular-nums">
                    {calcLeaveDays(form.startDate, form.endDate) || "—"}
                  </span>
                </span>
                <span>
                  <span className="text-muted-foreground">Paid: </span>
                  <span className="font-medium">
                    {selectedFormLeaveType?.isPaid ? "Yes" : "No"}
                  </span>
                </span>
              </div>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Attachment
                <Input
                  value={form.attachment}
                  onChange={(e) => setForm({ ...form, attachment: e.target.value })}
                  className="h-9 rounded-none"
                  placeholder="Filename / URL"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Reason
                <Textarea
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  className="min-h-[90px] rounded-none"
                />
              </label>
            </div>
            <div className="flex shrink-0 gap-2 border-t border-border px-4 py-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1 rounded-none"
                onClick={() => setFormOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className={cn("flex-1", GREEN_BTN)}
                onClick={() => void saveForm()}
                disabled={saving || activeEmployees.length === 0 || leaveTypes.length === 0}
              >
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
