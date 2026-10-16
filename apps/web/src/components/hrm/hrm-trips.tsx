"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, FileText, Filter, Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  ADVANCE_STATUS_LABEL,
  ADVANCE_STATUS_OPTIONS,
  EXPENSE_STATUS_LABEL,
  EXPENSE_STATUS_OPTIONS,
  TRIP_STATUS_LABEL,
  TRIP_STATUS_OPTIONS,
  formatTripMoney,
  tripAvatar,
  type AdvanceStatus,
  type ExpenseStatus,
  type Trip,
  type TripStatus,
} from "@/lib/mock-data/hrm-trips";
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
  createTripView,
  deleteTripView,
  listLifecycleEmployeeOptions,
  listTripsView,
  updateTripView,
  type LifecycleEmployeeOption,
} from "@/lib/api/hrm-lifecycle";

const GREEN_BTN =
  "rounded-none bg-[#4caf50] text-white hover:bg-[#43a047] border-transparent";

type SortKey = "employeeName" | "destination" | "startDate" | "endDate" | "status";
type SortDir = "asc" | "desc";

type FormState = {
  employeeId: string;
  purpose: string;
  destination: string;
  startDate: string;
  endDate: string;
  description: string;
  expectedOutcomes: string;
  status: TripStatus;
  advanceAmount: string;
  advanceStatus: AdvanceStatus;
  totalExpenses: string;
  expenseStatus: ExpenseStatus;
};

function todayYmd() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function emptyForm(employees: LifecycleEmployeeOption[] = []): FormState {
  return {
    employeeId: employees[0]?.id ?? "",
    purpose: "",
    destination: "",
    startDate: todayYmd(),
    endDate: todayYmd(),
    description: "",
    expectedOutcomes: "",
    status: "planned",
    advanceAmount: "0",
    advanceStatus: "none",
    totalExpenses: "0",
    expenseStatus: "none",
  };
}

function formFromRow(row: Trip): FormState {
  return {
    employeeId: row.employeeId,
    purpose: row.purpose,
    destination: row.destination,
    startDate: row.startDate,
    endDate: row.endDate,
    description: row.description,
    expectedOutcomes: row.expectedOutcomes,
    status: row.status,
    advanceAmount: String(row.advanceAmount),
    advanceStatus: row.advanceStatus,
    totalExpenses: String(row.totalExpenses),
    expenseStatus: row.expenseStatus,
  };
}

function tripStatusBadgeClass(status: TripStatus) {
  switch (status) {
    case "ongoing":
      return "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300";
    case "planned":
      return "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300";
    case "cancelled":
      return "border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300";
    default:
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  }
}

function advanceBadgeClass(status: AdvanceStatus) {
  switch (status) {
    case "reconciled":
      return "border-violet-500/30 bg-violet-500/15 text-violet-800 dark:text-violet-300";
    case "approved":
      return "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300";
    case "paid":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "requested":
      return "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300";
    default:
      return "border-border bg-muted/40 text-muted-foreground";
  }
}

function expenseBadgeClass(status: ExpenseStatus) {
  switch (status) {
    case "pending":
      return "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300";
    case "approved":
      return "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300";
    case "paid":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    default:
      return "border-border bg-muted/40 text-muted-foreground";
  }
}

export function HrmTrips() {
  const canWrite = useAdminCanWrite();
  const [rows, setRows] = useState<Trip[]>([]);
  const [employeeOptions, setEmployeeOptions] = useState<LifecycleEmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"all" | TripStatus>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | TripStatus>("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("startDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [viewRow, setViewRow] = useState<Trip | null>(null);
  const [expensesRow, setExpensesRow] = useState<Trip | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [employees, data] = await Promise.all([
          listLifecycleEmployeeOptions(),
          listTripsView(),
        ]);
        if (cancelled) return;
        setEmployeeOptions(employees);
        setRows(data);
        setForm(emptyForm(employees));
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load trips");
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
          r.employeeName.toLowerCase().includes(q) ||
          r.employeeEmail.toLowerCase().includes(q) ||
          r.destination.toLowerCase().includes(q) ||
          r.purpose.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => String(a[sortKey]).localeCompare(String(b[sortKey])) * dir);
  }, [rows, statusFilter, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "employeeName" || key === "destination" || key === "status" ? "asc" : "desc");
    }
  }

  function openAdd() {
    setFormMode("add");
    setEditId(null);
    setForm(emptyForm(employeeOptions));
    setFormOpen(true);
  }

  function openEdit(row: Trip) {
    setFormMode("edit");
    setEditId(row.id);
    setForm(formFromRow(row));
    setFormOpen(true);
  }

  function openExpenses(row: Trip) {
    const latest = rows.find((r) => r.id === row.id) ?? row;
    setExpensesRow(latest);
  }

  async function saveForm() {
    const emp = employeeOptions.find((e) => e.id === form.employeeId);
    if (!emp) {
      toast.error("Select an employee");
      return;
    }
    if (!form.purpose.trim() || !form.destination.trim() || !form.startDate || !form.endDate) {
      toast.error("Purpose, destination, and dates are required");
      return;
    }

    const advanceAmount = Number(form.advanceAmount) || 0;
    const totalExpenses = Number(form.totalExpenses) || 0;

    const payload: Omit<Trip, "id" | "expenses"> = {
      employeeId: emp.id,
      employeeName: emp.name,
      employeeEmail: emp.email,
      purpose: form.purpose.trim(),
      destination: form.destination.trim(),
      startDate: form.startDate,
      endDate: form.endDate,
      description: form.description.trim(),
      expectedOutcomes: form.expectedOutcomes.trim(),
      status: form.status,
      advanceAmount,
      advanceStatus: advanceAmount > 0 && form.advanceStatus === "none" ? "requested" : form.advanceStatus,
      totalExpenses,
      expenseStatus: totalExpenses > 0 && form.expenseStatus === "none" ? "pending" : form.expenseStatus,
    };

    setSaving(true);
    try {
      if (formMode === "edit" && editId) {
        const updated = await updateTripView(editId, payload);
        setRows((prev) => prev.map((r) => (r.id === editId ? updated : r)));
        setViewRow((v) => (v?.id === editId ? updated : v));
        setExpensesRow((v) => (v?.id === editId ? updated : v));
        toast.success("Trip updated");
      } else {
        const created = await createTripView(payload);
        setRows((prev) => [created, ...prev]);
        toast.success("Trip created");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: Trip) {
    setSaving(true);
    try {
      await deleteTripView(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setViewRow((v) => (v?.id === row.id ? null : v));
      setExpensesRow((v) => (v?.id === row.id ? null : v));
      toast.success("Trip deleted");
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Trips</h1>
        {canWrite ? (
          <Button type="button" size="sm" className={GREEN_BTN} onClick={openAdd}>
            <Plus className="size-3.5" />
            Add Trip
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
              Status
              <select
                value={draftStatus}
                onChange={(e) => setDraftStatus(e.target.value as "all" | TripStatus)}
                className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="all">All</option>
                {TRIP_STATUS_OPTIONS.map((s) => (
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

      <div className="min-h-0 flex-1 overflow-auto rounded-none border border-border bg-card">
        <table className="w-full min-w-[1180px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60">
            <tr className="border-b border-border text-left">
              <th className="w-12 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                #
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Employee" col="employeeName" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Destination" col="destination" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Start Date" col="startDate" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="End Date" col="endDate" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Status" col="status" />
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Advance
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Expenses
              </th>
              <th className="w-[1%] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Expenses
              </th>
              <th className="w-[1%] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Loading trips...
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No trips found.
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => (
                <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-muted/20">
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                    {(pageSafe - 1) * perPage + idx + 1}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={tripAvatar(row.employeeId)}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-none border border-border object-cover"
                      />
                      <div className="min-w-0">
                        <div className="font-medium text-foreground">{row.employeeName}</div>
                        <div className="truncate text-xs text-muted-foreground">{row.employeeEmail}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">{row.destination}</td>
                  <td className="px-3 py-2.5 tabular-nums">{row.startDate}</td>
                  <td className="px-3 py-2.5 tabular-nums">{row.endDate}</td>
                  <td className="px-3 py-2.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-none text-[10px] font-normal",
                        tripStatusBadgeClass(row.status),
                      )}
                    >
                      {TRIP_STATUS_LABEL[row.status]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    {row.advanceAmount > 0 ? (
                      <div className="flex flex-col items-start gap-1">
                        <span className="tabular-nums font-medium">
                          {formatTripMoney(row.advanceAmount)}
                        </span>
                        {row.advanceStatus !== "none" ? (
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-none text-[10px] font-normal",
                              advanceBadgeClass(row.advanceStatus),
                            )}
                          >
                            {ADVANCE_STATUS_LABEL[row.advanceStatus]}
                          </Badge>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {row.totalExpenses > 0 ? (
                      <div className="flex flex-col items-start gap-1">
                        <span className="tabular-nums font-medium">
                          {formatTripMoney(row.totalExpenses)}
                        </span>
                        {row.expenseStatus !== "none" ? (
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-none text-[10px] font-normal",
                              expenseBadgeClass(row.expenseStatus),
                            )}
                          >
                            {EXPENSE_STATUS_LABEL[row.expenseStatus]}
                          </Badge>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-none"
                      onClick={() => openExpenses(row)}
                    >
                      <FileText className="size-3.5" />
                      Expenses
                    </Button>
                  </td>
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
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
                            className="h-7 w-7 rounded-none text-amber-600"
                            onClick={() => openEdit(row)}
                            aria-label="Edit"
                            disabled={saving}
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
                            disabled={saving}
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

      {filtered.length > 0 ? (
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

      {/* View */}
      <Sheet open={!!viewRow} onOpenChange={(o) => !o && setViewRow(null)}>
        <SheetContent
          side="right"
          title={viewRow ? `Trip — ${viewRow.employeeName}` : "Trip"}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          {viewRow ? (
            <div className="flex h-full min-h-0 flex-col" data-view="hrm-trip-workdo">
              <div className="shrink-0 border-b border-border px-4 py-4 pr-10">
                <div className="flex items-start gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={tripAvatar(viewRow.employeeId)}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-none border border-border object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold leading-snug">{viewRow.employeeName}</p>
                    <p className="truncate text-xs text-muted-foreground">{viewRow.employeeEmail}</p>
                    <p className="mt-1.5 text-sm font-medium text-foreground">{viewRow.destination}</p>
                    <Badge
                      variant="outline"
                      className={cn(
                        "mt-2 rounded-none text-[10px] font-normal",
                        tripStatusBadgeClass(viewRow.status),
                      )}
                    >
                      {TRIP_STATUS_LABEL[viewRow.status]}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-none border border-border bg-muted/20 px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Advance
                    </p>
                    <p className="mt-0.5 text-sm font-medium tabular-nums">
                      {viewRow.advanceAmount > 0 ? formatTripMoney(viewRow.advanceAmount) : "—"}
                    </p>
                    {viewRow.advanceStatus !== "none" ? (
                      <Badge
                        variant="outline"
                        className={cn(
                          "mt-1 rounded-none text-[10px] font-normal",
                          advanceBadgeClass(viewRow.advanceStatus),
                        )}
                      >
                        {ADVANCE_STATUS_LABEL[viewRow.advanceStatus]}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="rounded-none border border-border bg-muted/20 px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Expenses
                    </p>
                    <p className="mt-0.5 text-sm font-medium tabular-nums">
                      {viewRow.totalExpenses > 0 ? formatTripMoney(viewRow.totalExpenses) : "—"}
                    </p>
                    {viewRow.expenseStatus !== "none" ? (
                      <Badge
                        variant="outline"
                        className={cn(
                          "mt-1 rounded-none text-[10px] font-normal",
                          expenseBadgeClass(viewRow.expenseStatus),
                        )}
                      >
                        {EXPENSE_STATUS_LABEL[viewRow.expenseStatus]}
                      </Badge>
                    ) : null}
                  </div>
                </div>

                <dl className="divide-y divide-border rounded-none border border-border text-sm">
                  {(
                    [
                      ["Employee", viewRow.employeeName],
                      ["Purpose", viewRow.purpose],
                      ["Destination", viewRow.destination],
                      ["Start Date", viewRow.startDate],
                      ["End Date", viewRow.endDate],
                      ["Status", TRIP_STATUS_LABEL[viewRow.status]],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="flex items-start justify-between gap-3 px-3 py-2.5">
                      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
                      <dd className="max-w-[62%] break-all text-right text-sm text-foreground">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>

                <div className="rounded-none border border-border bg-muted/20 px-3 py-3">
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Description
                  </p>
                  <p className="text-sm leading-relaxed text-foreground">
                    {viewRow.description || "—"}
                  </p>
                </div>

                <div className="rounded-none border border-border bg-muted/20 px-3 py-3">
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Expected Outcomes
                  </p>
                  <p className="text-sm leading-relaxed text-foreground">
                    {viewRow.expectedOutcomes || "—"}
                  </p>
                </div>
              </div>

              {canWrite ? (
                <div className="flex shrink-0 gap-2 border-t border-border px-4 py-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-none"
                    onClick={() => {
                      setViewRow(null);
                      openEdit(viewRow);
                    }}
                    disabled={saving}
                  >
                    <Pencil className="size-3.5" />
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-none"
                    onClick={() => {
                      setViewRow(null);
                      openExpenses(viewRow);
                    }}
                  >
                    <FileText className="size-3.5" />
                    Expenses
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Expenses (view-only from API) */}
      <Sheet open={!!expensesRow} onOpenChange={(o) => !o && setExpensesRow(null)}>
        <SheetContent
          side="right"
          title={expensesRow ? `Expenses — ${expensesRow.destination}` : "Expenses"}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          {expensesRow ? (
            <div className="flex h-full min-h-0 flex-col">
              <SheetHeader className="shrink-0 space-y-1 border-b border-border px-4 py-3 pr-10 text-left">
                <SheetTitle className="text-base">Trip Expenses</SheetTitle>
                <SheetDescription className="text-xs">
                  {expensesRow.employeeName} · {expensesRow.destination}
                </SheetDescription>
              </SheetHeader>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
                <div className="flex items-center justify-between rounded-none border border-border bg-muted/20 px-3 py-2.5">
                  <span className="text-xs text-muted-foreground">Total</span>
                  <span className="text-sm font-medium tabular-nums">
                    {formatTripMoney(expensesRow.totalExpenses)}
                  </span>
                </div>
                {expensesRow.expenses.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No expense lines yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-border rounded-none border border-border">
                    {expensesRow.expenses.map((ex) => (
                      <li key={ex.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{ex.category}</p>
                          <p className="text-xs text-muted-foreground">
                            {ex.date}
                            {ex.note ? ` · ${ex.note}` : ""}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm tabular-nums">
                          {formatTripMoney(ex.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Create / Edit */}
      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent
          side="right"
          title={formMode === "add" ? "Add Trip" : "Edit Trip"}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="shrink-0 space-y-1 border-b border-border px-4 py-3 pr-10 text-left">
              <SheetTitle className="text-base">
                {formMode === "add" ? "Add Trip" : "Edit Trip"}
              </SheetTitle>
              <SheetDescription className="text-xs">
                Workdo fields — destination, dates, advance, expenses, status.
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Employee *
                <select
                  value={form.employeeId}
                  onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                  disabled={formMode === "edit"}
                  className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground disabled:opacity-60"
                >
                  {employeeOptions.length === 0 ? (
                    <option value="">No employees</option>
                  ) : (
                    employeeOptions.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} — {e.email}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Purpose *
                <Input
                  value={form.purpose}
                  onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                  className="h-9 rounded-none"
                  placeholder="Client kickoff"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Destination *
                <Input
                  value={form.destination}
                  onChange={(e) => setForm({ ...form, destination: e.target.value })}
                  className="h-9 rounded-none"
                  placeholder="Dubai, UAE"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Start Date *
                  <Input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  End Date *
                  <Input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Status
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as TripStatus })}
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {TRIP_STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Advance Amount
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.advanceAmount}
                    onChange={(e) => setForm({ ...form, advanceAmount: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Advance Status
                  <select
                    value={form.advanceStatus}
                    onChange={(e) =>
                      setForm({ ...form, advanceStatus: e.target.value as AdvanceStatus })
                    }
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {ADVANCE_STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Total Expenses
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.totalExpenses}
                    onChange={(e) => setForm({ ...form, totalExpenses: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="col-span-2 flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Expense Status
                  <select
                    value={form.expenseStatus}
                    onChange={(e) =>
                      setForm({ ...form, expenseStatus: e.target.value as ExpenseStatus })
                    }
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {EXPENSE_STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Description
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="min-h-[70px] rounded-none"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Expected Outcomes
                <Textarea
                  value={form.expectedOutcomes}
                  onChange={(e) => setForm({ ...form, expectedOutcomes: e.target.value })}
                  className="min-h-[70px] rounded-none"
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
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className={cn("flex-1", GREEN_BTN)}
                onClick={saveForm}
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
