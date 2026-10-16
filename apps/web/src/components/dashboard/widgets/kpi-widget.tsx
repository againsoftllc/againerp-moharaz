"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { KpiData } from "@/lib/dashboard/types";

type Props = {
  items: KpiData[];
  compact?: boolean;
  className?: string;
};

/** DS-CARD-KPI — metric · delta · optional drill-down. */
export function KpiWidget({ items, compact, className }: Props) {
  return (
    <div
      data-component="DS-CARD-KPI"
      className={cn(
        compact ? "space-y-2" : "grid gap-2 sm:grid-cols-2 xl:grid-cols-4",
        className,
      )}
    >
      {items.map((kpi) => {
        const inner = (
          <>
            <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
            <p className={cn("font-semibold", compact ? "text-base" : "mt-0.5 text-xl")}>{kpi.value}</p>
            <p
              className={cn(
                "text-xs",
                kpi.up === true && "text-emerald-600 dark:text-emerald-400",
                kpi.up === false && "text-red-500 dark:text-red-400",
                kpi.up === undefined && "text-muted-foreground",
              )}
            >
              {kpi.change}
            </p>
          </>
        );

        const cardClass =
          "rounded-md border bg-background/60 p-2.5 transition-colors hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

        if (kpi.href) {
          return (
            <Link key={kpi.id} href={kpi.href} className={cardClass}>
              {inner}
            </Link>
          );
        }

        return (
          <div key={kpi.id} className={cardClass}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
