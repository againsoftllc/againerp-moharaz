"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleAlert,
  Eye,
  Filter,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { employeeAvatarUrl } from "@/lib/mock-data/employees";
import {
  REGULARIZATION_STATUS_LABEL,
  REGULARIZATION_STATUS_OPTIONS,
  todayYmd,
  type AttendanceRegularization,
  type RegularizationStatus,
} from "@/lib/mock-data/hrm-regularizations";
import {
  apiRegularizationToUi,
  approveHrmAttendanceRegularization,
  createHrmAttendanceRegularization,
  deleteHrmAttendanceRegularization,
  listHrmAttendanceRegularizations,
  rejectHrmAttendanceRegularization,
  updateHrmAttendanceRegularization,
  type RegularizationLookups,
} from "@/lib/api/hrm-attendance-regularizations";
import {
  listHrmAttendanceRecords,
  ymdFromApi,
  type ApiHrmAttendanceRecord,
} from "@/lib/api/hrm-attendance-records";
import { listHrmEmployees, type ApiHrmEmployee } from "@/lib/api/hrm-employees";
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

type FormState = {
  employeeId: string;
  employeeName: string;
  attendanceRecordId: string;
  attendanceRecordLabel: string;
  date: string;
  originalClockIn: string;
  originalClockOut: string;
  requestedClockIn: string;
  requestedClockOut: string;
  reason: string;
  status: RegularizationStatus;
};

function hm(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  return text ? text.slice(0, 5) : "";
}

function recordLabel(rec: ApiHrmAttendanceRecord): string {
  const date = ymdFromApi(rec.date) || "—";
  const clockIn = hm(rec.clock_in) || "--:--";
  const clockOut = hm(rec.clock_out) || "--:--";
  return `${date} • ${clockIn} – ${clockOut}`;
}

function emptyForm(employees: ApiHrmEmployee[]): FormState {
  const first = employees[0];
  return {
    employeeId: first?.id ?? "",
    employeeName: first?.name ?? "",
    attendanceRecordId: "",
    attendanceRecordLabel: "",
    date: todayYmd(),
    originalClockIn: "",
    originalClockOut: "",
    requestedClockIn: "09:00",
    requestedClockOut: "18:00",
    reason: "",
    status: "pending",
  };
}

function formFromRow(row: AttendanceRegularization): FormState {
  return {
    employeeId: row.employeeId,
    employeeName: row.employeeName,
    attendanceRecordId: row.attendanceRecordId ?? "",
    attendanceRecordLabel: row.attendanceRecord,
    date: row.date,
    originalClockIn: row.originalClockIn,
    originalClockOut: row.originalClockOut,
    requestedClockIn: row.requestedClockIn,
    requestedClockOut: row.requestedClockOut,
    reason: row.reason,
    status: row.status,
  };
}

function statusBadgeClass(status: RegularizationStatus) {
  switch (status) {
    case "approved":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "rejected":
      return "border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300";
    default:
      return "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300";
  }
}

function StatCard({
  label,
  value,
  hint,
  hintClass,
  icon,
}: {
  label: string;
  value: number;
  hint: string;
  hintClass?: string;
  icon: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-none border border-border bg-card px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
        <p className={cn("mt-0.5 text-xs", hintClass ?? "text-muted-foreground")}>{hint}</p>
      </div>
      <div className="flex size-10 shrink-0 items-center justify-center rounded-none border border-border bg-muted/40 text-muted-foreground">
        {icon}
      </div>
    </div>
  );
}

export function HrmAttendanceRegularizations() {
  const canWrite = useAdminCanWrite();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<AttendanceRegularization[]>([]);
  const [employees, setEmployees] = useState<ApiHrmEmployee[]>([]);
  const [lookups, setLookups] = useState<RegularizationLookups | null>(null);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftEmployeeId, setDraftEmployeeId] = useState("all");
  const [draftStatus, setDraftStatus] = useState<"all" | RegularizationStatus>("all");
  const [employeeId, setEmployeeId] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | RegularizationStatus>("all");
  const [perPage, setPerPage] = useState(9);
  const [page, setPage] = useState(1);

  const [viewRow, setViewRow] = useState<AttendanceRegularization | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm([]));
  const [formRecords, setFormRecords] = useState<ApiHrmAttendanceRecord[]>([]);
  const [formRecordsLoading, setFormRecordsLoading] = useState(false);

  const activeEmployees = useMemo(
    () =>
      employees.filter(
        (e) => e.employee_status !== "terminated" && e.employee_status !== "inactive",
      ),
    [employees],
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, regRes] = await Promise.all([
        listHrmEmployees({ page: 1, per_page: 200 }),
        listHrmAttendanceRegularizations({ per_page: 200 }),
      ]);
      const byId = new Map(empRes.rows.map((e) => [e.id, e]));
      const nextLookups: RegularizationLookups = {
        employeeName: (id) => (id ? byId.get(id)?.name ?? "—" : "—"),
        employeeCode: (id) => (id ? byId.get(id)?.employee_code ?? "" : ""),
      };
      setEmployees(empRes.rows);
      setLookups(nextLookups);
      setRows(regRes.rows.map((r) => apiRegularizationToUi(r, nextLookups)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load regularizations");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const loadRecordsForEmployee = useCallback(async (empId: string) => {
    if (!empId) {
      setFormRecords([]);
      return;
    }
    setFormRecordsLoading(true);
    try {
      const res = await listHrmAttendanceRecords({ employee_id: empId, per_page: 50 });
      const sorted = [...res.rows].sort((a, b) => ((a.date ?? "") < (b.date ?? "") ? 1 : -1));
      setFormRecords(sorted);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load attendance records");
      setFormRecords([]);
    } finally {
      setFormRecordsLoading(false);
    }
  }, []);

  const stats = useMemo(() => {
    const total = rows.length;
    const pending = rows.filter((r) => r.status === "pending").length;
    const approved = rows.filter((r) => r.status === "approved").length;
    const rejected = rows.filter((r) => r.status === "rejected").length;
    const rate = total ? ((approved / total) * 100).toFixed(1) : "0.0";
    return { total, pending, approved, rejected, rate };
  }, [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (employeeId !== "all") list = list.filter((r) => r.employeeId === employeeId);
    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.employeeName.toLowerCase().includes(q) ||
          r.employeeCode.toLowerCase().includes(q) ||
          r.date.includes(q) ||
          r.reason.toLowerCase().includes(q) ||
          r.attendanceRecord.toLowerCase().includes(q),
      );
    }
    return list;
  }, [rows, employeeId, statusFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  function openAdd() {
    setFormMode("add");
    setEditId(null);
    const initial = emptyForm(activeEmployees);
    setForm(initial);
    setFormRecords([]);
    setFormOpen(true);
    if (initial.employeeId) void loadRecordsForEmployee(initial.employeeId);
  }

  function openEdit(row: AttendanceRegularization) {
    setFormMode("edit");
    setEditId(row.id);
    setForm(formFromRow(row));
    setFormRecords([]);
    setViewRow(null);
    setFormOpen(true);
  }

  function handleFormEmployeeChange(id: string) {
    const emp = activeEmployees.find((e) => e.id === id);
    setForm((f) => ({
      ...f,
      employeeId: id,
      employeeName: emp?.name ?? "",
      attendanceRecordId: "",
      attendanceRecordLabel: "",
      date: "",
      originalClockIn: "",
      originalClockOut: "",
    }));
    setFormRecords([]);
    void loadRecordsForEmployee(id);
  }

  function handleFormRecordChange(recordId: string) {
    const rec = formRecords.find((r) => r.id === recordId);
    setForm((f) => ({
      ...f,
      attendanceRecordId: recordId,
      attendanceRecordLabel: rec ? recordLabel(rec) : "",
      date: rec ? ymdFromApi(rec.date) : f.date,
      originalClockIn: rec ? hm(rec.clock_in) : "",
      originalClockOut: rec ? hm(rec.clock_out) : "",
      requestedClockIn: rec ? hm(rec.clock_in) || f.requestedClockIn : f.requestedClockIn,
      requestedClockOut: rec ? hm(rec.clock_out) || f.requestedClockOut : f.requestedClockOut,
    }));
  }

  async function saveForm() {
    if (!lookups) {
      toast.error("Still loading — try again");
      return;
    }
    if (!form.reason.trim()) {
      toast.error("Reason is required");
      return;
    }

    setSaving(true);
    try {
      if (formMode === "edit" && editId) {
        const apiRow = await updateHrmAttendanceRegularization(editId, {
          requestedClockIn: form.requestedClockIn,
          requestedClockOut: form.requestedClockOut,
          reason: form.reason.trim(),
        });
        const mapped = apiRegularizationToUi(apiRow, lookups);
        setRows((prev) => prev.map((r) => (r.id === editId ? mapped : r)));
        setViewRow((v) => (v?.id === editId ? mapped : v));
        toast.success("Regularization updated");
      } else {
        if (!form.employeeId) {
          toast.error("Select an employee");
          return;
        }
        if (!form.attendanceRecordId) {
          toast.error("Select an attendance record");
          return;
        }
        if (!form.date) {
          toast.error("Date is required");
          return;
        }
        const apiRow = await createHrmAttendanceRegularization({
          employeeId: form.employeeId,
          attendanceRecordId: form.attendanceRecordId,
          date: form.date,
          requestedClockIn: form.requestedClockIn,
          requestedClockOut: form.requestedClockOut,
          reason: form.reason.trim(),
        });
        const mapped = apiRegularizationToUi(apiRow, lookups);
        setRows((prev) => [mapped, ...prev]);
        toast.success("Regularization request added");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function approve(row: AttendanceRegularization) {
    if (!lookups) return;
    try {
      const apiRow = await approveHrmAttendanceRegularization(row.id);
      const mapped = apiRegularizationToUi(apiRow, lookups);
      setRows((prev) => prev.map((r) => (r.id === row.id ? mapped : r)));
      setViewRow((v) => (v?.id === row.id ? mapped : v));
      toast.success(`Approved — ${row.employeeName}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approve failed");
    }
  }

  async function reject(row: AttendanceRegularization) {
    if (!lookups) return;
    try {
      const apiRow = await rejectHrmAttendanceRegularization(row.id);
      const mapped = apiRegularizationToUi(apiRow, lookups);
      setRows((prev) => prev.map((r) => (r.id === row.id ? mapped : r)));
      setViewRow((v) => (v?.id === row.id ? mapped : v));
      toast.message(`Rejected — ${row.employeeName}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reject failed");
    }
  }

  async function remove(row: AttendanceRegularization) {
    if (!window.confirm(`Delete regularization request for "${row.employeeName}"?`)) return;
    try {
      await deleteHrmAttendanceRegularization(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setViewRow((v) => (v?.id === row.id ? null : v));
      toast.success("Request deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  if (loading) {
    return <ContentDataSkeleton label="Loading attendance regularizations…" />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Attendance Regularizations
        </h1>
        {canWrite ? (
          <Button type="button" size="sm" className={GREEN_BTN} onClick={openAdd}>
            <Plus className="size-3.5" />
            Add Request
          </Button>
        ) : null}
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
            {[6, 9, 12, 18, 24].map((n) => (
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
                {activeEmployees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[140px] flex-col gap-1 text-xs text-muted-foreground">
              Status
              <select
                value={draftStatus}
                onChange={(e) => setDraftStatus(e.target.value as "all" | RegularizationStatus)}
                className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="all">All</option>
                {REGULARIZATION_STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                className={cn("h-9", GREEN_BTN)}
                onClick={() => {
                  setEmployeeId(draftEmployeeId);
                  setStatusFilter(draftStatus);
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
                  setDraftEmployeeId("all");
                  setDraftStatus("all");
                  setEmployeeId("all");
                  setStatusFilter("all");
                  setSearch("");
                  setPage(1);
                }}
              >
                Reset
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Requests"
          value={stats.total}
          hint="All time"
          icon={<CalendarDays className="size-5" />}
        />
        <StatCard
          label="Pending"
          value={stats.pending}
          hint="Needs Review"
          hintClass="text-amber-600 dark:text-amber-400"
          icon={<CircleAlert className="size-5 text-amber-500" />}
        />
        <StatCard
          label="Approved"
          value={stats.approved}
          hint={`${stats.rate}% rate`}
          hintClass="text-emerald-600 dark:text-emerald-400"
          icon={<CheckCircle2 className="size-5 text-emerald-500" />}
        />
        <StatCard
          label="Rejected"
          value={stats.rejected}
          hint="Declined"
          hintClass="text-red-600 dark:text-red-400"
          icon={<XCircle className="size-5 text-red-500" />}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {pageRows.length === 0 ? (
          <div className="rounded-none border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
            No regularization requests found.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {pageRows.map((row) => (
              <article
                key={row.id}
                className="flex flex-col rounded-none border border-border bg-card"
              >
                <div className="flex items-start gap-2 border-b border-border px-3 py-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={employeeAvatarUrl(row.employeeId)}
                    alt=""
                    className="size-9 shrink-0 rounded-none border border-border object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {row.employeeName}
                    </p>
                    <p className="text-xs tabular-nums text-muted-foreground">{row.date}</p>
                    <Badge
                      variant="outline"
                      className={cn(
                        "mt-1 rounded-none text-[10px] font-normal",
                        statusBadgeClass(row.status),
                      )}
                    >
                      {REGULARIZATION_STATUS_LABEL[row.status]}
                    </Badge>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
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
                          className="h-7 w-7 rounded-none text-emerald-600 disabled:opacity-40"
                          disabled={row.status === "approved"}
                          onClick={() => void approve(row)}
                          aria-label="Approve"
                        >
                          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-none text-destructive disabled:opacity-40"
                          disabled={row.status === "rejected"}
                          onClick={() => void reject(row)}
                          aria-label="Reject"
                        >
                          <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                        </Button>
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
                </div>

                <div className="flex items-center gap-2 px-3 py-3">
                  <div className="min-w-0 flex-1 rounded-none border border-border bg-muted/20 px-2.5 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Original
                    </p>
                    <p className="mt-1 font-mono text-sm tabular-nums text-red-600 dark:text-red-400">
                      {row.originalClockIn || "—"}
                    </p>
                    <p className="font-mono text-sm tabular-nums text-red-600 dark:text-red-400">
                      {row.originalClockOut || "—"}
                    </p>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1 rounded-none border border-border bg-muted/20 px-2.5 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Requested
                    </p>
                    <p className="mt-1 font-mono text-sm tabular-nums text-emerald-600 dark:text-emerald-400">
                      {row.requestedClockIn || "—"}
                    </p>
                    <p className="font-mono text-sm tabular-nums text-emerald-600 dark:text-emerald-400">
                      {row.requestedClockOut || "—"}
                    </p>
                  </div>
                </div>

                <div className="flex-1 px-3 pb-2">
                  <p className="mb-1 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <MessageSquare className="size-3" />
                    Reason
                  </p>
                  <p className="line-clamp-3 text-xs leading-relaxed text-foreground">{row.reason}</p>
                </div>

                <div className="mt-auto flex items-center gap-1.5 border-t border-border px-3 py-2 text-xs text-muted-foreground">
                  <CalendarDays className="size-3.5" />
                  Requested on : {row.requestedOn || "—"}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {filtered.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Showing {(pageSafe - 1) * perPage + 1}–
            {Math.min(pageSafe * perPage, filtered.length)} of {filtered.length}
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

      {/* View */}
      <Sheet open={!!viewRow} onOpenChange={(o) => !o && setViewRow(null)}>
        <SheetContent
          side="right"
          title={viewRow ? `Regularization — ${viewRow.employeeName}` : "Regularization"}
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
                    <p className="text-xs text-muted-foreground">{viewRow.employeeCode}</p>
                    <Badge
                      variant="outline"
                      className={cn(
                        "mt-1.5 rounded-none text-[10px] font-normal",
                        statusBadgeClass(viewRow.status),
                      )}
                    >
                      {REGULARIZATION_STATUS_LABEL[viewRow.status]}
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                <dl className="divide-y divide-border rounded-none border border-border text-sm">
                  {(
                    [
                      ["Attendance Record", viewRow.attendanceRecord || "—"],
                      ["Date", viewRow.date || "—"],
                      ["Original Clock In", viewRow.originalClockIn || "—"],
                      ["Original Clock Out", viewRow.originalClockOut || "—"],
                      ["Requested Clock In", viewRow.requestedClockIn || "—"],
                      ["Requested Clock Out", viewRow.requestedClockOut || "—"],
                      ["Requested On", viewRow.requestedOn || "—"],
                      ["Approved At", viewRow.approvedAt || "—"],
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
                  <p>{viewRow.reason}</p>
                </div>
              </div>
              {canWrite ? (
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
                    disabled={viewRow.status === "approved"}
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
                    disabled={viewRow.status === "rejected"}
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

      {/* Add / Edit */}
      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent
          side="right"
          title={formMode === "add" ? "Add Regularization" : "Edit Regularization"}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="shrink-0 space-y-1 border-b border-border px-4 py-3 pr-10 text-left">
              <SheetTitle className="text-base">
                {formMode === "add" ? "Add Request" : "Edit Request"}
              </SheetTitle>
              <SheetDescription className="text-xs">
                {formMode === "add"
                  ? "Pick employee, attendance record, requested punches and reason."
                  : "Update requested punches and reason. Use Approve/Reject to change status."}
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {formMode === "add" ? (
                <>
                  <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                    Employee *
                    <select
                      value={form.employeeId}
                      onChange={(e) => handleFormEmployeeChange(e.target.value)}
                      className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                    >
                      {activeEmployees.length === 0 ? (
                        <option value="">No employees</option>
                      ) : (
                        activeEmployees.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name} ({e.employee_code})
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                    Attendance Record *
                    <select
                      value={form.attendanceRecordId}
                      onChange={(e) => handleFormRecordChange(e.target.value)}
                      disabled={formRecordsLoading}
                      className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground disabled:opacity-60"
                    >
                      <option value="">
                        {formRecordsLoading
                          ? "Loading records…"
                          : formRecords.length === 0
                            ? "No records found for this employee"
                            : "Select a record"}
                      </option>
                      {formRecords.map((r) => (
                        <option key={r.id} value={r.id}>
                          {recordLabel(r)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                    Date
                    <Input
                      type="date"
                      value={form.date}
                      disabled
                      className="h-9 rounded-none disabled:opacity-70"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                      Original Clock In
                      <Input
                        type="time"
                        value={form.originalClockIn}
                        disabled
                        className="h-9 rounded-none disabled:opacity-70"
                      />
                    </label>
                    <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                      Original Clock Out
                      <Input
                        type="time"
                        value={form.originalClockOut}
                        disabled
                        className="h-9 rounded-none disabled:opacity-70"
                      />
                    </label>
                  </div>
                </>
              ) : (
                <>
                  <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                    Employee
                    <Input
                      value={form.employeeName}
                      disabled
                      className="h-9 rounded-none disabled:opacity-70"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                    Attendance Record
                    <Input
                      value={form.attendanceRecordLabel || "—"}
                      disabled
                      className="h-9 rounded-none disabled:opacity-70"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                      Date
                      <Input
                        type="date"
                        value={form.date}
                        disabled
                        className="h-9 rounded-none disabled:opacity-70"
                      />
                    </label>
                    <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                      Status
                      <div className="flex h-9 items-center">
                        <Badge
                          variant="outline"
                          className={cn(
                            "rounded-none text-[10px] font-normal",
                            statusBadgeClass(form.status),
                          )}
                        >
                          {REGULARIZATION_STATUS_LABEL[form.status]}
                        </Badge>
                      </div>
                    </label>
                    <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                      Original Clock In
                      <Input
                        type="time"
                        value={form.originalClockIn}
                        disabled
                        className="h-9 rounded-none disabled:opacity-70"
                      />
                    </label>
                    <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                      Original Clock Out
                      <Input
                        type="time"
                        value={form.originalClockOut}
                        disabled
                        className="h-9 rounded-none disabled:opacity-70"
                      />
                    </label>
                  </div>
                </>
              )}
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Requested Clock In *
                  <Input
                    type="time"
                    value={form.requestedClockIn}
                    onChange={(e) => setForm({ ...form, requestedClockIn: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Requested Clock Out *
                  <Input
                    type="time"
                    value={form.requestedClockOut}
                    onChange={(e) => setForm({ ...form, requestedClockOut: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Reason *
                <Textarea
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  className="min-h-[100px] rounded-none"
                  placeholder="Why is this correction needed?"
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
                disabled={saving}
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
