"use client";

import "@/components/providers/ag-grid-provider";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { AgGridReact } from "ag-grid-react";
import type {
  CellClickedEvent,
  ColDef,
  ColumnMovedEvent,
  ColumnResizedEvent,
  ColumnState,
  GridApi,
  GridReadyEvent,
  RowClickedEvent,
} from "ag-grid-community";
import { usePathname } from "next/navigation";
import { useUserScopedState } from "@/lib/hooks/use-user-scoped-state";
import type { AgGridReactProps } from "ag-grid-react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GridFullscreenHeader, useGridFullscreen } from "@/components/shared/grid-fullscreen";
import { GridZoomControl, useGridZoom } from "@/components/shared/grid-zoom";
import { useAgGridHeightFix } from "@/components/shared/use-ag-grid-height-fix";
import { useAgNativeServerPager } from "@/components/shared/use-ag-native-server-pager";
import { useIsDark } from "@/lib/use-is-dark";
import { cn } from "@/lib/utils";
import { formatCompanyIsoCell } from "@/lib/localisation/company-format";
import { getCompanyFormat, useCompanyFormatStore } from "@/lib/store/company-format-store";

export const AGAIN_LIST_PAGE_SIZE = 50;
export const AGAIN_LIST_PAGE_SIZES = [50, 100, 500, 1000] as const;
export const NUMERIC_CELL = "ag-right-aligned-cell tabular-nums";
export const NUMERIC_HEADER = "ag-right-aligned-header";

const DEFAULT_COL_DEF: ColDef = {
  sortable: true,
  resizable: true,
  filter: false,
  suppressHeaderMenuButton: true,
  suppressMovable: false,
  minWidth: 48,
  cellDataType: false,
};

type RowWithId = { id?: string };

export type AgainListServerPaging = {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
};

type GridPassThrough<T> = Partial<
  Omit<
    AgGridReactProps<T>,
    | "theme"
    | "rowData"
    | "columnDefs"
    | "headerHeight"
    | "rowHeight"
    | "pagination"
    | "paginationPageSize"
    | "paginationPageSizeSelector"
    | "defaultColDef"
  >
>;

export type AgainListGridProps<T = RowWithId> = {
  rowData: T[];
  columnDefs: ColDef<T>[];
  getRowId?: AgGridReactProps<T>["getRowId"];
  loading?: boolean;
  loadingFallback?: ReactNode;
  headerLeftActions?: ReactNode;
  filterBar?: ReactNode;
  banner?: ReactNode;
  summary?: ReactNode;
  footerLeftActions?: ReactNode;
  mobile?: ReactNode;
  children?: ReactNode;
  emptyTitle?: string;
  emptyHint?: string;
  onResetFilters?: () => void;
  onOpenColumns?: () => void;
  onRowClicked?: (row: T) => void;
  onGridReady?: (event: GridReadyEvent<T>) => void;
  apiRef?: MutableRefObject<GridApi<T> | null>;
  defaultColDef?: ColDef<T>;
  gridProps?: GridPassThrough<T>;
  serverPaging?: AgainListServerPaging;
  paginationPageSize?: number;
  paginationPageSizeSelector?: number[];
  autoFit?: boolean;
  className?: string;
  gridClassName?: string;
  /** Drawer / nested lists: skip the desktop/mobile split. */
  embedded?: boolean;
  /** Where this grid's column layout (order + widths) is saved per admin, on the server — like
   * a spreadsheet remembering its layout. Defaults to one layout per page; pass a key when a page
   * has several grids, or false when the grid saves its own layout. */
  layoutKey?: string | false;
  /** With layoutKey={false} (the grid saves its own layout): false keeps the grid invisible
   * until that layout has been applied, so columns don't visibly jump on load. */
  layoutReady?: boolean;
  /** With layoutKey={false}: the grid has saved column widths, so don't auto-fit over them. */
  layoutHasWidths?: boolean;
  /** With layoutKey={false}: that saved layout, so its widths survive columnDefs updates. */
  layoutWidths?: { colId: string; width?: number }[];
};

type SavedColumn = { colId: string; width?: number };

/** /sales/orders/8f2c… → /sales/orders/:id, so one layout covers every record page. */
function layoutKeyForPath(pathname: string | null): string {
  const path = (pathname ?? "/")
    .split("/")
    .map((part) => (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(part) || /^\d+$/.test(part) ? ":id" : part))
    .join("/");
  // Server keys allow letters, digits and : _ - . only.
  const key = path.replace(/^\/+|\/+$/g, "").replace(/\//g, ".").replace(/[^A-Za-z0-9:_.-]/g, "-");
  return `grid-layout:${key || "home"}`;
}

/** Columns saved earlier but not in the grid right now (still loading, hidden by a toggle…)
 * keep their place in the saved layout instead of being dropped. */
function mergeLayout(prev: SavedColumn[], current: SavedColumn[]): SavedColumn[] {
  const present = new Set(current.map((c) => c.colId));
  const merged = [...current];
  prev.forEach((entry, i) => {
    if (present.has(entry.colId)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const k = merged.findIndex((c) => c.colId === prev[j].colId);
      if (k >= 0) {
        at = k + 1;
        break;
      }
    }
    merged.splice(at, 0, entry);
  });
  return merged;
}

function Shimmer({ className }: { className?: string }) {
  return <div className={cn("fb-shimmer rounded-none", className)} />;
}

export function AgainListGridSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border-0 bg-background animate-[route-fade-in_160ms_ease-out]">
      <div className="flex shrink-0 items-center gap-4 border-b border-input bg-muted/30 px-3 py-2.5">
        <Shimmer className="h-4 w-4" />
        <Shimmer className="h-3 w-24" />
        <Shimmer className="h-3 w-28" />
        <Shimmer className="ml-auto h-3 w-16" />
        <Shimmer className="h-3 w-14" />
        <Shimmer className="h-3 w-16" />
      </div>
      <div className="min-h-0 flex-1 divide-y divide-input overflow-hidden">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-3 py-3" style={{ animationDelay: `${i * 40}ms` }}>
            <Shimmer className="h-4 w-4 shrink-0" />
            <Shimmer className={cn("h-3 shrink-0", i % 3 === 0 ? "w-24" : i % 3 === 1 ? "w-32" : "w-28")} />
            <Shimmer className="h-3 w-36 shrink-0" />
            <Shimmer className="ml-auto h-3 w-16 shrink-0" />
            <Shimmer className="h-5 w-16 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

function applyCompanyCellFormat<T>(columnDefs: ColDef<T>[]): ColDef<T>[] {
  return columnDefs.map((col) => {
    const group = col as ColDef<T> & { children?: ColDef<T>[] };
    if (group.children?.length) {
      return { ...col, children: applyCompanyCellFormat(group.children) };
    }
    const prev = col.valueFormatter;
    return {
      ...col,
      cellDataType: col.cellDataType ?? false,
      valueFormatter: (p) => {
        const settings = getCompanyFormat();
        try {
          const out = typeof prev === "function" ? prev(p) : p.value;
          return formatCompanyIsoCell(out, settings) as string;
        } catch {
          return formatCompanyIsoCell(p.value, settings) as string;
        }
      },
    };
  });
}

function patchFullscreenHeader<T>(
  columnDefs: ColDef<T>[],
  fullscreen: boolean,
  toggleFullscreen: () => void,
): ColDef<T>[] {
  return applyCompanyCellFormat(columnDefs).map((col) => {
    if (col.colId !== "actions") return col;
    return {
      ...col,
      headerComponent: GridFullscreenHeader,
      headerComponentParams: { fullscreen, onToggle: toggleFullscreen },
    };
  });
}

function defaultRowId<T extends RowWithId>(p: { data: T }) {
  return String(p.data?.id ?? "");
}

/**
 * Global Again List Datatable shell (SAP/Odoo-style).
 * One file owns filter-bar chrome, theme, zoom, native 27px pager, empty overlay, day/night.
 * Page grids pass columns + rows + filter slots only.
 */
export function AgainListGrid<T extends RowWithId = RowWithId>({
  rowData,
  columnDefs,
  getRowId,
  loading = false,
  loadingFallback,
  headerLeftActions,
  filterBar,
  banner,
  summary,
  footerLeftActions,
  mobile,
  children,
  emptyTitle,
  emptyHint,
  onResetFilters,
  onOpenColumns,
  onRowClicked,
  onGridReady,
  apiRef,
  defaultColDef,
  gridProps,
  serverPaging,
  paginationPageSize,
  paginationPageSizeSelector,
  autoFit = true,
  className,
  gridClassName,
  embedded = false,
  layoutKey,
  layoutReady,
  layoutHasWidths,
  layoutWidths,
}: AgainListGridProps<T>) {
  const isDark = useIsDark();
  const companyFormat = useCompanyFormatStore((s) => s.format);
  const { fullscreen, toggleFullscreen, fullscreenClassName } = useGridFullscreen();
  const { zoom, setZoom, zoomStyle, rowHeight, headerHeight } = useGridZoom();
  const innerApiRef = useRef<GridApi<T> | null>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [gridReady, setGridReady] = useState(false);
  // Saved widths (the admin resized or arranged columns) win over auto-fit, like a spreadsheet;
  // auto-fit only runs for a grid nobody has laid out yet.
  const skipFitRef = useRef(false);

  // ── Saved column layout (per admin, synced to the server) ────────────────
  const pathname = usePathname();
  const layoutEnabled = layoutKey !== false;
  const [savedLayout, setSavedLayout, savedLayoutLoaded] = useUserScopedState<SavedColumn[]>(
    layoutEnabled ? (layoutKey ?? layoutKeyForPath(pathname)) : "grid-layout:off",
    [],
    { sync: layoutEnabled },
  );
  const skipFit = layoutEnabled
    ? savedLayout.some((c) => typeof c.width === "number")
    : Boolean(layoutHasWidths);
  // kept in a ref so the fit callback stays stable; set before the grid's callbacks and effects run
  useLayoutEffect(() => {
    skipFitRef.current = skipFit;
  }, [skipFit]);
  const applySavedLayout = useCallback(
    (api: GridApi<T>) => {
      if (!layoutEnabled || savedLayout.length === 0) return;
      // Jump straight to the saved order — no slide animation for restoring a layout.
      api.setGridOption("suppressColumnMoveAnimation", true);
      api.applyColumnState({
        // flex: null so a saved width isn't overridden by a column's flex sizing.
        state: savedLayout.map((c) => (typeof c.width === "number" ? { ...c, flex: null } : c)),
        applyOrder: true,
      });
      requestAnimationFrame(() => api.setGridOption("suppressColumnMoveAnimation", false));
    },
    [layoutEnabled, savedLayout],
  );
  // Stay invisible until the saved layout is known and applied, then show — no column jumping.
  const layoutKnown = layoutEnabled ? savedLayoutLoaded : layoutReady ?? true;
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (revealed || !layoutKnown || !gridReady) return;
    const api = innerApiRef.current;
    if (api) applySavedLayout(api);
    const frame = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(frame);
  }, [revealed, layoutKnown, gridReady, applySavedLayout]);
  useEffect(() => {
    // Never leave a grid hidden because something upstream didn't report ready.
    const handle = window.setTimeout(() => setRevealed(true), 2500);
    return () => window.clearTimeout(handle);
  }, []);
  const saveLayout = useCallback(
    (api: GridApi<T>) => {
      if (!layoutEnabled) return;
      const current: SavedColumn[] = api
        .getColumnState()
        .map((c: ColumnState) => ({ colId: c.colId, width: c.width ?? undefined }));
      setSavedLayout((prev) => mergeLayout(prev, current));
    },
    [layoutEnabled, setSavedLayout],
  );

  useAgGridHeightFix(gridContainerRef);
  useAgNativeServerPager(gridContainerRef, Boolean(serverPaging) && gridReady, {
    total: serverPaging?.total ?? 0,
    page: serverPaging?.page ?? 0,
    pageSize: serverPaging?.pageSize ?? AGAIN_LIST_PAGE_SIZE,
    onPageChange: serverPaging?.onPageChange ?? noopPage,
  });

  const fitColumnsToGrid = useCallback(
    (api: { sizeColumnsToFit: () => void }) => {
      if (!autoFit || skipFitRef.current) return;
      requestAnimationFrame(() => {
        api.sizeColumnsToFit();
        requestAnimationFrame(() => api.sizeColumnsToFit());
      });
    },
    [autoFit],
  );

  // Saved widths go into the column definitions themselves: grids re-send their columnDefs on
  // every data load / toggle, and AG Grid would otherwise reset each column to its default width.
  const savedWidths = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of layoutEnabled ? savedLayout : layoutWidths ?? []) {
      if (typeof c.width === "number") map.set(c.colId, c.width);
    }
    return map;
  }, [layoutEnabled, savedLayout, layoutWidths]);
  const resolvedColumnDefs = useMemo(() => {
    const patched = patchFullscreenHeader(columnDefs, fullscreen, toggleFullscreen);
    return patched.map((raw) => {
      // the header "select all" checkbox ticks the rows of the page on screen, not every page of the list
      const col = (raw as ColDef<T>).headerCheckboxSelection && (raw as ColDef<T>).headerCheckboxSelectionCurrentPageOnly === undefined
        ? ({ ...raw, headerCheckboxSelectionCurrentPageOnly: true } as ColDef<T>)
        : raw;
      const def = col as ColDef<T>;
      const id = def.colId ?? (typeof def.field === "string" ? def.field : undefined);
      const width = id ? savedWidths.get(id) : undefined;
      if (width !== undefined) return { ...col, width, flex: undefined } as ColDef<T>;
      // A default size is only a starting size: as `width` / `flex`, AG Grid re-applied it on every
      // columnDefs update (Price Compare sends new defs as competitor results stream in), the auto-fit
      // shrank the columns again, and the table flickered between two layouts until the data settled.
      const { width: start, flex, ...rest } = def;
      if (start === undefined && (flex === undefined || flex === null)) return col;
      return {
        ...rest,
        ...(start !== undefined ? { initialWidth: start } : {}),
        ...(flex !== undefined && flex !== null ? { initialFlex: flex } : {}),
      } as ColDef<T>;
    });
  }, [columnDefs, fullscreen, toggleFullscreen, savedWidths]);
  // which columns the grid shows (and whether hidden): re-fit when that changes, not on every columnDefs update
  const fitColumnsKey = useMemo(
    () =>
      resolvedColumnDefs
        .map((c) => {
          const d = c as ColDef<T>;
          return `${d.colId ?? (typeof d.field === "string" ? d.field : "")}${d.hide ? ":h" : ""}`;
        })
        .join("|"),
    [resolvedColumnDefs],
  );

  const mergedDefaultColDef = useMemo<ColDef<T>>(() => {
    const base = { ...DEFAULT_COL_DEF, ...defaultColDef };
    if (defaultColDef?.valueFormatter) return base;
    return {
      ...base,
      valueFormatter: (p) => formatCompanyIsoCell(p.value, getCompanyFormat()) as string,
    };
  }, [defaultColDef]);

  useEffect(() => {
    const api = innerApiRef.current;
    if (api) fitColumnsToGrid(api);
  }, [fitColumnsKey, fitColumnsToGrid]);

  useEffect(() => {
    const api = innerApiRef.current;
    if (!api) return;
    api.setGridOption("headerHeight", headerHeight);
    api.setGridOption("rowHeight", rowHeight);
    fitColumnsToGrid(api);
  }, [zoom, rowHeight, headerHeight, fitColumnsToGrid]);

  useEffect(() => {
    if (innerApiRef.current) fitColumnsToGrid(innerApiRef.current);
  }, [fullscreen, fitColumnsToGrid]);

  useEffect(() => {
    const api = innerApiRef.current;
    if (!api) return;
    api.setGridOption("columnDefs", resolvedColumnDefs);
    api.refreshCells({ force: true });
  }, [companyFormat, resolvedColumnDefs]);

  const columnIdsKey = useMemo(
    () => resolvedColumnDefs.map((c) => (c as ColDef<T>).colId ?? String((c as ColDef<T>).field ?? "")).join("|"),
    [resolvedColumnDefs],
  );
  useEffect(() => {
    const api = innerApiRef.current;
    if (!api) return;
    const handle = window.setTimeout(() => applySavedLayout(api), 0);
    return () => window.clearTimeout(handle);
  }, [applySavedLayout, columnIdsKey, gridReady]);

  const handleGridReady = useCallback(
    (event: GridReadyEvent<T>) => {
      innerApiRef.current = event.api;
      if (apiRef) apiRef.current = event.api;
      setGridReady(true);
      applySavedLayout(event.api);
      fitColumnsToGrid(event.api);
      onGridReady?.(event);
      gridProps?.onGridReady?.(event);
    },
    [apiRef, applySavedLayout, fitColumnsToGrid, gridProps, onGridReady],
  );

  const shouldIgnoreRowClickTarget = useCallback((target: EventTarget | null | undefined, colId?: string) => {
    if (colId === "actions") return true;
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest("button, a, [role='menuitem'], [data-row-actions]"));
  }, []);

  const handleRowClicked = useCallback(
    (e: RowClickedEvent<T>) => {
      gridProps?.onRowClicked?.(e);
      if (!onRowClicked || !e.data) return;
      if (shouldIgnoreRowClickTarget(e.event?.target, e.column?.getColId())) return;
      onRowClicked(e.data);
    },
    [gridProps, onRowClicked, shouldIgnoreRowClickTarget],
  );

  const handleCellClicked = useCallback(
    (e: CellClickedEvent<T>) => {
      gridProps?.onCellClicked?.(e);
      if (!onRowClicked || !e.data) return;
      if (shouldIgnoreRowClickTarget(e.event?.target, e.column?.getColId())) return;
      onRowClicked(e.data);
    },
    [gridProps, onRowClicked, shouldIgnoreRowClickTarget],
  );

  const pageSize = serverPaging?.pageSize ?? paginationPageSize ?? AGAIN_LIST_PAGE_SIZE;
  const pageSizes = paginationPageSizeSelector ?? [...AGAIN_LIST_PAGE_SIZES];
  // A server-paged list starting at a size the selector doesn't offer (an old 10 / 25 default) moves to the
  // first offered size, so every list opens with the same rows per page.
  const serverPageSize = serverPaging?.pageSize;
  const changeServerPageSize = serverPaging?.onPageSizeChange;
  useEffect(() => {
    if (serverPageSize !== undefined && changeServerPageSize && !pageSizes.includes(serverPageSize)) {
      changeServerPageSize(pageSizes[0]);
    }
    // pageSizes is a fresh array each render; its content only changes with the selector prop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverPageSize, changeServerPageSize, paginationPageSizeSelector]);
  const showFilterBar = Boolean(headerLeftActions || filterBar);
  const showEmpty = !loading && rowData.length === 0 && Boolean(emptyTitle);

  const canvas = (
    <div
      ref={gridContainerRef}
      className={cn(
        "product-grid-fill ag-theme-quartz ag-theme-again-list relative min-h-0 w-full min-w-0 flex-1 overflow-hidden rounded-none border-0 bg-background [&_.ag-root-wrapper]:h-full [&_.ag-root-wrapper]:w-full [&_.ag-root-wrapper]:border-0 [&_.ag-root-wrapper]:shadow-none [&_.ag-paging-panel]:pl-[148px]",
        footerLeftActions && "[&_.ag-paging-panel]:pl-[300px]",
        isDark && "ag-theme-quartz-dark",
        gridClassName,
      )}
      style={revealed ? zoomStyle : { ...zoomStyle, visibility: "hidden" }}
    >
      {onOpenColumns ? (
        <button
          type="button"
          aria-label="Columns"
          title="Columns"
          onClick={onOpenColumns}
          className="absolute right-0 top-0 z-20 inline-flex w-8 items-center justify-center bg-transparent text-foreground hover:bg-transparent"
          style={{ height: headerHeight }}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
        </button>
      ) : null}
      <AgGridReact<T>
        theme="legacy"
        rowData={rowData}
        getRowId={getRowId ?? defaultRowId}
        headerHeight={headerHeight}
        rowHeight={rowHeight}
        animateRows
        alwaysShowVerticalScroll
        suppressScrollOnNewData
        enableBrowserTooltips
        tooltipShowDelay={400}
        pagination
        paginationPageSize={pageSize}
        paginationPageSizeSelector={pageSizes}
        overlayNoRowsTemplate=""
        overlayLoadingTemplate=""
        // A columnDefs update (data loaded, a toggle) must not undo the order the admin dragged.
        maintainColumnOrder
        {...gridProps}
        onColumnMoved={(e: ColumnMovedEvent<T>) => {
          gridProps?.onColumnMoved?.(e);
          if (e.finished && (e.source === "uiColumnMoved" || e.source === "uiColumnDragged")) saveLayout(e.api);
        }}
        onColumnResized={(e: ColumnResizedEvent<T>) => {
          gridProps?.onColumnResized?.(e);
          if (e.finished && e.source === "uiColumnResized") saveLayout(e.api);
        }}
        columnDefs={resolvedColumnDefs}
        defaultColDef={mergedDefaultColDef}
        onGridReady={handleGridReady}
        onRowClicked={onRowClicked || gridProps?.onRowClicked ? handleRowClicked : gridProps?.onRowClicked}
        onCellClicked={onRowClicked || gridProps?.onCellClicked ? handleCellClicked : gridProps?.onCellClicked}
        onFirstDataRendered={(e) => {
          fitColumnsToGrid(e.api);
          gridProps?.onFirstDataRendered?.(e);
        }}
        onPaginationChanged={(e) => {
          gridProps?.onPaginationChanged?.(e);
          const change = serverPaging?.onPageSizeChange;
          if (!change) return;
          const size = e.api.paginationGetPageSize();
          if (size && size !== serverPaging.pageSize) change(size);
        }}
        rowClass={onRowClicked ? "cursor-pointer" : gridProps?.rowClass}
      />
      {showEmpty ? (
        <div
          className="absolute inset-x-0 bottom-[27px] z-10 flex flex-col items-center justify-center bg-background"
          style={{ top: headerHeight }}
        >
          <p className="text-sm font-medium">{emptyTitle}</p>
          {emptyHint ? <p className="mt-1 text-xs text-muted-foreground">{emptyHint}</p> : null}
          {onResetFilters ? (
            <Button size="sm" className="mt-4 rounded-none" onClick={onResetFilters}>
              Clear filters
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="pointer-events-none absolute bottom-0 left-0 z-10 flex h-[27px] items-center">
        <GridZoomControl zoom={zoom} onChange={setZoom} />
        {footerLeftActions ? (
          <div className="pointer-events-auto flex items-center gap-2 pl-2">{footerLeftActions}</div>
        ) : null}
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        "relative flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden",
        fullscreenClassName,
        className,
      )}
    >
      {showFilterBar ? (
        <div
          className={cn(
            "product-grid-filters flex min-w-0 shrink-0 items-center gap-1.5 border-b border-border py-1 pl-2 pr-0",
            fullscreen && "hidden",
          )}
        >
          {headerLeftActions ? (
            <div className="flex shrink-0 items-center gap-2 border-r border-border bg-background pr-2">
              {headerLeftActions}
            </div>
          ) : null}
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {filterBar}
          </div>
        </div>
      ) : null}
      {banner && !fullscreen ? <div className="shrink-0">{banner}</div> : null}
      {summary && !fullscreen ? <div className="shrink-0">{summary}</div> : null}

      {embedded ? (
        loading ? (
          (loadingFallback ?? <AgainListGridSkeleton />)
        ) : (
          canvas
        )
      ) : (
        <>
          <div className="hidden min-h-0 flex-1 flex-col md:flex">
            {loading ? (loadingFallback ?? <AgainListGridSkeleton />) : canvas}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto md:hidden">{mobile}</div>
        </>
      )}

      {children}
    </div>
  );
}

function noopPage() {}
