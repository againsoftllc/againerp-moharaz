"use client";

import { useEffect, useMemo, useState } from "react";
import type { ColDef } from "ag-grid-community";
import { AgainListGrid, NUMERIC_CELL, NUMERIC_HEADER } from "@/components/shared/again-list-grid";
import { fetchSupplierStockReport, type SupplierStockReportRow } from "@/lib/api/purchase-orders";
import { cn, formatCurrency, formatQuantity } from "@/lib/utils";

/** AgainPOS "Stock Report" tab: what's been purchased from this supplier vs.
 * current stock. Sold/Transferred are computed at the item level (all
 * warehouses, all time) — AgainERP doesn't link stock movements back to
 * their originating PO line, so per-supplier sell-through can't be
 * attributed the way AgainPOS does. */
export function PartnerStockReportPanel({
  supplierId,
  fillHeight,
}: {
  supplierId: string;
  fillHeight?: boolean;
}) {
  const [rows, setRows] = useState<SupplierStockReportRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchSupplierStockReport(supplierId)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [supplierId]);

  const columnDefs = useMemo<ColDef<SupplierStockReportRow & { id: string }>[]>(
    () => [
      { colId: "product", headerName: "Product", field: "name", flex: 1.4, minWidth: 160 },
      { colId: "sku", headerName: "SKU", field: "sku", width: 120, minWidth: 100, cellClass: "font-mono text-[11px]" },
      {
        colId: "purchasedQty",
        headerName: "Purchase Quantity",
        field: "purchasedQty",
        width: 130,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueFormatter: (p) => formatQuantity(Number(p.value ?? 0)),
      },
      {
        colId: "totalSold",
        headerName: "Total Sold",
        field: "totalSold",
        width: 110,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueFormatter: (p) => formatQuantity(Number(p.value ?? 0)),
      },
      {
        colId: "totalTransferred",
        headerName: "Total Unit Transferred",
        field: "totalTransferred",
        width: 130,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueFormatter: (p) => formatQuantity(Number(p.value ?? 0)),
      },
      {
        colId: "returnedQty",
        headerName: "Total returned",
        field: "returnedQty",
        width: 110,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueFormatter: (p) => formatQuantity(Number(p.value ?? 0)),
      },
      {
        colId: "currentStock",
        headerName: "Current stock",
        field: "currentStock",
        width: 110,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: `${NUMERIC_CELL} font-medium`,
        valueFormatter: (p) => formatQuantity(Number(p.value ?? 0)),
      },
      {
        colId: "stockValue",
        headerName: "Current Stock Value",
        field: "stockValue",
        width: 140,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueFormatter: (p) => formatCurrency(Number(p.value ?? 0)),
      },
    ],
    [],
  );

  const rowData = useMemo(() => rows.map((row) => ({ ...row, id: row.itemId })), [rows]);

  const totalsRow = useMemo(
    () => ({
      id: "__totals__",
      itemId: "__totals__",
      sku: "",
      name: "Total",
      purchasedQty: rows.reduce((sum, r) => sum + r.purchasedQty, 0),
      totalSold: rows.reduce((sum, r) => sum + r.totalSold, 0),
      totalTransferred: rows.reduce((sum, r) => sum + r.totalTransferred, 0),
      returnedQty: rows.reduce((sum, r) => sum + r.returnedQty, 0),
      currentStock: rows.reduce((sum, r) => sum + r.currentStock, 0),
      stockValue: rows.reduce((sum, r) => sum + r.stockValue, 0),
    }),
    [rows],
  );

  return (
    <AgainListGrid<SupplierStockReportRow & { id: string }>
      embedded
      className={fillHeight ? "flex min-h-0 flex-1 flex-col" : "h-[360px]"}
      gridClassName={cn(
        "[&_.ag-row-pinned]:font-semibold [&_.ag-row-pinned]:bg-muted/50",
        fillHeight &&
          "[&_.ag-root-wrapper]:flex [&_.ag-root-wrapper]:flex-col [&_.ag-root-wrapper-body]:min-h-0 [&_.ag-root-wrapper-body]:flex-1",
      )}
      rowData={rowData}
      columnDefs={columnDefs}
      loading={loading}
      emptyTitle="No stock activity yet"
      emptyHint="Products purchased from this supplier will appear here once a PO has been received."
      gridProps={{ pinnedBottomRowData: rows.length > 0 ? [totalsRow] : [] }}
    />
  );
}
