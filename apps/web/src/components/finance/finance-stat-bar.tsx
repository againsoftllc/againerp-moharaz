"use client";

import { cn } from "@/lib/utils";

export type FinanceStat = { label: string; value: string; tone?: "default" | "warn" | "danger" | "good" };

const TONE: Record<NonNullable<FinanceStat["tone"]>, string> = {
  default: "",
  good: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  danger: "text-red-600 dark:text-red-400",
};

const COLS: Record<number, string> = {
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
};

/** Compact KPI strip above the expense grid — mirrors the SEO/RMA dashboard row. */
export function FinanceStatBar({ stats }: { stats: FinanceStat[] }) {
  return (
    <div className={cn("grid shrink-0 grid-cols-2 border-b border-border", COLS[stats.length] ?? "sm:grid-cols-4")}>
      {stats.map((stat) => (
        <div key={stat.label} className="border-r border-border px-3 py-1.5 last:border-r-0">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{stat.label}</p>
          <p className={cn("mt-0.5 text-sm font-semibold tabular-nums", TONE[stat.tone ?? "default"])}>{stat.value}</p>
        </div>
      ))}
    </div>
  );
}
