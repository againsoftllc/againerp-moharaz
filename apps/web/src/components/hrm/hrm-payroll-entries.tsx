"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Filter, Save, Search } from "lucide-react";
import { toast } from "sonner";
import {
  formatPayrollDays,
  formatPayrollMoney,
  payrollEntryAvatar,
  type PayrollEntryRow,
} from "@/lib/mock-data/hrm-payroll-entries";
import {
  apiPayrollEntryToRunEntry,
  apiPayrollRunToUi,
  listHrmPayrollEntries,
  listHrmPayrollRuns,
  updateHrmPayrollEntry,
} from "@/lib/api/hrm-payroll";
import { listHrmEmployees } from "@/lib/api/hrm-employees";
import type { PayrollRun } from "@/lib/mock-data/hrm-payroll-runs";
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
import { cn } from "@/lib/utils";

type SortKey = "employeeName" | "runTitle" | "grossPay" | "netPay" | "payDate";
type SortDir = "asc" | "desc";

type EditForm = {
  notes: string;
  overtimeAmount: string;
  unpaidLeaveDeduction: string;
};

function emptyEditForm(row: PayrollEntryRow): EditForm {
  return {
    notes: row.notes ?? "",
    overtimeAmount: String(row.overtimeAmount ?? 0),
    unpaidLeaveDeduction: String(row.unpaidLeaveDeduction ?? 0),
  };
}

export function HrmPayrollEntries() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [rows, setRows] = useState<PayrollEntryRow[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftRun, setDraftRun] = useState("all");
  const [runFilter, setRunFilter] = useState("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("payDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [viewRow, setViewRow] = useState<PayrollEntryRow | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);

  const runsById = useMemo(() => new Map(runs.map((r) => [r.id, r])), [runs]);
  const runOptions = useMemo(
    () => runs.map((r) => ({ value: r.id, label: r.title })),
    [runs],
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, runsRes, entriesRes] = await Promise.all([
        listHrmEmployees({ per_page: 200 }),
        listHrmPayrollRuns({ per_page: 200 }),
        listHrmPayrollEntries({ per_page: 200 }),
      ]);
      const employeeMap = new Map(empRes.rows.map((e) => [e.id, e.name]));
      const employeeName = (id: string | null | undefined) =>
        id ? employeeMap.get(id) ?? "—" : "—";

      const runsUi = runsRes.rows.map((r) => apiPayrollRunToUi(r));
      const runsMap = new Map(runsUi.map((r) => [r.id, r]));

      const entryRows: PayrollEntryRow[] = entriesRes.rows.map((entry) => {
        const runEntry = apiPayrollEntryToRunEntry(entry, employeeName);
        const run = entry.payroll_run_id ? runsMap.get(entry.payroll_run_id) : undefined;
        return {
          ...runEntry,
          runId: entry.payroll_run_id ?? "",
          runTitle: run?.title ?? "—",
          periodStart: run?.periodStart ?? "",
          periodEnd: run?.periodEnd ?? "",
          payDate: run?.payDate ?? "",
        };
      });

      setRuns(runsUi);
      setRows(entryRows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load payroll entries");
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
    if (runFilter !== "all") list = list.filter((r) => r.runId === runFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.employeeName.toLowerCase().includes(q) ||
          r.runTitle.toLowerCase().includes(q),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, runFilter, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "employeeName" || key === "runTitle" ? "asc" : "desc");
    }
  }

  function openView(row: PayrollEntryRow) {
    setViewRow(row);
    setEditForm(emptyEditForm(row));
  }

  const isDraftRun = (runId: string) => runsById.get(runId)?.status === "draft";

  async function saveEntry() {
    if (!viewRow || !editForm) return;
    setSaving(true);
    try {
      const updated = await updateHrmPayrollEntry(viewRow.id, {
        notes: editForm.notes.trim(),
        overtimeAmount: Math.max(0, Number(editForm.overtimeAmount) || 0),
        unpaidLeaveDeduction: Math.max(0, Number(editForm.unpaidLeaveDeduction) || 0),
      });
      const run = runsById.get(viewRow.runId);
      const runEntry = apiPayrollEntryToRunEntry(updated, () => viewRow.employeeName);
      const mapped: PayrollEntryRow = {
        ...runEntry,
        runId: viewRow.runId,
        runTitle: run?.title ?? viewRow.runTitle,
        periodStart: run?.periodStart ?? viewRow.periodStart,
        periodEnd: run?.periodEnd ?? viewRow.periodEnd,
        payDate: run?.payDate ?? viewRow.payDate,
      };
      setRows((prev) => prev.map((r) => (r.id === mapped.id ? mapped : r)));
      setViewRow(mapped);
      setEditForm(emptyEditForm(mapped));
      toast.success("Payroll entry updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
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

  if (loading) {
    return <ContentDataSkeleton label="Loading payroll entries…" />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Payroll Entries
          </h1>
          <p className="text-xs text-muted-foreground">
            Per-employee line items across payroll runs.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search employee or run…"
            className="h-9 rounded-none pl-8"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 rounded-none"
          onClick={() => {
            setDraftRun(runFilter);
            setFiltersOpen(true);
          }}
        >
          <Filter className="size-3.5" />
          Filters
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-none border border-border bg-card">
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left">
              <th className="px-3 py-2.5">
                <SortHeader label="Employee" col="employeeName" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Payroll Run" col="runTitle" />
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Working / Present / LOP
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Gross" col="grossPay" />
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Deductions
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Net" col="netPay" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Pay Date" col="payDate" />
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">
                  No payroll entries found.
                </td>
              </tr>
            ) : (
              pageRows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border last:border-b-0 hover:bg-muted/20"
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={payrollEntryAvatar(row.employeeId)}
                        alt=""
                        className="h-8 w-8 rounded-none border border-border object-cover"
                      />
                      <div>
                        <div className="font-medium text-foreground">{row.employeeName}</div>
                        <div className="text-xs text-muted-foreground">
                          Basic: {formatPayrollMoney(row.basicSalary)}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="text-foreground">{row.runTitle}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.periodStart} → {row.periodEnd}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-xs">
                    <span className="text-foreground">{formatPayrollDays(row.workingDays)}</span>
                    {" / "}
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {formatPayrollDays(row.presentDays)}
                    </span>
                    {" / "}
                    <span className="text-red-600 dark:text-red-400">
                      {formatPayrollDays(row.lopDays)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                    {formatPayrollMoney(row.grossPay)}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-red-600 dark:text-red-400">
                    {formatPayrollMoney(row.deductions)}
                  </td>
                  <td className="px-3 py-2.5 font-medium tabular-nums text-sky-600 dark:text-sky-400">
                    {formatPayrollMoney(row.netPay)}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{row.payDate}</td>
                  <td className="px-3 py-2.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-none text-sky-600 dark:text-sky-400"
                      aria-label="View"
                      onClick={() => openView(row)}
                    >
                      <Eye className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>Rows</span>
          <select
            value={perPage}
            onChange={(e) => {
              setPerPage(Number(e.target.value));
              setPage(1);
            }}
            className="h-8 rounded-none border border-border bg-background px-2"
          >
            {[50, 100, 500, 1000].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span>
            {filtered.length} entr{filtered.length === 1 ? "y" : "ies"}
          </span>
        </div>
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

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent
          side="right"
          resizable
          closeButton="chevron"
          className="flex w-[360px] min-w-[160px] max-w-[720px] flex-col gap-0 p-0"
          title="Filters"
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base">Filters</SheetTitle>
            <SheetDescription className="sr-only">Filter payroll entries</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-3 overflow-auto p-4">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Payroll Run
              <select
                value={draftRun}
                onChange={(e) => setDraftRun(e.target.value)}
                className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="all">All runs</option>
                {runOptions.map((o) => (
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
              className="h-9 rounded-none bg-[#4caf50] text-white hover:bg-[#43a047]"
              onClick={() => {
                setRunFilter(draftRun);
                setPage(1);
                setFiltersOpen(false);
              }}
            >
              Apply
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-none"
              onClick={() => {
                setDraftRun("all");
                setRunFilter("all");
                setPage(1);
                setFiltersOpen(false);
              }}
            >
              Clear
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet
        open={!!viewRow}
        onOpenChange={(o) => {
          if (!o) {
            setViewRow(null);
            setEditForm(null);
          }
        }}
      >
        <SheetContent
          side="right"
          resizable
          closeButton="chevron"
          className="flex w-[420px] min-w-[160px] max-w-[720px] flex-col gap-0 p-0"
          title="Payroll entry details"
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base">Payroll Entry Details</SheetTitle>
            <SheetDescription className="sr-only">View payroll entry</SheetDescription>
          </SheetHeader>
          {viewRow ? (
            <div className="flex-1 space-y-4 overflow-auto p-4">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={payrollEntryAvatar(viewRow.employeeId)}
                  alt=""
                  className="h-11 w-11 rounded-none border border-border object-cover"
                />
                <div>
                  <div className="font-semibold text-foreground">{viewRow.employeeName}</div>
                  <div className="text-xs text-muted-foreground">{viewRow.runTitle}</div>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "ml-auto rounded-none text-[10px]",
                    isDraftRun(viewRow.runId)
                      ? "border-border bg-muted/40 text-muted-foreground"
                      : "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                  )}
                >
                  {runsById.get(viewRow.runId)
                    ? runsById.get(viewRow.runId)!.status.charAt(0).toUpperCase() +
                      runsById.get(viewRow.runId)!.status.slice(1)
                    : "—"}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {(
                  [
                    ["Pay Date", viewRow.payDate],
                    ["Period", `${viewRow.periodStart} → ${viewRow.periodEnd}`],
                    ["Basic", formatPayrollMoney(viewRow.basicSalary)],
                    ["Working Days", formatPayrollDays(viewRow.workingDays)],
                    ["Present", formatPayrollDays(viewRow.presentDays)],
                    ["LOP", formatPayrollDays(viewRow.lopDays)],
                    ["Gross Pay", formatPayrollMoney(viewRow.grossPay)],
                    ["Deductions", formatPayrollMoney(viewRow.deductions)],
                    ["Net Pay", formatPayrollMoney(viewRow.netPay)],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="border border-border bg-muted/20 p-2">
                    <div className="text-[11px] text-muted-foreground">{k}</div>
                    <div
                      className={cn(
                        "mt-0.5 font-medium tabular-nums",
                        k === "Gross Pay" && "text-emerald-600 dark:text-emerald-400",
                        k === "Deductions" && "text-red-600 dark:text-red-400",
                        k === "Net Pay" && "text-sky-600 dark:text-sky-400",
                        k === "LOP" && "text-red-600 dark:text-red-400",
                        k === "Present" && "text-emerald-600 dark:text-emerald-400",
                      )}
                    >
                      {v}
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-3 border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground">Adjustments</h3>
                  {!isDraftRun(viewRow.runId) ? (
                    <span className="text-[11px] text-muted-foreground">
                      Editable only while the run is draft
                    </span>
                  ) : null}
                </div>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Overtime Amount
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={editForm?.overtimeAmount ?? "0"}
                    disabled={!isDraftRun(viewRow.runId)}
                    onChange={(e) =>
                      setEditForm((f) => (f ? { ...f, overtimeAmount: e.target.value } : f))
                    }
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Unpaid Leave Deduction
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={editForm?.unpaidLeaveDeduction ?? "0"}
                    disabled={!isDraftRun(viewRow.runId)}
                    onChange={(e) =>
                      setEditForm((f) =>
                        f ? { ...f, unpaidLeaveDeduction: e.target.value } : f,
                      )
                    }
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Notes
                  <Textarea
                    value={editForm?.notes ?? ""}
                    disabled={!isDraftRun(viewRow.runId)}
                    onChange={(e) =>
                      setEditForm((f) => (f ? { ...f, notes: e.target.value } : f))
                    }
                    className="min-h-[70px] rounded-none"
                  />
                </label>
                {isDraftRun(viewRow.runId) ? (
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-none bg-[#4caf50] text-white hover:bg-[#43a047]"
                    onClick={() => void saveEntry()}
                    disabled={saving}
                  >
                    <Save className="size-3.5" />
                    {saving ? "Saving…" : "Save Changes"}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
