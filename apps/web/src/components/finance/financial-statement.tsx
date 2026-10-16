"use client";

import { Fragment, useCallback, useMemo, useState, type ReactNode } from "react";
import { CalendarDays, Check, ChevronRight, Download, RefreshCw, Search, Settings, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { downloadCsv } from "@/components/finance/finance-report-shell";
import { DateRangePresetPicker } from "@/components/shared/date-range-preset-picker";
import {
  balanceSheetColumnsFromReport,
  balanceSheetLineKeys,
  flattenBalanceSheetRows,
  type BalanceSheetRow,
} from "@/components/finance/balance-sheet-grid";
import type { ApiFinanceReport } from "@/lib/api/finance";
import { fiscalYearStartIso, formatGroupedNumber, zonedTodayIso } from "@/lib/localisation/company-format";
import { getCompanyFormat } from "@/lib/store/company-format-store";
import { cn, formatDate } from "@/lib/utils";

/**
 * Odoo-style financial statement (Balance Sheet / Profit and Loss): a centered document card with
 * section bands, indented groups and lines that unfold into accounts, "Total …" rows, an optional
 * shaded comparison column with Change (%), and a Print / date / Comparison pill toolbar.
 *
 * `kind` picks the date semantics: a balance sheet is "as of" one date, a P&L covers a period.
 */

export type StatementKind = "balance-sheet" | "profit-loss" | "cash-flow" | "trial-balance" | "general-ledger" | "partner-ledger" | "aged-receivable" | "aged-payable" | "analytic-report" | "executive-summary";

const AS_OF_COMPARISONS = [
  { value: "none", label: "No Comparison" },
  { value: "previous_period", label: "Previous Period" },
  { value: "same_period_last_year", label: "Same Period Last Year" },
  { value: "specific_date", label: "Specific Date" },
] as const;

const PERIOD_COMPARISONS = [
  { value: "none", label: "No Comparison" },
  { value: "previous_period", label: "Previous Period" },
  { value: "same_period_last_year", label: "Same Period Last Year" },
  { value: "specific_period", label: "Specific Period" },
] as const;

type Props = {
  kind: StatementKind;
  title: string;
  report: ApiFinanceReport | null;
  loading?: boolean;
  warning?: string | null;
  /** Balance sheet: the as-of date. P&L: the period end. */
  dateTo: string;
  onDateToChange: (iso: string) => void;
  /** P&L only. */
  dateFrom?: string;
  onDateFromChange?: (iso: string) => void;
  comparison: string;
  onComparisonChange: (value: string) => void;
  /** Balance sheet "Specific Date" / P&L "Specific Period" end. */
  compareTo: string;
  onCompareToChange: (iso: string) => void;
  /** P&L "Specific Period" start. */
  compareFrom?: string;
  onCompareFromChange?: (iso: string) => void;
  onRefresh: () => void;
  onAccount?: (accountId: string) => void;
  /** General ledger: open a journal entry from a line. */
  onEntry?: (journalEntryId: string) => void;
  /** General ledger: account to unfold on first render (deep link from other reports). */
  focusAccountId?: string;
  /** Partner ledger: which sub-ledger to show. */
  ledgerType?: string;
  onLedgerTypeChange?: (value: string) => void;
  /** Aged reports: bucket width in days and the date the age is counted from. */
  periodLength?: string;
  onPeriodLengthChange?: (value: string) => void;
  basedOn?: string;
  onBasedOnChange?: (value: string) => void;
  extraMenu?: ReactNode;
};

function str(value: unknown) {
  return value == null ? "" : String(value);
}

/** Odoo prints plain numbers with two decimals (currency lives in the "In ৳" pill): 1,234.00 / -1,234.00. */
function plain(value: number | null) {
  if (value == null) return "";
  const grouped = formatGroupedNumber(Math.abs(value), { ...getCompanyFormat(), decimalPlaces: 2 });
  return value < 0 ? `-${grouped}` : grouped;
}

function formatted(value: number | null, format: string) {
  if (value == null) return format === "money" ? "" : "n/a";
  if (format === "percent") return `${value.toFixed(2)} %`;
  if (format === "days") return `${Math.round(value)} days`;
  if (format === "ratio") return value.toFixed(2);
  return plain(value);
}

function pct(value: number | null, compare: number | null) {
  if (value == null) return compare != null ? "n/a" : "";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function currencySymbol() {
  const code = (getCompanyFormat().currencyCode || "BDT").toUpperCase();
  return code === "BDT" ? "৳" : code;
}

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function monthStart(iso: string) {
  return `${iso.slice(0, 7)}-01`;
}

function quarterStart(iso: string) {
  const y = iso.slice(0, 4);
  const m = Number(iso.slice(5, 7));
  const qm = Math.floor((m - 1) / 3) * 3 + 1;
  return `${y}-${String(qm).padStart(2, "0")}-01`;
}

/** "2026" for a whole fiscal year, "Q3 2026" for a quarter, "Sep 2026" for a month, else "from – to". */
function periodLabel(from: string, to: string) {
  const settings = getCompanyFormat();
  const fyStart = fiscalYearStartIso(settings, to);
  const fyEnd = addDays(`${Number(fyStart.slice(0, 4)) + 1}${fyStart.slice(4)}`, -1);
  if (from === fyStart && (to === fyEnd || to === zonedTodayIso(settings))) {
    const startYear = Number(fyStart.slice(0, 4));
    return settings.fiscalYearStartMonth === 1 ? `${startYear}` : `FY ${startYear}/${String(startYear + 1).slice(2)}`;
  }
  if (from === monthStart(to) && from.slice(0, 7) === to.slice(0, 7)) {
    return new Date(`${to}T00:00:00Z`).toLocaleDateString("en", { month: "short", year: "numeric", timeZone: "UTC" });
  }
  if (from === quarterStart(to)) {
    const q = Math.floor((Number(to.slice(5, 7)) - 1) / 3) + 1;
    return `Q${q} ${to.slice(0, 4)}`;
  }
  return `${formatDate(from)} – ${formatDate(to)}`;
}

export function FinancialStatement({
  kind,
  title,
  report,
  loading = false,
  warning,
  dateTo,
  onDateToChange,
  dateFrom = "",
  onDateFromChange,
  comparison,
  onComparisonChange,
  compareTo,
  onCompareToChange,
  compareFrom = "",
  onCompareFromChange,
  onRefresh,
  onAccount,
  onEntry,
  focusAccountId,
  ledgerType = "all",
  onLedgerTypeChange,
  periodLength = "30",
  onPeriodLengthChange,
  basedOn = "due_date",
  onBasedOnChange,
  extraMenu,
}: Props) {
  const isAged = kind === "aged-receivable" || kind === "aged-payable";
  const isPeriod = kind !== "balance-sheet" && !isAged;
  const isAnalytic = kind === "analytic-report";
  const isLedger = kind === "general-ledger" || isAnalytic;
  const isPartner = kind === "partner-ledger";
  const showComparison = kind !== "cash-flow" && !isLedger && !isPartner && !isAged;
  const isTrial = kind === "trial-balance";
  const hasSearch = isTrial || isLedger || isPartner || isAged;
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set(focusAccountId ? [focusAccountId] : []));
  const [search, setSearch] = useState("");
  const columns = useMemo(() => balanceSheetColumnsFromReport(report), [report]);
  const hasCompare = columns.some((c) => c.key === "compare");
  const rows = useMemo(() => flattenBalanceSheetRows(report, expanded), [report, expanded]);
  const filters = (report?.filters ?? {}) as Record<string, string | null>;

  const toggle = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const trialRows = useMemo(() => {
    if (!isTrial || !report) return [] as Record<string, unknown>[];
    const q = search.trim().toLowerCase();
    return report.rows.filter((r) => !q || `${str(r.account_code)} ${str(r.account_name)}`.toLowerCase().includes(q));
  }, [isTrial, report, search]);
  const trialHasCompare = Boolean(report?.filters && (report.filters as Record<string, unknown>).compare_from);
  const ledgerRows = useMemo(() => {
    if (!isLedger || !report) return [] as Record<string, unknown>[];
    const q = search.trim().toLowerCase();
    if (!q) return report.rows;
    return report.rows
      .map((acc) => {
        const head = `${str(acc.account_code)} ${str(acc.account_name)}`.toLowerCase();
        const lines = Array.isArray(acc.lines) ? (acc.lines as Record<string, unknown>[]) : [];
        if (head.includes(q)) return acc;
        const hit = lines.filter((l) => `${str(l.entry_number)} ${str(l.description)} ${str(l.partner)}`.toLowerCase().includes(q));
        return hit.length ? { ...acc, lines: hit, _partial: true } : null;
      })
      .filter(Boolean) as Record<string, unknown>[];
  }, [isLedger, report, search]);
  const ledgerAccountIds = useMemo(() => (report?.rows ?? []).map((r) => str(r.account_id)), [report]);
  const partnerRows = useMemo(() => {
    if (!isPartner || !report) return [] as Record<string, unknown>[];
    const q = search.trim().toLowerCase();
    if (!q) return report.rows;
    return report.rows
      .map((p) => {
        const lines = Array.isArray(p.lines) ? (p.lines as Record<string, unknown>[]) : [];
        if (str(p.partner_name).toLowerCase().includes(q)) return p;
        const hit = lines.filter((l) => `${str(l.reference)} ${str(l.label)}`.toLowerCase().includes(q));
        return hit.length ? { ...p, lines: hit, _partial: true } : null;
      })
      .filter(Boolean) as Record<string, unknown>[];
  }, [isPartner, report, search]);
  const partnerKeys = useMemo(() => (report?.rows ?? []).map((r) => str(r.key)), [report]);
  const agedColumns = useMemo(() => {
    const raw = (report?.filters as Record<string, unknown> | undefined)?.columns;
    return isAged && Array.isArray(raw)
      ? raw.map((c) => ({ key: str((c as Record<string, unknown>).key), label: str((c as Record<string, unknown>).label) }))
      : [];
  }, [isAged, report]);
  const agedRows = useMemo(() => {
    if (!isAged || !report) return [] as Record<string, unknown>[];
    const q = search.trim().toLowerCase();
    if (!q) return report.rows;
    return report.rows
      .map((p) => {
        const lines = Array.isArray(p.lines) ? (p.lines as Record<string, unknown>[]) : [];
        if (str(p.partner_name).toLowerCase().includes(q)) return p;
        const hit = lines.filter((l) => str(l.reference).toLowerCase().includes(q));
        return hit.length ? { ...p, lines: hit, _partial: true } : null;
      })
      .filter(Boolean) as Record<string, unknown>[];
  }, [isAged, report, search]);
  const agedKeys = useMemo(() => (report?.rows ?? []).map((r) => str(r.partner_id)), [report]);

  const comparisonOptions = isPeriod ? PERIOD_COMPARISONS : AS_OF_COMPARISONS;
  const comparisonLabel = comparisonOptions.find((o) => o.value === comparison)?.label ?? "Comparison";
  const specificValue = isPeriod ? "specific_period" : "specific_date";

  const primaryHeader = isPeriod ? periodLabel(str(filters.date_from) || dateFrom, str(filters.date_to) || dateTo) : `As of ${formatDate(dateTo)}`;
  const compareHeader = isPeriod
    ? filters.compare_from && filters.compare_to
      ? periodLabel(filters.compare_from, filters.compare_to)
      : "—"
    : `As of ${filters.compare_date ? formatDate(filters.compare_date) : "—"}`;

  const datePill = isPeriod ? periodLabel(dateFrom, dateTo) : `As of ${formatDate(dateTo)}`;
  const slug = kind === "profit-loss" ? "profit-and-loss" : kind;

  function exportCsv() {
    if (!report) return;
    if (isAged) {
      const out: Array<Array<string | number>> = [];
      for (const p of agedRows) {
        const b = (p.buckets ?? {}) as Record<string, unknown>;
        out.push([str(p.partner_name), "", "", ...agedColumns.map((c) => str(b[c.key])), str(p.total)]);
        for (const l of (Array.isArray(p.lines) ? p.lines : []) as Record<string, unknown>[]) {
          out.push(["", str(l.reference), str(l.invoice_date), ...agedColumns.map((c) => (str(l.bucket) === c.key ? str(l.outstanding) : "")), str(l.outstanding)]);
        }
      }
      downloadCsv(`${kind}-${dateTo}.csv`, [kind === "aged-receivable" ? "Customer" : "Supplier", "Reference", "Invoice Date", ...agedColumns.map((c) => c.label), "Total"], out);
      toast.success(`${title} exported`);
      return;
    }
    if (isPartner) {
      const out: Array<Array<string | number>> = [];
      for (const p of partnerRows) {
        out.push([str(p.partner_name), "", str(p.account), "", "", str(p.debit), str(p.credit), str(p.balance)]);
        for (const l of (Array.isArray(p.lines) ? p.lines : []) as Record<string, unknown>[]) {
          out.push(["", str(l.date), str(l.account), `${str(l.reference)} ${str(l.label)}`.trim(), str(l.due_date), str(l.debit), str(l.credit), str(l.balance)]);
        }
      }
      downloadCsv(`partner-ledger-${dateTo}.csv`, ["Partner", "Date", "Account", "Ref", "Due Date", "Debit", "Credit", "Balance"], out);
      toast.success("Partner ledger exported");
      return;
    }
    if (isLedger) {
      const out: Array<Array<string | number>> = [];
      for (const acc of ledgerRows) {
        out.push([str(acc.account_code), str(acc.account_name), "", "", str(acc.debit), str(acc.credit), str(acc.balance)]);
        for (const l of (Array.isArray(acc.lines) ? acc.lines : []) as Record<string, unknown>[]) {
          out.push(["", `${str(l.entry_number)} ${str(l.description)}`.trim(), str(l.date), str(l.partner), str(l.debit), str(l.credit), str(l.balance)]);
        }
      }
      downloadCsv(`general-ledger-${dateTo}.csv`, ["Code", "Account / Entry", "Date", "Partner", "Debit", "Credit", "Balance"], out);
      toast.success("General ledger exported");
      return;
    }
    if (isTrial) {
      const headers = ["Code", "Account", "Initial Balance", `${primaryHeader} Debit`, `${primaryHeader} Credit`, ...(trialHasCompare ? [`${compareHeader} Debit`, `${compareHeader} Credit`] : []), "End Balance"];
      downloadCsv(
        `trial-balance-${dateTo}.csv`,
        headers,
        trialRows.map((r) => [
          str(r.account_code),
          str(r.account_name),
          str(r.initial_balance),
          str(r.debit),
          str(r.credit),
          ...(trialHasCompare ? [str(r.compare_debit), str(r.compare_credit)] : []),
          str(r.end_balance),
        ]),
      );
      toast.success("Trial balance exported");
      return;
    }
    const all = flattenBalanceSheetRows(report, expanded, { includeCollapsed: true });
    const headers = ["Line", "Code", "Account", primaryHeader, ...(hasCompare ? [compareHeader, "Change (%)"] : [])];
    downloadCsv(
      `${slug}-${dateTo}.csv`,
      headers,
      all.map((row) => [
        row.kind === "account" ? "" : `${"  ".repeat(row.depth)}${row.label}`,
        row.code,
        row.kind === "account" ? row.label : "",
        ...columns.map((c) => {
          const v = row[c.key];
          if (v == null) return "";
          return c.key === "variance_pct" ? pct(v, row.compare) : v;
        }),
      ]),
    );
    toast.success(`${title} exported`);
  }

  // ---- cells ------------------------------------------------------------------------------------
  const amountCell = (row: BalanceSheetRow, key: "amount" | "compare" | "variance_pct") => {
    const isHeader = (row.kind === "section" || row.kind === "group") && row.amount == null;
    const bold = row.kind === "total" || row.kind === "section_total" || row.kind === "grand" || row.kind === "section";
    const text = isHeader ? "" : key === "variance_pct" ? pct(row.variance_pct, row.compare) : formatted(row[key], row.format);
    return (
      <td
        key={key}
        className={cn(
          "whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground",
          key === "compare" && "bg-black/[0.06] dark:bg-black/25",
          bold && "font-semibold",
          key === "variance_pct" && "text-muted-foreground/80",
        )}
      >
        {text}
      </td>
    );
  };

  const labelCell = (row: BalanceSheetRow) => {
    const indent = 24 + row.depth * 24;
    if (row.kind === "section") {
      return (
        <td className="px-3 py-2" style={{ paddingLeft: indent }}>
          <span className={cn("font-semibold text-muted-foreground", !isPeriod && "text-[13px] uppercase tracking-wide")}>{row.label}</span>
        </td>
      );
    }
    if (row.kind === "grand") {
      // Balance sheet closes with an uppercase band; P&L bands (Gross Profit, Net Profit…) keep title case.
      return (
        <td className="px-3 py-2" style={{ paddingLeft: indent }}>
          <span className={cn("font-semibold text-muted-foreground", !isPeriod && "text-[13px] uppercase tracking-wide")}>{row.label}</span>
        </td>
      );
    }
    if (row.kind === "account") {
      return (
        <td className="px-3 py-2" style={{ paddingLeft: indent + 18 }}>
          <button
            type="button"
            className={cn("inline-flex items-center gap-2 text-left text-muted-foreground", row.account_id && "hover:text-foreground hover:underline")}
            onClick={() => row.account_id && onAccount?.(row.account_id)}
          >
            {row.code ? <span className="font-mono text-[12px]">{row.code}</span> : null}
            <span>{row.label}</span>
          </button>
        </td>
      );
    }
    const bold = row.kind !== "line";
    return (
      <td className="px-3 py-2" style={{ paddingLeft: indent }}>
        <span className={cn("inline-flex items-center gap-1.5", bold && "font-semibold")}>
          {row.kind === "line" && row.expandable ? (
            <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground/70 transition-transform", row.expanded && "rotate-90")} aria-hidden />
          ) : null}
          {row.label}
        </span>
      </td>
    );
  };

  const colCount = 1 + columns.length;

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-background">
      {/* Toolbar — Odoo control panel */}
      <div className="print-hide flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <Button
          type="button"
          size="sm"
          className="h-8 rounded-md bg-[#875a7b] px-3 text-sm font-medium text-white hover:bg-[#6d4864]"
          onClick={() => window.print()}
        >
          Print
        </Button>
        <h1 className="text-lg font-medium">{title}</h1>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Report settings">
              <Settings className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem onClick={onRefresh} disabled={loading}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" /> Refresh
            </DropdownMenuItem>
            <DropdownMenuItem onClick={exportCsv} disabled={!report}>
              <Download className="mr-2 h-3.5 w-3.5" /> Export CSV
            </DropdownMenuItem>
            {!isTrial ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setExpanded(new Set(isLedger ? ledgerAccountIds : isPartner ? partnerKeys : isAged ? agedKeys : balanceSheetLineKeys(report)))}>Unfold all</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setExpanded(new Set())}>Fold all</DropdownMenuItem>
              </>
            ) : null}
            {extraMenu}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="mx-auto flex flex-wrap items-center justify-center gap-1.5">
          {hasSearch ? (
            <label className="relative mr-1 block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="h-9 w-[200px] rounded-md bg-background pl-8 text-sm"
                aria-label={isLedger ? "Search accounts, entries, partners" : isPartner || isAged ? "Search partners, references" : "Search accounts"}
              />
            </label>
          ) : null}
          {isPeriod ? (
            <DateRangePresetPicker
              value={{ dateFrom: dateFrom ?? "", dateTo }}
              onChange={(next) => {
                onDateFromChange?.(next.dateFrom);
                onDateToChange(next.dateTo);
              }}
              buttonClassName="h-9 rounded-md px-3 text-sm"
            />
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="secondary" size="sm" className="h-9 rounded-md px-3 text-sm font-medium">
                  <CalendarDays className="mr-1.5 h-4 w-4" /> {datePill}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-64 p-3">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground" onKeyDown={(e) => e.stopPropagation()}>
                  As of date
                  <Input type="date" value={dateTo} onChange={(e) => e.target.value && onDateToChange(e.target.value)} className="h-8" />
                </label>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {showComparison ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className={cn("h-9 rounded-md px-3 text-sm font-medium", comparison !== "none" && "ring-1 ring-primary/50")}
              >
                {comparison === "none" ? "Comparison" : comparisonLabel}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-64">
              {comparisonOptions.map((opt) => (
                <DropdownMenuItem key={opt.value} onClick={() => onComparisonChange(opt.value)}>
                  <span className="mr-2 inline-flex w-3.5 justify-center">
                    {comparison === opt.value ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                  </span>
                  {opt.label}
                </DropdownMenuItem>
              ))}
              {comparison === specificValue ? (
                <>
                  <DropdownMenuSeparator />
                  <div className="space-y-2 px-2 py-1.5" onKeyDown={(e) => e.stopPropagation()}>
                    {isPeriod ? (
                      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                        Compare from
                        <Input type="date" value={compareFrom} onChange={(e) => e.target.value && onCompareFromChange?.(e.target.value)} className="h-8" />
                      </label>
                    ) : null}
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      {isPeriod ? "Compare to" : "Compare to date"}
                      <Input type="date" value={compareTo} onChange={(e) => e.target.value && onCompareToChange(e.target.value)} className="h-8" />
                    </label>
                  </div>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          ) : null}

          {isPartner ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="secondary" size="sm" className={cn("h-9 rounded-md px-3 text-sm font-medium", ledgerType !== "all" && "ring-1 ring-primary/50")}>
                  Account: {ledgerType === "receivable" ? "Receivable" : ledgerType === "payable" ? "Payable" : "Receivable & Payable"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-56">
                {[
                  { value: "all", label: "Receivable & Payable" },
                  { value: "receivable", label: "Receivable" },
                  { value: "payable", label: "Payable" },
                ].map((opt) => (
                  <DropdownMenuItem key={opt.value} onClick={() => onLedgerTypeChange?.(opt.value)}>
                    <span className="mr-2 inline-flex w-3.5 justify-center">
                      {ledgerType === opt.value ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                    </span>
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

          {isAged ? (
            <>
              <span className="inline-flex h-9 items-center rounded-md bg-secondary px-3 text-sm font-medium text-secondary-foreground">
                Account: {kind === "aged-receivable" ? "Receivable" : "Payable"}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="secondary" size="sm" className="h-9 rounded-md px-3 text-sm font-medium">
                    {basedOn === "invoice_date" ? "Based on Invoice Date" : "Based on Due Date"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="w-56">
                  {[
                    { value: "due_date", label: "Based on Due Date" },
                    { value: "invoice_date", label: "Based on Invoice Date" },
                  ].map((opt) => (
                    <DropdownMenuItem key={opt.value} onClick={() => onBasedOnChange?.(opt.value)}>
                      <span className="mr-2 inline-flex w-3.5 justify-center">{basedOn === opt.value ? <Check className="h-3.5 w-3.5 text-primary" /> : null}</span>
                      {opt.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="secondary" size="sm" className="h-9 rounded-md px-3 text-sm font-medium">
                    <CalendarDays className="mr-1.5 h-4 w-4" /> {periodLength} Days
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="w-40">
                  {["7", "15", "30", "45", "60", "90"].map((n) => (
                    <DropdownMenuItem key={n} onClick={() => onPeriodLengthChange?.(n)}>
                      <span className="mr-2 inline-flex w-3.5 justify-center">{periodLength === n ? <Check className="h-3.5 w-3.5 text-primary" /> : null}</span>
                      {n} Days
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : null}

          <span
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-secondary px-3 text-sm font-medium text-secondary-foreground"
            title={kind === "cash-flow" ? "Built from the payment ledger (all recorded payments)" : isPartner ? "Built from the receivable / payable sub-ledgers" : isAged ? "Open invoices from the receivable / payable sub-ledgers" : "Only posted journal entries are included"}
          >
            <SlidersHorizontal className="h-4 w-4" /> Posted Entries
          </span>
          <span className="inline-flex h-9 items-center rounded-md bg-secondary px-3 text-sm font-medium text-secondary-foreground">
            In {currencySymbol()}
          </span>
        </div>
      </div>

      {warning ? (
        <div className="print-hide border-b border-border bg-muted/40 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-400">
          Accounting integrity: {warning}
        </div>
      ) : null}

      {/* Document */}
      <div className="min-h-0 flex-1 overflow-auto px-3 py-5 sm:px-6">
        <div
          id="balance-sheet-print-area"
          className="balance-sheet-doc mx-auto w-full max-w-[1110px] border border-border bg-card px-4 py-6 shadow-sm sm:px-8"
        >
          {loading && !report ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Loading {title.toLowerCase()}…</p>
          ) : isAged ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-[15px]">
                <thead>
                  <tr>
                    <th className="w-[26%]" />
                    <th className="px-3 py-2 text-right text-[15px] font-semibold">Invoice Date</th>
                    {agedColumns.map((c) => (
                      <th key={c.key} className="px-3 py-2 text-right text-[15px] font-semibold">{c.label}</th>
                    ))}
                    <th className="px-3 py-2 text-right text-[15px] font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {agedRows.map((p) => {
                    const key = str(p.partner_id);
                    const open = expanded.has(key) || Boolean(p._partial);
                    const lines = Array.isArray(p.lines) ? (p.lines as Record<string, unknown>[]) : [];
                    const b = (p.buckets ?? {}) as Record<string, unknown>;
                    const num = "whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground";
                    const shaded = "bg-black/[0.06] dark:bg-black/25";
                    return (
                      <Fragment key={key}>
                        <tr
                          className="cursor-pointer border-b border-border/70 hover:bg-muted/40"
                          onClick={() =>
                            setExpanded((prev) => {
                              const next = new Set(prev);
                              if (next.has(key)) next.delete(key);
                              else next.add(key);
                              return next;
                            })
                          }
                        >
                          <td className="whitespace-nowrap px-3 py-2 pl-6 font-semibold">
                            <span className="inline-flex items-center gap-1.5">
                              <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground/70 transition-transform", open && "rotate-90")} aria-hidden />
                              {str(p.partner_name)}
                            </span>
                          </td>
                          <td className="px-3 py-2" />
                          {agedColumns.map((c, i) => (
                            <td key={c.key} className={cn(num, "font-semibold", i % 2 === 0 && shaded)}>{Number(b[c.key]) ? plain(Number(b[c.key])) : ""}</td>
                          ))}
                          <td className={cn(num, "font-semibold")}>{plain(Number(p.total))}</td>
                        </tr>
                        {open
                          ? lines.map((l) => {
                              const entryId = str(l.journal_entry_id);
                              return (
                                <tr key={str(l.id)} className="border-b border-border/70 bg-muted/20">
                                  <td className="whitespace-nowrap px-3 py-2 pl-12 text-muted-foreground">
                                    {entryId ? (
                                      <button type="button" className="text-left hover:text-foreground hover:underline" onClick={() => onEntry?.(entryId)}>
                                        {str(l.reference) || "—"}
                                      </button>
                                    ) : (
                                      <span>{str(l.reference) || "—"}</span>
                                    )}
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-2 text-right text-muted-foreground">{l.invoice_date ? formatDate(str(l.invoice_date)) : ""}</td>
                                  {agedColumns.map((c, i) => (
                                    <td key={c.key} className={cn(num, i % 2 === 0 && shaded)}>{str(l.bucket) === c.key ? plain(Number(l.outstanding)) : ""}</td>
                                  ))}
                                  <td className={num}>{plain(Number(l.outstanding))}</td>
                                </tr>
                              );
                            })
                          : null}
                      </Fragment>
                    );
                  })}
                  {(() => {
                    const t = (report?.totals ?? {}) as Record<string, unknown>;
                    const tb = (t.buckets ?? {}) as Record<string, unknown>;
                    const num = "whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-muted-foreground";
                    const shaded = "bg-black/[0.06] dark:bg-black/25";
                    return (
                      <tr className="border-b border-border/70">
                        <td className="px-3 py-2 pl-6 font-semibold">Total {title}</td>
                        <td className="px-3 py-2" />
                        {agedColumns.map((c, i) => (
                          <td key={c.key} className={cn(num, i % 2 === 0 && shaded)}>{plain(Number(tb[c.key]))}</td>
                        ))}
                        <td className={num}>{plain(Number(t.total))}</td>
                      </tr>
                    );
                  })()}
                  {!loading && agedRows.length === 0 ? (
                    <tr>
                      <td colSpan={agedColumns.length + 3} className="py-10 text-center text-sm text-muted-foreground">
                        {search ? "Nothing matches your search." : "No open balances as of this date."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : isPartner ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-[15px]">
                <thead>
                  <tr>
                    <th className="w-[30%]" />
                    <th className="px-3 py-2 text-left text-[15px] font-semibold">JRNL</th>
                    <th className="px-3 py-2 text-left text-[15px] font-semibold">Account</th>
                    <th className="px-3 py-2 text-left text-[15px] font-semibold">Ref</th>
                    <th className="px-3 py-2 text-right text-[15px] font-semibold">Due Date</th>
                    <th className="px-3 py-2 text-right text-[15px] font-semibold">Debit</th>
                    <th className="px-3 py-2 text-right text-[15px] font-semibold">Credit</th>
                    <th className="px-3 py-2 text-right text-[15px] font-semibold">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {partnerRows.map((p) => {
                    const key = str(p.key);
                    const open = expanded.has(key) || Boolean(p._partial);
                    const lines = Array.isArray(p.lines) ? (p.lines as Record<string, unknown>[]) : [];
                    const shaded = "bg-black/[0.06] dark:bg-black/25";
                    const num = "whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground";
                    return (
                      <Fragment key={key}>
                        <tr
                          className="cursor-pointer border-b border-border/70 hover:bg-muted/40"
                          onClick={() =>
                            setExpanded((prev) => {
                              const next = new Set(prev);
                              if (next.has(key)) next.delete(key);
                              else next.add(key);
                              return next;
                            })
                          }
                        >
                          <td className="whitespace-nowrap px-3 py-2 pl-6 font-semibold">
                            <span className="inline-flex items-center gap-1.5">
                              <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground/70 transition-transform", open && "rotate-90")} aria-hidden />
                              {str(p.partner_name)}
                            </span>
                          </td>
                          <td className="px-3 py-2" />
                          <td className="px-3 py-2 text-muted-foreground">{str(p.account)}</td>
                          <td className={cn("px-3 py-2", shaded)} />
                          <td className={cn("px-3 py-2", shaded)} />
                          <td className={cn(num, "font-semibold", shaded)}>{plain(Number(p.debit))}</td>
                          <td className={cn(num, "font-semibold", shaded)}>{plain(Number(p.credit))}</td>
                          <td className={cn(num, "font-semibold")}>{plain(Number(p.balance))}</td>
                        </tr>
                        {open
                          ? lines.map((l) => {
                              const entryId = str(l.journal_entry_id);
                              const label = l.is_opening ? "Initial Balance" : `${l.date ? formatDate(str(l.date)) : ""} ${str(l.reference)}`.trim();
                              return (
                                <tr key={str(l.id)} className="border-b border-border/70 bg-muted/20">
                                  <td className="whitespace-nowrap px-3 py-2 pl-12 text-muted-foreground">
                                    {entryId ? (
                                      <button type="button" className="text-left hover:text-foreground hover:underline" onClick={() => onEntry?.(entryId)}>
                                        {label}
                                      </button>
                                    ) : (
                                      <span className={cn(Boolean(l.is_opening) && "font-medium")}>{label}</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 font-mono text-[12px] text-muted-foreground">{str(l.journal)}</td>
                                  <td className="px-3 py-2 text-muted-foreground">{str(l.account)}</td>
                                  <td className={cn("max-w-[240px] truncate px-3 py-2 text-muted-foreground", shaded)} title={str(l.label)}>{str(l.label)}</td>
                                  <td className={cn("whitespace-nowrap px-3 py-2 text-right text-muted-foreground", shaded)}>{l.due_date ? formatDate(str(l.due_date)) : ""}</td>
                                  <td className={cn(num, shaded)}>{l.is_opening ? "" : plain(Number(l.debit))}</td>
                                  <td className={cn(num, shaded)}>{l.is_opening ? "" : plain(Number(l.credit))}</td>
                                  <td className={num}>{plain(Number(l.balance))}</td>
                                </tr>
                              );
                            })
                          : null}
                      </Fragment>
                    );
                  })}
                  {(() => {
                    const t = (report?.totals ?? {}) as Record<string, unknown>;
                    const shaded = "bg-black/[0.06] dark:bg-black/25";
                    const num = "whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-muted-foreground";
                    return (
                      <tr className="border-b border-border/70">
                        <td className="px-3 py-2 pl-6 font-semibold">Total Partner Ledger</td>
                        <td className="px-3 py-2" />
                        <td className="px-3 py-2" />
                        <td className={cn("px-3 py-2", shaded)} />
                        <td className={cn("px-3 py-2", shaded)} />
                        <td className={cn(num, shaded)}>{plain(Number(t.total_debit))}</td>
                        <td className={cn(num, shaded)}>{plain(Number(t.total_credit))}</td>
                        <td className={num}>{plain(Number(t.balance))}</td>
                      </tr>
                    );
                  })()}
                  {!loading && partnerRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                        {search ? "Nothing matches your search." : "No partner movements in this period."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : isLedger ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-[15px]">
                <thead>
                  <tr>
                    <th className="w-[34%]" />
                    <th className="px-3 py-2 text-right text-[15px] font-semibold">Date</th>
                    <th className="px-3 py-2 text-right text-[15px] font-semibold">Partner</th>
                    {isAnalytic ? <th className="px-3 py-2 text-right text-[15px] font-semibold">Account</th> : null}
                    <th className="px-3 py-2 text-right text-[15px] font-semibold">Debit</th>
                    <th className="px-3 py-2 text-right text-[15px] font-semibold">Credit</th>
                    <th className="px-3 py-2 text-right text-[15px] font-semibold">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerRows.map((acc, index) => {
                    const id = str(acc.account_id);
                    const open = expanded.has(id) || Boolean(acc._partial);
                    const lines = Array.isArray(acc.lines) ? (acc.lines as Record<string, unknown>[]) : [];
                    const shaded = "bg-black/[0.06] dark:bg-black/25";
                    const planLabel = str(acc.plan_label);
                    const newPlan = isAnalytic && planLabel && (index === 0 || str(ledgerRows[index - 1].plan_label) !== planLabel);
                    return (
                      <Fragment key={id}>
                        {newPlan ? (
                          <tr className="bg-muted">
                            <td colSpan={isAnalytic ? 7 : 6} className="px-3 py-2 pl-6 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {planLabel}
                            </td>
                          </tr>
                        ) : null}
                        <tr
                          className="cursor-pointer border-b border-border/70 hover:bg-muted/40"
                          onClick={() =>
                            setExpanded((prev) => {
                              const next = new Set(prev);
                              if (next.has(id)) next.delete(id);
                              else next.add(id);
                              return next;
                            })
                          }
                        >
                          <td className="whitespace-nowrap px-3 py-2 pl-6 font-semibold">
                            <span className="inline-flex items-center gap-1.5">
                              <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground/70 transition-transform", open && "rotate-90")} aria-hidden />
                              <span className="font-mono text-[12px] text-muted-foreground">{str(acc.account_code)}</span>
                              {str(acc.account_name)}
                            </span>
                          </td>
                          <td className="px-3 py-2" />
                          <td className={cn("px-3 py-2", shaded)} />
                          {isAnalytic ? <td className="px-3 py-2" /> : null}
                          <td className={cn("whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-muted-foreground", shaded)}>{plain(Number(acc.debit))}</td>
                          <td className={cn("whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-muted-foreground", shaded)}>{plain(Number(acc.credit))}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-muted-foreground">{plain(Number(acc.balance))}</td>
                        </tr>
                        {open
                          ? lines.map((l) => {
                              const entryId = str(l.journal_entry_id);
                              const label = l.is_opening ? "Initial Balance" : `${str(l.entry_number)} ${str(l.description)}`.trim();
                              return (
                                <tr key={str(l.id)} className="border-b border-border/70 bg-muted/20">
                                  <td className="px-3 py-2 pl-12 text-muted-foreground">
                                    {entryId ? (
                                      <button type="button" className="text-left hover:text-foreground hover:underline" onClick={() => onEntry?.(entryId)}>
                                        {label}
                                      </button>
                                    ) : (
                                      <span className={cn(Boolean(l.is_opening) && "font-medium")}>{label}</span>
                                    )}
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-2 text-right text-muted-foreground">{l.date ? formatDate(str(l.date)) : ""}</td>
                                  <td className={cn("max-w-[200px] truncate px-3 py-2 text-right text-muted-foreground", shaded)} title={str(l.partner)}>{str(l.partner)}</td>
                                  {isAnalytic ? <td className="max-w-[220px] truncate px-3 py-2 text-right text-muted-foreground" title={str(l.gl_account)}>{str(l.gl_account)}</td> : null}
                                  <td className={cn("whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground", shaded)}>{l.is_opening ? "" : plain(Number(l.debit))}</td>
                                  <td className={cn("whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground", shaded)}>{l.is_opening ? "" : plain(Number(l.credit))}</td>
                                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground">{plain(Number(l.balance))}</td>
                                </tr>
                              );
                            })
                          : null}
                      </Fragment>
                    );
                  })}
                  {(() => {
                    const t = (report?.totals ?? {}) as Record<string, unknown>;
                    const shaded = "bg-black/[0.06] dark:bg-black/25";
                    return (
                      <tr className="border-b border-border/70">
                        <td className="px-3 py-2 pl-6 font-semibold">Total {isAnalytic ? "Analytic Report" : "General Ledger"}</td>
                        <td className="px-3 py-2" />
                        <td className={cn("px-3 py-2", shaded)} />
                        {isAnalytic ? <td className="px-3 py-2" /> : null}
                        <td className={cn("whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-muted-foreground", shaded)}>{plain(Number(t.total_debit))}</td>
                        <td className={cn("whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-muted-foreground", shaded)}>{plain(Number(t.total_credit))}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-muted-foreground">{plain(Number(t.balance))}</td>
                      </tr>
                    );
                  })()}
                  {!loading && ledgerRows.length === 0 ? (
                    <tr>
                      <td colSpan={isAnalytic ? 7 : 6} className="py-10 text-center text-sm text-muted-foreground">
                        {search ? "Nothing matches your search." : isAnalytic ? "No journal lines tagged with a cost center in this period." : "No posted journal lines in this period."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : isTrial ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-[15px]">
                <thead>
                  <tr>
                    <th className="w-[34%]" />
                    <th className="border border-border px-3 py-2 text-center text-[15px] font-semibold">Initial Balance</th>
                    <th colSpan={2} className="border border-border px-3 py-2 text-center text-[15px] font-semibold">{primaryHeader}</th>
                    {trialHasCompare ? (
                      <th colSpan={2} className="border border-border px-3 py-2 text-center text-[15px] font-semibold">{compareHeader}</th>
                    ) : null}
                    <th className="border border-border px-3 py-2 text-center text-[15px] font-semibold">End Balance</th>
                  </tr>
                  <tr>
                    <th />
                    <th className="px-3 py-2 text-right text-[15px] font-semibold">Balance</th>
                    <th className="bg-black/[0.06] px-3 py-2 text-right text-[15px] font-semibold dark:bg-black/25">Debit</th>
                    <th className="bg-black/[0.06] px-3 py-2 text-right text-[15px] font-semibold dark:bg-black/25">Credit</th>
                    {trialHasCompare ? (
                      <>
                        <th className="px-3 py-2 text-right text-[15px] font-semibold">Debit</th>
                        <th className="px-3 py-2 text-right text-[15px] font-semibold">Credit</th>
                      </>
                    ) : null}
                    <th className="px-3 py-2 text-right text-[15px] font-semibold">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {trialRows.map((r) => {
                    const cell = (v: unknown, shaded = false) => (
                      <td className={cn("whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground", shaded && "bg-black/[0.06] dark:bg-black/25")}>
                        {plain(Number(v))}
                      </td>
                    );
                    return (
                      <tr key={str(r.account_id) || str(r.account_code)} className="border-b border-border/70">
                        <td className="whitespace-nowrap px-3 py-2 pl-6">
                          <button
                            type="button"
                            className="inline-flex items-center gap-2 text-left hover:underline"
                            onClick={() => r.account_id && onAccount?.(str(r.account_id))}
                          >
                            <span className="font-mono text-[12px] text-muted-foreground">{str(r.account_code)}</span>
                            <span>{str(r.account_name)}</span>
                          </button>
                        </td>
                        {cell(r.initial_balance)}
                        {cell(r.debit, true)}
                        {cell(r.credit, true)}
                        {trialHasCompare ? (
                          <>
                            {cell(r.compare_debit)}
                            {cell(r.compare_credit)}
                          </>
                        ) : null}
                        {cell(r.end_balance)}
                      </tr>
                    );
                  })}
                  {(() => {
                    const t = (report?.totals ?? {}) as Record<string, unknown>;
                    const cell = (v: unknown, shaded = false) => (
                      <td className={cn("whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-muted-foreground", shaded && "bg-black/[0.06] dark:bg-black/25")}>
                        {plain(Number(v))}
                      </td>
                    );
                    return (
                      <tr className="border-b border-border/70">
                        <td className="px-3 py-2 pl-6 font-semibold">Total</td>
                        {cell(t.initial_balance)}
                        {cell(t.total_debit, true)}
                        {cell(t.total_credit, true)}
                        {trialHasCompare ? (
                          <>
                            {cell(t.compare_debit)}
                            {cell(t.compare_credit)}
                          </>
                        ) : null}
                        {cell(t.end_balance)}
                      </tr>
                    );
                  })()}
                  {!loading && trialRows.length === 0 ? (
                    <tr>
                      <td colSpan={trialHasCompare ? 7 : 5} className="py-10 text-center text-sm text-muted-foreground">
                        {search ? "No accounts match your search." : "No account activity in this period."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-[15px]">
                <thead>
                  {hasCompare ? (
                    <>
                      <tr>
                        <th className="w-[46%]" />
                        <th className="border border-border px-3 py-2 text-center text-[15px] font-semibold">{primaryHeader}</th>
                        <th className="border border-border px-3 py-2 text-center text-[15px] font-semibold">{compareHeader}</th>
                        <th className="border border-border px-3 py-2 text-center text-[15px] font-semibold">Change (%)</th>
                      </tr>
                      <tr>
                        <th />
                        <th className="px-3 py-2 text-right text-[15px] font-semibold">Balance</th>
                        <th className="bg-black/[0.06] px-3 py-2 text-right text-[15px] font-semibold dark:bg-black/25">Balance</th>
                        <th />
                      </tr>
                    </>
                  ) : (
                    <tr>
                      <th className="w-[70%]" />
                      <th className="px-3 py-2 text-right text-[15px] font-semibold">Balance</th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    const band = row.kind === "section" || row.kind === "grand";
                    const spacer = band && index > 0;
                    return (
                      <Fragment key={row.id}>
                        {spacer ? (
                          <tr aria-hidden>
                            <td colSpan={colCount} className="h-6" />
                          </tr>
                        ) : null}
                        <tr
                          className={cn(
                            "border-b border-border/70",
                            band && "border-0 bg-muted",
                            row.kind === "line" && row.expandable && "cursor-pointer hover:bg-muted/40",
                            row.kind === "account" && "bg-muted/20",
                          )}
                          onClick={row.kind === "line" && row.expandable ? () => toggle(row.line_key) : undefined}
                        >
                          {labelCell(row)}
                          {columns.map((c) => amountCell(row, c.key))}
                        </tr>
                      </Fragment>
                    );
                  })}
                  {!loading && rows.length === 0 ? (
                    <tr>
                      <td colSpan={colCount} className="py-16 text-center text-sm text-muted-foreground">
                        No lines. Post journal entries to see balances here.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <p className="print-hide mx-auto mt-2 max-w-[1110px] text-[11px] text-muted-foreground">
          {isPeriod
            ? `${formatDate(dateFrom)} → ${formatDate(dateTo)} · ${kind === "cash-flow" ? "payment ledger, cash out shown negative" : isPartner ? "receivable / payable sub-ledgers · balance = debit − credit" : "posted entries only"}`
            : isAged
              ? `As of ${formatDate(dateTo)} · ${periodLength}-day buckets · ${basedOn === "invoice_date" ? "aged from invoice date" : "aged from due date"}`
              : `As of ${formatDate(dateTo)} · fiscal year from ${filters.fiscal_year_start ? formatDate(filters.fiscal_year_start) : "—"} · posted entries only`}
        </p>
      </div>
    </div>
  );
}
