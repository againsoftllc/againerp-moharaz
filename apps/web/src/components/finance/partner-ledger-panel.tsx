"use client";

import "@/components/providers/ag-grid-provider";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { Banknote, FilePlus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateRangePresetPicker } from "@/components/shared/date-range-preset-picker";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FilterSelect } from "@/components/shared/filter-select";
import { GridChipBadge } from "@/components/shared/grid-chip-badge";
import { GridRefLink } from "@/components/shared/grid-ref-link";
import { AgainListGrid } from "@/components/shared/again-list-grid";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { fetchCustomerLedger } from "@/lib/api/customer-ledger";
import { fetchSupplierLedger } from "@/lib/api/supplier-ledger";
import { fetchPartyCommerceLinks } from "@/lib/api/party-commerce";
import { fetchPartnerTrading } from "@/lib/api/partner-trading";
import { apiSalesOrderToOrder, fetchSalesOrder, persistSalesOrder } from "@/lib/api/sales";
import { fetchPurchaseOrder, type ApiPurchaseOrder } from "@/lib/api/purchase-orders";
import { fetchPurchaseReceipt } from "@/lib/api/purchase-receipts";
import { fetchSalesReturn, apiReturnToSalesReturn } from "@/lib/api/sales-returns";
import { fetchPurchaseReturn, apiReturnToPurchaseReturn } from "@/lib/api/purchase-returns";
import type { SalesReturn } from "@/lib/sales/sales-returns";
import type { PurchaseReturn } from "@/lib/mock-data/purchase-returns";
import {
  CustomerRaiseInvoiceDrawer,
  CustomerRecordPaymentDrawer,
} from "@/components/customers/customer-ledger-drawers";
import { RecordPaymentDrawer } from "@/components/suppliers/record-payment-drawer";
import { LedgerExportMenu } from "@/components/finance/ledger-export-menu";
import {
  statementPeriodLabel,
  type LedgerStatement,
} from "@/lib/finance/ledger-statement";
import {
  balanceSide,
  buildPartnerLedger,
  emptyPartnerTotals,
  formatLedgerMoney,
  moneyOrDash,
  type PartnerJournal,
  type PartnerLedgerLine,
  type PartnerLedgerTotals,
} from "@/lib/finance/partner-ledger";
import type { Order } from "@/lib/mock-data/orders";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";

const SalesOrderFormDrawer = dynamic(
  () =>
    import("@/components/sales/sales-order-form-drawer").then((m) => m.SalesOrderFormDrawer),
  { ssr: false },
);
const PoFormDrawer = dynamic(
  () => import("@/components/suppliers/po-form-drawer").then((m) => m.PoFormDrawer),
  { ssr: false },
);
const SalesReturnDrawer = dynamic(
  () => import("@/components/sales/sales-return-drawer").then((m) => m.SalesReturnDrawer),
  { ssr: false },
);
const ReturnDrawer = dynamic(
  () => import("@/components/purchase/return-drawer").then((m) => m.ReturnDrawer),
  { ssr: false },
);
const InvoiceDetailDrawer = dynamic(
  () => import("@/components/crm/invoice-detail-drawer").then((m) => m.InvoiceDetailDrawer),
  { ssr: false },
);

const NUMERIC_CELL = "ag-right-aligned-cell tabular-nums";
const NUMERIC_HEADER = "ag-right-aligned-header";

const JOURNAL_TONE: Record<PartnerJournal, string> = {
  receivable: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  payable: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

const DOCUMENT_TONE: Record<string, string> = {
  invoice: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  receipt: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  bill: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  payment: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  writeoff: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  refund: "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400",
  sales_return: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  purchase_return: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
};

const MATCHING_TONE: Record<string, string> = {
  paid: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  open: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  partial: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  cancelled: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

const DEFAULT_FILTERS = {
  search: "",
  journal: "all",
  document: "all",
  matching: "all",
  location: "all",
  dateFrom: "",
  dateTo: "",
};

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "danger" | "muted" | "credit";
}) {
  return (
    <div className="border-r border-border px-3 py-2 last:border-r-0">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-sm font-semibold tabular-nums",
          tone === "danger" && "text-red-600 dark:text-red-400",
          tone === "muted" && "text-muted-foreground",
          tone === "credit" && "text-emerald-600 dark:text-emerald-400",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function money(value: string | number | null | undefined): number {
  const x = Number(value ?? 0);
  return Number.isFinite(x) ? x : 0;
}

export function PartnerLedgerPanel({
  partyId,
  customerId,
  supplierId,
  partyName,
  partyPhone,
  partyEmail,
  fillHeight,
  readOnly,
}: {
  partyId?: string;
  customerId?: string;
  supplierId?: string;
  partyName?: string;
  partyPhone?: string;
  partyEmail?: string;
  fillHeight?: boolean;
  readOnly?: boolean;
}) {
  const canWrite = useAdminCanWrite() && !readOnly;
  const [rows, setRows] = useState<PartnerLedgerLine[]>([]);
  const [totals, setTotals] = useState<PartnerLedgerTotals>(emptyPartnerTotals);
  const [trading, setTrading] = useState({
    purchaseTotal: 0,
    salesTotal: 0,
    purchaseProfit: 0,
    salesProfit: 0,
  });
  const [resolvedCustomerId, setResolvedCustomerId] = useState(customerId?.trim() || "");
  const [resolvedSupplierId, setResolvedSupplierId] = useState(supplierId?.trim() || "");
  const [loading, setLoading] = useState(true);
  const [customerPayOpen, setCustomerPayOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [supplierPayOpen, setSupplierPayOpen] = useState(false);
  const [salesOrder, setSalesOrder] = useState<Order | null>(null);
  const [poOrder, setPoOrder] = useState<ApiPurchaseOrder | null>(null);
  const [invoiceViewId, setInvoiceViewId] = useState<string | null>(null);
  const [detailRow, setDetailRow] = useState<PartnerLedgerLine | null>(null);
  const [salesReturnRecord, setSalesReturnRecord] = useState<SalesReturn | null>(null);
  const [purchaseReturnRecord, setPurchaseReturnRecord] = useState<PurchaseReturn | null>(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let nextCustomerId = customerId?.trim() || "";
      let nextSupplierId = supplierId?.trim() || "";
      const pid = partyId?.trim() || "";
      if (pid) {
        try {
          const links = await fetchPartyCommerceLinks(pid);
          nextCustomerId = links.customer?.id || nextCustomerId;
          nextSupplierId = links.supplier?.id || nextSupplierId;
        } catch {
          /* keep ids from the current drawer */
        }
      }
      setResolvedCustomerId(nextCustomerId);
      setResolvedSupplierId(nextSupplierId);

      const [customer, supplier, tradingRes] = await Promise.all([
        nextCustomerId
          ? fetchCustomerLedger(nextCustomerId).catch(() => null)
          : Promise.resolve(null),
        nextSupplierId
          ? fetchSupplierLedger(nextSupplierId).catch(() => null)
          : Promise.resolve(null),
        nextCustomerId || nextSupplierId
          ? fetchPartnerTrading({
              customerId: nextCustomerId || undefined,
              supplierId: nextSupplierId || undefined,
            }).catch(() => null)
          : Promise.resolve(null),
      ]);
      const built = buildPartnerLedger({ customer, supplier });
      setRows(built.rows);
      setTotals(built.totals);
      setTrading({
        purchaseTotal: money(tradingRes?.purchase_total),
        salesTotal: money(tradingRes?.sales_total),
        purchaseProfit: money(tradingRes?.purchase_profit),
        salesProfit: money(tradingRes?.sales_profit),
      });
    } catch {
      setRows([]);
      setTotals(emptyPartnerTotals());
      setTrading({ purchaseTotal: 0, salesTotal: 0, purchaseProfit: 0, salesProfit: 0 });
    } finally {
      setLoading(false);
    }
  }, [partyId, customerId, supplierId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filters.journal !== "all" && row.journal !== filters.journal) return false;
      if (filters.document !== "all" && row.document !== filters.document) return false;
      if (filters.location !== "all" && (row.location || "") !== filters.location) return false;
      if (filters.matching === "open") {
        if (row.residual <= 0.004 && row.matching !== "Open" && row.matching !== "Partial") {
          return false;
        }
      }
      if (filters.dateFrom && row.date && row.date < filters.dateFrom) return false;
      if (filters.dateTo && row.date && row.date > filters.dateTo) return false;
      if (!q) return true;
      return `${row.reference} ${row.documentLabel} ${row.journal} ${row.status} ${row.matching}`
        .toLowerCase()
        .includes(q);
    });
  }, [rows, filters]);

  const filterActive =
    filters.search.trim() !== "" ||
    filters.journal !== "all" ||
    filters.document !== "all" ||
    filters.matching !== "all" ||
    filters.location !== "all" ||
    filters.dateFrom !== "" ||
    filters.dateTo !== "";

  const locationOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) if (row.location) set.add(row.location);
    return Array.from(set).sort();
  }, [rows]);

  const openLinkedDocument = useCallback(async (row: PartnerLedgerLine) => {
    const sourceType = (row.sourceType || "").toLowerCase();
    const sourceId = (row.sourceId || "").trim();
    if (!sourceId) {
      setDetailRow(row);
      return;
    }
    try {
      if (sourceType === "sales_order" || sourceType === "commerce_order") {
        setSalesOrder(apiSalesOrderToOrder(await fetchSalesOrder(sourceId)));
        return;
      }
      if (sourceType === "purchase_order") {
        setPoOrder(await fetchPurchaseOrder(sourceId));
        return;
      }
      if (sourceType === "purchase_receipt") {
        const receipt = await fetchPurchaseReceipt(sourceId);
        setPoOrder(await fetchPurchaseOrder(receipt.purchase_order_id));
        return;
      }
      if (sourceType === "sales_invoice") {
        setInvoiceViewId(sourceId);
        return;
      }
      if (sourceType === "sales_return") {
        setSalesReturnRecord(apiReturnToSalesReturn(await fetchSalesReturn(sourceId)));
        return;
      }
      if (sourceType === "purchase_return") {
        setPurchaseReturnRecord(apiReturnToPurchaseReturn(await fetchPurchaseReturn(sourceId)));
        return;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open document");
      return;
    }
    // No real source document to open (e.g. a party payment/manual invoice
    // not tied to a specific order) — show what we do have for this line.
    setDetailRow(row);
  }, []);

  const columnDefs = useMemo<ColDef<PartnerLedgerLine>[]>(
    () => [
      {
        colId: "date",
        headerName: "Date",
        width: 138,
        minWidth: 124,
        sortable: false,
        valueGetter: (p) => p.data?.dateTime || p.data?.date || "",
        valueFormatter: (p) => (p.value ? formatDateTime(String(p.value)) : "—"),
      },
      {
        colId: "reference",
        headerName: "Reference No",
        field: "reference",
        width: 124,
        minWidth: 110,
        cellClass: "font-mono text-[11px]",
        cellRenderer: (p: ICellRendererParams<PartnerLedgerLine>) => {
          const ref = p.data?.reference?.trim();
          if (!ref) return "—";
          return (
            <GridRefLink
              className="font-mono text-[11px]"
              title={ref}
              onClick={() => void openLinkedDocument(p.data!)}
            >
              {ref}
            </GridRefLink>
          );
        },
      },
      {
        colId: "document",
        headerName: "Type",
        width: 104,
        minWidth: 92,
        cellRenderer: (p: ICellRendererParams<PartnerLedgerLine>) => {
          const doc = p.data?.document;
          if (!doc) return null;
          return (
            <GridChipBadge className={DOCUMENT_TONE[doc] ?? ""} title={p.data?.documentLabel}>
              {p.data?.documentLabel}
            </GridChipBadge>
          );
        },
      },
      {
        colId: "debit",
        headerName: "Debit",
        headerTooltip: "Customer invoice or supplier payment",
        width: 104,
        minWidth: 88,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueGetter: (p) => p.data?.debit ?? 0,
        valueFormatter: (p) => moneyOrDash(Number(p.value ?? 0)),
      },
      {
        colId: "credit",
        headerName: "Credit",
        headerTooltip: "Customer receipt or supplier bill",
        width: 104,
        minWidth: 88,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueGetter: (p) => p.data?.credit ?? 0,
        valueFormatter: (p) => moneyOrDash(Number(p.value ?? 0)),
      },
      {
        colId: "balance",
        headerName: "Balance",
        headerTooltip: "Where the account stands after this line",
        width: 150,
        minWidth: 130,
        pinned: "right",
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueGetter: (p) => p.data?.balance ?? 0,
        cellRenderer: (p: ICellRendererParams<PartnerLedgerLine>) => {
          const value = Number(p.value ?? 0);
          const side = balanceSide(value);
          if (side === "settled") return <span className="text-muted-foreground">Settled</span>;
          return (
            <span
              className={cn(
                "tabular-nums",
                side === "they_owe"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400",
              )}
            >
              {formatCurrency(Math.abs(value))}
              <span className="ml-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                {side === "they_owe" ? "owes you" : "you owe"}
              </span>
            </span>
          );
        },
      },
      {
        colId: "matching",
        headerName: "Payment Status",
        width: 120,
        minWidth: 100,
        cellRenderer: (p: ICellRendererParams<PartnerLedgerLine>) => {
          const matching = p.data?.matching?.trim() || "—";
          if (matching === "—") return "—";
          const tone =
            MATCHING_TONE[matching.toLowerCase()] ?? "border-border bg-muted/40 text-muted-foreground";
          return (
            <GridChipBadge className={tone} title={matching}>
              {matching}
            </GridChipBadge>
          );
        },
      },
      {
        colId: "location",
        headerName: "Location",
        field: "location",
        width: 110,
        minWidth: 92,
        valueFormatter: (p) => p.value || "—",
      },
      {
        colId: "paymentMethod",
        headerName: "Payment Method",
        field: "paymentMethod",
        width: 130,
        minWidth: 110,
        valueFormatter: (p) => (p.value ? String(p.value).replace(/_/g, " ") : "—"),
      },
      {
        colId: "notes",
        headerName: "Others",
        field: "notes",
        flex: 1,
        minWidth: 120,
        valueFormatter: (p) => p.value || "—",
      },
    ],
    [openLinkedDocument],
  );

  const dualRole = Boolean(resolvedCustomerId && resolvedSupplierId);

  const statement = useMemo<LedgerStatement>(
    () => ({
      partyKind: "partner",
      partyName: partyName?.trim() || "Partner",
      partyPhone: partyPhone?.trim() || "",
      partyEmail: partyEmail?.trim() || "",
      periodLabel: statementPeriodLabel(filters.dateFrom, filters.dateTo),
      filterNote: filterActive
        ? `Filtered view — ${filtered.length} of ${rows.length} lines`
        : dualRole
          ? "Partner ledger — receivable and payable"
          : resolvedSupplierId && !resolvedCustomerId
            ? "Partner ledger — payable"
            : "Partner ledger — receivable",
      printedAt: new Date().toISOString(),
      billed: totals.debitTotal,
      paid: totals.creditTotal,
      outstanding: totals.theyOwe,
      advance: totals.weOwe,
      overdue: totals.overdue,
      openCount: totals.openCount,
      ageing: {
        current: totals.arAgeing.current + totals.apAgeing.current,
        days30: totals.arAgeing.days30 + totals.apAgeing.days30,
        days60: totals.arAgeing.days60 + totals.apAgeing.days60,
        days90Plus: totals.arAgeing.days90Plus + totals.apAgeing.days90Plus,
      },
      rows: filtered.map((row) => ({
        date: row.date,
        type: row.documentLabel,
        journal: `${row.journal === "receivable" ? "Receivable" : "Payable"} · ${row.documentLabel}`,
        reference: row.reference,
        dueDate: row.dueDate ?? "",
        billed: row.debit,
        paid: row.credit,
        due: row.residual > 0.004 ? row.residual : null,
        balance: row.balance,
        status: row.matching === "—" ? row.status : row.matching,
      })),
      rowCountTotal: rows.length,
    }),
    [
      partyName,
      partyPhone,
      partyEmail,
      filters.dateFrom,
      filters.dateTo,
      filterActive,
      filtered,
      rows.length,
      dualRole,
      resolvedCustomerId,
      resolvedSupplierId,
      totals,
    ],
  );

  const receiveLabel = dualRole ? "Receive payment" : "Record payment";
  const payLabel = dualRole ? "Pay bill" : "Record payment";

  // The bottom line, in plain words: who owes whom, and how much.
  const closing = totals.openingBalance + totals.net;
  const closingSide = balanceSide(closing);
  const partyWord =
    resolvedCustomerId && !resolvedSupplierId
      ? "Customer"
      : resolvedSupplierId && !resolvedCustomerId
        ? "Supplier"
        : "Partner";
  const closingLabel =
    closingSide === "they_owe"
      ? `${partyWord} owes you`
      : closingSide === "we_owe"
        ? `You owe ${partyWord.toLowerCase()}`
        : "Balance";
  const closingHint =
    closingSide === "they_owe"
      ? "Still to collect"
      : closingSide === "we_owe"
        ? "Refund, or adjust on the next invoice"
        : "Nothing outstanding either way";

  return (
    <div className={cn(fillHeight ? "flex min-h-full flex-1 flex-col gap-3" : "space-y-3")}>
      <section className="shrink-0 border border-border">
        <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
          <h3 className="text-xs font-semibold">Partner ledger</h3>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-none"
            aria-label="Refresh ledger"
            onClick={() => void load()}
          >
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
          </Button>
          {canWrite ? (
            <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
              {resolvedCustomerId ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 rounded-none text-xs"
                    onClick={() => setInvoiceOpen(true)}
                  >
                    <FilePlus className="mr-1 h-3 w-3" /> Raise invoice
                  </Button>
                  <Button
                    size="sm"
                    className="h-6 rounded-none text-xs"
                    onClick={() => setCustomerPayOpen(true)}
                  >
                    <Banknote className="mr-1 h-3 w-3" /> {receiveLabel}
                  </Button>
                </>
              ) : null}
              {resolvedSupplierId ? (
                <Button
                  size="sm"
                  variant={resolvedCustomerId ? "outline" : "default"}
                  className="h-6 rounded-none text-xs"
                  onClick={() => setSupplierPayOpen(true)}
                >
                  <Banknote className="mr-1 h-3 w-3" /> {payLabel}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="grid grid-cols-3 border-b border-border sm:grid-cols-6">
          <Stat label="Opening balance" value={formatLedgerMoney(totals.openingBalance)} />
          <Stat label="Total purchase" value={formatCurrency(totals.apBilled)} />
          <Stat label="Total invoice" value={formatCurrency(totals.arBilled)} />
          <Stat label="Total paid" value={formatCurrency(totals.apPaid + totals.arPaid)} />
          <Stat
            label="Advance balance"
            value={formatCurrency(totals.arAdvance + totals.apAdvance)}
          />
          <Stat
            label={closingLabel}
            value={closingSide === "settled" ? "Settled" : formatCurrency(Math.abs(closing))}
            hint={closingHint}
            tone={closingSide === "they_owe" ? "credit" : closingSide === "we_owe" ? "danger" : "muted"}
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4">
          <Stat
            label="Purchased"
            value={formatCurrency(trading.purchaseTotal)}
            hint="From this partner"
          />
          <Stat
            label="Sold"
            value={formatCurrency(trading.salesTotal)}
            hint="To this partner"
          />
          <Stat
            label="Purchase profit"
            value={formatLedgerMoney(trading.purchaseProfit)}
            hint="Retail minus buy cost"
            tone={trading.purchaseProfit < -0.004 ? "danger" : trading.purchaseProfit > 0.004 ? "credit" : "muted"}
          />
          <Stat
            label="Sales profit"
            value={formatLedgerMoney(trading.salesProfit)}
            hint="Sell price minus cost"
            tone={trading.salesProfit < -0.004 ? "danger" : trading.salesProfit > 0.004 ? "credit" : "muted"}
          />
        </div>
      </section>

      <section
        className={cn(
          "border border-border",
          fillHeight && "flex min-h-[220px] flex-1 flex-col overflow-hidden",
        )}
      >
        <AgainListGrid<PartnerLedgerLine>
          embedded
          className={fillHeight ? "flex min-h-[220px] flex-1 flex-col" : "h-[360px]"}
          gridClassName="[&_.ag-root-wrapper]:flex [&_.ag-root-wrapper]:flex-col [&_.ag-root-wrapper-body]:min-h-0 [&_.ag-root-wrapper-body]:flex-1 [&_.ag-paging-panel]:shrink-0 [&_.ag-paging-panel]:pl-[220px]"
          rowData={filtered}
          columnDefs={columnDefs}
          defaultColDef={{
            sortable: false,
            resizable: true,
            filter: false,
            suppressHeaderMenuButton: true,
            minWidth: 72,
          }}
          getRowId={(p) => p.data?.id ?? String(p.rowIndex)}
          headerLeftActions={
            <ListGridHeaderStart title="Partner ledger">
              <span className="text-xs text-muted-foreground">{totals.openCount} open</span>
            </ListGridHeaderStart>
          }
          filterBar={
            <>
              <Input
                placeholder="Search reference…"
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                className="h-7 w-[160px] shrink-0 rounded-none"
              />
              <FilterSelect
                value={filters.journal}
                onChange={(journal) => setFilters((f) => ({ ...f, journal }))}
                width="w-[132px]"
                className="h-7 shrink-0"
                ariaLabel="Journal"
                options={[
                  { value: "all", label: "All journals" },
                  { value: "receivable", label: "Receivable" },
                  { value: "payable", label: "Payable" },
                ]}
              />
              <FilterSelect
                value={filters.document}
                onChange={(document) => setFilters((f) => ({ ...f, document }))}
                width="w-[124px]"
                className="h-7 shrink-0"
                ariaLabel="Type"
                options={[
                  { value: "all", label: "All types" },
                  { value: "invoice", label: "Sell" },
                  { value: "sales_return", label: "Sell Return" },
                  { value: "bill", label: "Purchase" },
                  { value: "purchase_return", label: "Purchase Return" },
                  { value: "receipt", label: "Payment (received)" },
                  { value: "refund", label: "Refund (paid back)" },
                  { value: "payment", label: "Payment (made)" },
                  { value: "writeoff", label: "Discounts" },
                ]}
              />
              <FilterSelect
                value={filters.matching}
                onChange={(matching) => setFilters((f) => ({ ...f, matching }))}
                width="w-[124px]"
                className="h-7 shrink-0"
                ariaLabel="Matching"
                options={[
                  { value: "all", label: "All rows" },
                  { value: "open", label: "Open items" },
                ]}
              />
              <FilterSelect
                value={filters.location}
                onChange={(location) => setFilters((f) => ({ ...f, location }))}
                width="w-[140px]"
                className="h-7 shrink-0"
                ariaLabel="Business location"
                options={[
                  { value: "all", label: "All locations" },
                  ...locationOptions.map((loc) => ({ value: loc, label: loc })),
                ]}
              />
              <DateRangePresetPicker
                value={{ dateFrom: filters.dateFrom, dateTo: filters.dateTo }}
                onChange={(next) => setFilters((f) => ({ ...f, dateFrom: next.dateFrom, dateTo: next.dateTo }))}
                buttonClassName="shrink-0"
              />
              {filterActive ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 rounded-none px-2 text-xs"
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                >
                  Clear
                </Button>
              ) : null}
              <LedgerExportMenu statement={statement} disabled={loading} />
            </>
          }
          footerLeftActions={
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {loading
                ? "Loading…"
                : filterActive
                  ? `${filtered.length} of ${rows.length}`
                  : `${rows.length} ${rows.length === 1 ? "entry" : "entries"}`}
            </span>
          }
          emptyTitle={
            rows.length === 0
              ? "No invoices, bills, or payments on this partner yet."
              : "No rows match your filters."
          }
          onResetFilters={filterActive ? () => setFilters(DEFAULT_FILTERS) : undefined}
          gridProps={{ colResizeDefault: "shift" }}
        />
      </section>

      {resolvedCustomerId ? (
        <>
          <CustomerRecordPaymentDrawer
            key={`ar-pay:${customerPayOpen}`}
            open={customerPayOpen}
            onOpenChange={setCustomerPayOpen}
            customerId={resolvedCustomerId}
            customerName={partyName}
            outstanding={totals.theyOwe}
            advance={totals.arAdvance}
            onRecorded={load}
          />
          <CustomerRaiseInvoiceDrawer
            key={`ar-inv:${invoiceOpen}`}
            open={invoiceOpen}
            onOpenChange={setInvoiceOpen}
            customerId={resolvedCustomerId}
            customerName={partyName}
            onRaised={load}
          />
        </>
      ) : null}
      {resolvedSupplierId ? (
        <RecordPaymentDrawer
          key={`ap-pay:${supplierPayOpen}`}
          open={supplierPayOpen}
          onOpenChange={setSupplierPayOpen}
          supplierId={resolvedSupplierId}
          supplierName={partyName}
          outstanding={totals.weOwe}
          advance={totals.apAdvance}
          onRecorded={load}
        />
      ) : null}

      <SalesOrderFormDrawer
        open={salesOrder != null}
        mode="edit"
        order={salesOrder}
        nested
        onOpenChange={(open) => {
          if (!open) setSalesOrder(null);
        }}
        onSave={() => {}}
        onSaveAction={async (order, action) => {
          const saved = await persistSalesOrder(order, action);
          setSalesOrder(saved);
          return saved;
        }}
        onSaved={(saved) => setSalesOrder(saved)}
      />
      <PoFormDrawer
        open={poOrder != null}
        order={poOrder}
        onOpenChange={(open) => {
          if (!open) setPoOrder(null);
        }}
        onCreated={() => void load()}
      />
      <InvoiceDetailDrawer
        open={invoiceViewId != null}
        invoiceId={invoiceViewId}
        onOpenChange={(open) => {
          if (!open) setInvoiceViewId(null);
        }}
      />
      <SalesReturnDrawer
        open={salesReturnRecord != null}
        orders={[]}
        record={salesReturnRecord}
        onOpenChange={(open) => {
          if (!open) setSalesReturnRecord(null);
        }}
      />
      <ReturnDrawer
        open={purchaseReturnRecord != null}
        orders={[]}
        record={purchaseReturnRecord}
        onOpenChange={(open) => {
          if (!open) setPurchaseReturnRecord(null);
        }}
      />
      <Sheet
        open={detailRow != null}
        onOpenChange={(open) => {
          if (!open) setDetailRow(null);
        }}
      >
        <SheetContent className="w-[380px] sm:max-w-[380px]">
          {detailRow ? (
            <div className="space-y-4 pt-6">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {detailRow.documentLabel}
                </p>
                <p className="mt-0.5 font-mono text-sm font-semibold">
                  {detailRow.reference || "—"}
                </p>
              </div>
              <div className="space-y-2.5 border-t border-border pt-3 text-xs">
                <DetailField label="Date" value={formatDateTime(detailRow.dateTime || detailRow.date)} />
                <DetailField label="Location" value={detailRow.location || "—"} />
                <DetailField
                  label="Payment method"
                  value={detailRow.paymentMethod ? detailRow.paymentMethod.replace(/_/g, " ") : "—"}
                />
                <DetailField label="Status" value={detailRow.matching !== "—" ? detailRow.matching : detailRow.status || "—"} />
                <DetailField
                  label={detailRow.debit > 0.004 ? "Debit" : "Credit"}
                  value={formatLedgerMoney(detailRow.debit || detailRow.credit)}
                />
                <DetailField label="Others" value={detailRow.notes || "—"} />
              </div>
              <p className="border-t border-border pt-3 text-[11px] text-muted-foreground">
                This entry isn&apos;t tied to a single sales or purchase order, so there&apos;s no
                separate document to open — the details above are everything recorded for it.
              </p>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
