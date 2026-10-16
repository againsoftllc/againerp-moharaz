"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Download, Eye, Filter, Search, Send } from "lucide-react";
import { toast } from "sonner";
import {
  PAYSLIP_MONTHS,
  PAYSLIP_STATUS_LABEL,
  PAYSLIP_STATUS_OPTIONS,
  PAYSLIP_YEAR,
  formatDays,
  formatNetPay,
  payslipAvatar,
  periodKeyForMonth,
  periodLabel,
  totalsFromStub,
  type Payslip,
  type PayslipStatus,
} from "@/lib/mock-data/hrm-payslips";
import {
  apiPayslipToUi,
  listHrmPayslips,
  markHrmPayslipDownloaded,
  markHrmPayslipSent,
  type PayslipLookups,
} from "@/lib/api/hrm-payslips";
import { listHrmPayrollEntries } from "@/lib/api/hrm-payroll";
import { listHrmEmployees } from "@/lib/api/hrm-employees";
import { listHrmDepartments } from "@/lib/api/hrm-departments";
import { listHrmDesignations } from "@/lib/api/hrm-designations";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const GREEN_BTN =
  "rounded-none bg-[#4caf50] text-white hover:bg-[#43a047] border-transparent";

type SortKey = "employeeName" | "payDate" | "netPay" | "generatedOn" | "status";
type SortDir = "asc" | "desc";

function statusBadgeClass(status: PayslipStatus) {
  switch (status) {
    case "downloaded":
      return "border-violet-500/30 bg-violet-500/15 text-violet-800 dark:text-violet-300";
    case "sent":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    default:
      return "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300";
  }
}

function money(n: number, signed = false) {
  const abs = formatNetPay(Math.abs(n));
  if (!signed) return abs;
  if (n > 0) return `+${abs}`;
  if (n < 0) return `-${abs}`;
  return abs;
}

function StubRow({
  label,
  value,
  valueClass,
  hint,
  emphasize,
  tint,
}: {
  label: string;
  value: string;
  valueClass?: string;
  hint?: string;
  emphasize?: boolean;
  tint?: "green" | "red" | "none";
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 border-b border-border/50 px-3 py-2 text-sm last:border-b-0",
        tint === "green" && "bg-emerald-500/10",
        tint === "red" && "bg-red-500/10",
        emphasize && "font-semibold",
      )}
    >
      <div className="min-w-0">
        <div className={cn("text-foreground", emphasize && "font-semibold")}>{label}</div>
        {hint ? <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{hint}</div> : null}
      </div>
      <div className={cn("shrink-0 tabular-nums", valueClass)}>{value}</div>
    </div>
  );
}

function PayStubPreview({ row }: { row: Payslip }) {
  const s = row.stub;
  const t = totalsFromStub(s);

  return (
    <div className="flex-1 space-y-4 overflow-auto p-4">
      <div className="flex items-center gap-3 border border-border bg-muted/30 p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={payslipAvatar(row.employeeId)}
          alt=""
          className="h-11 w-11 rounded-none border border-border object-cover"
        />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">{row.employeeName}</div>
          <div className="text-xs text-muted-foreground">{row.employeeCode}</div>
          <div className="truncate text-xs text-muted-foreground">
            {row.designation} · {row.department}
          </div>
        </div>
        <Badge
          variant="outline"
          className={cn("ml-auto shrink-0 rounded-none text-[10px]", statusBadgeClass(row.status))}
        >
          {PAYSLIP_STATUS_LABEL[row.status]}
        </Badge>
      </div>

      {/* Attendance summary — Workdo Pay Stub */}
      <div className="border border-border">
        {(
          [
            ["Paid Leave", formatDays(s.paidLeave), "text-emerald-600 dark:text-emerald-400"],
            ["Unpaid Leave", formatDays(s.unpaidLeave), "text-amber-700 dark:text-amber-400"],
            ["LOP Days", formatDays(s.lopDays), "text-red-600 dark:text-red-400"],
            [
              "Effective Paid Days",
              formatDays(s.effectivePaidDays),
              "text-emerald-600 dark:text-emerald-400",
            ],
            ["Overtime Hours", formatDays(s.overtimeHours), "text-violet-600 dark:text-violet-400"],
          ] as const
        ).map(([label, value, cls], i) => (
          <div
            key={label}
            className={cn(
              "flex items-center justify-between gap-3 px-3 py-2 text-sm",
              i % 2 === 1 && "bg-muted/40",
            )}
          >
            <span className="text-muted-foreground">{label}</span>
            <span className={cn("font-medium tabular-nums", cls)}>{value}</span>
          </div>
        ))}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Gross Pay Calculation</h3>
        <div className="border border-border">
          <StubRow label="Basic Salary" value={money(s.basicSalary)} />
          <StubRow
            label="Component Earnings"
            value={money(t.componentEarnings, true)}
            valueClass="text-emerald-600 dark:text-emerald-400"
          />
          <StubRow
            label="Total Earnings"
            hint="Basic + Components"
            value={money(t.totalEarnings)}
            valueClass="font-semibold text-emerald-600 dark:text-emerald-400"
            emphasize
            tint="green"
          />
          <StubRow
            label="LOP Deduction"
            value={money(-s.lopDeduction, true)}
            valueClass="text-red-600 dark:text-red-400"
          />
          <StubRow
            label="Overtime Earnings"
            value={money(s.overtimeEarnings, true)}
            valueClass="text-emerald-600 dark:text-emerald-400"
          />
          <StubRow
            label="Gross Pay"
            hint="Total Earnings − LOP − Unpaid Leave + Overtime"
            value={money(t.grossPay)}
            valueClass="text-base font-bold text-emerald-600 dark:text-emerald-400"
            emphasize
            tint="green"
          />
        </div>
      </div>

      <div>
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <ArrowUpRight className="h-4 w-4 text-emerald-600" />
          Earnings / Allowances
        </h3>
        <div className="border border-border">
          {s.allowanceLines.map((line) => (
            <StubRow
              key={line.label}
              label={line.label}
              value={money(line.amount, true)}
              valueClass="text-emerald-600 dark:text-emerald-400"
            />
          ))}
          <StubRow
            label="Total Allowances"
            value={money(t.allowances, true)}
            valueClass="font-semibold text-emerald-600 dark:text-emerald-400"
            emphasize
            tint="green"
          />
        </div>
      </div>

      <div>
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <ArrowDownRight className="h-4 w-4 text-red-600" />
          Deductions
        </h3>
        <div className="border border-border">
          {s.deductionLines.map((line) => (
            <StubRow
              key={line.label}
              label={line.label}
              value={money(-line.amount, true)}
              valueClass="text-red-600 dark:text-red-400"
            />
          ))}
          <StubRow
            label="Total Deductions"
            value={money(-t.deductions, true)}
            valueClass="font-semibold text-red-600 dark:text-red-400"
            emphasize
            tint="red"
          />
        </div>
      </div>

      <div className="border border-border">
        <div className="border-b border-border bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-foreground">
          Net Pay Summary
        </div>
        <StubRow label="Basic Salary" value={money(s.basicSalary)} />
        <StubRow
          label="Total Earnings"
          value={money(t.totalEarnings)}
          valueClass="text-emerald-600 dark:text-emerald-400"
        />
        <StubRow
          label="Gross Pay"
          value={money(t.grossPay)}
          valueClass="font-semibold text-emerald-600 dark:text-emerald-400"
        />
        <StubRow
          label="Total Deductions"
          value={money(-t.deductions, true)}
          valueClass="text-red-600 dark:text-red-400"
        />
        <div className="flex items-start justify-between gap-3 bg-emerald-500/10 px-3 py-3">
          <div>
            <div className="text-sm font-semibold text-foreground">Net Pay</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              Net Pay = Gross Pay − Total Deductions
            </div>
          </div>
          <div className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {money(row.netPay)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <div>
          Pay Date <span className="text-foreground">{row.payDate}</span>
        </div>
        <div className="text-right">
          Generated <span className="text-foreground">{row.generatedOn}</span>
        </div>
      </div>
    </div>
  );
}

export function HrmPayslips() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Payslip[]>([]);
  const [lookups, setLookups] = useState<PayslipLookups | null>(null);

  const [selectedPeriod, setSelectedPeriod] = useState(() => periodKeyForMonth("07"));
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"all" | PayslipStatus>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | PayslipStatus>("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("payDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [viewRow, setViewRow] = useState<Payslip | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [deptRows, desigRows, empRes, entriesRes, payslipRes] = await Promise.all([
        listHrmDepartments(),
        listHrmDesignations(),
        listHrmEmployees({ page: 1, per_page: 200 }),
        listHrmPayrollEntries({ per_page: 200 }),
        listHrmPayslips({ per_page: 200 }),
      ]);

      const deptMap = new Map(deptRows.map((d) => [String(d.id), String(d.name ?? "")]));
      const desigMap = new Map(desigRows.map((d) => [String(d.id), String(d.name ?? "")]));
      const empById = new Map(empRes.rows.map((e) => [e.id, e]));
      const entryById = new Map(entriesRes.rows.map((e) => [e.id, e]));

      const nextLookups: PayslipLookups = {
        employeeName: (id) => (id ? empById.get(id)?.name ?? "—" : "—"),
        employeeCode: (id) => (id ? empById.get(id)?.employee_code ?? "—" : "—"),
        department: (id) => {
          if (!id) return "—";
          const emp = empById.get(id);
          if (!emp?.department_id) return "—";
          return deptMap.get(emp.department_id) ?? "—";
        },
        designation: (id) => {
          if (!id) return "—";
          const emp = empById.get(id);
          if (!emp?.designation_id) return "—";
          return desigMap.get(emp.designation_id) ?? "—";
        },
        entryById: (id) => (id ? entryById.get(id) : undefined),
      };

      setLookups(nextLookups);
      setRows(payslipRes.rows.map((row) => apiPayslipToUi(row, nextLookups)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load payslips");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const filtered = useMemo(() => {
    let list = rows.filter((r) => r.periodKey === selectedPeriod);
    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.employeeName.toLowerCase().includes(q) ||
          r.employeeCode.toLowerCase().includes(q) ||
          r.department.toLowerCase().includes(q) ||
          r.designation.toLowerCase().includes(q),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, selectedPeriod, statusFilter, search, sortKey, sortDir]);

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

  async function handleDownload(row: Payslip) {
    if (!lookups) return;
    try {
      const updated = await markHrmPayslipDownloaded(row.id);
      const mapped = apiPayslipToUi(updated, lookups);
      setRows((prev) => prev.map((r) => (r.id === row.id ? mapped : r)));
      setViewRow((v) => (v?.id === row.id ? mapped : v));
      toast.success(`Downloaded payslip for ${mapped.employeeName}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    }
  }

  async function handleSend(row: Payslip) {
    if (!lookups) return;
    try {
      const updated = await markHrmPayslipSent(row.id);
      const mapped = apiPayslipToUi(updated, lookups);
      setRows((prev) => prev.map((r) => (r.id === row.id ? mapped : r)));
      setViewRow((v) => (v?.id === row.id ? mapped : v));
      toast.success(`Payslip sent to ${mapped.employeeName}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
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

  if (loading) {
    return <ContentDataSkeleton label="Loading payslips…" />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">Payslips</h1>

      <div className="flex flex-wrap gap-1.5">
        {PAYSLIP_MONTHS.map((m) => {
          const key = periodKeyForMonth(m.key);
          const active = key === selectedPeriod;
          return (
            <Button
              key={m.key}
              type="button"
              size="sm"
              variant={active ? "default" : "outline"}
              className={cn(
                "h-9 rounded-none px-3",
                active ? GREEN_BTN : "bg-background",
              )}
              onClick={() => {
                setSelectedPeriod(key);
                setPage(1);
              }}
            >
              {m.short} {PAYSLIP_YEAR}
            </Button>
          );
        })}
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
                onChange={(e) => setDraftStatus(e.target.value as "all" | PayslipStatus)}
                className={fieldClass}
              >
                <option value="all">All</option>
                {PAYSLIP_STATUS_OPTIONS.map((s) => (
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
                <SortHeader label="Pay Date" col="payDate" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Net Pay" col="netPay" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Status" col="status" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Generated On" col="generatedOn" />
              </th>
              <th className="w-[1%] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No payslips for {periodLabel(selectedPeriod)}.
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
                        src={payslipAvatar(row.employeeId)}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-none border border-border object-cover"
                      />
                      <div className="min-w-0">
                        <div className="font-medium text-foreground">{row.employeeName}</div>
                        <div className="text-xs text-muted-foreground">{row.employeeCode}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{row.payDate}</td>
                  <td className="px-3 py-2.5 tabular-nums font-medium">
                    {formatNetPay(row.netPay)}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-none text-[10px] font-normal",
                        statusBadgeClass(row.status),
                      )}
                    >
                      {PAYSLIP_STATUS_LABEL[row.status]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{row.generatedOn}</td>
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-none text-[#4caf50]"
                        onClick={() => setViewRow(row)}
                        aria-label="View"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-none text-violet-600 dark:text-violet-400"
                        onClick={() => void handleDownload(row)}
                        aria-label="Download"
                        title="Mark downloaded"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-none text-emerald-600 dark:text-emerald-400"
                        onClick={() => void handleSend(row)}
                        aria-label="Send"
                        title="Mark sent"
                      >
                        <Send className="h-3.5 w-3.5" />
                      </Button>
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
          className="flex w-[440px] min-w-[160px] max-w-[720px] flex-col gap-0 p-0"
          title="Pay Stub"
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <div className="flex items-start justify-between gap-2 pr-8">
              <div>
                <SheetTitle className="text-base">Pay Stub</SheetTitle>
                {viewRow ? (
                  <SheetDescription className="mt-0.5 text-xs text-muted-foreground">
                    {viewRow.stub.periodStart} → {viewRow.stub.periodEnd}
                  </SheetDescription>
                ) : (
                  <SheetDescription className="sr-only">Employee pay stub preview</SheetDescription>
                )}
              </div>
              {viewRow ? (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-none"
                    title="Mark downloaded"
                    onClick={() => void handleDownload(viewRow)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-none"
                    title="Mark sent"
                    onClick={() => void handleSend(viewRow)}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </div>
          </SheetHeader>
          {viewRow ? (
            <PayStubPreview row={viewRow} />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
