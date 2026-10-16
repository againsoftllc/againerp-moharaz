"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Search, Target, Trash2 } from "lucide-react";
import {
  GOAL_TYPE_FREQUENCY_LABEL,
  GOAL_TYPE_FREQUENCY_OPTIONS,
  GOAL_TYPE_STATUS_LABEL,
  GOAL_TYPE_STATUS_OPTIONS,
  type GoalType,
  type GoalTypeFrequency,
  type GoalTypeStatus,
} from "@/lib/mock-data/hrm-goal-types";
import {
  createGoalTypeView,
  deleteGoalTypeView,
  listGoalTypesView,
  updateGoalTypeView,
} from "@/lib/api/hrm-performance";
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

type SortKey = "name" | "status";
type SortDir = "asc" | "desc";

type FormState = {
  name: string;
  description: string;
  frequency: GoalTypeFrequency;
  status: GoalTypeStatus;
};

function emptyForm(): FormState {
  return {
    name: "",
    description: "",
    frequency: "quarterly",
    status: "active",
  };
}

function formFromRow(row: GoalType): FormState {
  return {
    name: row.name,
    description: row.description,
    frequency: row.frequency,
    status: row.status,
  };
}

function statusBadgeClass(status: GoalTypeStatus) {
  return status === "active"
    ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    : "border-border bg-muted/40 text-muted-foreground";
}

function DescriptionCell({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 80;
  if (!text) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="text-xs text-muted-foreground">
      <span className={cn(!expanded && long && "line-clamp-2")}>{text}</span>
      {long ? (
        <button
          type="button"
          className="ml-1 text-sky-600 hover:underline"
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

export function HrmGoalTypes() {
  const canWrite = useAdminCanWrite();
  const [rows, setRows] = useState<GoalType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | GoalTypeStatus>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await listGoalTypesView();
        if (!cancelled) setRows(data);
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Failed to load goal types");
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
    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          GOAL_TYPE_FREQUENCY_LABEL[r.frequency].toLowerCase().includes(q),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = sortKey === "status" ? GOAL_TYPE_STATUS_LABEL[a.status] : a.name;
      const bv = sortKey === "status" ? GOAL_TYPE_STATUS_LABEL[b.status] : b.name;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, statusFilter, search, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function openAdd() {
    setFormMode("add");
    setEditId(null);
    setForm(emptyForm());
    setFormOpen(true);
  }

  function openEdit(row: GoalType) {
    setFormMode("edit");
    setEditId(row.id);
    setForm(formFromRow(row));
    setFormOpen(true);
  }

  async function saveForm() {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    const payload: Omit<GoalType, "id"> = {
      name: form.name.trim(),
      description: form.description.trim(),
      frequency: form.frequency,
      status: form.status,
    };
    setSaving(true);
    try {
      if (formMode === "edit" && editId) {
        const updated = await updateGoalTypeView(editId, payload);
        setRows((prev) => prev.map((r) => (r.id === editId ? updated : r)));
        toast.success("Goal type updated");
      } else {
        const created = await createGoalTypeView(payload);
        setRows((prev) => [created, ...prev]);
        toast.success("Goal type created");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: GoalType) {
    setSaving(true);
    try {
      await deleteGoalTypeView(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      toast.success("Goal type deleted");
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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search goal types..."
            className="h-9 rounded-none pl-8"
          />
        </div>
        <Button type="button" size="sm" className={cn("h-9", GREEN_BTN)}>
          <Search className="size-3.5" />
          Search
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | GoalTypeStatus)}
          className="h-9 min-w-[160px] rounded-none border border-border bg-background px-2 text-sm text-foreground"
        >
          <option value="all">All Statuses</option>
          {GOAL_TYPE_STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        {canWrite ? (
          <Button type="button" size="sm" className={cn("ml-auto h-9", GREEN_BTN)} onClick={openAdd}>
            <Plus className="size-3.5" />
            Add Goal Type
          </Button>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border border-border bg-card">
        <div className="shrink-0 border-b border-border px-4 py-3">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Goal Types</h1>
          <p className="text-xs text-muted-foreground">
            Manage goal types for employee performance tracking
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-muted/60">
              <tr className="border-b border-border text-left">
                <th className="px-4 py-2.5">
                  <SortHeader label="Name" col="name" />
                </th>
                <th className="px-4 py-2.5">
                  <SortHeader label="Status" col="status" />
                </th>
                <th className="w-[1%] px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={3} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    Loading goal types...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No goal types found.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border last:border-b-0 hover:bg-muted/20"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-none border border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300">
                          <Target className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-foreground">{row.name}</div>
                          <DescriptionCell text={row.description} />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-none text-[10px] font-normal",
                          statusBadgeClass(row.status),
                        )}
                      >
                        {GOAL_TYPE_STATUS_LABEL[row.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        {canWrite ? (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-none text-amber-600"
                              onClick={() => openEdit(row)}
                              aria-label="Edit"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-none text-destructive"
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
      </div>

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent
          side="right"
          title={formMode === "add" ? "Add Goal Type" : "Edit Goal Type"}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="shrink-0 space-y-1 border-b border-border px-4 py-3 pr-10 text-left">
              <SheetTitle className="text-base">
                {formMode === "add" ? "Add Goal Type" : "Edit Goal Type"}
              </SheetTitle>
              <SheetDescription className="text-xs">
                Workdo fields — name, description, frequency, status.
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Name *
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="h-9 rounded-none"
                  placeholder="Leadership Goals"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Description
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="min-h-[90px] rounded-none"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Frequency
                  <select
                    value={form.frequency}
                    onChange={(e) =>
                      setForm({ ...form, frequency: e.target.value as GoalTypeFrequency })
                    }
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {GOAL_TYPE_FREQUENCY_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Status
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm({ ...form, status: e.target.value as GoalTypeStatus })
                    }
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {GOAL_TYPE_STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <div className="flex shrink-0 gap-2 border-t border-border px-4 py-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1 rounded-none"
                onClick={() => setFormOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className={cn("flex-1", GREEN_BTN)}
                disabled={saving}
                onClick={saveForm}
              >
                Save
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
