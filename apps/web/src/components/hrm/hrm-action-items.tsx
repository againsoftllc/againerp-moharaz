"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Calendar,
  CheckSquare,
  Eye,
  FileText,
  Filter,
  Pencil,
  Plus,
  Search,
  SquareCheck,
  Trash2,
  TrendingUp,
  User,
} from "lucide-react";
import {
  ACTION_PRIORITY_LABEL,
  ACTION_PRIORITY_OPTIONS,
  ACTION_STATUS_LABEL,
  actionAssigneeAvatar,
  daysOverdue,
  resolveActionStatus,
  type ActionPriority,
  type ActionStatus,
  type MeetingActionItem,
} from "@/lib/mock-data/hrm-action-items";
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
  completeActionItemView,
  createActionItemView,
  deleteActionItemView,
  listActionItemFormOptions,
  listActionItemsView,
  updateActionItemView,
} from "@/lib/api/hrm-meetings";

const GREEN_BTN =
  "rounded-none bg-[#4caf50] text-white hover:bg-[#43a047] border-transparent";

type SortKey = "title" | "assigneeName" | "dueDate" | "priority" | "progress";
type SortDir = "asc" | "desc";

type FormState = {
  title: string;
  meetingTitle: string;
  assigneeId: string;
  dueDate: string;
  priority: ActionPriority;
  progress: string;
  description: string;
  notes: string;
};

function todayYmd() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

type FormOptions = {
  assignees: { id: string; name: string }[];
  meetings: { title: string }[];
};

function emptyForm(opts?: FormOptions): FormState {
  return {
    title: "",
    meetingTitle: opts?.meetings?.[0]?.title ?? "",
    assigneeId: opts?.assignees?.[0]?.id ?? "",
    dueDate: todayYmd(),
    priority: "medium",
    progress: "0",
    description: "",
    notes: "",
  };
}

function formFromRow(row: MeetingActionItem): FormState {
  return {
    title: row.title,
    meetingTitle: row.meetingTitle,
    assigneeId: row.assigneeId,
    dueDate: row.dueDate,
    priority: row.priority,
    progress: String(row.progress),
    description: row.description,
    notes: row.notes,
  };
}

function priorityBadgeClass(priority: ActionPriority) {
  switch (priority) {
    case "critical":
      return "border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300";
    case "high":
      return "border-orange-500/30 bg-orange-500/15 text-orange-800 dark:text-orange-300";
    case "medium":
      return "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300";
    default:
      return "border-border bg-muted/40 text-muted-foreground";
  }
}

function statusBadgeClass(status: ActionStatus) {
  switch (status) {
    case "completed":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "overdue":
      return "border-rose-500/30 bg-rose-500/15 text-rose-800 dark:text-rose-300";
    case "in_progress":
      return "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300";
    default:
      return "border-border bg-muted/40 text-muted-foreground";
  }
}

function progressBarClass(status: ActionStatus) {
  return status === "completed"
    ? "bg-emerald-500"
    : status === "overdue"
      ? "bg-rose-500"
      : "bg-[#4caf50]";
}

function DetailField({
  icon,
  label,
  children,
  className,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="text-muted-foreground/80">{icon}</span>
        {label}
      </div>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

function ActionItemDetails({ row }: { row: MeetingActionItem }) {
  const pct = Math.min(100, Math.max(0, row.progress));
  return (
    <div className="flex-1 space-y-5 overflow-auto p-4">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <DetailField icon={<CheckSquare className="size-3.5" />} label="Title">
          <div>
            <div className="font-semibold">{row.title}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{row.meetingTitle}</div>
          </div>
        </DetailField>
        <DetailField icon={<User className="size-3.5" />} label="Assigned To">
          <span className="font-medium">{row.assigneeName}</span>
        </DetailField>
        <DetailField icon={<Calendar className="size-3.5" />} label="Due Date">
          {row.dueDate}
        </DetailField>
        <DetailField icon={<AlertTriangle className="size-3.5" />} label="Priority">
          <Badge
            variant="outline"
            className={cn("rounded-none text-[10px]", priorityBadgeClass(row.priority))}
          >
            {ACTION_PRIORITY_LABEL[row.priority]}
          </Badge>
        </DetailField>
        <DetailField icon={<FileText className="size-3.5" />} label="Status">
          <Badge
            variant="outline"
            className={cn("rounded-none text-[10px]", statusBadgeClass(row.status))}
          >
            {ACTION_STATUS_LABEL[row.status]}
          </Badge>
        </DetailField>
        <DetailField icon={<SquareCheck className="size-3.5" />} label="Progress">
          <div className="flex items-center gap-2">
            <div className="h-2 min-w-0 flex-1 border border-border bg-muted">
              <div
                className={cn("h-full", progressBarClass(row.status))}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="shrink-0 text-xs font-medium tabular-nums">{pct}%</span>
          </div>
        </DetailField>
      </div>

      <DetailField icon={<FileText className="size-3.5" />} label="Description">
        {row.description || "—"}
      </DetailField>
      <DetailField icon={<FileText className="size-3.5" />} label="Notes">
        {row.notes || "—"}
      </DetailField>
    </div>
  );
}

export function HrmActionItems() {
  const canWrite = useAdminCanWrite();
  const [rows, setRows] = useState<MeetingActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOptions, setFormOptions] = useState<FormOptions | null>(null);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftPriority, setDraftPriority] = useState<"all" | ActionPriority>("all");
  const [draftStatus, setDraftStatus] = useState<"all" | ActionStatus>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | ActionPriority>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | ActionStatus>("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("dueDate");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [viewRow, setViewRow] = useState<MeetingActionItem | null>(null);
  const [trackRow, setTrackRow] = useState<MeetingActionItem | null>(null);
  const [trackProgress, setTrackProgress] = useState("0");
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [opts, data] = await Promise.all([listActionItemFormOptions(), listActionItemsView()]);
        if (cancelled) return;
        setFormOptions(opts);
        setRows(data);
        setForm(emptyForm(opts));
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load action items");
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
    if (priorityFilter !== "all") list = list.filter((r) => r.priority === priorityFilter);
    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.meetingTitle.toLowerCase().includes(q) ||
          r.assigneeName.toLowerCase().includes(q),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, priorityFilter, statusFilter, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "dueDate" || key === "progress" ? "asc" : "asc");
    }
  }

  function openAdd() {
    if (!formOptions) return;
    setFormMode("add");
    setEditId(null);
    setForm(emptyForm(formOptions));
    setFormOpen(true);
  }

  function openEdit(row: MeetingActionItem) {
    setFormMode("edit");
    setEditId(row.id);
    setForm(formFromRow(row));
    setFormOpen(true);
  }

  function openTrack(row: MeetingActionItem) {
    setTrackRow(row);
    setTrackProgress(String(row.progress));
  }

  async function saveTrack() {
    if (!trackRow) return;
    const progress = Math.min(100, Math.max(0, Number(trackProgress) || 0));
    try {
      setSaving(true);
      await completeActionItemView(trackRow.id, progress);
      const data = await listActionItemsView();
      setRows(data);
      setViewRow((v) => (v?.id === trackRow.id ? data.find((r) => r.id === trackRow.id) ?? null : v));
      setTrackRow(null);
      toast.success("Progress updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update progress");
    } finally {
      setSaving(false);
    }
  }

  async function saveForm() {
    if (!form.title.trim() || !form.dueDate) {
      toast.error("Title and due date are required");
      return;
    }
    if (!formOptions) return;
    const assignee = formOptions.assignees.find((a) => a.id === form.assigneeId);
    if (!assignee) {
      toast.error("Select an assignee");
      return;
    }
    const progress = Math.min(100, Math.max(0, Number(form.progress) || 0));
    const status = resolveActionStatus(progress, form.dueDate, todayYmd());

    const createPayload: Omit<MeetingActionItem, "id"> = {
      title: form.title.trim(),
      meetingTitle: form.meetingTitle,
      assigneeId: assignee.id,
      assigneeName: assignee.name,
      dueDate: form.dueDate,
      priority: form.priority,
      progress,
      status,
      description: form.description.trim(),
      notes: form.notes.trim(),
    };

    setSaving(true);
    try {
      if (formMode === "edit" && editId) {
        await updateActionItemView(editId, {
          title: createPayload.title,
          assigneeId: createPayload.assigneeId,
          dueDate: createPayload.dueDate,
          priority: createPayload.priority,
          progress: createPayload.progress,
          description: createPayload.description,
          notes: createPayload.notes,
        });
        toast.success("Action item updated");
      } else {
        await createActionItemView(createPayload);
        toast.success("Action item created");
      }

      const data = await listActionItemsView();
      setRows(data);
      setViewRow((v) => (v ? data.find((r) => r.id === v.id) ?? null : null));
      setTrackRow((t) => (t ? data.find((r) => r.id === t.id) ?? null : null));
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: MeetingActionItem) {
    setSaving(true);
    try {
      await deleteActionItemView(row.id);
      const data = await listActionItemsView();
      setRows(data);
      setViewRow((v) => (v?.id === row.id ? null : v));
      setTrackRow((v) => (v?.id === row.id ? null : v));
      toast.success("Action item deleted");
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
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Action Items</h1>
        {canWrite ? (
          <Button type="button" size="sm" className={GREEN_BTN} onClick={openAdd}>
            <Plus className="size-3.5" />
            Add Action Item
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
              Priority
              <select
                value={draftPriority}
                onChange={(e) => setDraftPriority(e.target.value as "all" | ActionPriority)}
                className={fieldClass}
              >
                <option value="all">All</option>
                {ACTION_PRIORITY_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[140px] flex-col gap-1 text-xs text-muted-foreground">
              Status
              <select
                value={draftStatus}
                onChange={(e) => setDraftStatus(e.target.value as "all" | ActionStatus)}
                className={fieldClass}
              >
                <option value="all">All</option>
                {(Object.keys(ACTION_STATUS_LABEL) as ActionStatus[]).map((k) => (
                  <option key={k} value={k}>
                    {ACTION_STATUS_LABEL[k]}
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
                  setPriorityFilter(draftPriority);
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
                  setDraftPriority("all");
                  setDraftStatus("all");
                  setPriorityFilter("all");
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
                <SortHeader label="Action Item" col="title" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Assigned To" col="assigneeName" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Due Date" col="dueDate" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Priority" col="priority" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Progress" col="progress" />
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
                  Loading action items...
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No action items found.
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => {
                const overdue = daysOverdue(row.dueDate, todayYmd());
                return (
                  <tr
                    key={row.id}
                    className="border-b border-border last:border-b-0 hover:bg-muted/20"
                  >
                    <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                      {(pageSafe - 1) * perPage + idx + 1}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-foreground">{row.title}</div>
                      <div className="text-xs text-muted-foreground">{row.meetingTitle}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={actionAssigneeAvatar(row.assigneeId)}
                          alt=""
                          className="h-8 w-8 shrink-0 rounded-none border border-border object-cover"
                        />
                        <span className="font-medium text-foreground">{row.assigneeName}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="tabular-nums text-foreground">{row.dueDate}</div>
                      {overdue != null && row.status !== "completed" ? (
                        <div className="text-xs text-red-600 dark:text-red-400">
                          {overdue} day{overdue === 1 ? "" : "s"} overdue
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-none text-[10px] font-normal",
                          priorityBadgeClass(row.priority),
                        )}
                      >
                        {ACTION_PRIORITY_LABEL[row.priority]}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="min-w-[120px] space-y-1">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="tabular-nums font-medium">{row.progress}%</span>
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-none text-[10px] font-normal",
                              statusBadgeClass(row.status),
                            )}
                          >
                            {ACTION_STATUS_LABEL[row.status]}
                          </Badge>
                        </div>
                        <div className="h-1.5 w-full rounded-none bg-muted">
                          <div
                            className={cn("h-full rounded-none", progressBarClass(row.status))}
                            style={{ width: `${row.progress}%` }}
                          />
                        </div>
                      </div>
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
                              onClick={() => openTrack(row)}
                              aria-label="Track progress"
                            >
                              <TrendingUp className="h-3.5 w-3.5" />
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

      <Sheet open={!!viewRow} onOpenChange={(o) => !o && setViewRow(null)}>
        <SheetContent
          side="right"
          resizable
          closeButton="chevron"
          className="flex w-[440px] min-w-[160px] max-w-[720px] flex-col gap-0 p-0"
          title="Action item details"
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center border border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                <CheckSquare className="size-4" />
              </div>
              <div>
                <SheetTitle className="text-base">Action Item Details</SheetTitle>
                <SheetDescription className="sr-only">View action item</SheetDescription>
              </div>
            </div>
          </SheetHeader>
          {viewRow ? <ActionItemDetails row={viewRow} /> : null}
        </SheetContent>
      </Sheet>

      <Sheet open={!!trackRow} onOpenChange={(o) => !o && setTrackRow(null)}>
        <SheetContent
          side="right"
          resizable
          closeButton="chevron"
          className="flex w-[380px] min-w-[160px] max-w-[720px] flex-col gap-0 p-0"
          title="Track progress"
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base">Track Progress</SheetTitle>
            <SheetDescription className="text-xs">
              {trackRow?.title}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-3 overflow-auto p-4">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Progress (%)
              <Input
                type="number"
                min={0}
                max={100}
                value={trackProgress}
                onChange={(e) => setTrackProgress(e.target.value)}
                className="h-9 rounded-none"
              />
            </label>
          </div>
          <div className="flex gap-2 border-t border-border p-4">
            <Button
              type="button"
              size="sm"
              className={cn("h-9", GREEN_BTN)}
              onClick={() => void saveTrack()}
              disabled={saving}
            >
              Save Progress
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-none"
              onClick={() => setTrackRow(null)}
            >
              Cancel
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent
          side="right"
          resizable
          closeButton="chevron"
          className="flex w-[440px] min-w-[160px] max-w-[720px] flex-col gap-0 p-0"
          title={formMode === "edit" ? "Edit Action Item" : "Add Action Item"}
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base">
              {formMode === "edit" ? "Edit Action Item" : "Add Action Item"}
            </SheetTitle>
            <SheetDescription className="sr-only">Action item form</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-3 overflow-auto p-4">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Title *
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="h-9 rounded-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Meeting
              <select
                value={form.meetingTitle}
                onChange={(e) => setForm((f) => ({ ...f, meetingTitle: e.target.value }))}
                className={fieldClass}
              >
                {formOptions?.meetings?.map((m) => (
                  <option key={m.title} value={m.title}>
                    {m.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Assigned To *
              <select
                value={form.assigneeId}
                onChange={(e) => setForm((f) => ({ ...f, assigneeId: e.target.value }))}
                className={fieldClass}
              >
                {formOptions?.assignees?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Due Date *
                <Input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                  className="h-9 rounded-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Priority
                <select
                  value={form.priority}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, priority: e.target.value as ActionPriority }))
                  }
                  className={fieldClass}
                >
                  {ACTION_PRIORITY_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Progress (%)
              <Input
                type="number"
                min={0}
                max={100}
                value={form.progress}
                onChange={(e) => setForm((f) => ({ ...f, progress: e.target.value }))}
                className="h-9 rounded-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Description
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="min-h-[72px] rounded-none"
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
              {formMode === "edit" ? "Save Changes" : "Create Item"}
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
