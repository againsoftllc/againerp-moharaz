"use client";

import "@/components/providers/ag-grid-provider";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ColDef, GridApi, ICellRendererParams } from "ag-grid-community";
import { ArrowRight, Package } from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";
import { useUserScopedState } from "@/lib/hooks/use-user-scoped-state";
import { Badge } from "@/components/ui/badge";
import { GRID_CHIP_CLASS, GridChipBadge } from "@/components/shared/grid-chip-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FilterSelect } from "@/components/shared/filter-select";
import { GridFullscreenHeader } from "@/components/shared/grid-fullscreen";
import { AgainListGrid } from "@/components/shared/again-list-grid";
import type { Warehouse } from "@/lib/mock-data/inventory";
import type { ApiStockMovement } from "@/lib/api/inventory";

export type MovementRow = ApiStockMovement & {
  sku?: string | null;
  name?: string | null;
  thumbnail?: string | null;
  warehouse_name?: string | null;
  source_warehouse_name?: string | null;
  dest_warehouse_name?: string | null;
  created_by?: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  in: "In",
  out: "Out",
  transfer: "Transfer",
  adjustment: "Adjustment",
  opening: "Opening",
  opening_stock: "Opening stock",
  reserve: "Reserve",
  release: "Release",
  reservation: "Reservation",
  reservation_release: "Reservation release",
  purchase_receipt: "Purchase receipt",
  sales_delivery: "Sales delivery",
  pos_sale: "POS sale",
  pos_return: "POS return",
  commerce_sale: "Commerce sale",
  transfer_out: "Transfer out",
  transfer_in: "Transfer in",
  transfer_in_transit: "In transit",
  stock_adjustment_in: "Adjustment in",
  stock_adjustment_out: "Adjustment out",
  stock_count_in: "Count in",
  stock_count_out: "Count out",
  customer_return: "Customer return",
  scrap: "Scrap",
  reversal: "Reversal",
};

const TYPE_TONE: Record<string, string> = {
  in: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  out: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  purchase_receipt: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  stock_adjustment_in: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  stock_count_in: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  transfer_in: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  pos_return: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  opening: "border-muted-foreground/30 bg-muted text-muted-foreground",
  opening_stock: "border-muted-foreground/30 bg-muted text-muted-foreground",
  sales_delivery: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  pos_sale: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  commerce_sale: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  transfer_out: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  stock_adjustment_out: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  stock_count_out: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  scrap: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  transfer: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  transfer_in_transit: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  adjustment: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  reserve: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  release: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  reservation: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  reservation_release: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  reversal: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

type FilterState = { search: string; warehouse: string; type: string };
const DEFAULT_FILTERS: FilterState = { search: "", warehouse: "all", type: "all" };

const DEFAULT_VISIBLE = {
  thumbnail: true,
  name: true,
  sku: true,
  createdAt: true,
  warehouse: true,
  movementType: true,
  quantity: true,
  change: true,
  reference: true,
  notes: false,
};

const COLUMN_LABELS: Record<keyof typeof DEFAULT_VISIBLE, string> = {
  thumbnail: "Image",
  name: "Product",
  sku: "SKU",
  createdAt: "Date",
  warehouse: "Warehouse",
  movementType: "Type",
  quantity: "Qty",
  change: "Before → After",
  reference: "Reference",
  notes: "Notes",
};

const DEFAULT_VISIBLE_FILTERS = { search: true, warehouse: true, type: true };
const FILTER_LABELS: Record<keyof typeof DEFAULT_VISIBLE_FILTERS, string> = {
  search: "Search",
  warehouse: "Warehouse",
  type: "Type",
};

export type MovementGridHandle = {
  resetFilters: () => void;
  openFilters: () => void;
  openColumns: () => void;
};

type MovementGridProps = {
  movements: MovementRow[];
  warehouses: Warehouse[];
  loading?: boolean;
  initialSearch?: string;
  onFilterCountChange?: (count: number) => void;
  headerLeftActions?: ReactNode;
  className?: string;
};

export const MovementGrid = forwardRef<MovementGridHandle, MovementGridProps>(function MovementGrid(
  {
    movements,
    warehouses,
    loading = false,
    initialSearch = "",
    onFilterCountChange,
    headerLeftActions,
    className,
  },
  ref,
) {
  const gridApiRef = useRef<GridApi<MovementRow> | null>(null);

  const [filters, setFilters] = useState<FilterState>({
    ...DEFAULT_FILTERS,
    search: initialSearch,
  });
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);
  const [visibleCols, setVisibleCols] = useUserScopedState(
    "movement-grid:columns",
    DEFAULT_VISIBLE,
  );
  const [visibleFilters, setVisibleFilters] = useUserScopedState(
    "movement-grid:filters",
    DEFAULT_VISIBLE_FILTERS,
  );
  const resolvedCols = useMemo(() => ({ ...DEFAULT_VISIBLE, ...visibleCols }), [visibleCols]);
  const resolvedVisibleFilters = useMemo(
    () => ({ ...DEFAULT_VISIBLE_FILTERS, ...visibleFilters }),
    [visibleFilters],
  );

  useEffect(() => {
    if (initialSearch && !filters.search) {
      setFilters((f) => ({ ...f, search: initialSearch }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSearch]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return movements.filter((row) => {
      if (
        q &&
        !`${row.sku ?? ""} ${row.name ?? ""} ${row.reference ?? ""}`.toLowerCase().includes(q)
      ) {
        return false;
      }
      if (filters.warehouse !== "all" && row.warehouse_name !== filters.warehouse) return false;
      if (filters.type !== "all" && row.movement_type !== filters.type) return false;
      return true;
    });
  }, [movements, filters]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.search.trim()) count += 1;
    if (filters.warehouse !== "all") count += 1;
    if (filters.type !== "all") count += 1;
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

  const typeOptions = useMemo(() => {
    const seen = new Set(movements.map((m) => m.movement_type).filter(Boolean));
    return [
      { value: "all", label: "All types" },
      ...[...seen]
        .sort((a, b) => (TYPE_LABEL[a] ?? a).localeCompare(TYPE_LABEL[b] ?? b))
        .map((t) => ({ value: t, label: TYPE_LABEL[t] ?? t })),
    ];
  }, [movements]);

  const columnDefs = useMemo<ColDef<MovementRow>[]>(
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
      },
      {
        colId: "thumbnail",
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
        cellRenderer: (p: ICellRendererParams<MovementRow>) =>
          p.data?.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.data.thumbnail}
              alt=""
              className="h-5 w-5 rounded-none object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-5 w-5 items-center justify-center bg-muted">
              <Package className="h-3 w-3 text-muted-foreground" aria-hidden />
            </div>
          ),
      },
      {
        colId: "name",
        field: "name",
        headerName: COLUMN_LABELS.name,
        hide: !resolvedCols.name,
        flex: 2,
        minWidth: 160,
        tooltipField: "name",
        valueFormatter: (p) => (p.value ? String(p.value) : "—"),
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
        colId: "createdAt",
        field: "created_at",
        headerName: COLUMN_LABELS.createdAt,
        hide: !resolvedCols.createdAt,
        width: 170,
        minWidth: 140,
        valueFormatter: (p) => (p.value ? formatDateTime(String(p.value)) : ""),
        sort: "desc",
      },
      {
        colId: "warehouse",
        field: "warehouse_name",
        headerName: COLUMN_LABELS.warehouse,
        hide: !resolvedCols.warehouse,
        width: 160,
        minWidth: 120,
      },
      {
        colId: "movementType",
        field: "movement_type",
        headerName: COLUMN_LABELS.movementType,
        hide: !resolvedCols.movementType,
        width: 124,
        minWidth: 100,
        cellRenderer: (p: ICellRendererParams<MovementRow>) => {
          const type = p.data?.movement_type;
          if (!type) return null;
          return (
            <GridChipBadge
              className={TYPE_TONE[type] ?? TYPE_TONE.opening}
              title={TYPE_LABEL[type] ?? type}
            >
              {TYPE_LABEL[type] ?? type}
            </GridChipBadge>
          );
        },
      },
      {
        colId: "quantity",
        field: "quantity",
        headerName: COLUMN_LABELS.quantity,
        hide: !resolvedCols.quantity,
        width: 84,
        minWidth: 64,
        type: "numericColumn",
        cellClass: "tabular-nums font-medium",
      },
      {
        colId: "change",
        headerName: COLUMN_LABELS.change,
        hide: !resolvedCols.change,
        width: 140,
        minWidth: 118,
        sortable: false,
        cellRenderer: (p: ICellRendererParams<MovementRow>) =>
          p.data ? (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <span className="text-muted-foreground">{p.data.qty_before}</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden />
              <span className="font-medium">{p.data.qty_after}</span>
            </span>
          ) : null,
      },
      {
        colId: "reference",
        field: "reference",
        headerName: COLUMN_LABELS.reference,
        hide: !resolvedCols.reference,
        width: 150,
        minWidth: 110,
      },
      {
        colId: "notes",
        field: "notes",
        headerName: COLUMN_LABELS.notes,
        hide: !resolvedCols.notes,
        flex: 1,
        minWidth: 140,
        tooltipField: "notes",
      },
    ],
    [resolvedCols],
  );

  return (
    <AgainListGrid<MovementRow>
      className={className}
      rowData={filtered}
      columnDefs={columnDefs}
      loading={loading}
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
              options={[
                { value: "all", label: "All warehouses" },
                ...warehouses.map((w) => ({ value: w.name, label: `${w.code} — ${w.name}` })),
              ]}
            />
          )}
          {resolvedVisibleFilters.type && (
            <FilterSelect
              value={filters.type}
              onChange={(type) => setFilters((f) => ({ ...f, type }))}
              width="w-[160px]"
              className="shrink-0"
              ariaLabel="Movement type"
              options={typeOptions}
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
      emptyTitle="No movements match your filters"
      emptyHint="Adjust stock from the Stock page to create ledger entries"
      onResetFilters={() => setFilters(DEFAULT_FILTERS)}
      onOpenColumns={() => setColumnSheetOpen(true)}
      apiRef={gridApiRef}
      mobile={
        <div className="divide-y divide-border">
          {filtered.slice(0, 50).map((row) => (
            <div key={row.id} className="flex gap-3 px-3 py-2.5">
              {row.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.thumbnail}
                  alt=""
                  className="h-9 w-9 shrink-0 object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-muted">
                  <Package className="h-4 w-4 text-muted-foreground" aria-hidden />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.name ?? row.sku}</p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">{row.sku}</p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "shrink-0",
                      GRID_CHIP_CLASS,
                      TYPE_TONE[row.movement_type] ?? TYPE_TONE.opening,
                    )}
                  >
                    {TYPE_LABEL[row.movement_type] ?? row.movement_type}
                  </Badge>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {row.warehouse_name} · qty {row.quantity} · {row.qty_before} → {row.qty_after}
                </p>
                <p className="text-[11px] text-muted-foreground">{formatDateTime(row.created_at)}</p>
              </div>
            </div>
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
            {(Object.keys(DEFAULT_VISIBLE_FILTERS) as (keyof typeof DEFAULT_VISIBLE_FILTERS)[]).map(
              (key) => (
                <label key={key} className="flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={resolvedVisibleFilters[key]}
                    onChange={(e) =>
                      setVisibleFilters({ ...resolvedVisibleFilters, [key]: e.target.checked })
                    }
                    className="h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none rounded-none border border-input bg-background checked:border-primary checked:bg-primary"
                  />
                  <span>{FILTER_LABELS[key]}</span>
                </label>
              ),
            )}
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
            {(Object.keys(DEFAULT_VISIBLE) as (keyof typeof DEFAULT_VISIBLE)[]).map((key) => (
              <label key={key} className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={resolvedCols[key]}
                  onChange={(e) => setVisibleCols({ ...resolvedCols, [key]: e.target.checked })}
                  className="h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none rounded-none border border-input bg-background checked:border-primary checked:bg-primary"
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
