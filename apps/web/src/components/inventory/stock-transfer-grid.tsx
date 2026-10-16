"use client";

import "@/components/providers/ag-grid-provider";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ColDef, GridApi, ICellRendererParams } from "ag-grid-community";
import { Eye, PackageCheck, PackagePlus, Ban } from "lucide-react";
import { GridChipBadge } from "@/components/shared/grid-chip-badge";
import { Input } from "@/components/ui/input";
import { DateRangePresetPicker } from "@/components/shared/date-range-preset-picker";
import { FilterSelect } from "@/components/shared/filter-select";
import { RowActionsTrigger } from "@/components/shared/row-actions-icon";
import { GridFullscreenHeader } from "@/components/shared/grid-fullscreen";
import { AgainListGrid } from "@/components/shared/again-list-grid";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  transferLabel,
  transferTone,
  type ApiStockTransfer,
} from "@/lib/api/stock-transfers";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";

export type StockTransferGridHandle = {
  openFilters: () => void;
  openColumns: () => void;
  exportCsv: () => void;
};

export const StockTransferGrid = forwardRef<
  StockTransferGridHandle,
  {
    transfers: ApiStockTransfer[];
    warehouses?: { id: string; name: string }[];
    loading?: boolean;
    onView: (row: ApiStockTransfer) => void;
    onShip?: (row: ApiStockTransfer) => Promise<void>;
    onReceive?: (row: ApiStockTransfer) => void;
    onCancel?: (row: ApiStockTransfer) => Promise<void>;
    onFilterCountChange?: (count: number) => void;
    headerLeftActions?: ReactNode;
    footerLeftActions?: ReactNode;
    className?: string;
  }
>(function StockTransferGrid(
  {
    transfers,
    warehouses = [],
    loading = false,
    onView,
    onShip,
    onReceive,
    onCancel,
    onFilterCountChange,
    headerLeftActions,
    footerLeftActions,
    className,
  },
  ref,
) {
  const canWrite = useAdminCanWrite();
  const gridApiRef = useRef<GridApi<ApiStockTransfer> | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [fromId, setFromId] = useState("all");
  const [toId, setToId] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [createdBy, setCreatedBy] = useState("all");

  const creators = useMemo(() => {
    const names = new Set(
      transfers.map((row) => row.requested_by_name).filter((name): name is string => Boolean(name)),
    );
    return [...names].sort();
  }, [transfers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transfers.filter((row) => {
      if (q) {
        const hay = `${row.transfer_number} ${row.from_warehouse_name ?? ""} ${row.to_warehouse_name ?? ""} ${row.requested_by_name ?? ""} ${row.lines.map((l) => `${l.sku} ${l.name}`).join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (status !== "all" && row.status !== status) return false;
      if (fromId !== "all" && row.from_warehouse_id !== fromId) return false;
      if (toId !== "all" && row.to_warehouse_id !== toId) return false;
      if (createdBy !== "all" && (row.requested_by_name ?? "") !== createdBy) return false;
      if (dateFrom && row.transfer_date < dateFrom) return false;
      if (dateTo && row.transfer_date > dateTo) return false;
      return true;
    });
  }, [transfers, search, status, fromId, toId, createdBy, dateFrom, dateTo]);

  const filterCount = [search.trim(), status !== "all", fromId !== "all", toId !== "all", createdBy !== "all", dateFrom, dateTo].filter(Boolean).length;
  useEffect(() => {
    onFilterCountChange?.(filterCount);
  }, [filterCount, onFilterCountChange]);

  const resetFilters = useCallback(() => {
    setSearch("");
    setStatus("all");
    setFromId("all");
    setToId("all");
    setCreatedBy("all");
    setDateFrom("");
    setDateTo("");
  }, []);

  const exportCsv = useCallback(() => {
    const header = ["Transfer No", "From", "To", "Date", "Items", "Status", "Created By"];
    const body = filtered.map((row) =>
      [row.transfer_number, row.from_warehouse_name ?? "", row.to_warehouse_name ?? "", row.transfer_date, row.item_count, transferLabel(row.status), row.requested_by_name ?? ""]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stock-transfers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered]);

  useImperativeHandle(ref, () => ({
    openFilters: () => undefined,
    openColumns: () => undefined,
    exportCsv,
  }), [exportCsv]);

  const RowMenu = useCallback(
    ({ data }: { data: ApiStockTransfer }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <RowActionsTrigger />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => onView(data)}>
            <Eye className="mr-1.5 h-3 w-3" /> View
          </DropdownMenuItem>
          {canWrite && data.status === "draft" && onShip && (
            <DropdownMenuItem onClick={() => void onShip(data)}>
              <PackageCheck className="mr-1.5 h-3 w-3" /> Ship
            </DropdownMenuItem>
          )}
          {canWrite && (data.status === "in_transit" || data.status === "partial_received") && onReceive && (
            <DropdownMenuItem onClick={() => onReceive(data)}>
              <PackagePlus className="mr-1.5 h-3 w-3" /> Receive
            </DropdownMenuItem>
          )}
          {canWrite && data.status === "draft" && onCancel && (
            <DropdownMenuItem onClick={() => void onCancel(data)}>
              <Ban className="mr-1.5 h-3 w-3" /> Cancel
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    [canWrite, onCancel, onReceive, onShip, onView],
  );

  const columnDefs = useMemo<ColDef<ApiStockTransfer>[]>(
    () => [
      {
        colId: "actions",
        headerName: "",
        width: 26,
        maxWidth: 26,
        minWidth: 26,
        pinned: "left",
        resizable: false,
        sortable: false,
        headerComponent: GridFullscreenHeader,
        cellRenderer: (p: ICellRendererParams<ApiStockTransfer>) =>
          p.data ? <RowMenu data={p.data} /> : null,
      },
      {
        colId: "number",
        field: "transfer_number",
        headerName: "Transfer No",
        width: 140,
        cellClass: "font-mono text-[11px]",
        cellRenderer: (p: ICellRendererParams<ApiStockTransfer>) =>
          p.data ? (
            <button type="button" className="truncate font-semibold hover:text-primary" onClick={() => onView(p.data!)}>
              {p.data.transfer_number}
            </button>
          ) : null,
      },
      { colId: "from", field: "from_warehouse_name", headerName: "From", flex: 1, minWidth: 140 },
      { colId: "to", field: "to_warehouse_name", headerName: "To", flex: 1, minWidth: 140 },
      { colId: "date", field: "transfer_date", headerName: "Transfer Date", width: 120 },
      {
        colId: "items",
        headerName: "Items",
        width: 110,
        valueGetter: (p) => p.data?.item_count ?? 0,
        valueFormatter: (p) => `${p.value ?? 0} product${Number(p.value) === 1 ? "" : "s"}`,
      },
      {
        colId: "status",
        field: "status",
        headerName: "Status",
        width: 140,
        cellRenderer: (p: ICellRendererParams<ApiStockTransfer>) =>
          p.data ? (
            <GridChipBadge className={transferTone(p.data.status)} title={transferLabel(p.data.status)}>
              {transferLabel(p.data.status)}
            </GridChipBadge>
          ) : null,
      },
      {
        colId: "createdBy",
        field: "requested_by_name",
        headerName: "Created By",
        width: 140,
        valueFormatter: (p) => (p.value ? String(p.value) : "—"),
      },
    ],
    [RowMenu, onView],
  );

  return (
    <AgainListGrid<ApiStockTransfer>
      className={className}
      rowData={filtered}
      columnDefs={columnDefs}
      loading={loading}
      headerLeftActions={headerLeftActions}
      footerLeftActions={footerLeftActions}
      filterBar={
        <>
          <Input
            placeholder="Search transfer no, product, warehouse…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-[260px] shrink-0 rounded-none"
          />
          <FilterSelect
            value={status}
            onChange={setStatus}
            width="w-[160px]"
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
          <FilterSelect
            value={fromId}
            onChange={setFromId}
            width="w-[160px]"
            ariaLabel="From warehouse"
            options={[{ value: "all", label: "All from" }, ...warehouses.map((w) => ({ value: w.id, label: w.name }))]}
          />
          <FilterSelect
            value={toId}
            onChange={setToId}
            width="w-[160px]"
            ariaLabel="To warehouse"
            options={[{ value: "all", label: "All to" }, ...warehouses.map((w) => ({ value: w.id, label: w.name }))]}
          />
          <FilterSelect
            value={createdBy}
            onChange={setCreatedBy}
            width="w-[160px]"
            ariaLabel="Created by"
            options={[{ value: "all", label: "All creators" }, ...creators.map((name) => ({ value: name, label: name }))]}
          />
          <DateRangePresetPicker
            value={{ dateFrom, dateTo }}
            onChange={(next) => {
              setDateFrom(next.dateFrom);
              setDateTo(next.dateTo);
            }}
            buttonClassName="shrink-0"
          />
        </>
      }
      emptyTitle={filterCount > 0 ? "No stock transfers match your filters" : "No stock transfers"}
      emptyHint={filterCount > 0 ? undefined : "Create a transfer to move stock between warehouses"}
      onResetFilters={filterCount > 0 ? resetFilters : undefined}
      apiRef={gridApiRef}
      mobile={
        <div className="divide-y divide-border">
          {filtered.map((row) => (
            <button key={row.id} type="button" className="block w-full px-3 py-2.5 text-left" onClick={() => onView(row)}>
              <p className="font-mono text-sm font-medium">{row.transfer_number}</p>
              <p className="text-[11px] text-muted-foreground">
                {row.from_warehouse_name ?? "From"} → {row.to_warehouse_name ?? "To"} · {transferLabel(row.status)}
              </p>
            </button>
          ))}
        </div>
      }
    />
  );
});
