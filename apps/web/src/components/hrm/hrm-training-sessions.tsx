"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Eye, Filter, Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  SESSION_LOCATIONS,
  SESSION_MODE_LABEL,
  SESSION_MODE_OPTIONS,
  SESSION_STATUS_LABEL,
  SESSION_STATUS_OPTIONS,
  SESSION_TRAINER_POOL,
  formatSessionRange,
  type SessionMode,
  type SessionStatus,
  type TrainingSession,
} from "@/lib/mock-data/hrm-training-sessions";
import {
  createTrainingSessionView,
  deleteTrainingSessionView,
  listTrainingProgramOptions,
  listTrainingSessionsView,
  updateTrainingSessionView,
  type TrainingProgramOption,
  type TrainingSessionWritePayload,
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

type SortKey = "sessionName" | "startAt" | "status" | "location";
type SortDir = "asc" | "desc";

type SessionRow = TrainingSession & { programId?: string };

type FormState = {
  sessionName: string;
  programId: string;
  startAt: string;
  endAt: string;
  location: string;
  mode: SessionMode;
  status: SessionStatus;
  trainers: string[];
};

function todayYmdHm() {
  const t = new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");
  return `${y}-${m}-${d} 09:00`;
}

function emptyForm(programOptions: TrainingProgramOption[] = []): FormState {
  const loc = SESSION_LOCATIONS[0]!;
  return {
    sessionName: "",
    programId: programOptions[0]?.id ?? "",
    startAt: todayYmdHm(),
    endAt: todayYmdHm().replace("09:00", "11:00"),
    location: loc.name,
    mode: loc.mode,
    status: "scheduled",
    trainers: [SESSION_TRAINER_POOL[0]!],
  };
}

function formFromRow(row: SessionRow): FormState {
  return {
    sessionName: row.sessionName,
    programId: row.programId ?? "",
    startAt: row.startAt,
    endAt: row.endAt,
    location: row.location,
    mode: row.mode,
    status: row.status,
    trainers: row.trainers.length > 0 ? [...row.trainers] : [SESSION_TRAINER_POOL[0]!],
  };
}

function statusBadgeClass(status: SessionStatus) {
  switch (status) {
    case "completed":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "in_progress":
      return "border-orange-500/30 bg-orange-500/15 text-orange-800 dark:text-orange-300";
    default:
      return "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300";
  }
}

function modeBadgeClass(mode: SessionMode) {
  return mode === "virtual"
    ? "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300"
    : "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
}

function TrainersCell({ trainers }: { trainers: string[] }) {
  const shown = trainers.slice(0, 2);
  const more = trainers.length - shown.length;
  return (
    <div className="flex flex-col gap-0.5">
      {shown.map((t) => (
        <span key={t} className="text-sm text-foreground">
          {t}
        </span>
      ))}
      {more > 0 ? (
        <span className="text-xs text-muted-foreground">+{more} more</span>
      ) : null}
    </div>
  );
}

export function HrmTrainingSessions() {
  const canWrite = useAdminCanWrite();
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [programOptions, setProgramOptions] = useState<TrainingProgramOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"all" | SessionStatus>("all");
  const [draftMode, setDraftMode] = useState<"all" | SessionMode>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | SessionStatus>("all");
  const [modeFilter, setModeFilter] = useState<"all" | SessionMode>("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("startAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [viewRow, setViewRow] = useState<SessionRow | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [programs, data] = await Promise.all([
          listTrainingProgramOptions(),
          listTrainingSessionsView(),
        ]);
        if (cancelled) return;
        setProgramOptions(programs);
        setRows(data as SessionRow[]);
        setForm(emptyForm(programs));
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load sessions");
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
    if (modeFilter !== "all") list = list.filter((r) => r.mode === modeFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.sessionName.toLowerCase().includes(q) ||
          r.programName.toLowerCase().includes(q) ||
          r.location.toLowerCase().includes(q) ||
          r.trainers.some((t) => t.toLowerCase().includes(q)),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => String(a[sortKey]).localeCompare(String(b[sortKey])) * dir);
  }, [rows, statusFilter, modeFilter, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  const calendarGroups = useMemo(() => {
    const map = new Map<string, TrainingSession[]>();
    for (const r of [...filtered].sort((a, b) => a.startAt.localeCompare(b.startAt))) {
      const day = r.startAt.slice(0, 10);
      const arr = map.get(day) ?? [];
      arr.push(r);
      map.set(day, arr);
    }
    return [...map.entries()];
  }, [filtered]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "startAt" ? "desc" : "asc");
    }
  }

  function openAdd() {
    setFormMode("add");
    setEditId(null);
    setForm(emptyForm(programOptions));
    setFormOpen(true);
  }

  function openEdit(row: SessionRow) {
    setFormMode("edit");
    setEditId(row.id);
    setForm(formFromRow(row));
    setFormOpen(true);
  }

  function onLocationChange(name: string) {
    const hit = SESSION_LOCATIONS.find((l) => l.name === name);
    setForm((f) => ({
      ...f,
      location: name,
      mode: hit?.mode ?? f.mode,
    }));
  }

  function toggleTrainer(name: string) {
    setForm((f) => {
      const has = f.trainers.includes(name);
      return {
        ...f,
        trainers: has ? f.trainers.filter((t) => t !== name) : [...f.trainers, name],
      };
    });
  }

  async function saveForm() {
    const program = programOptions.find((p) => p.id === form.programId);
    if (!form.sessionName.trim() || !program || !form.startAt.trim() || !form.endAt.trim()) {
      toast.error("Session name, program, and date/time are required");
      return;
    }
    if (!form.location.trim()) {
      toast.error("Location is required");
      return;
    }
    if (form.trainers.length === 0) {
      toast.error("Select at least one trainer");
      return;
    }

    const payload: TrainingSessionWritePayload = {
      sessionName: form.sessionName.trim(),
      programId: program.id,
      startAt: form.startAt.trim(),
      endAt: form.endAt.trim(),
      location: form.location.trim(),
      mode: form.mode,
      status: form.status,
    };

    setSaving(true);
    try {
      if (formMode === "edit" && editId) {
        const updated = await updateTrainingSessionView(editId, payload);
        setRows((prev) =>
          prev.map((r) =>
            r.id === editId ? { ...updated, trainers: [...form.trainers] } : r,
          ),
        );
        setViewRow((v) =>
          v?.id === editId ? { ...updated, trainers: [...form.trainers] } : v,
        );
        toast.success("Session updated");
      } else {
        const created = await createTrainingSessionView(payload);
        setRows((prev) => [{ ...created, trainers: [...form.trainers] } as SessionRow, ...prev]);
        toast.success("Session created");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: SessionRow) {
    setSaving(true);
    try {
      await deleteTrainingSessionView(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setViewRow((v) => (v?.id === row.id ? null : v));
      toast.success("Session deleted");
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
          Training Sessions
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 rounded-none"
            onClick={() => setCalendarOpen(true)}
          >
            <CalendarDays className="size-3.5" />
            Calendar View
          </Button>
          {canWrite ? (
            <Button type="button" size="sm" className={GREEN_BTN} onClick={openAdd}>
              <Plus className="size-3.5" />
              Add Session
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
                onChange={(e) => setDraftStatus(e.target.value as "all" | SessionStatus)}
                className={fieldClass}
              >
                <option value="all">All</option>
                {SESSION_STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[140px] flex-col gap-1 text-xs text-muted-foreground">
              Mode
              <select
                value={draftMode}
                onChange={(e) => setDraftMode(e.target.value as "all" | SessionMode)}
                className={fieldClass}
              >
                <option value="all">All</option>
                {SESSION_MODE_OPTIONS.map((s) => (
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
                  setModeFilter(draftMode);
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
                  setDraftMode("all");
                  setStatusFilter("all");
                  setModeFilter("all");
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
                <SortHeader label="Program" col="sessionName" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Date & Time" col="startAt" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Location" col="location" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Status" col="status" />
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Trainers
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Attendance
              </th>
              <th className="w-[1%] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Loading training sessions...
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No training sessions found.
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => (
                <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-muted/20">
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                    {(pageSafe - 1) * perPage + idx + 1}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-foreground">{row.sessionName}</div>
                    <div className="text-xs text-muted-foreground">{row.programName}</div>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-xs sm:text-sm">
                    {formatSessionRange(row.startAt, row.endAt)}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="text-foreground">{row.location}</div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "mt-1 rounded-none text-[10px] font-normal",
                        modeBadgeClass(row.mode),
                      )}
                    >
                      {SESSION_MODE_LABEL[row.mode]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-none text-[10px] font-normal",
                        statusBadgeClass(row.status),
                      )}
                    >
                      {SESSION_STATUS_LABEL[row.status]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <TrainersCell trainers={row.trainers} />
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{row.attendance}</td>
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

      {/* View */}
      <Sheet open={!!viewRow} onOpenChange={(o) => !o && setViewRow(null)}>
        <SheetContent
          side="right"
          resizable
          closeButton="chevron"
          className="flex w-[420px] min-w-[160px] max-w-[720px] flex-col gap-0 p-0"
          title="Session details"
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base">Session Details</SheetTitle>
            <SheetDescription className="sr-only">View training session</SheetDescription>
          </SheetHeader>
          {viewRow ? (
            <div className="flex-1 space-y-4 overflow-auto p-4">
              <div>
                <div className="text-base font-semibold text-foreground">{viewRow.sessionName}</div>
                <div className="text-sm text-muted-foreground">{viewRow.programName}</div>
              </div>
              <dl className="grid gap-3 text-sm">
                {(
                  [
                    ["Date & Time", formatSessionRange(viewRow.startAt, viewRow.endAt)],
                    ["Location", viewRow.location],
                    ["Mode", SESSION_MODE_LABEL[viewRow.mode]],
                    ["Status", SESSION_STATUS_LABEL[viewRow.status]],
                    ["Attendance", String(viewRow.attendance)],
                    ["Trainers", viewRow.trainers.join(", ")],
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

      {/* Calendar */}
      <Sheet open={calendarOpen} onOpenChange={setCalendarOpen}>
        <SheetContent
          side="right"
          resizable
          closeButton="chevron"
          className="flex w-[480px] min-w-[160px] max-w-[720px] flex-col gap-0 p-0"
          title="Calendar View"
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base">Calendar View</SheetTitle>
            <SheetDescription className="text-xs">
              Sessions grouped by start date (current filters applied).
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-auto p-4">
            {calendarGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sessions to show.</p>
            ) : (
              calendarGroups.map(([day, items]) => (
                <div key={day} className="rounded-none border border-border">
                  <div className="border-b border-border bg-muted/40 px-3 py-2 text-sm font-semibold">
                    {day}
                  </div>
                  <ul className="divide-y divide-border">
                    {items.map((s) => (
                      <li key={s.id} className="px-3 py-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium text-foreground">{s.sessionName}</div>
                            <div className="text-xs text-muted-foreground">{s.programName}</div>
                            <div className="mt-1 text-xs tabular-nums text-muted-foreground">
                              {s.startAt.slice(11)} – {s.endAt.slice(11)} · {s.location}
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className={cn(
                              "shrink-0 rounded-none text-[10px] font-normal",
                              statusBadgeClass(s.status),
                            )}
                          >
                            {SESSION_STATUS_LABEL[s.status]}
                          </Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Add / Edit */}
      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent
          side="right"
          resizable
          closeButton="chevron"
          className="flex w-[440px] min-w-[160px] max-w-[720px] flex-col gap-0 p-0"
          title={formMode === "edit" ? "Edit Session" : "Add Session"}
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base">
              {formMode === "edit" ? "Edit Session" : "Add Session"}
            </SheetTitle>
            <SheetDescription className="sr-only">Training session form</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-3 overflow-auto p-4">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Session Name *
              <Input
                value={form.sessionName}
                onChange={(e) => setForm((f) => ({ ...f, sessionName: e.target.value }))}
                className="h-9 rounded-none"
                placeholder="e.g. Evening Online Session"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Training Program *
              <select
                value={form.programId}
                onChange={(e) => setForm((f) => ({ ...f, programId: e.target.value }))}
                className={fieldClass}
              >
                {programOptions.length === 0 ? (
                  <option value="">No programs</option>
                ) : (
                  programOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))
                )}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Start (YYYY-MM-DD HH:mm) *
                <Input
                  value={form.startAt}
                  onChange={(e) => setForm((f) => ({ ...f, startAt: e.target.value }))}
                  className="h-9 rounded-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                End (YYYY-MM-DD HH:mm) *
                <Input
                  value={form.endAt}
                  onChange={(e) => setForm((f) => ({ ...f, endAt: e.target.value }))}
                  className="h-9 rounded-none"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Location *
              <select
                value={form.location}
                onChange={(e) => onLocationChange(e.target.value)}
                className={fieldClass}
              >
                {SESSION_LOCATIONS.map((l) => (
                  <option key={l.name} value={l.name}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Mode
                <select
                  value={form.mode}
                  onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value as SessionMode }))}
                  className={fieldClass}
                >
                  {SESSION_MODE_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Status
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value as SessionStatus }))
                  }
                  className={fieldClass}
                >
                  {SESSION_STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <fieldset className="space-y-2">
              <legend className="text-xs text-muted-foreground">Trainers *</legend>
              <div className="grid gap-1.5 rounded-none border border-border p-2">
                {SESSION_TRAINER_POOL.map((t) => (
                  <label key={t} className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      className="rounded-none"
                      checked={form.trainers.includes(t)}
                      onChange={() => toggleTrainer(t)}
                    />
                    {t}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <div className="flex gap-2 border-t border-border p-4">
            <Button
              type="button"
              size="sm"
              className={cn("h-9", GREEN_BTN)}
              disabled={saving}
              onClick={saveForm}
            >
              {formMode === "edit" ? "Save Changes" : "Create Session"}
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
