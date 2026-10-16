"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import {
  CYCLE_FREQUENCY_LABEL,
  CYCLE_FREQUENCY_OPTIONS,
  CYCLE_STATUS_LABEL,
  CYCLE_STATUS_OPTIONS,
  type ReviewCycle,
  type ReviewCycleFrequency,
  type ReviewCycleStatus,
} from "@/lib/mock-data/hrm-review-cycles";
import {
  createReviewCycleView,
  deleteReviewCycleView,
  listReviewCyclesView,
  updateReviewCycleView,
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

type SortKey = "name" | "frequency" | "status";
type SortDir = "asc" | "desc";

type FormState = {
  name: string;
  description: string;
  frequency: ReviewCycleFrequency;
  status: ReviewCycleStatus;
  startDate: string;
  endDate: string;
};

function emptyForm(): FormState {
  const y = new Date().getFullYear();
  return {
    name: "",
    description: "",
    frequency: "monthly",
    status: "active",
    startDate: `${y}-01-01`,
    endDate: `${y}-12-31`,
  };
}

function formFromRow(row: ReviewCycle): FormState {
  return {
    name: row.name,
    description: row.description,
    frequency: row.frequency,
    status: row.status,
    startDate: row.startDate,
    endDate: row.endDate,
  };
}

function frequencyBadgeClass() {
  return "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300";
}

function statusBadgeClass(status: ReviewCycleStatus) {
  switch (status) {
    case "active":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "completed":
      return "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300";
    default:
      return "border-border bg-muted/40 text-muted-foreground";
  }
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

export function HrmReviewCycles() {
  const canWrite = useAdminCanWrite();
  const [rows, setRows] = useState<ReviewCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [freqFilter, setFreqFilter] = useState<"all" | ReviewCycleFrequency>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | ReviewCycleStatus>("all");
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
        const data = await listReviewCyclesView();
        if (cancelled) return;
        setRows(data);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load review cycles");
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
    if (freqFilter !== "all") list = list.filter((r) => r.frequency === freqFilter);
    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          CYCLE_FREQUENCY_LABEL[r.frequency].toLowerCase().includes(q),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const av =
        sortKey === "frequency"
          ? CYCLE_FREQUENCY_LABEL[a.frequency]
          : sortKey === "status"
            ? CYCLE_STATUS_LABEL[a.status]
            : a.name;
      const bv =
        sortKey === "frequency"
          ? CYCLE_FREQUENCY_LABEL[b.frequency]
          : sortKey === "status"
            ? CYCLE_STATUS_LABEL[b.status]
            : b.name;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, freqFilter, statusFilter, search, sortKey, sortDir]);

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

  function openEdit(row: ReviewCycle) {
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
    const payload: Omit<ReviewCycle, "id"> = {
      name: form.name.trim(),
      description: form.description.trim(),
      frequency: form.frequency,
      status: form.status,
      startDate: form.startDate,
      endDate: form.endDate,
    };

    setSaving(true);
    try {
      if (formMode === "edit" && editId) {
        const updated = await updateReviewCycleView(editId, payload);
        setRows((prev) => prev.map((r) => (r.id === editId ? updated : r)));
        toast.success("Review cycle updated");
      } else {
        const created = await createReviewCycleView(payload);
        setRows((prev) => [created, ...prev]);
        toast.success("Review cycle created");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: ReviewCycle) {
    setSaving(true);
    try {
      await deleteReviewCycleView(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      toast.success("Review cycle deleted");
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
            placeholder="Search review cycles..."
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
          value={freqFilter}
          onChange={(e) => setFreqFilter(e.target.value as "all" | ReviewCycleFrequency)}
          className="h-9 min-w-[160px] rounded-none border border-border bg-background px-2 text-sm text-foreground"
        >
          <option value="all">All Frequencies</option>
          {CYCLE_FREQUENCY_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | ReviewCycleStatus)}
          className="h-9 min-w-[160px] rounded-none border border-border bg-background px-2 text-sm text-foreground"
        >
          <option value="all">All Statuses</option>
          {CYCLE_STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        {canWrite ? (
          <Button type="button" size="sm" className={cn("ml-auto h-9", GREEN_BTN)} onClick={openAdd}>
            <Plus className="size-3.5" />
            Add Review Cycle
          </Button>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border border-border bg-card">
        <div className="shrink-0 border-b border-border px-4 py-3">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Review Cycles</h1>
          <p className="text-xs text-muted-foreground">
            Manage performance review cycles for your organization
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-muted/60">
              <tr className="border-b border-border text-left">
                <th className="px-4 py-2.5">
                  <SortHeader label="Name" col="name" />
                </th>
                <th className="px-4 py-2.5">
                  <SortHeader label="Frequency" col="frequency" />
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
                  <td colSpan={4} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    Loading review cycles...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No review cycles found.
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
                          <RefreshCw className="size-4" />
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
                          frequencyBadgeClass(),
                        )}
                      >
                        {CYCLE_FREQUENCY_LABEL[row.frequency]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-none text-[10px] font-normal",
                          statusBadgeClass(row.status),
                        )}
                      >
                        {CYCLE_STATUS_LABEL[row.status]}
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
          title={formMode === "add" ? "Add Review Cycle" : "Edit Review Cycle"}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="shrink-0 space-y-1 border-b border-border px-4 py-3 pr-10 text-left">
              <SheetTitle className="text-base">
                {formMode === "add" ? "Add Review Cycle" : "Edit Review Cycle"}
              </SheetTitle>
              <SheetDescription className="text-xs">
                Workdo fields — name, frequency, dates, status, description.
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Name *
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="h-9 rounded-none"
                  placeholder="Monthly Performance Review"
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
                      setForm({ ...form, frequency: e.target.value as ReviewCycleFrequency })
                    }
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {CYCLE_FREQUENCY_OPTIONS.map((s) => (
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
                      setForm({ ...form, status: e.target.value as ReviewCycleStatus })
                    }
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {CYCLE_STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Start Date
                  <Input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  End Date
                  <Input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    className="h-9 rounded-none"
                  />
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
                onClick={() => void saveForm()}
                disabled={saving}
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
