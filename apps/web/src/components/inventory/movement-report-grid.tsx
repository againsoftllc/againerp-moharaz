"use client";

import "@/components/providers/ag-grid-provider";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState, type ReactNode } from "react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { ImageOff, Package } from "lucide-react";
import type { ApiMovementSummaryLine } from "@/lib/api/inventory";
import type { Warehouse } from "@/lib/mock-data/inventory";
import { cn, formatQuantity } from "@/lib/utils";
import { applyImageFallback } from "@/lib/media/image-fallback";
import { useUserScopedState } from "@/lib/hooks/use-user-scoped-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FilterSelect } from "@/components/shared/filter-select";
import { DateRangePresetPicker } from "@/components/shared/date-range-preset-picker";
import { GridFullscreenHeader } from "@/components/shared/grid-fullscreen";
import { GRID_CHIP_CLASS, GridChipBadge } from "@/components/shared/grid-chip-badge";
import { AgainListGrid, NUMERIC_CELL, type AgainListServerPaging } from "@/components/shared/again-list-grid";
import { todayIso, yearStartIso } from "@/components/finance/finance-report-shell";

export type MovementReportRow = ApiMovementSummaryLine;

const qty = (v: unknown) => formatQuantity(Number(v ?? 0));

/** Movement types the ledger writes (the legacy aliases `opening`, `reserve`, … are not offered). */
const TYPE_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "opening_stock", label: "Opening stock" },
  { value: "purchase_receipt", label: "Purchase receipt" },
  { value: "purchase_return", label: "Purchase return" },
  { value: "sales_delivery", label: "Sales delivery" },
  { value: "pos_sale", label: "POS sale" },
  { value: "pos_return", label: "POS return" },
  { value: "commerce_sale", label: "Commerce sale" },
  { value: "customer_return", label: "Customer return" },
  { value: "transfer_out", label: "Transfer out" },
  { value: "transfer_in", label: "Transfer in" },
  { value: "transfer_in_transit", label: "In transit" },
  { value: "stock_adjustment_in", label: "Adjustment in" },
  { value: "stock_adjustment_out", label: "Adjustment out" },
  { value: "stock_count_in", label: "Count in" },
  { value: "stock_count_out", label: "Count out" },
  { value: "rma_replacement", label: "RMA replacement" },
  { value: "scrap", label: "Scrap" },
  { value: "service_consumption", label: "Service consumption" },
  { value: "reservation", label: "Reservation" },
  { value: "reservation_release", label: "Reservation release" },
  { value: "reversal", label: "Reversal" },
];

const EFFECT_TONE: Record<string, string> = {
  on_hand_in: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  on_hand_out: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  reservation: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  release: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
};
const NEUTRAL_TONE = "border-border bg-muted/40 text-muted-foreground";

const DEFAULT_VISIBLE = {
  thumbnail: true,
  moved_on: true,
  movement_label: true,
  name: true,
  sku: true,
  warehouse_name: true,
  quantity: true,
  qty_before: true,
  qty_after: true,
  reference: true,
};

const COLUMN_LABELS: Record<keyof typeof DEFAULT_VISIBLE, string> = {
  thumbnail: "Image",
  moved_on: "Date",
  movement_label: "Type",
  name: "Product",
  sku: "SKU",
  warehouse_name: "Warehouse",
  quantity: "Qty",
  qty_before: "Before",
  qty_after: "After",
  reference: "Reference",
};

const DEFAULT_VISIBLE_FILTERS = { search: true, warehouse: true, type: true, dates: true };

type FilterState = { search: string; warehouse: string; type: string; dateFrom: string; dateTo: string };
const defaultFilters = (): FilterState => ({
  search: "",
  warehouse: "all",
  type: "all",
  dateFrom: yearStartIso(),
  dateTo: todayIso(),
});

export type MovementReportGridFilters = {
  search: string;
  warehouseId: string;
  type: string;
  dateFrom: string;
  dateTo: string;
};

export type MovementReportGridHandle = {
  resetFilters: () => void;
  openFilters: () => void;
  openColumns: () => void;
};

type Props = {
  rows: MovementReportRow[];
  warehouses: Warehouse[];
  loading?: boolean;
  serverPaging?: AgainListServerPaging;
  /** Every filter is applied by the server, so the page needs to know when one changes. */
  onFiltersChange?: (filters: MovementReportGridFilters) => void;
  onFilterCountChange?: (count: number) => void;
  /** Totals and per-type chips above the grid. */
  summary?: ReactNode;
  headerLeftActions?: ReactNode;
  className?: string;
};

export const MovementReportGrid = forwardRef<MovementReportGridHandle, Props>(function MovementReportGrid(
  { rows, warehouses, loading = false, serverPaging, onFiltersChange, onFilterCountChange, summary, headerLeftActions, className },
  ref,
) {
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);

  const [visibleCols, setVisibleCols] = useUserScopedState("movement-report-grid:columns", DEFAULT_VISIBLE);
  const [visibleFilters, setVisibleFilters] = useUserScopedState("movement-report-grid:filters", DEFAULT_VISIBLE_FILTERS);
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
    onFiltersChange?.({
      search: filters.search.trim(),
      warehouseId: filters.warehouse,
      type: filters.type,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    });
  }, [filters, onFiltersChange]);

  const activeFilterCount = useMemo(() => {
    const base = defaultFilters();
    let count = 0;
    if (filters.search.trim()) count += 1;
    if (filters.warehouse !== "all") count += 1;
    if (filters.type !== "all") count += 1;
    if (filters.dateFrom !== base.dateFrom || filters.dateTo !== base.dateTo) count += 1;
    return count;
  }, [filters]);

  useEffect(() => {
    onFilterCountChange?.(activeFilterCount);
  }, [activeFilterCount, onFilterCountChange]);

  const resetFilters = useCallback(() => setFilters(defaultFilters()), []);

  useImperativeHandle(ref, () => ({
    resetFilters,
    openFilters: () => setFilterSheetOpen(true),
    openColumns: () => setColumnSheetOpen(true),
  }));

  const col = useCallback(
    (def: ColDef<MovementReportRow> & { colId: keyof typeof DEFAULT_VISIBLE }): ColDef<MovementReportRow> => ({
      headerName: COLUMN_LABELS[def.colId],
      hide: !resolvedCols[def.colId],
      ...def,
    }),
    [resolvedCols],
  );

  const columnDefs = useMemo<ColDef<MovementReportRow>[]>(
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
        cellRenderer: (p: ICellRendererParams<MovementReportRow>) =>
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
      col({
        colId: "moved_on",
        width: 110,
        minWidth: 96,
        valueGetter: (p) => p.data?.moved_on ?? p.data?.created_at?.slice(0, 10) ?? "",
      }),
      col({
        colId: "movement_label",
        field: "movement_label",
        width: 150,
        minWidth: 120,
        cellRenderer: (p: ICellRendererParams<MovementReportRow>) =>
          p.data ? (
            <GridChipBadge className={EFFECT_TONE[p.data.effect] ?? NEUTRAL_TONE} title={p.data.movement_label}>
              {p.data.movement_label}
            </GridChipBadge>
          ) : null,
      }),
      col({
        colId: "name",
        field: "name",
        flex: 2,
        minWidth: 160,
        tooltipField: "name",
        valueFormatter: (p) => p.value || "—",
      }),
      col({ colId: "sku", field: "sku", width: 110, minWidth: 80, cellClass: "font-mono text-[11px]", valueFormatter: (p) => p.value || "—" }),
      col({ colId: "warehouse_name", field: "warehouse_name", width: 150, minWidth: 110 }),
      col({
        colId: "quantity",
        field: "quantity",
        width: 88,
        minWidth: 64,
        type: "numericColumn",
        cellClass: (p) =>
          cn(
            NUMERIC_CELL,
            p.data?.effect === "on_hand_out" && "text-red-600 dark:text-red-400",
            p.data?.effect === "on_hand_in" && "text-emerald-700 dark:text-emerald-400",
          ),
        valueFormatter: (p) => qty(p.value),
      }),
      col({ colId: "qty_before", field: "qty_before", width: 88, minWidth: 64, type: "numericColumn", cellClass: NUMERIC_CELL, valueFormatter: (p) => qty(p.value) }),
      col({ colId: "qty_after", field: "qty_after", width: 88, minWidth: 64, type: "numericColumn", cellClass: NUMERIC_CELL, valueFormatter: (p) => qty(p.value) }),
      col({
        colId: "reference",
        field: "reference",
        width: 140,
        minWidth: 100,
        cellClass: "font-mono text-[11px] text-muted-foreground",
        valueFormatter: (p) => p.value || "—",
      }),
    ],
    [col],
  );

  return (
    <AgainListGrid<MovementReportRow>
      className={className}
      rowData={rows}
      columnDefs={columnDefs}
      loading={loading}
      serverPaging={serverPaging}
      headerLeftActions={headerLeftActions}
      summary={summary ? <div className="border-b border-border px-3 py-2">{summary}</div> : undefined}
      filterBar={
        <>
          {resolvedVisibleFilters.dates && (
            <DateRangePresetPicker
              value={{ dateFrom: filters.dateFrom, dateTo: filters.dateTo }}
              onChange={(next) => setFilters((f) => ({ ...f, dateFrom: next.dateFrom, dateTo: next.dateTo }))}
              clearable={false}
            />
          )}
          {resolvedVisibleFilters.search && (
            <Input
              placeholder="Search SKU, name, reference…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="w-[240px] shrink-0 rounded-none"
              data-testid="movement-report-search"
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
          {resolvedVisibleFilters.type && (
            <FilterSelect
              value={filters.type}
              onChange={(type) => setFilters((f) => ({ ...f, type }))}
              width="w-[170px]"
              className="shrink-0"
              ariaLabel="Movement type"
              options={TYPE_OPTIONS}
            />
          )}
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" className="h-7 shrink-0 rounded-none text-xs" onClick={resetFilters}>
              Clear
            </Button>
          )}
        </>
      }
      emptyTitle="No movements match your filters"
      emptyHint="Widen the date range, or clear filters"
      onResetFilters={resetFilters}
      onOpenColumns={() => setColumnSheetOpen(true)}
      mobile={
        rows.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">No movements match your filters</p>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((r) => (
              <div key={r.id} className="flex gap-3 px-3 py-2.5">
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
                      <p className="truncate text-sm font-medium">{r.name || r.sku || r.movement_label}</p>
                      <p className="truncate font-mono text-[11px] text-muted-foreground">{r.sku ?? "—"}</p>
                    </div>
                    <Badge variant="outline" className={cn("shrink-0", GRID_CHIP_CLASS, EFFECT_TONE[r.effect] ?? NEUTRAL_TONE)}>
                      {r.movement_label}
                    </Badge>
                  </div>
                  <dl className="mt-1.5 grid grid-cols-4 gap-x-2 text-[11px]">
                    <div>
                      <dt className="text-muted-foreground">Qty</dt>
                      <dd className="font-medium tabular-nums">{qty(r.quantity)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Before</dt>
                      <dd className="tabular-nums">{qty(r.qty_before)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">After</dt>
                      <dd className="tabular-nums">{qty(r.qty_after)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Date</dt>
                      <dd className="tabular-nums">{r.moved_on ?? r.created_at.slice(0, 10)}</dd>
                    </div>
                  </dl>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">
                    {r.warehouse_name ?? "—"}
                    {r.reference ? ` · ${r.reference}` : ""}
                  </p>
                </div>
              </div>
            ))}
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
