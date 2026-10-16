"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Filter,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import {
  CONTRACT_NAME_OPTIONS,
  EMPLOYEE_CONTRACT_STATUS_LABEL,
  EMPLOYEE_CONTRACT_STATUS_OPTIONS,
  contractElapsedPct,
  formatContractAmount,
  formatContractDuration,
  isNearExpire,
  type EmployeeContract,
  type EmployeeContractStatus,
} from "@/lib/mock-data/hrm-employee-contracts";
import {
  activateHrmEmployeeContract,
  apiEmployeeContractToView,
  buildContractLookups,
  createHrmEmployeeContract,
  deleteHrmEmployeeContract,
  listHrmContractTypes,
  listHrmEmployeeContracts,
  nextContractNumber,
  updateHrmEmployeeContract,
  type ContractLookups,
} from "@/lib/api/hrm-contracts";
import { listHrmEmployees } from "@/lib/api/hrm-employees";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

type SortKey = "contractNumber" | "contractName" | "employeeName" | "startDate" | "amount" | "status";
type SortDir = "asc" | "desc";

type ContractRow = EmployeeContract & {
  employeeId: string;
  contractTypeId: string;
};

type EmployeeOption = { id: string; name: string };
type ContractTypeOption = { id: string; name: string };

type FormState = {
  contractNumber: string;
  contractTypeId: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  amount: string;
  status: EmployeeContractStatus;
  notes: string;
};

function emptyForm(nextNumber: string, employeeId = "", contractTypeId = ""): FormState {
  return {
    contractNumber: nextNumber,
    contractTypeId,
    employeeId,
    startDate: todayYmd(),
    endDate: "",
    amount: "",
    status: "draft",
    notes: "",
  };
}

function formFromRow(row: ContractRow): FormState {
  return {
    contractNumber: row.contractNumber,
    contractTypeId: row.contractTypeId,
    employeeId: row.employeeId,
    startDate: row.startDate,
    endDate: row.endDate,
    amount: String(row.amount),
    status: row.status,
    notes: row.notes,
  };
}

function mapContractRow(
  apiRow: Awaited<ReturnType<typeof listHrmEmployeeContracts>>[number],
  lookups: ContractLookups,
): ContractRow {
  return {
    ...apiEmployeeContractToView(apiRow, lookups),
    employeeId: apiRow.employee_id ?? "",
    contractTypeId: apiRow.contract_type_id ?? "",
  };
}

function todayYmd() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function statusBadgeClass(status: EmployeeContractStatus) {
  switch (status) {
    case "active":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "draft":
      return "border-border bg-muted/40 text-muted-foreground";
    case "expired":
      return "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300";
    case "terminated":
      return "border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300";
  }
}

function StatCard({
  label,
  value,
  hint,
  dotClass,
  icon,
  iconClass,
}: {
  label: string;
  value: number;
  hint: string;
  dotClass: string;
  icon: ReactNode;
  iconClass: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-none border border-border bg-card px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cn("inline-block size-1.5 shrink-0 rounded-none", dotClass)} />
          {hint}
        </p>
      </div>
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-none border",
          iconClass,
        )}
      >
        {icon}
      </div>
    </div>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

export function HrmEmployeeContracts() {
  const canWrite = useAdminCanWrite();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<ContractRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [contractTypes, setContractTypes] = useState<ContractTypeOption[]>([]);
  const [lookups, setLookups] = useState<ContractLookups | null>(null);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"all" | EmployeeContractStatus>("all");
  const [draftNear, setDraftNear] = useState<"all" | "yes" | "no">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | EmployeeContractStatus>("all");
  const [nearFilter, setNearFilter] = useState<"all" | "yes" | "no">("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("contractNumber");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [viewRow, setViewRow] = useState<ContractRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(""));

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [typeRows, empResult, contractRows] = await Promise.all([
        listHrmContractTypes(),
        listHrmEmployees({ per_page: 500 }),
        listHrmEmployeeContracts(),
      ]);
      const employeeOptions = empResult.rows.map((e) => ({ id: e.id, name: e.name }));
      const typeOptions = typeRows.map((t) => ({ id: t.id, name: t.name }));
      const nextLookups = buildContractLookups({
        types: typeRows,
        employees: employeeOptions,
      });
      setEmployees(employeeOptions);
      setContractTypes(typeOptions);
      setLookups(nextLookups);
      setRows(contractRows.map((c) => mapContractRow(c, nextLookups)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load contracts");
      setRows([]);
      setEmployees([]);
      setContractTypes([]);
      setLookups(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const stats = useMemo(
    () => ({
      active: rows.filter((r) => r.status === "active").length,
      nearExpire: rows.filter((r) => isNearExpire(r)).length,
      draft: rows.filter((r) => r.status === "draft").length,
    }),
    [rows],
  );

  const filtered = useMemo(() => {
    let list = rows;
    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);
    if (nearFilter === "yes") list = list.filter((r) => isNearExpire(r));
    if (nearFilter === "no") list = list.filter((r) => !isNearExpire(r));
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.contractNumber.toLowerCase().includes(q) ||
          r.contractName.toLowerCase().includes(q) ||
          r.employeeName.toLowerCase().includes(q) ||
          String(r.amount).includes(q),
      );
    }
    const sorted = [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      if (as < bs) return sortDir === "asc" ? -1 : 1;
      if (as > bs) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [rows, search, statusFilter, nearFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  function toggleSort(col: SortKey) {
    if (sortKey === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(col);
      setSortDir("asc");
    }
  }

  function openAdd() {
    setFormMode("add");
    setEditId(null);
    setForm(
      emptyForm(
        nextContractNumber(rows),
        employees[0]?.id ?? "",
        contractTypes[0]?.id ?? "",
      ),
    );
    setFormOpen(true);
  }

  function openEdit(row: ContractRow) {
    setFormMode("edit");
    setEditId(row.id);
    setForm(formFromRow(row));
    setFormOpen(true);
  }

  async function saveForm() {
    const contractNumber = form.contractNumber.trim();
    if (!contractNumber || !form.employeeId || !form.contractTypeId) {
      toast.error("Contract number, employee, and contract type are required");
      return;
    }
    if (!form.startDate || !form.endDate) {
      toast.error("Start and end dates are required");
      return;
    }
    if (form.endDate < form.startDate) {
      toast.error("End date must be on or after start date");
      return;
    }
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Enter a valid contract amount");
      return;
    }

    const input = {
      contractNumber,
      employeeId: form.employeeId,
      contractTypeId: form.contractTypeId,
      startDate: form.startDate,
      endDate: form.endDate,
      basicSalary: amount,
      termsConditions: form.notes.trim(),
      status: form.status,
    };

    setSaving(true);
    try {
      if (formMode === "edit" && editId && lookups) {
        const apiRow = await updateHrmEmployeeContract(editId, input);
        const mapped = mapContractRow(apiRow, lookups);
        setRows((prev) => prev.map((r) => (r.id === editId ? mapped : r)));
        toast.success("Contract updated");
      } else if (lookups) {
        const apiRow = await createHrmEmployeeContract(input);
        const mapped = mapContractRow(apiRow, lookups);
        setRows((prev) => [mapped, ...prev]);
        toast.success("Contract added");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: ContractRow) {
    if (!window.confirm(`Delete contract “${row.contractNumber}”?`)) return;
    try {
      await deleteHrmEmployeeContract(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      toast.success("Contract deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function activate(row: ContractRow) {
    if (row.status !== "draft") return;
    try {
      const apiRow = await activateHrmEmployeeContract(row.id);
      if (!lookups) return;
      const mapped = mapContractRow(apiRow, lookups);
      setRows((prev) => prev.map((r) => (r.id === row.id ? mapped : r)));
      toast.success("Contract activated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Activation failed");
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

  const fieldClass =
    "h-9 w-full rounded-none border border-border bg-background px-2 text-sm text-foreground";

  const selectedTypeName =
    contractTypes.find((t) => t.id === form.contractTypeId)?.name ?? "—";

  if (loading) {
    return <ContentDataSkeleton label="Loading contracts…" />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Employee Contracts
        </h1>
        {canWrite ? (
          <Button type="button" size="sm" className={GREEN_BTN} onClick={openAdd}>
            <Plus className="size-3.5" />
            Add Contract
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Active Contract"
          value={stats.active}
          hint="Currently running"
          dotClass="bg-emerald-500"
          icon={<CheckCircle2 className="size-5" />}
          iconClass="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
        />
        <StatCard
          label="Contract Near Expire"
          value={stats.nearExpire}
          hint="Expiring within 30 days"
          dotClass="bg-amber-500"
          icon={<Clock className="size-5" />}
          iconClass="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        />
        <StatCard
          label="Draft Contract"
          value={stats.draft}
          hint="Pending approval"
          dotClass="bg-muted-foreground/50"
          icon={<FileText className="size-5" />}
          iconClass="border-border bg-muted/40 text-muted-foreground"
        />
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
                onChange={(e) =>
                  setDraftStatus(e.target.value as "all" | EmployeeContractStatus)
                }
                className={fieldClass}
              >
                <option value="all">All</option>
                {EMPLOYEE_CONTRACT_STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[160px] flex-col gap-1 text-xs text-muted-foreground">
              Near expire
              <select
                value={draftNear}
                onChange={(e) => setDraftNear(e.target.value as "all" | "yes" | "no")}
                className={fieldClass}
              >
                <option value="all">All</option>
                <option value="yes">Within 30 days</option>
                <option value="no">Not near expire</option>
              </select>
            </label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                className={cn("h-9", GREEN_BTN)}
                onClick={() => {
                  setStatusFilter(draftStatus);
                  setNearFilter(draftNear);
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
                  setDraftNear("all");
                  setStatusFilter("all");
                  setNearFilter("all");
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
        <table className="w-full min-w-[1000px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60">
            <tr className="border-b border-border text-left">
              <th className="w-12 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                #
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Contract Number" col="contractNumber" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Contract Name" col="contractName" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Assigned to" col="employeeName" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Status" col="status" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Contract Duration" col="startDate" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Contract Amount" col="amount" />
              </th>
              <th className="w-[1%] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No contracts found.
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => {
                const pct = contractElapsedPct(row.startDate, row.endDate);
                const near = isNearExpire(row);
                return (
                  <tr
                    key={row.id}
                    className="border-b border-border last:border-b-0 hover:bg-muted/20"
                  >
                    <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                      {(pageSafe - 1) * perPage + idx + 1}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-foreground">
                      {row.contractNumber}
                    </td>
                    <td className="px-3 py-2.5 text-foreground">{row.contractName}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-none border border-border bg-muted/40 text-[10px] font-semibold text-muted-foreground">
                          {initials(row.employeeName)}
                        </span>
                        <span className="text-foreground">{row.employeeName}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-none text-[10px] font-normal",
                          statusBadgeClass(row.status),
                        )}
                      >
                        {EMPLOYEE_CONTRACT_STATUS_LABEL[row.status]}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-foreground">
                        {formatContractDuration(row.startDate, row.endDate)}
                      </div>
                      <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                        {row.startDate} --- {row.endDate}
                      </div>
                      <div className="mt-1.5 h-1.5 w-full max-w-[160px] rounded-none bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-none",
                            near ? "bg-amber-500" : "bg-emerald-500/70",
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-semibold tabular-nums text-foreground">
                      {formatContractAmount(row.amount)}
                    </td>
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-none"
                            aria-label="Actions"
                          >
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-[9rem] rounded-none">
                          <DropdownMenuItem onClick={() => setViewRow(row)}>
                            <Eye className="mr-1.5 h-3 w-3" />
                            View
                          </DropdownMenuItem>
                          {canWrite && row.status === "draft" ? (
                            <DropdownMenuItem onClick={() => void activate(row)}>
                              <CheckCircle2 className="mr-1.5 h-3 w-3" />
                              Activate
                            </DropdownMenuItem>
                          ) : null}
                          {canWrite ? (
                            <DropdownMenuItem onClick={() => openEdit(row)}>
                              <Pencil className="mr-1.5 h-3 w-3" />
                              Edit
                            </DropdownMenuItem>
                          ) : null}
                          {canWrite ? (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => remove(row)}
                            >
                              <Trash2 className="mr-1.5 h-3 w-3" />
                              Delete
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Showing{" "}
          {filtered.length === 0 ? 0 : (pageSafe - 1) * perPage + 1}–
          {Math.min(pageSafe * perPage, filtered.length)} of {filtered.length}
        </span>
        <div className="flex items-center gap-1">
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
          <span className="px-2 tabular-nums">
            {pageSafe} / {totalPages}
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

      <Sheet open={!!viewRow} onOpenChange={(o) => !o && setViewRow(null)}>
        <SheetContent
          side="right"
          resizable
          closeButton="chevron"
          className="flex w-[420px] min-w-[160px] max-w-[720px] flex-col gap-0 p-0"
          title="Contract details"
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base">Contract Details</SheetTitle>
            <SheetDescription className="sr-only">View employee contract</SheetDescription>
          </SheetHeader>
          {viewRow ? (
            <div className="flex-1 space-y-4 overflow-auto p-4">
              <div>
                <div className="text-base font-semibold text-foreground">
                  {viewRow.contractNumber}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">{viewRow.contractName}</div>
              </div>
              <dl className="grid gap-3 text-sm">
                {(
                  [
                    ["Assigned to", viewRow.employeeName],
                    ["Status", EMPLOYEE_CONTRACT_STATUS_LABEL[viewRow.status]],
                    [
                      "Duration",
                      formatContractDuration(viewRow.startDate, viewRow.endDate),
                    ],
                    ["Period", `${viewRow.startDate} --- ${viewRow.endDate}`],
                    ["Amount", formatContractAmount(viewRow.amount)],
                    ["Notes", viewRow.notes || "—"],
                  ] as const
                ).map(([k, v]) => (
                  <div
                    key={k}
                    className="grid grid-cols-[110px_1fr] gap-2 border-b border-border/60 pb-2"
                  >
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="text-foreground">{v}</dd>
                  </div>
                ))}
              </dl>
              {canWrite ? (
                <Button
                  type="button"
                  size="sm"
                  className={cn("h-9", GREEN_BTN)}
                  onClick={() => {
                    openEdit(viewRow);
                    setViewRow(null);
                  }}
                >
                  <Pencil className="size-3.5" />
                  Edit
                </Button>
              ) : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent
          side="right"
          resizable
          closeButton="chevron"
          className="flex w-[460px] min-w-[160px] max-w-[720px] flex-col gap-0 p-0"
          title={formMode === "edit" ? "Edit Contract" : "Add Contract"}
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base">
              {formMode === "edit" ? "Edit Contract" : "Add Contract"}
            </SheetTitle>
            <SheetDescription className="sr-only">Employee contract form</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-3 overflow-auto p-4">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Contract Number *
              <Input
                value={form.contractNumber}
                onChange={(e) => setForm((f) => ({ ...f, contractNumber: e.target.value }))}
                className="h-9 rounded-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Contract Type *
              <select
                value={form.contractTypeId}
                onChange={(e) => setForm((f) => ({ ...f, contractTypeId: e.target.value }))}
                className={fieldClass}
              >
                {contractTypes.length === 0 ? (
                  <option value="">No contract types</option>
                ) : (
                  contractTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))
                )}
              </select>
              <span className="text-[10px] text-muted-foreground">
                Display name: {selectedTypeName}
              </span>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Assigned to *
              <select
                value={form.employeeId}
                onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}
                className={fieldClass}
              >
                {employees.length === 0 ? (
                  <option value="">No employees</option>
                ) : (
                  employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))
                )}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Start Date *
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                  className="h-9 rounded-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                End Date *
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                  className="h-9 rounded-none"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Contract Amount *
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className="h-9 rounded-none"
                placeholder="88000"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Status *
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    status: e.target.value as EmployeeContractStatus,
                  }))
                }
                className={fieldClass}
              >
                {EMPLOYEE_CONTRACT_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Notes
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="min-h-[72px] rounded-none"
              />
            </label>
          </div>
          <div className="flex gap-2 border-t border-border p-4">
            <Button
              type="button"
              size="sm"
              className={cn("h-9", GREEN_BTN)}
              disabled={saving}
              onClick={() => void saveForm()}
            >
              {formMode === "edit" ? "Save Changes" : "Create Contract"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-none"
              onClick={() => setFormOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
