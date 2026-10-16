"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Ban,
  Calculator,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  Eye,
  Filter,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import {
  PAYROLL_FREQUENCY_LABEL,
  PAYROLL_FREQUENCY_OPTIONS,
  PAYROLL_RUN_STATUS_LABEL,
  PAYROLL_RUN_STATUS_OPTIONS,
  formatPayPeriod,
  formatPayrollDays,
  formatPayrollMoney,
  payrollEntryAvatar,
  type PayrollFrequency,
  type PayrollRun,
  type PayrollRunStatus,
} from "@/lib/mock-data/hrm-payroll-runs";
import {
  apiPayrollEntryToRunEntry,
  apiPayrollRunToUi,
  calculateHrmPayrollRun,
  cancelHrmPayrollRun,
  completeHrmPayrollRun,
  createHrmPayrollRun,
  deleteHrmPayrollRun,
  listHrmPayrollEntries,
  listHrmPayrollRuns,
  updateHrmPayrollRun,
} from "@/lib/api/hrm-payroll";
import { listHrmEmployees } from "@/lib/api/hrm-employees";
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

const GREEN_BTN =
  "rounded-none bg-[#4caf50] text-white hover:bg-[#43a047] border-transparent";

type SortKey = "title" | "payDate" | "employeeCount" | "grossPay" | "netPay" | "status";
type SortDir = "asc" | "desc";

type FormState = {
  title: string;
  frequency: PayrollFrequency;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  notes: string;
};

type EmpOption = { id: string; name: string };

function todayYmd() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function emptyForm(): FormState {
  const d = todayYmd();
  return {
    title: "",
    frequency: "monthly",
    periodStart: d.slice(0, 8) + "01",
    periodEnd: d,
    payDate: d,
    notes: "",
  };
}

function formFromRow(row: PayrollRun): FormState {
  return {
    title: row.title,
    frequency: row.frequency,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    payDate: row.payDate,
    notes: row.notes,
  };
}

function statusBadgeClass(status: PayrollRunStatus) {
  switch (status) {
    case "completed":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "processing":
      return "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300";
    case "cancelled":
      return "border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300";
    default:
      return "border-border bg-muted/40 text-muted-foreground";
  }
}

function frequencyBadgeClass() {
  return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
}

function MetricCard({
  icon,
  label,
  value,
  valueClass,
  barClass,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  valueClass?: string;
  barClass?: string;
}) {
  return (
    <div className="border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex h-8 w-8 items-center justify-center border border-border bg-muted/40 text-muted-foreground">
          {icon}
        </div>
        <span className="text-[11px] text-muted-foreground">{label}</span>
      </div>
      <div className={cn("text-lg font-semibold tabular-nums text-foreground", valueClass)}>
        {value}
      </div>
      <div className={cn("mt-2 h-0.5 w-10", barClass ?? "bg-emerald-500/70")} />
    </div>
  );
}

function PayrollRunDetail({
  row,
  canWrite,
  busy,
  entriesLoading,
  expandedId,
  onToggleExpand,
  onCalculate,
  onComplete,
  onCancel,
  onEdit,
  onClose,
}: {
  row: PayrollRun;
  canWrite: boolean;
  busy: boolean;
  entriesLoading: boolean;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onCalculate: () => void;
  onComplete: () => void;
  onCancel: () => void;
  onEdit: () => void;
  onClose: () => void;
}) {
  const canCalculate = row.status === "draft";
  const canComplete = row.status === "draft" && row.employeeCount > 0;
  const canCancel = row.status === "draft" || row.status === "processing";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">{row.title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatPayPeriod(row.periodStart, row.periodEnd)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canWrite && canComplete ? (
            <Button
              type="button"
              size="sm"
              className={cn("h-8", GREEN_BTN)}
              onClick={onComplete}
              disabled={busy}
            >
              <CheckCircle2 className="size-3.5" />
              Complete
            </Button>
          ) : null}
          {canWrite && canCalculate ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-none"
              onClick={onCalculate}
              disabled={busy}
            >
              <Calculator className="size-3.5" />
              {row.employeeCount > 0 ? "Recalculate" : "Calculate"}
            </Button>
          ) : null}
          {canWrite && row.status === "draft" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-none"
              onClick={onEdit}
              disabled={busy}
            >
              <Pencil className="size-3.5" />
              Edit
            </Button>
          ) : null}
          {canWrite && canCancel ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-none text-red-600 hover:text-red-700"
              onClick={onCancel}
              disabled={busy}
            >
              <Ban className="size-3.5" />
              Cancel
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-none"
            onClick={onClose}
          >
            Back
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-auto p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border border-border bg-emerald-500/10 px-3 py-2.5 text-sm">
          <div className="flex items-center gap-1.5 text-foreground">
            <Calendar className="size-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Pay Period</span>
            <span className="font-medium">
              {row.periodStart} – {row.periodEnd}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-foreground">
            <Clock className="size-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Pay Date</span>
            <span className="font-medium">{row.payDate}</span>
          </div>
          <Badge
            variant="outline"
            className={cn("rounded-none text-[10px]", frequencyBadgeClass())}
          >
            {PAYROLL_FREQUENCY_LABEL[row.frequency]}
          </Badge>
          <Badge
            variant="outline"
            className={cn("ml-auto rounded-none text-[10px]", statusBadgeClass(row.status))}
          >
            {PAYROLL_RUN_STATUS_LABEL[row.status]}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <MetricCard
            icon={<Users className="size-4" />}
            label="Total Employees"
            value={String(row.employeeCount)}
            barClass="bg-emerald-500/70"
          />
          <MetricCard
            icon={<ArrowUpRight className="size-4 text-emerald-600" />}
            label="Gross Pay"
            value={formatPayrollMoney(row.grossPay)}
            valueClass="text-emerald-600 dark:text-emerald-400"
            barClass="bg-emerald-500/70"
          />
          <MetricCard
            icon={<ArrowDownRight className="size-4 text-red-600" />}
            label="Total Deductions"
            value={formatPayrollMoney(row.totalDeductions)}
            valueClass="text-red-600 dark:text-red-400"
            barClass="bg-red-500/70"
          />
          <MetricCard
            icon={<Wallet className="size-4 text-emerald-600" />}
            label="Net Pay"
            value={formatPayrollMoney(row.netPay)}
            barClass="bg-emerald-500/70"
          />
        </div>

        <div>
          <div className="mb-2">
            <h3 className="text-sm font-semibold text-foreground">Employee Payroll Entries</h3>
            <p className="text-xs text-muted-foreground">
              {row.entries.length} employee{row.entries.length === 1 ? "" : "s"} in this payroll run
            </p>
          </div>

          {entriesLoading ? (
            <ContentDataSkeleton
              rows={4}
              showFilters={false}
              label="Loading payroll entries…"
              className="border border-border"
            />
          ) : row.entries.length === 0 ? (
            <div className="border border-border px-3 py-8 text-center text-sm text-muted-foreground">
              No employee entries yet.
              {row.status === "draft" ? " Calculate to generate entries." : null}
            </div>
          ) : (
            <div className="space-y-2">
              {row.entries.map((e) => {
                const open = expandedId === e.id;
                return (
                  <div key={e.id} className="border border-border bg-card">
                    <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                      <div className="flex min-w-[140px] flex-1 items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={payrollEntryAvatar(e.employeeId)}
                          alt=""
                          className="h-9 w-9 rounded-none border border-border object-cover"
                        />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-foreground">
                            {e.employeeName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Basic: {formatPayrollMoney(e.basicSalary)}
                          </div>
                        </div>
                      </div>

                      <div className="grid min-w-0 flex-[2] grid-cols-3 gap-2 sm:grid-cols-6">
                        {(
                          [
                            ["Working Days", formatPayrollDays(e.workingDays), "text-foreground"],
                            [
                              "Present",
                              formatPayrollDays(e.presentDays),
                              "text-emerald-600 dark:text-emerald-400",
                            ],
                            [
                              "LOP",
                              formatPayrollDays(e.lopDays),
                              "text-red-600 dark:text-red-400",
                            ],
                            [
                              "Gross Pay",
                              formatPayrollMoney(e.grossPay),
                              "font-medium text-emerald-600 dark:text-emerald-400",
                            ],
                            [
                              "Deductions",
                              formatPayrollMoney(e.deductions),
                              "font-medium text-red-600 dark:text-red-400",
                            ],
                            [
                              "Net Pay",
                              formatPayrollMoney(e.netPay),
                              "font-medium text-sky-600 dark:text-sky-400",
                            ],
                          ] as const
                        ).map(([label, value, cls]) => (
                          <div key={label} className="min-w-0">
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              {label}
                            </div>
                            <div className={cn("truncate text-xs tabular-nums", cls)}>{value}</div>
                          </div>
                        ))}
                      </div>

                      <div className="ml-auto flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 rounded-none px-2 text-xs"
                          onClick={() => onToggleExpand(e.id)}
                        >
                          Details
                          <ChevronDown
                            className={cn("size-3.5 transition-transform", open && "rotate-180")}
                          />
                        </Button>
                      </div>
                    </div>
                    {open ? (
                      <div className="border-t border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                        <div className="grid gap-1 sm:grid-cols-3">
                          <div>
                            Effective paid ≈{" "}
                            <span className="text-foreground">
                              {formatPayrollDays(Math.max(0, e.workingDays - e.lopDays))}
                            </span>{" "}
                            days
                          </div>
                          <div>
                            Take-home rate{" "}
                            <span className="text-foreground">
                              {e.grossPay > 0
                                ? `${((e.netPay / e.grossPay) * 100).toFixed(1)}%`
                                : "—"}
                            </span>
                          </div>
                          <div>
                            Net = Gross − Deductions →{" "}
                            <span className="font-medium text-sky-600 dark:text-sky-400">
                              {formatPayrollMoney(e.netPay)}
                            </span>
                          </div>
                        </div>
                        {e.notes ? (
                          <div className="mt-1.5">
                            Notes: <span className="text-foreground">{e.notes}</span>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {row.notes ? (
          <div className="border border-border px-3 py-2 text-sm">
            <div className="text-xs text-muted-foreground">Notes</div>
            <div className="mt-0.5 text-foreground">{row.notes}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function HrmPayrollRuns() {
  const canWrite = useAdminCanWrite();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [rows, setRows] = useState<PayrollRun[]>([]);
  const [employees, setEmployees] = useState<EmpOption[]>([]);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"all" | PayrollRunStatus>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | PayrollRunStatus>("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("payDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [viewRow, setViewRow] = useState<PayrollRun | null>(null);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const employeeMap = useMemo(() => new Map(employees.map((e) => [e.id, e.name])), [employees]);
  const employeeName = useCallback(
    (id: string | null | undefined) => (id ? employeeMap.get(id) ?? "—" : "—"),
    [employeeMap],
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, runsRes] = await Promise.all([
        listHrmEmployees({ per_page: 200 }),
        listHrmPayrollRuns({ per_page: 200 }),
      ]);
      setEmployees(empRes.rows.map((e) => ({ id: e.id, name: e.name })));
      setRows(runsRes.rows.map((r) => apiPayrollRunToUi(r)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load payroll runs");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const filtered = useMemo(() => {
    let list = rows;
    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          PAYROLL_FREQUENCY_LABEL[r.frequency].toLowerCase().includes(q) ||
          PAYROLL_RUN_STATUS_LABEL[r.status].toLowerCase().includes(q),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, statusFilter, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "title" || key === "status" ? "asc" : "desc");
    }
  }

  function openAdd() {
    setFormMode("add");
    setEditId(null);
    setForm(emptyForm());
    setFormOpen(true);
  }

  function openEdit(row: PayrollRun) {
    if (row.status !== "draft") {
      toast.error("Only draft runs can be edited");
      return;
    }
    setFormMode("edit");
    setEditId(row.id);
    setForm(formFromRow(row));
    setFormOpen(true);
  }

  async function openView(row: PayrollRun) {
    setViewRow(row);
    setExpandedEntryId(null);
    setEntriesLoading(true);
    try {
      const res = await listHrmPayrollEntries({ payroll_run_id: row.id, per_page: 200 });
      const mappedEntries = res.rows.map((e) => apiPayrollEntryToRunEntry(e, employeeName));
      setViewRow((v) => (v && v.id === row.id ? { ...v, entries: mappedEntries } : v));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load payroll entries");
    } finally {
      setEntriesLoading(false);
    }
  }

  async function saveForm() {
    if (!form.title.trim() || !form.periodStart || !form.periodEnd) {
      toast.error("Title and pay period are required");
      return;
    }
    setSaving(true);
    try {
      const input = {
        title: form.title.trim(),
        frequency: form.frequency,
        periodStart: form.periodStart,
        periodEnd: form.periodEnd,
        payDate: form.payDate || form.periodEnd,
        notes: form.notes.trim(),
      };
      if (formMode === "edit" && editId) {
        const updated = await updateHrmPayrollRun(editId, input);
        const existingEntries = rows.find((r) => r.id === editId)?.entries ?? [];
        const mapped = apiPayrollRunToUi(updated, existingEntries);
        setRows((prev) => prev.map((r) => (r.id === editId ? mapped : r)));
        setViewRow((v) => (v?.id === editId ? mapped : v));
        toast.success("Payroll run updated");
      } else {
        const created = await createHrmPayrollRun(input);
        setRows((prev) => [apiPayrollRunToUi(created, []), ...prev]);
        toast.success("Payroll run created");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function calculateRun(row: PayrollRun) {
    setBusyId(row.id);
    try {
      const updated = await calculateHrmPayrollRun(row.id);
      const entriesRes = await listHrmPayrollEntries({ payroll_run_id: row.id, per_page: 200 });
      const mappedEntries = entriesRes.rows.map((e) => apiPayrollEntryToRunEntry(e, employeeName));
      const mapped = apiPayrollRunToUi(updated, mappedEntries);
      setRows((prev) => prev.map((r) => (r.id === row.id ? mapped : r)));
      setViewRow((v) => (v?.id === row.id ? mapped : v));
      toast.success(
        `Calculated payroll — ${mappedEntries.length} employee entr${mappedEntries.length === 1 ? "y" : "ies"}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Calculate failed");
    } finally {
      setBusyId(null);
    }
  }

  async function completeRun(row: PayrollRun) {
    setBusyId(row.id);
    try {
      const updated = await completeHrmPayrollRun(row.id);
      const mapped = apiPayrollRunToUi(updated, row.entries);
      setRows((prev) => prev.map((r) => (r.id === row.id ? mapped : r)));
      setViewRow((v) => (v?.id === row.id ? mapped : v));
      toast.success(`Payroll run completed: ${row.title}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Complete failed");
    } finally {
      setBusyId(null);
    }
  }

  async function cancelRun(row: PayrollRun) {
    if (!window.confirm(`Cancel payroll run “${row.title}”?`)) return;
    setBusyId(row.id);
    try {
      const updated = await cancelHrmPayrollRun(row.id);
      const mapped = apiPayrollRunToUi(updated, row.entries);
      setRows((prev) => prev.map((r) => (r.id === row.id ? mapped : r)));
      setViewRow((v) => (v?.id === row.id ? mapped : v));
      toast.message(`Payroll run cancelled: ${row.title}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(row: PayrollRun) {
    if (row.status !== "draft") {
      toast.error("Only draft runs can be deleted");
      return;
    }
    if (!window.confirm(`Delete payroll run “${row.title}”?`)) return;
    setBusyId(row.id);
    try {
      await deleteHrmPayrollRun(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setViewRow((v) => (v?.id === row.id ? null : v));
      toast.success("Payroll run deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  function exportCsv() {
    const header = [
      "Title",
      "Frequency",
      "Period Start",
      "Period End",
      "Pay Date",
      "Employees",
      "Gross Pay",
      "Net Pay",
      "Status",
    ];
    const lines = filtered.map((r) =>
      [
        r.title,
        PAYROLL_FREQUENCY_LABEL[r.frequency],
        r.periodStart,
        r.periodEnd,
        r.payDate,
        r.employeeCount,
        r.grossPay,
        r.netPay,
        PAYROLL_RUN_STATUS_LABEL[r.status],
      ].join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "payroll-runs.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported payroll runs");
  }

  const SortHeader = ({ label, col }: { label: string; col: SortKey }) => (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
      onClick={() => toggleSort(col)}
    >
      {label}
      <span className="text-[10px] opacity-60">
        {sortKey === col ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </button>
  );

  const fieldClass =
    "h-9 w-full rounded-none border border-border bg-background px-2 text-sm text-foreground";

  if (loading) {
    return <ContentDataSkeleton label="Loading payroll runs…" />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Payroll Runs</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 rounded-none"
            onClick={exportCsv}
          >
            <Download className="size-3.5" />
            Export
          </Button>
          {canWrite ? (
            <Button type="button" size="sm" className={GREEN_BTN} onClick={openAdd}>
              <Plus className="size-3.5" />
              Add Payroll Run
            </Button>
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
        <Button type="button" size="sm" className={cn("h-9", GREEN_BTN)} onClick={() => setPage(1)}>
          <Search className="size-3.5" />
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
        <div className="rounded-none border border-border bg-card p-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[140px] flex-col gap-1 text-xs text-muted-foreground">
              Status
              <select
                value={draftStatus}
                onChange={(e) => setDraftStatus(e.target.value as "all" | PayrollRunStatus)}
                className={fieldClass}
              >
                <option value="all">All</option>
                {PAYROLL_RUN_STATUS_OPTIONS.map((s) => (
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
                  setDraftStatus("all");
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

      <div className="min-h-0 flex-1 overflow-auto rounded-none border border-border bg-card">
        <table className="w-full min-w-[1200px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60">
            <tr className="border-b border-border text-left">
              <th className="w-12 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                #
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Title" col="title" />
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Frequency
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Pay Period
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Pay Date" col="payDate" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Employees" col="employeeCount" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Gross Pay" col="grossPay" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Net Pay" col="netPay" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Status" col="status" />
              </th>
              <th className="w-[1%] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No payroll runs found.
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => {
                const rowBusy = busyId === row.id;
                return (
                  <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-muted/20">
                    <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                      {(pageSafe - 1) * perPage + idx + 1}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-foreground">{row.title}</td>
                    <td className="px-3 py-2.5">
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-none text-[10px] font-normal",
                          frequencyBadgeClass(),
                        )}
                      >
                        {PAYROLL_FREQUENCY_LABEL[row.frequency]}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-xs sm:text-sm">
                      {formatPayPeriod(row.periodStart, row.periodEnd)}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{row.payDate}</td>
                    <td className="px-3 py-2.5 tabular-nums">{row.employeeCount}</td>
                    <td className="px-3 py-2.5 tabular-nums font-medium text-emerald-700 dark:text-emerald-300">
                      {formatPayrollMoney(row.grossPay)}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums font-medium text-sky-700 dark:text-sky-300">
                      {formatPayrollMoney(row.netPay)}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-none text-[10px] font-normal",
                          statusBadgeClass(row.status),
                        )}
                      >
                        {PAYROLL_RUN_STATUS_LABEL[row.status]}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-none text-sky-600 dark:text-sky-400"
                          onClick={() => void openView(row)}
                          aria-label="View"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {row.status === "draft" && canWrite ? (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-none text-amber-600 dark:text-amber-400"
                              onClick={() => openEdit(row)}
                              aria-label="Edit"
                              disabled={rowBusy}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-none text-emerald-600 dark:text-emerald-400"
                              onClick={() => void calculateRun(row)}
                              aria-label={row.employeeCount > 0 ? "Recalculate" : "Calculate"}
                              title={row.employeeCount > 0 ? "Recalculate" : "Calculate"}
                              disabled={rowBusy}
                            >
                              <Calculator className="h-3.5 w-3.5" />
                            </Button>
                            {row.employeeCount > 0 ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-none text-emerald-600 dark:text-emerald-400"
                                onClick={() => void completeRun(row)}
                                aria-label="Complete"
                                title="Complete"
                                disabled={rowBusy}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-none text-red-600 dark:text-red-400"
                              onClick={() => void cancelRun(row)}
                              aria-label="Cancel"
                              title="Cancel"
                              disabled={rowBusy}
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-none text-red-600 dark:text-red-400"
                              onClick={() => void remove(row)}
                              aria-label="Delete"
                              disabled={rowBusy}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : null}
                        {row.status === "processing" && canWrite ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-none text-red-600 dark:text-red-400"
                            onClick={() => void cancelRun(row)}
                            aria-label="Cancel"
                            title="Cancel"
                            disabled={rowBusy}
                          >
                            <Ban className="h-3.5 w-3.5" />
                          </Button>
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

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Showing{" "}
          {filtered.length === 0 ? 0 : (pageSafe - 1) * perPage + 1}–
          {Math.min(pageSafe * perPage, filtered.length)} of {filtered.length}
        </span>
        <div className="flex items-center gap-1">
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
          <span className="px-2 tabular-nums">
            {pageSafe} / {totalPages}
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

      <Sheet
        open={!!viewRow}
        onOpenChange={(o) => {
          if (!o) {
            setViewRow(null);
            setExpandedEntryId(null);
          }
        }}
      >
        <SheetContent
          side="right"
          resizable
          closeButton="chevron"
          resizeMaxWidth={960}
          className="flex w-[720px] min-w-[320px] max-w-[960px] flex-col gap-0 p-0"
          title="Payroll run details"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Payroll Run Details</SheetTitle>
            <SheetDescription>View payroll run</SheetDescription>
          </SheetHeader>
          {viewRow ? (
            <PayrollRunDetail
              row={viewRow}
              canWrite={canWrite}
              busy={busyId === viewRow.id}
              entriesLoading={entriesLoading}
              expandedId={expandedEntryId}
              onToggleExpand={(id) =>
                setExpandedEntryId((cur) => (cur === id ? null : id))
              }
              onCalculate={() => void calculateRun(viewRow)}
              onComplete={() => void completeRun(viewRow)}
              onCancel={() => void cancelRun(viewRow)}
              onEdit={() => {
                openEdit(viewRow);
                setViewRow(null);
                setExpandedEntryId(null);
              }}
              onClose={() => {
                setViewRow(null);
                setExpandedEntryId(null);
              }}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent
          side="right"
          resizable
          closeButton="chevron"
          className="flex w-[440px] min-w-[160px] max-w-[720px] flex-col gap-0 p-0"
          title={formMode === "edit" ? "Edit Payroll Run" : "Add Payroll Run"}
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base">
              {formMode === "edit" ? "Edit Payroll Run" : "Add Payroll Run"}
            </SheetTitle>
            <SheetDescription className="sr-only">Payroll run form</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-3 overflow-auto p-4">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Title *
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="h-9 rounded-none"
                placeholder="e.g. June Payroll Run"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Frequency
              <select
                value={form.frequency}
                onChange={(e) =>
                  setForm((f) => ({ ...f, frequency: e.target.value as PayrollFrequency }))
                }
                className={fieldClass}
              >
                {PAYROLL_FREQUENCY_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Period Start *
                <Input
                  type="date"
                  value={form.periodStart}
                  onChange={(e) => setForm((f) => ({ ...f, periodStart: e.target.value }))}
                  className="h-9 rounded-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Period End *
                <Input
                  type="date"
                  value={form.periodEnd}
                  onChange={(e) => setForm((f) => ({ ...f, periodEnd: e.target.value }))}
                  className="h-9 rounded-none"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Pay Date *
              <Input
                type="date"
                value={form.payDate}
                onChange={(e) => setForm((f) => ({ ...f, payDate: e.target.value }))}
                className="h-9 rounded-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Notes
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="min-h-[80px] rounded-none"
              />
            </label>
          </div>
          <div className="flex gap-2 border-t border-border p-4">
            <Button
              type="button"
              size="sm"
              className={cn("h-9", GREEN_BTN)}
              onClick={() => void saveForm()}
              disabled={saving}
            >
              {saving ? "Saving…" : formMode === "edit" ? "Save Changes" : "Create Run"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-none"
              onClick={() => setFormOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
