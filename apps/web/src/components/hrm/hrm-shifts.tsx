"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CalendarDays,
  Clock3,
  Eye,
  Filter,
  Lock,
  Moon,
  Pencil,
  Plus,
  Search,
  Sun,
  Trash2,
  Users,
} from "lucide-react";
import {
  SHIFT_STATUS_LABEL,
  SHIFT_STATUS_OPTIONS,
  calcWorkingHours,
  type HrmShift,
  type ShiftStatus,
} from "@/lib/mock-data/hrm-shifts";
import {
  createHrmShift,
  deleteHrmShift,
  listHrmShifts,
  updateHrmShift,
} from "@/lib/api/hrm-shifts";
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
  name: string;
  description: string;
  startTime: string;
  endTime: string;
  breakDuration: string;
  breakStartTime: string;
  breakEndTime: string;
  gracePeriod: string;
  isNightShift: boolean;
  status: ShiftStatus;
};

function emptyForm(): FormState {
  return {
    name: "",
    description: "",
    startTime: "09:00",
    endTime: "18:00",
    breakDuration: "60",
    breakStartTime: "13:00",
    breakEndTime: "14:00",
    gracePeriod: "15",
    isNightShift: false,
    status: "active",
  };
}

function formFromRow(row: HrmShift): FormState {
  return {
    name: row.name,
    description: row.description,
    startTime: row.startTime,
    endTime: row.endTime,
    breakDuration: String(row.breakDuration),
    breakStartTime: row.breakStartTime,
    breakEndTime: row.breakEndTime,
    gracePeriod: String(row.gracePeriod),
    isNightShift: row.isNightShift,
    status: row.status,
  };
}

function statusBadgeClass(status: ShiftStatus) {
  return status === "active"
    ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    : "border-border bg-muted/50 text-muted-foreground";
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-none border border-border bg-card px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      </div>
      <div className="flex size-10 shrink-0 items-center justify-center rounded-none border border-border bg-muted/40 text-muted-foreground">
        {icon}
      </div>
    </div>
  );
}

function MetaCell({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2 rounded-none border border-border bg-muted/15 px-2.5 py-2">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 text-sm font-medium tabular-nums text-foreground">{value}</p>
      </div>
    </div>
  );
}

export function HrmShifts() {
  const canWrite = useAdminCanWrite();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<HrmShift[]>([]);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"all" | ShiftStatus>("all");
  const [draftKind, setDraftKind] = useState<"all" | "day" | "night">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | ShiftStatus>("all");
  const [kindFilter, setKindFilter] = useState<"all" | "day" | "night">("all");
  const [perPage, setPerPage] = useState(9);
  const [page, setPage] = useState(1);

  const [viewRow, setViewRow] = useState<HrmShift | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const shifts = await listHrmShifts();
      setRows(shifts);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load shifts");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const stats = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((r) => r.status === "active").length;
    const night = rows.filter((r) => r.isNightShift).length;
    const day = rows.filter((r) => !r.isNightShift).length;
    return { total, active, night, day };
  }, [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);
    if (kindFilter === "night") list = list.filter((r) => r.isNightShift);
    if (kindFilter === "day") list = list.filter((r) => !r.isNightShift);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.startTime.includes(q) ||
          r.endTime.includes(q),
      );
    }
    return list;
  }, [rows, statusFilter, kindFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  const previewHours = calcWorkingHours(
    form.startTime,
    form.endTime,
    Number(form.breakDuration) || 0,
    form.isNightShift,
  );

  function openAdd() {
    setFormMode("add");
    setEditId(null);
    setForm(emptyForm());
    setFormOpen(true);
  }

  function openEdit(row: HrmShift) {
    setFormMode("edit");
    setEditId(row.id);
    setForm(formFromRow(row));
    setViewRow(null);
    setFormOpen(true);
  }

  async function saveForm() {
    if (!form.name.trim()) {
      toast.error("Shift name is required");
      return;
    }
    if (!form.startTime || !form.endTime) {
      toast.error("Start and end time are required");
      return;
    }
    const payload: Omit<HrmShift, "id"> = {
      name: form.name.trim(),
      description: form.description.trim(),
      startTime: form.startTime,
      endTime: form.endTime,
      breakDuration: Number(form.breakDuration) || 0,
      breakStartTime: form.breakStartTime,
      breakEndTime: form.breakEndTime,
      gracePeriod: Number(form.gracePeriod) || 0,
      isNightShift: form.isNightShift,
      status: form.status,
    };

    setSaving(true);
    try {
      if (formMode === "edit" && editId) {
        const updated = await updateHrmShift(editId, payload);
        setRows((prev) => prev.map((r) => (r.id === editId ? updated : r)));
        setViewRow((v) => (v?.id === editId ? updated : v));
        toast.success("Shift updated");
      } else {
        const created = await createHrmShift(payload);
        setRows((prev) => [created, ...prev]);
        toast.success("Shift created");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: HrmShift) {
    if (!window.confirm(`Delete shift “${row.name}”?`)) return;
    try {
      await deleteHrmShift(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setViewRow((v) => (v?.id === row.id ? null : v));
      toast.success("Shift deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  if (loading) {
    return <ContentDataSkeleton label="Loading shifts…" />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Shifts</h1>
        {canWrite ? (
          <Button type="button" size="sm" className={GREEN_BTN} onClick={openAdd}>
            <Plus className="size-3.5" />
            Add Shift
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
            {[6, 9, 12, 18].map((n) => (
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
                onChange={(e) => setDraftStatus(e.target.value as "all" | ShiftStatus)}
                className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="all">All</option>
                {SHIFT_STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[140px] flex-col gap-1 text-xs text-muted-foreground">
              Type
              <select
                value={draftKind}
                onChange={(e) => setDraftKind(e.target.value as "all" | "day" | "night")}
                className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="all">All</option>
                <option value="day">Day Shift</option>
                <option value="night">Night Shift</option>
              </select>
            </label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                className={cn("h-9", GREEN_BTN)}
                onClick={() => {
                  setStatusFilter(draftStatus);
                  setKindFilter(draftKind);
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
                  setDraftKind("all");
                  setStatusFilter("all");
                  setKindFilter("all");
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
        <StatCard label="Total Shifts" value={stats.total} icon={<Users className="size-5" />} />
        <StatCard
          label="Active Shifts"
          value={stats.active}
          icon={<Sun className="size-5 text-emerald-500" />}
        />
        <StatCard
          label="Night Shifts"
          value={stats.night}
          icon={<Moon className="size-5 text-indigo-500" />}
        />
        <StatCard
          label="Day Shifts"
          value={stats.day}
          icon={<Sun className="size-5 text-sky-500" />}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {pageRows.length === 0 ? (
          <div className="rounded-none border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
            No shifts found.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {pageRows.map((row) => {
              const hours = calcWorkingHours(
                row.startTime,
                row.endTime,
                row.breakDuration,
                row.isNightShift,
              );
              return (
                <article
                  key={row.id}
                  className="flex flex-col rounded-none border border-border bg-card"
                >
                  <div className="flex items-start gap-2 border-b border-border px-3 py-2.5">
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-none border border-border",
                        row.isNightShift
                          ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300"
                          : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                      )}
                    >
                      {row.isNightShift ? <Moon className="size-4" /> : <Sun className="size-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{row.name}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge
                          variant="outline"
                          className={cn(
                            "rounded-none text-[10px] font-normal",
                            row.isNightShift
                              ? "border-indigo-500/30 bg-indigo-500/15 text-indigo-800 dark:text-indigo-300"
                              : "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300",
                          )}
                        >
                          {row.isNightShift ? "Night Shift" : "Day Shift"}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            "rounded-none text-[10px] font-normal",
                            statusBadgeClass(row.status),
                          )}
                        >
                          {SHIFT_STATUS_LABEL[row.status]}
                        </Badge>
                      </div>
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
                            className="h-7 w-7 rounded-none"
                            onClick={() => toast.message("Shift permissions (mock)")}
                            aria-label="Permissions"
                          >
                            <Lock className="h-3.5 w-3.5" />
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

                  <div className="grid grid-cols-2 gap-2 px-3 py-3">
                    <MetaCell
                      icon={<Clock3 className="size-3.5" />}
                      label="Shift Hours"
                      value={`${row.startTime} - ${row.endTime}`}
                    />
                    <MetaCell
                      icon={<Clock3 className="size-3.5" />}
                      label="Break Duration"
                      value={`${row.breakDuration} minutes`}
                    />
                    <MetaCell
                      icon={<CalendarDays className="size-3.5" />}
                      label="Working Time"
                      value={`${hours.toFixed(1)} hours`}
                    />
                    <MetaCell
                      icon={<CalendarDays className="size-3.5" />}
                      label="Grace Period"
                      value={`${row.gracePeriod} minutes`}
                    />
                  </div>

                  <p className="mt-auto border-t border-border px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                    {row.description || "—"}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {filtered.length > perPage ? (
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

      <Sheet open={!!viewRow} onOpenChange={(o) => !o && setViewRow(null)}>
        <SheetContent
          side="right"
          title={viewRow ? `Shift — ${viewRow.name}` : "Shift"}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          {viewRow ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="shrink-0 border-b border-border px-4 py-3 pr-10">
                <p className="text-base font-semibold">{viewRow.name}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Badge
                    variant="outline"
                    className={cn(
                      "rounded-none text-[10px] font-normal",
                      viewRow.isNightShift
                        ? "border-indigo-500/30 bg-indigo-500/15 text-indigo-800 dark:text-indigo-300"
                        : "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300",
                    )}
                  >
                    {viewRow.isNightShift ? "Night Shift" : "Day Shift"}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn(
                      "rounded-none text-[10px] font-normal",
                      statusBadgeClass(viewRow.status),
                    )}
                  >
                    {SHIFT_STATUS_LABEL[viewRow.status]}
                  </Badge>
                </div>
              </div>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                <dl className="divide-y divide-border rounded-none border border-border text-sm">
                  {(
                    [
                      ["Start Time", viewRow.startTime],
                      ["End Time", viewRow.endTime],
                      ["Break Duration", `${viewRow.breakDuration} min`],
                      ["Break Start", viewRow.breakStartTime || "—"],
                      ["Break End", viewRow.breakEndTime || "—"],
                      ["Grace Period", `${viewRow.gracePeriod} min`],
                      [
                        "Working Time",
                        `${calcWorkingHours(viewRow.startTime, viewRow.endTime, viewRow.breakDuration, viewRow.isNightShift).toFixed(1)} hours`,
                      ],
                      ["Is Night Shift", viewRow.isNightShift ? "Yes" : "No"],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="flex items-start justify-between gap-3 px-3 py-2">
                      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
                      <dd className="text-right text-sm">{value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="rounded-none border border-border bg-muted/20 px-3 py-2 text-sm">
                  <p className="mb-1 text-xs text-muted-foreground">Description</p>
                  <p>{viewRow.description || "—"}</p>
                </div>
              </div>
              {canWrite ? (
                <div className="flex shrink-0 gap-2 border-t border-border px-4 py-3">
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
                </div>
              ) : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent
          side="right"
          title={formMode === "add" ? "Add Shift" : "Edit Shift"}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="shrink-0 space-y-1 border-b border-border px-4 py-3 pr-10 text-left">
              <SheetTitle className="text-base">
                {formMode === "add" ? "Add Shift" : "Edit Shift"}
              </SheetTitle>
              <SheetDescription className="text-xs">
                Workdo fields — name, times, break, grace, night flag, status.
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Name *
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="h-9 rounded-none"
                  placeholder="Morning Shift"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Start Time *
                  <Input
                    type="time"
                    value={form.startTime}
                    onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  End Time *
                  <Input
                    type="time"
                    value={form.endTime}
                    onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Break Duration (min)
                  <Input
                    type="number"
                    min={0}
                    value={form.breakDuration}
                    onChange={(e) => setForm({ ...form, breakDuration: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Grace Period (min)
                  <Input
                    type="number"
                    min={0}
                    value={form.gracePeriod}
                    onChange={(e) => setForm({ ...form, gracePeriod: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Break Start
                  <Input
                    type="time"
                    value={form.breakStartTime}
                    onChange={(e) => setForm({ ...form, breakStartTime: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Break End
                  <Input
                    type="time"
                    value={form.breakEndTime}
                    onChange={(e) => setForm({ ...form, breakEndTime: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
              </div>
              <div className="rounded-none border border-border bg-muted/20 px-3 py-2 text-xs">
                <span className="text-muted-foreground">Working time (auto): </span>
                <span className="font-medium tabular-nums text-foreground">
                  {previewHours.toFixed(1)} hours
                </span>
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={form.isNightShift}
                  onChange={(e) => setForm({ ...form, isNightShift: e.target.checked })}
                  className="rounded-none"
                />
                Is Night Shift
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Status
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as ShiftStatus })}
                  className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                >
                  {SHIFT_STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
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
