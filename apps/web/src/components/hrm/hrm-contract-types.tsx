"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calendar,
  Clock,
  Eye,
  Filter,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import {
  CONTRACT_TYPE_STATUS_LABEL,
  CONTRACT_TYPE_STATUS_OPTIONS,
  formatDuration,
  formatNotice,
  formatProbation,
  type ContractType,
  type ContractTypeStatus,
} from "@/lib/mock-data/hrm-contract-types";
import {
  apiContractTypeToView,
  createHrmContractType,
  deleteHrmContractType,
  listHrmContractTypes,
  listHrmEmployeeContracts,
  updateHrmContractType,
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

type SortKey = "name" | "noticeDays" | "probationMonths" | "contractsCount" | "status" | "createdAt";
type SortDir = "asc" | "desc";

type FormState = {
  name: string;
  description: string;
  isPermanent: boolean;
  durationMonths: string;
  probationMonths: string;
  noticeDays: string;
  status: ContractTypeStatus;
};

function emptyForm(): FormState {
  return {
    name: "",
    description: "",
    isPermanent: false,
    durationMonths: "12",
    probationMonths: "3",
    noticeDays: "30",
    status: "active",
  };
}

function formFromRow(row: ContractType): FormState {
  return {
    name: row.name,
    description: row.description,
    isPermanent: row.durationMonths === null,
    durationMonths: row.durationMonths === null ? "12" : String(row.durationMonths),
    probationMonths: String(row.probationMonths),
    noticeDays: String(row.noticeDays),
    status: row.status,
  };
}

function statusBadgeClass(status: ContractTypeStatus) {
  return status === "active"
    ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    : "border-border bg-muted/40 text-muted-foreground";
}

export function HrmContractTypes() {
  const canWrite = useAdminCanWrite();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<ContractType[]>([]);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"all" | ContractTypeStatus>("all");
  const [draftDuration, setDraftDuration] = useState<"all" | "permanent" | "fixed">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | ContractTypeStatus>("all");
  const [durationFilter, setDurationFilter] = useState<"all" | "permanent" | "fixed">("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [viewRow, setViewRow] = useState<ContractType | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [typeRows, contractRows] = await Promise.all([
        listHrmContractTypes(),
        listHrmEmployeeContracts(),
      ]);
      const countByType = new Map<string, number>();
      for (const c of contractRows) {
        if (c.contract_type_id) {
          countByType.set(
            c.contract_type_id,
            (countByType.get(c.contract_type_id) ?? 0) + 1,
          );
        }
      }
      setRows(
        typeRows.map((t) => apiContractTypeToView(t, countByType.get(t.id) ?? 0)),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load contract types");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const filtered = useMemo(() => {
    let list = rows;
    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);
    if (durationFilter === "permanent") list = list.filter((r) => r.durationMonths === null);
    if (durationFilter === "fixed") list = list.filter((r) => r.durationMonths !== null);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          formatDuration(r.durationMonths).toLowerCase().includes(q),
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
  }, [rows, search, statusFilter, durationFilter, sortKey, sortDir]);

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
    setForm(emptyForm());
    setFormOpen(true);
  }

  function openEdit(row: ContractType) {
    if (row.locked) {
      toast.error("Contract type is locked");
      return;
    }
    setFormMode("edit");
    setEditId(row.id);
    setForm(formFromRow(row));
    setFormOpen(true);
  }

  async function saveForm() {
    const name = form.name.trim();
    if (!name) {
      toast.error("Contract type name is required");
      return;
    }
    const probationMonths = Number(form.probationMonths);
    const noticeDays = Number(form.noticeDays);
    if (!Number.isFinite(probationMonths) || probationMonths < 0) {
      toast.error("Enter a valid probation period");
      return;
    }
    if (!Number.isFinite(noticeDays) || noticeDays < 0) {
      toast.error("Enter a valid notice period");
      return;
    }
    let durationMonths: number | null = null;
    if (!form.isPermanent) {
      const d = Number(form.durationMonths);
      if (!Number.isFinite(d) || d < 1) {
        toast.error("Enter a valid duration in months");
        return;
      }
      durationMonths = d;
    }

    const input = {
      name,
      description: form.description.trim(),
      durationMonths,
      probationMonths,
      noticeDays,
      status: form.status,
    };

    setSaving(true);
    try {
      if (formMode === "edit" && editId) {
        const apiRow = await updateHrmContractType(editId, input);
        const prev = rows.find((r) => r.id === editId);
        const mapped = apiContractTypeToView(apiRow, prev?.contractsCount ?? 0);
        setRows((prevRows) =>
          prevRows.map((r) =>
            r.id === editId ? { ...mapped, locked: r.locked } : r,
          ),
        );
        toast.success("Contract type updated");
      } else {
        const apiRow = await createHrmContractType(input);
        setRows((prev) => [apiContractTypeToView(apiRow, 0), ...prev]);
        toast.success("Contract type added");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: ContractType) {
    if (row.locked) {
      toast.error("Unlock before deleting");
      return;
    }
    if (row.contractsCount > 0) {
      toast.error("Cannot delete a type with existing contracts");
      return;
    }
    if (!window.confirm(`Delete contract type “${row.name}”?`)) return;
    try {
      await deleteHrmContractType(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      toast.success("Contract type deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  function toggleLock(row: ContractType) {
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, locked: !r.locked } : r)),
    );
    toast.success(row.locked ? "Unlocked" : "Locked");
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

  if (loading) {
    return <ContentDataSkeleton label="Loading contract types…" />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Contract Types</h1>
        {canWrite ? (
          <Button type="button" size="sm" className={GREEN_BTN} onClick={openAdd}>
            <Plus className="size-3.5" />
            Add Contract Type
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
                onChange={(e) => setDraftStatus(e.target.value as "all" | ContractTypeStatus)}
                className={fieldClass}
              >
                <option value="all">All</option>
                {CONTRACT_TYPE_STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[160px] flex-col gap-1 text-xs text-muted-foreground">
              Duration
              <select
                value={draftDuration}
                onChange={(e) =>
                  setDraftDuration(e.target.value as "all" | "permanent" | "fixed")
                }
                className={fieldClass}
              >
                <option value="all">All</option>
                <option value="permanent">Permanent</option>
                <option value="fixed">Fixed term</option>
              </select>
            </label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                className={cn("h-9", GREEN_BTN)}
                onClick={() => {
                  setStatusFilter(draftStatus);
                  setDurationFilter(draftDuration);
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
                  setDraftDuration("all");
                  setStatusFilter("all");
                  setDurationFilter("all");
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
                <SortHeader label="Contract Type" col="name" />
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Duration
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Probation" col="probationMonths" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Notice Period" col="noticeDays" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Contracts" col="contractsCount" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Status" col="status" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Created At" col="createdAt" />
              </th>
              <th className="w-[1%] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No contract types found.
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => (
                <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-muted/20">
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                    {(pageSafe - 1) * perPage + idx + 1}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-foreground">{row.name}</td>
                  <td className="px-3 py-2.5">
                    {row.durationMonths === null ? (
                      <Badge
                        variant="outline"
                        className="rounded-none border-sky-500/30 bg-sky-500/15 text-[10px] font-normal text-sky-800 dark:text-sky-300"
                      >
                        Permanent
                      </Badge>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-foreground">
                        <Calendar className="size-3.5 text-muted-foreground" />
                        {formatDuration(row.durationMonths)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5 text-foreground">
                      <Clock className="size-3.5 text-muted-foreground" />
                      {formatProbation(row.probationMonths)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-foreground">{formatNotice(row.noticeDays)}</td>
                  <td className="px-3 py-2.5">
                    <Badge
                      variant="outline"
                      className="rounded-none border-border bg-muted/40 text-[10px] font-normal text-muted-foreground"
                    >
                      {row.contractsCount}{" "}
                      {row.contractsCount === 1 ? "contract" : "contracts"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-none text-[10px] font-normal",
                        statusBadgeClass(row.status),
                      )}
                    >
                      {CONTRACT_TYPE_STATUS_LABEL[row.status]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-foreground">{row.createdAt}</td>
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-none text-sky-600 dark:text-sky-400"
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
                            className="h-7 w-7 rounded-none text-amber-600 dark:text-amber-400"
                            onClick={() => openEdit(row)}
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
                              <Lock className="h-3.5 w-3.5" />
                            ) : (
                              <LockOpen className="h-3.5 w-3.5" />
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
          title="Contract type details"
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base">Contract Type Details</SheetTitle>
            <SheetDescription className="sr-only">View contract type</SheetDescription>
          </SheetHeader>
          {viewRow ? (
            <div className="flex-1 space-y-4 overflow-auto p-4">
              <div>
                <div className="text-base font-semibold text-foreground">{viewRow.name}</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {viewRow.description || "—"}
                </p>
              </div>
              <dl className="grid gap-3 text-sm">
                {(
                  [
                    ["Duration", formatDuration(viewRow.durationMonths)],
                    ["Probation", formatProbation(viewRow.probationMonths)],
                    ["Notice Period", formatNotice(viewRow.noticeDays)],
                    [
                      "Contracts",
                      `${viewRow.contractsCount} ${viewRow.contractsCount === 1 ? "contract" : "contracts"}`,
                    ],
                    ["Status", CONTRACT_TYPE_STATUS_LABEL[viewRow.status]],
                    ["Created At", viewRow.createdAt],
                    ["Locked", viewRow.locked ? "Yes" : "No"],
                  ] as const
                ).map(([k, v]) => (
                  <div
                    key={k}
                    className="grid grid-cols-[120px_1fr] gap-2 border-b border-border/60 pb-2"
                  >
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="text-foreground">{v}</dd>
                  </div>
                ))}
              </dl>
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
          title={formMode === "edit" ? "Edit Contract Type" : "Add Contract Type"}
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base">
              {formMode === "edit" ? "Edit Contract Type" : "Add Contract Type"}
            </SheetTitle>
            <SheetDescription className="sr-only">Contract type form</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-3 overflow-auto p-4">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Contract Type Name *
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="h-9 rounded-none"
                placeholder="e.g. Permanent Full-time"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Description
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="min-h-[64px] rounded-none"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.isPermanent}
                onChange={(e) => setForm((f) => ({ ...f, isPermanent: e.target.checked }))}
                className="size-4 rounded-none border-border"
              />
              Permanent (no fixed duration)
            </label>
            {!form.isPermanent ? (
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Duration (months) *
                <Input
                  type="number"
                  min={1}
                  value={form.durationMonths}
                  onChange={(e) => setForm((f) => ({ ...f, durationMonths: e.target.value }))}
                  className="h-9 rounded-none"
                />
              </label>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Probation (months) *
                <Input
                  type="number"
                  min={0}
                  value={form.probationMonths}
                  onChange={(e) => setForm((f) => ({ ...f, probationMonths: e.target.value }))}
                  className="h-9 rounded-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Notice Period (days) *
                <Input
                  type="number"
                  min={0}
                  value={form.noticeDays}
                  onChange={(e) => setForm((f) => ({ ...f, noticeDays: e.target.value }))}
                  className="h-9 rounded-none"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Status *
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value as ContractTypeStatus }))
                }
                className={fieldClass}
              >
                {CONTRACT_TYPE_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
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
              {formMode === "edit" ? "Save Changes" : "Create Type"}
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
