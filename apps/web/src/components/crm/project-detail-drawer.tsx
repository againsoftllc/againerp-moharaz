"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Clock, LayoutGrid, List as ListIcon, Pencil, Plus, Star, Trash2, Upload, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { KanbanColumn } from "@/components/shared/kanban/kanban-column";
import { AgainListGrid, NUMERIC_CELL, NUMERIC_HEADER } from "@/components/shared/again-list-grid";
import { GridChipBadge } from "@/components/shared/grid-chip-badge";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { fetchMentionableUsers } from "@/lib/api/auth-users";
import { formatCompanyIsoCell } from "@/lib/localisation/company-format";
import { getCompanyFormat } from "@/lib/store/company-format-store";
import { fetchFinanceReceivables, fetchFinancePayments, type ApiFinanceReceivable, type ApiFinancePayment } from "@/lib/api/finance";
import { fetchExpenses, type ApiExpense } from "@/lib/api/expenses";
import {
  fetchCollabActivity,
  fetchCollabComments,
  createCollabComment,
  fetchCollabFiles,
  uploadCollabFile,
  deleteCollabFile,
  COLLAB_ACTION_LABELS,
  type CollabActivity,
  type CollabComment,
  type CollabFile,
} from "@/lib/api/collaboration";
import {
  fetchCrmMilestones,
  createCrmMilestone,
  updateCrmMilestone,
  fetchCrmTasks,
  updateCrmTask,
  fetchCrmTimeEntries,
  createCrmTimeEntry,
  deleteCrmTimeEntry,
  fetchCrmProjectMembers,
  addCrmProjectMember,
  removeCrmProjectMember,
  fetchCrmProjectFeedback,
  addCrmProjectFeedback,
  type ApiCrmMilestone,
  type ApiCrmProject,
  type ApiCrmTask,
  type ApiCrmTimeEntry,
  type ApiCrmProjectMember,
  type ApiCrmProjectFeedback,
} from "@/lib/api/crm";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";

const ENTITY = "project";

function money(value: string | null) {
  if (value === null) return "—";
  const n = Number(value);
  return Number.isFinite(n) ? formatCurrency(n) : value;
}

function statusVariant(status: string) {
  if (status === "completed") return "success" as const;
  if (status === "active") return "warning" as const;
  if (status === "cancelled") return "muted" as const;
  return "outline" as const;
}

type TimelineEntry =
  | { kind: "activity"; id: string; created_at: string; data: CollabActivity }
  | { kind: "comment"; id: string; created_at: string; data: CollabComment };

function isCommentEntry(e: TimelineEntry): e is Extract<TimelineEntry, { kind: "comment" }> {
  return e.kind === "comment";
}
function isActivityEntry(e: TimelineEntry): e is Extract<TimelineEntry, { kind: "activity" }> {
  return e.kind === "activity";
}

type Tab =
  | "overview"
  | "tasks"
  | "milestones"
  | "files"
  | "contracts"
  | "notes"
  | "feedback"
  | "timesheets"
  | "invoices"
  | "payments"
  | "expenses"
  | "activity";

const TASK_COLUMNS: ApiCrmTask["status"][] = ["todo", "in_progress", "done", "cancelled"];
const TASK_STATUS_LABELS: Record<ApiCrmTask["status"], string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
  cancelled: "Cancelled",
};
const FILE_TYPE_OPTIONS = ["document", "contract", "image", "certificate", "other"] as const;

function financeDateCell(p: { value?: string | null }) {
  return p.value ? (formatCompanyIsoCell(p.value, getCompanyFormat()) as string) : "—";
}

const RECEIVABLE_COLUMNS: ColDef<ApiFinanceReceivable>[] = [
  { field: "invoice_number", headerName: "Invoice #", flex: 1, minWidth: 130 },
  { field: "due_date", headerName: "Due", width: 100, valueFormatter: financeDateCell },
  {
    colId: "amount",
    headerName: "Amount",
    width: 100,
    headerClass: NUMERIC_HEADER,
    cellClass: NUMERIC_CELL,
    valueGetter: (p) => Number(p.data?.amount ?? 0),
    valueFormatter: (p) => formatCurrency(Number(p.data?.amount ?? 0)),
  },
  {
    colId: "balance",
    headerName: "Balance",
    width: 100,
    headerClass: NUMERIC_HEADER,
    cellClass: NUMERIC_CELL,
    valueGetter: (p) => Number(p.data?.balance ?? 0),
    valueFormatter: (p) => formatCurrency(Number(p.data?.balance ?? 0)),
  },
  {
    field: "status",
    headerName: "Status",
    width: 100,
    cellRenderer: (p: ICellRendererParams<ApiFinanceReceivable>) =>
      p.data ? (
        <GridChipBadge className="capitalize">{p.data.status}</GridChipBadge>
      ) : null,
  },
];

const PAYMENT_COLUMNS: ColDef<ApiFinancePayment>[] = [
  { field: "payment_number", headerName: "Payment #", flex: 1, minWidth: 130 },
  { field: "payment_date", headerName: "Date", width: 100, valueFormatter: financeDateCell },
  {
    colId: "amount",
    headerName: "Amount",
    width: 100,
    headerClass: NUMERIC_HEADER,
    cellClass: NUMERIC_CELL,
    valueGetter: (p) => Number(p.data?.amount ?? 0),
    valueFormatter: (p) => formatCurrency(Number(p.data?.amount ?? 0)),
  },
  { field: "payment_method", headerName: "Method", width: 100, cellClass: "capitalize" },
  {
    field: "direction",
    headerName: "Direction",
    width: 90,
    cellRenderer: (p: ICellRendererParams<ApiFinancePayment>) =>
      p.data ? (
        <GridChipBadge variant={p.data.direction === "inbound" ? "success" : "outline"} className="capitalize">
          {p.data.direction}
        </GridChipBadge>
      ) : null,
  },
];

const EXPENSE_COLUMNS: ColDef<ApiExpense>[] = [
  { field: "expense_number", headerName: "Expense #", flex: 1, minWidth: 120 },
  { field: "payee", headerName: "Payee", flex: 1, minWidth: 120 },
  { field: "expense_date", headerName: "Date", width: 100, valueFormatter: financeDateCell },
  {
    colId: "total",
    headerName: "Amount",
    width: 100,
    headerClass: NUMERIC_HEADER,
    cellClass: NUMERIC_CELL,
    valueGetter: (p) => Number(p.data?.total ?? 0),
    valueFormatter: (p) => formatCurrency(Number(p.data?.total ?? 0)),
  },
  {
    field: "status",
    headerName: "Status",
    width: 100,
    cellRenderer: (p: ICellRendererParams<ApiExpense>) =>
      p.data ? (
        <GridChipBadge className="capitalize">{p.data.status}</GridChipBadge>
      ) : null,
  },
];

function priorityVariant(priority: string) {
  if (priority === "urgent") return "warning" as const;
  if (priority === "high") return "warning" as const;
  if (priority === "low") return "muted" as const;
  return "outline" as const;
}

function TaskCard({ task, dragging }: { task: ApiCrmTask; dragging?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-none border border-border bg-card p-2 text-left shadow-sm transition-colors",
        dragging ? "opacity-40" : "hover:border-primary/40",
      )}
    >
      <p className="truncate text-xs font-medium">{task.title}</p>
      <div className="mt-1 flex items-center gap-1.5">
        <Badge variant={priorityVariant(task.priority)} className="capitalize text-[9px]">
          {task.priority}
        </Badge>
        <span className="text-[10px] text-muted-foreground">{task.points} pt{task.points === 1 ? "" : "s"}</span>
        {task.due_date && <span className="text-[10px] text-muted-foreground">· {task.due_date}</span>}
      </div>
    </div>
  );
}

function ProgressRing({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const r = 30;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;
  return (
    <svg width="72" height="72" viewBox="0 0 76 76" className="shrink-0">
      <circle cx="38" cy="38" r={r} fill="none" strokeWidth="7" className="stroke-border" />
      <circle
        cx="38"
        cy="38"
        r={r}
        fill="none"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform="rotate(-90 38 38)"
        className="stroke-primary transition-[stroke-dashoffset]"
      />
      <text x="38" y="43" textAnchor="middle" className="fill-foreground text-[13px] font-semibold">
        {Math.round(clamped)}%
      </text>
    </svg>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function FilesPanel({
  project,
  fixedType,
  busy,
  setBusy,
}: {
  project: ApiCrmProject;
  fixedType?: (typeof FILE_TYPE_OPTIONS)[number];
  busy: boolean;
  setBusy: (b: boolean) => void;
}) {
  const [files, setFiles] = React.useState<CollabFile[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [uploadFileType, setUploadFileType] = React.useState<(typeof FILE_TYPE_OPTIONS)[number]>(fixedType ?? "document");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setFiles(await fetchCollabFiles(ENTITY, project.id, fixedType));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load files");
    } finally {
      setLoading(false);
    }
  }, [project.id, fixedType]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function handleUpload(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadCollabFile(ENTITY, project.id, file, fixedType ?? uploadFileType);
      toast.success("File uploaded");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(file: CollabFile) {
    setBusy(true);
    try {
      await deleteCollabFile(ENTITY, project.id, file.id);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete file");
    } finally {
      setBusy(false);
    }
  }

  const noun = fixedType === "contract" ? "contracts" : "files";

  return (
    <div className="mt-3">
      <div className="mb-3 flex items-center gap-2">
        {!fixedType && (
          <select
            value={uploadFileType}
            onChange={(e) => setUploadFileType(e.target.value as (typeof FILE_TYPE_OPTIONS)[number])}
            className="h-7 rounded-none border border-input bg-background px-1.5 text-[11px] capitalize"
          >
            {FILE_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t} className="capitalize">
                {t}
              </option>
            ))}
          </select>
        )}
        <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => void handleUpload(e.target.files)} />
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[11px]"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="mr-1 h-3 w-3" /> {uploading ? "Uploading…" : fixedType === "contract" ? "Upload contract" : "Upload file"}
        </Button>
      </div>

      {loading ? (
        <p className="py-6 text-center text-xs text-muted-foreground">Loading…</p>
      ) : files.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">No {noun} yet.</p>
      ) : (
        <div className="space-y-1.5">
          {files.map((file) => (
            <div key={file.id} className="flex items-center justify-between border border-border p-2">
              <div className="min-w-0">
                <a
                  href={file.storage_ref}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-xs font-medium text-primary hover:underline"
                >
                  {file.filename}
                </a>
                <div className="mt-0.5 flex items-center gap-1.5">
                  {!fixedType && (
                    <Badge variant="muted" className="capitalize text-[9px]">
                      {file.file_type}
                    </Badge>
                  )}
                  <span className="text-[10px] text-muted-foreground">{Math.max(1, Math.round(file.size_bytes / 1024))} KB</span>
                  <span className="text-[10px] text-muted-foreground">· {formatDateTime(file.created_at)}</span>
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-1.5 text-muted-foreground hover:text-destructive"
                disabled={busy}
                onClick={() => void handleDelete(file)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FeedbackPanel({ project }: { project: ApiCrmProject }) {
  const [rows, setRows] = React.useState<ApiCrmProjectFeedback[]>([]);
  const [average, setAverage] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [formOpen, setFormOpen] = React.useState(false);
  const [rating, setRating] = React.useState(5);
  const [comment, setComment] = React.useState("");
  const [submittedBy, setSubmittedBy] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchCrmProjectFeedback(project.id);
      setRows(res.data);
      setAverage(res.average_rating);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load feedback");
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit() {
    setSaving(true);
    try {
      await addCrmProjectFeedback(project.id, {
        rating,
        comment: comment.trim() || undefined,
        submitted_by_name: submittedBy.trim() || undefined,
      });
      toast.success("Feedback recorded");
      setFormOpen(false);
      setRating(5);
      setComment("");
      setSubmittedBy("");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save feedback");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3">
      <div className="mb-3 flex items-center justify-between">
        {formOpen ? (
          <div className="w-full space-y-2 border border-input bg-muted/30 p-2.5">
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => setRating(n)} className="p-0.5">
                  <Star className={cn("h-4 w-4", n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
                </button>
              ))}
            </div>
            <Input
              placeholder="Submitted by (optional)"
              value={submittedBy}
              onChange={(e) => setSubmittedBy(e.target.value)}
              className="h-7 text-xs"
            />
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              placeholder="Comment (optional)"
              className="w-full rounded-none border border-input bg-background px-2.5 py-1.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" className="h-7 px-2 text-[11px]" disabled={saving} onClick={() => void handleSubmit()}>
                Save feedback
              </Button>
            </div>
          </div>
        ) : (
          <>
            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setFormOpen(true)}>
              <Plus className="mr-1 h-3 w-3" /> Add feedback
            </Button>
            {average != null && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                <span className="font-medium text-foreground">{average}</span> / 5 ({rows.length})
              </span>
            )}
          </>
        )}
      </div>

      {loading ? (
        <p className="py-6 text-center text-xs text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">No feedback yet.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((f) => (
            <div key={f.id} className="border border-border p-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star key={n} className={cn("h-3 w-3", n <= f.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
                  ))}
                </div>
                <span className="text-[10px] text-muted-foreground">{formatDateTime(f.created_at)}</span>
              </div>
              {f.comment && <p className="mt-1 text-xs text-muted-foreground">{f.comment}</p>}
              {f.submitted_by_name && <p className="mt-0.5 text-[10px] text-muted-foreground">— {f.submitted_by_name}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function dayDiff(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86_400_000);
}

function MilestoneGantt({ project, milestones }: { project: ApiCrmProject; milestones: ApiCrmMilestone[] }) {
  const todayIso = new Date().toISOString().slice(0, 10);

  const candidates: string[] = [];
  if (project.start_date) candidates.push(project.start_date);
  if (project.due_date) candidates.push(project.due_date);
  for (const m of milestones) {
    if (m.start_date) candidates.push(m.start_date);
    if (m.due_date) candidates.push(m.due_date);
  }

  if (candidates.length === 0) {
    return (
      <p className="py-6 text-center text-xs text-muted-foreground">
        Add start or due dates to milestones (or the project) to see the timeline.
      </p>
    );
  }

  const sorted = [...candidates].sort();
  const padStart = new Date(`${sorted[0]}T00:00:00`);
  padStart.setDate(padStart.getDate() - 2);
  const padEnd = new Date(`${sorted[sorted.length - 1]}T00:00:00`);
  padEnd.setDate(padEnd.getDate() + 2);
  const rangeStart = padStart.toISOString().slice(0, 10);
  const rangeEnd = padEnd.toISOString().slice(0, 10);

  const totalDays = Math.max(1, dayDiff(rangeStart, rangeEnd));
  const todayOffset = dayDiff(rangeStart, todayIso);
  const todayPct = todayOffset >= 0 && todayOffset <= totalDays ? (todayOffset / totalDays) * 100 : null;

  return (
    <div className="mt-3">
      <div className="mb-2 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{rangeStart}</span>
        <span>{rangeEnd}</span>
      </div>
      <div className="relative space-y-2.5 border border-border p-3">
        {todayPct != null && (
          <div
            className="absolute bottom-3 top-3 z-10 w-px bg-destructive/70"
            style={{ left: `${todayPct}%` }}
            title={`Today — ${todayIso}`}
          />
        )}
        {milestones.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">No milestones yet.</p>
        ) : (
          milestones.map((m) => {
            const anchor = m.due_date ?? m.start_date;
            const isCompleted = m.status === "completed";
            if (!anchor) {
              return (
                <div key={m.id} className="flex items-center gap-2">
                  <span className="w-28 shrink-0 truncate text-[11px]" title={m.title}>
                    {m.title}
                  </span>
                  <span className="text-[10px] text-muted-foreground">No dates set</span>
                </div>
              );
            }
            const hasRange = Boolean(m.start_date && m.due_date && m.start_date !== m.due_date);
            const leftPct = (dayDiff(rangeStart, hasRange ? m.start_date! : anchor) / totalDays) * 100;
            const widthPct = hasRange ? Math.max(1.5, (dayDiff(m.start_date!, m.due_date!) / totalDays) * 100) : 0;
            const tooltip = hasRange
              ? `${m.title} — ${m.start_date} → ${m.due_date} (${m.status})`
              : `${m.title} — due ${anchor} (${m.status})`;
            return (
              <div key={m.id} className="flex items-center gap-2">
                <span className="w-28 shrink-0 truncate text-[11px]" title={m.title}>
                  {m.title}
                </span>
                <div className="relative h-5 flex-1">
                  {hasRange ? (
                    <div
                      className={cn(
                        "absolute top-1/2 h-2.5 -translate-y-1/2 rounded-none",
                        isCompleted ? "bg-emerald-500" : "bg-primary",
                      )}
                      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                      title={tooltip}
                    />
                  ) : (
                    <div
                      className={cn(
                        "absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rotate-45",
                        isCompleted ? "bg-emerald-500" : "bg-primary",
                      )}
                      style={{ left: `calc(${leftPct}% - 5px)` }}
                      title={tooltip}
                    />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 shrink-0 rounded-none bg-primary" /> Open
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 shrink-0 rounded-none bg-emerald-500" /> Completed
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-px shrink-0 bg-destructive/70" /> Today
        </span>
        <span>◆ = due date only, no range</span>
      </div>
    </div>
  );
}

function InvoicesPanel({ project }: { project: ApiCrmProject }) {
  const [rows, setRows] = React.useState<ApiFinanceReceivable[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    fetchFinanceReceivables({ project_id: project.id, limit: 200 })
      .then((res) => {
        if (active) setRows(res.data);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load invoices"))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [project.id]);

  return (
    <div className="mt-3">
      <p className="mb-2 text-[11px] text-muted-foreground">
        Invoices linked to this project.{" "}
        <Link href="/finance/receivables" className="text-primary hover:underline">
          Open Finance → Receivables
        </Link>{" "}
        to create or link one.
      </p>
      <AgainListGrid<ApiFinanceReceivable>
        embedded
        className="h-[360px]"
        rowData={rows}
        columnDefs={RECEIVABLE_COLUMNS}
        loading={loading}
        emptyTitle="No invoices linked yet."
        getRowId={(p) => p.data.id}
      />
    </div>
  );
}

function PaymentsPanel({ project }: { project: ApiCrmProject }) {
  const [rows, setRows] = React.useState<ApiFinancePayment[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    fetchFinancePayments({ project_id: project.id, limit: 200 })
      .then((res) => {
        if (active) setRows(res.data);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load payments"))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [project.id]);

  return (
    <div className="mt-3">
      <p className="mb-2 text-[11px] text-muted-foreground">
        Payments linked to this project.{" "}
        <Link href="/finance/payments" className="text-primary hover:underline">
          Open Finance → Payments
        </Link>{" "}
        to create or link one.
      </p>
      <AgainListGrid<ApiFinancePayment>
        embedded
        className="h-[360px]"
        rowData={rows}
        columnDefs={PAYMENT_COLUMNS}
        loading={loading}
        emptyTitle="No payments linked yet."
        getRowId={(p) => p.data.id}
      />
    </div>
  );
}

function ExpensesPanel({ project }: { project: ApiCrmProject }) {
  const [rows, setRows] = React.useState<ApiExpense[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    fetchExpenses({ project_id: project.id, limit: 200 })
      .then((res) => {
        if (active) setRows(res.data);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load expenses"))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [project.id]);

  return (
    <div className="mt-3">
      <p className="mb-2 text-[11px] text-muted-foreground">
        Expenses linked to this project.{" "}
        <Link href="/expenses" className="text-primary hover:underline">
          Open Expenses
        </Link>{" "}
        to create or link one.
      </p>
      <AgainListGrid<ApiExpense>
        embedded
        className="h-[360px]"
        rowData={rows}
        columnDefs={EXPENSE_COLUMNS}
        loading={loading}
        emptyTitle="No expenses linked yet."
        getRowId={(p) => p.data.id}
      />
    </div>
  );
}

function DraggableTaskCard({ task, canDrag }: { task: ApiCrmTask; canDrag: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { task },
    disabled: !canDrag,
  });
  return (
    <div ref={setNodeRef} {...(canDrag ? { ...listeners, ...attributes } : {})} className={cn(canDrag && "cursor-grab active:cursor-grabbing")}>
      <TaskCard task={task} dragging={isDragging} />
    </div>
  );
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ApiCrmProject | null;
  onEdit: (project: ApiCrmProject) => void;
};

export function ProjectDetailDrawer({ open, onOpenChange, project, onEdit }: Props) {
  const [tab, setTab] = React.useState<Tab>("overview");
  const [timeline, setTimeline] = React.useState<TimelineEntry[]>([]);
  const [loadingTimeline, setLoadingTimeline] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [composerOpen, setComposerOpen] = React.useState(false);
  const [composerText, setComposerText] = React.useState("");

  const [milestones, setMilestones] = React.useState<ApiCrmMilestone[]>([]);
  const [loadingMilestones, setLoadingMilestones] = React.useState(false);
  const [milestoneFormOpen, setMilestoneFormOpen] = React.useState(false);
  const [milestoneTitle, setMilestoneTitle] = React.useState("");
  const [milestoneStart, setMilestoneStart] = React.useState("");
  const [milestoneDue, setMilestoneDue] = React.useState("");
  const [milestoneView, setMilestoneView] = React.useState<"list" | "gantt">("list");

  const [tasks, setTasks] = React.useState<ApiCrmTask[]>([]);
  const [loadingTasks, setLoadingTasks] = React.useState(false);
  const [taskView, setTaskView] = React.useState<"list" | "board">("list");
  const [activeTask, setActiveTask] = React.useState<ApiCrmTask | null>(null);

  const [members, setMembers] = React.useState<ApiCrmProjectMember[]>([]);
  const [loadingMembers, setLoadingMembers] = React.useState(false);
  const [memberPickerOpen, setMemberPickerOpen] = React.useState(false);
  const [mentionableUsers, setMentionableUsers] = React.useState<{ id: string; name: string }[]>([]);
  const [selectedMemberId, setSelectedMemberId] = React.useState("");

  const [timeEntries, setTimeEntries] = React.useState<ApiCrmTimeEntry[]>([]);
  const [totalHours, setTotalHours] = React.useState("0");
  const [loadingTime, setLoadingTime] = React.useState(false);
  const [timeFormOpen, setTimeFormOpen] = React.useState(false);
  const [teHours, setTeHours] = React.useState("");
  const [teDate, setTeDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [teNote, setTeNote] = React.useState("");

  const loadMilestones = React.useCallback(async () => {
    if (!project) return;
    setLoadingMilestones(true);
    try {
      const res = await fetchCrmMilestones(project.id);
      setMilestones(res.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load milestones");
    } finally {
      setLoadingMilestones(false);
    }
  }, [project]);

  async function handleAddMilestone() {
    if (!project || !milestoneTitle.trim()) return;
    setBusy(true);
    try {
      await createCrmMilestone(project.id, {
        title: milestoneTitle.trim(),
        start_date: milestoneStart || undefined,
        due_date: milestoneDue || undefined,
      });
      toast.success("Milestone added");
      setMilestoneFormOpen(false);
      setMilestoneTitle("");
      setMilestoneStart("");
      setMilestoneDue("");
      void loadMilestones();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add milestone");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleMilestone(milestone: ApiCrmMilestone) {
    setBusy(true);
    try {
      await updateCrmMilestone(milestone.id, { status: milestone.status === "completed" ? "open" : "completed" });
      void loadMilestones();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update milestone");
    } finally {
      setBusy(false);
    }
  }

  const loadMembers = React.useCallback(async () => {
    if (!project) return;
    setLoadingMembers(true);
    try {
      const res = await fetchCrmProjectMembers(project.id);
      setMembers(res.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load members");
    } finally {
      setLoadingMembers(false);
    }
  }, [project]);

  async function openMemberPicker() {
    setMemberPickerOpen(true);
    if (mentionableUsers.length === 0) {
      try {
        setMentionableUsers(await fetchMentionableUsers());
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load users");
      }
    }
  }

  async function handleAddMember() {
    if (!project || !selectedMemberId) return;
    setBusy(true);
    try {
      await addCrmProjectMember(project.id, { user_id: selectedMemberId });
      setMemberPickerOpen(false);
      setSelectedMemberId("");
      void loadMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveMember(member: ApiCrmProjectMember) {
    setBusy(true);
    try {
      await removeCrmProjectMember(member.project_id, member.user_id);
      void loadMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove member");
    } finally {
      setBusy(false);
    }
  }

  const loadTasks = React.useCallback(async () => {
    if (!project) return;
    setLoadingTasks(true);
    try {
      const res = await fetchCrmTasks({ project_id: project.id });
      setTasks(res.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load tasks");
    } finally {
      setLoadingTasks(false);
    }
  }, [project]);

  async function handleTaskStatusChange(task: ApiCrmTask, status: ApiCrmTask["status"]) {
    if (task.status === status) return;
    const prev = tasks;
    setTasks((cur) => cur.map((t) => (t.id === task.id ? { ...t, status } : t)));
    try {
      await updateCrmTask(task.id, { status });
    } catch (err) {
      setTasks(prev);
      toast.error(err instanceof Error ? err.message : "Failed to update task");
    }
  }

  const loadTimeEntries = React.useCallback(async () => {
    if (!project) return;
    setLoadingTime(true);
    try {
      const res = await fetchCrmTimeEntries(project.id);
      setTimeEntries(res.data);
      setTotalHours(res.total_hours);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load time entries");
    } finally {
      setLoadingTime(false);
    }
  }, [project]);

  async function handleAddTimeEntry() {
    const hours = Number(teHours);
    if (!project || !teDate || !Number.isFinite(hours) || hours <= 0) return;
    setBusy(true);
    try {
      await createCrmTimeEntry(project.id, { hours, entry_date: teDate, note: teNote.trim() || undefined });
      toast.success("Time logged");
      setTimeFormOpen(false);
      setTeHours("");
      setTeNote("");
      void loadTimeEntries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to log time");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteTimeEntry(entry: ApiCrmTimeEntry) {
    setBusy(true);
    try {
      await deleteCrmTimeEntry(entry.id);
      void loadTimeEntries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete entry");
    } finally {
      setBusy(false);
    }
  }

  const loadTimeline = React.useCallback(async () => {
    if (!project) return;
    setLoadingTimeline(true);
    try {
      const [activityRes, comments] = await Promise.all([
        fetchCollabActivity(ENTITY, project.id, { limit: 100 }),
        fetchCollabComments(ENTITY, project.id),
      ]);
      const merged: TimelineEntry[] = [
        ...activityRes.data
          .filter((a) => a.action !== "comment")
          .map((a) => ({ kind: "activity" as const, id: a.id, created_at: a.created_at, data: a })),
        ...comments.map((c) => ({ kind: "comment" as const, id: c.id, created_at: c.created_at, data: c })),
      ];
      merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setTimeline(merged);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load activity");
    } finally {
      setLoadingTimeline(false);
    }
  }, [project]);

  const openedProjectId = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!open || !project) {
      openedProjectId.current = null;
      return;
    }
    if (openedProjectId.current === project.id) return;
    openedProjectId.current = project.id;
    setTab("overview");
    void loadTimeline();
    void loadMilestones();
    void loadTasks();
    void loadTimeEntries();
    void loadMembers();
  }, [open, project, loadTimeline, loadMilestones, loadTasks, loadTimeEntries, loadMembers]);

  const taskSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const tasksByStatus = React.useMemo(() => {
    const map = Object.fromEntries(TASK_COLUMNS.map((s) => [s, [] as ApiCrmTask[]])) as Record<
      ApiCrmTask["status"],
      ApiCrmTask[]
    >;
    for (const task of tasks) map[task.status]?.push(task);
    return map;
  }, [tasks]);

  function handleTaskDragStart(event: DragStartEvent) {
    setActiveTask((event.active.data.current?.task as ApiCrmTask | undefined) ?? null);
  }

  async function handleTaskDragEnd(event: DragEndEvent) {
    setActiveTask(null);
    const task = event.active.data.current?.task as ApiCrmTask | undefined;
    const overId = event.over?.id;
    if (!task || !overId) return;
    const nextStatus = String(overId) as ApiCrmTask["status"];
    if (!TASK_COLUMNS.includes(nextStatus)) return;
    await handleTaskStatusChange(task, nextStatus);
  }

  async function handleSubmitComment() {
    if (!project || !composerText.trim()) return;
    setBusy(true);
    try {
      await createCollabComment(ENTITY, project.id, { comment: composerText.trim() });
      toast.success("Added to timeline");
      setComposerOpen(false);
      setComposerText("");
      void loadTimeline();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add comment");
    } finally {
      setBusy(false);
    }
  }

  const taskGridColumns: ColDef<ApiCrmTask>[] = [
    {
      field: "title",
      headerName: "Title",
      flex: 1.6,
      minWidth: 160,
      cellRenderer: (p: ICellRendererParams<ApiCrmTask>) =>
        p.data ? (
          <span className={cn("text-xs", p.data.status === "done" && "text-muted-foreground line-through")}>
            {p.data.title}
          </span>
        ) : null,
    },
    {
      field: "priority",
      headerName: "Priority",
      width: 96,
      cellRenderer: (p: ICellRendererParams<ApiCrmTask>) =>
        p.data ? (
          <GridChipBadge variant={priorityVariant(p.data.priority)} className="capitalize">
            {p.data.priority}
          </GridChipBadge>
        ) : null,
    },
    { field: "points", headerName: "Pts", width: 60, headerClass: NUMERIC_HEADER, cellClass: NUMERIC_CELL },
    {
      colId: "milestone_title",
      headerName: "Milestone",
      flex: 1,
      minWidth: 110,
      valueGetter: (p) => p.data?.milestone_title ?? "—",
    },
    {
      field: "due_date",
      headerName: "Due",
      width: 100,
      valueFormatter: (p) => (p.value ? (formatCompanyIsoCell(p.value, getCompanyFormat()) as string) : "—"),
    },
    {
      colId: "status",
      headerName: "Status",
      width: 130,
      sortable: false,
      cellRenderer: (p: ICellRendererParams<ApiCrmTask>) => {
        const task = p.data;
        if (!task) return null;
        return (
          <select
            value={task.status}
            disabled={busy}
            onChange={(e) => void handleTaskStatusChange(task, e.target.value as ApiCrmTask["status"])}
            className="h-6 rounded-none border border-input bg-background px-1 text-[10px]"
          >
            {TASK_COLUMNS.map((s) => (
              <option key={s} value={s}>
                {TASK_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        );
      },
    },
  ];

  if (!project) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        title={project.name}
        resizable
        resizeMaxWidth={1400}
        className="flex w-full max-w-[70vw] flex-col overflow-hidden"
      >
        <div className="shrink-0">
        <div className="pr-8">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{project.name}</h2>
            <Badge variant={statusVariant(project.status)} className="capitalize">
              {project.status.replace("_", " ")}
            </Badge>
            <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px] text-muted-foreground" onClick={() => onEdit(project)}>
              <Pencil className="mr-1 h-3 w-3" /> Edit
            </Button>
          </div>
          {project.description && <p className="mt-0.5 text-sm text-muted-foreground">{project.description}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              Owner: <span className="font-medium text-foreground">{project.owner_name ?? "Unassigned"}</span>
            </span>
            {project.customer_name && <span>Customer: {project.customer_name}</span>}
            <span>
              Budget: <span className="font-medium text-foreground">{money(project.budget)}</span>
            </span>
            {project.due_date && <span>Due: {project.due_date}</span>}
          </div>
          <div className="mt-2">
            <Link
              href={`/crm/tasks?project_id=${project.id}`}
              className="text-xs text-primary hover:underline"
            >
              {project.open_task_count}/{project.task_count} open tasks →
            </Link>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-1 overflow-x-auto border-b border-border [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(
            [
              "overview",
              "tasks",
              "milestones",
              "files",
              "contracts",
              "notes",
              "feedback",
              "timesheets",
              "invoices",
              "payments",
              "expenses",
              "activity",
            ] as Tab[]
          ).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "shrink-0 whitespace-nowrap border-b-2 px-3 py-1.5 text-xs font-medium capitalize",
                tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "overview" && (
          <div className="mt-3 space-y-3 text-sm">
            <div className="flex flex-wrap gap-2.5">
              <div className="flex items-center gap-3 border border-border p-3">
                <ProgressRing
                  percent={
                    project.task_count > 0
                      ? ((project.task_count - project.open_task_count) / project.task_count) * 100
                      : 0
                  }
                />
                <div className="space-y-1 text-xs">
                  <p className="text-muted-foreground">
                    Start <span className="ml-1 font-medium text-foreground">{project.start_date ?? "—"}</span>
                  </p>
                  <p className="text-muted-foreground">
                    Due <span className="ml-1 font-medium text-foreground">{project.due_date ?? "—"}</span>
                  </p>
                  <p className="text-muted-foreground">
                    Client <span className="ml-1 font-medium text-foreground">{project.customer_name ?? "—"}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 border border-border p-3">
                <Clock className="h-6 w-6 text-muted-foreground" />
                <div>
                  <p className="text-lg font-semibold leading-none">{totalHours}h</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">Total hours worked</p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 border border-border p-3">
                <div>
                  <p className="text-lg font-semibold leading-none">{money(project.budget)}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">Budget</p>
                </div>
              </div>
            </div>

            <div className="border border-border p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-xs font-semibold">
                  <Users className="h-3.5 w-3.5" /> Project members
                </p>
                {memberPickerOpen ? (
                  <div className="flex items-center gap-1.5">
                    <select
                      value={selectedMemberId}
                      onChange={(e) => setSelectedMemberId(e.target.value)}
                      className="h-6 rounded-none border border-input bg-background px-1 text-[10px]"
                    >
                      <option value="">Select user…</option>
                      {mentionableUsers
                        .filter((u) => !members.some((m) => m.user_id === u.id))
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                    </select>
                    <Button
                      size="sm"
                      className="h-6 px-1.5 text-[10px]"
                      disabled={busy || !selectedMemberId}
                      onClick={() => void handleAddMember()}
                    >
                      Add
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-[10px]"
                      onClick={() => setMemberPickerOpen(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => void openMemberPicker()}>
                    <Plus className="mr-1 h-3 w-3" /> Add member
                  </Button>
                )}
              </div>

              {loadingMembers ? (
                <p className="py-3 text-center text-[11px] text-muted-foreground">Loading…</p>
              ) : members.length === 0 ? (
                <p className="py-3 text-center text-[11px] text-muted-foreground">No members yet.</p>
              ) : (
                <div className="space-y-1">
                  {members.map((m) => (
                    <div key={m.id} className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-xs">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                          {initials(m.user_name ?? "?")}
                        </span>
                        {m.user_name ?? m.user_id}
                        <span className="text-[10px] capitalize text-muted-foreground">{m.role}</span>
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1 text-muted-foreground hover:text-destructive"
                        disabled={busy}
                        onClick={() => void handleRemoveMember(m)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "tasks" && (
          <div className="mt-3">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant={taskView === "list" ? "default" : "outline"}
                  className="h-7 px-2 text-[11px]"
                  onClick={() => setTaskView("list")}
                >
                  <ListIcon className="mr-1 h-3 w-3" /> List
                </Button>
                <Button
                  size="sm"
                  variant={taskView === "board" ? "default" : "outline"}
                  className="h-7 px-2 text-[11px]"
                  onClick={() => setTaskView("board")}
                >
                  <LayoutGrid className="mr-1 h-3 w-3" /> Board
                </Button>
              </div>
              <Link href={`/crm/tasks?project_id=${project.id}`} className="text-xs text-primary hover:underline">
                Manage tasks →
              </Link>
            </div>

            {taskView === "list" ? (
              <AgainListGrid<ApiCrmTask>
                embedded
                className="h-[360px]"
                rowData={tasks}
                columnDefs={taskGridColumns}
                loading={loadingTasks}
                emptyTitle="No tasks yet."
                getRowId={(p) => p.data.id}
              />
            ) : loadingTasks ? (
              <p className="py-6 text-center text-xs text-muted-foreground">Loading…</p>
            ) : tasks.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">No tasks yet.</p>
            ) : (
              <DndContext sensors={taskSensors} onDragStart={handleTaskDragStart} onDragEnd={(e) => void handleTaskDragEnd(e)}>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {TASK_COLUMNS.map((status) => {
                    const column = tasksByStatus[status] ?? [];
                    return (
                      <KanbanColumn key={status} id={status} title={TASK_STATUS_LABELS[status]} subtitle={`${column.length}`}>
                        {column.length === 0 ? (
                          <p className="px-2 py-6 text-center text-[11px] text-muted-foreground">Empty</p>
                        ) : (
                          column.map((task) => <DraggableTaskCard key={task.id} task={task} canDrag />)
                        )}
                      </KanbanColumn>
                    );
                  })}
                </div>
                <DragOverlay>{activeTask ? <TaskCard task={activeTask} /> : null}</DragOverlay>
              </DndContext>
            )}
          </div>
        )}

        {tab === "milestones" && (
          <div className="mt-3">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant={milestoneView === "list" ? "default" : "outline"}
                  className="h-7 px-2 text-[11px]"
                  onClick={() => setMilestoneView("list")}
                >
                  <ListIcon className="mr-1 h-3 w-3" /> List
                </Button>
                <Button
                  size="sm"
                  variant={milestoneView === "gantt" ? "default" : "outline"}
                  className="h-7 px-2 text-[11px]"
                  onClick={() => setMilestoneView("gantt")}
                >
                  <LayoutGrid className="mr-1 h-3 w-3" /> Gantt
                </Button>
              </div>
              {!milestoneFormOpen && (
                <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setMilestoneFormOpen(true)}>
                  <Plus className="mr-1 h-3 w-3" /> Add milestone
                </Button>
              )}
            </div>

            {milestoneFormOpen && (
              <div className="mb-3 space-y-2 border border-input bg-muted/30 p-2.5">
                <Input value={milestoneTitle} onChange={(e) => setMilestoneTitle(e.target.value)} placeholder="Milestone title" className="h-7 text-xs" />
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={milestoneStart}
                    onChange={(e) => setMilestoneStart(e.target.value)}
                    placeholder="Start date"
                    className="h-7 text-xs"
                  />
                  <Input type="date" value={milestoneDue} onChange={(e) => setMilestoneDue(e.target.value)} className="h-7 text-xs" />
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setMilestoneFormOpen(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" className="h-7 px-2 text-[11px]" disabled={busy || !milestoneTitle.trim()} onClick={() => void handleAddMilestone()}>
                    Add
                  </Button>
                </div>
              </div>
            )}

            {loadingMilestones ? (
              <p className="py-6 text-center text-xs text-muted-foreground">Loading…</p>
            ) : milestoneView === "gantt" ? (
              <MilestoneGantt project={project} milestones={milestones} />
            ) : milestones.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">No milestones yet.</p>
            ) : (
              <div className="space-y-1.5">
                {milestones.map((m) => (
                  <div key={m.id} className="flex items-center justify-between border border-border p-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={m.status === "completed"}
                          disabled={busy}
                          onChange={() => void handleToggleMilestone(m)}
                        />
                        <p className={cn("text-xs font-medium", m.status === "completed" && "text-muted-foreground line-through")}>
                          {m.title}
                        </p>
                      </div>
                      <p className="mt-0.5 pl-6 text-[10px] text-muted-foreground">
                        {m.start_date && m.due_date
                          ? `${m.start_date} → ${m.due_date}`
                          : m.due_date
                            ? `Due ${m.due_date}`
                            : "No due date"}{" "}
                        · {m.open_task_count}/{m.task_count} open tasks
                      </p>
                    </div>
                    <Badge variant={m.status === "completed" ? "success" : "outline"} className="capitalize">
                      {m.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "files" && <FilesPanel project={project} busy={busy} setBusy={setBusy} />}

        {tab === "contracts" && <FilesPanel project={project} fixedType="contract" busy={busy} setBusy={setBusy} />}

        {tab === "feedback" && <FeedbackPanel project={project} />}

        {tab === "timesheets" && (
          <div className="mt-3">
            <div className="mb-3 flex items-center justify-between">
              {timeFormOpen ? (
                <div className="w-full space-y-2 border border-input bg-muted/30 p-2.5">
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      step="0.25"
                      min="0"
                      max="24"
                      placeholder="Hours"
                      value={teHours}
                      onChange={(e) => setTeHours(e.target.value)}
                      className="h-7 text-xs"
                    />
                    <Input type="date" value={teDate} onChange={(e) => setTeDate(e.target.value)} className="h-7 text-xs" />
                  </div>
                  <Input
                    placeholder="Note (optional)"
                    value={teNote}
                    onChange={(e) => setTeNote(e.target.value)}
                    className="h-7 text-xs"
                  />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setTimeFormOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      disabled={busy || !teHours || !teDate}
                      onClick={() => void handleAddTimeEntry()}
                    >
                      Log time
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setTimeFormOpen(true)}>
                    <Plus className="mr-1 h-3 w-3" /> Log time
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Total: <span className="font-medium text-foreground">{totalHours}h</span>
                  </span>
                </>
              )}
            </div>

            {loadingTime ? (
              <p className="py-6 text-center text-xs text-muted-foreground">Loading…</p>
            ) : timeEntries.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">No time logged yet.</p>
            ) : (
              <div className="space-y-1.5">
                {timeEntries.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between border border-border p-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium">
                        {entry.hours}h · {entry.entry_date}
                        {entry.task_title && <span className="font-normal text-muted-foreground"> · {entry.task_title}</span>}
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {entry.user_name ?? "Unknown"}
                        {entry.note && ` — ${entry.note}`}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-1.5 text-muted-foreground hover:text-destructive"
                      disabled={busy}
                      onClick={() => void handleDeleteTimeEntry(entry)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "invoices" && <InvoicesPanel project={project} />}

        {tab === "payments" && <PaymentsPanel project={project} />}

        {tab === "expenses" && <ExpensesPanel project={project} />}

        {tab === "notes" && (
          <div className="mt-3">
            {composerOpen ? (
              <div className="mb-3 space-y-2 border border-input bg-muted/30 p-2.5">
                <textarea
                  value={composerText}
                  onChange={(e) => setComposerText(e.target.value)}
                  rows={2}
                  placeholder="Add a note…"
                  className="w-full rounded-none border border-input bg-background px-2.5 py-1.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setComposerOpen(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" className="h-7 px-2 text-[11px]" disabled={busy} onClick={() => void handleSubmitComment()}>
                    Add
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="outline" className="mb-3 h-7 px-2 text-[11px]" onClick={() => setComposerOpen(true)}>
                <Plus className="mr-1 h-3 w-3" /> Add note
              </Button>
            )}

            {loadingTimeline ? (
              <p className="py-6 text-center text-xs text-muted-foreground">Loading…</p>
            ) : timeline.filter(isCommentEntry).length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">No notes yet.</p>
            ) : (
              <div className="space-y-0 border-l border-border pl-3">
                {timeline.filter(isCommentEntry).map((entry) => (
                  <div key={entry.id} className="relative pb-3">
                    <div className="absolute -left-[16.5px] top-1 h-2 w-2 rounded-full bg-border" />
                    <p className="whitespace-pre-wrap text-xs text-muted-foreground">{entry.data.comment}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{formatDateTime(entry.created_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "activity" && (
          <div className="mt-3">
            {loadingTimeline ? (
              <p className="py-6 text-center text-xs text-muted-foreground">Loading…</p>
            ) : timeline.filter(isActivityEntry).length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">No activity yet.</p>
            ) : (
              <div className="space-y-0 border-l border-border pl-3">
                {timeline.filter(isActivityEntry).map((entry) => (
                  <div key={entry.id} className="relative pb-3">
                    <div className="absolute -left-[16.5px] top-1 h-2 w-2 rounded-full bg-border" />
                    <p className="text-xs font-medium">{COLLAB_ACTION_LABELS[entry.data.action] ?? entry.data.action}</p>
                    {(entry.data.old_value || entry.data.new_value) && (
                      <p className="text-xs text-muted-foreground">
                        {entry.data.old_value && <span className="capitalize">{entry.data.old_value.replace(/_/g, " ")}</span>}
                        {entry.data.old_value && entry.data.new_value && " → "}
                        {entry.data.new_value && !entry.data.new_value.match(/^[0-9a-f-]{36}$/) && (
                          <span className="capitalize">{entry.data.new_value.replace(/_/g, " ")}</span>
                        )}
                      </p>
                    )}
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{formatDateTime(entry.created_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
