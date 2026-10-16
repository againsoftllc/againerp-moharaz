"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  Clock,
  Eye,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { formatContractAmount } from "@/lib/mock-data/hrm-employee-contracts";
import {
  apiContractRenewalToView,
  createHrmContractRenewal,
  decideHrmContractRenewal,
  deleteHrmContractRenewal,
  listHrmContractRenewals,
  listHrmEmployeeContracts,
  nextRenewalNumber,
  updateHrmContractRenewal,
  type ContractRenewalStatus,
  type ContractRenewalView,
} from "@/lib/api/hrm-contracts";
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

const STATUS_LABEL: Record<ContractRenewalStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

type ContractOption = { id: string; label: string; endDate: string };

type FormState = {
  contractId: string;
  renewalNumber: string;
  currentEndDate: string;
  newStartDate: string;
  newEndDate: string;
  newBasicSalary: string;
  changesSummary: string;
  reason: string;
  status: ContractRenewalStatus;
};

function todayYmd() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function emptyForm(nextNumber: string, contractId = ""): FormState {
  return {
    contractId,
    renewalNumber: nextNumber,
    currentEndDate: "",
    newStartDate: todayYmd(),
    newEndDate: "",
    newBasicSalary: "",
    changesSummary: "",
    reason: "",
    status: "pending",
  };
}

function formFromRow(row: ContractRenewalView): FormState {
  return {
    contractId: row.contractId,
    renewalNumber: row.renewalNumber,
    currentEndDate: row.currentEndDate,
    newStartDate: row.newStartDate,
    newEndDate: row.newEndDate,
    newBasicSalary: String(row.newBasicSalary || ""),
    changesSummary: row.changesSummary,
    reason: row.reason,
    status: row.status,
  };
}

function statusBadgeClass(status: ContractRenewalStatus) {
  switch (status) {
    case "approved":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "rejected":
      return "border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300";
    default:
      return "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300";
  }
}

export function HrmContractRenewals() {
  const canWrite = useAdminCanWrite();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<ContractRenewalView[]>([]);
  const [contracts, setContracts] = useState<ContractOption[]>([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ContractRenewalStatus>("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);

  const [viewRow, setViewRow] = useState<ContractRenewalView | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(""));

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [contractRows, renewalRows] = await Promise.all([
        listHrmEmployeeContracts(),
        listHrmContractRenewals(),
      ]);
      const contractOpts: ContractOption[] = contractRows.map((c) => ({
        id: c.id,
        label: `${c.contract_number ?? c.id.slice(0, 8)} • ${(c.end_date ?? "").slice(0, 10) || "no end"}`,
        endDate: (c.end_date ?? "").slice(0, 10),
      }));
      setContracts(contractOpts);
      setRows(
        renewalRows.map((r) => apiContractRenewalToView(r, (id) => {
          const opt = contractOpts.find((c) => c.id === id);
          return opt?.label.split(" • ")[0] ?? "—";
        })),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load contract renewals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.renewalNumber.toLowerCase().includes(q) ||
        r.contractNumber.toLowerCase().includes(q) ||
        r.changesSummary.toLowerCase().includes(q) ||
        r.reason.toLowerCase().includes(q)
      );
    });
  }, [rows, search, statusFilter]);

  const stats = useMemo(
    () => ({
      pending: rows.filter((r) => r.status === "pending").length,
      approved: rows.filter((r) => r.status === "approved").length,
      rejected: rows.filter((r) => r.status === "rejected").length,
    }),
    [rows],
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageRows = filtered.slice((page - 1) * perPage, page * perPage);

  const fieldClass =
    "h-9 w-full rounded-none border border-border bg-background px-2 text-sm text-foreground";

  const openAdd = () => {
    setFormMode("add");
    setEditId(null);
    setForm(emptyForm(nextRenewalNumber(rows), contracts[0]?.id ?? ""));
    setFormOpen(true);
  };

  const openEdit = (row: ContractRenewalView) => {
    setFormMode("edit");
    setEditId(row.id);
    setForm(formFromRow(row));
    setFormOpen(true);
  };

  const onContractChange = (contractId: string) => {
    const opt = contracts.find((c) => c.id === contractId);
    setForm((prev) => ({
      ...prev,
      contractId,
      currentEndDate: opt?.endDate ?? prev.currentEndDate,
    }));
  };

  const saveForm = async () => {
    if (!canWrite) {
      toast.error("Read-only access");
      return;
    }
    if (!form.contractId) {
      toast.error("Select a contract");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        contractId: form.contractId,
        renewalNumber: form.renewalNumber,
        currentEndDate: form.currentEndDate,
        newStartDate: form.newStartDate,
        newEndDate: form.newEndDate,
        newBasicSalary: Number(form.newBasicSalary) || 0,
        changesSummary: form.changesSummary,
        reason: form.reason,
      };
      if (formMode === "add") {
        await createHrmContractRenewal(payload);
        toast.success("Renewal request created");
      } else if (editId) {
        await updateHrmContractRenewal(editId, { ...payload, status: form.status });
        toast.success("Renewal updated");
      }
      setFormOpen(false);
      await loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDecide = async (
    row: ContractRenewalView,
    decision: "approved" | "rejected",
  ) => {
    if (!canWrite) {
      toast.error("Read-only access");
      return;
    }
    try {
      await decideHrmContractRenewal(row.id, { decision });
      toast.success(decision === "approved" ? "Renewal approved" : "Renewal rejected");
      await loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  };

  const handleDelete = async (row: ContractRenewalView) => {
    if (!canWrite) {
      toast.error("Read-only access");
      return;
    }
    if (!window.confirm(`Delete renewal ${row.renewalNumber}?`)) return;
    try {
      await deleteHrmContractRenewal(row.id);
      toast.success("Renewal deleted");
      await loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  if (loading) {
    return <ContentDataSkeleton label="Loading contract renewals…" />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Contract Renewals
        </h1>
        {canWrite ? (
          <Button type="button" size="sm" className={GREEN_BTN} onClick={openAdd}>
            <Plus className="size-3.5" />
            Add Renewal
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            ["Pending", stats.pending, Clock],
            ["Approved", stats.approved, CheckCircle2],
            ["Rejected", stats.rejected, X],
          ] as const
        ).map(([label, value, Icon]) => (
          <div
            key={label}
            className="flex items-center justify-between gap-3 rounded-none border border-border bg-card px-4 py-3"
          >
            <div>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</p>
            </div>
            <div className="flex size-10 items-center justify-center rounded-none border border-border bg-muted/40 text-muted-foreground">
              <Icon className="size-5" />
            </div>
          </div>
        ))}
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
            placeholder="Search renewals..."
            className="h-9 rounded-none pl-8"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as "all" | ContractRenewalStatus);
            setPage(1);
          }}
          className="h-9 rounded-none border border-border bg-background px-2 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          Per Page:
          <select
            value={perPage}
            onChange={(e) => {
              setPerPage(Number(e.target.value));
              setPage(1);
            }}
            className="h-9 rounded-none border border-border bg-background px-2 text-sm"
          >
            {[50, 100, 500, 1000].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-none border border-border bg-card">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60">
            <tr className="border-b border-border text-left">
              <th className="px-3 py-2.5 text-xs font-semibold uppercase text-muted-foreground">#</th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase text-muted-foreground">Renewal No.</th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase text-muted-foreground">Contract</th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase text-muted-foreground">New Period</th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase text-muted-foreground">New Salary</th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase text-muted-foreground">Status</th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                  No contract renewals found.
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => (
                <tr key={row.id} className="border-b border-border/60 hover:bg-muted/20">
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {(page - 1) * perPage + idx + 1}
                  </td>
                  <td className="px-3 py-2 font-medium">{row.renewalNumber || "—"}</td>
                  <td className="px-3 py-2">{row.contractNumber}</td>
                  <td className="px-3 py-2 text-xs">
                    {row.newStartDate || "—"} → {row.newEndDate || "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatContractAmount(row.newBasicSalary)}
                  </td>
                  <td className="px-3 py-2">
                    <Badge className={cn("rounded-none border", statusBadgeClass(row.status))}>
                      {STATUS_LABEL[row.status]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-none"
                        onClick={() => setViewRow(row)}
                      >
                        <Eye className="size-3.5" />
                      </Button>
                      {canWrite && row.status === "pending" ? (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-none text-emerald-600"
                            onClick={() => void handleDecide(row, "approved")}
                          >
                            <Check className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-none text-red-600"
                            onClick={() => void handleDecide(row, "rejected")}
                          >
                            <X className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-none"
                            onClick={() => openEdit(row)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                        </>
                      ) : null}
                      {canWrite ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-none text-red-600"
                          onClick={() => void handleDelete(row)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 ? (
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-none"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span>
            Page {page} of {pageCount}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-none"
            disabled={page >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          >
            Next
          </Button>
        </div>
      ) : null}

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent resizable className="min-w-[160px] max-w-[720px] w-[480px] rounded-none">
          <SheetHeader>
            <SheetTitle>{formMode === "add" ? "Add Renewal" : "Edit Renewal"}</SheetTitle>
            <SheetDescription>Contract renewal request details.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-3 overflow-auto pb-6">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Contract
              <select
                value={form.contractId}
                onChange={(e) => onContractChange(e.target.value)}
                className={fieldClass}
                disabled={!canWrite}
              >
                <option value="">Select contract</option>
                {contracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Renewal Number
              <Input
                value={form.renewalNumber}
                onChange={(e) => setForm((f) => ({ ...f, renewalNumber: e.target.value }))}
                className="rounded-none"
                disabled={!canWrite}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Current End Date
                <Input
                  type="date"
                  value={form.currentEndDate}
                  onChange={(e) => setForm((f) => ({ ...f, currentEndDate: e.target.value }))}
                  className="rounded-none"
                  disabled={!canWrite}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                New Start Date
                <Input
                  type="date"
                  value={form.newStartDate}
                  onChange={(e) => setForm((f) => ({ ...f, newStartDate: e.target.value }))}
                  className="rounded-none"
                  disabled={!canWrite}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                New End Date
                <Input
                  type="date"
                  value={form.newEndDate}
                  onChange={(e) => setForm((f) => ({ ...f, newEndDate: e.target.value }))}
                  className="rounded-none"
                  disabled={!canWrite}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                New Basic Salary
                <Input
                  type="number"
                  min={0}
                  value={form.newBasicSalary}
                  onChange={(e) => setForm((f) => ({ ...f, newBasicSalary: e.target.value }))}
                  className="rounded-none"
                  disabled={!canWrite}
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Changes Summary
              <Textarea
                value={form.changesSummary}
                onChange={(e) => setForm((f) => ({ ...f, changesSummary: e.target.value }))}
                className="min-h-[72px] rounded-none"
                disabled={!canWrite}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Reason
              <Textarea
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                className="min-h-[72px] rounded-none"
                disabled={!canWrite}
              />
            </label>
            {canWrite ? (
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-none"
                  onClick={() => setFormOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className={GREEN_BTN}
                  disabled={saving}
                  onClick={() => void saveForm()}
                >
                  {saving ? "Saving…" : "Save"}
                </Button>
              </div>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={!!viewRow} onOpenChange={(open) => !open && setViewRow(null)}>
        <SheetContent resizable className="min-w-[160px] max-w-[720px] w-[440px] rounded-none">
          <SheetHeader>
            <SheetTitle>Renewal Details</SheetTitle>
            <SheetDescription>{viewRow?.renewalNumber}</SheetDescription>
          </SheetHeader>
          {viewRow ? (
            <dl className="mt-4 space-y-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Contract</dt>
                <dd>{viewRow.contractNumber}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Status</dt>
                <dd>
                  <Badge className={cn("rounded-none border", statusBadgeClass(viewRow.status))}>
                    {STATUS_LABEL[viewRow.status]}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Current End</dt>
                <dd>{viewRow.currentEndDate || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">New Period</dt>
                <dd>
                  {viewRow.newStartDate || "—"} → {viewRow.newEndDate || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">New Salary</dt>
                <dd>{formatContractAmount(viewRow.newBasicSalary)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Changes</dt>
                <dd className="whitespace-pre-wrap">{viewRow.changesSummary || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Reason</dt>
                <dd className="whitespace-pre-wrap">{viewRow.reason || "—"}</dd>
              </div>
            </dl>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
