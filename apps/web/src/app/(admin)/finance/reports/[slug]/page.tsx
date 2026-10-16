"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { FilterSelect } from "@/components/shared/filter-select";
import { DateRangePresetPicker } from "@/components/shared/date-range-preset-picker";
import {
  ReportTable,
  downloadCsv,
  money,
  todayIso,
  yearStartIso,
} from "@/components/finance/finance-report-shell";
import { FinanceGridSettingsMenu } from "@/components/finance/finance-grid-settings";
import { JournalEntrySheet } from "@/components/finance/journal-entry-sheet";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { ListGridOpenFallback } from "@/components/shared/list-grid-open-fallback";
import { useApiHealth } from "@/lib/api/use-api-health";
import {
  fetchFinanceAccounts,
  fetchFinanceJournalEntry,
  fetchFinanceJournalSourceTypes,
  fetchFinanceReport,
  fetchPaymentAccounts,
  type ApiFinanceAccount,
  type ApiFinanceJournalEntry,
  type ApiFinanceReport,
  type ApiFinanceSourceType,
} from "@/lib/api/finance";
import { FINANCE_REPORTS } from "@/lib/finance/finance-nav";
import { cn } from "@/lib/utils";
import type { FinanceReportAgGridHandle, ReportAgRow } from "@/components/finance/finance-report-ag-grid";
import { NUMERIC_CELL, NUMERIC_HEADER, type FinanceAgListGridColumn } from "@/components/finance/finance-ag-list-grid";

const FinanceReportAgGridDyn = dynamic(
  () => import("@/components/finance/finance-report-ag-grid").then((m) => m.FinanceReportAgGrid),
  {
    ssr: false,
    loading: () => <ListGridOpenFallback label="Opening report…" />,
  },
);

const FinancialStatementDyn = dynamic(
  () => import("@/components/finance/financial-statement").then((m) => m.FinancialStatement),
  {
    ssr: false,
    loading: () => <ListGridOpenFallback label="Opening statement…" />,
  },
);

const InvoicesAnalysisDyn = dynamic(
  () => import("@/components/finance/invoices-analysis").then((m) => m.InvoicesAnalysis),
  {
    ssr: false,
    loading: () => <ListGridOpenFallback label="Opening invoices analysis…" />,
  },
);

const AGED_SLUGS = ["aged-receivable", "aged-payable"] as const;

function shiftYearIso(iso: string, years: number) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const y = Number(m[1]) + years;
  const day = m[2] === "02" && m[3] === "29" ? "28" : m[3];
  return `${y}-${m[2]}-${day}`;
}

const ACCOUNT_TYPES = [
  { value: "all", label: "All types" },
  { value: "asset", label: "Asset" },
  { value: "liability", label: "Liability" },
  { value: "equity", label: "Equity" },
  { value: "revenue", label: "Revenue" },
  { value: "expense", label: "Expense" },
];

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function str(value: unknown) {
  return value == null ? "" : String(value);
}

function moneyCell() {
  return {
    type: "numericColumn" as const,
    headerClass: NUMERIC_HEADER,
    cellClass: `${NUMERIC_CELL} font-medium`,
    valueFormatter: (p: { value: unknown }) => money(p.value),
  };
}

function flattenOtherFinanceReport(
  slug: string,
  rows: Record<string, unknown>[],
  totals: Record<string, unknown>,
): {
  rows: ReportAgRow[];
  columns: FinanceAgListGridColumn[];
  csvHeaders: string[];
  csvRow: (row: ReportAgRow) => Array<string | number>;
} {
  if (slug === "trial-balance") {
    const data: ReportAgRow[] = rows.map((row) => ({
      id: str(row.account_id) || str(row.account_code),
      account_id: str(row.account_id),
      code: str(row.account_code),
      account: str(row.account_name),
      type: str(row.account_type),
      debit: num(row.debit),
      credit: num(row.credit),
      net: num(row.net),
    }));
    if (data.length) {
      data.push({
        id: "totals",
        code: "",
        account: "Totals",
        type: "",
        debit: num(totals.total_debit),
        credit: num(totals.total_credit),
        net: num(totals.difference),
      });
    }
    return {
      rows: data,
      columns: [
        { colId: "code", field: "code", headerName: "Code", width: 100, minWidth: 80, cellClass: "font-mono text-[11px]" },
        { colId: "account", field: "account", headerName: "Account", flex: 1.5, minWidth: 160, cellClass: "font-medium" },
        { colId: "type", field: "type", headerName: "Type", width: 110, minWidth: 90, cellClass: "capitalize text-muted-foreground" },
        { colId: "debit", field: "debit", headerName: "Debit", width: 120, minWidth: 100, ...moneyCell() },
        { colId: "credit", field: "credit", headerName: "Credit", width: 120, minWidth: 100, ...moneyCell() },
        { colId: "net", field: "net", headerName: "Net", width: 120, minWidth: 100, ...moneyCell() },
      ],
      csvHeaders: ["Code", "Account", "Type", "Debit", "Credit", "Net"],
      csvRow: (row) => [str(row.code), str(row.account), str(row.type), num(row.debit), num(row.credit), num(row.net)],
    };
  }

  if (slug === "cash-flow") {
    const data: ReportAgRow[] = rows.map((row) => ({
      id: str(row.kind) || str(row.label),
      label: str(row.label),
      amount: num(row.amount),
    }));
    return {
      rows: data,
      columns: [
        { colId: "label", field: "label", headerName: "Line", flex: 1.6, minWidth: 180 },
        { colId: "amount", field: "amount", headerName: "Amount", width: 140, minWidth: 110, ...moneyCell() },
      ],
      csvHeaders: ["Line", "Amount"],
      csvRow: (row) => [str(row.label), num(row.amount)],
    };
  }

  if (slug === "general-ledger") {
    const data: ReportAgRow[] = rows.map((row, idx) => ({
      id: `${str(row.journal_entry_id)}-${idx}`,
      journal_entry_id: str(row.journal_entry_id),
      date: str(row.date),
      entry: str(row.entry_number),
      account: `${str(row.account_code)} ${str(row.account_name)}`.trim(),
      description: str(row.description),
      source: str(row.source_label || row.source_type),
      debit: num(row.debit),
      credit: num(row.credit),
      balance: num(row.running_balance),
    }));
    return {
      rows: data,
      columns: [
        { colId: "date", field: "date", headerName: "Date", width: 110, minWidth: 90 },
        { colId: "entry", field: "entry", headerName: "Entry", width: 130, minWidth: 100, cellClass: "font-medium" },
        { colId: "account", field: "account", headerName: "Account", flex: 1.2, minWidth: 140 },
        { colId: "description", field: "description", headerName: "Description", flex: 1.4, minWidth: 160 },
        { colId: "source", field: "source", headerName: "Source", width: 130, minWidth: 100, cellClass: "text-muted-foreground" },
        { colId: "debit", field: "debit", headerName: "Debit", width: 110, minWidth: 90, ...moneyCell() },
        { colId: "credit", field: "credit", headerName: "Credit", width: 110, minWidth: 90, ...moneyCell() },
        { colId: "balance", field: "balance", headerName: "Balance", width: 120, minWidth: 100, ...moneyCell() },
      ],
      csvHeaders: ["Date", "Entry", "Account", "Description", "Source", "Debit", "Credit", "Balance"],
      csvRow: (row) => [
        str(row.date),
        str(row.entry),
        str(row.account),
        str(row.description),
        str(row.source),
        num(row.debit),
        num(row.credit),
        num(row.balance),
      ],
    };
  }

  if (slug === "receivable-aging" || slug === "payable-aging") {
    const data: ReportAgRow[] = rows.map((row) => ({
      id: str(row.id),
      party: str(row.customer_name || row.supplier_name),
      reference: str(row.invoice_number || row.reference_number),
      date: str(row.invoice_date || row.bill_date),
      due: str(row.due_date),
      amount: num(row.amount),
      paid: num(row.amount_paid),
      outstanding: num(row.outstanding),
      bucket: str(row.aging_label),
    }));
    return {
      rows: data,
      columns: [
        { colId: "party", field: "party", headerName: slug === "receivable-aging" ? "Customer" : "Supplier", flex: 1.2, minWidth: 140 },
        { colId: "reference", field: "reference", headerName: slug === "receivable-aging" ? "Invoice" : "Reference", width: 140, minWidth: 110, cellClass: "font-medium" },
        { colId: "date", field: "date", headerName: "Date", width: 110, minWidth: 90, cellClass: "text-muted-foreground" },
        { colId: "due", field: "due", headerName: "Due", width: 110, minWidth: 90, cellClass: "text-muted-foreground" },
        { colId: "amount", field: "amount", headerName: "Total", width: 110, minWidth: 90, ...moneyCell() },
        { colId: "paid", field: "paid", headerName: "Paid", width: 110, minWidth: 90, ...moneyCell() },
        { colId: "outstanding", field: "outstanding", headerName: "Outstanding", width: 120, minWidth: 100, ...moneyCell() },
        { colId: "bucket", field: "bucket", headerName: "Bucket", width: 120, minWidth: 90 },
      ],
      csvHeaders: ["Party", "Reference", "Date", "Due", "Total", "Paid", "Outstanding", "Bucket"],
      csvRow: (row) => [
        str(row.party),
        str(row.reference),
        str(row.date),
        str(row.due),
        num(row.amount),
        num(row.paid),
        num(row.outstanding),
        str(row.bucket),
      ],
    };
  }

  if (slug === "tax-summary") {
    const data: ReportAgRow[] = [];
    rows.forEach((row) => {
      const sources = Array.isArray(row.sources) ? (row.sources as Record<string, unknown>[]) : [];
      const kind = str(row.kind);
      sources.forEach((source, index) => {
        data.push({
          id: `${kind}-${str(source.source_type)}-${index}`,
          kind: kind.replace(/_/g, " "),
          account: `${str(row.account_code)} ${money(row.amount)}`,
          source: str(source.source_label || source.source_type),
          source_type: str(source.source_type),
          amount: num(source.amount),
        });
      });
    });
    return {
      rows: data,
      columns: [
        { colId: "kind", field: "kind", headerName: "Kind", width: 140, minWidth: 110, cellClass: "capitalize" },
        { colId: "account", field: "account", headerName: "Account", flex: 1.1, minWidth: 140 },
        { colId: "source", field: "source", headerName: "Source", flex: 1.2, minWidth: 140 },
        { colId: "amount", field: "amount", headerName: "Amount", width: 130, minWidth: 100, ...moneyCell() },
      ],
      csvHeaders: ["Kind", "Account", "Source", "Amount"],
      csvRow: (row) => [str(row.kind), str(row.account), str(row.source), num(row.amount)],
    };
  }

  if (slug === "expense-by-cost-center") {
    const data: ReportAgRow[] = rows.map((row, index) => ({
      id: `${str(row.cost_center_id)}-${str(row.account_id)}-${index}`,
      concern: `${str(row.cost_center_code) || "—"} ${str(row.cost_center_name)}`.trim(),
      account: `${str(row.account_code)} ${str(row.account_name)}`.trim(),
      debit: num(row.debit),
      credit: num(row.credit),
      net: num(row.net),
    }));
    if (data.length) {
      data.push({
        id: "totals",
        concern: "Totals",
        account: "",
        debit: num(totals.total_debit),
        credit: num(totals.total_credit),
        net: num(totals.net),
      });
    }
    return {
      rows: data,
      columns: [
        { colId: "concern", field: "concern", headerName: "Concern", flex: 1.2, minWidth: 140 },
        { colId: "account", field: "account", headerName: "Account", flex: 1.4, minWidth: 160 },
        { colId: "debit", field: "debit", headerName: "Debit", width: 120, minWidth: 100, ...moneyCell() },
        { colId: "credit", field: "credit", headerName: "Credit", width: 120, minWidth: 100, ...moneyCell() },
        { colId: "net", field: "net", headerName: "Net", width: 120, minWidth: 100, ...moneyCell() },
      ],
      csvHeaders: ["Concern", "Account", "Debit", "Credit", "Net"],
      csvRow: (row) => [str(row.concern), str(row.account), num(row.debit), num(row.credit), num(row.net)],
    };
  }

  return {
    rows: [],
    columns: [{ colId: "label", field: "label", headerName: "Line", flex: 1, minWidth: 120 }],
    csvHeaders: ["Line"],
    csvRow: () => [""],
  };
}

export default function FinanceReportPage() {
  return (
    <Suspense fallback={<p className="p-3 text-sm text-muted-foreground">Loading report…</p>}>
      <FinanceReportBody />
    </Suspense>
  );
}

function FinanceReportBody() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const meta = FINANCE_REPORTS.find((r) => r.id === slug);
  const router = useRouter();
  const search = useSearchParams();
  const apiHealth = useApiHealth();
  const reportGridRef = useRef<FinanceReportAgGridHandle>(null);
  const isAged = (AGED_SLUGS as readonly string[]).includes(slug);
  const isBalanceSheet = slug === "balance-sheet";
  const isProfitLoss = slug === "profit-loss";
  const isCashFlow = slug === "cash-flow";
  const isTrialBalance = slug === "trial-balance";
  const isGeneralLedger = slug === "general-ledger";
  const isPartnerLedger = slug === "partner-ledger";
  const isInvoicesAnalysis = slug === "invoices-analysis";
  const isAnalyticReport = slug === "analytic-report";
  const isExecutiveSummary = slug === "executive-summary";

  const [dateFrom, setDateFrom] = useState(search.get("date_from") || yearStartIso());
  const [dateTo, setDateTo] = useState(search.get("date_to") || todayIso());
  const [accountId, setAccountId] = useState(search.get("account_id") || "all");
  const [accountType, setAccountType] = useState(search.get("account_type") || "all");
  const [sourceType, setSourceType] = useState(search.get("source_type") || "all");
  const [paymentAccountId, setPaymentAccountId] = useState(search.get("payment_account") || "all");
  const [asOf, setAsOf] = useState(search.get("as_of") || todayIso());
  const [periodLength, setPeriodLength] = useState(search.get("period_length") || "30");
  const [basedOn, setBasedOn] = useState(search.get("based_on") || "due_date");
  const [comparison, setComparison] = useState(search.get("comparison") || "none");
  const [compareDate, setCompareDate] = useState(search.get("compare_date") || "");
  const [compareFrom, setCompareFrom] = useState(search.get("compare_from") || "");
  const [ledgerType, setLedgerType] = useState(search.get("ledger_type") || "all");
  const [invoiceStatus, setInvoiceStatus] = useState(search.get("status") || "invoiced");
  const partnerParam = search.get("partner_id") || undefined;
  const [report, setReport] = useState<ApiFinanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<ApiFinanceAccount[]>([]);
  const [sourceTypes, setSourceTypes] = useState<ApiFinanceSourceType[]>([]);
  const [paymentAccounts, setPaymentAccounts] = useState<Array<{ id: string; name: string }>>([]);
  const [entry, setEntry] = useState<ApiFinanceJournalEntry | null>(null);
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryLoading, setEntryLoading] = useState(false);

  useEffect(() => {
    void fetchFinanceAccounts()
      .then((res) => setAccounts(res.data))
      .catch(() => undefined);
    void fetchFinanceJournalSourceTypes()
      .then((res) => setSourceTypes(res.data))
      .catch(() => undefined);
    void fetchPaymentAccounts()
      .then((res) => setPaymentAccounts(res.data.map((a) => ({ id: a.id, name: a.name }))))
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    if (!meta) return;
    setLoading(true);
    try {
      const data = await fetchFinanceReport(
        slug,
        isAged
          ? { as_of: asOf, period_length: periodLength, based_on: basedOn }
          : isBalanceSheet
            ? {
                as_of: asOf,
                comparison,
                compare_date: comparison === "specific_date" ? compareDate || shiftYearIso(asOf, -1) : undefined,
              }
            : isInvoicesAnalysis
              ? { date_from: dateFrom, date_to: dateTo, status: invoiceStatus }
            : isPartnerLedger
              ? { date_from: dateFrom, date_to: dateTo, ledger_type: ledgerType, partner_id: partnerParam }
              : isProfitLoss || isTrialBalance || isExecutiveSummary
              ? {
                  date_from: dateFrom,
                  date_to: dateTo,
                  comparison,
                  compare_from: comparison === "specific_period" ? compareFrom || shiftYearIso(dateFrom, -1) : undefined,
                  compare_to: comparison === "specific_period" ? compareDate || shiftYearIso(dateTo, -1) : undefined,
                }
              : {
              date_from: dateFrom,
              date_to: dateTo,
              account_id: accountId !== "all" ? accountId : undefined,
              account_type: accountType !== "all" ? accountType : undefined,
              source_type: sourceType !== "all" ? sourceType : undefined,
              payment_account_id: paymentAccountId !== "all" ? paymentAccountId : undefined,
            },
      );
      setReport(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load report");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [meta, slug, isAged, isBalanceSheet, isProfitLoss, isTrialBalance, isExecutiveSummary, isPartnerLedger, isInvoicesAnalysis, invoiceStatus, ledgerType, partnerParam, asOf, periodLength, basedOn, comparison, compareDate, compareFrom, dateFrom, dateTo, accountId, accountType, sourceType, paymentAccountId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openJournal(id: string) {
    setEntryOpen(true);
    setEntryLoading(true);
    try {
      const res = await fetchFinanceJournalEntry(id);
      setEntry(res.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load journal entry");
    } finally {
      setEntryLoading(false);
    }
  }

  function goLedger(id: string) {
    const to = isBalanceSheet ? asOf : dateTo;
    router.push(`/finance/reports/general-ledger?account_id=${encodeURIComponent(id)}&date_from=${dateFrom}&date_to=${to}`);
  }

  const accountOptions = useMemo(
    () => [{ value: "all", label: "All accounts" }, ...accounts.map((a) => ({ value: a.id, label: `${a.code} ${a.name}` }))],
    [accounts],
  );
  const sourceOptions = useMemo(
    () => [{ value: "all", label: "All sources" }, ...sourceTypes.map((s) => ({ value: s.value, label: s.label }))],
    [sourceTypes],
  );
  const otherGrid = useMemo(
    () => (report && !isAged ? flattenOtherFinanceReport(slug, report.rows, report.totals ?? {}) : null),
    [report, slug, isAged],
  );

  if (!meta) {
    return <p className="p-4 text-sm text-muted-foreground">Unknown report.</p>;
  }

  const warning = report?.integrity && !report.integrity.ok ? report.integrity.warning : null;
  const totals = report?.totals ?? {};

  function exportCsv() {
    if (!report) return;
    if (slug === "trial-balance") {
      downloadCsv(
        `trial-balance-${dateFrom}-${dateTo}.csv`,
        ["Code", "Name", "Type", "Debit", "Credit", "Net"],
        report.rows.map((row) => [str(row.account_code), str(row.account_name), str(row.account_type), str(row.debit), str(row.credit), str(row.net)]),
      );
      return;
    }
    if (slug === "expense-by-cost-center") {
      downloadCsv(
        `expense-by-cost-center-${dateFrom}-${dateTo}.csv`,
        ["Concern", "Code", "Account", "Debit", "Credit", "Net"],
        report.rows.map((row) => [
          str(row.cost_center_name),
          str(row.cost_center_code),
          `${str(row.account_code)} ${str(row.account_name)}`,
          str(row.debit),
          str(row.credit),
          str(row.net),
        ]),
      );
      return;
    }
    if (slug === "receivable-aging" || slug === "payable-aging") {
      downloadCsv(
        `${slug}-${dateTo}.csv`,
        ["Party", "Reference", "Date", "Due", "Total", "Paid", "Outstanding", "Bucket"],
        report.rows.map((row) => [
          str(row.customer_name || row.supplier_name),
          str(row.invoice_number || row.reference_number),
          str(row.invoice_date || row.bill_date),
          str(row.due_date),
          str(row.amount),
          str(row.amount_paid),
          str(row.outstanding),
          str(row.aging_label),
        ]),
      );
      return;
    }
    downloadCsv(
      `${slug}-${dateFrom}-${dateTo}.csv`,
      ["Label", "Value"],
      Object.entries(totals).map(([key, value]) => [key, typeof value === "object" ? JSON.stringify(value) : str(value)]),
    );
  }

  const extraFilters = (
    <>
      {["trial-balance", "profit-loss", "balance-sheet", "general-ledger", "expense-by-cost-center"].includes(slug) ? (
        <>
          <FilterSelect value={accountId} onChange={setAccountId} options={accountOptions} width="w-[200px]" ariaLabel="Account" />
          {slug !== "general-ledger" && slug !== "expense-by-cost-center" ? (
            <FilterSelect value={accountType} onChange={setAccountType} options={ACCOUNT_TYPES} width="w-[140px]" ariaLabel="Account type" />
          ) : null}
        </>
      ) : null}
      {slug === "general-ledger" ? (
        <FilterSelect value={sourceType} onChange={setSourceType} options={sourceOptions} width="w-[180px]" ariaLabel="Source" />
      ) : null}
      {slug === "cash-flow" ? (
        <FilterSelect
          value={paymentAccountId}
          onChange={setPaymentAccountId}
          options={[{ value: "all", label: "All payment accounts" }, ...paymentAccounts.map((a) => ({ value: a.id, label: a.name }))]}
          width="w-[200px]"
          ariaLabel="Payment account"
        />
      ) : null}
    </>
  );

  const summary = report ? <ReportSummary slug={slug} totals={totals} /> : null;

  if (isInvoicesAnalysis) {
    return (
      <InvoicesAnalysisDyn
        report={report}
        loading={loading}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        status={invoiceStatus}
        onStatusChange={setInvoiceStatus}
        onRefresh={() => {
          void load();
          apiHealth.recheck();
        }}
      />
    );
  }

  if (isBalanceSheet || isProfitLoss || isCashFlow || isTrialBalance || isGeneralLedger || isPartnerLedger || isAged || isAnalyticReport || isExecutiveSummary) {
    const statementKind = isAged
      ? (slug as "aged-receivable" | "aged-payable")
      : isAnalyticReport
        ? "analytic-report"
      : isExecutiveSummary
        ? "executive-summary"
      : isBalanceSheet
      ? "balance-sheet"
      : isProfitLoss
        ? "profit-loss"
        : isCashFlow
          ? "cash-flow"
          : isTrialBalance
            ? "trial-balance"
            : isGeneralLedger
              ? "general-ledger"
              : "partner-ledger";
    const statementTitle = isAged
      ? slug === "aged-receivable"
        ? "Aged Receivable"
        : "Aged Payable"
      : isAnalyticReport
        ? "Analytic Report"
      : isExecutiveSummary
        ? "Executive Summary"
      : isBalanceSheet
      ? "Balance Sheet"
      : isProfitLoss
        ? "Profit and Loss"
        : isCashFlow
          ? "Cash Flow Statement"
          : isTrialBalance
            ? "Trial Balance"
            : isGeneralLedger
              ? "General Ledger"
              : "Partner Ledger";
    return (
      <>
        <FinancialStatementDyn
          kind={statementKind}
          title={statementTitle}
          ledgerType={ledgerType}
          onLedgerTypeChange={setLedgerType}
          periodLength={periodLength}
          onPeriodLengthChange={setPeriodLength}
          basedOn={basedOn}
          onBasedOnChange={setBasedOn}
          onEntry={(id) => void openJournal(id)}
          focusAccountId={isGeneralLedger && accountId !== "all" ? accountId : undefined}
          report={report}
          loading={loading}
          warning={warning}
          dateTo={isBalanceSheet || isAged ? asOf : dateTo}
          onDateToChange={isBalanceSheet || isAged ? setAsOf : setDateTo}
          dateFrom={dateFrom}
          onDateFromChange={setDateFrom}
          comparison={comparison}
          onComparisonChange={setComparison}
          compareTo={compareDate || shiftYearIso(isBalanceSheet ? asOf : dateTo, -1)}
          onCompareToChange={setCompareDate}
          compareFrom={compareFrom || shiftYearIso(dateFrom, -1)}
          onCompareFromChange={setCompareFrom}
          onRefresh={() => {
            void load();
            apiHealth.recheck();
          }}
          onAccount={goLedger}
        />
        <JournalEntrySheet open={entryOpen} onOpenChange={setEntryOpen} entry={entry} loading={entryLoading} />
      </>
    );
  }

  return (
    <>
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
        <FinanceReportAgGridDyn
          ref={reportGridRef}
          storageKey={slug}
          rows={otherGrid?.rows ?? []}
          columns={otherGrid?.columns ?? []}
          loading={loading && !report}
          csvFileName={`${slug}-${dateFrom}-${dateTo}.csv`}
          csvHeaders={otherGrid?.csvHeaders ?? ["Line"]}
          csvRow={otherGrid?.csvRow ?? (() => [""])}
          emptyTitle="No rows for this period"
          onRowClicked={(row) => {
            if (slug === "trial-balance" && row.account_id) goLedger(String(row.account_id));
            if (slug === "general-ledger" && row.journal_entry_id) void openJournal(String(row.journal_entry_id));
            if (slug === "tax-summary" && row.source_type) {
              router.push(`/finance/journal?source_type=${encodeURIComponent(String(row.source_type))}`);
            }
          }}
          headerLeftActions={
            <ListGridHeaderStart title={meta.label}>
              <FinanceGridSettingsMenu
                apiHealth={apiHealth}
                loading={loading}
                onRefresh={() => {
                  void load();
                  apiHealth.recheck();
                }}
                onColumns={() => reportGridRef.current?.openColumns()}
                onExport={() => reportGridRef.current?.exportCsv()}
              />
            </ListGridHeaderStart>
          }
          filterBar={
            <>
              <DateRangePresetPicker
                value={{ dateFrom, dateTo }}
                onChange={(next) => {
                  setDateFrom(next.dateFrom);
                  setDateTo(next.dateTo);
                }}
                clearable={false}
              />
              {extraFilters}
            </>
          }
          summary={
            <>
              {warning ? (
                <div className="border-b border-border bg-muted/40 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-400">
                  Accounting integrity: {warning}
                </div>
              ) : null}
              {summary ? <div className="border-b border-border px-3 py-2">{summary}</div> : null}
            </>
          }
          footerLeftActions={
            <span className="px-2 text-[10px] text-muted-foreground">
              {loading ? "Loading…" : `${otherGrid?.rows.length ?? 0} lines`}
            </span>
          }
        />
      </div>
      <JournalEntrySheet open={entryOpen} onOpenChange={setEntryOpen} entry={entry} loading={entryLoading} />
    </>
  );
}

function ReportSummary({ slug, totals }: { slug: string; totals: Record<string, unknown> }) {
  if (slug === "trial-balance") {
    return (
      <div className="grid grid-cols-3 gap-2">
        <Kpi label="Total debit" value={money(totals.total_debit)} />
        <Kpi label="Total credit" value={money(totals.total_credit)} />
        <Kpi label="Difference" value={money(totals.difference)} warn={num(totals.difference) !== 0} />
      </div>
    );
  }
  if (slug === "profit-loss") {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Revenue" value={money(totals.revenue)} />
        <Kpi label="Gross profit" value={money(totals.gross_profit)} />
        <Kpi label="Operating expenses" value={money(totals.operating_expenses)} />
        <Kpi label="Net profit" value={money(totals.net_profit)} />
      </div>
    );
  }
  if (slug === "balance-sheet") {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Total assets" value={money(totals.total_assets)} />
        <Kpi label="Total liabilities" value={money(totals.total_liabilities)} />
        <Kpi label="Total equity (& earnings)" value={money(totals.total_equity)} />
        <Kpi label="Assets − (Liabilities + Equity)" value={money(totals.difference)} warn={num(totals.difference) !== 0} />
      </div>
    );
  }
  if (slug === "cash-flow") {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Opening" value={money(totals.opening)} />
        <Kpi label="Cash in" value={money(totals.cash_in)} />
        <Kpi label="Cash out" value={money(totals.cash_out)} />
        <Kpi label="Closing" value={money(totals.closing)} />
      </div>
    );
  }
  if (slug === "tax-summary") {
    return (
      <div className="grid grid-cols-3 gap-2">
        <Kpi label="Output tax" value={money(totals.output_tax_total)} />
        <Kpi label="Input tax" value={money(totals.input_tax_total)} />
        <Kpi label="Net tax payable" value={money(totals.net_tax_payable)} />
      </div>
    );
  }
  if (slug === "receivable-aging" || slug === "payable-aging") {
    return (
      <div className="grid grid-cols-3 gap-2">
        <Kpi label="Total" value={money(totals.amount)} />
        <Kpi label="Paid" value={money(totals.paid)} />
        <Kpi label="Outstanding" value={money(totals.outstanding)} />
      </div>
    );
  }
  if (slug === "aged-receivable" || slug === "aged-payable") {
    const buckets = (totals.buckets ?? {}) as Record<string, unknown>;
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Total outstanding" value={money(totals.total)} />
        <Kpi label="Not due (At Date)" value={money(totals.not_due)} />
        <Kpi label="Overdue" value={money(totals.overdue)} warn={num(totals.overdue) > 0} />
        <Kpi label="Older" value={money(buckets.older)} warn={num(buckets.older) > 0} />
      </div>
    );
  }
  if (slug === "expense-by-cost-center") {
    return (
      <div className="grid grid-cols-3 gap-2">
        <Kpi label="Debit" value={money(totals.total_debit)} />
        <Kpi label="Credit" value={money(totals.total_credit)} />
        <Kpi label="Net" value={money(totals.net)} />
      </div>
    );
  }
  return null;
}

function Kpi({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="border border-border bg-background px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-sm font-semibold tabular-nums", warn && "text-amber-700 dark:text-amber-400")}>{value}</p>
    </div>
  );
}

function TrialBalanceTable({
  rows,
  totals,
  onAccount,
}: {
  rows: Record<string, unknown>[];
  totals: Record<string, unknown>;
  onAccount: (id: string) => void;
}) {
  return (
    <ReportTable columns={["Code", "Account", "Type", "Debit", "Credit", "Net"]}>
      {rows.length === 0 ? (
        <EmptyRow cols={6} />
      ) : (
        rows.map((row) => (
          <tr
            key={str(row.account_id)}
            className="cursor-pointer border-b border-border/60 hover:bg-muted/30"
            onClick={() => row.account_id && onAccount(str(row.account_id))}
          >
            <td className="px-3 py-2 font-medium">{str(row.account_code)}</td>
            <td className="px-3 py-2">{str(row.account_name)}</td>
            <td className="px-3 py-2 capitalize text-muted-foreground">{str(row.account_type)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{money(row.debit)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{money(row.credit)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{money(row.net)}</td>
          </tr>
        ))
      )}
      <tr className="border-t border-border bg-muted/40 font-medium">
        <td className="px-3 py-2" colSpan={3}>
          Totals
        </td>
        <td className="px-3 py-2 text-right tabular-nums">{money(totals.total_debit)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{money(totals.total_credit)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{money(totals.difference)}</td>
      </tr>
    </ReportTable>
  );
}

function SectionAmountTable({
  rows,
  onAccount,
}: {
  rows: Record<string, unknown>[];
  onAccount: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      {rows.map((section) => {
        const inner = Array.isArray(section.rows) ? (section.rows as Record<string, unknown>[]) : [];
        const label = str(section.label || section.section);
        return (
          <div key={label}>
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</h2>
            <ReportTable columns={["Code", "Account", "Amount"]}>
              {inner.length === 0 ? (
                <EmptyRow cols={3} />
              ) : (
                inner.map((row) => (
                  <tr
                    key={`${str(row.account_code)}-${str(row.account_name)}`}
                    className={cn(row.account_id ? "cursor-pointer hover:bg-muted/30" : "", "border-b border-border/60")}
                    onClick={() => row.account_id && onAccount(str(row.account_id))}
                  >
                    <td className="px-3 py-2 font-medium">{str(row.account_code)}</td>
                    <td className="px-3 py-2">{str(row.account_name)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(row.amount)}</td>
                  </tr>
                ))
              )}
            </ReportTable>
          </div>
        );
      })}
    </div>
  );
}

function CashFlowTable({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <ReportTable columns={["Line", "Amount"]}>
      {rows.map((row) => (
        <tr key={str(row.kind)} className="border-b border-border/60 last:border-b-0">
          <td className="px-3 py-2">{str(row.label)}</td>
          <td className="px-3 py-2 text-right tabular-nums">{money(row.amount)}</td>
        </tr>
      ))}
    </ReportTable>
  );
}

function GeneralLedgerTable({
  rows,
  onOpen,
}: {
  rows: Record<string, unknown>[];
  onOpen: (id: string) => void;
}) {
  return (
    <ReportTable columns={["Date", "Entry", "Account", "Description", "Source", "Debit", "Credit", "Balance"]}>
      {rows.length === 0 ? (
        <EmptyRow cols={8} />
      ) : (
        rows.map((row, idx) => (
          <tr
            key={`${str(row.journal_entry_id)}-${idx}`}
            className={cn(
              "border-b border-border/60",
              row.journal_entry_id ? "cursor-pointer hover:bg-muted/30" : "text-muted-foreground",
            )}
            onClick={() => row.journal_entry_id && onOpen(str(row.journal_entry_id))}
          >
            <td className="px-3 py-2">{str(row.date)}</td>
            <td className="px-3 py-2 font-medium">{str(row.entry_number)}</td>
            <td className="px-3 py-2">
              {str(row.account_code)} {str(row.account_name)}
            </td>
            <td className="px-3 py-2">{str(row.description)}</td>
            <td className="px-3 py-2 text-muted-foreground">{str(row.source_label || row.source_type)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{num(row.debit) ? money(row.debit) : ""}</td>
            <td className="px-3 py-2 text-right tabular-nums">{num(row.credit) ? money(row.credit) : ""}</td>
            <td className="px-3 py-2 text-right tabular-nums">{money(row.running_balance)}</td>
          </tr>
        ))
      )}
    </ReportTable>
  );
}

function AgingTable({
  kind,
  rows,
}: {
  kind: "ar" | "ap";
  rows: Record<string, unknown>[];
  onRetry?: (sourceType: string, sourceId: string) => void;
}) {
  const href = kind === "ar" ? "/finance/receivables" : "/finance/payables";
  return (
    <ReportTable
      columns={[
        kind === "ar" ? "Customer" : "Supplier",
        kind === "ar" ? "Invoice" : "Reference",
        kind === "ar" ? "Invoice date" : "Bill date",
        "Due date",
        "Total",
        "Paid",
        "Outstanding",
        "Bucket",
      ]}
    >
      {rows.length === 0 ? (
        <EmptyRow cols={8} />
      ) : (
        rows.map((row) => (
          <tr key={str(row.id)} className="border-b border-border/60 hover:bg-muted/30">
            <td className="px-3 py-2">
              <a href={href} className="hover:underline">
                {str(row.customer_name || row.supplier_name)}
              </a>
            </td>
            <td className="px-3 py-2 font-medium">{str(row.invoice_number || row.reference_number)}</td>
            <td className="px-3 py-2 text-muted-foreground">{str(row.invoice_date || row.bill_date)}</td>
            <td className="px-3 py-2 text-muted-foreground">{str(row.due_date)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{money(row.amount)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{money(row.amount_paid)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{money(row.outstanding)}</td>
            <td className="px-3 py-2">{str(row.aging_label)}</td>
          </tr>
        ))
      )}
    </ReportTable>
  );
}

function TaxTable({
  rows,
  onSource,
}: {
  rows: Record<string, unknown>[];
  onSource: (sourceType: string) => void;
}) {
  return (
    <div className="space-y-4">
      {rows.map((row) => {
        const sources = Array.isArray(row.sources) ? (row.sources as Record<string, unknown>[]) : [];
        return (
          <div key={str(row.kind)}>
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {str(row.kind).replace(/_/g, " ")} · {str(row.account_code)} · {money(row.amount)}
            </h2>
            <ReportTable columns={["Source", "Amount"]}>
              {sources.length === 0 ? (
                <EmptyRow cols={2} />
              ) : (
                sources.map((source) => (
                  <tr
                    key={str(source.source_type)}
                    className="cursor-pointer border-b border-border/60 hover:bg-muted/30"
                    onClick={() => onSource(str(source.source_type))}
                  >
                    <td className="px-3 py-2">{str(source.source_label || source.source_type)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(source.amount)}</td>
                  </tr>
                ))
              )}
            </ReportTable>
          </div>
        );
      })}
    </div>
  );
}

function ExpenseByCostCenterTable({
  rows,
  totals,
}: {
  rows: Record<string, unknown>[];
  totals: Record<string, unknown>;
}) {
  return (
    <ReportTable columns={["Concern", "Account", "Debit", "Credit", "Net"]}>
      {rows.length === 0 ? (
        <EmptyRow cols={5} />
      ) : (
        rows.map((row, index) => (
          <tr key={`${str(row.cost_center_id)}-${str(row.account_id)}-${index}`} className="border-b border-border/60 hover:bg-muted/30">
            <td className="px-3 py-2">
              <span className="font-mono text-[11px] text-muted-foreground">{str(row.cost_center_code) || "—"}</span>{" "}
              {str(row.cost_center_name)}
            </td>
            <td className="px-3 py-2">
              {str(row.account_code)} {str(row.account_name)}
            </td>
            <td className="px-3 py-2 text-right tabular-nums">{money(row.debit)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{money(row.credit)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{money(row.net)}</td>
          </tr>
        ))
      )}
      <tr className="border-t border-border bg-muted/40 font-medium">
        <td className="px-3 py-2" colSpan={2}>
          Totals
        </td>
        <td className="px-3 py-2 text-right tabular-nums">{money(totals.total_debit)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{money(totals.total_credit)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{money(totals.net)}</td>
      </tr>
    </ReportTable>
  );
}

function EmptyRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className="px-3 py-10 text-center text-muted-foreground">
        No rows for this period.
      </td>
    </tr>
  );
}
