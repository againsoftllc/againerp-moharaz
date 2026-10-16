"use client";

import { useCallback, useMemo } from "react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { AgainListGrid } from "@/components/shared/again-list-grid";
import { GridChipBadge } from "@/components/shared/grid-chip-badge";
import { fetchProductRma, type ProductHistoryMeta, type ProductRmaLine } from "@/lib/api/product-history";
import {
  RMA_STATUS_LABEL,
  RMA_STATUS_TONE,
  WARRANTY_LABEL,
  WARRANTY_TONE,
  type RmaStatus,
  type WarrantyStatus,
} from "@/lib/api/rma";
import { formatDate } from "@/lib/utils";
import { HISTORY_GRID_CANVAS_CLASS, HISTORY_GRID_CLASS, PanelMessage } from "./drawer-shared";
import { usePagedHistory } from "./use-paged-history";

export function ProductRmaPanel({ itemId }: { itemId: string }) {
  const load = useCallback(
    (page: number, perPage: number) => fetchProductRma(itemId, { page, perPage }),
    [itemId],
  );
  const list = usePagedHistory<ProductRmaLine, ProductHistoryMeta>(load);

  const columnDefs = useMemo<ColDef<ProductRmaLine>[]>(
    () => [
      {
        colId: "serial_number",
        headerName: "Serial / IMEI",
        width: 150,
        minWidth: 120,
        cellClass: "font-mono text-[11px]",
        valueGetter: (p) => p.data?.serial_number || "—",
      },
      {
        colId: "customer",
        headerName: "Customer",
        flex: 1,
        minWidth: 120,
        valueGetter: (p) => p.data?.customer_name || "—",
      },
      {
        colId: "order_number",
        headerName: "Invoice",
        width: 120,
        minWidth: 100,
        cellClass: "font-mono text-[11px]",
        valueGetter: (p) => p.data?.order_number || "—",
      },
      {
        colId: "warranty_status",
        headerName: "Warranty status",
        field: "warranty_status",
        width: 130,
        minWidth: 110,
        cellRenderer: (p: ICellRendererParams<ProductRmaLine>) => {
          const status = p.data?.warranty_status as WarrantyStatus | null | undefined;
          if (!status) return "—";
          return (
            <GridChipBadge className={WARRANTY_TONE[status] ?? ""} title={WARRANTY_LABEL[status] ?? status}>
              {WARRANTY_LABEL[status] ?? status}
            </GridChipBadge>
          );
        },
      },
      {
        colId: "warranty_expires_on",
        headerName: "Warranty end",
        width: 110,
        minWidth: 96,
        valueGetter: (p) => (p.data?.warranty_expires_on ? formatDate(p.data.warranty_expires_on) : "—"),
      },
      {
        colId: "rma_number",
        headerName: "RMA",
        width: 120,
        minWidth: 100,
        cellClass: "font-mono text-[11px]",
        valueGetter: (p) => p.data?.rma_number || "—",
      },
      {
        colId: "status",
        headerName: "Status",
        field: "status",
        width: 130,
        minWidth: 110,
        cellRenderer: (p: ICellRendererParams<ProductRmaLine>) => {
          const status = p.data?.status as RmaStatus | null | undefined;
          if (!status) return "—";
          return (
            <GridChipBadge className={RMA_STATUS_TONE[status] ?? ""} title={RMA_STATUS_LABEL[status] ?? status}>
              {RMA_STATUS_LABEL[status] ?? status}
            </GridChipBadge>
          );
        },
      },
    ],
    [],
  );

  if (list.error) return <PanelMessage title="Could not load RMA claims" hint={list.error} tone="error" />;

  return (
    <AgainListGrid<ProductRmaLine>
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
      emptyTitle="No warranty or RMA claims"
      emptyHint="Service claims raised against this product will appear here."
    />
  );
}
