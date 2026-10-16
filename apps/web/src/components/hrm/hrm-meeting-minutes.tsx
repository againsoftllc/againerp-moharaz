"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar, Eye, FileText, Filter, Pencil, Plus, Search, Trash2, User } from "lucide-react";
import {
  MINUTE_TYPE_LABEL,
  MINUTE_TYPE_OPTIONS,
  minuteRecorderAvatar,
  type MeetingMinute,
  type MinuteType,
} from "@/lib/mock-data/hrm-meeting-minutes";
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
import {
  createMeetingMinuteView,
  deleteMeetingMinuteView,
  listMeetingMinuteFormOptions,
  listMeetingMinutesView,
  updateMeetingMinuteView,
} from "@/lib/api/hrm-meetings";

const GREEN_BTN =
  "rounded-none bg-[#4caf50] text-white hover:bg-[#43a047] border-transparent";

type SortKey = "meetingTitle" | "topic" | "minuteType" | "recordedAt" | "recordedByName";
type SortDir = "asc" | "desc";

type FormState = {
  meetingKey: string;
  topic: string;
  minuteType: MinuteType;
  content: string;
  recordedById: string;
  recordedAt: string;
};

function todayYmd() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function meetingKey(title: string, date: string) {
  return `${title}||${date}`;
}

function parseMeetingKey(key: string) {
  const [title, date] = key.split("||");
  return { title: title ?? "", date: date ?? "" };
}

type FormOptions = {
  meetings: { title: string; date: string }[];
  recorders: { id: string; name: string }[];
};

function emptyForm(opts?: FormOptions): FormState {
  const m = opts?.meetings?.[0];
  const r = opts?.recorders?.[0];
  return {
    meetingKey: m ? meetingKey(m.title, m.date) : "",
    topic: "",
    minuteType: "note",
    content: "",
    recordedById: r?.id ?? "",
    recordedAt: todayYmd(),
  };
}

function formFromRow(row: MeetingMinute): FormState {
  return {
    meetingKey: meetingKey(row.meetingTitle, row.meetingDate),
    topic: row.topic,
    minuteType: row.minuteType,
    content: row.content,
    recordedById: row.recordedById,
    recordedAt: row.recordedAt,
  };
}

function typeBadgeClass(type: MinuteType) {
  switch (type) {
    case "note":
      return "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300";
    case "action_item":
      return "border-orange-500/30 bg-orange-500/15 text-orange-800 dark:text-orange-300";
    case "decision":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    default:
      return "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300";
  }
}

export function HrmMeetingMinutes() {
  const canWrite = useAdminCanWrite();
  const [rows, setRows] = useState<MeetingMinute[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOptions, setFormOptions] = useState<FormOptions | null>(null);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftType, setDraftType] = useState<"all" | MinuteType>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | MinuteType>("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("recordedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [viewRow, setViewRow] = useState<MeetingMinute | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [opts, data] = await Promise.all([listMeetingMinuteFormOptions(), listMeetingMinutesView()]);
        if (cancelled) return;
        setFormOptions(opts);
        setRows(data);
        setForm(emptyForm(opts));
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load meeting minutes");
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
    if (typeFilter !== "all") list = list.filter((r) => r.minuteType === typeFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.meetingTitle.toLowerCase().includes(q) ||
          r.topic.toLowerCase().includes(q) ||
          r.recordedByName.toLowerCase().includes(q) ||
          r.content.toLowerCase().includes(q),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => String(a[sortKey]).localeCompare(String(b[sortKey])) * dir);
  }, [rows, typeFilter, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "recordedAt" ? "desc" : "asc");
    }
  }

  function openAdd() {
    if (!formOptions) return;
    setFormMode("add");
    setEditId(null);
    setForm(emptyForm(formOptions));
    setFormOpen(true);
  }

  function openEdit(row: MeetingMinute) {
    setFormMode("edit");
    setEditId(row.id);
    setForm(formFromRow(row));
    setFormOpen(true);
  }

  async function saveForm() {
    if (!formOptions) return;
    if (!form.topic.trim()) {
      toast.error("Topic is required");
      return;
    }
    const meeting = parseMeetingKey(form.meetingKey);
    const recorder = formOptions.recorders.find((r) => r.id === form.recordedById);
    if (!meeting.title || !recorder) {
      toast.error("Meeting and recorder are required");
      return;
    }

    const payload: Omit<MeetingMinute, "id"> = {
      meetingTitle: meeting.title,
      meetingDate: meeting.date,
      topic: form.topic.trim(),
      minuteType: form.minuteType,
      content: form.content.trim(),
      recordedById: recorder.id,
      recordedByName: recorder.name,
      recordedAt: form.recordedAt || todayYmd(),
    };
    setSaving(true);
    try {
      if (formMode === "edit" && editId) {
        const updated = await updateMeetingMinuteView(editId, payload);
        setRows((prev) => prev.map((r) => (r.id === editId ? updated : r)));
        setViewRow((v) => (v?.id === editId ? updated : v));
        toast.success("Minute updated");
      } else {
        const created = await createMeetingMinuteView(payload);
        setRows((prev) => [created, ...prev]);
        toast.success("Minute added");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: MeetingMinute) {
    setSaving(true);
    try {
      await deleteMeetingMinuteView(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setViewRow((v) => (v?.id === row.id ? null : v));
      toast.success("Minute deleted");
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
          Meeting Minutes
        </h1>
        {canWrite ? (
          <Button type="button" size="sm" className={GREEN_BTN} onClick={openAdd}>
            <Plus className="size-3.5" />
            Add Minute
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
              Type
              <select
                value={draftType}
                onChange={(e) => setDraftType(e.target.value as "all" | MinuteType)}
                className={fieldClass}
              >
                <option value="all">All</option>
                {MINUTE_TYPE_OPTIONS.map((s) => (
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
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto rounded-none border border-border bg-card">
        <table className="w-full min-w-[1000px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60">
            <tr className="border-b border-border text-left">
              <th className="w-12 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                #
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Meeting" col="meetingTitle" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Topic" col="topic" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Type" col="minuteType" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Recorded By" col="recordedByName" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Recorded At" col="recordedAt" />
              </th>
              <th className="w-[1%] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Loading meeting minutes...
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No meeting minutes found.
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => (
                <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-muted/20">
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                    {(pageSafe - 1) * perPage + idx + 1}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-foreground">{row.meetingTitle}</div>
                    <div className="text-xs tabular-nums text-muted-foreground">
                      {row.meetingDate}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 font-medium text-foreground">{row.topic}</td>
                  <td className="px-3 py-2.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-none text-[10px] font-normal",
                        typeBadgeClass(row.minuteType),
                      )}
                    >
                      {MINUTE_TYPE_LABEL[row.minuteType]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={minuteRecorderAvatar(row.recordedById)}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-none border border-border object-cover"
                      />
                      <span className="font-medium text-foreground">{row.recordedByName}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{row.recordedAt}</td>
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
          title="Minute details"
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center border border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                <FileText className="size-4" />
              </div>
              <div>
                <SheetTitle className="text-base">Meeting Minute Details</SheetTitle>
                <SheetDescription className="sr-only">View meeting minute</SheetDescription>
              </div>
            </div>
          </SheetHeader>
          {viewRow ? (
            <div className="flex-1 space-y-5 overflow-auto p-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <FileText className="size-3.5" /> Topic
                  </div>
                  <div className="font-semibold text-foreground">{viewRow.topic}</div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="size-3.5" /> Meeting
                  </div>
                  <div className="text-sm font-medium">{viewRow.meetingTitle}</div>
                  <div className="text-xs text-muted-foreground">{viewRow.meetingDate}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Type</div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "rounded-none text-[10px] font-normal",
                      typeBadgeClass(viewRow.minuteType),
                    )}
                  >
                    {MINUTE_TYPE_LABEL[viewRow.minuteType]}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <User className="size-3.5" /> Recorded By
                  </div>
                  <div className="text-sm font-medium">{viewRow.recordedByName}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Recorded At</div>
                  <div className="text-sm font-medium">{viewRow.recordedAt}</div>
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Content</div>
                <p className="border border-border bg-muted/20 p-3 text-sm text-foreground whitespace-pre-wrap">
                  {viewRow.content || "—"}
                </p>
              </div>
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
          title={formMode === "edit" ? "Edit Minute" : "Add Minute"}
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base">
              {formMode === "edit" ? "Edit Minute" : "Add Minute"}
            </SheetTitle>
            <SheetDescription className="sr-only">Meeting minute form</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-3 overflow-auto p-4">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Meeting *
              <select
                value={form.meetingKey}
                onChange={(e) => setForm((f) => ({ ...f, meetingKey: e.target.value }))}
                className={fieldClass}
              >
                {formOptions?.meetings?.map((m) => {
                  const key = meetingKey(m.title, m.date);
                  return (
                    <option key={key} value={key}>
                      {m.title} ({m.date})
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Topic *
              <Input
                value={form.topic}
                onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
                className="h-9 rounded-none"
                placeholder="e.g. Team Building Event"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Type
              <select
                value={form.minuteType}
                onChange={(e) =>
                  setForm((f) => ({ ...f, minuteType: e.target.value as MinuteType }))
                }
                className={fieldClass}
              >
                {MINUTE_TYPE_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Content
              <Textarea
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                className="min-h-[100px] rounded-none"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Recorded By
                <select
                  value={form.recordedById}
                  onChange={(e) => setForm((f) => ({ ...f, recordedById: e.target.value }))}
                  className={fieldClass}
                >
                  {formOptions?.recorders?.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Recorded At
                <Input
                  type="date"
                  value={form.recordedAt}
                  onChange={(e) => setForm((f) => ({ ...f, recordedAt: e.target.value }))}
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
              onClick={() => void saveForm()}
              disabled={saving}
            >
              {formMode === "edit" ? "Save Changes" : "Add Minute"}
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
