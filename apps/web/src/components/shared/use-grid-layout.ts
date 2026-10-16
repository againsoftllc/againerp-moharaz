"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ColDef,
  ColumnMovedEvent,
  ColumnResizedEvent,
  ColumnState,
  GridApi,
  GridReadyEvent,
} from "ag-grid-community";
import { useUserScopedState } from "@/lib/hooks/use-user-scoped-state";

type SavedColumn = { colId: string; width?: number };

/** Columns saved earlier but not in the grid right now keep their place. */
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

/**
 * Column order + widths for a plain <AgGridReact> grid, saved per admin on the server (same
 * behaviour as AgainListGrid): restored before the grid shows, kept when columnDefs update,
 * saved only on the admin's own drag / resize.
 *
 *   const layout = useGridLayout("marketing-coupons", columnDefs);
 *   <div style={layout.containerStyle}><AgGridReact columnDefs={layout.columnDefs} {...layout.gridProps} /></div>
 */
export function useGridLayout<T>(key: string, columnDefs: ColDef<T>[]) {
  const [saved, setSaved, loaded] = useUserScopedState<SavedColumn[]>(`grid-layout:${key}`, [], { sync: true });
  const apiRef = useRef<GridApi<T> | null>(null);
  const [ready, setReady] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const widths = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of saved) if (typeof c.width === "number") map.set(c.colId, c.width);
    return map;
  }, [saved]);

  const resolvedColumnDefs = useMemo(
    () =>
      widths.size === 0
        ? columnDefs
        : columnDefs.map((col) => {
            const id = col.colId ?? (typeof col.field === "string" ? col.field : undefined);
            const width = id ? widths.get(id) : undefined;
            return width === undefined ? col : { ...col, width, flex: undefined };
          }),
    [columnDefs, widths],
  );

  const apply = useCallback(
    (api: GridApi<T>) => {
      if (saved.length === 0) return;
      api.setGridOption("suppressColumnMoveAnimation", true);
      api.applyColumnState({
        state: saved.map((c) => (typeof c.width === "number" ? { ...c, flex: null } : c)),
        applyOrder: true,
      });
      requestAnimationFrame(() => api.setGridOption("suppressColumnMoveAnimation", false));
    },
    [saved],
  );

  const save = useCallback(
    (api: GridApi<T>) => {
      const current: SavedColumn[] = api
        .getColumnState()
        .map((c: ColumnState) => ({ colId: c.colId, width: c.width ?? undefined }));
      setSaved((prev) => mergeLayout(prev, current));
    },
    [setSaved],
  );

  useEffect(() => {
    if (ready && apiRef.current) apply(apiRef.current);
  }, [apply, ready]);

  useEffect(() => {
    if (revealed || !loaded || !ready) return;
    if (apiRef.current) apply(apiRef.current);
    const frame = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(frame);
  }, [revealed, loaded, ready, apply]);

  useEffect(() => {
    const handle = window.setTimeout(() => setRevealed(true), 2500);
    return () => window.clearTimeout(handle);
  }, []);

  return {
    columnDefs: resolvedColumnDefs,
    /** Spread onto the grid's wrapper: hidden until the saved layout is applied. */
    containerStyle: revealed ? undefined : ({ visibility: "hidden" } as const),
    gridProps: {
      maintainColumnOrder: true,
      onGridReady: (e: GridReadyEvent<T>) => {
        apiRef.current = e.api;
        setReady(true);
      },
      onColumnMoved: (e: ColumnMovedEvent<T>) => {
        if (e.finished && (e.source === "uiColumnMoved" || e.source === "uiColumnDragged")) save(e.api);
      },
      onColumnResized: (e: ColumnResizedEvent<T>) => {
        if (e.finished && e.source === "uiColumnResized") save(e.api);
      },
    },
  };
}
