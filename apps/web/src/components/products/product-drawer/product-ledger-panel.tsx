"use client";

import { useCallback, useMemo, useState } from "react";
import type { ColDef } from "ag-grid-community";
import { AgainListGrid, NUMERIC_CELL, NUMERIC_HEADER } from "@/components/shared/again-list-grid";
import { FilterSelect } from "@/components/shared/filter-select";
import { fetchProductLedger, type ProductLedgerLine, type ProductLedgerMeta } from "@/lib/api/product-history";
import { formatDate, formatQuantity } from "@/lib/utils";
import {
  DateRangeFilter,
  EMPTY_DATE_RANGE,
  HISTORY_GRID_CANVAS_CLASS,
  HISTORY_GRID_CLASS,
  PanelMessage,
  type DateRange,
} from "./drawer-shared";
import { usePagedHistory } from "./use-paged-history";

const qtyOrDash = (value: unknown) => (Number(value) ? formatQuantity(value) : "—");

export function ProductLedgerPanel({ itemId }: { itemId: string }) {
  const [range, setRange] = useState<DateRange>(EMPTY_DATE_RANGE);
  const [movementType, setMovementType] = useState("all");
  const load = useCallback(
    (page: number, perPage: number) =>
      fetchProductLedger(itemId, {
        page,
        perPage,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        movementType,
      }),
    [itemId, range.dateFrom, range.dateTo, movementType],
  );
  const list = usePagedHistory<ProductLedgerLine, ProductLedgerMeta>(load);

  // Options are server-provided (all movement types for this item) — never hardcoded.
  const typeOptions = list.meta?.movement_types ?? [];

  const columnDefs = useMemo<ColDef<ProductLedgerLine>[]>(
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
        colId: "reference",
        headerName: "Reference",
        width: 140,
        minWidth: 110,
        cellClass: "font-mono text-[11px]",
        valueGetter: (p) => p.data?.reference || "—",
      },
      {
        colId: "type",
        headerName: "Type",
        flex: 1,
        minWidth: 120,
        valueGetter: (p) => p.data?.movement_label || p.data?.movement_type || "—",
      },
      {
        colId: "qty_in",
        headerName: "In",
        field: "qty_in",
        width: 80,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueFormatter: (p) => qtyOrDash(p.value),
      },
      {
        colId: "qty_out",
        headerName: "Out",
        field: "qty_out",
        width: 80,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueFormatter: (p) => qtyOrDash(p.value),
      },
      {
        colId: "balance",
        headerName: "Balance",
        field: "balance",
        width: 100,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueFormatter: (p) => formatQuantity(p.value),
      },
    ],
    [],
  );

  if (list.error) return <PanelMessage title="Could not load ledger" hint={list.error} tone="error" />;

  return (
    <AgainListGrid<ProductLedgerLine>
      embedded
      className={HISTORY_GRID_CLASS}
      gridClassName={HISTORY_GRID_CANVAS_CLASS}
      rowData={list.rows}
      columnDefs={columnDefs}
      loading={list.loading && !list.loaded}
      filterBar={
        <>
          <FilterSelect
            value={movementType}
            onChange={(next) => {
              setMovementType(next);
              list.setPage(0);
            }}
            width="w-[150px]"
            className="h-7 shrink-0"
            ariaLabel="Movement type"
            options={[{ value: "all", label: "All types" }, ...typeOptions]}
          />
          <DateRangeFilter
            value={range}
            onChange={(next) => {
              setRange(next);
              list.setPage(0);
            }}
          />
        </>
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
