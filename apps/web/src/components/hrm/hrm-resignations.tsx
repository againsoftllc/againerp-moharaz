"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, FileText, Filter, Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  NOTICE_PERIOD_OPTIONS,
  RESIGNATION_STATUS_LABEL,
  RESIGNATION_STATUS_OPTIONS,
  resignationAvatar,
  type Resignation,
  type ResignationStatus,
} from "@/lib/mock-data/hrm-resignations";
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
  createResignationView,
  deleteResignationView,
  listLifecycleEmployeeOptions,
  listResignationsView,
  updateResignationView,
} from "@/lib/api/hrm-lifecycle";

const GREEN_BTN =
  "rounded-none bg-[#4caf50] text-white hover:bg-[#43a047] border-transparent";

type SortKey = "employeeName" | "resignationDate" | "lastWorkingDay" | "status";
type SortDir = "asc" | "desc";

type FormState = {
  employeeId: string;
  resignationDate: string;
  lastWorkingDay: string;
  noticePeriod: string;
  status: ResignationStatus;
  description: string;
  document: string;
};

type EmployeeOption = {
  id: string;
  name: string;
  email: string;
};

function todayYmd() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function emptyForm(employees: EmployeeOption[] = []): FormState {
  return {
    employeeId: employees[0]?.id ?? "",
    resignationDate: todayYmd(),
    lastWorkingDay: todayYmd(),
    noticePeriod: NOTICE_PERIOD_OPTIONS[1],
    status: "pending",
    description: "",
    document: "",
  };
}

function formFromRow(row: Resignation): FormState {
  return {
    employeeId: row.employeeId,
    resignationDate: row.resignationDate,
    lastWorkingDay: row.lastWorkingDay,
    noticePeriod: row.noticePeriod,
    status: row.status,
    description: row.description,
    document: row.document,
  };
}

function statusBadgeClass(status: ResignationStatus) {
  switch (status) {
    case "completed":
      return "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300";
    case "rejected":
      return "border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300";
    default:
      return "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300";
  }
}

export function HrmResignations() {
  const canWrite = useAdminCanWrite();
  const [rows, setRows] = useState<Resignation[]>([]);
  const [employeeOptions, setEmployeeOptions] = useState<EmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"all" | ResignationStatus>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | ResignationStatus>("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("resignationDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [viewRow, setViewRow] = useState<Resignation | null>(null);
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
          listResignationsView(),
        ]);
        if (cancelled) return;
        setEmployeeOptions(employees);
        setRows(data);
        setForm(emptyForm(employees));
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load resignations");
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
          r.noticePeriod.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.document.toLowerCase().includes(q),
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
      setSortDir(key === "employeeName" || key === "status" ? "asc" : "desc");
    }
  }

  function openAdd() {
    setFormMode("add");
    setEditId(null);
    setForm(emptyForm(employeeOptions));
    setFormOpen(true);
  }

  function openEdit(row: Resignation) {
    setFormMode("edit");
    setEditId(row.id);
    setForm(formFromRow(row));
    setFormOpen(true);
  }

  async function saveForm() {
    const emp = employeeOptions.find((e) => e.id === form.employeeId);
    if (!emp) {
      toast.error("Select an employee");
      return;
    }
    if (!form.resignationDate || !form.lastWorkingDay || !form.noticePeriod.trim()) {
      toast.error("Resignation date, last working day, and notice period are required");
      return;
    }

    const payload: Omit<Resignation, "id"> = {
      employeeId: emp.id,
      employeeName: emp.name,
      employeeEmail: emp.email,
      resignationDate: form.resignationDate,
      lastWorkingDay: form.lastWorkingDay,
      noticePeriod: form.noticePeriod.trim(),
      status: form.status,
      description: form.description.trim(),
      document: form.document.trim(),
    };

    setSaving(true);
    try {
      if (formMode === "edit" && editId) {
        const updated = await updateResignationView(editId, payload);
        setRows((prev) => prev.map((r) => (r.id === editId ? updated : r)));
        setViewRow((v) => (v?.id === editId ? updated : v));
        toast.success("Resignation updated");
      } else {
        const created = await createResignationView(payload);
        setRows((prev) => [created, ...prev]);
        toast.success("Resignation created");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: Resignation) {
    setSaving(true);
    try {
      await deleteResignationView(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setViewRow((v) => (v?.id === row.id ? null : v));
      toast.success("Resignation deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  function openDocument(name: string) {
    if (!name) {
      toast.message("No document attached");
      return;
    }
    toast.message(`Document: ${name}`);
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
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Resignations</h1>
        {canWrite ? (
          <Button type="button" size="sm" className={GREEN_BTN} onClick={openAdd}>
            <Plus className="size-3.5" />
            Add Resignation
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
                onChange={(e) => setDraftStatus(e.target.value as "all" | ResignationStatus)}
                className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="all">All</option>
                {RESIGNATION_STATUS_OPTIONS.map((s) => (
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
        <table className="w-full min-w-[1040px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60">
            <tr className="border-b border-border text-left">
              <th className="w-12 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                #
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Employee" col="employeeName" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Resignation Date" col="resignationDate" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Last Working Day" col="lastWorkingDay" />
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Notice Period
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Status" col="status" />
              </th>
              <th className="w-[1%] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Documents
              </th>
              <th className="w-[1%] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Loading resignations...
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No resignations found.
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
                        src={resignationAvatar(row.employeeId)}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-none border border-border object-cover"
                      />
                      <div className="min-w-0">
                        <div className="font-medium text-foreground">{row.employeeName}</div>
                        <div className="truncate text-xs text-muted-foreground">{row.employeeEmail}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{row.resignationDate}</td>
                  <td className="px-3 py-2.5 tabular-nums">{row.lastWorkingDay}</td>
                  <td className="px-3 py-2.5">{row.noticePeriod}</td>
                  <td className="px-3 py-2.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-none text-[10px] font-normal",
                        statusBadgeClass(row.status),
                      )}
                    >
                      {RESIGNATION_STATUS_LABEL[row.status]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-7 w-7 rounded-none",
                        row.document ? "text-sky-600" : "text-muted-foreground/40",
                      )}
                      onClick={() => openDocument(row.document)}
                      aria-label={row.document ? "View document" : "No document"}
                      disabled={!row.document}
                    >
                      <FileText className="h-3.5 w-3.5" />
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
          title={viewRow ? `Resignation — ${viewRow.employeeName}` : "Resignation"}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          {viewRow ? (
            <div className="flex h-full min-h-0 flex-col" data-view="hrm-resignation-workdo">
              <div className="shrink-0 border-b border-border px-4 py-4 pr-10">
                <div className="flex items-start gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={resignationAvatar(viewRow.employeeId)}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-none border border-border object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold leading-snug">{viewRow.employeeName}</p>
                    <p className="truncate text-xs text-muted-foreground">{viewRow.employeeEmail}</p>
                    <Badge
                      variant="outline"
                      className={cn(
                        "mt-2 rounded-none text-[10px] font-normal",
                        statusBadgeClass(viewRow.status),
                      )}
                    >
                      {RESIGNATION_STATUS_LABEL[viewRow.status]}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-none border border-border bg-muted/20 px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Resignation Date
                    </p>
                    <p className="mt-0.5 text-sm font-medium tabular-nums">{viewRow.resignationDate}</p>
                  </div>
                  <div className="rounded-none border border-border bg-muted/20 px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Last Working Day
                    </p>
                    <p className="mt-0.5 text-sm font-medium tabular-nums">{viewRow.lastWorkingDay}</p>
                  </div>
                </div>

                <dl className="divide-y divide-border rounded-none border border-border text-sm">
                  {(
                    [
                      ["Employee", viewRow.employeeName],
                      ["Email", viewRow.employeeEmail],
                      ["Resignation Date", viewRow.resignationDate],
                      ["Last Working Day", viewRow.lastWorkingDay],
                      ["Notice Period", viewRow.noticePeriod],
                      ["Status", RESIGNATION_STATUS_LABEL[viewRow.status]],
                      ["Document", viewRow.document || "—"],
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

      {/* Create / Edit */}
      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent
          side="right"
          title={formMode === "add" ? "Add Resignation" : "Edit Resignation"}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="shrink-0 space-y-1 border-b border-border px-4 py-3 pr-10 text-left">
              <SheetTitle className="text-base">
                {formMode === "add" ? "Add Resignation" : "Edit Resignation"}
              </SheetTitle>
              <SheetDescription className="text-xs">
                Workdo fields — resignation date, last working day, notice period, status, document.
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Employee *
                <select
                  value={form.employeeId}
                  onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                  className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                >
                  {employeeOptions.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} — {e.email}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Resignation Date *
                  <Input
                    type="date"
                    value={form.resignationDate}
                    onChange={(e) => setForm({ ...form, resignationDate: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Last Working Day *
                  <Input
                    type="date"
                    value={form.lastWorkingDay}
                    onChange={(e) => setForm({ ...form, lastWorkingDay: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Notice Period *
                  <select
                    value={form.noticePeriod}
                    onChange={(e) => setForm({ ...form, noticePeriod: e.target.value })}
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {NOTICE_PERIOD_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                    {(NOTICE_PERIOD_OPTIONS as readonly string[]).includes(form.noticePeriod)
                      ? null
                      : form.noticePeriod && (
                          <option value={form.noticePeriod}>{form.noticePeriod}</option>
                        )}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Status
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm({ ...form, status: e.target.value as ResignationStatus })
                    }
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {RESIGNATION_STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="col-span-2 flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Document
                  <Input
                    value={form.document}
                    onChange={(e) => setForm({ ...form, document: e.target.value })}
                    className="h-9 rounded-none"
                    placeholder="resignation-letter.pdf"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Description
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="min-h-[90px] rounded-none"
                  placeholder="Reason for resignation"
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
