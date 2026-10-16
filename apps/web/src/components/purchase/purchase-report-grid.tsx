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
import { Eye } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FilterSelect } from "@/components/shared/filter-select";
import { GridChipBadge } from "@/components/shared/grid-chip-badge";
import { RowActionsTrigger } from "@/components/shared/row-actions-icon";
import { GridFullscreenHeader } from "@/components/shared/grid-fullscreen";
import { AgainListGrid, NUMERIC_CELL, NUMERIC_HEADER } from "@/components/shared/again-list-grid";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUserScopedState } from "@/lib/hooks/use-user-scoped-state";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { ApiPurchaseOrder } from "@/lib/api/purchase-orders";
import { PO_STATUS_LABEL, PO_STATUS_TONE } from "@/components/suppliers/supplier-purchase-orders";
import type { Supplier } from "@/lib/mock-data/suppliers";

const DAY_MS = 86_400_000;

const COLUMN_KEYS = [
  "supplier",
  "poNumber",
  "expectedDate",
  "overdue",
  "remaining",
  "total",
  "status",
  "warehouse",
  "buyer",
] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  supplier: "Supplier",
  poNumber: "PO",
  expectedDate: "Expected",
  overdue: "Days overdue",
  remaining: "Remaining",
  total: "Total",
  status: "Status",
  warehouse: "Location",
  buyer: "Buyer",
};

const DEFAULT_VISIBLE: Record<ColumnKey, boolean> = {
  supplier: true,
  poNumber: true,
  expectedDate: true,
  overdue: true,
  remaining: true,
  total: true,
  status: true,
  warehouse: false,
  buyer: false,
};

const FILTER_VISIBILITY_KEYS = ["search", "supplier", "aging", "status", "warehouse"] as const;
type FilterVisibilityKey = (typeof FILTER_VISIBILITY_KEYS)[number];

const FILTER_LABELS: Record<FilterVisibilityKey, string> = {
  search: "Search",
  supplier: "Supplier",
  aging: "Aging",
  status: "Status",
  warehouse: "Location",
};

const DEFAULT_VISIBLE_FILTERS: Record<FilterVisibilityKey, boolean> = {
  search: true,
  supplier: true,
  aging: true,
  status: false,
  warehouse: false,
};

type FilterState = {
  search: string;
  supplierId: string;
  aging: string;
  status: string;
  warehouseId: string;
};

const DEFAULT_FILTERS: FilterState = {
  search: "",
  supplierId: "all",
  aging: "all",
  status: "all",
  warehouseId: "all",
};

export function remainingQty(order: ApiPurchaseOrder) {
  return order.lines.reduce((sum, line) => {
    const left =
      line.quantity_remaining ?? Math.max(0, line.quantity_ordered - line.quantity_received);
    return sum + left;
  }, 0);
}

export function daysOverdue(expected: string | null, today: string): number | null {
  if (!expected) return null;
  const diff = Math.round((Date.parse(today) - Date.parse(expected)) / DAY_MS);
  return diff > 0 ? diff : 0;
}

export type PurchaseReportGridHandle = {
  openFilters: () => void;
  openColumns: () => void;
  resetFilters: () => void;
  exportCsv: () => void;
};

export const PurchaseReportGrid = forwardRef<
  PurchaseReportGridHandle,
  {
    orders: ApiPurchaseOrder[];
    suppliers?: Supplier[];
    loading?: boolean;
    onView: (row: ApiPurchaseOrder) => void;
    onFilterCountChange?: (count: number) => void;
    headerLeftActions?: ReactNode;
    footerLeftActions?: ReactNode;
    className?: string;
  }
>(function PurchaseReportGrid(
  {
    orders,
    suppliers = [],
    loading = false,
    onView,
    onFilterCountChange,
    headerLeftActions,
    footerLeftActions,
    className,
  },
  ref,
) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const gridApiRef = useRef<GridApi<ApiPurchaseOrder> | null>(null);

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);
  const [visibleCols, setVisibleCols] = useUserScopedState(
    "purchase-report-grid:columns",
    DEFAULT_VISIBLE,
  );
  const [visibleFilters, setVisibleFilters] = useUserScopedState(
    "purchase-report-grid:filters",
    DEFAULT_VISIBLE_FILTERS,
  );
  const resolvedCols = useMemo(() => ({ ...DEFAULT_VISIBLE, ...visibleCols }), [visibleCols]);
  const resolvedVisibleFilters = useMemo(
    () => ({ ...DEFAULT_VISIBLE_FILTERS, ...visibleFilters }),
    [visibleFilters],
  );

  const warehouseOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of orders) {
      if (row.warehouse_id) map.set(row.warehouse_id, row.warehouse_name ?? row.warehouse_id);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [orders]);

  const supplierOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of suppliers) map.set(s.id, s.name);
    for (const row of orders) {
      if (!map.has(row.supplier_id)) {
        map.set(row.supplier_id, row.supplier_name ?? row.supplier_id);
      }
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [orders, suppliers]);

  const pending = useMemo(
    () => orders.filter((o) => o.status === "confirmed" || o.status === "partial_received"),
    [orders],
  );

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return pending.filter((row) => {
      if (filters.supplierId !== "all" && row.supplier_id !== filters.supplierId) return false;
      if (filters.status !== "all" && row.status !== filters.status) return false;
      if (filters.warehouseId !== "all" && row.warehouse_id !== filters.warehouseId) return false;
      const overdueDays = daysOverdue(row.expected_date, today);
      if (filters.aging === "overdue" && !(overdueDays && overdueDays > 0)) return false;
      if (filters.aging === "on_time" && overdueDays && overdueDays > 0) return false;
      if (!q) return true;
      const products = row.lines.map((l) => `${l.sku} ${l.name}`).join(" ");
      return `${row.po_number} ${row.supplier_name ?? ""} ${row.buyer_name ?? ""} ${products}`
        .toLowerCase()
        .includes(q);
    });
  }, [pending, filters, today]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.search.trim()) n += 1;
    if (filters.supplierId !== "all") n += 1;
    if (filters.aging !== "all") n += 1;
    if (filters.status !== "all") n += 1;
    if (filters.warehouseId !== "all") n += 1;
    return n;
  }, [filters]);

  useEffect(() => {
    onFilterCountChange?.(activeFilterCount);
  }, [activeFilterCount, onFilterCountChange]);

  const exportCsv = useCallback(() => {
    const header = COLUMN_KEYS.map((key) => COLUMN_LABELS[key]);
    const body = filtered.map((row) =>
      [
        row.supplier_name ?? "",
        row.po_number,
        row.expected_date ?? "",
        daysOverdue(row.expected_date, today) ?? "",
        remainingQty(row),
        row.total,
        PO_STATUS_LABEL[row.status] ?? row.status,
        row.warehouse_name ?? "",
        row.buyer_name ?? "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `purchase-reports-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} order${filtered.length === 1 ? "" : "s"}`);
  }, [filtered, today]);

  useImperativeHandle(
    ref,
    () => ({
      openFilters: () => setFilterSheetOpen(true),
      openColumns: () => setColumnSheetOpen(true),
      resetFilters: () => setFilters(DEFAULT_FILTERS),
      exportCsv,
    }),
    [exportCsv],
  );

  const RowMenu = useCallback(
    ({ data }: { data: ApiPurchaseOrder }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <RowActionsTrigger />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => onView(data)}>
            <Eye className="mr-1.5 h-3 w-3" /> View
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    [onView],
  );

  const columnDefs = useMemo<ColDef<ApiPurchaseOrder>[]>(
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
        suppressMovable: true,
        suppressHeaderMenuButton: true,
        suppressSizeToFit: true,
        headerClass: "product-grid-actions-col",
        cellClass: "product-grid-actions-col",
        headerComponent: GridFullscreenHeader,
        cellRenderer: (p: ICellRendererParams<ApiPurchaseOrder>) =>
          p.data ? <RowMenu data={p.data} /> : null,
      },
      {
        colId: "supplier",
        field: "supplier_name",
        headerName: COLUMN_LABELS.supplier,
        hide: !resolvedCols.supplier,
        flex: 1.6,
        minWidth: 160,
        tooltipField: "supplier_name",
        valueFormatter: (p) => (p.value ? String(p.value) : "—"),
      },
      {
        colId: "poNumber",
        field: "po_number",
        headerName: COLUMN_LABELS.poNumber,
        hide: !resolvedCols.poNumber,
        width: 140,
        minWidth: 120,
        cellClass: "font-mono text-[11px]",
        cellRenderer: (p: ICellRendererParams<ApiPurchaseOrder>) =>
          p.data ? (
            <button
              type="button"
              className="truncate font-semibold hover:text-primary"
              onClick={() => onView(p.data!)}
            >
              {p.data.po_number}
            </button>
          ) : null,
      },
      {
        colId: "expectedDate",
        field: "expected_date",
        headerName: COLUMN_LABELS.expectedDate,
        hide: !resolvedCols.expectedDate,
        width: 120,
        minWidth: 100,
        valueFormatter: (p) => formatDate(p.value),
      },
      {
        colId: "overdue",
        headerName: COLUMN_LABELS.overdue,
        hide: !resolvedCols.overdue,
        width: 120,
        minWidth: 96,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueGetter: (p) => (p.data ? daysOverdue(p.data.expected_date, today) : null),
        valueFormatter: (p) => (p.value ? String(p.value) : "—"),
      },
      {
        colId: "remaining",
        headerName: COLUMN_LABELS.remaining,
        hide: !resolvedCols.remaining,
        width: 110,
        minWidth: 88,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueGetter: (p) => (p.data ? remainingQty(p.data) : 0),
      },
      {
        colId: "total",
        field: "total",
        headerName: COLUMN_LABELS.total,
        hide: !resolvedCols.total,
        width: 120,
        minWidth: 96,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: `${NUMERIC_CELL} font-medium`,
        valueFormatter: (p) => formatCurrency(Number(p.value ?? 0)),
      },
      {
        colId: "status",
        field: "status",
        headerName: COLUMN_LABELS.status,
        hide: !resolvedCols.status,
        width: 140,
        minWidth: 110,
        cellRenderer: (p: ICellRendererParams<ApiPurchaseOrder>) => {
          const status = p.data?.status;
          if (!status) return null;
          return (
            <GridChipBadge
              className={PO_STATUS_TONE[status]}
              title={PO_STATUS_LABEL[status] ?? status}
            >
              {PO_STATUS_LABEL[status] ?? status}
            </GridChipBadge>
          );
        },
      },
      {
        colId: "warehouse",
        field: "warehouse_name",
        headerName: COLUMN_LABELS.warehouse,
        hide: !resolvedCols.warehouse,
        width: 140,
        minWidth: 110,
        valueFormatter: (p) => (p.value ? String(p.value) : "—"),
      },
      {
        colId: "buyer",
        field: "buyer_name",
        headerName: COLUMN_LABELS.buyer,
        hide: !resolvedCols.buyer,
        width: 140,
        minWidth: 110,
        valueFormatter: (p) => (p.value ? String(p.value) : "—"),
      },
    ],
    [RowMenu, onView, resolvedCols, today],
  );

  return (
    <AgainListGrid<ApiPurchaseOrder>
      className={className}
      rowData={filtered}
      columnDefs={columnDefs}
      loading={loading}
      headerLeftActions={headerLeftActions}
      filterBar={
        <>
          {resolvedVisibleFilters.search && (
            <Input
              placeholder="Search PO, supplier, product…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="w-[240px] shrink-0 rounded-none"
            />
          )}
          {resolvedVisibleFilters.supplier && (
            <FilterSelect
              value={filters.supplierId}
              onChange={(supplierId) => setFilters((f) => ({ ...f, supplierId }))}
              width="w-[180px]"
              className="shrink-0"
              ariaLabel="Supplier"
              options={[
                { value: "all", label: "All suppliers" },
                ...supplierOptions.map(([value, label]) => ({ value, label })),
              ]}
            />
          )}
          {resolvedVisibleFilters.aging && (
            <FilterSelect
              value={filters.aging}
              onChange={(aging) => setFilters((f) => ({ ...f, aging }))}
              width="w-[150px]"
              className="shrink-0"
              ariaLabel="Aging"
              options={[
                { value: "all", label: "All pending" },
                { value: "overdue", label: "Overdue" },
                { value: "on_time", label: "On time" },
              ]}
            />
          )}
          {resolvedVisibleFilters.status && (
            <FilterSelect
              value={filters.status}
              onChange={(status) => setFilters((f) => ({ ...f, status }))}
              width="w-[170px]"
              className="shrink-0"
              ariaLabel="Status"
              options={[
                { value: "all", label: "All statuses" },
                { value: "confirmed", label: PO_STATUS_LABEL.confirmed },
                { value: "partial_received", label: PO_STATUS_LABEL.partial_received },
              ]}
            />
          )}
          {resolvedVisibleFilters.warehouse && (
            <FilterSelect
              value={filters.warehouseId}
              onChange={(warehouseId) => setFilters((f) => ({ ...f, warehouseId }))}
              width="w-[160px]"
              className="shrink-0"
              ariaLabel="Location"
              options={[
                { value: "all", label: "All locations" },
                ...warehouseOptions.map(([value, label]) => ({ value, label })),
              ]}
            />
          )}
          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 rounded-none text-xs"
              onClick={() => setFilters(DEFAULT_FILTERS)}
            >
              Clear
            </Button>
          )}
        </>
      }
      footerLeftActions={footerLeftActions}
      emptyTitle="No purchase orders match your filters"
      onResetFilters={() => setFilters(DEFAULT_FILTERS)}
      onOpenColumns={() => setColumnSheetOpen(true)}
      apiRef={gridApiRef}
      mobile={
        <div className="divide-y divide-border">
          {filtered.map((row) => (
            <button
              key={row.id}
              type="button"
              className="block w-full px-3 py-2.5 text-left"
              onClick={() => onView(row)}
            >
              <p className="truncate text-sm font-medium">{row.supplier_name ?? "Supplier"}</p>
              <p className="font-mono text-[11px] text-muted-foreground">{row.po_number}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {row.expected_date ? formatDate(row.expected_date) : "No date"} · {formatCurrency(Number(row.total))}
              </p>
            </button>
          ))}
        </div>
      }
    >
      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent
          side="right"
          title="Filters"
          resizable
          closeButton="inside"
          className="w-[180px] min-w-[160px] max-w-[720px] gap-2 rounded-none p-3"
        >
          <h2 className="border-b border-border pb-2 pr-8 text-sm font-semibold">Filters</h2>
          <div className="mt-1 flex-1 space-y-1.5 overflow-y-auto">
            {FILTER_VISIBILITY_KEYS.map((key) => (
              <label key={key} className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={resolvedVisibleFilters[key]}
                  onChange={(e) =>
                    setVisibleFilters({ ...resolvedVisibleFilters, [key]: e.target.checked })
                  }
                  className="h-3.5 w-3.5 shrink-0 appearance-none rounded-none border border-input bg-background checked:border-primary checked:bg-primary"
                />
                {FILTER_LABELS[key]}
              </label>
            ))}
          </div>
        </SheetContent>
      </Sheet>
      <Sheet open={columnSheetOpen} onOpenChange={setColumnSheetOpen}>
        <SheetContent
          side="right"
          title="Columns"
          resizable
          closeButton="inside"
          className="w-[180px] min-w-[160px] max-w-[720px] gap-2 rounded-none p-3"
        >
          <h2 className="border-b border-border pb-2 pr-8 text-sm font-semibold">Columns</h2>
          <div className="mt-1 flex-1 space-y-1.5 overflow-y-auto">
            {COLUMN_KEYS.map((key) => (
              <label key={key} className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={resolvedCols[key]}
                  onChange={(e) => setVisibleCols((v) => ({ ...v, [key]: e.target.checked }))}
                  className="h-3.5 w-3.5 shrink-0 appearance-none rounded-none border border-input bg-background checked:border-primary checked:bg-primary"
                />
                {COLUMN_LABELS[key]}
              </label>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </AgainListGrid>
  );
});
