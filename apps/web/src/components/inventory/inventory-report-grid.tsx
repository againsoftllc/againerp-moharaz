"use client";

import "@/components/providers/ag-grid-provider";
import { useMemo, useRef, useState, type ReactNode } from "react";
import type { ColDef, GridApi } from "ag-grid-community";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { GridFullscreenHeader } from "@/components/shared/grid-fullscreen";
import { AgainListGrid, type AgainListServerPaging } from "@/components/shared/again-list-grid";
import { useUserScopedState } from "@/lib/hooks/use-user-scoped-state";

export type InventoryReportGridColumn<T> = ColDef<T> & {
  colId: string;
  headerName: string;
};

type Props<T extends { id: string }> = {
  rows: T[];
  columns: InventoryReportGridColumn<T>[];
  storageKey: string;
  loading?: boolean;
  toolbar?: ReactNode;
  summary?: ReactNode;
  emptyTitle: string;
  emptyHint?: string;
  mobileLine?: (row: T) => { title: string; meta: string; value: string };
  /** Row click (buttons/links inside the row are ignored by the grid). */
  onRowClicked?: (row: T) => void;
  /** Server-side pagination — omit for the default client-side paging. */
  serverPaging?: AgainListServerPaging;
};

export function InventoryReportGrid<T extends { id: string }>({
  rows,
  columns,
  storageKey,
  loading = false,
  toolbar,
  summary,
  emptyTitle,
  emptyHint,
  mobileLine,
  onRowClicked,
  serverPaging,
}: Props<T>) {
  const gridApiRef = useRef<GridApi<T> | null>(null);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);

  const defaultVisible = useMemo(() => {
    const next: Record<string, boolean> = {};
    for (const col of columns) next[col.colId] = col.hide !== true;
    return next;
  }, [columns]);

  const [visibleCols, setVisibleCols] = useUserScopedState(
    `inventory-report:${storageKey}:columns`,
    defaultVisible,
  );
  const resolvedCols = useMemo(
    () => ({ ...defaultVisible, ...visibleCols }),
    [defaultVisible, visibleCols],
  );

  const columnDefs = useMemo<ColDef<T>[]>(
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
      ...columns.map((col) => ({
        ...col,
        hide: resolvedCols[col.colId] === false,
      })),
    ],
    [columns, resolvedCols],
  );

  return (
    <AgainListGrid<T>
      rowData={rows}
      columnDefs={columnDefs}
      loading={loading}
      filterBar={toolbar}
      summary={
        summary ? <div className="border-b border-border px-3 py-2">{summary}</div> : undefined
      }
      emptyTitle={emptyTitle}
      emptyHint={emptyHint}
      onOpenColumns={() => setColumnSheetOpen(true)}
      apiRef={gridApiRef}
      onRowClicked={onRowClicked ? (row) => onRowClicked(row) : undefined}
      gridClassName={onRowClicked ? "[&_.ag-row]:cursor-pointer" : undefined}
      serverPaging={serverPaging}
      mobile={
        rows.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium">{emptyTitle}</p>
            {emptyHint ? <p className="mt-1 text-xs text-muted-foreground">{emptyHint}</p> : null}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {rows.slice(0, 50).map((row) => {
              const line = mobileLine?.(row) ?? {
                title: String((row as { name?: string }).name ?? (row as { sku?: string }).sku ?? row.id),
                meta: String((row as { sku?: string }).sku ?? ""),
                value: "",
              };
              return (
                <div key={row.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{line.title}</p>
                    {line.meta ? (
                      <p className="truncate font-mono text-[11px] text-muted-foreground">{line.meta}</p>
                    ) : null}
                  </div>
                  {line.value ? (
                    <p className="shrink-0 text-sm tabular-nums text-foreground">{line.value}</p>
                  ) : null}
                </div>
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
              <label
                key={col.colId}
                className="flex cursor-pointer items-center gap-2 text-xs text-foreground"
              >
                <input
                  type="checkbox"
                  checked={resolvedCols[col.colId] !== false}
                  onChange={(e) =>
                    setVisibleCols({ ...resolvedCols, [col.colId]: e.target.checked })
                  }
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
