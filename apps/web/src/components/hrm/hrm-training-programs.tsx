"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, Filter, Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  ENROLLMENT_FLAG_LABEL,
  ENROLLMENT_FLAG_OPTIONS,
  PROGRAM_STATUS_LABEL,
  PROGRAM_STATUS_OPTIONS,
  formatProgramCost,
  formatProgramDuration,
  type EnrollmentFlag,
  type ProgramStatus,
  type TrainingProgram,
} from "@/lib/mock-data/hrm-training-programs";
import {
  createTrainingProgramView,
  deleteTrainingProgramView,
  listTrainingProgramsView,
  listTrainingTypeOptions,
  updateTrainingProgramView,
  type TrainingProgramWritePayload,
  type TrainingTypeOption,
} from "@/lib/api/hrm-training";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  | "name"
  | "status"
  | "durationHours"
  | "cost"
  | "capacity"
  | "sessions"
  | "employeesEnrolled";
type SortDir = "asc" | "desc";

type ProgramRow = TrainingProgram & { trainingTypeId?: string };

type FormState = {
  name: string;
  trainingTypeId: string;
  status: ProgramStatus;
  durationHours: string;
  cost: string;
  capacity: string;
  enrollmentType: EnrollmentFlag;
};

function emptyForm(typeOptions: TrainingTypeOption[] = []): FormState {
  return {
    name: "",
    trainingTypeId: typeOptions[0]?.id ?? "",
    status: "draft",
    durationHours: "8",
    cost: "0",
    capacity: "20",
    enrollmentType: "self_enrollment",
  };
}

function formFromRow(row: ProgramRow): FormState {
  return {
    name: row.name,
    trainingTypeId: row.trainingTypeId ?? "",
    status: row.status,
    durationHours: String(row.durationHours),
    cost: String(row.cost),
    capacity: String(row.capacity),
    enrollmentType: row.enrollmentType,
  };
}

function statusBadgeClass(status: ProgramStatus) {
  switch (status) {
    case "active":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "completed":
      return "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300";
    default:
      return "border-border bg-muted/40 text-muted-foreground";
  }
}

function flagBadgeClass(flag: EnrollmentFlag) {
  return flag === "mandatory"
    ? "border-rose-500/30 bg-rose-500/15 text-rose-800 dark:text-rose-300"
    : "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300";
}

export function HrmTrainingPrograms() {
  const canWrite = useAdminCanWrite();
  const [rows, setRows] = useState<ProgramRow[]>([]);
  const [typeOptions, setTypeOptions] = useState<TrainingTypeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"all" | ProgramStatus>("all");
  const [draftFlag, setDraftFlag] = useState<"all" | EnrollmentFlag>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | ProgramStatus>("all");
  const [flagFilter, setFlagFilter] = useState<"all" | EnrollmentFlag>("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [viewRow, setViewRow] = useState<ProgramRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [types, data] = await Promise.all([
          listTrainingTypeOptions(),
          listTrainingProgramsView(),
        ]);
        if (cancelled) return;
        setTypeOptions(types);
        setRows(data as ProgramRow[]);
        setForm(emptyForm(types));
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load programs");
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
    if (flagFilter !== "all") list = list.filter((r) => r.enrollmentType === flagFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q) ||
          PROGRAM_STATUS_LABEL[r.status].toLowerCase().includes(q) ||
          ENROLLMENT_FLAG_LABEL[r.enrollmentType].toLowerCase().includes(q),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, statusFilter, flagFilter, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "name" || key === "status" ? "asc" : "desc");
    }
  }

  function openAdd() {
    setFormMode("add");
    setEditId(null);
    setForm(emptyForm(typeOptions));
    setFormOpen(true);
  }

  function openEdit(row: ProgramRow) {
    setFormMode("edit");
    setEditId(row.id);
    setForm(formFromRow(row));
    setFormOpen(true);
  }

  async function saveForm() {
    const trainingType = typeOptions.find((t) => t.id === form.trainingTypeId);
    if (!form.name.trim() || !trainingType) {
      toast.error("Name and category are required");
      return;
    }
    const durationHours = Math.max(0, Number(form.durationHours) || 0);
    const cost = Math.max(0, Number(form.cost) || 0);
    const capacity = Math.max(0, Number(form.capacity) || 0);

    const payload: TrainingProgramWritePayload = {
      name: form.name.trim(),
      trainingTypeId: trainingType.id,
      status: form.status,
      durationHours,
      cost,
      capacity,
      enrollmentType: form.enrollmentType,
    };

    setSaving(true);
    try {
      if (formMode === "edit" && editId) {
        const updated = await updateTrainingProgramView(editId, payload);
        setRows((prev) => prev.map((r) => (r.id === editId ? (updated as ProgramRow) : r)));
        setViewRow((v) => (v?.id === editId ? (updated as ProgramRow) : v));
        toast.success("Training program updated");
      } else {
        const created = await createTrainingProgramView(payload);
        setRows((prev) => [created as ProgramRow, ...prev]);
        toast.success("Training program created");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: ProgramRow) {
    setSaving(true);
    try {
      await deleteTrainingProgramView(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setViewRow((v) => (v?.id === row.id ? null : v));
      toast.success("Training program deleted");
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

  const fieldClass =
    "h-9 w-full rounded-none border border-border bg-background px-2 text-sm text-foreground";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Training Programs
        </h1>
        {canWrite ? (
          <Button type="button" size="sm" className={GREEN_BTN} onClick={openAdd}>
            <Plus className="size-3.5" />
            Add Training Program
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
            <label className="flex min-w-[140px] flex-col gap-1 text-xs text-muted-foreground">
              Status
              <select
                value={draftStatus}
                onChange={(e) => setDraftStatus(e.target.value as "all" | ProgramStatus)}
                className={fieldClass}
              >
                <option value="all">All</option>
                {PROGRAM_STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[140px] flex-col gap-1 text-xs text-muted-foreground">
              Flags
              <select
                value={draftFlag}
                onChange={(e) => setDraftFlag(e.target.value as "all" | EnrollmentFlag)}
                className={fieldClass}
              >
                <option value="all">All</option>
                {ENROLLMENT_FLAG_OPTIONS.map((s) => (
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
                  setFlagFilter(draftFlag);
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
                  setDraftFlag("all");
                  setStatusFilter("all");
                  setFlagFilter("all");
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
        <table className="w-full min-w-[1180px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60">
            <tr className="border-b border-border text-left">
              <th className="w-12 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                #
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Name" col="name" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Status" col="status" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Duration" col="durationHours" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Cost" col="cost" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Capacity" col="capacity" />
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Flags
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Sessions" col="sessions" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Employees" col="employeesEnrolled" />
              </th>
              <th className="w-[1%] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Loading training programs...
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No training programs found.
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => (
                <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-muted/20">
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                    {(pageSafe - 1) * perPage + idx + 1}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-foreground">{row.name}</div>
                    <div className="text-xs text-muted-foreground">{row.category}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-none text-[10px] font-normal",
                        statusBadgeClass(row.status),
                      )}
                    >
                      {PROGRAM_STATUS_LABEL[row.status]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">{formatProgramDuration(row.durationHours)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{formatProgramCost(row.cost)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{row.capacity}</td>
                  <td className="px-3 py-2.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-none text-[10px] font-normal",
                        flagBadgeClass(row.enrollmentType),
                      )}
                    >
                      {ENROLLMENT_FLAG_LABEL[row.enrollmentType]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{row.sessions}</td>
                  <td className="px-3 py-2.5 tabular-nums">{row.employeesEnrolled}</td>
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-none text-sky-600 dark:text-sky-400"
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
                            className="h-7 w-7 rounded-none text-amber-600 dark:text-amber-400"
                            onClick={() => openEdit(row)}
                            aria-label="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-none text-red-600 dark:text-red-400"
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

      <Sheet open={!!viewRow} onOpenChange={(o) => !o && setViewRow(null)}>
        <SheetContent
          side="right"
          resizable
          closeButton="chevron"
          className="flex w-[420px] min-w-[160px] max-w-[720px] flex-col gap-0 p-0"
          title="Program details"
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base">Program Details</SheetTitle>
            <SheetDescription className="sr-only">View training program</SheetDescription>
          </SheetHeader>
          {viewRow ? (
            <div className="flex-1 space-y-4 overflow-auto p-4">
              <div>
                <div className="text-base font-semibold text-foreground">{viewRow.name}</div>
                <div className="text-sm text-muted-foreground">{viewRow.category}</div>
              </div>
              <dl className="grid gap-3 text-sm">
                {(
                  [
                    ["Status", PROGRAM_STATUS_LABEL[viewRow.status]],
                    ["Duration", formatProgramDuration(viewRow.durationHours)],
                    ["Cost", formatProgramCost(viewRow.cost)],
                    ["Capacity", String(viewRow.capacity)],
                    ["Flags", ENROLLMENT_FLAG_LABEL[viewRow.enrollmentType]],
                    ["Sessions", String(viewRow.sessions)],
                    ["Employees", String(viewRow.employeesEnrolled)],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[120px_1fr] gap-2 border-b border-border/60 pb-2">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="text-foreground">{v}</dd>
                  </div>
                ))}
              </dl>
              {canWrite ? (
                <div className="flex gap-2 pt-2">
                  <Button
                    type="button"
                    size="sm"
                    className={cn("h-9", GREEN_BTN)}
                    onClick={() => {
                      openEdit(viewRow);
                      setViewRow(null);
                    }}
                  >
                    <Pencil className="size-3.5" />
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-none text-red-600"
                    onClick={() => {
                      remove(viewRow);
                      setViewRow(null);
                    }}
                  >
                    <Trash2 className="size-3.5" />
                    Delete
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent
          side="right"
          resizable
          closeButton="chevron"
          className="flex w-[440px] min-w-[160px] max-w-[720px] flex-col gap-0 p-0"
          title={formMode === "edit" ? "Edit Training Program" : "Add Training Program"}
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base">
              {formMode === "edit" ? "Edit Training Program" : "Add Training Program"}
            </SheetTitle>
            <SheetDescription className="sr-only">Training program form</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-3 overflow-auto p-4">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Name *
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="h-9 rounded-none"
                placeholder="e.g. Digital Customer Support"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Category *
              <select
                value={form.trainingTypeId}
                onChange={(e) => setForm((f) => ({ ...f, trainingTypeId: e.target.value }))}
                className={fieldClass}
              >
                {typeOptions.length === 0 ? (
                  <option value="">No training types</option>
                ) : (
                  typeOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))
                )}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Status
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value as ProgramStatus }))
                  }
                  className={fieldClass}
                >
                  {PROGRAM_STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Flags
                <select
                  value={form.enrollmentType}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      enrollmentType: e.target.value as EnrollmentFlag,
                    }))
                  }
                  className={fieldClass}
                >
                  {ENROLLMENT_FLAG_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Duration (hours)
                <Input
                  type="number"
                  min={0}
                  value={form.durationHours}
                  onChange={(e) => setForm((f) => ({ ...f, durationHours: e.target.value }))}
                  className="h-9 rounded-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Cost (USD)
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.cost}
                  onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
                  className="h-9 rounded-none"
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Capacity
                <Input
                  type="number"
                  min={0}
                  value={form.capacity}
                  onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
                  className="h-9 rounded-none"
                />
              </label>
            </div>
          </div>
          <div className="flex gap-2 border-t border-border p-4">
            <Button
              type="button"
              size="sm"
              className={cn("h-9", GREEN_BTN)}
              disabled={saving}
              onClick={saveForm}
            >
              {formMode === "edit" ? "Save Changes" : "Create Program"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-none"
              onClick={() => setFormOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
