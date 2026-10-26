"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { AgainListGrid } from "@/components/shared/again-list-grid";
import { GridChipBadge } from "@/components/shared/grid-chip-badge";
import { fetchProductReport, type ApiProductReport, type ApiStockLevel } from "@/lib/api/inventory";
import {
  fetchProductLedger,
  fetchProductStockLevels,
  type ProductLedgerLine,
  type ProductLedgerMeta,
} from "@/lib/api/product-history";
import { cn, formatCurrency, formatDate, formatQuantity } from "@/lib/utils";
import {
  DateRangeFilter,
  EMPTY_DATE_RANGE,
  FactList,
  HISTORY_GRID_CANVAS_CLASS,
  HISTORY_GRID_CLASS,
  PanelMessage,
  StatBox,
  StatSection,
  type DateRange,
} from "./drawer-shared";
import { usePagedHistory } from "./use-paged-history";

const STATUS_LABEL: Record<string, string> = {
  in_stock: "In stock",
  low_stock: "Low stock",
  out_of_stock: "Out of stock",
  overstock: "Overstock",
};
const STATUS_TONE: Record<string, string> = {
  in_stock: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  low_stock: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  out_of_stock: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  overstock: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
};

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

const profitTone = (value: number) => (value > 0 ? "text-emerald-600 dark:text-emerald-400" : value < 0 ? "text-red-600 dark:text-red-400" : "");

/**
 * The stock of one product. Top: what is on the shelves now - pieces, and what they are worth at the purchase price, at the
 * selling price, and the profit selling them all would make - broken down by location, with the reorder level and status of
 * each. Below: the movements (what came in, what went out, the running balance) over a period you pick.
 */
export function ProductStockPanel({
  itemId,
  report,
  price,
  cost,
}: {
  itemId: string;
  /** The all-time report the drawer loaded: stock now comes from it. */
  report: ApiProductReport | null;
  /** The product's current selling price and cost (purchase) price. */
  price: number;
  cost?: number | null;
}) {
  const [range, setRange] = useState<DateRange>(EMPTY_DATE_RANGE);
  const [levels, setLevels] = useState<ApiStockLevel[] | "failed" | null>(null);
  const [period, setPeriod] = useState<{ key: string; report: ApiProductReport | null } | null>(null);
  const periodKey = `${itemId}|${range.dateFrom}|${range.dateTo}`;

  // the stock rows, one per location
  useEffect(() => {
    let cancelled = false;
    void fetchProductStockLevels(itemId)
      .then((rows) => {
        if (!cancelled) setLevels(rows);
      })
      .catch(() => {
        if (!cancelled) setLevels("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  // the movement totals for the period picked (the drawer's report is all-time)
  useEffect(() => {
    let cancelled = false;
    void fetchProductReport({ itemId, dateFrom: range.dateFrom || undefined, dateTo: range.dateTo || undefined })
      .then((next) => {
        if (!cancelled) setPeriod({ key: `${itemId}|${range.dateFrom}|${range.dateTo}`, report: next });
      })
      .catch(() => {
        if (!cancelled) setPeriod({ key: `${itemId}|${range.dateFrom}|${range.dateTo}`, report: null });
      });
    return () => {
      cancelled = true;
    };
  }, [itemId, range.dateFrom, range.dateTo]);

  const load = useCallback(
    (page: number, perPage: number) =>
      fetchProductLedger(itemId, { page, perPage, dateFrom: range.dateFrom, dateTo: range.dateTo }),
    [itemId, range.dateFrom, range.dateTo],
  );
  const list = usePagedHistory<ProductLedgerLine, ProductLedgerMeta>(load);

  // ---- stock now, by location -------------------------------------------------
  const rows = useMemo(() => (Array.isArray(levels) ? levels : []), [levels]);
  const locations = useMemo(
    () =>
      rows
        .map((row) => {
          const unitCost = cost ?? (Number(row.unit_cost) || 0);
          const costValue = row.on_hand * unitCost;
          const saleValue = row.on_hand * price;
          return { row, costValue, saleValue, profit: saleValue - costValue };
        })
        .sort((a, b) => b.row.on_hand - a.row.on_hand || (a.row.warehouse_name ?? "").localeCompare(b.row.warehouse_name ?? "")),
    [rows, cost, price],
  );
  const onHand = report?.stock.on_hand ?? locations.reduce((sum, l) => sum + l.row.on_hand, 0);
  const reserved = report?.stock.reserved ?? locations.reduce((sum, l) => sum + l.row.reserved, 0);
  const incoming = locations.reduce((sum, l) => sum + (l.row.incoming ?? 0), 0);
  const costValue = locations.length || !report ? locations.reduce((sum, l) => sum + l.costValue, 0) : Number(report.stock.cost_value);
  const saleValue = locations.length || !report ? locations.reduce((sum, l) => sum + l.saleValue, 0) : Number(report.stock.sale_value);
  const potentialProfit = saleValue - costValue;
  const potentialMargin = saleValue > 0 ? (potentialProfit / saleValue) * 100 : null;
  const reorderLocations = locations.filter(
    (l) => l.row.reorder_level > 0 && l.row.available <= l.row.reorder_level,
  );

  // ---- movements in the period ---------------------------------------------------
  const periodReport = period?.report ?? report;
  const periodPending = period?.key !== periodKey;
  const summary = useMemo(() => {
    if (!periodReport) return null;
    const t = periodReport.totals;
    const opening = bucketQty(periodReport, "opening_stock", "in") + bucketQty(periodReport, "opening", "in");
    const transferIn = bucketQty(periodReport, "transfer_in", "in");
    const transferOut = bucketQty(periodReport, "transfer_out", "out");
    const totalIn = t.purchased_qty + opening + t.customer_return_qty + transferIn + t.adjustment_in_qty;
    const totalOut = t.sold_qty + t.adjustment_out_qty + t.purchase_return_qty + transferOut;
    return {
      in: [
        { label: "Total Purchase", value: formatQuantity(t.purchased_qty), numeric: true },
        { label: "Opening Stock", value: formatQuantity(opening), numeric: true },
        { label: "Total Sell Return", value: formatQuantity(t.customer_return_qty), numeric: true },
        { label: "Stock Transfers (In)", value: formatQuantity(transferIn), numeric: true },
        { label: "Adjustment (In)", value: formatQuantity(t.adjustment_in_qty), numeric: true },
      ],
      out: [
        { label: "Total Sold", value: formatQuantity(t.sold_qty), numeric: true },
        { label: "Total Stock Adjustment", value: formatQuantity(t.adjustment_out_qty), numeric: true },
        { label: "Total Purchase Return", value: formatQuantity(t.purchase_return_qty), numeric: true },
        { label: "Stock Transfers (Out)", value: formatQuantity(transferOut), numeric: true },
      ],
      totals: [
        { label: "Total in", value: formatQuantity(totalIn), numeric: true },
        { label: "Total out", value: formatQuantity(totalOut), numeric: true },
        { label: "Net change", value: `${totalIn - totalOut > 0 ? "+" : ""}${formatQuantity(totalIn - totalOut)}`, numeric: true },
        { label: "Current stock", value: formatQuantity(onHand), numeric: true },
      ],
    };
  }, [periodReport, onHand]);

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
        colId: "warehouse",
        headerName: "Location",
        width: 140,
        minWidth: 100,
        valueGetter: (p) => p.data?.warehouse_name || "—",
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

  const money = (value: number) => formatCurrency(value);
  const totalRow = locations.length > 1;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-testid="product-drawer-stock">
      {/* ---------------------------------------------------------------- stock now */}
      <div className="shrink-0 space-y-5 px-4 py-4">
        <StatSection title="Stock now" note="As of today">
          <StatBox label="On hand" value={formatQuantity(onHand)} />
          <StatBox label="Reserved" value={formatQuantity(reserved)} hint="Held for orders not yet delivered" />
          <StatBox label="Available" value={formatQuantity(onHand - reserved)} hint="On hand − reserved" />
          <StatBox label="Incoming" value={formatQuantity(incoming)} hint="On open purchase orders and transfers" />
        </StatSection>

        <StatSection
          title="Stock value"
          note={cost != null ? "Pieces on hand × the product's price" : "Pieces on hand × the stock's average cost"}
        >
          <StatBox label="At purchase price" value={money(costValue)} hint={cost != null ? `${formatQuantity(onHand)} × ${money(cost)}` : undefined} />
          <StatBox label="At selling price" value={money(saleValue)} hint={`${formatQuantity(onHand)} × ${money(price)}`} />
          <StatBox
            label="Potential profit"
            value={money(potentialProfit)}
            tone={potentialProfit > 0 ? "good" : potentialProfit < 0 ? "bad" : undefined}
            hint="What selling everything on hand at the current price would earn"
          />
          <StatBox
            label="Potential margin"
            value={potentialMargin == null ? "—" : `${potentialMargin.toFixed(1)}%`}
            tone={potentialMargin == null || potentialMargin === 0 ? undefined : potentialMargin > 0 ? "good" : "bad"}
            hint="Potential profit ÷ value at selling price"
          />
        </StatSection>

        {reorderLocations.length > 0 ? (
          <div className="border-l-2 border-amber-500 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-300" role="status">
            <span className="font-semibold">Reorder: </span>
            {reorderLocations
              .map((l) => `${l.row.warehouse_name ?? "Location"} has ${formatQuantity(l.row.available)} left (reorder at ${formatQuantity(l.row.reorder_level)})`)
              .join(" · ")}
          </div>
        ) : null}

        {/* ------------------------------------------------------------ by location */}
        <section>
          <h3 className="mb-1 border-b border-border/80 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            By location
          </h3>
          {levels === "failed" ? (
            <p className="py-3 text-[12px] text-destructive">Could not load the stock by location.</p>
          ) : levels === null ? (
            <p className="py-3 text-[12px] text-muted-foreground">Loading…</p>
          ) : locations.length === 0 ? (
            <p className="py-3 text-[12px] text-muted-foreground">No stock in any location yet. Receive or adjust stock to see it here.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-border/80 text-[11px] font-semibold text-foreground">
                    <th className="py-2 pr-3 text-left">Location</th>
                    <th className="py-2 pr-3 text-right">On hand</th>
                    <th className="py-2 pr-3 text-right">Reserved</th>
                    <th className="py-2 pr-3 text-right">Available</th>
                    <th className="py-2 pr-3 text-right">Incoming</th>
                    <th className="py-2 pr-3 text-right">Reorder at</th>
                    <th className="py-2 pr-3 text-left">Status</th>
                    <th className="py-2 pr-3 text-right">At purchase price</th>
                    <th className="py-2 pr-3 text-right">At selling price</th>
                    <th className="py-2 text-right">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {locations.map(({ row, costValue: cv, saleValue: sv, profit }) => (
                    <tr key={row.id} className={cn("border-b border-border/60", row.on_hand === 0 && "text-muted-foreground")}>
                      <td className="py-1.5 pr-3">
                        <span className="font-medium text-foreground">{row.warehouse_name ?? "—"}</span>
                        {row.warehouse_code ? <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">{row.warehouse_code}</span> : null}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-medium tabular-nums">{formatQuantity(row.on_hand)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{formatQuantity(row.reserved)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{formatQuantity(row.available)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{row.incoming ? formatQuantity(row.incoming) : "—"}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{row.reorder_level ? formatQuantity(row.reorder_level) : "—"}</td>
                      <td className="py-1.5 pr-3">
                        <GridChipBadge className={STATUS_TONE[row.status] ?? ""} title={STATUS_LABEL[row.status]}>
                          {STATUS_LABEL[row.status] ?? row.status}
                        </GridChipBadge>
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{money(cv)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{money(sv)}</td>
                      <td className={cn("py-1.5 text-right font-medium tabular-nums", profitTone(profit))}>{money(profit)}</td>
                    </tr>
                  ))}
                </tbody>
                {totalRow ? (
                  <tfoot>
                    <tr className="border-t border-border font-semibold text-foreground">
                      <td className="py-1.5 pr-3">Total</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{formatQuantity(locations.reduce((s, l) => s + l.row.on_hand, 0))}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{formatQuantity(locations.reduce((s, l) => s + l.row.reserved, 0))}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{formatQuantity(locations.reduce((s, l) => s + l.row.available, 0))}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{incoming ? formatQuantity(incoming) : "—"}</td>
                      <td className="py-1.5 pr-3" />
                      <td className="py-1.5 pr-3" />
                      <td className="py-1.5 pr-3 text-right tabular-nums">{money(locations.reduce((s, l) => s + l.costValue, 0))}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{money(locations.reduce((s, l) => s + l.saleValue, 0))}</td>
                      <td className={cn("py-1.5 text-right tabular-nums", profitTone(locations.reduce((s, l) => s + l.profit, 0)))}>
                        {money(locations.reduce((s, l) => s + l.profit, 0))}
                      </td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          )}
        </section>
      </div>

      {/* ------------------------------------------------------------ movements */}
      <div className="flex shrink-0 flex-col border-t border-border">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Stock movements</h3>
          <DateRangeFilter
            value={range}
            onChange={(next) => {
              setRange(next);
              list.setPage(0);
            }}
          />
        </div>
        {summary ? (
          <div
            className={cn("grid grid-cols-1 gap-x-8 gap-y-4 px-4 pb-4 sm:grid-cols-3", periodPending && "opacity-60 transition-opacity")}
            data-testid="product-drawer-stock-summary"
          >
            <FactList title="Quantities In" facts={summary.in} />
            <FactList title="Quantities Out" facts={summary.out} />
            <FactList title="Totals" facts={summary.totals} />
          </div>
        ) : null}
        {list.error ? (
          <PanelMessage title="Could not load stock history" hint={list.error} tone="error" />
        ) : (
          <div className="flex h-[380px] flex-col border-t border-border">
            <AgainListGrid<ProductLedgerLine>
              embedded
              className={HISTORY_GRID_CLASS}
              gridClassName={HISTORY_GRID_CANVAS_CLASS}
              rowData={list.rows}
              columnDefs={columnDefs}
              loading={list.loading && !list.loaded}
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
          </div>
        )}
      </div>
    </div>
  );
}
