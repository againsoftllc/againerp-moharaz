"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { ApiCrmProject } from "@/lib/api/crm";

const STATUSES = [
  { value: "planning", label: "Planning" },
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On hold" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export type ProjectInput = {
  name: string;
  description?: string;
  start_date?: string;
  due_date?: string;
  budget?: string;
  status?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ApiCrmProject | null;
  onCreate: (input: ProjectInput) => Promise<void>;
  onSave: (id: string, input: ProjectInput) => Promise<void>;
};

export function ProjectDrawer({ open, onOpenChange, project, onCreate, onSave }: Props) {
  const isEdit = Boolean(project);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [status, setStatus] = React.useState("planning");
  const [startDate, setStartDate] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [budget, setBudget] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    if (project) {
      setName(project.name);
      setDescription(project.description ?? "");
      setStatus(project.status);
      setStartDate(project.start_date ?? "");
      setDueDate(project.due_date ?? "");
      setBudget(project.budget ?? "");
    } else {
      setName("");
      setDescription("");
      setStatus("planning");
      setStartDate("");
      setDueDate("");
      setBudget("");
    }
  }, [open, project]);

  const isValid = name.trim().length > 0;

  async function handleSubmit() {
    if (!isValid) return;
    setSaving(true);
    const input: ProjectInput = {
      name: name.trim(),
      description: description.trim() || undefined,
      start_date: startDate || undefined,
      due_date: dueDate || undefined,
      budget: budget || undefined,
      ...(isEdit ? { status } : {}),
    };
    try {
      if (isEdit && project) {
        await onSave(project.id, input);
        toast.success("Project updated");
      } else {
        await onCreate(input);
        toast.success("Project created");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save project");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        title={isEdit ? "Edit project" : "New project"}
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
          <h2 className="truncate text-base font-semibold">{isEdit ? `Edit ${project?.name}` : "New project"}</h2>
        </div>

        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto">
          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={saving} />
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
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Start date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={saving} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Due date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={saving} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Budget (optional)</Label>
            <Input type="number" min="0" step="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} disabled={saving} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
