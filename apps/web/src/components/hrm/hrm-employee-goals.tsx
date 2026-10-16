"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, Eye, Filter, Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  GOAL_STATUS_LABEL,
  GOAL_STATUS_OPTIONS,
  statusFromProgress,
  type EmployeeGoal,
  type GoalStatus,
} from "@/lib/mock-data/hrm-employee-goals";
import {
  createEmployeeGoalView,
  deleteEmployeeGoalView,
  listEmployeeGoalsView,
  listGoalTypesView,
  listPerformanceEmployeeOptions,
  updateEmployeeGoalView,
  type EmployeeGoalWritePayload,
} from "@/lib/api/hrm-performance";
import type { GoalType } from "@/lib/mock-data/hrm-goal-types";
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

type SortKey =
  | "title"
  | "employeeName"
  | "goalType"
  | "startDate"
  | "endDate"
  | "progress"
  | "status";
type SortDir = "asc" | "desc";

type GoalRow = EmployeeGoal & { goalTypeId?: string };

type EmployeeOption = {
  id: string;
  name: string;
  email: string;
};

type FormState = {
  title: string;
  employeeId: string;
  goalTypeId: string;
  startDate: string;
  endDate: string;
  progress: string;
  status: GoalStatus;
  description: string;
};

function emptyForm(employees: EmployeeOption[] = [], goalTypes: GoalType[] = []): FormState {
  return {
    title: "",
    employeeId: employees[0]?.id ?? "",
    goalTypeId: goalTypes[0]?.id ?? "",
    startDate: `${new Date().getFullYear()}-01-01`,
    endDate: `${new Date().getFullYear()}-12-31`,
    progress: "0",
    status: "not_started",
    description: "",
  };
}

function formFromRow(row: GoalRow): FormState {
  return {
    title: row.title,
    employeeId: row.employeeId,
    goalTypeId: row.goalTypeId ?? "",
    startDate: row.startDate,
    endDate: row.endDate,
    progress: String(row.progress),
    status: row.status,
    description: row.description,
  };
}

function statusBadgeClass(status: GoalStatus) {
  switch (status) {
    case "completed":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "in_progress":
      return "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300";
    default:
      return "border-border bg-muted/40 text-muted-foreground";
  }
}

function ProgressCell({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="flex min-w-[120px] items-center gap-2">
      <div className="h-2 flex-1 rounded-none border border-border bg-muted">
        <div
          className="h-full rounded-none bg-[#4caf50]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {pct}%
      </span>
    </div>
  );
}

export function HrmEmployeeGoals() {
  const canWrite = useAdminCanWrite();
  const [rows, setRows] = useState<GoalRow[]>([]);
  const [employeeOptions, setEmployeeOptions] = useState<EmployeeOption[]>([]);
  const [goalTypeOptions, setGoalTypeOptions] = useState<GoalType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"all" | GoalStatus>("all");
  const [draftType, setDraftType] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | GoalStatus>("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("title");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [viewRow, setViewRow] = useState<GoalRow | null>(null);
  const [progressRow, setProgressRow] = useState<GoalRow | null>(null);
  const [progressValue, setProgressValue] = useState("0");
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [employees, goalTypes, data] = await Promise.all([
          listPerformanceEmployeeOptions(),
          listGoalTypesView(),
          listEmployeeGoalsView(),
        ]);
        if (cancelled) return;
        setEmployeeOptions(employees);
        setGoalTypeOptions(goalTypes);
        setRows(data as GoalRow[]);
        setForm(emptyForm(employees, goalTypes));
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load goals");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    let list = rows;
    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);
    if (typeFilter !== "all") list = list.filter((r) => r.goalTypeId === typeFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.employeeName.toLowerCase().includes(q) ||
          r.goalType.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, statusFilter, typeFilter, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "progress" || key === "startDate" || key === "endDate" ? "desc" : "asc");
    }
  }

  function openAdd() {
    setFormMode("add");
    setEditId(null);
    setForm(emptyForm(employeeOptions, goalTypeOptions));
    setFormOpen(true);
  }

  function openEdit(row: GoalRow) {
    setFormMode("edit");
    setEditId(row.id);
    setForm(formFromRow(row));
    setFormOpen(true);
  }

  function openProgress(row: GoalRow) {
    setProgressRow(row);
    setProgressValue(String(row.progress));
  }

  async function saveForm() {
    const emp = employeeOptions.find((e) => e.id === form.employeeId);
    const goalType = goalTypeOptions.find((t) => t.id === form.goalTypeId);
    if (!emp) {
      toast.error("Select an employee");
      return;
    }
    if (!goalType) {
      toast.error("Select a goal type");
      return;
    }
    if (!form.title.trim() || !form.startDate || !form.endDate) {
      toast.error("Title, start date, and end date are required");
      return;
    }
    let progress = Number(form.progress);
    if (Number.isNaN(progress)) progress = 0;
    progress = Math.max(0, Math.min(100, Math.round(progress)));

    let status = form.status;
    if (form.status === "not_started" && progress > 0) status = statusFromProgress(progress);
    if (progress >= 100) status = "completed";

    const payload: EmployeeGoalWritePayload = {
      title: form.title.trim(),
      employeeId: emp.id,
      goalType: goalType.name,
      goalTypeId: goalType.id,
      startDate: form.startDate,
      endDate: form.endDate,
      progress,
      status,
      description: form.description.trim(),
    };

    setSaving(true);
    try {
      if (formMode === "edit" && editId) {
        const updated = await updateEmployeeGoalView(editId, payload);
        setRows((prev) => prev.map((r) => (r.id === editId ? (updated as GoalRow) : r)));
        setViewRow((v) => (v?.id === editId ? (updated as GoalRow) : v));
        toast.success("Goal updated");
      } else {
        const created = await createEmployeeGoalView(payload);
        setRows((prev) => [created as GoalRow, ...prev]);
        toast.success("Goal created");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveProgress() {
    if (!progressRow) return;
    let progress = Number(progressValue);
    if (Number.isNaN(progress)) {
      toast.error("Enter a valid progress %");
      return;
    }
    progress = Math.max(0, Math.min(100, Math.round(progress)));
    const status = statusFromProgress(progress);

    const payload: EmployeeGoalWritePayload = {
      title: progressRow.title,
      employeeId: progressRow.employeeId,
      goalType: progressRow.goalType,
      goalTypeId: progressRow.goalTypeId ?? "",
      startDate: progressRow.startDate,
      endDate: progressRow.endDate,
      progress,
      status,
      description: progressRow.description,
    };

    setSaving(true);
    try {
      const updated = await updateEmployeeGoalView(progressRow.id, payload);
      setRows((prev) => prev.map((r) => (r.id === progressRow.id ? (updated as GoalRow) : r)));
      setViewRow((v) => (v?.id === progressRow.id ? (updated as GoalRow) : v));
      setProgressRow(null);
      toast.success(`Progress updated — ${progress}%`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: GoalRow) {
    setSaving(true);
    try {
      await deleteEmployeeGoalView(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setViewRow((v) => (v?.id === row.id ? null : v));
      setProgressRow((v) => (v?.id === row.id ? null : v));
      toast.success("Goal deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setSaving(false);
    }
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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Employee Goals</h1>
        {canWrite ? (
          <Button type="button" size="sm" className={GREEN_BTN} onClick={openAdd}>
            <Plus className="size-3.5" />
            Add Goal
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
            <label className="flex min-w-[160px] flex-col gap-1 text-xs text-muted-foreground">
              Goal Type
              <select
                value={draftType}
                onChange={(e) => setDraftType(e.target.value)}
                className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="all">All</option>
                {goalTypeOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[140px] flex-col gap-1 text-xs text-muted-foreground">
              Status
              <select
                value={draftStatus}
                onChange={(e) => setDraftStatus(e.target.value as "all" | GoalStatus)}
                className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="all">All</option>
                {GOAL_STATUS_OPTIONS.map((s) => (
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
                  setTypeFilter(draftType);
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
                  setDraftType("all");
                  setDraftStatus("all");
                  setTypeFilter("all");
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
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60">
            <tr className="border-b border-border text-left">
              <th className="w-12 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                #
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Title" col="title" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Employee" col="employeeName" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Goal Type" col="goalType" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Start Date" col="startDate" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="End Date" col="endDate" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Progress" col="progress" />
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
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Loading goals...
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No goals found.
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => (
                <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-muted/20">
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                    {(pageSafe - 1) * perPage + idx + 1}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-foreground">{row.title}</td>
                  <td className="px-3 py-2.5">{row.employeeName}</td>
                  <td className="px-3 py-2.5">{row.goalType}</td>
                  <td className="px-3 py-2.5 tabular-nums">{row.startDate}</td>
                  <td className="px-3 py-2.5 tabular-nums">{row.endDate}</td>
                  <td className="px-3 py-2.5">
                    <ProgressCell value={row.progress} />
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-none text-[10px] font-normal",
                        statusBadgeClass(row.status),
                      )}
                    >
                      {GOAL_STATUS_LABEL[row.status]}
                    </Badge>
                  </td>
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
                            className="h-7 w-7 rounded-none text-amber-600"
                            onClick={() => openEdit(row)}
                            aria-label="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-none text-emerald-600"
                            onClick={() => openProgress(row)}
                            aria-label="Update progress"
                          >
                            <BarChart3 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-none text-destructive"
                            onClick={() => remove(row)}
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

      {/* View */}
      <Sheet open={!!viewRow} onOpenChange={(o) => !o && setViewRow(null)}>
        <SheetContent
          side="right"
          title={viewRow ? `Goal — ${viewRow.title}` : "Goal"}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          {viewRow ? (
            <div className="flex h-full min-h-0 flex-col" data-view="hrm-employee-goal-workdo">
              <div className="shrink-0 border-b border-border px-4 py-4 pr-10">
                <p className="text-base font-semibold leading-snug">{viewRow.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{viewRow.employeeName}</p>
                <Badge
                  variant="outline"
                  className={cn(
                    "mt-2 rounded-none text-[10px] font-normal",
                    statusBadgeClass(viewRow.status),
                  )}
                >
                  {GOAL_STATUS_LABEL[viewRow.status]}
                </Badge>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
                <div className="rounded-none border border-border bg-muted/20 px-3 py-3">
                  <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                    Progress
                  </p>
                  <ProgressCell value={viewRow.progress} />
                </div>

                <dl className="divide-y divide-border rounded-none border border-border text-sm">
                  {(
                    [
                      ["Title", viewRow.title],
                      ["Employee", viewRow.employeeName],
                      ["Goal Type", viewRow.goalType],
                      ["Start Date", viewRow.startDate],
                      ["End Date", viewRow.endDate],
                      ["Progress", `${viewRow.progress}%`],
                      ["Status", GOAL_STATUS_LABEL[viewRow.status]],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="flex items-start justify-between gap-3 px-3 py-2.5">
                      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
                      <dd className="max-w-[62%] text-right text-sm text-foreground">{value}</dd>
                    </div>
                  ))}
                </dl>

                <div className="rounded-none border border-border bg-muted/20 px-3 py-3">
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Description
                  </p>
                  <p className="text-sm leading-relaxed text-foreground">
                    {viewRow.description || "—"}
                  </p>
                </div>
              </div>

              {canWrite ? (
                <div className="flex shrink-0 flex-wrap gap-2 border-t border-border px-4 py-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-none"
                    onClick={() => {
                      setViewRow(null);
                      openEdit(viewRow);
                    }}
                  >
                    <Pencil className="size-3.5" />
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className={cn("rounded-none", GREEN_BTN)}
                    onClick={() => {
                      setViewRow(null);
                      openProgress(viewRow);
                    }}
                  >
                    <BarChart3 className="size-3.5" />
                    Progress
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Progress */}
      <Sheet open={!!progressRow} onOpenChange={(o) => !o && setProgressRow(null)}>
        <SheetContent
          side="right"
          title={progressRow ? `Progress — ${progressRow.title}` : "Progress"}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          {progressRow ? (
            <div className="flex h-full min-h-0 flex-col">
              <SheetHeader className="shrink-0 space-y-1 border-b border-border px-4 py-3 pr-10 text-left">
                <SheetTitle className="text-base">Update Progress</SheetTitle>
                <SheetDescription className="text-xs">
                  {progressRow.employeeName} · {progressRow.title}
                </SheetDescription>
              </SheetHeader>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
                <ProgressCell value={Number(progressValue) || 0} />
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Progress %
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={progressValue}
                    onChange={(e) => setProgressValue(e.target.value)}
                    className="h-9 rounded-none"
                  />
                </label>
              </div>
              <div className="flex shrink-0 gap-2 border-t border-border px-4 py-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1 rounded-none"
                  onClick={() => setProgressRow(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className={cn("flex-1", GREEN_BTN)}
                  onClick={() => void saveProgress()}
                  disabled={saving}
                >
                  Save
                </Button>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Create / Edit */}
      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent
          side="right"
          title={formMode === "add" ? "Add Goal" : "Edit Goal"}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="shrink-0 space-y-1 border-b border-border px-4 py-3 pr-10 text-left">
              <SheetTitle className="text-base">
                {formMode === "add" ? "Add Goal" : "Edit Goal"}
              </SheetTitle>
              <SheetDescription className="text-xs">
                Workdo fields — title, employee, goal type, dates, progress, status.
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Title *
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="h-9 rounded-none"
                  placeholder="Implement Process Improvement"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Employee *
                <select
                  value={form.employeeId}
                  onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                  className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                >
                  {employeeOptions.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Goal Type *
                <select
                  value={form.goalTypeId}
                  onChange={(e) => setForm({ ...form, goalTypeId: e.target.value })}
                  className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                >
                  {goalTypeOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                  {goalTypeOptions.some((t) => t.id === form.goalTypeId)
                    ? null
                    : form.goalTypeId && (
                        <option value={form.goalTypeId}>Unknown type</option>
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
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Progress %
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={form.progress}
                    onChange={(e) => setForm({ ...form, progress: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Status
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as GoalStatus })}
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {GOAL_STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
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
                Save
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
