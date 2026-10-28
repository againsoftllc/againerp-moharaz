"use client";

import "@/components/providers/ag-grid-provider";
import { forwardRef, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ICellRendererParams } from "ag-grid-community";
import { Ban, Eye, PackageCheck, PackagePlus, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GridChipBadge } from "@/components/shared/grid-chip-badge";
import { DateRangePresetPicker } from "@/components/shared/date-range-preset-picker";
import { FilterSelect } from "@/components/shared/filter-select";
import { RowActionsTrigger } from "@/components/shared/row-actions-icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FinanceAgListGrid,
  NUMERIC_CELL,
  NUMERIC_HEADER,
  type FinanceAgListGridColumn,
  type FinanceAgListGridHandle,
} from "@/components/finance/finance-ag-list-grid";
import { transferLabel, transferTone, type ApiStockTransfer } from "@/lib/api/stock-transfers";
import { printStockTransfer } from "@/lib/inventory/transfer-print";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";

export type StockTransferGridHandle = FinanceAgListGridHandle;

type Filters = {
  search: string;
  status: string;
  from: string;
  to: string;
  createdBy: string;
  dateFrom: string;
  dateTo: string;
};
const DEFAULT_FILTERS: Filters = { search: "", status: "all", from: "all", to: "all", createdBy: "all", dateFrom: "", dateTo: "" };

const FILTER_TOGGLES = [
  { key: "search", label: "Search" },
  { key: "status", label: "Status" },
  { key: "from", label: "From warehouse" },
  { key: "to", label: "To warehouse" },
  { key: "createdBy", label: "Created by" },
  { key: "date", label: "Date" },
];

const unitsOf = (row: ApiStockTransfer) => row.lines.reduce((sum, l) => sum + l.quantity, 0);
const receivedOf = (row: ApiStockTransfer) => row.lines.reduce((sum, l) => sum + l.received_qty, 0);
const shippedOf = (row: ApiStockTransfer) => row.lines.reduce((sum, l) => sum + (l.shipped_qty || 0), 0);
const valueOf = (row: ApiStockTransfer) => row.lines.reduce((sum, l) => sum + l.quantity * Number(l.unit_cost ?? 0), 0);

/** A cancelled transfer is not live: dimmed so the live ones stand out (datatablecommon.md §3.3). */
const dim = (p: { data?: ApiStockTransfer }) => (p.data?.status === "cancelled" ? "opacity-45" : "");
const dimWith = (cls: string) => (p: { data?: ApiStockTransfer }) => [cls, dim(p)].filter(Boolean);

type Props = {
  transfers: ApiStockTransfer[];
  warehouses?: { id: string; name: string }[];
  loading?: boolean;
  onView: (row: ApiStockTransfer) => void;
  onShip?: (row: ApiStockTransfer) => Promise<void>;
  onReceive?: (row: ApiStockTransfer) => void;
  onCancel?: (row: ApiStockTransfer) => Promise<void>;
  onFilterCountChange?: (count: number) => void;
  headerLeftActions?: ReactNode;
  footerLeftActions?: (visible: ApiStockTransfer[]) => ReactNode;
  className?: string;
};

/**
 * Stock transfers as the common datatable (docs/common/datatablecommon.md): the finance-style shell with a pinned actions column,
 * Columns + Filters drawers (saved per user), CSV export and phone cards. A row click opens the transfer's drawer.
 */
export const StockTransferGrid = forwardRef<StockTransferGridHandle, Props>(function StockTransferGrid(
  { transfers, warehouses = [], loading = false, onView, onShip, onReceive, onCancel, onFilterCountChange, headerLeftActions, footerLeftActions, className },
  ref,
) {
  const canWrite = useAdminCanWrite();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((f) => ({ ...f, [key]: value }));

  const creators = useMemo(
    () => [...new Set(transfers.map((row) => row.requested_by_name).filter((name): name is string => Boolean(name)))].sort(),
    [transfers],
  );

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return transfers.filter((row) => {
      if (q) {
        const hay = `${row.transfer_number} ${row.reference_number ?? ""} ${row.from_warehouse_name ?? ""} ${row.to_warehouse_name ?? ""} ${row.requested_by_name ?? ""} ${row.lines.map((l) => `${l.sku} ${l.name}`).join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.status !== "all" && row.status !== filters.status) return false;
      if (filters.from !== "all" && row.from_warehouse_id !== filters.from) return false;
      if (filters.to !== "all" && row.to_warehouse_id !== filters.to) return false;
      if (filters.createdBy !== "all" && (row.requested_by_name ?? "") !== filters.createdBy) return false;
      if (filters.dateFrom && row.transfer_date < filters.dateFrom) return false;
      if (filters.dateTo && row.transfer_date > filters.dateTo) return false;
      return true;
    });
  }, [transfers, filters]);

  const activeFilters =
    Number(Boolean(filters.search.trim())) +
    Number(filters.status !== "all") +
    Number(filters.from !== "all") +
    Number(filters.to !== "all") +
    Number(filters.createdBy !== "all") +
    Number(Boolean(filters.dateFrom || filters.dateTo));

  useEffect(() => {
    onFilterCountChange?.(activeFilters);
  }, [activeFilters, onFilterCountChange]);

  const rowActions = useMemo(
    () =>
      function RowActions(row: ApiStockTransfer) {
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <RowActionsTrigger />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => onView(row)}>
                <Eye className="mr-1.5 h-3 w-3" /> View
              </DropdownMenuItem>
              {canWrite && row.status === "draft" && onShip ? (
                <DropdownMenuItem onClick={() => void onShip(row)}>
                  <PackageCheck className="mr-1.5 h-3 w-3" /> Ship
                </DropdownMenuItem>
              ) : null}
              {canWrite && (row.status === "in_transit" || row.status === "partial_received") && onReceive ? (
                <DropdownMenuItem onClick={() => onReceive(row)}>
                  <PackagePlus className="mr-1.5 h-3 w-3" /> Receive
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                onClick={() => {
                  if (!printStockTransfer(row)) toast.info("Allow pop-ups to open the transfer note.");
                }}
              >
                <Printer className="mr-1.5 h-3 w-3" /> Print note
              </DropdownMenuItem>
              {canWrite && row.status === "draft" && onCancel ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => void onCancel(row)}>
                    <Ban className="mr-1.5 h-3 w-3" /> Cancel
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    [canWrite, onCancel, onReceive, onShip, onView],
  );

  const columns = useMemo<FinanceAgListGridColumn<any>[]>(
    () => [
      { colId: "number", field: "transfer_number", headerName: "Transfer No", width: 140, minWidth: 110, cellClass: dimWith("font-semibold") },
      { colId: "from", field: "from_warehouse_name", headerName: "From", flex: 1, minWidth: 140, cellClass: dim },
      { colId: "to", field: "to_warehouse_name", headerName: "To", flex: 1, minWidth: 140, cellClass: dim },
      { colId: "date", field: "transfer_date", headerName: "Transfer Date", width: 120, cellClass: dim, valueFormatter: (p) => formatDate(p.value) },
      {
        colId: "items",
        headerName: "Products",
        width: 110,
        cellClass: dim,
        valueGetter: (p) => p.data?.item_count ?? 0,
        valueFormatter: (p) => `${p.value ?? 0} product${Number(p.value) === 1 ? "" : "s"}`,
      },
      {
        colId: "units",
        headerName: "Units",
        width: 80,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: dimWith(NUMERIC_CELL),
        valueGetter: (p) => (p.data ? unitsOf(p.data) : 0),
      },
      {
        // how much of what was shipped has arrived: "4 / 12"
        colId: "received",
        headerName: "Received",
        width: 110,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: dimWith(NUMERIC_CELL),
        valueGetter: (p) => (p.data ? `${receivedOf(p.data)} / ${shippedOf(p.data)}` : ""),
        valueFormatter: (p) => (p.data && (p.data.status === "draft" || p.data.status === "cancelled") ? "—" : String(p.value ?? "—")),
      },
      {
        colId: "status",
        field: "status",
        headerName: "Status",
        width: 140,
        cellClass: dim,
        cellRenderer: (p: ICellRendererParams<ApiStockTransfer>) =>
          p.data ? (
            <GridChipBadge className={transferTone(p.data.status)} title={transferLabel(p.data.status)}>
              {transferLabel(p.data.status)}
            </GridChipBadge>
          ) : null,
      },
      { colId: "reference", field: "reference_number", headerName: "Source Document", width: 150, hide: true, cellClass: dim, valueFormatter: (p) => p.value || "—" },
      {
        colId: "value",
        headerName: "Value",
        width: 120,
        hide: true,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: dimWith(NUMERIC_CELL),
        valueGetter: (p) => (p.data ? valueOf(p.data) : 0),
        valueFormatter: (p) => (Number(p.value) > 0 ? formatCurrency(Number(p.value)) : "—"),
      },
      { colId: "createdBy", field: "requested_by_name", headerName: "Created By", width: 140, hide: true, cellClass: dim, valueFormatter: (p) => p.value || "—" },
      { colId: "shipped", field: "shipped_at", headerName: "Shipped", width: 150, hide: true, cellClass: dim, valueFormatter: (p) => (p.value ? formatDateTime(p.value) : "—") },
      { colId: "completed", field: "completed_at", headerName: "Completed", width: 150, hide: true, cellClass: dim, valueFormatter: (p) => (p.value ? formatDateTime(p.value) : "—") },
    ],
    [],
  );

  return (
    <FinanceAgListGrid
      className={className}
      gridRef={ref}
      storageKey="stock-transfers"
      rows={filtered}
      columns={columns as unknown as FinanceAgListGridColumn[]}
      loading={loading}
      headerLeftActions={headerLeftActions}
      footerLeftActions={footerLeftActions?.(filtered)}
      rowActions={rowActions as unknown as (row: any) => ReactNode}
      onRowClicked={(row) => onView(row as ApiStockTransfer)}
      onResetFilters={() => setFilters(DEFAULT_FILTERS)}
      filterToggles={FILTER_TOGGLES}
      emptyTitle={transfers.length === 0 ? "No stock transfers yet" : "No stock transfers match your filters"}
      emptyHint={transfers.length === 0 ? "Click New to move stock from one warehouse to another." : undefined}
      csvFileName={`stock-transfers-${new Date().toISOString().slice(0, 10)}.csv`}
      csvHeaders={["Transfer No", "From", "To", "Date", "Source Document", "Products", "Units", "Received", "Value", "Status", "Created By"]}
      csvRow={(row: ApiStockTransfer) => [
        row.transfer_number,
        row.from_warehouse_name ?? "",
        row.to_warehouse_name ?? "",
        row.transfer_date,
        row.reference_number ?? "",
        row.item_count,
        unitsOf(row),
        receivedOf(row),
        valueOf(row),
        transferLabel(row.status),
        row.requested_by_name ?? "",
      ]}
      mobileLine={(row: ApiStockTransfer) => ({
        title: `${row.transfer_number} · ${row.from_warehouse_name ?? "From"} → ${row.to_warehouse_name ?? "To"}`,
        meta: `${formatDate(row.transfer_date)} · ${transferLabel(row.status)}`,
        value: `${unitsOf(row)} unit${unitsOf(row) === 1 ? "" : "s"}`,
      })}
      filterBar={(visible) => (
        <>
          {visible.search !== false ? (
            <Input
              placeholder="Search transfer no, product, warehouse…"
              value={filters.search}
              onChange={(e) => set("search", e.target.value)}
              className="w-[260px] shrink-0 rounded-none"
            />
          ) : null}
          {visible.status !== false ? (
            <FilterSelect
              value={filters.status}
              onChange={(v) => set("status", v)}
              width="w-[160px]"
              className="shrink-0"
              ariaLabel="Status"
              options={[
                { value: "all", label: "All statuses" },
                { value: "draft", label: "Draft" },
                { value: "in_transit", label: "In Transit" },
                { value: "partial_received", label: "Partially Received" },
                { value: "completed", label: "Completed" },
                { value: "cancelled", label: "Cancelled" },
              ]}
            />
          ) : null}
          {visible.from !== false ? (
            <FilterSelect
              value={filters.from}
              onChange={(v) => set("from", v)}
              width="w-[160px]"
              className="shrink-0"
              ariaLabel="From warehouse"
              searchThreshold={8}
              options={[{ value: "all", label: "All from" }, ...warehouses.map((w) => ({ value: w.id, label: w.name }))]}
            />
          ) : null}
          {visible.to !== false ? (
            <FilterSelect
              value={filters.to}
              onChange={(v) => set("to", v)}
              width="w-[160px]"
              className="shrink-0"
              ariaLabel="To warehouse"
              searchThreshold={8}
              options={[{ value: "all", label: "All to" }, ...warehouses.map((w) => ({ value: w.id, label: w.name }))]}
            />
          ) : null}
          {visible.createdBy !== false ? (
            <FilterSelect
              value={filters.createdBy}
              onChange={(v) => set("createdBy", v)}
              width="w-[160px]"
              className="shrink-0"
              ariaLabel="Created by"
              searchThreshold={8}
              options={[{ value: "all", label: "All creators" }, ...creators.map((name) => ({ value: name, label: name }))]}
            />
          ) : null}
          {visible.date !== false ? (
            <DateRangePresetPicker
              value={{ dateFrom: filters.dateFrom, dateTo: filters.dateTo }}
              onChange={(next) => setFilters((f) => ({ ...f, dateFrom: next.dateFrom, dateTo: next.dateTo }))}
              buttonClassName="shrink-0"
            />
          ) : null}
          {activeFilters > 0 ? (
            <Button variant="ghost" size="sm" className="h-7 shrink-0 rounded-none text-xs" onClick={() => setFilters(DEFAULT_FILTERS)}>
              Clear
            </Button>
          ) : null}
        </>
      )}
    />
  );
});
