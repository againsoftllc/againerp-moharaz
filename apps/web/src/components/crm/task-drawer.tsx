"use client";

import * as React from "react";
import { toast } from "sonner";
import { Plus, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  fetchCollabLabels,
  addCollabLabel,
  removeCollabLabel,
  fetchCollabFiles,
  uploadCollabFile,
  deleteCollabFile,
  type CollabLabel,
  type CollabFile,
} from "@/lib/api/collaboration";
import { fetchMentionableUsers } from "@/lib/api/auth-users";
import {
  fetchCrmMilestones,
  fetchCrmLeads,
  fetchCrmDeals,
  fetchCrmTickets,
  fetchCrmTaskCollaborators,
  addCrmTaskCollaborator,
  removeCrmTaskCollaborator,
  type ApiCrmMilestone,
  type ApiCrmProject,
  type ApiCrmTask,
  type ApiCrmLead,
  type ApiCrmDeal,
  type ApiCrmTicket,
  type ApiCrmTaskCollaborator,
} from "@/lib/api/crm";

const ENTITY = "task";

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const STATUSES = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
];

const RELATED_TYPES = [
  { value: "", label: "None" },
  { value: "lead", label: "Lead" },
  { value: "deal", label: "Deal" },
  { value: "ticket", label: "Ticket" },
];

const POINTS_OPTIONS = [1, 2, 3, 5, 8, 13];

export type TaskInput = {
  title: string;
  description?: string;
  project_id?: string;
  milestone_id?: string;
  related_type?: string;
  related_id?: string;
  priority?: string;
  points?: number;
  start_date?: string;
  due_date?: string;
  assignee_id?: string;
  status?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: ApiCrmTask | null;
  projects: ApiCrmProject[];
  defaultProjectId?: string;
  onCreate: (input: TaskInput) => Promise<void>;
  onSave: (id: string, input: TaskInput) => Promise<void>;
};

export function TaskDrawer({ open, onOpenChange, task, projects, defaultProjectId, onCreate, onSave }: Props) {
  const isEdit = Boolean(task);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [relatedType, setRelatedType] = React.useState("");
  const [relatedId, setRelatedId] = React.useState("");
  const [leads, setLeads] = React.useState<ApiCrmLead[]>([]);
  const [deals, setDeals] = React.useState<ApiCrmDeal[]>([]);
  const [tickets, setTickets] = React.useState<ApiCrmTicket[]>([]);
  const [projectId, setProjectId] = React.useState("");
  const [points, setPoints] = React.useState(1);
  const [milestoneId, setMilestoneId] = React.useState("");
  const [milestones, setMilestones] = React.useState<ApiCrmMilestone[]>([]);
  const [assigneeId, setAssigneeId] = React.useState("");
  const [mentionableUsers, setMentionableUsers] = React.useState<{ id: string; name: string }[]>([]);
  const [status, setStatus] = React.useState("todo");
  const [priority, setPriority] = React.useState("medium");
  const [startDate, setStartDate] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const [collaborators, setCollaborators] = React.useState<ApiCrmTaskCollaborator[]>([]);
  const [collabPickerOpen, setCollabPickerOpen] = React.useState(false);
  const [selectedCollabId, setSelectedCollabId] = React.useState("");
  const [collabBusy, setCollabBusy] = React.useState(false);

  const [labels, setLabels] = React.useState<CollabLabel[]>([]);
  const [labelInput, setLabelInput] = React.useState("");
  const [labelBusy, setLabelBusy] = React.useState(false);

  const [files, setFiles] = React.useState<CollabFile[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    if (task) {
      setTitle(task.title);
      setDescription(task.description ?? "");
      setRelatedType(task.related_type ?? "");
      setRelatedId(task.related_id ?? "");
      setProjectId(task.project_id ?? "");
      setMilestoneId(task.milestone_id ?? "");
      setAssigneeId(task.assignee_id ?? "");
      setStatus(task.status);
      setPriority(task.priority);
      setPoints(task.points ?? 1);
      setStartDate(task.start_date ?? "");
      setDueDate(task.due_date ?? "");
    } else {
      setTitle("");
      setDescription("");
      setRelatedType("");
      setRelatedId("");
      setProjectId(defaultProjectId ?? "");
      setMilestoneId("");
      setAssigneeId("");
      setStatus("todo");
      setPriority("medium");
      setPoints(1);
      setStartDate("");
      setDueDate("");
    }
  }, [open, task, defaultProjectId]);

  React.useEffect(() => {
    if (!open || !projectId) {
      setMilestones([]);
      return;
    }
    let cancelled = false;
    void fetchCrmMilestones(projectId).then((res) => {
      if (!cancelled) setMilestones(res.data);
    }).catch(() => {
      if (!cancelled) setMilestones([]);
    });
    return () => {
      cancelled = true;
    };
  }, [open, projectId]);

  React.useEffect(() => {
    if (!open || !relatedType) return;
    let cancelled = false;
    if (relatedType === "lead" && leads.length === 0) {
      void fetchCrmLeads().then((res) => { if (!cancelled) setLeads(res.data); }).catch(() => {});
    } else if (relatedType === "deal" && deals.length === 0) {
      void fetchCrmDeals().then((res) => { if (!cancelled) setDeals(res.data); }).catch(() => {});
    } else if (relatedType === "ticket" && tickets.length === 0) {
      void fetchCrmTickets().then((res) => { if (!cancelled) setTickets(res.data); }).catch(() => {});
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, relatedType]);

  const loadCollaborators = React.useCallback(async () => {
    if (!task) return;
    try {
      const res = await fetchCrmTaskCollaborators(task.id);
      setCollaborators(res.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load collaborators");
    }
  }, [task]);

  const loadLabels = React.useCallback(async () => {
    if (!task) return;
    try {
      setLabels(await fetchCollabLabels(ENTITY, task.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load labels");
    }
  }, [task]);

  const loadFiles = React.useCallback(async () => {
    if (!task) return;
    try {
      setFiles(await fetchCollabFiles(ENTITY, task.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load files");
    }
  }, [task]);

  React.useEffect(() => {
    if (!open || !task) {
      setCollaborators([]);
      setLabels([]);
      setFiles([]);
      return;
    }
    void loadCollaborators();
    void loadLabels();
    void loadFiles();
  }, [open, task, loadCollaborators, loadLabels, loadFiles]);

  async function openCollabPicker() {
    setCollabPickerOpen(true);
    if (mentionableUsers.length === 0) {
      try {
        setMentionableUsers(await fetchMentionableUsers());
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load users");
      }
    }
  }

  async function handleAddCollaborator() {
    if (!task || !selectedCollabId) return;
    setCollabBusy(true);
    try {
      await addCrmTaskCollaborator(task.id, selectedCollabId);
      setCollabPickerOpen(false);
      setSelectedCollabId("");
      void loadCollaborators();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add collaborator");
    } finally {
      setCollabBusy(false);
    }
  }

  async function handleRemoveCollaborator(c: ApiCrmTaskCollaborator) {
    setCollabBusy(true);
    try {
      await removeCrmTaskCollaborator(c.task_id, c.user_id);
      void loadCollaborators();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove collaborator");
    } finally {
      setCollabBusy(false);
    }
  }

  async function handleAddLabel() {
    if (!task || !labelInput.trim()) return;
    setLabelBusy(true);
    try {
      await addCollabLabel(ENTITY, task.id, labelInput.trim().toLowerCase().replace(/\s+/g, "_"));
      setLabelInput("");
      void loadLabels();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add label");
    } finally {
      setLabelBusy(false);
    }
  }

  async function handleRemoveLabel(label: CollabLabel) {
    if (!task) return;
    setLabelBusy(true);
    try {
      await removeCollabLabel(ENTITY, task.id, label.label);
      void loadLabels();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove label");
    } finally {
      setLabelBusy(false);
    }
  }

  async function handleUploadFile(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!task || !file) return;
    setUploading(true);
    try {
      await uploadCollabFile(ENTITY, task.id, file);
      toast.success("File uploaded");
      void loadFiles();
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
      void loadFiles();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete file");
    }
  }

  const isValid = title.trim().length > 0;

  async function handleSubmit() {
    if (!isValid) return;
    setSaving(true);
    const input: TaskInput = {
      title: title.trim(),
      description: description.trim() || undefined,
      project_id: projectId || undefined,
      milestone_id: milestoneId || undefined,
      related_type: relatedType || undefined,
      related_id: relatedType ? relatedId || undefined : undefined,
      priority,
      points,
      start_date: startDate || undefined,
      due_date: dueDate || undefined,
      assignee_id: assigneeId || undefined,
      ...(isEdit ? { status } : {}),
    };
    try {
      if (isEdit && task) {
        await onSave(task.id, input);
        toast.success("Task updated");
      } else {
        await onCreate(input);
        toast.success("Task created");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save task");
    } finally {
      setSaving(false);
    }
  }

  const relatedOptions = relatedType === "lead" ? leads : relatedType === "deal" ? deals : relatedType === "ticket" ? tickets : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        title={isEdit ? "Edit task" : "New task"}
        resizable
        resizeMaxWidth={1400}
        className="flex w-full max-w-[70vw] flex-col overflow-hidden"
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-input pb-3 pr-8">
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" onClick={() => void handleSubmit()} disabled={!isValid || saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
          </div>
          <h2 className="truncate text-base font-semibold">{isEdit ? `Edit ${task?.title}` : "New task"}</h2>
        </div>

        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto">
          <div className="flex flex-col gap-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={saving} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Description (optional)</Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-none border border-input bg-background px-2.5 py-1.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={saving}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Related to (optional)</Label>
              <Select
                value={relatedType}
                onChange={(e) => {
                  setRelatedType(e.target.value);
                  setRelatedId("");
                }}
                className="w-full rounded-none"
                disabled={saving}
              >
                {RELATED_TYPES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </div>
            {relatedType && (
              <div className="flex flex-col gap-1.5">
                <Label className="capitalize">{relatedType}</Label>
                <Select value={relatedId} onChange={(e) => setRelatedId(e.target.value)} className="w-full rounded-none" disabled={saving}>
                  <option value="">Select…</option>
                  {relatedOptions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {"name" in r ? r.name : "title" in r ? r.title : r.subject}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Project (optional)</Label>
              <Select
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  setMilestoneId("");
                }}
                className="w-full rounded-none"
                disabled={saving}
              >
                <option value="">Standalone task</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Points</Label>
              <Select value={String(points)} onChange={(e) => setPoints(Number(e.target.value))} className="w-full rounded-none" disabled={saving}>
                {POINTS_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p} {p === 1 ? "point" : "points"}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {projectId && (
            <div className="flex flex-col gap-1.5">
              <Label>Milestone (optional)</Label>
              <Select value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)} className="w-full rounded-none" disabled={saving}>
                <option value="">No milestone</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>Assign to (optional)</Label>
            <Select
              value={assigneeId}
              onFocus={() => {
                if (mentionableUsers.length === 0) void fetchMentionableUsers().then(setMentionableUsers).catch(() => {});
              }}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="w-full rounded-none"
              disabled={saving}
            >
              <option value="">Unassigned</option>
              {mentionableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Collaborators</Label>
            {!isEdit ? (
              <p className="text-[11px] text-muted-foreground">Save the task first to add collaborators.</p>
            ) : (
              <div className="space-y-1.5">
                {collaborators.map((c) => (
                  <div key={c.id} className="flex items-center justify-between border border-border px-2 py-1">
                    <span className="text-xs">{c.user_name ?? c.user_id}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1 text-muted-foreground hover:text-destructive"
                      disabled={collabBusy}
                      onClick={() => void handleRemoveCollaborator(c)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                {collabPickerOpen ? (
                  <div className="flex items-center gap-1.5">
                    <Select value={selectedCollabId} onChange={(e) => setSelectedCollabId(e.target.value)} className="w-full rounded-none">
                      <option value="">Select user…</option>
                      {mentionableUsers
                        .filter((u) => !collaborators.some((c) => c.user_id === u.id))
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                    </Select>
                    <Button size="sm" className="h-7 px-2 text-[11px]" disabled={collabBusy || !selectedCollabId} onClick={() => void handleAddCollaborator()}>
                      Add
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => setCollabPickerOpen(false)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => void openCollabPicker()}>
                    <Plus className="mr-1 h-3 w-3" /> Add collaborator
                  </Button>
                )}
              </div>
            )}
          </div>

          {isEdit && (
            <div className="flex flex-col gap-1.5">
              <Label>Status</Label>
              <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full rounded-none" disabled={saving}>
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>Priority</Label>
            <Select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full rounded-none" disabled={saving}>
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Labels</Label>
            {!isEdit ? (
              <p className="text-[11px] text-muted-foreground">Save the task first to add labels.</p>
            ) : (
              <div className="space-y-1.5">
                <div className="flex flex-wrap gap-1.5">
                  {labels.map((l) => (
                    <span
                      key={l.id}
                      className="flex items-center gap-1 rounded-none border px-1.5 py-0.5 text-[10px]"
                      style={l.color ? { borderColor: l.color, color: l.color } : undefined}
                    >
                      {l.label_display}
                      <button type="button" disabled={labelBusy} onClick={() => void handleRemoveLabel(l)}>
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  <Input
                    value={labelInput}
                    onChange={(e) => setLabelInput(e.target.value)}
                    placeholder="Add a label…"
                    className="h-7 text-xs"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleAddLabel();
                      }
                    }}
                  />
                  <Button size="sm" className="h-7 px-2 text-[11px]" disabled={labelBusy || !labelInput.trim()} onClick={() => void handleAddLabel()}>
                    Add
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Start date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={saving} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Deadline</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={saving} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Files</Label>
            {!isEdit ? (
              <p className="text-[11px] text-muted-foreground">Save the task first to upload files.</p>
            ) : (
              <div className="space-y-1.5">
                {files.map((f) => (
                  <div key={f.id} className="flex items-center justify-between border border-border px-2 py-1">
                    <a href={f.storage_ref} target="_blank" rel="noreferrer" className="truncate text-xs text-primary hover:underline">
                      {f.filename}
                    </a>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1 text-muted-foreground hover:text-destructive"
                      onClick={() => void handleDeleteFile(f)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => void handleUploadFile(e.target.files)} />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px]"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="mr-1 h-3 w-3" /> {uploading ? "Uploading…" : "Upload file"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
