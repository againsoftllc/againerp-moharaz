"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  Clock,
  Copy,
  Eye,
  Filter,
  Pencil,
  Plus,
  Search,
  Trash2,
  User,
} from "lucide-react";
import {
  MEETING_RECURRENCE_LABEL,
  MEETING_RECURRENCE_OPTIONS,
  MEETING_STATUS_LABEL,
  MEETING_STATUS_OPTIONS,
  type HrmMeeting,
  type MeetingRecurrence,
  type MeetingStatus,
} from "@/lib/mock-data/hrm-meetings";
import {
  createMeetingView,
  deleteMeetingView,
  listMeetingFormOptions,
  listMeetingsView,
  updateMeetingView,
  type MeetingFormOptions,
} from "@/lib/api/hrm-meetings";
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

type SortKey = "title" | "meetingDate" | "organizer" | "room" | "status";
type SortDir = "asc" | "desc";

type FormState = {
  title: string;
  meetingType: string;
  meetingDate: string;
  startTime: string;
  endTime: string;
  organizer: string;
  room: string;
  recurrence: MeetingRecurrence;
  status: MeetingStatus;
  description: string;
  videoLink: string;
};

function todayYmd() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function emptyForm(options?: MeetingFormOptions): FormState {
  return {
    title: "",
    meetingType: options?.meetingTypes[0]?.name ?? "",
    meetingDate: todayYmd(),
    startTime: "10:00",
    endTime: "11:00",
    organizer: options?.organizers[0] ?? "",
    room: options?.meetingRooms[0] ?? "",
    recurrence: "none",
    status: "scheduled",
    description: "",
    videoLink: "",
  };
}

function formFromRow(row: HrmMeeting): FormState {
  return {
    title: row.title,
    meetingType: row.meetingType,
    meetingDate: row.meetingDate,
    startTime: row.startTime,
    endTime: row.endTime,
    organizer: row.organizer,
    room: row.room,
    recurrence: row.recurrence,
    status: row.status,
    description: row.description,
    videoLink: row.videoLink,
  };
}

function statusBadgeClass(status: MeetingStatus) {
  switch (status) {
    case "completed":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "cancelled":
      return "border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300";
    default:
      return "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300";
  }
}

function recurrenceBadgeClass(recurrence: MeetingRecurrence) {
  switch (recurrence) {
    case "monthly":
      return "border-violet-500/30 bg-violet-500/15 text-violet-800 dark:text-violet-300";
    case "weekly":
      return "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300";
    case "daily":
      return "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300";
    default:
      return "border-border bg-muted/40 text-muted-foreground";
  }
}

export function HrmMeetings() {
  const canWrite = useAdminCanWrite();
  const [rows, setRows] = useState<HrmMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [options, setOptions] = useState<MeetingFormOptions>({
    meetingTypes: [],
    meetingRooms: [],
    organizers: [],
  });

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"all" | MeetingStatus>("all");
  const [draftType, setDraftType] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | MeetingStatus>("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("meetingDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [viewRow, setViewRow] = useState<HrmMeeting | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [meetingRows, meetingOptions] = await Promise.all([
          listMeetingsView(),
          listMeetingFormOptions(),
        ]);
        if (cancelled) return;
        setRows(meetingRows);
        setOptions(meetingOptions);
        setForm((current) =>
          current.meetingType || current.organizer || current.room ? current : emptyForm(meetingOptions),
        );
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load meetings");
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
    if (typeFilter !== "all") list = list.filter((r) => r.meetingType === typeFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.meetingType.toLowerCase().includes(q) ||
          r.organizer.toLowerCase().includes(q) ||
          r.room.toLowerCase().includes(q),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
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
      setSortDir(key === "meetingDate" ? "desc" : "asc");
    }
  }

  function openAdd() {
    setFormMode("add");
    setEditId(null);
    setForm(emptyForm(options));
    setFormOpen(true);
  }

  function openEdit(row: HrmMeeting) {
    setFormMode("edit");
    setEditId(row.id);
    setForm(formFromRow(row));
    setFormOpen(true);
  }

  async function duplicate(row: HrmMeeting) {
    try {
      const created = await createMeetingView({
        ...row,
        title: `${row.title} (Copy)`,
        status: "scheduled",
      });
      setRows((prev) => [created, ...prev]);
      toast.success("Meeting duplicated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Duplicate failed");
    }
  }

  async function saveForm() {
    if (!form.title.trim() || !form.meetingDate || !form.startTime || !form.endTime) {
      toast.error("Title, date, and time are required");
      return;
    }
    const payload: Omit<HrmMeeting, "id"> = {
      title: form.title.trim(),
      meetingType: form.meetingType,
      typeColor: options.meetingTypes.find((item) => item.name === form.meetingType)?.color ?? "#64748b",
      meetingDate: form.meetingDate,
      startTime: form.startTime,
      endTime: form.endTime,
      organizer: form.organizer,
      room: form.room,
      recurrence: form.recurrence,
      status: form.status,
      description: form.description.trim(),
      videoLink: form.videoLink.trim(),
    };
    setSaving(true);
    try {
      if (formMode === "edit" && editId) {
        const updated = await updateMeetingView(editId, payload);
        setRows((prev) => prev.map((r) => (r.id === editId ? updated : r)));
        setViewRow((v) => (v?.id === editId ? updated : v));
        toast.success("Meeting updated");
      } else {
        const created = await createMeetingView(payload);
        setRows((prev) => [created, ...prev]);
        toast.success("Meeting scheduled");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: HrmMeeting) {
    try {
      await deleteMeetingView(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setViewRow((v) => (v?.id === row.id ? null : v));
      toast.success("Meeting deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
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
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Meetings</h1>
        {canWrite ? (
          <Button type="button" size="sm" className={GREEN_BTN} onClick={openAdd}>
            <Plus className="size-3.5" />
            Schedule Meeting
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
                onChange={(e) => setDraftStatus(e.target.value as "all" | MeetingStatus)}
                className={fieldClass}
              >
                <option value="all">All</option>
                {MEETING_STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[160px] flex-col gap-1 text-xs text-muted-foreground">
              Meeting Type
              <select
                value={draftType}
                onChange={(e) => setDraftType(e.target.value)}
                className={fieldClass}
              >
                <option value="all">All</option>
                {options.meetingTypes.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
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
                  setDraftStatus("all");
                  setDraftType("all");
                  setStatusFilter("all");
                  setTypeFilter("all");
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
                <SortHeader label="Meeting" col="title" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Date & Time" col="meetingDate" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Organizer" col="organizer" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Room" col="room" />
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Recurrence
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
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Loading meetings...
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No meetings found.
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => (
                <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-muted/20">
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                    {(pageSafe - 1) * perPage + idx + 1}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-foreground">{row.title}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-none"
                        style={{ backgroundColor: row.typeColor }}
                        aria-hidden
                      />
                      {row.meetingType}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5 text-sm text-foreground">
                      <Calendar className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="tabular-nums">{row.meetingDate}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="size-3 shrink-0" />
                      <span className="tabular-nums">
                        {row.startTime} - {row.endTime}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <User className="size-3.5 shrink-0 text-muted-foreground" />
                      {row.organizer}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">{row.room}</td>
                  <td className="px-3 py-2.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-none text-[10px] font-normal",
                        recurrenceBadgeClass(row.recurrence),
                      )}
                    >
                      {MEETING_RECURRENCE_LABEL[row.recurrence]}
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
                      {MEETING_STATUS_LABEL[row.status]}
                    </Badge>
                  </td>
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
                            className="h-7 w-7 rounded-none text-emerald-600 dark:text-emerald-400"
                            onClick={() => duplicate(row)}
                            aria-label="Duplicate"
                          >
                            <Copy className="h-3.5 w-3.5" />
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
          title="Meeting details"
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center border border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                <Calendar className="size-4" />
              </div>
              <div>
                <SheetTitle className="text-base">Meeting Details</SheetTitle>
                <SheetDescription className="sr-only">View meeting</SheetDescription>
              </div>
            </div>
          </SheetHeader>
          {viewRow ? (
            <div className="flex-1 space-y-5 overflow-auto p-4">
              <div>
                <div className="text-base font-semibold text-foreground">{viewRow.title}</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className="rounded-none text-[10px]"
                    style={{
                      borderColor: `${viewRow.typeColor}55`,
                      backgroundColor: `${viewRow.typeColor}22`,
                      color: viewRow.typeColor,
                    }}
                  >
                    {viewRow.meetingType}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn(
                      "rounded-none text-[10px]",
                      viewRow.status === "completed"
                        ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : viewRow.status === "cancelled"
                          ? "border-rose-500/30 bg-rose-500/15 text-rose-800 dark:text-rose-300"
                          : "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300",
                    )}
                  >
                    {MEETING_STATUS_LABEL[viewRow.status]}
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="size-3.5" /> Date
                  </div>
                  <div className="text-sm font-medium">{viewRow.meetingDate}</div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="size-3.5" /> Time
                  </div>
                  <div className="text-sm font-medium">
                    {viewRow.startTime} – {viewRow.endTime}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <User className="size-3.5" /> Organizer
                  </div>
                  <div className="text-sm font-medium">{viewRow.organizer}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Room</div>
                  <div className="text-sm font-medium">{viewRow.room}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Recurrence</div>
                  <div className="text-sm font-medium">
                    {MEETING_RECURRENCE_LABEL[viewRow.recurrence]}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Video Link</div>
                  <div className="break-all text-sm">
                    {viewRow.videoLink ? (
                      <a
                        href={viewRow.videoLink}
                        className="text-sky-600 hover:underline dark:text-sky-400"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {viewRow.videoLink}
                      </a>
                    ) : (
                      "—"
                    )}
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Agenda / Description</div>
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {viewRow.description || "—"}
                </p>
              </div>
              {canWrite ? (
                <div className="flex flex-wrap gap-2 pt-1">
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
                    className="h-9 rounded-none"
                    onClick={() => {
                      void duplicate(viewRow);
                      setViewRow(null);
                    }}
                  >
                    <Copy className="size-3.5" />
                    Duplicate
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
          className="flex w-[460px] min-w-[160px] max-w-[720px] flex-col gap-0 p-0"
          title={formMode === "edit" ? "Edit Meeting" : "Schedule Meeting"}
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base">
              {formMode === "edit" ? "Edit Meeting" : "Schedule Meeting"}
            </SheetTitle>
            <SheetDescription className="sr-only">Meeting form</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-3 overflow-auto p-4">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Title *
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="h-9 rounded-none"
                placeholder="e.g. All Hands Company Meeting"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Meeting Type
              <select
                value={form.meetingType}
                onChange={(e) => setForm((f) => ({ ...f, meetingType: e.target.value }))}
                className={fieldClass}
              >
                {options.meetingTypes.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-3 gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Date *
                <Input
                  type="date"
                  value={form.meetingDate}
                  onChange={(e) => setForm((f) => ({ ...f, meetingDate: e.target.value }))}
                  className="h-9 rounded-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Start *
                <Input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                  className="h-9 rounded-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                End *
                <Input
                  type="time"
                  value={form.endTime}
                  onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                  className="h-9 rounded-none"
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Organizer
                <select
                  value={form.organizer}
                  onChange={(e) => setForm((f) => ({ ...f, organizer: e.target.value }))}
                  className={fieldClass}
                >
                  {options.organizers.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Room
                <select
                  value={form.room}
                  onChange={(e) => setForm((f) => ({ ...f, room: e.target.value }))}
                  className={fieldClass}
                >
                  {options.meetingRooms.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Recurrence
                <select
                  value={form.recurrence}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      recurrence: e.target.value as MeetingRecurrence,
                    }))
                  }
                  className={fieldClass}
                >
                  {MEETING_RECURRENCE_OPTIONS.map((s) => (
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
                    setForm((f) => ({ ...f, status: e.target.value as MeetingStatus }))
                  }
                  className={fieldClass}
                >
                  {MEETING_STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Video Link
              <Input
                value={form.videoLink}
                onChange={(e) => setForm((f) => ({ ...f, videoLink: e.target.value }))}
                className="h-9 rounded-none"
                placeholder="https://..."
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Agenda / Description
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
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
              {formMode === "edit" ? "Save Changes" : "Schedule Meeting"}
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
