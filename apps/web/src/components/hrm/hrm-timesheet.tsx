"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Download,
  Eye,
  Filter,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { employeeAvatarUrl } from "@/lib/mock-data/employees";
import {
  TIMESHEET_PROJECTS,
  TIMESHEET_STATUS_LABEL,
  TIMESHEET_STATUS_OPTIONS,
  formatHours,
  type TimesheetEntry,
  type TimesheetStatus,
} from "@/lib/mock-data/hrm-timesheet";
import {
  apiTimeEntryToTimesheet,
  approveHrmTimeEntry,
  createHrmTimeEntry,
  deleteHrmTimeEntry,
  listHrmTimeEntries,
  rejectHrmTimeEntry,
  updateHrmTimeEntry,
  type TimeEntryLookups,
} from "@/lib/api/hrm-time-entries";
import { listHrmEmployees, type ApiHrmEmployee } from "@/lib/api/hrm-employees";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateRangePresetPicker } from "@/components/shared/date-range-preset-picker";
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

type SortKey = "date" | "submittedOn" | "hours" | "employeeName";
type SortDir = "asc" | "desc";

type FormState = {
  employeeId: string;
  date: string;
  hours: string;
  project: string;
  description: string;
};

function todayYmd() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function isActiveEmployee(e: ApiHrmEmployee) {
  return e.employee_status !== "terminated" && e.employee_status !== "inactive";
}

function emptyForm(activeEmployees: ApiHrmEmployee[]): FormState {
  return {
    employeeId: activeEmployees[0]?.id ?? "",
    date: todayYmd(),
    hours: "7.50",
    project: TIMESHEET_PROJECTS[0],
    description: "",
  };
}

function formFromRow(row: TimesheetEntry): FormState {
  return {
    employeeId: row.employeeId,
    date: row.date,
    hours: row.hours.toFixed(2),
    project: row.project,
    description: row.description,
  };
}

function buildLookups(employees: ApiHrmEmployee[]): TimeEntryLookups {
  const empById = new Map(employees.map((e) => [e.id, e]));
  return {
    employeeName: (id) => (id ? empById.get(id)?.name ?? "—" : "—"),
    employeeCode: (id) => (id ? empById.get(id)?.employee_code ?? "—" : "—"),
  };
}

function statusBadgeClass(status: TimesheetStatus) {
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

export function HrmTimesheet() {
  const canWrite = useAdminCanWrite();
  const importRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<TimesheetEntry[]>([]);
  const [employees, setEmployees] = useState<ApiHrmEmployee[]>([]);
  const [lookups, setLookups] = useState<TimeEntryLookups | null>(null);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftEmployeeId, setDraftEmployeeId] = useState("all");
  const [draftStatus, setDraftStatus] = useState<"all" | TimesheetStatus>("all");
  const [draftProject, setDraftProject] = useState("all");
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [employeeId, setEmployeeId] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | TimesheetStatus>("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [viewRow, setViewRow] = useState<TimesheetEntry | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    employeeId: "",
    date: todayYmd(),
    hours: "7.50",
    project: TIMESHEET_PROJECTS[0],
    description: "",
  });

  const activeEmployees = useMemo(() => employees.filter(isActiveEmployee), [employees]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, entryRes] = await Promise.all([
        listHrmEmployees({ page: 1, per_page: 200 }),
        listHrmTimeEntries({ page: 1, per_page: 200 }),
      ]);
      const nextLookups = buildLookups(empRes.rows);
      setEmployees(empRes.rows);
      setLookups(nextLookups);
      setRows(entryRes.rows.map((r) => apiTimeEntryToTimesheet(r, nextLookups)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load timesheets");
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
    if (employeeId !== "all") list = list.filter((r) => r.employeeId === employeeId);
    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);
    if (projectFilter !== "all") list = list.filter((r) => r.project === projectFilter);
    if (dateFrom) list = list.filter((r) => r.date >= dateFrom);
    if (dateTo) list = list.filter((r) => r.date <= dateTo);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.employeeName.toLowerCase().includes(q) ||
          r.employeeCode.toLowerCase().includes(q) ||
          r.project.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.date.includes(q),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, employeeId, statusFilter, projectFilter, dateFrom, dateTo, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "employeeName" ? "asc" : "desc");
    }
  }

  function applyFilters() {
    setEmployeeId(draftEmployeeId);
    setStatusFilter(draftStatus);
    setProjectFilter(draftProject);
    setDateFrom(draftFrom);
    setDateTo(draftTo);
    setPage(1);
  }

  function resetFilters() {
    setDraftEmployeeId("all");
    setDraftStatus("all");
    setDraftProject("all");
    setDraftFrom("");
    setDraftTo("");
    setEmployeeId("all");
    setStatusFilter("all");
    setProjectFilter("all");
    setDateFrom("");
    setDateTo("");
    setSearch("");
    setPage(1);
  }

  function openAdd() {
    setFormMode("add");
    setEditId(null);
    setForm(emptyForm(activeEmployees));
    setFormOpen(true);
  }

  function openEdit(row: TimesheetEntry) {
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
    if (!form.date) {
      toast.error("Date is required");
      return;
    }
    const hours = Number(form.hours);
    if (!Number.isFinite(hours) || hours <= 0) {
      toast.error("Enter valid hours");
      return;
    }

    setSaving(true);
    try {
      if (formMode === "edit" && editId) {
        const row = await updateHrmTimeEntry(editId, {
          date: form.date,
          hours,
          project: form.project,
          description: form.description,
        });
        const mapped = apiTimeEntryToTimesheet(row, lookups);
        setRows((prev) => prev.map((r) => (r.id === editId ? mapped : r)));
        setViewRow((v) => (v?.id === editId ? mapped : v));
        toast.success("Timesheet updated");
      } else {
        const row = await createHrmTimeEntry({
          employeeId: form.employeeId,
          date: form.date,
          hours,
          project: form.project,
          description: form.description || undefined,
        });
        const mapped = apiTimeEntryToTimesheet(row, lookups);
        setRows((prev) => [mapped, ...prev]);
        toast.success("Timesheet added");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function approve(row: TimesheetEntry) {
    if (!lookups) return;
    try {
      const updated = await approveHrmTimeEntry(row.id);
      const mapped = apiTimeEntryToTimesheet(updated, lookups);
      setRows((prev) => prev.map((r) => (r.id === row.id ? mapped : r)));
      setViewRow((v) => (v?.id === row.id ? mapped : v));
      toast.success(`Approved — ${row.employeeName}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approve failed");
    }
  }

  async function reject(row: TimesheetEntry) {
    if (!lookups) return;
    try {
      const updated = await rejectHrmTimeEntry(row.id);
      const mapped = apiTimeEntryToTimesheet(updated, lookups);
      setRows((prev) => prev.map((r) => (r.id === row.id ? mapped : r)));
      setViewRow((v) => (v?.id === row.id ? mapped : v));
      toast.message(`Rejected — ${row.employeeName}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reject failed");
    }
  }

  async function remove(row: TimesheetEntry) {
    if (!window.confirm(`Delete timesheet for “${row.employeeName}” on ${row.date}?`)) return;
    try {
      await deleteHrmTimeEntry(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setViewRow((v) => (v?.id === row.id ? null : v));
      toast.success("Timesheet deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  function exportCsv() {
    const header = [
      "Employee",
      "Employee Code",
      "Date",
      "Hours",
      "Project",
      "Status",
      "Submitted On",
      "Approved At",
      "Description",
    ];
    const data = filtered.map((r) => [
      r.employeeName,
      r.employeeCode,
      r.date,
      String(r.hours),
      r.project,
      TIMESHEET_STATUS_LABEL[r.status],
      r.submittedOn,
      r.approvedAt,
      r.description,
    ]);
    downloadCsv(`timesheet-${todayYmd()}.csv`, [header, ...data]);
    toast.success(`Exported ${data.length} rows`);
  }

  function onImportFile(file: File | undefined) {
    if (!file || !lookups) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const lines = text.split(/\r?\n/).filter(Boolean);
      const candidates: {
        employeeId: string;
        date: string;
        hours: number;
        project: string;
        description: string;
      }[] = [];
      // EmployeeCode,Date,Hours,Project,Description
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map((c) => c.replace(/^"|"$/g, "").trim());
        if (cols.length < 4) continue;
        const [code, date, hoursRaw, project, description = ""] = cols;
        const emp = activeEmployees.find((e) => e.employee_code === code || e.name === code);
        const hours = Number(hoursRaw);
        if (!emp || !date || !Number.isFinite(hours)) continue;
        candidates.push({
          employeeId: emp.id,
          date,
          hours,
          project: project || "General",
          description: description || `Imported from ${file.name}`,
        });
      }
      if (!candidates.length) {
        toast.error("No valid rows found");
        return;
      }
      void (async () => {
        const created: TimesheetEntry[] = [];
        let failed = 0;
        for (const c of candidates) {
          try {
            const row = await createHrmTimeEntry(c);
            created.push(apiTimeEntryToTimesheet(row, lookups));
          } catch {
            failed += 1;
          }
        }
        if (created.length) {
          setRows((prev) => [...created, ...prev]);
        }
        if (created.length) {
          toast.success(
            `Imported ${created.length} timesheet${created.length === 1 ? "" : "s"}${failed ? ` (${failed} failed)` : ""}`,
          );
        } else {
          toast.error("Import failed");
        }
      })();
    };
    reader.readAsText(file);
  }

  const SortHeader = ({
    label,
    col,
  }: {
    label: string;
    col: SortKey;
  }) => (
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

  if (loading) {
    return <ContentDataSkeleton label="Loading timesheets…" />;
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
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Timesheet</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="rounded-none" onClick={exportCsv}>
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
              <Button type="button" size="sm" className={GREEN_BTN} onClick={openAdd}>
                <Plus className="size-3.5" />
                Add Timesheet
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
        <div className="rounded-none border border-border bg-card p-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[150px] flex-1 flex-col gap-1 text-xs text-muted-foreground">
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
            <label className="flex min-w-[120px] flex-col gap-1 text-xs text-muted-foreground">
              Status
              <select
                value={draftStatus}
                onChange={(e) => setDraftStatus(e.target.value as "all" | TimesheetStatus)}
                className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="all">All</option>
                {TIMESHEET_STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[140px] flex-col gap-1 text-xs text-muted-foreground">
              Project
              <select
                value={draftProject}
                onChange={(e) => setDraftProject(e.target.value)}
                className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="all">All Projects</option>
                {TIMESHEET_PROJECTS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[130px] flex-col gap-1 text-xs text-muted-foreground">
              Date range
              <DateRangePresetPicker
                value={{ dateFrom: draftFrom, dateTo: draftTo }}
                onChange={(next) => {
                  setDraftFrom(next.dateFrom);
                  setDraftTo(next.dateTo);
                }}
                buttonClassName="h-9"
              />
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
                Reset
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto rounded-none border border-border bg-card">
        <table className="w-full min-w-[920px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60">
            <tr className="border-b border-border text-left">
              <th className="w-12 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                #
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Employee" col="employeeName" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Date" col="date" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Hours" col="hours" />
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Project
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Status
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Submitted On" col="submittedOn" />
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No timesheet entries found.
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => (
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
                      <span className="font-medium text-foreground">{row.employeeName}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-foreground">{row.date}</td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      className="font-medium text-sky-600 hover:underline dark:text-sky-400"
                      onClick={() => setViewRow(row)}
                    >
                      {formatHours(row.hours)}
                    </button>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex rounded-none border border-violet-500/30 bg-violet-500/15 px-2 py-0.5 text-xs font-medium text-violet-800 dark:text-violet-300">
                      {row.project}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={cn(
                        "inline-flex rounded-none border px-2 py-0.5 text-xs font-medium",
                        statusBadgeClass(row.status),
                      )}
                    >
                      {TIMESHEET_STATUS_LABEL[row.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-foreground">{row.submittedOn}</td>
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
              ))
            )}
          </tbody>
        </table>
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

      {/* View sheet */}
      <Sheet open={!!viewRow} onOpenChange={(o) => !o && setViewRow(null)}>
        <SheetContent
          side="right"
          title={viewRow ? `Timesheet — ${viewRow.employeeName}` : "Timesheet"}
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
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Badge
                        className={cn("rounded-none text-[10px] font-normal", statusBadgeClass(viewRow.status))}
                        variant="outline"
                      >
                        {TIMESHEET_STATUS_LABEL[viewRow.status]}
                      </Badge>
                      <span className="inline-flex rounded-none border border-violet-500/30 bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-800 dark:text-violet-300">
                        {viewRow.project}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                <dl className="divide-y divide-border rounded-none border border-border text-sm">
                  {(
                    [
                      ["Date", viewRow.date],
                      ["Hours", formatHours(viewRow.hours)],
                      ["Project", viewRow.project],
                      ["Submitted On", viewRow.submittedOn],
                      ["Approved At", viewRow.approvedAt || "—"],
                      ["Status", TIMESHEET_STATUS_LABEL[viewRow.status]],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="flex items-start justify-between gap-3 px-3 py-2">
                      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
                      <dd className="text-right text-sm">{value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-4 rounded-none border border-border bg-muted/20 px-3 py-2 text-sm">
                  <p className="mb-1 text-xs text-muted-foreground">Description</p>
                  <p>{viewRow.description || "—"}</p>
                </div>
                {viewRow.rejectionReason ? (
                  <div className="mt-3 rounded-none border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                    <p className="mb-0.5 text-xs opacity-80">Rejection reason</p>
                    <p>{viewRow.rejectionReason}</p>
                  </div>
                ) : null}
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

      {/* Add / Edit sheet */}
      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent
          side="right"
          title={formMode === "add" ? "Add Timesheet" : "Edit Timesheet"}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="shrink-0 space-y-1 border-b border-border px-4 py-3 pr-10 text-left">
              <SheetTitle className="text-base">
                {formMode === "add" ? "Add Timesheet" : "Edit Timesheet"}
              </SheetTitle>
              <SheetDescription className="text-xs">
                Workdo Time Entries — employee, date, hours, project, description.
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Employee *
                <select
                  value={form.employeeId}
                  onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                  disabled={formMode === "edit"}
                  className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground disabled:opacity-60"
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
                Date *
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="h-9 rounded-none"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Hours *
                  <Input
                    type="number"
                    min={0.5}
                    max={24}
                    step={0.25}
                    value={form.hours}
                    onChange={(e) => setForm({ ...form, hours: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Project
                  <select
                    value={form.project}
                    onChange={(e) => setForm({ ...form, project: e.target.value })}
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {TIMESHEET_PROJECTS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Description
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="min-h-[100px] rounded-none"
                  placeholder="Work completed…"
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
                disabled={saving || activeEmployees.length === 0}
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
