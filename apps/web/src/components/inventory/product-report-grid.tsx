"use client";

import "@/components/providers/ag-grid-provider";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { ColDef, GridApi, ICellRendererParams } from "ag-grid-community";
import { ClipboardList, ImageOff, Package, X } from "lucide-react";
import { toast } from "sonner";
import type { ApiProductReportRow } from "@/lib/api/inventory";
import type { Warehouse } from "@/lib/mock-data/inventory";
import { cn, formatCurrency } from "@/lib/utils";
import { applyImageFallback } from "@/lib/media/image-fallback";
import { useUserScopedState } from "@/lib/hooks/use-user-scoped-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FilterSelect } from "@/components/shared/filter-select";
import { RowActionsTrigger } from "@/components/shared/row-actions-icon";
import { GridFullscreenHeader } from "@/components/shared/grid-fullscreen";
import { GRID_CHIP_CLASS, GridChipBadge } from "@/components/shared/grid-chip-badge";
import { AgainListGrid, NUMERIC_CELL, type AgainListServerPaging } from "@/components/shared/again-list-grid";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type ProductReportRow = ApiProductReportRow & { id: string };

const STATUS: Record<string, { label: string; tone: string }> = {
  in_stock: { label: "In Stock", tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  low_stock: { label: "Low Stock", tone: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  out_of_stock: { label: "Out of Stock", tone: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400" },
  overstock: { label: "Overstock", tone: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400" },
};

const money = (v: unknown) => formatCurrency(Number(v ?? 0));
const num = (v: unknown) => Number(v ?? 0).toLocaleString();

/** Same columns as the Stock page; the lifetime purchase / sales / profit figures are in the chooser, hidden by default. */
const DEFAULT_VISIBLE = {
  thumbnail: true,
  name: true,
  sku: true,
  warehouse_name: true,
  on_hand: true,
  incoming: true,
  unit_cost: true,
  stock_value: true,
  status: true,
  updated_at: true,
  category: false,
  supplier_name: false,
  available: false,
  purchased_qty: false,
  sold_qty: false,
  sales_revenue: false,
  profit: false,
};

const COLUMN_LABELS: Record<keyof typeof DEFAULT_VISIBLE, string> = {
  thumbnail: "Image",
  name: "Product",
  sku: "SKU",
  warehouse_name: "Warehouse",
  on_hand: "In Stock",
  incoming: "In Transit",
  unit_cost: "Unit cost",
  stock_value: "Stock value",
  status: "Status",
  updated_at: "Updated",
  category: "Category",
  supplier_name: "Supplier",
  available: "Available",
  purchased_qty: "Purchased",
  sold_qty: "Sold",
  sales_revenue: "Sales",
  profit: "Profit / loss",
};

const DEFAULT_VISIBLE_FILTERS = { search: true, warehouse: true, status: true };

type FilterState = { search: string; warehouse: string; status: string };
const DEFAULT_FILTERS: FilterState = { search: "", warehouse: "all", status: "all" };

export type ProductReportGridFilters = { search: string; warehouseId: string; status: string };

export type ProductReportGridHandle = {
  resetFilters: () => void;
  openFilters: () => void;
  openColumns: () => void;
};

type Props = {
  rows: ProductReportRow[];
  warehouses: Warehouse[];
  loading?: boolean;
  serverPaging?: AgainListServerPaging;
  /** Search, warehouse and status are applied by the server, so the page needs to know when they change. */
  onFiltersChange?: (filters: ProductReportGridFilters) => void;
  onFilterCountChange?: (count: number) => void;
  /** Row click / "Open product" — opens the Product Drawer. */
  onOpenProduct?: (productId: string) => void;
  headerLeftActions?: ReactNode;
  className?: string;
};

export const ProductReportGrid = forwardRef<ProductReportGridHandle, Props>(function ProductReportGrid(
  { rows, warehouses, loading = false, serverPaging, onFiltersChange, onFilterCountChange, onOpenProduct, headerLeftActions, className },
  ref,
) {
  const router = useRouter();
  const gridApiRef = useRef<GridApi<ProductReportRow> | null>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);
  const [selected, setSelected] = useState<ProductReportRow[]>([]);

  const [visibleCols, setVisibleCols] = useUserScopedState("product-report-grid:columns", DEFAULT_VISIBLE);
  const [visibleFilters, setVisibleFilters] = useUserScopedState("product-report-grid:filters", DEFAULT_VISIBLE_FILTERS);
  const resolvedCols = useMemo(() => ({ ...DEFAULT_VISIBLE, ...visibleCols }), [visibleCols]);
  const resolvedVisibleFilters = useMemo(() => ({ ...DEFAULT_VISIBLE_FILTERS, ...visibleFilters }), [visibleFilters]);

  const warehouseOptions = useMemo(
    () => [
      { value: "all", label: "All warehouses" },
      ...warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })),
    ],
    [warehouses],
  );

  useEffect(() => {
    onFiltersChange?.({ search: filters.search.trim(), warehouseId: filters.warehouse, status: filters.status });
  }, [filters, onFiltersChange]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.search.trim()) count += 1;
    if (filters.warehouse !== "all") count += 1;
    if (filters.status !== "all") count += 1;
    return count;
  }, [filters]);

  useEffect(() => {
    onFilterCountChange?.(activeFilterCount);
  }, [activeFilterCount, onFilterCountChange]);

  useImperativeHandle(ref, () => ({
    resetFilters: () => setFilters(DEFAULT_FILTERS),
    openFilters: () => setFilterSheetOpen(true),
    openColumns: () => setColumnSheetOpen(true),
  }));

  const RowMenu = useCallback(
    ({ data }: { data: ProductReportRow }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <RowActionsTrigger />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            onClick={() =>
              router.push(`/inventory/movements?item=${encodeURIComponent(data.item_id)}&sku=${encodeURIComponent(data.sku)}`)
            }
          >
            <ClipboardList className="mr-1.5 h-3 w-3" /> View ledger
          </DropdownMenuItem>
          {data.product_id && onOpenProduct ? (
            <DropdownMenuItem onClick={() => onOpenProduct(data.product_id!)}>
              <Package className="mr-1.5 h-3 w-3" /> Open product
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    [router, onOpenProduct],
  );

  const col = useCallback(
    (def: ColDef<ProductReportRow> & { colId: keyof typeof DEFAULT_VISIBLE }): ColDef<ProductReportRow> => ({
      headerName: COLUMN_LABELS[def.colId],
      hide: !resolvedCols[def.colId],
      ...def,
    }),
    [resolvedCols],
  );

  const columnDefs = useMemo<ColDef<ProductReportRow>[]>(
    () => [
      {
        colId: "actions",
        headerName: "",
        width: 26,
        maxWidth: 26,
        minWidth: 26,
        pinned: "left",
        resizable: false,
        suppressMovable: true,
        suppressHeaderMenuButton: true,
        suppressSizeToFit: true,
        sortable: false,
        headerClass: "product-grid-actions-col",
        cellClass: "product-grid-actions-col",
        headerComponent: GridFullscreenHeader,
        cellRenderer: (p: ICellRendererParams<ProductReportRow>) => (p.data ? <RowMenu data={p.data} /> : null),
      },
      {
        colId: "controls",
        headerName: "",
        headerCheckboxSelection: true,
        checkboxSelection: true,
        // just the tick box (14 px + 4 px either side): a wider cell left a gap before the picture
        width: 24,
        maxWidth: 24,
        minWidth: 24,
        pinned: "left",
        resizable: false,
        suppressMovable: true,
        suppressHeaderMenuButton: true,
        suppressSizeToFit: true,
        sortable: false,
        headerClass: "product-grid-controls-col",
        cellClass: "product-grid-controls-col",
      },
      col({
        colId: "thumbnail",
        field: "thumbnail",
        headerName: "",
        width: 28,
        maxWidth: 28,
        minWidth: 28,
        resizable: false,
        suppressMovable: true,
        suppressSizeToFit: true,
        sortable: false,
        suppressHeaderMenuButton: true,
        cellClass: "product-grid-icon-col",
        cellRenderer: (p: ICellRendererParams<ProductReportRow>) =>
          p.data ? (
            p.data.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.data.thumbnail} alt="" className="h-5 w-5 rounded-none object-cover" onError={applyImageFallback} />
            ) : (
              <span className="flex h-5 w-5 items-center justify-center bg-muted text-muted-foreground" title="No image" aria-label="No image">
                <ImageOff className="h-3 w-3" />
              </span>
            )
          ) : null,
      }),
      col({ colId: "name", field: "name", flex: 2, minWidth: 160, tooltipField: "name" }),
      col({ colId: "sku", field: "sku", width: 110, minWidth: 80, cellClass: "font-mono text-[11px]" }),
      col({ colId: "warehouse_name", field: "warehouse_name", width: 150, minWidth: 110 }),
      col({
        colId: "on_hand",
        field: "on_hand",
        width: 96,
        minWidth: 72,
        type: "numericColumn",
        cellClass: (p) => cn(NUMERIC_CELL, "font-medium", Number(p.value) < 0 && "text-destructive"),
        valueFormatter: (p) => num(p.value),
      }),
      col({
        colId: "incoming",
        field: "incoming",
        width: 96,
        minWidth: 72,
        type: "numericColumn",
        cellClass: NUMERIC_CELL,
        valueFormatter: (p) => num(p.value),
      }),
      col({
        colId: "unit_cost",
        field: "unit_cost",
        width: 118,
        minWidth: 96,
        type: "numericColumn",
        cellClass: NUMERIC_CELL,
        valueFormatter: (p) => money(p.value),
      }),
      col({
        colId: "stock_value",
        field: "stock_value",
        width: 130,
        minWidth: 100,
        type: "numericColumn",
        cellClass: NUMERIC_CELL,
        valueFormatter: (p) => money(p.value),
      }),
      col({
        colId: "status",
        field: "status",
        width: 128,
        minWidth: 104,
        cellRenderer: (p: ICellRendererParams<ProductReportRow>) => {
          const status = STATUS[p.data?.status ?? ""];
          if (!status) return null;
          return (
            <GridChipBadge className={status.tone} title={status.label}>
              {status.label}
            </GridChipBadge>
          );
        },
      }),
      col({
        colId: "updated_at",
        field: "updated_at",
        width: 116,
        minWidth: 96,
        valueFormatter: (p) => (p.value ? String(p.value).slice(0, 10) : "—"),
      }),
      col({ colId: "category", field: "category", width: 130, minWidth: 100, valueFormatter: (p) => p.value || "—" }),
      col({ colId: "supplier_name", field: "supplier_name", width: 150, minWidth: 110, valueFormatter: (p) => p.value || "—" }),
      col({
        colId: "available",
        field: "available",
        width: 100,
        minWidth: 90,
        type: "numericColumn",
        cellClass: NUMERIC_CELL,
        valueFormatter: (p) => num(p.value),
      }),
      col({
        colId: "purchased_qty",
        field: "purchased_qty",
        width: 100,
        minWidth: 90,
        type: "numericColumn",
        cellClass: NUMERIC_CELL,
        valueFormatter: (p) => num(p.value),
      }),
      col({
        colId: "sold_qty",
        field: "sold_qty",
        width: 90,
        minWidth: 80,
        type: "numericColumn",
        cellClass: NUMERIC_CELL,
        valueFormatter: (p) => num(p.value),
      }),
      col({
        colId: "sales_revenue",
        field: "sales_revenue",
        width: 120,
        minWidth: 100,
        type: "numericColumn",
        cellClass: NUMERIC_CELL,
        valueFormatter: (p) => money(p.value),
      }),
      col({
        colId: "profit",
        field: "profit",
        width: 120,
        minWidth: 100,
        type: "numericColumn",
        cellClass: (p) =>
          cn(NUMERIC_CELL, Number(p.value) < 0 ? "text-destructive" : Number(p.value) > 0 ? "text-emerald-600 dark:text-emerald-400" : ""),
        valueFormatter: (p) => money(p.value),
      }),
    ],
    [col, RowMenu],
  );

  const exportSelected = useCallback(() => {
    const exported = selected.length ? selected : rows;
    const header = ["SKU", "Product", "Warehouse", "In Stock", "In Transit", "Unit cost", "Stock value", "Status"];
    const body = exported.map((r) =>
      [r.sku, r.name, r.warehouse_name ?? "", r.on_hand, r.incoming, r.unit_cost, r.stock_value, STATUS[r.status]?.label ?? r.status]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `product-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${exported.length} row${exported.length === 1 ? "" : "s"}`);
  }, [selected, rows]);

  return (
    <AgainListGrid<ProductReportRow>
      className={className}
      rowData={rows}
      columnDefs={columnDefs}
      loading={loading}
      serverPaging={serverPaging}
      headerLeftActions={headerLeftActions}
      onRowClicked={onOpenProduct ? (row) => row.product_id && onOpenProduct(row.product_id) : undefined}
      gridClassName={onOpenProduct ? "[&_.ag-row]:cursor-pointer" : undefined}
      filterBar={
        <>
          {resolvedVisibleFilters.search && (
            <Input
              placeholder="Search SKU, name…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="w-[220px] shrink-0 rounded-none"
              data-testid="product-report-list-search"
            />
          )}
          {resolvedVisibleFilters.warehouse && (
            <FilterSelect
              value={filters.warehouse}
              onChange={(warehouse) => setFilters((f) => ({ ...f, warehouse }))}
              width="w-[190px]"
              className="shrink-0"
              ariaLabel="Warehouse"
              options={warehouseOptions}
            />
          )}
          {resolvedVisibleFilters.status && (
            <FilterSelect
              value={filters.status}
              onChange={(status) => setFilters((f) => ({ ...f, status }))}
              width="w-[160px]"
              className="shrink-0"
              ariaLabel="Stock status"
              options={[{ value: "all", label: "All statuses" }, ...Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label }))]}
            />
          )}
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" className="h-7 shrink-0 rounded-none text-xs" onClick={() => setFilters(DEFAULT_FILTERS)}>
              Clear
            </Button>
          )}
        </>
      }
      banner={
        selected.length > 0 ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-2 py-1.5">
            <span className="text-xs font-medium">{selected.length} selected</span>
            <Button variant="outline" size="sm" onClick={exportSelected}>
              Export selected
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 w-7 p-0"
              onClick={() => {
                setSelected([]);
                gridApiRef.current?.deselectAll();
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : null
      }
      emptyTitle="No products match your filters"
      emptyHint="Clear filters, or try another name or SKU"
      onResetFilters={() => setFilters(DEFAULT_FILTERS)}
      onOpenColumns={() => setColumnSheetOpen(true)}
      apiRef={gridApiRef}
      gridProps={{
        rowSelection: "multiple",
        suppressRowClickSelection: true,
        onSelectionChanged: (e) => setSelected(e.api.getSelectedRows()),
      }}
      mobile={
        rows.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">No products match your filters</p>
        ) : (
          <div className="divide-y divide-border">
            {rows.slice(0, 50).map((r) => {
              const status = STATUS[r.status];
              return (
                <button
                  key={r.id}
                  type="button"
                  className="flex w-full gap-3 px-3 py-2.5 text-left"
                  onClick={() => r.product_id && onOpenProduct?.(r.product_id)}
                >
                  {r.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.thumbnail} alt="" className="h-9 w-9 shrink-0 object-cover" onError={applyImageFallback} />
                  ) : (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-muted">
                      <Package className="h-4 w-4 text-muted-foreground" aria-hidden />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{r.name}</p>
                        <p className="truncate font-mono text-[11px] text-muted-foreground">{r.sku}</p>
                      </div>
                      {status ? (
                        <Badge variant="outline" className={cn("shrink-0", GRID_CHIP_CLASS, status.tone)}>
                          {status.label}
                        </Badge>
                      ) : null}
                    </div>
                    <dl className="mt-1.5 grid grid-cols-4 gap-x-2 text-[11px]">
                      <div>
                        <dt className="text-muted-foreground">In Stock</dt>
                        <dd className="font-medium tabular-nums">{num(r.on_hand)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">In Transit</dt>
                        <dd className="tabular-nums">{num(r.incoming)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Unit cost</dt>
                        <dd className="tabular-nums">{money(r.unit_cost)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Value</dt>
                        <dd className="tabular-nums">{money(r.stock_value)}</dd>
                      </div>
                    </dl>
                  </div>
                </button>
              );
            })}
            {rows.length > 50 && (
              <p className="px-3 py-2 text-center text-xs text-muted-foreground">Showing 50 of {rows.length} — use desktop for full list</p>
            )}
          </div>
        )
      }
    >
      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent side="right" className="w-[320px]">
          <h3 className="text-sm font-semibold">Filters</h3>
          <p className="mt-1 text-xs text-muted-foreground">Show or hide toolbar filters.</p>
          <div className="mt-4 space-y-2">
            {(Object.keys(DEFAULT_VISIBLE_FILTERS) as (keyof typeof DEFAULT_VISIBLE_FILTERS)[]).map((key) => (
              <label key={key} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={resolvedVisibleFilters[key]}
                  onChange={(e) => setVisibleFilters({ ...resolvedVisibleFilters, [key]: e.target.checked })}
                />
                <span className="capitalize">{key}</span>
              </label>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={columnSheetOpen} onOpenChange={setColumnSheetOpen}>
        <SheetContent side="right" className="w-[320px] overflow-y-auto">
          <h3 className="text-sm font-semibold">Columns</h3>
          <p className="mt-1 text-xs text-muted-foreground">Choose the columns to display.</p>
          <div className="mt-4 space-y-2">
            {(Object.keys(DEFAULT_VISIBLE) as (keyof typeof DEFAULT_VISIBLE)[]).map((key) => (
              <label key={key} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={resolvedCols[key]}
                  onChange={(e) => setVisibleCols({ ...resolvedCols, [key]: e.target.checked })}
                />
                <span>{COLUMN_LABELS[key]}</span>
              </label>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </AgainListGrid>
  );
});
