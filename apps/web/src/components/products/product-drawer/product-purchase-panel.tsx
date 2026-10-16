"use client";

import { useCallback, useMemo, useState } from "react";
import type { ColDef } from "ag-grid-community";
import { AgainListGrid, NUMERIC_CELL, NUMERIC_HEADER } from "@/components/shared/again-list-grid";
import {
  fetchProductPurchases,
  type ProductPurchaseLine,
  type ProductPurchaseMeta,
} from "@/lib/api/product-history";
import { formatCurrency, formatDate, formatQuantity } from "@/lib/utils";
import {
  DateRangeFilter,
  EMPTY_DATE_RANGE,
  HISTORY_GRID_CANVAS_CLASS,
  HISTORY_GRID_CLASS,
  PanelMessage,
  SummaryLine,
  type DateRange,
} from "./drawer-shared";
import { usePagedHistory } from "./use-paged-history";

export function ProductPurchasePanel({ itemId }: { itemId: string }) {
  const [range, setRange] = useState<DateRange>(EMPTY_DATE_RANGE);
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

  return (
    <AgainListGrid<ProductPurchaseLine>
      embedded
      className={HISTORY_GRID_CLASS}
      gridClassName={HISTORY_GRID_CANVAS_CLASS}
      rowData={list.rows}
      columnDefs={columnDefs}
      loading={list.loading && !list.loaded}
      filterBar={
        <DateRangeFilter
          value={range}
          onChange={(next) => {
            setRange(next);
            list.setPage(0);
          }}
        />
      }
      summary={
        list.meta ? (
          <SummaryLine
            testId="product-drawer-purchase-summary"
            items={[
              { label: "Total purchased qty", value: formatQuantity(list.meta.sum_qty) },
              { label: "Total purchase", value: formatCurrency(Number(list.meta.sum_total ?? 0)) },
            ]}
          />
        ) : undefined
      }
      serverPaging={{
        total: list.meta?.total ?? 0,
        page: list.page,
        pageSize: list.pageSize,
        onPageChange: list.setPage,
        onPageSizeChange: list.setPageSize,
      }}
      emptyTitle="No purchases yet"
      emptyHint="Purchase order lines for this product will appear here."
    />
  );
}
