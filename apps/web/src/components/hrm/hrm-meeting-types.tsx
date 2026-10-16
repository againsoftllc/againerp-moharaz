"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock, Lock, LockOpen, Pencil, Search, Trash2 } from "lucide-react";
import {
  MEETING_TYPE_STATUS_LABEL,
  MEETING_TYPE_STATUS_OPTIONS,
  type MeetingType,
  type MeetingTypeStatus,
} from "@/lib/mock-data/hrm-meeting-types";
import {
  createMeetingTypeView,
  deleteMeetingTypeView,
  listMeetingTypesView,
  updateMeetingTypeView,
} from "@/lib/api/hrm-meetings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const GREEN_BTN =
  "rounded-none bg-[#4caf50] text-white hover:bg-[#43a047] border-transparent";

type FormState = {
  name: string;
  description: string;
  color: string;
  defaultDuration: string;
  status: MeetingTypeStatus;
};

function emptyForm(): FormState {
  return {
    name: "",
    description: "",
    color: "#000000",
    defaultDuration: "15",
    status: "active",
  };
}

function formFromRow(row: MeetingType): FormState {
  return {
    name: row.name,
    description: row.description,
    color: row.color,
    defaultDuration: String(row.defaultDuration),
    status: row.status,
  };
}

function statusBadgeClass(status: MeetingTypeStatus) {
  return status === "active"
    ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    : "border-border bg-muted/40 text-muted-foreground";
}

function DescriptionCell({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 70;
  if (!text) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="text-xs text-muted-foreground">
      <span className={cn(!expanded && long && "line-clamp-2")}>{text}</span>
      {long ? (
        <button
          type="button"
          className="mt-0.5 inline-flex text-sky-600 hover:underline dark:text-sky-400"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}

export function HrmMeetingTypes() {
  const canWrite = useAdminCanWrite();
  const [rows, setRows] = useState<MeetingType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | MeetingTypeStatus>("all");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [appliedStatus, setAppliedStatus] = useState<"all" | MeetingTypeStatus>("all");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [form, setForm] = useState<FormState>(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await listMeetingTypesView();
        if (!cancelled) setRows(data);
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Failed to load meeting types");
        }
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
    if (appliedStatus !== "all") list = list.filter((r) => r.status === appliedStatus);
    const q = appliedSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => a.name.localeCompare(b.name) * dir);
  }, [rows, appliedSearch, appliedStatus, sortDir]);

  function applySearch() {
    setAppliedSearch(search);
    setAppliedStatus(statusFilter);
  }

  function resetForm() {
    setEditId(null);
    setForm(emptyForm());
  }

  function startEdit(row: MeetingType) {
    if (row.locked) {
      toast.error("Type is locked — unlock before editing");
      return;
    }
    setEditId(row.id);
    setForm(formFromRow(row));
  }

  async function toggleLock(row: MeetingType) {
    const nextStatus: MeetingTypeStatus = row.locked ? "active" : "inactive";
    try {
      const updated = await updateMeetingTypeView(row.id, {
        name: row.name,
        description: row.description,
        color: row.color,
        defaultDuration: row.defaultDuration,
        status: nextStatus,
      });
      updated.meetingsCount = row.meetingsCount;
      setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
      if (editId === row.id && nextStatus === "inactive") resetForm();
      toast.success(row.locked ? "Type unlocked" : "Type locked");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function saveForm() {
    if (!canWrite) return;
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    const defaultDuration = Math.max(1, Number(form.defaultDuration) || 15);
    const payload: Omit<MeetingType, "id" | "locked" | "meetingsCount"> = {
      name: form.name.trim(),
      description: form.description.trim(),
      color: form.color || "#000000",
      defaultDuration,
      status: form.status,
    };

    setSaving(true);
    try {
      if (editId) {
        const existing = rows.find((r) => r.id === editId);
        const updated = await updateMeetingTypeView(editId, payload);
        updated.meetingsCount = existing?.meetingsCount ?? 0;
        setRows((prev) => prev.map((r) => (r.id === editId ? updated : r)));
        toast.success("Meeting type updated");
      } else {
        const created = await createMeetingTypeView(payload);
        setRows((prev) => [created, ...prev]);
        toast.success("Meeting type created");
      }
      resetForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: MeetingType) {
    if (row.locked) {
      toast.error("Unlock before deleting");
      return;
    }
    try {
      await deleteMeetingTypeView(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      if (editId === row.id) resetForm();
      toast.success("Meeting type deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  const fieldClass =
    "h-9 w-full rounded-none border border-border bg-background px-2 text-sm text-foreground";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">Meeting Types</h1>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[340px_1fr]">
        <div className="flex h-fit flex-col rounded-none border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <div className="text-sm font-semibold text-foreground">
              {editId ? "Edit Meeting Type" : "Add New Meeting Type"}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {editId
                ? "Update the selected meeting type"
                : "Fill in the details to create a new meeting type"}
            </p>
          </div>
          <div className="space-y-3 p-4">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Name <span className="text-red-500">*</span>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="h-9 rounded-none"
                placeholder="e.g., Client Call, Team Sync"
                disabled={!canWrite}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Description
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="min-h-[72px] rounded-none"
                placeholder="Brief description of the meeting type"
                disabled={!canWrite}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Color <span className="text-red-500">*</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  className="h-9 w-12 cursor-pointer rounded-none border border-border bg-background p-1"
                  disabled={!canWrite}
                />
                <Input
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  className="h-9 flex-1 rounded-none font-mono text-xs"
                  disabled={!canWrite}
                />
              </div>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Default Duration (minutes) <span className="text-red-500">*</span>
              <Input
                type="number"
                min={1}
                value={form.defaultDuration}
                onChange={(e) => setForm((f) => ({ ...f, defaultDuration: e.target.value }))}
                className="h-9 rounded-none"
                disabled={!canWrite}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Status <span className="text-red-500">*</span>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value as MeetingTypeStatus }))
                }
                className={fieldClass}
                disabled={!canWrite}
              >
                {MEETING_TYPE_STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            {canWrite ? (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  className={cn("h-9", GREEN_BTN)}
                  onClick={() => void saveForm()}
                  disabled={saving}
                >
                  {editId ? "Save Changes" : "Create Type"}
                </Button>
                {editId ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-none"
                    onClick={resetForm}
                  >
                    Cancel
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 rounded-none border border-border bg-card p-3">
            <div className="relative min-w-[160px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search meeting types..."
                className="h-9 rounded-none pl-8"
                onKeyDown={(e) => {
                  if (e.key === "Enter") applySearch();
                }}
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | MeetingTypeStatus)}
              className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
            >
              <option value="all">All Statuses</option>
              {MEETING_TYPE_STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <Button type="button" size="sm" className={cn("h-9", GREEN_BTN)} onClick={applySearch}>
              <Search className="size-3.5" />
              Search
            </Button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <div className="text-sm font-semibold text-foreground">Meeting Types</div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Manage different types of meetings and their default durations.
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-muted/60">
                  <tr className="border-b border-border text-left">
                    <th className="px-3 py-2.5">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                        onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                      >
                        Name
                        <span className="text-[10px] opacity-60">
                          {sortDir === "asc" ? "▲" : "▼"}
                        </span>
                      </button>
                    </th>
                    <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Duration
                    </th>
                    <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Meetings
                    </th>
                    <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Status
                    </th>
                    <th className="w-[1%] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-12 text-center text-sm text-muted-foreground"
                      >
                        Loading meeting types...
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-12 text-center text-sm text-muted-foreground"
                      >
                        No meeting types found.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((row) => (
                      <tr
                        key={row.id}
                        className={cn(
                          "border-b border-border last:border-b-0 hover:bg-muted/20",
                          editId === row.id && "bg-muted/30",
                        )}
                      >
                        <td className="px-3 py-2.5">
                          <div className="flex items-start gap-2.5">
                            <span
                              className="mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-none"
                              style={{ backgroundColor: row.color }}
                              aria-hidden
                            />
                            <div className="min-w-0">
                              <div className="font-medium text-foreground">{row.name}</div>
                              <DescriptionCell text={row.description} />
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Clock className="size-3.5 shrink-0" />
                            <span className="tabular-nums">{row.defaultDuration} min</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge
                            variant="outline"
                            className="rounded-none border-border bg-muted/40 text-[10px] font-normal tabular-nums text-muted-foreground"
                          >
                            {row.meetingsCount}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge
                              variant="outline"
                              className={cn(
                                "rounded-none text-[10px] font-normal",
                                statusBadgeClass(row.status),
                              )}
                            >
                              {MEETING_TYPE_STATUS_LABEL[row.status]}
                            </Badge>
                            {row.locked ? (
                              <Badge
                                variant="outline"
                                className="rounded-none border-amber-500/30 bg-amber-500/15 text-[10px] font-normal text-amber-800 dark:text-amber-300"
                              >
                                Locked
                              </Badge>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          {canWrite ? (
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-none text-amber-600 dark:text-amber-400"
                                onClick={() => startEdit(row)}
                                aria-label="Edit"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-none text-amber-500 dark:text-amber-300"
                                onClick={() => toggleLock(row)}
                                aria-label={row.locked ? "Unlock" : "Lock"}
                              >
                                {row.locked ? (
                                  <LockOpen className="h-3.5 w-3.5" />
                                ) : (
                                  <Lock className="h-3.5 w-3.5" />
                                )}
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
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
