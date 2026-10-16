"use client";

import { Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GRID_CHIP_CLASS } from "@/components/shared/grid-chip-badge";
import { cn, formatCurrency } from "@/lib/utils";
import type { StockItem, StockStatus } from "@/lib/mock-data/inventory";

const STATUS_LABEL: Record<StockStatus, string> = {
  in_stock: "In Stock",
  low_stock: "Low Stock",
  out_of_stock: "Out of Stock",
  overstock: "Overstock",
};

const STATUS_TONE: Record<StockStatus, string> = {
  in_stock: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  low_stock: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  out_of_stock: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  overstock: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
};

export function StockMobileCards({
  items,
}: {
  items: StockItem[];
}) {
  if (items.length === 0) {
    return (
      <p className="px-3 py-8 text-center text-sm text-muted-foreground">
        No stock lines match your filters
      </p>
    );
  }

  return (
    <div className="divide-y divide-border">
      {items.map((item) => (
        <div key={item.id} className="flex gap-3 px-3 py-2.5">
          {item.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.thumbnail} alt="" className="h-9 w-9 shrink-0 object-cover" loading="lazy" />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-muted">
              <Package className="h-4 w-4 text-muted-foreground" aria-hidden />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.name}</p>
                <p className="truncate font-mono text-[11px] text-muted-foreground">{item.sku}</p>
              </div>
              <Badge
                variant="outline"
                className={cn("shrink-0", GRID_CHIP_CLASS, STATUS_TONE[item.status])}
              >
                {STATUS_LABEL[item.status]}
              </Badge>
            </div>

            <dl className="mt-1.5 grid grid-cols-3 gap-x-2 gap-y-0.5 text-[11px]">
              <div>
                <dt className="text-muted-foreground">On hand</dt>
                <dd className="font-medium tabular-nums">{item.onHand}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Available</dt>
                <dd className="tabular-nums">{item.available}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Unit cost</dt>
                <dd className="tabular-nums">{formatCurrency(item.unitCost)}</dd>
              </div>
            </dl>

            <p className="mt-1 truncate text-[11px] text-muted-foreground">{item.warehouse}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
