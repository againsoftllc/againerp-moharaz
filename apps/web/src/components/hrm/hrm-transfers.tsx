"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Eye,
  FileText,
  Filter,
  Pencil,
  Plus,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  TRANSFER_STATUS_LABEL,
  TRANSFER_STATUS_OPTIONS,
  transferAvatar,
  transferPathLines,
  transferTypeLabel,
  type Transfer,
  type TransferStatus,
} from "@/lib/mock-data/hrm-transfers";
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
  createTransferView,
  deleteTransferView,
  listLifecycleBranchOptions,
  listLifecycleDepartmentOptions,
  listLifecycleDesignationOptions,
  listLifecycleEmployeeOptions,
  listTransfersView,
  updateTransferView,
  type LifecycleBranchOption,
  type LifecycleDepartmentOption,
  type LifecycleDesignationOption,
  type LifecycleEmployeeOption,
  type TransferWritePayload,
} from "@/lib/api/hrm-lifecycle";

const GREEN_BTN =
  "rounded-none bg-[#4caf50] text-white hover:bg-[#43a047] border-transparent";

type SortKey = "employeeName" | "transferDate" | "effectiveDate" | "status";
type SortDir = "asc" | "desc";

type FormState = {
  employeeId: string;
  fromBranch: string;
  fromDepartment: string;
  fromDesignation: string;
  toBranchId: string;
  toDepartmentId: string;
  toDesignationId: string;
  transferDate: string;
  effectiveDate: string;
  description: string;
  document: string;
  status: TransferStatus;
};

function todayYmd() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function pickDefaultToId<T extends { id: string }>(
  options: T[],
  currentId?: string,
): string {
  const other = options.find((o) => o.id !== currentId);
  return other?.id ?? options[0]?.id ?? currentId ?? "";
}

function emptyForm(
  employees: LifecycleEmployeeOption[] = [],
  branches: LifecycleBranchOption[] = [],
  departments: LifecycleDepartmentOption[] = [],
  designations: LifecycleDesignationOption[] = [],
): FormState {
  const e = employees[0];
  return {
    employeeId: e?.id ?? "",
    fromBranch: e?.branch ?? "",
    fromDepartment: e?.department ?? "",
    fromDesignation: e?.designation ?? "",
    toBranchId: pickDefaultToId(branches, e?.branchId),
    toDepartmentId: pickDefaultToId(departments, e?.departmentId),
    toDesignationId: pickDefaultToId(designations, e?.designationId),
    transferDate: todayYmd(),
    effectiveDate: todayYmd(),
    description: "",
    document: "",
    status: "pending",
  };
}

function formFromRow(
  row: Transfer,
  branches: LifecycleBranchOption[],
  departments: LifecycleDepartmentOption[],
  designations: LifecycleDesignationOption[],
): FormState {
  const branchByName = branches.find((b) => b.name === row.toBranch);
  const deptByName = departments.find((d) => d.name === row.toDepartment);
  const desByName = designations.find((d) => d.name === row.toDesignation);
  return {
    employeeId: row.employeeId,
    fromBranch: row.fromBranch,
    fromDepartment: row.fromDepartment,
    fromDesignation: row.fromDesignation,
    toBranchId: row.toBranchId ?? branchByName?.id ?? "",
    toDepartmentId: row.toDepartmentId ?? deptByName?.id ?? "",
    toDesignationId: row.toDesignationId ?? desByName?.id ?? "",
    transferDate: row.transferDate,
    effectiveDate: row.effectiveDate,
    description: row.description,
    document: row.document,
    status: row.status,
  };
}

function rowToPayload(
  row: Transfer,
  status: TransferStatus,
): TransferWritePayload {
  return {
    employeeId: row.employeeId,
    employeeName: row.employeeName,
    employeeEmail: row.employeeEmail,
    fromBranch: row.fromBranch,
    toBranch: row.toBranch,
    fromDepartment: row.fromDepartment,
    toDepartment: row.toDepartment,
    fromDesignation: row.fromDesignation,
    toDesignation: row.toDesignation,
    transferDate: row.transferDate,
    effectiveDate: row.effectiveDate,
    description: row.description,
    document: row.document,
    status,
    toBranchId: row.toBranchId ?? "",
    toDepartmentId: row.toDepartmentId ?? "",
    toDesignationId: row.toDesignationId ?? "",
  };
}

function statusBadgeClass(status: TransferStatus) {
  switch (status) {
    case "approved":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "rejected":
      return "border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300";
    default:
      return "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300";
  }
}

export function HrmTransfers() {
  const canWrite = useAdminCanWrite();
  const [rows, setRows] = useState<Transfer[]>([]);
  const [employeeOptions, setEmployeeOptions] = useState<LifecycleEmployeeOption[]>([]);
  const [branchOptions, setBranchOptions] = useState<LifecycleBranchOption[]>([]);
  const [departmentOptions, setDepartmentOptions] = useState<LifecycleDepartmentOption[]>([]);
  const [designationOptions, setDesignationOptions] = useState<LifecycleDesignationOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"all" | TransferStatus>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | TransferStatus>("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("transferDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [viewRow, setViewRow] = useState<Transfer | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [employees, branches, departments, designations, data] = await Promise.all([
          listLifecycleEmployeeOptions(),
          listLifecycleBranchOptions(),
          listLifecycleDepartmentOptions(),
          listLifecycleDesignationOptions(),
          listTransfersView(),
        ]);
        if (cancelled) return;
        setEmployeeOptions(employees);
        setBranchOptions(branches);
        setDepartmentOptions(departments);
        setDesignationOptions(designations);
        setRows(data);
        setForm(emptyForm(employees, branches, departments, designations));
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load transfers");
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
      list = list.filter((r) => {
        const hay = [
          r.employeeName,
          r.employeeEmail,
          transferTypeLabel(r),
          ...transferPathLines(r),
          r.description,
          r.document,
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
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
      fromBranch: e.branch,
      fromDepartment: e.department,
      fromDesignation: e.designation,
      toBranchId:
        f.toBranchId && f.toBranchId !== e.branchId
          ? f.toBranchId
          : pickDefaultToId(branchOptions, e.branchId),
      toDepartmentId:
        f.toDepartmentId && f.toDepartmentId !== e.departmentId
          ? f.toDepartmentId
          : pickDefaultToId(departmentOptions, e.departmentId),
      toDesignationId:
        f.toDesignationId && f.toDesignationId !== e.designationId
          ? f.toDesignationId
          : pickDefaultToId(designationOptions, e.designationId),
    }));
  }

  function openAdd() {
    setFormMode("add");
    setEditId(null);
    setForm(emptyForm(employeeOptions, branchOptions, departmentOptions, designationOptions));
    setFormOpen(true);
  }

  function openEdit(row: Transfer) {
    setFormMode("edit");
    setEditId(row.id);
    setForm(formFromRow(row, branchOptions, departmentOptions, designationOptions));
    setFormOpen(true);
  }

  async function saveForm() {
    const emp = employeeOptions.find((e) => e.id === form.employeeId);
    if (!emp) {
      toast.error("Select an employee");
      return;
    }
    if (!form.transferDate || !form.effectiveDate) {
      toast.error("Transfer date and effective date are required");
      return;
    }
    const changed =
      emp.branchId !== form.toBranchId ||
      emp.departmentId !== form.toDepartmentId ||
      emp.designationId !== form.toDesignationId;
    if (!changed) {
      toast.error("Change at least one of branch, department, or designation");
      return;
    }

    const toBranch = branchOptions.find((b) => b.id === form.toBranchId);
    const toDepartment = departmentOptions.find((d) => d.id === form.toDepartmentId);
    const toDesignation = designationOptions.find((d) => d.id === form.toDesignationId);

    const payload: TransferWritePayload = {
      employeeId: emp.id,
      employeeName: emp.name,
      employeeEmail: emp.email,
      fromBranch: form.fromBranch,
      toBranch: toBranch?.name ?? "",
      fromDepartment: form.fromDepartment,
      toDepartment: toDepartment?.name ?? "",
      fromDesignation: form.fromDesignation,
      toDesignation: toDesignation?.name ?? "",
      transferDate: form.transferDate,
      effectiveDate: form.effectiveDate,
      description: form.description.trim(),
      document: form.document.trim(),
      status: form.status,
      toBranchId: form.toBranchId,
      toDepartmentId: form.toDepartmentId,
      toDesignationId: form.toDesignationId,
    };

    setSaving(true);
    try {
      if (formMode === "edit" && editId) {
        const updated = await updateTransferView(editId, payload);
        setRows((prev) => prev.map((r) => (r.id === editId ? updated : r)));
        setViewRow((v) => (v?.id === editId ? updated : v));
        toast.success("Transfer updated");
      } else {
        const created = await createTransferView(payload);
        setRows((prev) => [created, ...prev]);
        toast.success("Transfer created");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: Transfer) {
    setSaving(true);
    try {
      await deleteTransferView(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setViewRow((v) => (v?.id === row.id ? null : v));
      toast.success("Transfer deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(row: Transfer, status: TransferStatus) {
    setSaving(true);
    try {
      const updated = await updateTransferView(row.id, rowToPayload(row, status));
      setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
      setViewRow((v) => (v?.id === row.id ? updated : v));
      toast.success(
        status === "approved"
          ? `Approved — ${row.employeeName}`
          : status === "rejected"
            ? `Rejected — ${row.employeeName}`
            : "Status updated",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Status update failed");
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
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Employee Transfers</h1>
        {canWrite ? (
          <Button type="button" size="sm" className={GREEN_BTN} onClick={openAdd}>
            <Plus className="size-3.5" />
            Add Transfer
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
                onChange={(e) => setDraftStatus(e.target.value as "all" | TransferStatus)}
                className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="all">All</option>
                {TRANSFER_STATUS_OPTIONS.map((s) => (
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
        <table className="w-full min-w-[1120px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60">
            <tr className="border-b border-border text-left">
              <th className="w-12 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                #
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Employee" col="employeeName" />
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Transfer Type
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                From → To
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Transfer Date" col="transferDate" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Effective Date" col="effectiveDate" />
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
                <td colSpan={9} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Loading transfers...
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No transfers found.
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => {
                const pending = row.status === "pending";
                return (
                  <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-muted/20">
                    <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                      {(pageSafe - 1) * perPage + idx + 1}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={transferAvatar(row.employeeId)}
                          alt=""
                          className="h-8 w-8 shrink-0 rounded-none border border-border object-cover"
                        />
                        <div className="min-w-0">
                          <div className="font-medium text-foreground">{row.employeeName}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {row.employeeEmail}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">{transferTypeLabel(row)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col gap-0.5 text-sm leading-snug">
                        {transferPathLines(row).map((line) => (
                          <span key={line}>{line}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{row.transferDate}</td>
                    <td className="px-3 py-2.5 tabular-nums">{row.effectiveDate}</td>
                    <td className="px-3 py-2.5">
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-none text-[10px] font-normal",
                          statusBadgeClass(row.status),
                        )}
                      >
                        {TRANSFER_STATUS_LABEL[row.status]}
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
                        {canWrite && pending ? (
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
                              className="h-7 w-7 rounded-none text-emerald-600"
                              onClick={() => setStatus(row, "approved")}
                              aria-label="Approve"
                              disabled={saving}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-none text-destructive"
                              onClick={() => setStatus(row, "rejected")}
                              aria-label="Reject"
                              disabled={saving}
                            >
                              <XCircle className="h-3.5 w-3.5" />
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
                );
              })
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
          title={viewRow ? `Transfer — ${viewRow.employeeName}` : "Transfer"}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          {viewRow ? (
            <div className="flex h-full min-h-0 flex-col" data-view="hrm-transfer-workdo">
              <div className="shrink-0 border-b border-border px-4 py-4 pr-10">
                <div className="flex items-start gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={transferAvatar(viewRow.employeeId)}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-none border border-border object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold leading-snug">{viewRow.employeeName}</p>
                    <p className="truncate text-xs text-muted-foreground">{viewRow.employeeEmail}</p>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {transferTypeLabel(viewRow)}
                    </p>
                    <Badge
                      variant="outline"
                      className={cn(
                        "mt-2 rounded-none text-[10px] font-normal",
                        statusBadgeClass(viewRow.status),
                      )}
                    >
                      {TRANSFER_STATUS_LABEL[viewRow.status]}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
                <div className="rounded-none border border-border bg-muted/20 px-3 py-3">
                  <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                    From → To
                  </p>
                  <ul className="space-y-1.5 text-sm">
                    {transferPathLines(viewRow).map((line) => (
                      <li key={line} className="font-medium text-foreground">
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>

                <dl className="divide-y divide-border rounded-none border border-border text-sm">
                  {(
                    [
                      ["Employee", viewRow.employeeName],
                      ["Email", viewRow.employeeEmail],
                      ["Transfer Type", transferTypeLabel(viewRow)],
                      ["Transfer Date", viewRow.transferDate],
                      ["Effective Date", viewRow.effectiveDate],
                      ["Status", TRANSFER_STATUS_LABEL[viewRow.status]],
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

              {canWrite && viewRow.status === "pending" ? (
                <div className="flex shrink-0 flex-wrap gap-2 border-t border-border px-4 py-3">
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
                    size="sm"
                    className={cn("rounded-none", GREEN_BTN)}
                    onClick={() => setStatus(viewRow, "approved")}
                    disabled={saving}
                  >
                    <CheckCircle2 className="size-3.5" />
                    Approve
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-none text-destructive"
                    onClick={() => setStatus(viewRow, "rejected")}
                    disabled={saving}
                  >
                    <XCircle className="size-3.5" />
                    Reject
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
          title={formMode === "add" ? "Add Transfer" : "Edit Transfer"}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="shrink-0 space-y-1 border-b border-border px-4 py-3 pr-10 text-left">
              <SheetTitle className="text-base">
                {formMode === "add" ? "Add Transfer" : "Edit Transfer"}
              </SheetTitle>
              <SheetDescription className="text-xs">
                Workdo fields — branch / department / designation from→to, dates, document.
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Employee *
                <select
                  value={form.employeeId}
                  onChange={(e) => applyEmployee(e.target.value)}
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

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  From Branch
                  <Input
                    value={form.fromBranch}
                    readOnly
                    className="h-9 rounded-none bg-muted/30"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  To Branch
                  <select
                    value={form.toBranchId}
                    onChange={(e) => setForm({ ...form, toBranchId: e.target.value })}
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {branchOptions.length === 0 ? (
                      <option value="">No branches</option>
                    ) : (
                      branchOptions.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  From Department
                  <Input
                    value={form.fromDepartment}
                    readOnly
                    className="h-9 rounded-none bg-muted/30"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  To Department
                  <select
                    value={form.toDepartmentId}
                    onChange={(e) => setForm({ ...form, toDepartmentId: e.target.value })}
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {departmentOptions.length === 0 ? (
                      <option value="">No departments</option>
                    ) : (
                      departmentOptions.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  From Designation
                  <Input
                    value={form.fromDesignation}
                    readOnly
                    className="h-9 rounded-none bg-muted/30"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  To Designation
                  <select
                    value={form.toDesignationId}
                    onChange={(e) => setForm({ ...form, toDesignationId: e.target.value })}
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {designationOptions.length === 0 ? (
                      <option value="">No designations</option>
                    ) : (
                      designationOptions.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Transfer Date *
                  <Input
                    type="date"
                    value={form.transferDate}
                    onChange={(e) => setForm({ ...form, transferDate: e.target.value })}
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
                <label className="col-span-2 flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Status
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm({ ...form, status: e.target.value as TransferStatus })
                    }
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {TRANSFER_STATUS_OPTIONS.map((s) => (
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
                    placeholder="transfer-letter.pdf"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Description
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="min-h-[90px] rounded-none"
                  placeholder="Reason for transfer"
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
