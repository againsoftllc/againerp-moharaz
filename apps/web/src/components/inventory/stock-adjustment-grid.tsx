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
import { Eye, Check, Ban } from "lucide-react";
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
  ADJUSTMENT_REASONS,
  adjustmentLabel,
  adjustmentTone,
  adjustmentTypeLabel,
  type ApiStockAdjustment,
} from "@/lib/api/stock-adjustments";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";

export type StockAdjustmentGridHandle = {
  openFilters: () => void;
  openColumns: () => void;
  exportCsv: () => void;
};

export const StockAdjustmentGrid = forwardRef<
  StockAdjustmentGridHandle,
  {
    adjustments: ApiStockAdjustment[];
    warehouses?: { id: string; name: string }[];
    loading?: boolean;
    onView: (row: ApiStockAdjustment) => void;
    onApply?: (row: ApiStockAdjustment) => Promise<void>;
    onCancel?: (row: ApiStockAdjustment) => Promise<void>;
    onFilterCountChange?: (count: number) => void;
    headerLeftActions?: ReactNode;
    footerLeftActions?: ReactNode;
    className?: string;
  }
>(function StockAdjustmentGrid(
  {
    adjustments,
    warehouses = [],
    loading = false,
    onView,
    onApply,
    onCancel,
    onFilterCountChange,
    headerLeftActions,
    footerLeftActions,
    className,
  },
  ref,
) {
  const canWrite = useAdminCanWrite();
  const gridApiRef = useRef<GridApi<ApiStockAdjustment> | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [warehouseId, setWarehouseId] = useState("all");
  const [reason, setReason] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [createdBy, setCreatedBy] = useState("all");

  const creators = useMemo(() => {
    const names = new Set(
      adjustments.map((row) => row.created_by_name).filter((name): name is string => Boolean(name)),
    );
    return [...names].sort();
  }, [adjustments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return adjustments.filter((row) => {
      if (q) {
        const hay = `${row.adjustment_number} ${row.warehouse_name ?? ""} ${row.created_by_name ?? ""} ${row.reason_label} ${row.lines.map((l) => `${l.sku} ${l.name}`).join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (status !== "all" && row.status !== status) return false;
      if (type !== "all" && row.adjustment_type !== type) return false;
      if (warehouseId !== "all" && row.warehouse_id !== warehouseId) return false;
      if (reason !== "all" && row.reason !== reason) return false;
      if (createdBy !== "all" && (row.created_by_name ?? "") !== createdBy) return false;
      if (dateFrom && row.adjustment_date < dateFrom) return false;
      if (dateTo && row.adjustment_date > dateTo) return false;
      return true;
    });
  }, [adjustments, search, status, type, warehouseId, reason, createdBy, dateFrom, dateTo]);

  const filterCount = [
    search.trim(),
    status !== "all",
    type !== "all",
    warehouseId !== "all",
    reason !== "all",
    createdBy !== "all",
    dateFrom,
    dateTo,
  ].filter(Boolean).length;

  useEffect(() => {
    onFilterCountChange?.(filterCount);
  }, [filterCount, onFilterCountChange]);

  const exportCsv = useCallback(() => {
    const header = ["Adjustment No", "Warehouse", "Date", "Items", "Type", "Reason", "Status", "Created By"];
    const body = filtered.map((row) =>
      [
        row.adjustment_number,
        row.warehouse_name ?? "",
        row.adjustment_date,
        row.item_count,
        adjustmentTypeLabel(row.adjustment_type),
        row.reason_label,
        adjustmentLabel(row.status),
        row.created_by_name ?? "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stock-adjustments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered]);

  const resetFilters = useCallback(() => {
    setSearch("");
    setStatus("all");
    setType("all");
    setWarehouseId("all");
    setReason("all");
    setCreatedBy("all");
    setDateFrom("");
    setDateTo("");
  }, []);

  useImperativeHandle(ref, () => ({
    openFilters: () => undefined,
    openColumns: () => undefined,
    exportCsv,
  }), [exportCsv]);

  const RowMenu = useCallback(
    ({ data }: { data: ApiStockAdjustment }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <RowActionsTrigger />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => onView(data)}>
            <Eye className="mr-1.5 h-3 w-3" /> View
          </DropdownMenuItem>
          {canWrite && data.status === "draft" && onApply && (
            <DropdownMenuItem onClick={() => void onApply(data)}>
              <Check className="mr-1.5 h-3 w-3" /> Apply
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
    [canWrite, onApply, onCancel, onView],
  );

  const columnDefs = useMemo<ColDef<ApiStockAdjustment>[]>(
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
        cellRenderer: (p: ICellRendererParams<ApiStockAdjustment>) =>
          p.data ? <RowMenu data={p.data} /> : null,
      },
      {
        colId: "number",
        field: "adjustment_number",
        headerName: "Adjustment No",
        width: 140,
        cellClass: "font-mono text-[11px]",
        cellRenderer: (p: ICellRendererParams<ApiStockAdjustment>) =>
          p.data ? (
            <button type="button" className="truncate font-semibold hover:text-primary" onClick={() => onView(p.data!)}>
              {p.data.adjustment_number}
            </button>
          ) : null,
      },
      { colId: "warehouse", field: "warehouse_name", headerName: "Warehouse", flex: 1, minWidth: 140 },
      { colId: "date", field: "adjustment_date", headerName: "Date", width: 120 },
      {
        colId: "items",
        headerName: "Items",
        width: 110,
        valueGetter: (p) => p.data?.item_count ?? 0,
        valueFormatter: (p) => `${p.value ?? 0} product${Number(p.value) === 1 ? "" : "s"}`,
      },
      {
        colId: "type",
        field: "adjustment_type",
        headerName: "Type",
        width: 110,
        valueFormatter: (p) => adjustmentTypeLabel(String(p.value ?? "")),
      },
      { colId: "reason", field: "reason_label", headerName: "Reason", flex: 1, minWidth: 140 },
      {
        colId: "status",
        field: "status",
        headerName: "Status",
        width: 110,
        cellRenderer: (p: ICellRendererParams<ApiStockAdjustment>) =>
          p.data ? (
            <GridChipBadge className={adjustmentTone(p.data.status)} title={adjustmentLabel(p.data.status)}>
              {adjustmentLabel(p.data.status)}
            </GridChipBadge>
          ) : null,
      },
      {
        colId: "createdBy",
        field: "created_by_name",
        headerName: "Created By",
        width: 140,
        valueFormatter: (p) => (p.value ? String(p.value) : "—"),
      },
    ],
    [RowMenu, onView],
  );

  return (
    <AgainListGrid<ApiStockAdjustment>
      className={className}
      rowData={filtered}
      columnDefs={columnDefs}
      loading={loading}
      headerLeftActions={headerLeftActions}
      footerLeftActions={footerLeftActions}
      filterBar={
        <>
          <Input
            placeholder="Search adjustment no, product, warehouse…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-[280px] shrink-0 rounded-none"
          />
          <FilterSelect
            value={status}
            onChange={setStatus}
            width="w-[140px]"
            ariaLabel="Status"
            options={[
              { value: "all", label: "All statuses" },
              { value: "draft", label: "Draft" },
              { value: "applied", label: "Applied" },
              { value: "cancelled", label: "Cancelled" },
            ]}
          />
          <FilterSelect
            value={type}
            onChange={setType}
            width="w-[140px]"
            ariaLabel="Type"
            options={[
              { value: "all", label: "All types" },
              { value: "increase", label: "Increase" },
              { value: "decrease", label: "Decrease" },
              { value: "mixed", label: "Mixed" },
            ]}
          />
          <FilterSelect
            value={warehouseId}
            onChange={setWarehouseId}
            width="w-[160px]"
            ariaLabel="Warehouse"
            options={[{ value: "all", label: "All warehouses" }, ...warehouses.map((w) => ({ value: w.id, label: w.name }))]}
          />
          <FilterSelect
            value={reason}
            onChange={setReason}
            width="w-[180px]"
            ariaLabel="Reason"
            options={[{ value: "all", label: "All reasons" }, ...ADJUSTMENT_REASONS]}
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
      emptyTitle={filterCount > 0 ? "No stock adjustments match your filters" : "No stock adjustments"}
      emptyHint={filterCount > 0 ? undefined : "Create an adjustment to change on-hand stock"}
      onResetFilters={filterCount > 0 ? resetFilters : undefined}
      apiRef={gridApiRef}
      mobile={
        <div className="divide-y divide-border">
          {filtered.map((row) => (
            <button key={row.id} type="button" className="block w-full px-3 py-2.5 text-left" onClick={() => onView(row)}>
              <p className="font-mono text-sm font-medium">{row.adjustment_number}</p>
              <p className="text-[11px] text-muted-foreground">
                {row.warehouse_name ?? "Warehouse"} · {adjustmentLabel(row.status)}
              </p>
            </button>
          ))}
        </div>
      }
    />
  );
});
