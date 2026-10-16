"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  Clock3,
  DollarSign,
  Eye,
  Filter,
  Lock,
  Pencil,
  Plus,
  Search,
  Shield,
  Trash2,
} from "lucide-react";
import {
  ATTENDANCE_POLICY_STATUS_LABEL,
  ATTENDANCE_POLICY_STATUS_OPTIONS,
  formatMoney,
  type AttendancePolicy,
  type AttendancePolicyStatus,
} from "@/lib/mock-data/hrm-attendance-policies";
import {
  createHrmAttendancePolicy,
  deleteHrmAttendancePolicy,
  listHrmAttendancePolicies,
  updateHrmAttendancePolicy,
} from "@/lib/api/hrm-attendance-policies";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";
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

type FormState = {
  name: string;
  description: string;
  lateArrivalGrace: string;
  earlyDepartureGrace: string;
  halfDayThreshold: string;
  overtimeRatePerHour: string;
  status: AttendancePolicyStatus;
};

function emptyForm(): FormState {
  return {
    name: "",
    description: "",
    lateArrivalGrace: "15",
    earlyDepartureGrace: "15",
    halfDayThreshold: "4",
    overtimeRatePerHour: "150",
    status: "active",
  };
}

function formFromRow(row: AttendancePolicy): FormState {
  return {
    name: row.name,
    description: row.description,
    lateArrivalGrace: String(row.lateArrivalGrace),
    earlyDepartureGrace: String(row.earlyDepartureGrace),
    halfDayThreshold: String(row.halfDayThreshold),
    overtimeRatePerHour: String(row.overtimeRatePerHour),
    status: row.status,
  };
}

function statusBadgeClass(status: AttendancePolicyStatus) {
  return status === "active"
    ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    : "border-border bg-muted/50 text-muted-foreground";
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-none border border-border bg-card px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      </div>
      <div className="flex size-10 shrink-0 items-center justify-center rounded-none border border-border bg-muted/40 text-muted-foreground">
        {icon}
      </div>
    </div>
  );
}

function MetaRow({
  icon,
  label,
  value,
  valueClass,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className={cn("mt-0.5 text-sm font-medium tabular-nums text-foreground", valueClass)}>
          {value}
        </p>
      </div>
    </div>
  );
}

export function HrmAttendancePolicies() {
  const canWrite = useAdminCanWrite();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<AttendancePolicy[]>([]);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"all" | AttendancePolicyStatus>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | AttendancePolicyStatus>("all");
  const [perPage, setPerPage] = useState(9);
  const [page, setPage] = useState(1);

  const [viewRow, setViewRow] = useState<AttendancePolicy | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const policies = await listHrmAttendancePolicies();
      setRows(policies);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load attendance policies");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const stats = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((r) => r.status === "active").length;
    const avgLate =
      total > 0
        ? Math.round(rows.reduce((s, r) => s + r.lateArrivalGrace, 0) / total)
        : 0;
    const avgOt =
      total > 0
        ? rows.reduce((s, r) => s + r.overtimeRatePerHour, 0) / total
        : 0;
    return { total, active, avgLate, avgOt };
  }, [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q),
      );
    }
    return list;
  }, [rows, statusFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  function openAdd() {
    setFormMode("add");
    setEditId(null);
    setForm(emptyForm());
    setFormOpen(true);
  }

  function openEdit(row: AttendancePolicy) {
    setFormMode("edit");
    setEditId(row.id);
    setForm(formFromRow(row));
    setViewRow(null);
    setFormOpen(true);
  }

  async function saveForm() {
    if (!form.name.trim()) {
      toast.error("Policy name is required");
      return;
    }
    const payload: Omit<AttendancePolicy, "id"> = {
      name: form.name.trim(),
      description: form.description.trim(),
      lateArrivalGrace: Number(form.lateArrivalGrace) || 0,
      earlyDepartureGrace: Number(form.earlyDepartureGrace) || 0,
      halfDayThreshold: Number(form.halfDayThreshold) || 0,
      overtimeRatePerHour: Number(form.overtimeRatePerHour) || 0,
      status: form.status,
    };

    setSaving(true);
    try {
      if (formMode === "edit" && editId) {
        const updated = await updateHrmAttendancePolicy(editId, payload);
        setRows((prev) => prev.map((r) => (r.id === editId ? updated : r)));
        setViewRow((v) => (v?.id === editId ? updated : v));
        toast.success("Attendance policy updated");
      } else {
        const created = await createHrmAttendancePolicy(payload);
        setRows((prev) => [created, ...prev]);
        toast.success("Attendance policy created");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: AttendancePolicy) {
    if (!window.confirm(`Delete attendance policy “${row.name}”?`)) return;
    try {
      await deleteHrmAttendancePolicy(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setViewRow((v) => (v?.id === row.id ? null : v));
      toast.success("Attendance policy deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  if (loading) {
    return <ContentDataSkeleton label="Loading attendance policies…" />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Attendance Policies
        </h1>
        {canWrite ? (
          <Button type="button" size="sm" className={GREEN_BTN} onClick={openAdd}>
            <Plus className="size-3.5" />
            Add Attendance Policy
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
        <Button
          type="button"
          size="sm"
          className={cn("h-9", GREEN_BTN)}
          onClick={() => setPage(1)}
        >
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
            {[6, 9, 12, 18].map((n) => (
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
                onChange={(e) =>
                  setDraftStatus(e.target.value as "all" | AttendancePolicyStatus)
                }
                className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="all">All</option>
                {ATTENDANCE_POLICY_STATUS_OPTIONS.map((s) => (
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
                  setDraftStatus("all");
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Policies" value={stats.total} icon={<Shield className="size-5" />} />
        <StatCard
          label="Active Policies"
          value={stats.active}
          icon={<CheckCircle2 className="size-5 text-emerald-500" />}
        />
        <StatCard
          label="Avg Late Grace"
          value={`${stats.avgLate} min`}
          icon={<Clock3 className="size-5 text-orange-500" />}
        />
        <StatCard
          label="Avg Overtime Rate"
          value={formatMoney(stats.avgOt)}
          icon={<DollarSign className="size-5 text-emerald-500" />}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {pageRows.length === 0 ? (
          <div className="rounded-none border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
            No attendance policies found.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {pageRows.map((row) => (
              <article
                key={row.id}
                className="flex flex-col rounded-none border border-border bg-card"
              >
                <div className="flex items-start gap-2 border-b border-border px-3 py-2.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-none border border-border bg-sky-500/15 text-sky-600 dark:text-sky-300">
                    <Shield className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{row.name}</p>
                    <Badge
                      variant="outline"
                      className={cn(
                        "mt-1 rounded-none text-[10px] font-normal",
                        statusBadgeClass(row.status),
                      )}
                    >
                      {ATTENDANCE_POLICY_STATUS_LABEL[row.status]}
                    </Badge>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-none"
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
                          className="h-7 w-7 rounded-none"
                          onClick={() => openEdit(row)}
                          aria-label="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-none"
                          onClick={() => toast.message("Policy permissions (mock)")}
                          aria-label="Permissions"
                        >
                          <Lock className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-none text-destructive"
                          onClick={() => void remove(row)}
                          aria-label="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-3 px-3 py-3">
                  <MetaRow
                    icon={<Clock3 className="size-3.5 text-orange-500" />}
                    label="Late Arrival Grace"
                    value={`${row.lateArrivalGrace} minutes`}
                  />
                  <MetaRow
                    icon={<DollarSign className="size-3.5 text-emerald-500" />}
                    label="Overtime Rate"
                    value={`${formatMoney(row.overtimeRatePerHour)}/hr`}
                    valueClass="text-emerald-700 dark:text-emerald-300"
                  />
                  <MetaRow
                    icon={<Clock3 className="size-3.5 text-sky-500" />}
                    label="Early Departure Grace"
                    value={`${row.earlyDepartureGrace} minutes`}
                  />
                  <MetaRow
                    icon={<Clock3 className="size-3.5 text-amber-500" />}
                    label="Half Day Threshold"
                    value={`${row.halfDayThreshold} hours`}
                  />
                </div>

                <p className="mt-auto line-clamp-2 border-t border-border px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                  {row.description || "—"}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>

      {filtered.length > perPage ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Showing {(pageSafe - 1) * perPage + 1}–
            {Math.min(pageSafe * perPage, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-2">
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
            <span>
              Page {pageSafe}/{totalPages}
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
      ) : null}

      <Sheet open={!!viewRow} onOpenChange={(o) => !o && setViewRow(null)}>
        <SheetContent
          side="right"
          title={viewRow ? `Policy — ${viewRow.name}` : "Policy"}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          {viewRow ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="shrink-0 border-b border-border px-4 py-3 pr-10">
                <p className="text-base font-semibold">{viewRow.name}</p>
                <Badge
                  variant="outline"
                  className={cn(
                    "mt-1.5 rounded-none text-[10px] font-normal",
                    statusBadgeClass(viewRow.status),
                  )}
                >
                  {ATTENDANCE_POLICY_STATUS_LABEL[viewRow.status]}
                </Badge>
              </div>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                <dl className="divide-y divide-border rounded-none border border-border text-sm">
                  {(
                    [
                      ["Late Arrival Grace", `${viewRow.lateArrivalGrace} min`],
                      ["Early Departure Grace", `${viewRow.earlyDepartureGrace} min`],
                      ["Half Day Threshold", `${viewRow.halfDayThreshold} hours`],
                      ["Overtime Rate / Hour", formatMoney(viewRow.overtimeRatePerHour)],
                      ["Status", ATTENDANCE_POLICY_STATUS_LABEL[viewRow.status]],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="flex items-start justify-between gap-3 px-3 py-2">
                      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
                      <dd className="text-right text-sm">{value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="rounded-none border border-border bg-muted/20 px-3 py-2 text-sm">
                  <p className="mb-1 text-xs text-muted-foreground">Description</p>
                  <p>{viewRow.description || "—"}</p>
                </div>
              </div>
              {canWrite ? (
                <div className="flex shrink-0 gap-2 border-t border-border px-4 py-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-none"
                    onClick={() => openEdit(viewRow)}
                  >
                    <Pencil className="size-3.5" />
                    Edit
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
          title={formMode === "add" ? "Add Attendance Policy" : "Edit Attendance Policy"}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="shrink-0 space-y-1 border-b border-border px-4 py-3 pr-10 text-left">
              <SheetTitle className="text-base">
                {formMode === "add" ? "Add Attendance Policy" : "Edit Attendance Policy"}
              </SheetTitle>
              <SheetDescription className="text-xs">
                Workdo fields — name, grace periods, overtime rate, status.
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Name *
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="h-9 rounded-none"
                  placeholder="Standard Attendance Policy"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Late Arrival Grace (min)
                  <Input
                    type="number"
                    min={0}
                    value={form.lateArrivalGrace}
                    onChange={(e) => setForm({ ...form, lateArrivalGrace: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Early Departure Grace (min)
                  <Input
                    type="number"
                    min={0}
                    value={form.earlyDepartureGrace}
                    onChange={(e) => setForm({ ...form, earlyDepartureGrace: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Half Day Threshold (hours)
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={form.halfDayThreshold}
                  onChange={(e) => setForm({ ...form, halfDayThreshold: e.target.value })}
                  className="h-9 rounded-none"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Overtime Rate Per Hour
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.overtimeRatePerHour}
                  onChange={(e) => setForm({ ...form, overtimeRatePerHour: e.target.value })}
                  className="h-9 rounded-none"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Status
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm({ ...form, status: e.target.value as AttendancePolicyStatus })
                  }
                  className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                >
                  {ATTENDANCE_POLICY_STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Description
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="min-h-[90px] rounded-none"
                />
              </label>
            </div>
            <div className="flex shrink-0 gap-2 border-t border-border px-4 py-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1 rounded-none"
                onClick={() => setFormOpen(false)}
                disabled={saving}
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
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
