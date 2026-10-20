"use client";

import { useCallback, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export const LINE_DATA_COLS = [
  "variant",
  "product",
  "leadTime",
  "quantity",
  "unitPrice",
  "discount",
  "taxes",
  "taxIncl",
  "amount",
] as const;

export type LineDataCol = (typeof LINE_DATA_COLS)[number];

export const LINE_DATA_COL_LABELS: Record<LineDataCol, string> = {
  variant: "Product Variant",
  product: "Product",
  leadTime: "Lead Time",
  quantity: "Quantity",
  unitPrice: "Unit Price",
  discount: "Disc",
  taxes: "Taxes",
  taxIncl: "Tax Incl.",
  amount: "Amount",
};

const DEFAULT_ORDER: LineDataCol[] = [
  "product",
  "quantity",
  "unitPrice",
  "discount",
  "amount",
  "variant",
  "leadTime",
  "taxes",
  "taxIncl",
];

// Each column opens as wide as its content needs and no wider; the Product column has no fixed width - it takes whatever is
// left (see the colgroup in the order drawer), so the number columns stay together instead of being spread across the table.
const DEFAULT_WIDTHS: Record<LineDataCol, number> = {
  variant: 130,
  product: 300, // only the minimum counts (MIN_WIDTHS): the column itself is flexible
  leadTime: 90,
  quantity: 84,
  unitPrice: 96,
  discount: 90,
  taxes: 84,
  taxIncl: 100,
  amount: 108,
};

const MIN_WIDTHS: Record<LineDataCol, number> = {
  variant: 80,
  product: 160,
  leadTime: 72,
  quantity: 64,
  unitPrice: 52,
  discount: 56,
  taxes: 72,
  taxIncl: 88,
  amount: 52,
};

/** The fixed right column of the lines table - the columns menu in the header, the delete button in every row. It is as narrow as
 * its button (width below), stays in view when the table scrolls sideways, and never sits on top of a data column. */
export const LINE_ACTION_COL_WIDTH = 24;

export const LINE_TABLE_ACTION_COL_CLASS = "sticky right-0 z-10 w-6 min-w-6 max-w-6 bg-transparent p-0 text-center align-middle";

export const LINE_TABLE_ACTION_HEAD_CLASS = cn(LINE_TABLE_ACTION_COL_CLASS, "z-20");

export type LineColumnVisibility = {
  variant: boolean;
  product: boolean;
  quantity: boolean;
  unitPrice: boolean;
  discount: boolean;
  amount: boolean;
  leadTime: boolean;
  taxes: boolean;
  taxIncl: boolean;
};

function isColVisible(col: LineDataCol, visibility: LineColumnVisibility): boolean {
  if (col === "product") return visibility.product;
  if (col === "variant") return visibility.variant;
  if (col === "quantity") return visibility.quantity;
  if (col === "unitPrice") return visibility.unitPrice;
  if (col === "discount") return visibility.discount;
  if (col === "amount") return visibility.amount;
  if (col === "leadTime") return visibility.leadTime;
  if (col === "taxes") return visibility.taxes;
  if (col === "taxIncl") return visibility.taxIncl;
  return true;
}

export function useLineTableLayout(visibility: LineColumnVisibility) {
  const [order, setOrder] = useState<LineDataCol[]>(DEFAULT_ORDER);
  const [widths, setWidths] = useState(DEFAULT_WIDTHS);
  const [dragCol, setDragCol] = useState<LineDataCol | null>(null);

  const visibleCols = useMemo(
    () => order.filter((col) => isColVisible(col, visibility)),
    [order, visibility],
  );

  const moveColumn = useCallback((from: LineDataCol, to: LineDataCol) => {
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

  const startResize = useCallback((col: LineDataCol, startX: number) => {
    const startWidth = widths[col];
    const onMove = (e: MouseEvent) => {
      const delta = e.clientX - startX;
      setWidths((w) => ({
        ...w,
        [col]: Math.max(MIN_WIDTHS[col], startWidth + delta),
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
  }, [widths]);

  return {
    visibleCols,
    widths,
    dragCol,
    setDragCol,
    moveColumn,
    startResize,
  };
}

type LineTableHeaderCellProps = {
  col: LineDataCol;
  width: number;
  align?: "left" | "right";
  readOnly?: boolean;
  dragCol: LineDataCol | null;
  onDragColChange: (col: LineDataCol | null) => void;
  onMoveColumn: (from: LineDataCol, to: LineDataCol) => void;
  onResizeStart: (col: LineDataCol, clientX: number) => void;
};

export function LineTableHeaderCell({
  col,
  width,
  align = "left",
  readOnly,
  dragCol,
  onDragColChange,
  onMoveColumn,
  onResizeStart,
}: LineTableHeaderCellProps) {
  const label = LINE_DATA_COL_LABELS[col];

  return (
    <th
      style={col === "product" ? { minWidth: MIN_WIDTHS.product } : { width, minWidth: width, maxWidth: width }}
      className={cn(
        "relative py-2 pr-3 text-[11px] font-semibold text-foreground",
        align === "right" && "text-right",
        !readOnly && "group/col",
      )}
      draggable={!readOnly}
      onDragStart={(e) => {
        if (readOnly) return;
        onDragColChange(col);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={() => onDragColChange(null)}
      onDragOver={(e) => {
        if (readOnly || !dragCol || dragCol === col) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDrop={(e) => {
        if (readOnly || !dragCol || dragCol === col) return;
        e.preventDefault();
        onMoveColumn(dragCol, col);
        onDragColChange(null);
      }}
    >
      <span
        className={cn(
          "block truncate",
          !readOnly && "cursor-grab active:cursor-grabbing",
          dragCol === col && "opacity-60",
        )}
        title={!readOnly ? "Drag to reorder column" : undefined}
      >
        {label}
      </span>
      {!readOnly && col !== "product" ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize ${label} column`}
          className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize opacity-0 transition-opacity group-hover/col:opacity-100 hover:bg-[#00a09d]/60"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onResizeStart(col, e.clientX);
          }}
        />
      ) : null}
    </th>
  );
}
