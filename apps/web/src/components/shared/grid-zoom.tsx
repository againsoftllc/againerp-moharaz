"use client";

import { useCallback, useEffect, useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "again-list-grid-zoom";
export const GRID_ZOOM_MIN = 85;
export const GRID_ZOOM_MAX = 140;
export const GRID_ZOOM_DEFAULT = 100;

function clampZoom(value: number) {
  return Math.min(GRID_ZOOM_MAX, Math.max(GRID_ZOOM_MIN, Math.round(value)));
}

function readStoredZoom(): number {
  if (typeof window === "undefined") return GRID_ZOOM_DEFAULT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return GRID_ZOOM_DEFAULT;
    const n = Number(raw);
    if (!Number.isFinite(n)) return GRID_ZOOM_DEFAULT;
    return clampZoom(n);
  } catch {
    return GRID_ZOOM_DEFAULT;
  }
}

export function useGridZoom() {
  const [zoom, setZoomState] = useState(GRID_ZOOM_DEFAULT);

  useEffect(() => {
    setZoomState(readStoredZoom());
  }, []);

  const setZoom = useCallback((value: number) => {
    const next = clampZoom(value);
    setZoomState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      /* ignore */
    }
  }, []);

  const scale = zoom / 100;
  const fontSize = Math.round(11 * scale);
  const rowHeight = Math.round(28 * scale);
  const headerHeight = Math.round(24 * scale);

  return {
    zoom,
    setZoom,
    scale,
    fontSize,
    rowHeight,
    headerHeight,
    zoomStyle: {
      "--ag-list-zoom": String(scale),
      "--ag-font-size": `${fontSize}px`,
      "--ag-row-height": `${rowHeight}px`,
      "--ag-header-height": `${headerHeight}px`,
    } as React.CSSProperties,
  };
}

type ControlProps = {
  zoom: number;
  onChange: (zoom: number) => void;
  className?: string;
};

/** Compact zoom range for list grid footer (paging bar). */
export function GridZoomControl({ zoom, onChange, className }: ControlProps) {
  return (
    <div
      className={cn(
        "pointer-events-auto flex h-full items-center gap-1 pl-2 pr-1.5",
        className,
      )}
      title="Table text size"
    >
      <button
        type="button"
        aria-label="Zoom out"
        className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-none text-muted-foreground hover:text-foreground disabled:opacity-40"
        onClick={() => onChange(zoom - 5)}
        disabled={zoom <= GRID_ZOOM_MIN}
      >
        <ZoomOut className="h-2.5 w-2.5" aria-hidden />
      </button>
      <input
        type="range"
        min={GRID_ZOOM_MIN}
        max={GRID_ZOOM_MAX}
        step={5}
        value={zoom}
        aria-label="Table zoom"
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-[2px] w-14 cursor-pointer appearance-none rounded-none bg-border [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-none [&::-webkit-slider-thumb]:bg-muted-foreground [&::-webkit-slider-thumb]:hover:bg-foreground"
      />
      <button
        type="button"
        aria-label="Zoom in"
        className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-none text-muted-foreground hover:text-foreground disabled:opacity-40"
        onClick={() => onChange(zoom + 5)}
        disabled={zoom >= GRID_ZOOM_MAX}
      >
        <ZoomIn className="h-2.5 w-2.5" aria-hidden />
      </button>
      <span className="min-w-[2rem] text-[10px] tabular-nums text-muted-foreground">{zoom}%</span>
    </div>
  );
}
