"use client";

import {
  useCallback,
  useImperativeHandle,
  useMemo,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import type { ColDef } from "ag-grid-community";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  AgainListGrid,
  AgainListGridSkeleton,
  NUMERIC_CELL,
  NUMERIC_HEADER,
} from "@/components/shared/again-list-grid";
import { GridFullscreenHeader } from "@/components/shared/grid-fullscreen";
import { useUserScopedState } from "@/lib/hooks/use-user-scoped-state";

export { NUMERIC_CELL, NUMERIC_HEADER };

function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const escape = (cell: string | number) => {
    const s = String(cell ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const body = [headers.map(escape).join(","), ...rows.map((row) => row.map(escape).join(","))].join("\n");
  const blob = new Blob([body], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export type FinanceAgListGridHandle = {
  openFilters: () => void;
  openColumns: () => void;
  resetFilters: () => void;
  exportCsv: () => void;
};

type RowBase = { id: string };

export type FinanceAgListGridColumn<T = RowBase> = ColDef<T> & {
  colId: string;
  headerName: string;
};

export type FinanceFilterToggle = {
  key: string;
  label: string;
  defaultVisible?: boolean;
};

type Props = {
  storageKey: string;
  rows: RowBase[];
  columns: FinanceAgListGridColumn[];
  loading?: boolean;
  headerLeftActions?: ReactNode;
  filterBar?: ReactNode | ((visible: Record<string, boolean>) => ReactNode);
  footerLeftActions?: ReactNode;
  summary?: ReactNode;
  emptyTitle: string;
  emptyHint?: string;
  onRowClicked?: (row: any) => void;
  onResetFilters?: () => void;
  csvFileName: string;
  csvHeaders: string[];
  csvRow: (row: any) => Array<string | number>;
  filterToggles?: FinanceFilterToggle[];
  rowActions?: (row: any) => ReactNode;
  mobileLine?: (row: any) => { title: string; meta: string; value: string };
  className?: string;
  gridRef?: Ref<FinanceAgListGridHandle>;
  /** Override the default page size (e.g. a statement-style report that must fit on one page). */
  paginationPageSize?: number;
  paginationPageSizeSelector?: number[];
};

export function FinanceAgListGrid({
  storageKey,
  rows,
  columns,
  loading = false,
  headerLeftActions,
  filterBar,
  footerLeftActions,
  summary,
  emptyTitle,
  emptyHint,
  onRowClicked,
  onResetFilters,
  csvFileName,
  csvHeaders,
  csvRow,
  filterToggles = [],
  rowActions,
  mobileLine,
  className,
  gridRef,
  paginationPageSize,
  paginationPageSizeSelector,
}: Props) {
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);

  const defaultVisible = useMemo(() => {
    const next: Record<string, boolean> = {};
    for (const col of columns) next[col.colId] = col.hide !== true;
    return next;
  }, [columns]);

  const defaultVisibleFilters = useMemo(() => {
    const next: Record<string, boolean> = {};
    for (const toggle of filterToggles) next[toggle.key] = toggle.defaultVisible !== false;
    return next;
  }, [filterToggles]);

  const [visibleCols, setVisibleCols] = useUserScopedState(
    `finance-list:${storageKey}:columns`,
    defaultVisible,
  );
  const [visibleFilters, setVisibleFilters] = useUserScopedState(
    `finance-list:${storageKey}:filters`,
    defaultVisibleFilters,
  );
  const resolvedCols = useMemo(() => ({ ...defaultVisible, ...visibleCols }), [defaultVisible, visibleCols]);
  const resolvedVisibleFilters = useMemo(
    () => ({ ...defaultVisibleFilters, ...visibleFilters }),
    [defaultVisibleFilters, visibleFilters],
  );

  const exportCsv = useCallback(() => {
    downloadCsv(
      csvFileName,
      csvHeaders,
      rows.map((row) => csvRow(row)),
    );
    toast.success(`Exported ${rows.length} row${rows.length === 1 ? "" : "s"}`);
  }, [csvFileName, csvHeaders, csvRow, rows]);

  useImperativeHandle(
    gridRef,
    () => ({
      openFilters: () => setFilterSheetOpen(true),
      openColumns: () => setColumnSheetOpen(true),
      resetFilters: () => onResetFilters?.(),
      exportCsv,
    }),
    [exportCsv, onResetFilters],
  );

  const columnDefs = useMemo<ColDef<RowBase>[]>(
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
        cellRenderer: rowActions
          ? (p: { data?: RowBase }) => (p.data ? rowActions(p.data) : null)
          : undefined,
      },
      ...columns.map((col) => ({
        ...col,
        hide: resolvedCols[col.colId] === false,
      })),
    ],
    [columns, resolvedCols, rowActions],
  );

  const renderedFilterBar =
    typeof filterBar === "function" ? filterBar(resolvedVisibleFilters) : filterBar;

  return (
    <AgainListGrid<RowBase>
      className={className}
      rowData={rows}
      columnDefs={columnDefs}
      loading={loading}
      paginationPageSize={paginationPageSize}
      paginationPageSizeSelector={paginationPageSizeSelector}
      loadingFallback={<AgainListGridSkeleton />}
      headerLeftActions={headerLeftActions}
      filterBar={renderedFilterBar}
      summary={summary}
      footerLeftActions={footerLeftActions}
      emptyTitle={emptyTitle}
      emptyHint={emptyHint}
      onResetFilters={onResetFilters}
      onOpenColumns={() => setColumnSheetOpen(true)}
      onRowClicked={onRowClicked}
      mobile={
        loading ? (
          <AgainListGridSkeleton rows={8} />
        ) : rows.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium">{emptyTitle}</p>
            {emptyHint ? <p className="mt-1 text-xs text-muted-foreground">{emptyHint}</p> : null}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {rows.slice(0, 50).map((row) => {
              const line = mobileLine?.(row) ?? {
                title: String((row as { name?: string }).name ?? row.id),
                meta: "",
                value: "",
              };
              return (
                <button
                  key={row.id}
                  type="button"
                  className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left"
                  onClick={() => onRowClicked?.(row)}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{line.title}</p>
                    {line.meta ? (
                      <p className="truncate font-mono text-[11px] text-muted-foreground">{line.meta}</p>
                    ) : null}
                  </div>
                  {line.value ? (
                    <p className="shrink-0 text-sm tabular-nums text-foreground">{line.value}</p>
                  ) : null}
                </button>
              );
            })}
            {rows.length > 50 ? (
              <p className="px-3 py-2 text-center text-xs text-muted-foreground">
                Showing 50 of {rows.length} — use desktop for the full list
              </p>
            ) : null}
          </div>
        )
      }
    >
      {filterToggles.length > 0 ? (
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
              {filterToggles.map((toggle) => (
                <label key={toggle.key} className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                  <input
                    type="checkbox"
                    checked={resolvedVisibleFilters[toggle.key] !== false}
                    onChange={(e) =>
                      setVisibleFilters({ ...resolvedVisibleFilters, [toggle.key]: e.target.checked })
                    }
                    className="h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none rounded-none border border-input bg-background checked:border-primary checked:bg-primary"
                  />
                  {toggle.label}
                </label>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      ) : null}

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
            {columns.map((col) => (
              <label key={col.colId} className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={resolvedCols[col.colId] !== false}
                  onChange={(e) => setVisibleCols({ ...resolvedCols, [col.colId]: e.target.checked })}
                  className="h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none rounded-none border border-input bg-background checked:border-primary checked:bg-primary"
                />
                {col.headerName}
              </label>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 h-7 rounded-none text-xs"
            onClick={() => setVisibleCols(defaultVisible)}
          >
            Reset columns
          </Button>
        </SheetContent>
      </Sheet>
    </AgainListGrid>
  );
}
