"use client";

import { useCallback, useMemo, useState } from "react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { AgainListGrid } from "@/components/shared/again-list-grid";
import type { ApiProductReport } from "@/lib/api/inventory";
import { fetchProductLedger, type ProductLedgerLine, type ProductLedgerMeta } from "@/lib/api/product-history";
import { cn, formatDate, formatQuantity } from "@/lib/utils";
import {
  DateRangeFilter,
  EMPTY_DATE_RANGE,
  FactList,
  HISTORY_GRID_CANVAS_CLASS,
  HISTORY_GRID_CLASS,
  PanelMessage,
  type DateRange,
} from "./drawer-shared";
import { usePagedHistory } from "./use-paged-history";

function bucketQty(report: ApiProductReport, movementType: string, direction: "in" | "out"): number {
  const bucket = report.by_type.find((b) => b.movement_type === movementType);
  if (!bucket) return 0;
  return direction === "in" ? bucket.qty_in : bucket.qty_out;
}

/** Signed on-hand change for this row — qty_in/qty_out from the ledger are
 * mutually exclusive per row, so exactly one of them is non-zero. */
function signedQty(row: ProductLedgerLine): number {
  return row.qty_in > 0 ? row.qty_in : -row.qty_out;
}

function QuantityChangeCell({ value }: { value: number }) {
  if (value === 0) return <span className="tabular-nums text-muted-foreground">0</span>;
  const positive = value > 0;
  return (
    <span className={cn("tabular-nums font-medium", positive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
      {positive ? "+" : "−"}
      {formatQuantity(Math.abs(value))}
    </span>
  );
}

/** Quantities in/out breakdown plus a running-balance movement table —
 * mirrors AgainPOS's "Product stock history" page. */
export function ProductStockPanel({
  itemId,
  report,
}: {
  itemId: string;
  report: ApiProductReport | null;
}) {
  const [range, setRange] = useState<DateRange>(EMPTY_DATE_RANGE);
  const load = useCallback(
    (page: number, perPage: number) =>
      fetchProductLedger(itemId, { page, perPage, dateFrom: range.dateFrom, dateTo: range.dateTo }),
    [itemId, range.dateFrom, range.dateTo],
  );
  const list = usePagedHistory<ProductLedgerLine, ProductLedgerMeta>(load);

  const summary = useMemo(() => {
    if (!report) return null;
    const t = report.totals;
    const opening = bucketQty(report, "opening_stock", "in") + bucketQty(report, "opening", "in");
    const transferIn = bucketQty(report, "transfer_in", "in");
    const transferOut = bucketQty(report, "transfer_out", "out");
    return {
      in: [
        { label: "Total Purchase", value: formatQuantity(t.purchased_qty), numeric: true },
        { label: "Opening Stock", value: formatQuantity(opening), numeric: true },
        { label: "Total Sell Return", value: formatQuantity(t.customer_return_qty), numeric: true },
        { label: "Stock Transfers (In)", value: formatQuantity(transferIn), numeric: true },
      ],
      out: [
        { label: "Total Sold", value: formatQuantity(t.sold_qty), numeric: true },
        { label: "Total Stock Adjustment", value: formatQuantity(t.adjustment_out_qty), numeric: true },
        { label: "Total Purchase Return", value: formatQuantity(t.purchase_return_qty), numeric: true },
        { label: "Stock Transfers (Out)", value: formatQuantity(transferOut), numeric: true },
      ],
      totals: [{ label: "Current stock", value: formatQuantity(report.stock.on_hand), numeric: true }],
    };
  }, [report]);

  const columnDefs = useMemo<ColDef<ProductLedgerLine>[]>(
    () => [
      {
        colId: "type",
        headerName: "Type",
        flex: 1,
        minWidth: 140,
        valueGetter: (p) => p.data?.movement_label || p.data?.movement_type || "—",
      },
      {
        colId: "change",
        headerName: "Quantity change",
        width: 130,
        minWidth: 110,
        cellRenderer: (p: ICellRendererParams<ProductLedgerLine>) =>
          p.data ? <QuantityChangeCell value={signedQty(p.data)} /> : null,
      },
      {
        colId: "balance",
        headerName: "New Quantity",
        field: "balance",
        width: 120,
        minWidth: 100,
        cellClass: "tabular-nums",
        valueFormatter: (p) => formatQuantity(p.value),
      },
      {
        colId: "date",
        headerName: "Date",
        field: "date",
        width: 150,
        minWidth: 120,
        valueFormatter: (p) => formatDate(p.value),
      },
      {
        colId: "reference",
        headerName: "Reference No",
        width: 140,
        minWidth: 110,
        cellClass: "font-mono text-[11px]",
        valueGetter: (p) => p.data?.reference || "—",
      },
      {
        colId: "party",
        headerName: "Customer/Supplier information",
        flex: 1,
        minWidth: 180,
        valueGetter: (p) => p.data?.party_name || "—",
      },
    ],
    [],
  );

  if (list.error) return <PanelMessage title="Could not load stock history" hint={list.error} tone="error" />;

  return (
    <AgainListGrid<ProductLedgerLine>
      embedded
      className={HISTORY_GRID_CLASS}
      gridClassName={HISTORY_GRID_CANVAS_CLASS}
      rowData={list.rows}
      columnDefs={columnDefs}
      loading={list.loading && !list.loaded}
      filterBar={<DateRangeFilter value={range} onChange={(next) => { setRange(next); list.setPage(0); }} />}
      summary={
        summary ? (
          <div className="grid grid-cols-1 gap-2 border-b border-border p-2 sm:grid-cols-3" data-testid="product-drawer-stock-summary">
            <FactList title="Quantities In" facts={summary.in} />
            <FactList title="Quantities Out" facts={summary.out} />
            <FactList title="Totals" facts={summary.totals} />
          </div>
        ) : undefined
      }
      serverPaging={{
        total: list.meta?.total ?? 0,
        page: list.page,
        pageSize: list.pageSize,
        onPageChange: list.setPage,
        onPageSizeChange: list.setPageSize,
      }}
      emptyTitle="No stock movements"
      emptyHint="Receipts, deliveries, transfers and adjustments will appear here."
    />
  );
}
