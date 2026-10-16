"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, FileText, Filter, Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  PROMOTION_STATUS_LABEL,
  PROMOTION_STATUS_OPTIONS,
  formatMoney,
  promotionAvatar,
  type Promotion,
  type PromotionStatus,
} from "@/lib/mock-data/hrm-promotions";
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
  createPromotionView,
  deletePromotionView,
  listLifecycleDesignationOptions,
  listLifecycleEmployeeOptions,
  listPromotionsView,
  updatePromotionView,
  type LifecycleDesignationOption,
  type LifecycleEmployeeOption,
} from "@/lib/api/hrm-lifecycle";

const GREEN_BTN =
  "rounded-none bg-[#4caf50] text-white hover:bg-[#43a047] border-transparent";

type SortKey =
  | "employeeName"
  | "previousDesignation"
  | "newDesignation"
  | "promotionDate"
  | "effectiveDate"
  | "status";
type SortDir = "asc" | "desc";

type FormState = {
  employeeId: string;
  previousDesignation: string;
  designationId: string;
  currentSalary: string;
  newSalary: string;
  promotionDate: string;
  effectiveDate: string;
  description: string;
  document: string;
  status: PromotionStatus;
};

function todayYmd() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function pickDefaultDesignationId(
  employees: LifecycleEmployeeOption[],
  designations: LifecycleDesignationOption[],
  employeeId?: string,
): string {
  const emp = employees.find((e) => e.id === employeeId) ?? employees[0];
  const other = designations.find((d) => d.id !== emp?.designationId);
  return other?.id ?? designations[0]?.id ?? emp?.designationId ?? "";
}

function emptyForm(
  employees: LifecycleEmployeeOption[] = [],
  designations: LifecycleDesignationOption[] = [],
): FormState {
  const e = employees[0];
  const designationId = pickDefaultDesignationId(employees, designations, e?.id);
  return {
    employeeId: e?.id ?? "",
    previousDesignation: e?.designation ?? "",
    designationId,
    currentSalary: String(e?.salary ?? 0),
    newSalary: String(Math.round((e?.salary ?? 0) * 1.25) || 0),
    promotionDate: todayYmd(),
    effectiveDate: todayYmd(),
    description: "",
    document: "",
    status: "pending",
  };
}

function formFromRow(
  row: Promotion,
  designations: LifecycleDesignationOption[],
): FormState {
  const byId = row.designationId
    ? designations.find((d) => d.id === row.designationId)
    : undefined;
  const byName = designations.find((d) => d.name === row.newDesignation);
  return {
    employeeId: row.employeeId,
    previousDesignation: row.previousDesignation,
    designationId: byId?.id ?? byName?.id ?? "",
    currentSalary: String(row.currentSalary),
    newSalary: String(row.newSalary),
    promotionDate: row.promotionDate,
    effectiveDate: row.effectiveDate,
    description: row.description,
    document: row.document,
    status: row.status,
  };
}

function statusBadgeClass(status: PromotionStatus) {
  switch (status) {
    case "approved":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "rejected":
      return "border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300";
    default:
      return "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300";
  }
}

export function HrmPromotions() {
  const canWrite = useAdminCanWrite();
  const [rows, setRows] = useState<Promotion[]>([]);
  const [employeeOptions, setEmployeeOptions] = useState<LifecycleEmployeeOption[]>([]);
  const [designationOptions, setDesignationOptions] = useState<LifecycleDesignationOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"all" | PromotionStatus>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | PromotionStatus>("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("promotionDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [viewRow, setViewRow] = useState<Promotion | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [employees, designations, data] = await Promise.all([
          listLifecycleEmployeeOptions(),
          listLifecycleDesignationOptions(),
          listPromotionsView(),
        ]);
        if (cancelled) return;
        setEmployeeOptions(employees);
        setDesignationOptions(designations);
        setRows(data);
        setForm(emptyForm(employees, designations));
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load promotions");
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
          r.previousDesignation.toLowerCase().includes(q) ||
          r.newDesignation.toLowerCase().includes(q) ||
          r.department.toLowerCase().includes(q) ||
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

  function applyEmployee(employeeId: string) {
    const e = employeeOptions.find((x) => x.id === employeeId);
    if (!e) {
      setForm((f) => ({ ...f, employeeId }));
      return;
    }
    setForm((f) => ({
      ...f,
      employeeId: e.id,
      previousDesignation: e.designation,
      designationId:
        f.designationId && f.designationId !== e.designationId
          ? f.designationId
          : pickDefaultDesignationId(employeeOptions, designationOptions, e.id),
      currentSalary: String(e.salary),
      newSalary: String(Math.round(e.salary * 1.25) || 0),
    }));
  }

  function openAdd() {
    setFormMode("add");
    setEditId(null);
    setForm(emptyForm(employeeOptions, designationOptions));
    setFormOpen(true);
  }

  function openEdit(row: Promotion) {
    setFormMode("edit");
    setEditId(row.id);
    setForm(formFromRow(row, designationOptions));
    setFormOpen(true);
  }

  async function saveForm() {
    const emp = employeeOptions.find((e) => e.id === form.employeeId);
    if (!emp) {
      toast.error("Select an employee");
      return;
    }
    const designation = designationOptions.find((d) => d.id === form.designationId);
    if (!designation || !form.promotionDate || !form.effectiveDate) {
      toast.error("New designation, promotion date, and effective date are required");
      return;
    }

    const payload = {
      employeeId: emp.id,
      employeeName: emp.name,
      employeeEmail: emp.email,
      department: emp.department,
      previousDesignation: form.previousDesignation.trim() || emp.designation,
      newDesignation: designation.name,
      currentSalary: Number(form.currentSalary) || emp.salary,
      newSalary: Number(form.newSalary) || 0,
      promotionDate: form.promotionDate,
      effectiveDate: form.effectiveDate,
      description: form.description.trim(),
      document: form.document.trim(),
      status: form.status,
      designationId: designation.id,
    };

    setSaving(true);
    try {
      if (formMode === "edit" && editId) {
        const updated = await updatePromotionView(editId, payload);
        setRows((prev) => prev.map((r) => (r.id === editId ? updated : r)));
        setViewRow((v) => (v?.id === editId ? updated : v));
        toast.success("Promotion updated");
      } else {
        const created = await createPromotionView(payload);
        setRows((prev) => [created, ...prev]);
        toast.success("Promotion created");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: Promotion) {
    setSaving(true);
    try {
      await deletePromotionView(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setViewRow((v) => (v?.id === row.id ? null : v));
      toast.success("Promotion deleted");
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
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Promotions</h1>
        {canWrite ? (
          <Button type="button" size="sm" className={GREEN_BTN} onClick={openAdd}>
            <Plus className="size-3.5" />
            Add Promotion
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
                onChange={(e) => setDraftStatus(e.target.value as "all" | PromotionStatus)}
                className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="all">All</option>
                {PROMOTION_STATUS_OPTIONS.map((s) => (
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
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60">
            <tr className="border-b border-border text-left">
              <th className="w-12 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                #
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Employee" col="employeeName" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Previous Designation" col="previousDesignation" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="New Designation" col="newDesignation" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Promotion Date" col="promotionDate" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Effective Date" col="effectiveDate" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Status" col="status" />
              </th>
              <th className="w-[1%] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Document
              </th>
              <th className="w-[1%] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Loading promotions...
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No promotions found.
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
                        src={promotionAvatar(row.employeeId)}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-none border border-border object-cover"
                      />
                      <div className="min-w-0">
                        <div className="font-medium text-foreground">{row.employeeName}</div>
                        <div className="truncate text-xs text-muted-foreground">{row.employeeEmail}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">{row.previousDesignation}</td>
                  <td className="px-3 py-2.5 font-medium text-foreground">{row.newDesignation}</td>
                  <td className="px-3 py-2.5 tabular-nums">{row.promotionDate}</td>
                  <td className="px-3 py-2.5 tabular-nums">{row.effectiveDate}</td>
                  <td className="px-3 py-2.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-none text-[10px] font-normal",
                        statusBadgeClass(row.status),
                      )}
                    >
                      {PROMOTION_STATUS_LABEL[row.status]}
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

      {/* View — Workdo promotion detail */}
      <Sheet open={!!viewRow} onOpenChange={(o) => !o && setViewRow(null)}>
        <SheetContent
          side="right"
          title={viewRow ? `Promotion — ${viewRow.employeeName}` : "Promotion"}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          {viewRow ? (
            <div className="flex h-full min-h-0 flex-col" data-view="hrm-promotion-workdo">
              <div className="shrink-0 border-b border-border px-4 py-4 pr-10">
                <div className="flex items-start gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={promotionAvatar(viewRow.employeeId)}
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
                      {PROMOTION_STATUS_LABEL[viewRow.status]}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-none border border-border bg-muted/20 px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Previous Designation
                    </p>
                    <p className="mt-0.5 text-sm font-medium">{viewRow.previousDesignation}</p>
                  </div>
                  <div className="rounded-none border border-border bg-muted/20 px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      New Designation
                    </p>
                    <p className="mt-0.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                      {viewRow.newDesignation}
                    </p>
                  </div>
                </div>

                <dl className="divide-y divide-border rounded-none border border-border text-sm">
                  {(
                    [
                      ["Employee", viewRow.employeeName],
                      ["Email", viewRow.employeeEmail],
                      ["Previous Designation", viewRow.previousDesignation],
                      ["New Designation", viewRow.newDesignation],
                      ["Promotion Date", viewRow.promotionDate],
                      ["Effective Date", viewRow.effectiveDate],
                      ["Current Salary", formatMoney(viewRow.currentSalary)],
                      ["New Salary", formatMoney(viewRow.newSalary)],
                      ["Status", PROMOTION_STATUS_LABEL[viewRow.status]],
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
          title={formMode === "add" ? "Add Promotion" : "Edit Promotion"}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="shrink-0 space-y-1 border-b border-border px-4 py-3 pr-10 text-left">
              <SheetTitle className="text-base">
                {formMode === "add" ? "Add Promotion" : "Edit Promotion"}
              </SheetTitle>
              <SheetDescription className="text-xs">
                Workdo fields — employee, previous/new designation, dates, status, document.
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Employee *
                <select
                  value={form.employeeId}
                  onChange={(e) => applyEmployee(e.target.value)}
                  className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
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
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Previous Designation
                  <Input
                    value={form.previousDesignation}
                    onChange={(e) => setForm({ ...form, previousDesignation: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  New Designation *
                  <select
                    value={form.designationId}
                    onChange={(e) => setForm({ ...form, designationId: e.target.value })}
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {designationOptions.length === 0 ? (
                      <option value="">No designations</option>
                    ) : (
                      designationOptions.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Promotion Date *
                  <Input
                    type="date"
                    value={form.promotionDate}
                    onChange={(e) => setForm({ ...form, promotionDate: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Effective Date *
                  <Input
                    type="date"
                    value={form.effectiveDate}
                    onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Current Salary
                  <Input
                    type="number"
                    min={0}
                    value={form.currentSalary}
                    onChange={(e) => setForm({ ...form, currentSalary: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  New Salary
                  <Input
                    type="number"
                    min={0}
                    value={form.newSalary}
                    onChange={(e) => setForm({ ...form, newSalary: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="col-span-2 flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Status
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm({ ...form, status: e.target.value as PromotionStatus })
                    }
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {PROMOTION_STATUS_OPTIONS.map((s) => (
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
                    placeholder="promotion-letter.pdf"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Description
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="min-h-[90px] rounded-none"
                  placeholder="Reason for promotion"
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
