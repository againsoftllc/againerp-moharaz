"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Clock, Copy, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  fetchCollabActivity,
  fetchCollabComments,
  createCollabComment,
  fetchCollabLabels,
  fetchCollabFiles,
  uploadCollabFile,
  deleteCollabFile,
  COLLAB_ACTION_LABELS,
  type CollabActivity,
  type CollabComment,
  type CollabLabel,
  type CollabFile,
} from "@/lib/api/collaboration";
import {
  fetchCrmTaskCollaborators,
  createCrmTask,
  fetchCrmTaskChecklist,
  addCrmTaskChecklistItem,
  updateCrmTaskChecklistItem,
  deleteCrmTaskChecklistItem,
  startCrmTaskTimer,
  stopCrmTaskTimer,
  type ApiCrmTask,
  type ApiCrmTaskCollaborator,
  type ApiCrmTaskChecklistItem,
} from "@/lib/api/crm";
import { cn, formatDateTime } from "@/lib/utils";

const ENTITY = "task";

function statusVariant(status: string) {
  if (status === "done") return "success" as const;
  if (status === "in_progress") return "warning" as const;
  if (status === "cancelled") return "muted" as const;
  return "outline" as const;
}

function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
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

type TimelineEntry =
  | { kind: "activity"; id: string; created_at: string; data: CollabActivity }
  | { kind: "comment"; id: string; created_at: string; data: CollabComment };

function isCommentEntry(e: TimelineEntry): e is Extract<TimelineEntry, { kind: "comment" }> {
  return e.kind === "comment";
}
function isActivityEntry(e: TimelineEntry): e is Extract<TimelineEntry, { kind: "activity" }> {
  return e.kind === "activity";
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: ApiCrmTask | null;
  onEdit: (task: ApiCrmTask) => void;
  onCloned: (task: ApiCrmTask) => void;
  onUpdated: (task: ApiCrmTask) => void;
};

export function TaskDetailDrawer({ open, onOpenChange, task, onEdit, onCloned, onUpdated }: Props) {
  const [collaborators, setCollaborators] = React.useState<ApiCrmTaskCollaborator[]>([]);
  const [labels, setLabels] = React.useState<CollabLabel[]>([]);
  const [files, setFiles] = React.useState<CollabFile[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [checklist, setChecklist] = React.useState<ApiCrmTaskChecklistItem[]>([]);
  const [checklistFormOpen, setChecklistFormOpen] = React.useState(false);
  const [checklistInput, setChecklistInput] = React.useState("");
  const [checklistBusy, setChecklistBusy] = React.useState(false);

  const [timeline, setTimeline] = React.useState<TimelineEntry[]>([]);
  const [loadingTimeline, setLoadingTimeline] = React.useState(false);
  const [composerText, setComposerText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [cloning, setCloning] = React.useState(false);
  const [timerBusy, setTimerBusy] = React.useState(false);
  const [nowTick, setNowTick] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (!task?.timer_started_at) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [task?.timer_started_at]);

  const loadExtras = React.useCallback(async () => {
    if (!task) return;
    try {
      const [collabRes, labelRes, fileRes, checklistRes] = await Promise.all([
        fetchCrmTaskCollaborators(task.id),
        fetchCollabLabels(ENTITY, task.id),
        fetchCollabFiles(ENTITY, task.id),
        fetchCrmTaskChecklist(task.id),
      ]);
      setCollaborators(collabRes.data);
      setLabels(labelRes);
      setFiles(fileRes);
      setChecklist(checklistRes.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load task details");
    }
  }, [task]);

  const loadTimeline = React.useCallback(async () => {
    if (!task) return;
    setLoadingTimeline(true);
    try {
      const [activityRes, comments] = await Promise.all([
        fetchCollabActivity(ENTITY, task.id, { limit: 100 }),
        fetchCollabComments(ENTITY, task.id),
      ]);
      const merged: TimelineEntry[] = [
        ...activityRes.data.map((a) => ({ kind: "activity" as const, id: a.id, created_at: a.created_at, data: a })),
        ...comments.map((c) => ({ kind: "comment" as const, id: c.id, created_at: c.created_at, data: c })),
      ];
      merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setTimeline(merged);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load activity");
    } finally {
      setLoadingTimeline(false);
    }
  }, [task]);

  const openedTaskId = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!open || !task) {
      openedTaskId.current = null;
      return;
    }
    if (openedTaskId.current === task.id) return;
    openedTaskId.current = task.id;
    void loadExtras();
    void loadTimeline();
  }, [open, task, loadExtras, loadTimeline]);

  async function handleSubmitComment() {
    if (!task || !composerText.trim()) return;
    setBusy(true);
    try {
      await createCollabComment(ENTITY, task.id, { comment: composerText.trim() });
      setComposerText("");
      void loadTimeline();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add comment");
    } finally {
      setBusy(false);
    }
  }

  async function handleUploadFile(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!task || !file) return;
    setUploading(true);
    try {
      await uploadCollabFile(ENTITY, task.id, file);
      toast.success("File uploaded");
      void loadExtras();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDeleteFile(file: CollabFile) {
    if (!task) return;
    try {
      await deleteCollabFile(ENTITY, task.id, file.id);
      void loadExtras();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete file");
    }
  }

  async function handleToggleChecklistItem(item: ApiCrmTaskChecklistItem) {
    if (!task) return;
    setChecklistBusy(true);
    const prev = checklist;
    setChecklist((cur) => cur.map((i) => (i.id === item.id ? { ...i, is_checked: !i.is_checked } : i)));
    try {
      await updateCrmTaskChecklistItem(task.id, item.id, { is_checked: !item.is_checked });
    } catch (err) {
      setChecklist(prev);
      toast.error(err instanceof Error ? err.message : "Failed to update checklist item");
    } finally {
      setChecklistBusy(false);
    }
  }

  async function handleAddChecklistItem() {
    if (!task || !checklistInput.trim()) return;
    setChecklistBusy(true);
    try {
      await addCrmTaskChecklistItem(task.id, checklistInput.trim());
      setChecklistInput("");
      void loadExtras();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add checklist item");
    } finally {
      setChecklistBusy(false);
    }
  }

  async function handleDeleteChecklistItem(item: ApiCrmTaskChecklistItem) {
    if (!task) return;
    setChecklistBusy(true);
    try {
      await deleteCrmTaskChecklistItem(task.id, item.id);
      void loadExtras();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete checklist item");
    } finally {
      setChecklistBusy(false);
    }
  }

  async function handleClone() {
    if (!task) return;
    setCloning(true);
    try {
      const created = await createCrmTask({
        title: `${task.title} (copy)`,
        description: task.description ?? undefined,
        project_id: task.project_id ?? undefined,
        milestone_id: task.milestone_id ?? undefined,
        related_type: task.related_type ?? undefined,
        related_id: task.related_id ?? undefined,
        priority: task.priority,
        points: task.points,
        start_date: task.start_date ?? undefined,
        due_date: task.due_date ?? undefined,
        assignee_id: task.assignee_id ?? undefined,
      });
      toast.success("Task cloned");
      onCloned(created.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to clone task");
    } finally {
      setCloning(false);
    }
  }

  async function handleStartTimer() {
    if (!task) return;
    setTimerBusy(true);
    try {
      const updated = await startCrmTaskTimer(task.id);
      onUpdated(updated.data);
      void loadTimeline();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start timer");
    } finally {
      setTimerBusy(false);
    }
  }

  async function handleStopTimer() {
    if (!task) return;
    setTimerBusy(true);
    try {
      const updated = await stopCrmTaskTimer(task.id);
      onUpdated(updated.data);
      void loadTimeline();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to stop timer");
    } finally {
      setTimerBusy(false);
    }
  }

  if (!task) return null;

  const checkedCount = checklist.filter((i) => i.is_checked).length;
  const liveElapsed = task.timer_started_at
    ? task.total_time_seconds + (nowTick - new Date(task.timer_started_at).getTime()) / 1000
    : task.total_time_seconds;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        title={task.title}
        resizable
        resizeMaxWidth={1400}
        className="flex w-full max-w-[70vw] flex-col overflow-hidden"
      >
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-8">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_260px]">
            {/* Main column */}
            <div className="min-w-0 space-y-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className={cn("text-lg font-semibold", task.status === "done" && "text-muted-foreground line-through")}>
                    {task.title}
                  </h2>
                  <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px] text-muted-foreground" onClick={() => onEdit(task)}>
                    <Pencil className="mr-1 h-3 w-3" /> Edit
                  </Button>
                </div>
                {task.description && <p className="mt-1 text-sm text-muted-foreground">{task.description}</p>}
              </div>

              {task.project_id && (
                <p className="text-xs">
                  <span className="text-muted-foreground">Project: </span>
                  <Link href={`/crm/tasks?project_id=${task.project_id}`} className="font-medium text-primary hover:underline">
                    {task.project_name}
                  </Link>
                </p>
              )}
              {task.related_name && (
                <p className="text-xs">
                  <span className="text-muted-foreground capitalize">Related {task.related_type}: </span>
                  <span className="font-medium">{task.related_name}</span>
                </p>
              )}

              <div className="border-t border-border pt-3">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">
                  Checklist <span className="font-normal">{checkedCount}/{checklist.length}</span>
                </p>
                {checklist.length > 0 && (
                  <div className="mb-2 space-y-1">
                    {checklist.map((item) => (
                      <div key={item.id} className="flex items-center justify-between border border-border px-2 py-1.5">
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          disabled={checklistBusy}
                          onClick={() => void handleToggleChecklistItem(item)}
                        >
                          <span
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center border",
                              item.is_checked ? "border-emerald-500 bg-emerald-500 text-white" : "border-input",
                            )}
                          >
                            {item.is_checked && <Check className="h-3 w-3" />}
                          </span>
                          <span className={cn("truncate text-xs", item.is_checked && "text-muted-foreground line-through")}>
                            {item.text}
                          </span>
                        </button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 shrink-0 px-0 text-muted-foreground hover:text-destructive"
                          disabled={checklistBusy}
                          onClick={() => void handleDeleteChecklistItem(item)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {checklistFormOpen ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      value={checklistInput}
                      onChange={(e) => setChecklistInput(e.target.value)}
                      placeholder="Add item"
                      className="h-7 text-xs"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleAddChecklistItem();
                        }
                      }}
                    />
                    <Button size="sm" className="h-7 px-2 text-[11px]" disabled={checklistBusy || !checklistInput.trim()} onClick={() => void handleAddChecklistItem()}>
                      Add
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => setChecklistFormOpen(false)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setChecklistFormOpen(true)}>
                    <Plus className="mr-1 h-3 w-3" /> Add item
                  </Button>
                )}
              </div>

              <div className="border-t border-border pt-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground">Files</p>
                  <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => void handleUploadFile(e.target.files)} />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[10px]"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="mr-1 h-3 w-3" /> {uploading ? "Uploading…" : "Upload"}
                  </Button>
                </div>
                {files.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No files.</p>
                ) : (
                  <div className="space-y-1">
                    {files.map((f) => (
                      <div key={f.id} className="flex items-center justify-between border border-border px-2 py-1">
                        <a href={f.storage_ref} target="_blank" rel="noreferrer" className="truncate text-xs text-primary hover:underline">
                          {f.filename}
                        </a>
                        <Button size="sm" variant="ghost" className="h-6 px-1 text-muted-foreground hover:text-destructive" onClick={() => void handleDeleteFile(f)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar column */}
            <div className="space-y-3 md:border-l md:border-border md:pl-4">
              {task.assignee_name && (
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {initials(task.assignee_name)}
                  </span>
                  <button type="button" onClick={() => onEdit(task)} className="text-sm font-medium text-primary hover:underline">
                    {task.assignee_name}
                  </button>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <Badge variant="muted">{task.points} pt{task.points === 1 ? "" : "s"}</Badge>
                <Badge variant={statusVariant(task.status)} className="capitalize">
                  {task.status.replace("_", " ")}
                </Badge>
              </div>

              <div className="space-y-1.5 text-xs">
                <p>
                  <span className="font-semibold text-foreground">Milestone: </span>
                  <button type="button" onClick={() => onEdit(task)} className="text-primary hover:underline">
                    {task.milestone_title ?? "Add Milestone"}
                  </button>
                </p>
                <p>
                  <span className="font-semibold text-foreground">Start date: </span>
                  <button type="button" onClick={() => onEdit(task)} className="text-primary hover:underline">
                    {task.start_date ?? "Add Start date"}
                  </button>
                </p>
                <p>
                  <span className="font-semibold text-foreground">Deadline: </span>
                  <button type="button" onClick={() => onEdit(task)} className="text-primary hover:underline">
                    {task.due_date ?? "Add Deadline"}
                  </button>
                </p>
                <p>
                  <span className="font-semibold text-foreground">Priority: </span>
                  <button type="button" onClick={() => onEdit(task)} className="capitalize text-primary hover:underline">
                    {task.priority}
                  </button>
                </p>
                <p>
                  <span className="font-semibold text-foreground">Label: </span>
                  {labels.length === 0 ? (
                    <button type="button" onClick={() => onEdit(task)} className="text-primary hover:underline">
                      Add Label
                    </button>
                  ) : (
                    <span className="inline-flex flex-wrap gap-1.5 align-middle">
                      {labels.map((l) => (
                        <span
                          key={l.id}
                          className="rounded-none border px-1.5 py-0.5 text-[10px]"
                          style={l.color ? { borderColor: l.color, color: l.color } : undefined}
                        >
                          {l.label_display}
                        </span>
                      ))}
                    </span>
                  )}
                </p>
              </div>

              <div>
                <p className="mb-1 text-xs font-semibold text-foreground">Collaborators:</p>
                {collaborators.length === 0 ? (
                  <button type="button" onClick={() => onEdit(task)} className="text-xs text-primary hover:underline">
                    Add collaborator
                  </button>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {collaborators.map((c) => (
                      <span
                        key={c.id}
                        title={c.user_name ?? c.user_id}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary"
                      >
                        {initials(c.user_name ?? "?")}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                {task.timer_started_at ? (
                  <Button
                    size="sm"
                    disabled={timerBusy}
                    onClick={() => void handleStopTimer()}
                    className="bg-red-500 text-white hover:bg-red-600"
                  >
                    <Clock className="mr-1.5 h-3.5 w-3.5" /> Stop timer
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={timerBusy}
                    onClick={() => void handleStartTimer()}
                    className="bg-emerald-500 text-white hover:bg-emerald-600"
                  >
                    <Clock className="mr-1.5 h-3.5 w-3.5" /> Start timer
                  </Button>
                )}
                <p className="text-xs">
                  <span className="font-semibold text-foreground">Total time logged: </span>
                  <span className="font-medium text-primary">{formatDuration(liveElapsed)}</span>
                </p>
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Comments</p>
            <div className="mb-2 space-y-2 border border-input bg-muted/30 p-2.5">
              <textarea
                value={composerText}
                onChange={(e) => setComposerText(e.target.value)}
                rows={2}
                placeholder="Write a comment…"
                className="w-full rounded-none border border-input bg-background px-2.5 py-1.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="flex justify-end">
                <Button size="sm" className="h-7 px-2 text-[11px]" disabled={busy || !composerText.trim()} onClick={() => void handleSubmitComment()}>
                  Post comment
                </Button>
              </div>
            </div>

            {loadingTimeline ? (
              <p className="py-4 text-center text-xs text-muted-foreground">Loading…</p>
            ) : timeline.filter(isCommentEntry).length === 0 ? (
              <p className="py-2 text-center text-xs text-muted-foreground">No comments yet.</p>
            ) : (
              <div className="space-y-2">
                {timeline.filter(isCommentEntry).map((entry) => (
                  <div key={entry.id} className="border border-border p-2">
                    <p className="whitespace-pre-wrap text-xs">{entry.data.comment}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">{formatDateTime(entry.created_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Activity</p>
            {loadingTimeline ? (
              <p className="py-4 text-center text-xs text-muted-foreground">Loading…</p>
            ) : timeline.filter(isActivityEntry).length === 0 ? (
              <p className="py-2 text-center text-xs text-muted-foreground">No activity yet.</p>
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
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-input pt-3">
          <Button variant="outline" size="sm" disabled={cloning} onClick={() => void handleClone()}>
            <Copy className="mr-1.5 h-3.5 w-3.5" /> {cloning ? "Cloning…" : "Clone task"}
          </Button>
          <Button size="sm" onClick={() => onEdit(task)}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit task
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
