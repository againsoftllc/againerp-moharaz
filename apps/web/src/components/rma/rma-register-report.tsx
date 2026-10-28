"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ICellRendererParams } from "ag-grid-community";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterSelect } from "@/components/shared/filter-select";
import { DateRangePresetPicker } from "@/components/shared/date-range-preset-picker";
import { GridChipBadge } from "@/components/shared/grid-chip-badge";
import { GridRefLink } from "@/components/shared/grid-ref-link";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import {
  FinanceAgListGrid,
  NUMERIC_CELL,
  NUMERIC_HEADER,
  type FinanceAgListGridColumn,
  type FinanceAgListGridHandle,
} from "@/components/finance/finance-ag-list-grid";
import { FinanceGridSettingsMenu } from "@/components/finance/finance-grid-settings";
import { RmaDetailDrawer } from "@/components/rma/rma-detail-drawer";
import {
  fetchRmaAnalysis,
  fetchRmaRegister,
  RMA_REGISTER_LABEL,
  RMA_STATUS_LABEL,
  warrantyDaysText,
  type RmaAnalysisRow,
  type RmaRegisterKind,
  type RmaRegisterRow,
  type RmaRegisterTotals,
} from "@/lib/api/rma";
import { useApiHealth } from "@/lib/api/use-api-health";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

/** "summary" is the older count overview; the four registers are OnerERP's Reports › RMA. */
export type RmaReportId = RmaRegisterKind | "summary";

export const RMA_REPORT_OPTIONS: { value: RmaReportId; label: string }[] = [
  { value: "complain", label: RMA_REGISTER_LABEL.complain },
  { value: "claim", label: RMA_REGISTER_LABEL.claim },
  { value: "receive", label: RMA_REGISTER_LABEL.receive },
  { value: "delivery", label: RMA_REGISTER_LABEL.delivery },
  { value: "summary", label: "Summary" },
];

const HINT: Record<RmaRegisterKind, string> = {
  complain: "Every complaint received in the period: sale type, invoice, warranty left, problem, engineer and charges.",
  claim: "Every replacement claim sent to a supplier (by dispatch date, else the day it was made).",
  receive: "Everything the suppliers sent back: same unit, new serial, another product or cash back.",
  delivery: "Every customer delivery: what was handed over, charges, collected now and cash back.",
};

const DOC_STATUSES = ["draft", "pending_approval", "correction_requested", "approved", "rejected", "cancelled"];
const DOC_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  correction_requested: "Needs correction",
  approved: "Approved",
  dispatched: "Dispatched",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

function statusOptions(kind: RmaRegisterKind) {
  if (kind === "complain") return Object.entries(RMA_STATUS_LABEL).map(([value, label]) => ({ value, label }));
  const values = kind === "claim" ? [...DOC_STATUSES.slice(0, 4), "dispatched", ...DOC_STATUSES.slice(4)] : DOC_STATUSES;
  return values.map((value) => ({ value, label: DOC_STATUS_LABEL[value] }));
}

const num = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const dash = (p: { value: unknown }) => (p.value == null || p.value === "" ? "—" : String(p.value));

const moneyCol = {
  type: "numericColumn" as const,
  headerClass: NUMERIC_HEADER,
  cellClass: `${NUMERIC_CELL} font-medium`,
  valueFormatter: (p: { value: unknown }) => formatCurrency(num(p.value)),
};
const countCol = { type: "numericColumn" as const, headerClass: NUMERIC_HEADER, cellClass: NUMERIC_CELL };

const STATUS_TONE: Record<string, string> = {
  approved: "text-emerald-700 dark:text-emerald-400",
  dispatched: "text-emerald-700 dark:text-emerald-400",
  closed: "text-muted-foreground",
  delivered: "text-emerald-700 dark:text-emerald-400",
  pending_approval: "text-amber-700 dark:text-amber-400",
  correction_requested: "text-amber-700 dark:text-amber-400",
  draft: "text-muted-foreground",
  rejected: "text-red-600 dark:text-red-400",
  cancelled: "text-muted-foreground",
};

type Row = RmaRegisterRow;
type AnalysisRow = RmaAnalysisRow & { id: string };

function registerColumns(kind: RmaRegisterKind, openRma: (id: string | null) => void): FinanceAgListGridColumn<Row>[] {
  const docCol: FinanceAgListGridColumn<Row> = {
    colId: "doc",
    field: "doc_number",
    headerName: kind === "complain" ? "RMA #" : kind === "claim" ? "Claim #" : kind === "receive" ? "Receive #" : "Delivery #",
    width: 135,
    cellRenderer: (p: ICellRendererParams<Row>) =>
      p.data ? (
        <GridRefLink className="font-medium" title={p.data.doc_number} onClick={() => openRma(p.data!.rma_id)}>
          {p.data.doc_number}
        </GridRefLink>
      ) : null,
  };
  const dateCol: FinanceAgListGridColumn<Row> = { colId: "date", field: "doc_date", headerName: "Date", width: 105, valueFormatter: (p) => formatDate(String(p.value ?? "")) };
  const statusCol: FinanceAgListGridColumn<Row> = {
    colId: "status",
    field: "status_label",
    headerName: "Status",
    width: 135,
    cellRenderer: (p: ICellRendererParams<Row>) =>
      p.data ? (
        <GridChipBadge title={p.data.status_label}>
          <span className={cn("font-medium", STATUS_TONE[p.data.status])}>{p.data.status_label}</span>
        </GridChipBadge>
      ) : null,
  };
  const rmaCol: FinanceAgListGridColumn<Row> = {
    colId: "rma",
    field: "rma_number",
    headerName: "RMA #",
    width: 130,
    cellRenderer: (p: ICellRendererParams<Row>) =>
      p.data?.rma_number ? (
        <GridRefLink title={p.data.rma_number} onClick={() => openRma(p.data!.rma_id)}>
          {p.data.rma_number}
        </GridRefLink>
      ) : (
        "—"
      ),
  };
  const product: FinanceAgListGridColumn<Row>[] = [
    { colId: "product", field: "product_name", headerName: "Product", flex: 1.2, minWidth: 150, valueFormatter: dash },
    { colId: "sku", field: "sku", headerName: "SKU", width: 120, hide: true, valueFormatter: dash },
    { colId: "serial", field: "serial_number", headerName: "Serial", width: 130, valueFormatter: dash },
  ];
  const customer: FinanceAgListGridColumn<Row>[] = [
    { colId: "customer", field: "customer_name", headerName: "Customer", flex: 1, minWidth: 140, valueFormatter: dash },
    { colId: "phone", field: "customer_phone", headerName: "Phone", width: 120, hide: true, valueFormatter: dash },
  ];
  const supplier: FinanceAgListGridColumn<Row> = { colId: "supplier", field: "supplier_name", headerName: "Supplier", flex: 1, minWidth: 140, valueFormatter: dash };

  if (kind === "complain") {
    return [
      docCol,
      dateCol,
      ...customer,
      ...product,
      { colId: "sale", field: "sale_source_label", headerName: "Sale type", width: 115, valueFormatter: dash },
      { colId: "invoice", field: "invoice_no", headerName: "Invoice", width: 125, valueFormatter: dash },
      { colId: "warranty", field: "warranty_label", headerName: "Warranty", width: 120, valueFormatter: dash },
      {
        colId: "left",
        field: "warranty_days_left",
        headerName: "Warranty left",
        width: 150,
        cellRenderer: (p: ICellRendererParams<Row>) => {
          const days = p.data?.warranty_days_left;
          const text = warrantyDaysText(days);
          return text ? <span className={cn(days != null && days < 0 && "text-red-600 dark:text-red-400")}>{text}</span> : "—";
        },
      },
      { colId: "problem", field: "problem", headerName: "Problem", flex: 1, minWidth: 150, valueFormatter: dash },
      { colId: "engineer", field: "engineer", headerName: "Engineer", width: 130, valueFormatter: dash },
      { colId: "promised", field: "promised_date", headerName: "Promised", width: 105, hide: true, valueFormatter: (p) => formatDate(String(p.value ?? "")) },
      { ...supplier, hide: true },
      statusCol,
      { colId: "amount", field: "amount", headerName: "Charges", width: 115, ...moneyCol },
    ];
  }
  if (kind === "claim") {
    return [
      docCol,
      dateCol,
      supplier,
      rmaCol,
      ...product,
      { colId: "invoice", field: "invoice_no", headerName: "Purchase invoice", width: 135, hide: true, valueFormatter: dash },
      { colId: "problem", field: "problem", headerName: "Problem", flex: 1, minWidth: 150, valueFormatter: dash },
      { colId: "expected", field: "expected_return_date", headerName: "Expected back", width: 120, valueFormatter: (p) => formatDate(String(p.value ?? "")) },
      { ...customer[0], hide: true },
      statusCol,
    ];
  }
  if (kind === "receive") {
    return [
      docCol,
      dateCol,
      supplier,
      { colId: "claim", field: "claim_number", headerName: "Claim #", width: 125, valueFormatter: dash },
      rmaCol,
      ...product,
      { colId: "type", field: "outcome_label", headerName: "Receive type", width: 200, valueFormatter: dash },
      { colId: "new_serial", field: "new_serial", headerName: "New serial", width: 130, valueFormatter: dash },
      { colId: "new_product", field: "new_product", headerName: "New product", width: 150, hide: true, valueFormatter: dash },
      statusCol,
      { colId: "refund", field: "refund", headerName: "Cash back", width: 115, ...moneyCol },
    ];
  }
  return [
    docCol,
    dateCol,
    ...customer,
    rmaCol,
    ...product,
    { colId: "type", field: "outcome_label", headerName: "Delivery type", width: 200, valueFormatter: dash },
    { colId: "new_serial", field: "new_serial", headerName: "Serial handed over", width: 145, valueFormatter: dash },
    { colId: "new_product", field: "new_product", headerName: "Product handed over", width: 150, hide: true, valueFormatter: dash },
    statusCol,
    { colId: "amount", field: "amount", headerName: "Charges", width: 110, ...moneyCol },
    { colId: "collected", field: "collected", headerName: "Collected", width: 110, ...moneyCol },
    { colId: "refund", field: "refund", headerName: "Cash back", width: 110, ...moneyCol },
  ];
}

function registerCsv(kind: RmaRegisterKind): [string[], (r: Row) => Array<string | number>] {
  if (kind === "complain") {
    return [
      ["RMA #", "Date", "Customer", "Phone", "Product", "SKU", "Serial", "Sale type", "Invoice", "Warranty", "Warranty days left", "Problem", "Engineer", "Promised", "Supplier", "Status", "Charges"],
      (r) => [r.doc_number, r.doc_date ?? "", r.customer_name, r.customer_phone, r.product_name, r.sku, r.serial_number, r.sale_source_label ?? "", r.invoice_no, r.warranty_label ?? "", r.warranty_days_left ?? "", r.problem, r.engineer, r.promised_date ?? "", r.supplier_name, r.status_label, num(r.amount)],
    ];
  }
  if (kind === "claim") {
    return [
      ["Claim #", "Date", "Supplier", "RMA #", "Product", "SKU", "Serial", "Purchase invoice", "Problem", "Expected back", "Customer", "Status"],
      (r) => [r.doc_number, r.doc_date ?? "", r.supplier_name, r.rma_number, r.product_name, r.sku, r.serial_number, r.invoice_no, r.problem, r.expected_return_date ?? "", r.customer_name, r.status_label],
    ];
  }
  if (kind === "receive") {
    return [
      ["Receive #", "Date", "Supplier", "Claim #", "RMA #", "Product", "Serial sent", "Receive type", "New serial", "New product", "Status", "Cash back"],
      (r) => [r.doc_number, r.doc_date ?? "", r.supplier_name, r.claim_number, r.rma_number, r.product_name, r.serial_number, r.outcome_label ?? "", r.new_serial, r.new_product, r.status_label, num(r.refund)],
    ];
  }
  return [
    ["Delivery #", "Date", "Customer", "Phone", "RMA #", "Product", "Serial", "Delivery type", "Serial handed over", "Product handed over", "Status", "Charges", "Collected", "Cash back"],
    (r) => [r.doc_number, r.doc_date ?? "", r.customer_name, r.customer_phone, r.rma_number, r.product_name, r.serial_number, r.outcome_label ?? "", r.new_serial, r.new_product, r.status_label, num(r.amount), num(r.collected), num(r.refund)],
  ];
}

function analysisColumns(kind: RmaRegisterKind, groupLabel: string): FinanceAgListGridColumn<AnalysisRow>[] {
  const cols: FinanceAgListGridColumn<AnalysisRow>[] = [
    { colId: "label", field: "label", headerName: groupLabel, flex: 1.4, minWidth: 180, cellClass: "font-medium" },
    { colId: "count", field: "count", headerName: "Documents", width: 110, ...countCol },
    { colId: "open", field: "open", headerName: "Open", width: 90, ...countCol },
    { colId: "done", field: "done", headerName: "Done", width: 90, ...countCol },
  ];
  if (kind === "complain" || kind === "delivery") cols.push({ colId: "amount", field: "amount", headerName: "Charges", width: 120, ...moneyCol });
  if (kind === "delivery") cols.push({ colId: "collected", field: "collected", headerName: "Collected", width: 120, ...moneyCol });
  if (kind !== "claim") cols.push({ colId: "refund", field: "refund", headerName: "Cash back", width: 120, ...moneyCol });
  return cols;
}

export function RmaRegisterReport({ kind, onReportChange }: { kind: RmaRegisterKind; onReportChange: (next: RmaReportId) => void }) {
  const [mode, setMode] = useState<"register" | "analysis">("register");
  const [groupBy, setGroupBy] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisRow[]>([]);
  const [totals, setTotals] = useState<RmaRegisterTotals | null>(null);
  const [groupOptions, setGroupOptions] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const gridRef = useRef<FinanceAgListGridHandle>(null);
  const apiHealth = useApiHealth();

  // a new register starts clean: its statuses and group-by fields are its own
  useEffect(() => {
    setStatus("");
    setGroupBy("");
    setRows([]);
    setAnalysis([]);
  }, [kind]);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(search), 300);
    return () => window.clearTimeout(id);
  }, [search]);

  const effectiveGroup = groupBy || Object.keys(groupOptions)[0] || (kind === "complain" ? "product" : kind === "claim" ? "supplier" : kind === "receive" ? "supplier" : "outcome");

  const load = useCallback(async () => {
    setLoading(true);
    const query = { dateFrom, dateTo, status, search: debounced };
    try {
      if (mode === "analysis") {
        const res = await fetchRmaAnalysis(kind, effectiveGroup, query);
        setAnalysis(res.data.map((row) => ({ ...row, id: row.key || "_none" })));
        setTotals(res.totals);
        setGroupOptions(res.group_options);
      } else {
        const res = await fetchRmaRegister(kind, query);
        setRows(res.data);
        setTotals(res.totals);
        setGroupOptions(res.group_options);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load the RMA report");
      setRows([]);
      setAnalysis([]);
      setTotals(null);
    } finally {
      setLoading(false);
    }
  }, [kind, mode, effectiveGroup, dateFrom, dateTo, status, debounced]);

  useEffect(() => {
    void load();
  }, [load]);

  const openRma = useCallback((id: string | null) => {
    if (id) setOpenId(id);
    else toast.message("This document has no RMA to open.");
  }, []);

  const columns = useMemo(
    () =>
      mode === "analysis"
        ? (analysisColumns(kind, groupOptions[effectiveGroup] ?? "Group") as FinanceAgListGridColumn[])
        : (registerColumns(kind, openRma) as FinanceAgListGridColumn[]),
    [mode, kind, groupOptions, effectiveGroup, openRma],
  );
  const csv = useMemo(() => registerCsv(kind), [kind]);
  const filterCount = Number(Boolean(dateFrom || dateTo)) + Number(Boolean(status)) + Number(Boolean(search.trim()));
  const resetFilters = () => {
    setDateFrom("");
    setDateTo("");
    setStatus("");
    setSearch("");
  };

  const showMoney = kind === "complain" || kind === "delivery";
  const summary = (
    <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-border px-3 py-2 text-xs">
      <span className="text-muted-foreground">{HINT[kind]}</span>
      <span>
        Documents <b className="tabular-nums">{totals?.count ?? 0}</b>
      </span>
      {showMoney ? <span>Charges {formatCurrency(num(totals?.amount))}</span> : null}
      {kind === "delivery" ? <span>Collected {formatCurrency(num(totals?.collected))}</span> : null}
      {kind !== "claim" ? <span>Cash back {formatCurrency(num(totals?.refund))}</span> : null}
    </div>
  );

  const title = `${RMA_REGISTER_LABEL[kind]}${mode === "analysis" ? " analysis" : ""}`;

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <FinanceAgListGrid
        gridRef={gridRef}
        className="min-h-0 flex-1"
        storageKey={`rma-register:${kind}:${mode}`}
        rows={mode === "analysis" ? analysis : rows}
        columns={columns}
        loading={loading}
        summary={summary}
        emptyTitle={filterCount > 0 ? `No ${RMA_REGISTER_LABEL[kind].toLowerCase()} documents match your filters` : `No ${RMA_REGISTER_LABEL[kind].toLowerCase()} documents yet`}
        emptyHint={filterCount > 0 ? undefined : "They appear here as soon as they are saved on an RMA."}
        onResetFilters={resetFilters}
        onRowClicked={mode === "analysis" ? undefined : (row: Row) => openRma(row.rma_id)}
        csvFileName={`rma-${kind}-${mode}.csv`}
        csvHeaders={mode === "analysis" ? [groupOptions[effectiveGroup] ?? "Group", "Documents", "Open", "Done", "Charges", "Collected", "Cash back"] : csv[0]}
        csvRow={
          mode === "analysis"
            ? (r: AnalysisRow) => [r.label, r.count, r.open, r.done, num(r.amount), num(r.collected), num(r.refund)]
            : csv[1]
        }
        mobileLine={
          mode === "analysis"
            ? (r: AnalysisRow) => ({ title: r.label, meta: `${r.open} open · ${r.done} done`, value: String(r.count) })
            : (r: Row) => ({
                title: `${r.doc_number} · ${r.product_name || r.sku || "—"}`,
                meta: `${formatDate(r.doc_date ?? "")} · ${r.customer_name || r.supplier_name || "—"} · ${r.status_label}`,
                value: showMoney ? formatCurrency(num(r.amount)) : r.outcome_label ?? "",
              })
        }
        headerLeftActions={
          <ListGridHeaderStart title={title}>
            <FinanceGridSettingsMenu
              apiHealth={apiHealth}
              loading={loading}
              filterCount={filterCount}
              onRefresh={() => void load()}
              onFilters={() => gridRef.current?.openFilters()}
              onColumns={() => gridRef.current?.openColumns()}
              onExport={() => gridRef.current?.exportCsv()}
              onResetFilters={resetFilters}
            />
          </ListGridHeaderStart>
        }
        filterBar={
          <>
            <FilterSelect
              value={kind}
              onChange={(next) => onReportChange((next || "complain") as RmaReportId)}
              width="w-[180px]"
              className="shrink-0"
              ariaLabel="Report"
              options={RMA_REPORT_OPTIONS}
            />
            <FilterSelect
              value={mode}
              onChange={(next) => setMode(next === "analysis" ? "analysis" : "register")}
              width="w-[120px]"
              className="shrink-0"
              ariaLabel="View"
              options={[
                { value: "register", label: "Register" },
                { value: "analysis", label: "Analysis" },
              ]}
            />
            {mode === "analysis" ? (
              <FilterSelect
                value={effectiveGroup}
                onChange={(next) => setGroupBy(next || "")}
                width="w-[150px]"
                className="shrink-0"
                ariaLabel="Group by"
                options={Object.entries(groupOptions).map(([value, label]) => ({ value, label: `By ${label.toLowerCase()}` }))}
              />
            ) : null}
            <DateRangePresetPicker
              value={{ dateFrom, dateTo }}
              onChange={(next) => {
                setDateFrom(next.dateFrom);
                setDateTo(next.dateTo);
              }}
              buttonClassName="shrink-0"
            />
            <FilterSelect
              value={status}
              onChange={(next) => setStatus(next || "")}
              width="w-[150px]"
              className="shrink-0"
              ariaLabel="Status"
              options={[{ value: "", label: "All statuses" }, ...statusOptions(kind)]}
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search no., customer, supplier, product, serial…"
              className="h-7 w-[240px] shrink-0 rounded-none text-xs"
            />
            {filterCount > 0 ? (
              <Button variant="ghost" size="sm" className="h-7 shrink-0 rounded-none px-2 text-xs" onClick={resetFilters}>
                Clear
              </Button>
            ) : null}
          </>
        }
      />
      <RmaDetailDrawer ticketId={openId} onClose={() => setOpenId(null)} onChanged={() => void load()} />
    </div>
  );
}
