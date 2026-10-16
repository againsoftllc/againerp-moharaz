"use client";

/* Shared pieces of the module landing dashboards (Website, Inventory): the period picker (Today … All time),
   KPI cards with the change against the period before, and titled panels. */

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export const PERIODS = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "month", label: "This month" },
  { id: "year", label: "This year" },
  { id: "all", label: "All time" },
] as const;
export type PeriodId = (typeof PERIODS)[number]["id"];

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** the period's first and last day (local dates, both inclusive); "all" has no start */
export function periodRange(id: PeriodId): { from?: string; to?: string; compare: string } {
  const today = new Date();
  const day = (offset: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    return d;
  };
  switch (id) {
    case "today":
      return { from: iso(today), to: iso(today), compare: "vs yesterday" };
    case "yesterday":
      return { from: iso(day(-1)), to: iso(day(-1)), compare: "vs the day before" };
    case "7d":
      return { from: iso(day(-6)), to: iso(today), compare: "vs previous 7 days" };
    case "30d":
      return { from: iso(day(-29)), to: iso(today), compare: "vs previous 30 days" };
    case "month":
      return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: iso(today), compare: "vs same days before" };
    case "year":
      return { from: iso(new Date(today.getFullYear(), 0, 1)), to: iso(today), compare: "vs same days before" };
    default:
      return { to: iso(today), compare: "" };
  }
}

export const periodLabel = (id: PeriodId) => PERIODS.find((p) => p.id === id)?.label ?? "";

/** Title, the period's dates, the period tabs and a refresh button. */
export function DashboardHeader({
  title,
  period,
  onPeriod,
  onRefresh,
  loading,
}: {
  title: string;
  period: PeriodId;
  onPeriod: (p: PeriodId) => void;
  onRefresh: () => void;
  loading?: boolean;
}) {
  const range = periodRange(period);
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="page-title">{title}</h1>
        <p className="page-subtitle">
          {periodLabel(period)}
          {range.from ? ` · ${range.from === range.to ? range.from : `${range.from} → ${range.to}`}` : " · since the start"}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Period" className="flex flex-wrap rounded-lg border bg-muted/40 p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={period === p.id}
              onClick={() => onPeriod(p.id)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition",
                period === p.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background text-muted-foreground hover:text-foreground"
          aria-label="Refresh"
          title="Refresh"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </button>
      </div>
    </div>
  );
}

/** "↑ 12% vs previous 30 days" — green when it went the good way (`invert`: fewer is better). */
export function Change({ now, before, label, invert = false }: { now: number; before?: number | null; label: string; invert?: boolean }) {
  if (before == null || !label) return <span className="text-muted-foreground">{label || " "}</span>;
  if (before === 0 && now === 0) return <span className="text-muted-foreground">No change {label}</span>;
  if (before === 0) return <span className="text-emerald-600 dark:text-emerald-400">New {label}</span>;
  const pct = ((now - before) / before) * 100;
  const flat = Math.abs(pct) < 0.5;
  const good = invert ? pct < 0 : pct > 0;
  const Icon = flat ? Minus : pct > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5",
        flat ? "text-muted-foreground" : good ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
      )}
      title={`Before: ${before.toLocaleString("en-US")}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {flat ? "0%" : `${Math.abs(pct).toFixed(pct > -10 && pct < 10 ? 1 : 0)}%`} <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

export function Kpi({
  icon,
  label,
  value,
  foot,
  href,
  tone = "default",
  loading,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  foot?: ReactNode;
  href?: string;
  tone?: "default" | "good" | "warn" | "bad";
  loading?: boolean;
}) {
  const body = (
    <div
      className={cn(
        "group flex h-full min-w-0 flex-col gap-1 rounded-lg border bg-card p-3 shadow-sm transition",
        href && "hover:border-primary/40 hover:shadow",
      )}
    >
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span
          className={cn(
            "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
            tone === "good" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
            tone === "warn" && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
            tone === "bad" && "bg-red-500/10 text-red-600 dark:text-red-400",
            tone === "default" && "bg-[#00a09d]/10 text-[#00a09d]",
          )}
        >
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </div>
      {loading ? (
        <span className="fb-shimmer mt-1 h-7 w-24 rounded" />
      ) : (
        <span className="truncate text-2xl font-semibold tabular-nums tracking-tight" title={value}>
          {value}
        </span>
      )}
      <span className="min-h-[18px] truncate text-xs">{loading ? " " : foot}</span>
    </div>
  );
  return href ? (
    <Link href={href} className="block min-w-0 focus-visible:outline-none">
      {body}
    </Link>
  ) : (
    body
  );
}

export function Panel({ title, action, className, children }: { title: string; action?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={cn("flex min-h-0 flex-col rounded-lg border bg-card shadow-sm", className)}>
      <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </header>
      <div className="min-h-0 flex-1 p-3">{children}</div>
    </section>
  );
}

/** 2.35 Cr / 1.2 L / 45k — chart axes */
export const compact = (n: number) =>
  n >= 10_000_000 ? `${(n / 10_000_000).toFixed(2)} Cr` : n >= 100_000 ? `${(n / 100_000).toFixed(1)} L` : n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(Math.round(n));

/** A coloured bar per row with its count and share — "orders by status", "products by availability". */
export function ShareBars({ rows, empty }: { rows: { key: string; label: string; color: string; n: number }[]; empty: string }) {
  const total = rows.reduce((s, r) => s + r.n, 0);
  if (!total) return <p className="py-10 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-3">
      {rows.map(({ key, label, color, n }) => {
        const pct = (n / total) * 100;
        return (
          <li key={key}>
            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <i className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
                {label}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {n.toLocaleString("en-US")} · {pct.toFixed(pct < 10 ? 1 : 0)}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 1.5)}%`, background: color }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
