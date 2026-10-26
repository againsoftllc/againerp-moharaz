"use client";

import { useCallback, useMemo, useState } from "react";
import type { ColDef } from "ag-grid-community";
import { AgainListGrid, NUMERIC_CELL, NUMERIC_HEADER } from "@/components/shared/again-list-grid";
import {
  fetchProductPurchases,
  type ProductPurchaseLine,
  type ProductPurchaseMeta,
} from "@/lib/api/product-history";
import { ChevronDown } from "lucide-react";
import { cn, formatCurrency, formatDate, formatQuantity } from "@/lib/utils";
import {
  DateRangeFilter,
  EMPTY_DATE_RANGE,
  HISTORY_GRID_CANVAS_CLASS,
  HISTORY_GRID_CLASS,
  PanelMessage,
  StatBox,
  type DateRange,
} from "./drawer-shared";
import { usePagedHistory } from "./use-paged-history";

export function ProductPurchasePanel({ itemId, cost }: { itemId: string; cost?: number | null }) {
  const [range, setRange] = useState<DateRange>(EMPTY_DATE_RANGE);
  // the list of purchase lines can be folded away; it starts open
  const [ordersOpen, setOrdersOpen] = useState(true);
  const load = useCallback(
    (page: number, perPage: number) =>
      fetchProductPurchases(itemId, { page, perPage, dateFrom: range.dateFrom, dateTo: range.dateTo }),
    [itemId, range.dateFrom, range.dateTo],
  );
  const list = usePagedHistory<ProductPurchaseLine, ProductPurchaseMeta>(load);

  const columnDefs = useMemo<ColDef<ProductPurchaseLine>[]>(
    () => [
      {
        colId: "date",
        headerName: "Date",
        field: "date",
        width: 100,
        minWidth: 90,
        valueFormatter: (p) => formatDate(p.value),
      },
      {
        colId: "po_number",
        headerName: "Purchase order",
        width: 130,
        minWidth: 110,
        cellClass: "font-mono text-[11px]",
        valueGetter: (p) => p.data?.po_number || "—",
      },
      {
        colId: "supplier",
        headerName: "Supplier",
        flex: 1,
        minWidth: 140,
        valueGetter: (p) => p.data?.supplier_name || "—",
      },
      {
        colId: "quantity",
        headerName: "Qty",
        width: 80,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        // Received is what actually entered stock; fall back to ordered for open POs.
        valueGetter: (p) => p.data?.quantity_received ?? p.data?.quantity_ordered ?? 0,
        valueFormatter: (p) => formatQuantity(p.value),
      },
      {
        colId: "unit_cost",
        headerName: "Unit cost",
        field: "unit_cost",
        width: 110,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueFormatter: (p) => formatCurrency(Number(p.value ?? 0)),
      },
      {
        colId: "line_total",
        headerName: "Total",
        field: "line_total",
        width: 120,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueFormatter: (p) => formatCurrency(Number(p.value ?? 0)),
      },
    ],
    [],
  );

  if (list.error) return <PanelMessage title="Could not load purchases" hint={list.error} tone="error" />;

  const meta = list.meta;
  const price = (value: string | number | null | undefined) =>
    value == null || value === "" ? "—" : formatCurrency(Number(value));

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="product-drawer-purchase">
      {/* overview: what this product costs and what has been paid for it, over the period picked below */}
      <div className="shrink-0 border-b border-border px-4 py-3" data-testid="product-drawer-purchase-summary">
        <div className="flex flex-wrap items-stretch gap-2">
          <StatBox
            label="Cost"
            value={cost != null ? formatCurrency(cost) : "—"}
            hint="The product's current cost price"
          />
          <StatBox label="Lowest purchase price" value={price(meta?.min_cost)} hint="Cheapest unit cost paid (free lines ignored)" />
          <StatBox label="Highest purchase price" value={price(meta?.max_cost)} />
          <StatBox
            label="Average purchase price"
            value={price(meta?.avg_cost)}
            hint="Total purchase amount ÷ total purchased quantity"
          />
          <StatBox label="Total purchased qty" value={meta ? formatQuantity(meta.sum_qty) : "—"} />
          <StatBox label="Total purchase amount" value={meta ? formatCurrency(Number(meta.sum_total ?? 0)) : "—"} />
        </div>
      </div>

      {/* order view: every purchase line, folded away with the arrow (the period filter stays here, always in reach) */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-3 py-1.5">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-foreground hover:text-[#00a09d]"
          aria-expanded={ordersOpen}
          onClick={() => setOrdersOpen((open) => !open)}
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !ordersOpen && "-rotate-90")} />
          Purchase orders
          {meta ? <span className="font-normal text-muted-foreground">({meta.total})</span> : null}
        </button>
        <DateRangeFilter
          value={range}
          onChange={(next) => {
            setRange(next);
            list.setPage(0);
          }}
        />
      </div>
      {ordersOpen ? (
        <AgainListGrid<ProductPurchaseLine>
          embedded
          className={HISTORY_GRID_CLASS}
          gridClassName={HISTORY_GRID_CANVAS_CLASS}
          rowData={list.rows}
          columnDefs={columnDefs}
          loading={list.loading && !list.loaded}
          serverPaging={{
            total: meta?.total ?? 0,
            page: list.page,
            pageSize: list.pageSize,
            onPageChange: list.setPage,
            onPageSizeChange: list.setPageSize,
          }}
          emptyTitle="No purchases yet"
          emptyHint="Purchase order lines for this product will appear here."
        />
      ) : null}
    </div>
  );
}
