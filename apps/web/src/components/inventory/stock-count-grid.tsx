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
import { Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn, formatDate } from "@/lib/utils";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useUserScopedState } from "@/lib/hooks/use-user-scoped-state";
import { Badge } from "@/components/ui/badge";
import { GRID_CHIP_CLASS, GridChipBadge } from "@/components/shared/grid-chip-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
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
import { deleteStockCount, type ApiStockCount } from "@/lib/api/inventory";
import type { Warehouse } from "@/lib/mock-data/inventory";

type CountStatus = ApiStockCount["status"];

const STATUS_LABEL: Record<CountStatus, string> = {
  draft: "Draft",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_TONE: Record<CountStatus, string> = {
  draft: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  completed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  cancelled: "",
};

type FilterState = { search: string; warehouse: string; status: string };
const DEFAULT_FILTERS: FilterState = { search: "", warehouse: "all", status: "all" };

const DEFAULT_VISIBLE = {
  number: true,
  warehouse: true,
  date: true,
  lines: true,
  variances: true,
  status: true,
  countedBy: false,
};

const COLUMN_LABELS: Record<keyof typeof DEFAULT_VISIBLE, string> = {
  number: "Count #",
  warehouse: "Warehouse",
  date: "Date",
  lines: "Lines",
  variances: "Variances",
  status: "Status",
  countedBy: "Counted by",
};

const DEFAULT_VISIBLE_FILTERS = { search: true, warehouse: true, status: true };
const FILTER_LABELS: Record<keyof typeof DEFAULT_VISIBLE_FILTERS, string> = {
  search: "Search",
  warehouse: "Warehouse",
  status: "Status",
};

function StatusChip({ status }: { status: CountStatus }) {
  if (status === "cancelled") {
    return <GridChipBadge variant="muted">{STATUS_LABEL[status]}</GridChipBadge>;
  }
  return (
    <GridChipBadge className={STATUS_TONE[status]} title={STATUS_LABEL[status]}>
      {STATUS_LABEL[status]}
    </GridChipBadge>
  );
}

export type StockCountGridHandle = {
  openFilters: () => void;
  openColumns: () => void;
  resetFilters: () => void;
};

export const StockCountGrid = forwardRef<
  StockCountGridHandle,
  {
    counts: ApiStockCount[];
    warehouses?: Warehouse[];
    loading?: boolean;
    onView: (row: ApiStockCount) => void;
    onChanged?: () => void;
    onFilterCountChange?: (count: number) => void;
    headerLeftActions?: ReactNode;
    className?: string;
  }
>(function StockCountGrid(
  {
    counts,
    warehouses = [],
    loading = false,
    onView,
    onChanged,
    onFilterCountChange,
    headerLeftActions,
    className,
  },
  ref,
) {
  const canWrite = useAdminCanWrite();
  const gridApiRef = useRef<GridApi<ApiStockCount> | null>(null);

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);

  const [visibleCols, setVisibleCols] = useUserScopedState("stock-count-grid:columns", DEFAULT_VISIBLE);
  const [visibleFilters, setVisibleFilters] = useUserScopedState(
    "stock-count-grid:filters",
    DEFAULT_VISIBLE_FILTERS,
  );
  const resolvedCols = useMemo(() => ({ ...DEFAULT_VISIBLE, ...visibleCols }), [visibleCols]);
  const resolvedVisibleFilters = useMemo(
    () => ({ ...DEFAULT_VISIBLE_FILTERS, ...visibleFilters }),
    [visibleFilters],
  );

  useImperativeHandle(ref, () => ({
    openFilters: () => setFilterSheetOpen(true),
    openColumns: () => setColumnSheetOpen(true),
    resetFilters: () => setFilters(DEFAULT_FILTERS),
  }));

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return counts.filter((row) => {
      if (
        q &&
        !`${row.count_number} ${row.warehouse_name ?? ""} ${row.counted_by ?? ""} ${row.notes ?? ""}`
          .toLowerCase()
          .includes(q)
      ) {
        return false;
      }
      if (filters.warehouse !== "all" && row.warehouse_name !== filters.warehouse) return false;
      if (filters.status !== "all" && row.status !== filters.status) return false;
      return true;
    });
  }, [counts, filters]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.search.trim()) n += 1;
    if (filters.warehouse !== "all") n += 1;
    if (filters.status !== "all") n += 1;
    return n;
  }, [filters]);

  useEffect(() => {
    onFilterCountChange?.(activeFilterCount);
  }, [activeFilterCount, onFilterCountChange]);

  const removeCount = useCallback(
    async (row: ApiStockCount) => {
      if (!confirm(`Delete ${row.count_number}?`)) return;
      try {
        await deleteStockCount(row.id);
        toast.success(`${row.count_number} deleted`);
        onChanged?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Delete failed");
      }
    },
    [onChanged],
  );

  const RowMenu = useCallback(
    ({ data }: { data: ApiStockCount }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <RowActionsTrigger />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => onView(data)}>
            <Eye className="mr-1.5 h-3 w-3" /> Open
          </DropdownMenuItem>
          {canWrite && data.status === "draft" && (
            <DropdownMenuItem
              onClick={() => void removeCount(data)}
              className="text-red-600 dark:text-red-400"
            >
              <Trash2 className="mr-1.5 h-3 w-3" /> Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    [canWrite, onView, removeCount],
  );

  const columnDefs = useMemo<ColDef<ApiStockCount>[]>(
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
        cellRenderer: (p: ICellRendererParams<ApiStockCount>) =>
          p.data ? <RowMenu data={p.data} /> : null,
      },
      {
        colId: "number",
        field: "count_number",
        headerName: COLUMN_LABELS.number,
        hide: !resolvedCols.number,
        width: 150,
        minWidth: 120,
        cellClass: "font-mono text-[11px]",
        cellRenderer: (p: ICellRendererParams<ApiStockCount>) =>
          p.data ? (
            <button
              type="button"
              className="truncate font-mono text-[11px] font-semibold hover:text-primary"
              onClick={() => onView(p.data!)}
            >
              {p.data.count_number}
            </button>
          ) : null,
      },
      {
        colId: "warehouse",
        field: "warehouse_name",
        headerName: COLUMN_LABELS.warehouse,
        hide: !resolvedCols.warehouse,
        flex: 1,
        minWidth: 140,
        valueFormatter: (p) => (p.value ? String(p.value) : "—"),
      },
      {
        colId: "date",
        field: "count_date",
        headerName: COLUMN_LABELS.date,
        hide: !resolvedCols.date,
        width: 120,
        minWidth: 96,
        valueFormatter: (p) => formatDate(p.value as string | null),
        sort: "desc",
      },
      {
        colId: "lines",
        field: "line_count",
        headerName: COLUMN_LABELS.lines,
        hide: !resolvedCols.lines,
        width: 90,
        minWidth: 72,
        type: "numericColumn",
        cellClass: "ag-right-aligned-cell tabular-nums",
      },
      {
        colId: "variances",
        field: "variance_count",
        headerName: COLUMN_LABELS.variances,
        hide: !resolvedCols.variances,
        width: 110,
        minWidth: 88,
        type: "numericColumn",
        cellClass: "ag-right-aligned-cell tabular-nums",
      },
      {
        colId: "status",
        field: "status",
        headerName: COLUMN_LABELS.status,
        hide: !resolvedCols.status,
        width: 124,
        minWidth: 100,
        cellRenderer: (p: ICellRendererParams<ApiStockCount>) =>
          p.data ? <StatusChip status={p.data.status} /> : null,
      },
      {
        colId: "countedBy",
        field: "counted_by",
        headerName: COLUMN_LABELS.countedBy,
        hide: !resolvedCols.countedBy,
        width: 140,
        minWidth: 110,
        valueFormatter: (p) => (p.value ? String(p.value) : "—"),
      },
    ],
    [RowMenu, onView, resolvedCols],
  );

  return (
    <AgainListGrid<ApiStockCount>
      className={className}
      rowData={filtered}
      columnDefs={columnDefs}
      loading={loading}
      headerLeftActions={headerLeftActions}
      filterBar={
        <>
          {resolvedVisibleFilters.search && (
            <Input
              placeholder="Search count #, warehouse…"
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
          {resolvedVisibleFilters.status && (
            <FilterSelect
              value={filters.status}
              onChange={(status) => setFilters((f) => ({ ...f, status }))}
              width="w-[160px]"
              className="shrink-0"
              ariaLabel="Status"
              options={[
                { value: "all", label: "All statuses" },
                { value: "draft", label: "Draft" },
                { value: "completed", label: "Completed" },
                { value: "cancelled", label: "Cancelled" },
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
      emptyTitle="No stock counts match your filters"
      emptyHint="Start a new count, or clear the filters"
      onResetFilters={() => setFilters(DEFAULT_FILTERS)}
      onOpenColumns={() => setColumnSheetOpen(true)}
      apiRef={gridApiRef}
      mobile={
        <div className="divide-y divide-border">
          {filtered.slice(0, 50).map((row) => (
            <button
              key={row.id}
              type="button"
              className="flex w-full flex-col items-stretch gap-1 px-3 py-2.5 text-left"
              onClick={() => onView(row)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-mono text-[11px] font-semibold">{row.count_number}</p>
                  <p className="truncate text-sm">{row.warehouse_name || "—"}</p>
                </div>
                {row.status === "cancelled" ? (
                  <Badge variant="muted" className={cn("shrink-0", GRID_CHIP_CLASS)}>
                    {STATUS_LABEL[row.status]}
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className={cn("shrink-0", GRID_CHIP_CLASS, STATUS_TONE[row.status])}
                  >
                    {STATUS_LABEL[row.status]}
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {row.line_count} lines · {row.variance_count} variances · {formatDate(row.count_date)}
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
