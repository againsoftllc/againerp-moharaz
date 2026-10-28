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
import { useRouter } from "next/navigation";
import type { ColDef, GridApi, ICellRendererParams } from "ag-grid-community";
import {
  ClipboardList,
  ImageOff,
  Package,
  SquarePen,
  Truck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { updateInventoryStock } from "@/lib/api/use-inventory";
import type { StockItem, StockStatus, Warehouse } from "@/lib/mock-data/inventory";
import { formatCurrency } from "@/lib/utils";
import { applyImageFallback } from "@/lib/media/image-fallback";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useUserScopedState } from "@/lib/hooks/use-user-scoped-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FilterSelect } from "@/components/shared/filter-select";
import { RowActionsTrigger } from "@/components/shared/row-actions-icon";
import { GridFullscreenHeader } from "@/components/shared/grid-fullscreen";
import { AgainListGrid, NUMERIC_CELL, type AgainListServerPaging } from "@/components/shared/again-list-grid";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StockMobileCards } from "@/components/inventory/stock-mobile-cards";
import { GridChipBadge } from "@/components/shared/grid-chip-badge";

const STATUS_LABEL: Record<StockStatus, string> = {
  in_stock: "In Stock",
  low_stock: "Low Stock",
  out_of_stock: "Out of Stock",
  overstock: "Overstock",
};

const STATUS_TONE: Record<StockStatus, string> = {
  in_stock: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  low_stock: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  out_of_stock: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  overstock: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
};

type FilterState = {
  search: string;
  warehouse: string;
  status: string;
};

const DEFAULT_FILTERS: FilterState = { search: "", warehouse: "all", status: "all" };

/** The stock report: what is in stock, what is on the way, what it cost and is worth, where it is and when it last changed. */
const DEFAULT_VISIBLE = {
  thumbnail: true,
  name: true,
  sku: true,
  warehouse: true,
  onHand: true,
  incoming: true,
  unitCost: true,
  stockValue: true,
  status: true,
  updatedAt: true,
};

const DEFAULT_VISIBLE_FILTERS = { search: true, warehouse: true, status: true };

/** Quantity is not live-editable — use Stock Adjustments / Transfers / Counts. */
const DEFAULT_LIVE_EDIT = {
  unitCost: true,
};

const COLUMN_LABELS: Record<keyof typeof DEFAULT_VISIBLE, string> = {
  thumbnail: "Image",
  name: "Product",
  sku: "SKU",
  warehouse: "Warehouse",
  onHand: "In Stock",
  incoming: "In Transit",
  unitCost: "Unit cost",
  stockValue: "Stock value",
  status: "Status",
  updatedAt: "Updated",
};

const LIVE_EDIT_LABELS: Record<keyof typeof DEFAULT_LIVE_EDIT, string> = {
  unitCost: "Unit cost",
};

export type StockGridHandle = {
  resetFilters: () => void;
  openFilters: () => void;
  openColumns: () => void;
  openLiveEdit: () => void;
};

export type StockGridFilters = { search: string; warehouseId: string; status: string };

type StockGridProps = {
  items: StockItem[];
  warehouses: Warehouse[];
  loading?: boolean;
  /** The stock list is too long to load whole (thousands of lines): the page fetches one page at a time. */
  serverPaging?: AgainListServerPaging;
  /** Search, warehouse and status are applied by the server, so the page needs to know when they change. */
  onFiltersChange?: (filters: StockGridFilters) => void;
  onStockChanged?: () => void;
  onFilterCountChange?: (count: number) => void;
  headerLeftActions?: ReactNode;
  className?: string;
};

export const StockGrid = forwardRef<StockGridHandle, StockGridProps>(function StockGrid(
  { items, warehouses, loading = false, serverPaging, onFiltersChange, onStockChanged, onFilterCountChange, headerLeftActions, className },
  ref,
) {
  const router = useRouter();
  const canWrite = useAdminCanWrite();
  const gridApiRef = useRef<GridApi<StockItem> | null>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);
  const [liveEditSheetOpen, setLiveEditSheetOpen] = useState(false);
  const [selected, setSelected] = useState<StockItem[]>([]);

  const [visibleCols, setVisibleCols] = useUserScopedState("stock-grid:columns", DEFAULT_VISIBLE);
  const [visibleFilters, setVisibleFilters] = useUserScopedState(
    "stock-grid:filters",
    DEFAULT_VISIBLE_FILTERS,
  );
  const [liveEdit, setLiveEdit] = useUserScopedState("stock-grid:live-edit", DEFAULT_LIVE_EDIT);

  const resolvedCols = useMemo(() => ({ ...DEFAULT_VISIBLE, ...visibleCols }), [visibleCols]);
  const resolvedVisibleFilters = useMemo(
    () => ({ ...DEFAULT_VISIBLE_FILTERS, ...visibleFilters }),
    [visibleFilters],
  );
  const resolvedLiveEdit = useMemo(() => ({ ...DEFAULT_LIVE_EDIT, ...liveEdit }), [liveEdit]);

  const warehouseOptions = useMemo(
    () => [
      { value: "all", label: "All warehouses" },
      ...warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })),
    ],
    [warehouses],
  );

  // search, warehouse and status are applied by the server (the page refetches), so what arrives is already filtered
  const filtered = items;

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
    openLiveEdit: () => setLiveEditSheetOpen(true),
  }));

  const StockRowMenu = useCallback(
    ({ data }: { data: StockItem }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <RowActionsTrigger />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            onClick={() =>
              router.push(
                `/inventory/movements?item=${encodeURIComponent(data.itemId ?? "")}&sku=${encodeURIComponent(data.sku)}`,
              )
            }
          >
            <ClipboardList className="mr-1.5 h-3 w-3" /> View ledger
          </DropdownMenuItem>
          {canWrite && (
            <DropdownMenuItem onClick={() => router.push("/inventory/adjustments")}>
              <SquarePen className="mr-1.5 h-3 w-3" /> Create adjustment
            </DropdownMenuItem>
          )}
          {canWrite && (
            <DropdownMenuItem onClick={() => router.push("/inventory/transfers")}>
              <Truck className="mr-1.5 h-3 w-3" /> Create transfer
            </DropdownMenuItem>
          )}
          {data.productId && (
            <DropdownMenuItem onClick={() => router.push(`/website/products/${data.productId}`)}>
              <Package className="mr-1.5 h-3 w-3" /> Open product
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    [canWrite, router],
  );

  const columnDefs = useMemo<ColDef<StockItem>[]>(
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
        cellRenderer: (p: ICellRendererParams<StockItem>) =>
          p.data ? <StockRowMenu data={p.data} /> : null,
      },
      {
        colId: "controls",
        headerName: "",
        headerCheckboxSelection: canWrite,
        checkboxSelection: canWrite,
        // just the tick box (14 px + 4 px either side): a wider cell left a gap before the picture
        width: canWrite ? 24 : 16,
        maxWidth: canWrite ? 24 : 16,
        minWidth: canWrite ? 24 : 16,
        pinned: "left",
        resizable: false,
        suppressMovable: true,
        suppressHeaderMenuButton: true,
        suppressSizeToFit: true,
        sortable: false,
        headerClass: "product-grid-controls-col",
        cellClass: "product-grid-controls-col",
      },
      {
        // the catalog product's picture, the same small square as the catalog list
        colId: "thumbnail",
        field: "thumbnail",
        headerName: "",
        hide: !resolvedCols.thumbnail,
        width: 28,
        maxWidth: 28,
        minWidth: 28,
        resizable: false,
        suppressMovable: true,
        suppressSizeToFit: true,
        sortable: false,
        suppressHeaderMenuButton: true,
        cellClass: "product-grid-icon-col",
        cellRenderer: (p: ICellRendererParams<StockItem>) =>
          p.data ? (
            p.data.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.data.thumbnail}
                alt=""
                className="h-5 w-5 rounded-none object-cover"
                onError={applyImageFallback}
              />
            ) : (
              <span
                className="flex h-5 w-5 items-center justify-center bg-muted text-muted-foreground"
                title="No image"
                aria-label="No image"
              >
                <ImageOff className="h-3 w-3" />
              </span>
            )
          ) : null,
      },
      {
        colId: "name",
        field: "name",
        headerName: COLUMN_LABELS.name,
        hide: !resolvedCols.name,
        flex: 2,
        minWidth: 160,
        tooltipField: "name",
      },
      {
        colId: "sku",
        field: "sku",
        headerName: COLUMN_LABELS.sku,
        hide: !resolvedCols.sku,
        width: 110,
        minWidth: 80,
        cellClass: "font-mono text-[11px]",
      },
      {
        colId: "warehouse",
        field: "warehouse",
        headerName: COLUMN_LABELS.warehouse,
        hide: !resolvedCols.warehouse,
        width: 150,
        minWidth: 110,
      },
      {
        colId: "onHand",
        field: "onHand",
        headerName: COLUMN_LABELS.onHand,
        hide: !resolvedCols.onHand,
        width: 96,
        minWidth: 72,
        type: "numericColumn",
        cellClass: `${NUMERIC_CELL} font-medium`,
      },
      {
        colId: "incoming",
        field: "incoming",
        headerName: COLUMN_LABELS.incoming,
        hide: !resolvedCols.incoming,
        width: 96,
        minWidth: 72,
        type: "numericColumn",
        cellClass: NUMERIC_CELL,
      },
      {
        colId: "unitCost",
        field: "unitCost",
        headerName: COLUMN_LABELS.unitCost,
        hide: !resolvedCols.unitCost,
        width: 118,
        minWidth: 96,
        type: "numericColumn",
        editable: canWrite && resolvedLiveEdit.unitCost,
        cellClass: NUMERIC_CELL,
        valueFormatter: (p) => (p.value == null ? "" : formatCurrency(Number(p.value))),
      },
      {
        colId: "stockValue",
        field: "stockValue",
        headerName: COLUMN_LABELS.stockValue,
        hide: !resolvedCols.stockValue,
        width: 130,
        minWidth: 100,
        type: "numericColumn",
        cellClass: NUMERIC_CELL,
        valueGetter: (p) => (p.data ? p.data.unitCost * p.data.onHand : 0),
        valueFormatter: (p) => formatCurrency(Number(p.value ?? 0)),
      },
      {
        colId: "status",
        field: "status",
        headerName: COLUMN_LABELS.status,
        hide: !resolvedCols.status,
        width: 128,
        minWidth: 104,
        cellRenderer: (p: ICellRendererParams<StockItem>) => {
          const status = p.data?.status;
          if (!status) return null;
          return (
            <GridChipBadge className={STATUS_TONE[status]} title={STATUS_LABEL[status]}>
              {STATUS_LABEL[status]}
            </GridChipBadge>
          );
        },
      },
      {
        colId: "updatedAt",
        field: "updatedAt",
        headerName: COLUMN_LABELS.updatedAt,
        hide: !resolvedCols.updatedAt,
        width: 116,
        minWidth: 96,
      },
    ],
    [resolvedCols, resolvedLiveEdit, canWrite, StockRowMenu],
  );

  const onCellValueChanged = useCallback(
    (event: { data?: StockItem; colDef: ColDef<StockItem>; oldValue: unknown; newValue: unknown }) => {
      const row = event.data;
      const colId = event.colDef.colId as keyof typeof DEFAULT_LIVE_EDIT | undefined;
      if (!row || !colId) return;
      if (event.oldValue === event.newValue) return;

      const numeric = Number(event.newValue);
      if (!Number.isFinite(numeric) || numeric < 0) {
        toast.error(`${LIVE_EDIT_LABELS[colId]} must be a non-negative number`);
        onStockChanged?.(); // refetch restores the server value in the cell
        return;
      }

      void (async () => {
        try {
          await updateInventoryStock(row.id, { [colId]: numeric });
          toast.success(`${LIVE_EDIT_LABELS[colId]} updated for ${row.sku}`);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Update failed");
        } finally {
          // Either way the server is the source of truth — pull it back in.
          onStockChanged?.();
        }
      })();
    },
    [onStockChanged],
  );

  const exportSelected = useCallback(() => {
    const rows = selected.length ? selected : filtered;
    const header = ["SKU", "Product", "Warehouse", "In Stock", "In Transit", "Unit cost", "Stock value", "Status"];
    const body = rows.map((r) =>
      [r.sku, r.name, r.warehouse, r.onHand, r.incoming, r.unitCost, r.unitCost * r.onHand, r.status]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = [header.join(","), ...body].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stock-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} row${rows.length === 1 ? "" : "s"}`);
  }, [selected, filtered]);

  return (
    <AgainListGrid<StockItem>
      className={className}
      rowData={filtered}
      columnDefs={columnDefs}
      loading={loading}
      serverPaging={serverPaging}
      headerLeftActions={headerLeftActions}
      filterBar={
        <>
          {resolvedVisibleFilters.search && (
            <Input
              placeholder="Search SKU, name…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="w-[220px] shrink-0 rounded-none"
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
              options={[
                { value: "all", label: "All statuses" },
                ...(Object.keys(STATUS_LABEL) as StockStatus[]).map((s) => ({
                  value: s,
                  label: STATUS_LABEL[s],
                })),
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
      emptyTitle="No stock lines match your filters"
      emptyHint="Clear filters, or import products to create stock lines"
      onResetFilters={() => setFilters(DEFAULT_FILTERS)}
      onOpenColumns={() => setColumnSheetOpen(true)}
      apiRef={gridApiRef}
      gridProps={{
        rowSelection: "multiple",
        suppressRowClickSelection: true,
        onCellValueChanged,
        onSelectionChanged: (e) => setSelected(e.api.getSelectedRows()),
      }}
      mobile={
        <>
          <StockMobileCards items={filtered.slice(0, 50)} />
          {filtered.length > 50 && (
            <p className="text-center text-xs text-muted-foreground">
              Showing 50 of {filtered.length} — use desktop for full list
            </p>
          )}
        </>
      }
    >
      {/* Filters sheet */}
      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent side="right" className="w-[320px]">
          <h3 className="text-sm font-semibold">Filters</h3>
          <p className="mt-1 text-xs text-muted-foreground">Show or hide toolbar filters.</p>
          <div className="mt-4 space-y-2">
            {(Object.keys(DEFAULT_VISIBLE_FILTERS) as (keyof typeof DEFAULT_VISIBLE_FILTERS)[]).map(
              (key) => (
                <label key={key} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={resolvedVisibleFilters[key]}
                    onChange={(e) =>
                      setVisibleFilters({ ...resolvedVisibleFilters, [key]: e.target.checked })
                    }
                  />
                  <span className="capitalize">{key}</span>
                </label>
              ),
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Columns sheet */}
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

      {/* Live edit sheet */}
      <Sheet open={liveEditSheetOpen} onOpenChange={setLiveEditSheetOpen}>
        <SheetContent side="right" className="w-[320px]">
          <h3 className="text-sm font-semibold">Live edit</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Edit these columns inline. Quantity on hand is not editable here — create a Stock Adjustment, Transfer, or Count.
          </p>
          <div className="mt-4 space-y-2">
            {(Object.keys(DEFAULT_LIVE_EDIT) as (keyof typeof DEFAULT_LIVE_EDIT)[]).map((key) => (
              <label key={key} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={resolvedLiveEdit[key]}
                  onChange={(e) => setLiveEdit({ ...resolvedLiveEdit, [key]: e.target.checked })}
                />
                <span>{LIVE_EDIT_LABELS[key]}</span>
              </label>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </AgainListGrid>
  );
});
