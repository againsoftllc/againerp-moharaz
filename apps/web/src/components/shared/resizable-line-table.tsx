"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";

export function useResizableLineColumns<K extends string>(config: {
  cols: readonly K[];
  defaultWidths: Record<K, number>;
  minWidths: Record<K, number>;
}) {
  const [order, setOrder] = useState<K[]>(() => [...config.cols]);
  const [widths, setWidths] = useState(config.defaultWidths);
  const [dragCol, setDragCol] = useState<K | null>(null);
  const minWidths = config.minWidths;

  const moveColumn = useCallback((from: K, to: K) => {
    if (from === to) return;
    setOrder((prev) => {
      const next = [...prev];
      const fromIdx = next.indexOf(from);
      const toIdx = next.indexOf(to);
      if (fromIdx < 0 || toIdx < 0) return prev;
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, from);
      return next;
    });
  }, []);

  const startResize = useCallback(
    (col: K, startX: number) => {
      const startWidth = widths[col];
      const onMove = (event: MouseEvent) => {
        const delta = event.clientX - startX;
        setWidths((current) => ({
          ...current,
          [col]: Math.max(minWidths[col], startWidth + delta),
        }));
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [minWidths, widths],
  );

  return { order, widths, dragCol, setDragCol, moveColumn, startResize };
}

export function ResizableLineHeaderCell<K extends string>({
  col,
  label,
  width,
  alignRight,
  dragCol,
  onDragColChange,
  onMoveColumn,
  onResizeStart,
}: {
  col: K;
  label: string;
  width: number;
  alignRight?: boolean;
  dragCol: K | null;
  onDragColChange: (col: K | null) => void;
  onMoveColumn: (from: K, to: K) => void;
  onResizeStart: (col: K, clientX: number) => void;
}) {
  return (
    <th
      style={{ width, minWidth: width, maxWidth: width }}
      className={cn(
        "group/col relative overflow-hidden py-2 pr-2.5 font-medium",
        alignRight && "text-right",
      )}
      draggable
      onDragStart={(event) => {
        onDragColChange(col);
        event.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={() => onDragColChange(null)}
      onDragOver={(event) => {
        if (!dragCol || dragCol === col) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        if (!dragCol || dragCol === col) return;
        event.preventDefault();
        onMoveColumn(dragCol, col);
        onDragColChange(null);
      }}
    >
      <span
        className={cn(
          "block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap",
          "cursor-grab active:cursor-grabbing",
          dragCol === col && "opacity-60",
        )}
        title={label}
      >
        {label}
      </span>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${label} column`}
        className="absolute inset-y-0 right-0 z-20 w-2.5 cursor-col-resize group/resize"
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onResizeStart(col, event.clientX);
        }}
        onDragStart={(event) => event.preventDefault()}
      >
        <span
          className="pointer-events-none absolute inset-y-1 right-[4px] w-px bg-transparent group-hover/col:bg-border group-hover/resize:bg-[#00a09d]"
          aria-hidden
        />
      </div>
    </th>
  );
}
