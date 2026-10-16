"use client";

import { useCallback, useMemo, useState } from "react";
import type { ColDef } from "ag-grid-community";
import { AgainListGrid, NUMERIC_CELL, NUMERIC_HEADER } from "@/components/shared/again-list-grid";
import { fetchProductSales, type ProductSalesLine, type ProductSalesMeta } from "@/lib/api/product-history";
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

export function ProductSalesPanel({ itemId }: { itemId: string }) {
  const [range, setRange] = useState<DateRange>(EMPTY_DATE_RANGE);
  const load = useCallback(
    (page: number, perPage: number) =>
      fetchProductSales(itemId, { page, perPage, dateFrom: range.dateFrom, dateTo: range.dateTo }),
    [itemId, range.dateFrom, range.dateTo],
  );
  const list = usePagedHistory<ProductSalesLine, ProductSalesMeta>(load);

  const columnDefs = useMemo<ColDef<ProductSalesLine>[]>(
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
        colId: "invoice",
        headerName: "Invoice",
        width: 130,
        minWidth: 110,
        cellClass: "font-mono text-[11px]",
        valueGetter: (p) => p.data?.invoice_number || p.data?.order_number || "—",
      },
      {
        colId: "customer",
        headerName: "Customer",
        flex: 1,
        minWidth: 140,
        valueGetter: (p) => p.data?.customer_name || "—",
      },
      {
        colId: "quantity",
        headerName: "Qty",
        field: "quantity",
        width: 80,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueFormatter: (p) => formatQuantity(p.value),
      },
      {
        colId: "unit_price",
        headerName: "Unit price",
        field: "unit_price",
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

  if (list.error) return <PanelMessage title="Could not load sales" hint={list.error} tone="error" />;

  return (
    <AgainListGrid<ProductSalesLine>
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
            testId="product-drawer-sales-summary"
            items={[
              { label: "Total sold qty", value: formatQuantity(list.meta.sum_qty) },
              { label: "Total sales", value: formatCurrency(Number(list.meta.sum_total ?? 0)) },
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
      emptyTitle="No sales yet"
      emptyHint="Invoice lines for this product will appear here."
    />
  );
}
