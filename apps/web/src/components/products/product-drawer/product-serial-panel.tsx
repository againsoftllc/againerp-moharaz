"use client";

import { useCallback, useMemo, useState } from "react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { Input } from "@/components/ui/input";
import { AgainListGrid } from "@/components/shared/again-list-grid";
import { GridChipBadge } from "@/components/shared/grid-chip-badge";
import { SerialDetailSheet } from "@/components/inventory/serial-detail-sheet";
import {
  fetchSerials,
  SERIAL_STATUS_LABEL,
  SERIAL_STATUS_TONE,
  serialLocationLabel,
  type InventorySerial,
  type SerialListMeta,
} from "@/lib/api/inventory-serials";
import { formatDate } from "@/lib/utils";
import { HISTORY_GRID_CANVAS_CLASS, HISTORY_GRID_CLASS, PanelMessage } from "./drawer-shared";
import { usePagedHistory } from "./use-paged-history";

export function ProductSerialPanel({ itemId }: { itemId: string }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<InventorySerial | null>(null);
  const load = useCallback(
    (page: number, perPage: number) =>
      fetchSerials({ item_id: itemId, q: search, limit: perPage, offset: page * perPage }),
    [itemId, search],
  );
  const list = usePagedHistory<InventorySerial, SerialListMeta>(load);

  // Older API builds don't report total_matching; fall back to the rows seen so far.
  const total = list.meta?.total_matching ?? list.page * list.pageSize + list.rows.length;

  const columnDefs = useMemo<ColDef<InventorySerial>[]>(
    () => [
      {
        colId: "serial_number",
        headerName: "Serial / IMEI",
        field: "serial_number",
        flex: 1,
        minWidth: 150,
        cellClass: "font-mono text-[11px] font-medium",
      },
      {
        colId: "status",
        headerName: "Status",
        field: "status",
        width: 110,
        minWidth: 96,
        cellRenderer: (p: ICellRendererParams<InventorySerial>) =>
          p.data ? (
            <GridChipBadge className={SERIAL_STATUS_TONE[p.data.status] ?? ""} title={SERIAL_STATUS_LABEL[p.data.status]}>
              {SERIAL_STATUS_LABEL[p.data.status] ?? p.data.status}
            </GridChipBadge>
          ) : null,
      },
      {
        colId: "warehouse",
        headerName: "Warehouse",
        width: 130,
        minWidth: 100,
        valueGetter: (p) => (p.data ? serialLocationLabel(p.data) : "—"),
      },
      {
        colId: "customer",
        headerName: "Customer",
        width: 140,
        minWidth: 110,
        valueGetter: (p) => p.data?.customer_name?.trim() || "—",
      },
      {
        colId: "order_number",
        headerName: "Invoice/Order",
        width: 120,
        minWidth: 100,
        cellClass: "font-mono text-[11px]",
        valueGetter: (p) => p.data?.order_number || "—",
      },
      {
        colId: "warranty",
        headerName: "Warranty",
        width: 100,
        minWidth: 90,
        valueGetter: (p) => (p.data?.warranty_expires_on ? formatDate(p.data.warranty_expires_on) : "—"),
      },
    ],
    [],
  );

  if (list.error) return <PanelMessage title="Could not load serials" hint={list.error} tone="error" />;

  return (
    <>
      <AgainListGrid<InventorySerial>
        embedded
        className={HISTORY_GRID_CLASS}
        gridClassName={HISTORY_GRID_CANVAS_CLASS}
        rowData={list.rows}
        columnDefs={columnDefs}
        loading={list.loading && !list.loaded}
        onRowClicked={setSelected}
        filterBar={
          <Input
            placeholder="Search serial, customer, order…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              list.setPage(0);
            }}
            aria-label="Search serials"
            className="h-7 w-[220px] shrink-0 rounded-none"
          />
        }
        serverPaging={{
          total,
          page: list.page,
          pageSize: list.pageSize,
          onPageChange: list.setPage,
          onPageSizeChange: list.setPageSize,
        }}
        emptyTitle={search ? "No serials match" : "No serials registered"}
        emptyHint={search ? "Try a different serial, customer or order number." : "Units are registered on receipt."}
      />
      <SerialDetailSheet
        open={selected !== null}
        serial={selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </>
  );
}
