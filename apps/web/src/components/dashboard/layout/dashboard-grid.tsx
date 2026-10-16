"use client";

import { cn } from "@/lib/utils";
import type { WidgetSlotConfig } from "@/lib/dashboard/types";

const ROW_HEIGHT = 80;

type Props = {
  slots: WidgetSlotConfig[];
  editMode?: boolean;
  hiddenSlotIds?: Set<string>;
  renderSlot: (slot: WidgetSlotConfig) => React.ReactNode;
  className?: string;
};

function spanClass(colSpan: number, rowSpan: number) {
  const colMap: Record<number, string> = {
    1: "lg:col-span-1",
    2: "lg:col-span-2",
    3: "lg:col-span-3",
    4: "lg:col-span-4",
    5: "lg:col-span-5",
    6: "lg:col-span-6",
    7: "lg:col-span-7",
    8: "lg:col-span-8",
    9: "lg:col-span-9",
    10: "lg:col-span-10",
    11: "lg:col-span-11",
    12: "lg:col-span-12",
  };
  const rowMap: Record<number, string> = {
    1: "row-span-1",
    2: "row-span-2",
    3: "row-span-3",
    4: "row-span-4",
    5: "row-span-5",
    6: "row-span-6",
  };
  return cn("col-span-12 md:col-span-6", colMap[colSpan] ?? "lg:col-span-12", rowMap[rowSpan] ?? "row-span-1");
}

/** 12-col desktop · 6-col tablet · 1-col mobile · 80px row units. */
export function DashboardGrid({ slots, editMode, hiddenSlotIds, renderSlot, className }: Props) {
  const visible = slots.filter((s) => !hiddenSlotIds?.has(s.id));

  return (
    <div
      data-layout="LAYOUT-DASHBOARD-GRID"
      className={cn(
        "grid grid-cols-1 gap-4 md:grid-cols-6 lg:grid-cols-12",
        className,
      )}
      style={{ gridAutoRows: `${ROW_HEIGHT}px` }}
    >
      {visible.map((slot) => (
        <div
          key={slot.id}
          className={cn(
            "relative min-h-0",
            spanClass(slot.colSpan, slot.rowSpan),
            slot.mobileSupport === "none" && "hidden lg:block",
            editMode && "rounded-lg border-2 border-dashed border-primary/40 bg-primary/5",
          )}
          style={{ order: slot.mobileOrder }}
        >
          {editMode ? (
            <span className="pointer-events-none absolute left-2 top-1 z-10 rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
              {slot.colSpan}×{slot.rowSpan} · drag/resize placeholder
            </span>
          ) : null}
          <div className="h-full min-h-0">{renderSlot(slot)}</div>
        </div>
      ))}
    </div>
  );
}
