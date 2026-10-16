"use client";

import { useCallback, useMemo } from "react";
import type { ColDef } from "ag-grid-community";
import { AgainListGrid, NUMERIC_CELL, NUMERIC_HEADER } from "@/components/shared/again-list-grid";
import {
  fetchProductPriceHistory,
  type ProductPriceHistoryLine,
  type ProductPriceHistoryMeta,
} from "@/lib/api/product-history";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { HISTORY_GRID_CANVAS_CLASS, HISTORY_GRID_CLASS, PanelMessage } from "./drawer-shared";
import { usePagedHistory } from "./use-paged-history";

const moneyOrDash = (value: unknown) =>
  value === null || value === undefined || value === "" ? "—" : formatCurrency(Number(value));

export function ProductPriceHistoryPanel({ itemId }: { itemId: string }) {
  const load = useCallback(
    (page: number, perPage: number) => fetchProductPriceHistory(itemId, { page, perPage }),
    [itemId],
  );
  const list = usePagedHistory<ProductPriceHistoryLine, ProductPriceHistoryMeta>(load);

  const columnDefs = useMemo<ColDef<ProductPriceHistoryLine>[]>(
    () => [
      {
        colId: "date",
        headerName: "Date",
        field: "date",
        width: 150,
        minWidth: 130,
        valueFormatter: (p) => formatDateTime(p.value),
      },
      {
        colId: "price_type",
        headerName: "Price type",
        flex: 1,
        minWidth: 120,
        // Label is server-provided; never map price types client-side.
        valueGetter: (p) => p.data?.price_label || p.data?.price_type || "—",
      },
      {
        colId: "old_price",
        headerName: "Old price",
        field: "old_price",
        width: 120,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueFormatter: (p) => moneyOrDash(p.value),
      },
      {
        colId: "new_price",
        headerName: "New price",
        field: "new_price",
        width: 120,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueFormatter: (p) => moneyOrDash(p.value),
      },
    ],
    [],
  );

  if (list.error) return <PanelMessage title="Could not load price history" hint={list.error} tone="error" />;

  return (
    <AgainListGrid<ProductPriceHistoryLine>
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
      emptyTitle="No price changes recorded"
      emptyHint="Selling and cost price changes will appear here."
    />
  );
}
