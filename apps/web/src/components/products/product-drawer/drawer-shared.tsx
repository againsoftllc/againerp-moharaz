"use client";

import type { ReactNode } from "react";
import { DateRangePresetPicker } from "@/components/shared/date-range-preset-picker";
import { cn } from "@/lib/utils";

/** Grid fills the notebook body (same recipe as the partner drawer panels). */
export const HISTORY_GRID_CLASS = "flex min-h-0 flex-1 flex-col";
export const HISTORY_GRID_CANVAS_CLASS =
  "[&_.ag-root-wrapper]:flex [&_.ag-root-wrapper]:flex-col [&_.ag-root-wrapper-body]:min-h-0 [&_.ag-root-wrapper-body]:flex-1";

export type DateRange = { dateFrom: string; dateTo: string };
export const EMPTY_DATE_RANGE: DateRange = { dateFrom: "", dateTo: "" };

export function DateRangeFilter({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (next: DateRange) => void;
}) {
  return <DateRangePresetPicker value={value} onChange={onChange} buttonClassName="h-7" />;
}

/** One smart-stat box: the figure on top, what it is underneath (the product header's look). `tone` colours the figure. */
export function StatBox({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="min-w-[8rem] flex-1 border border-border/80 bg-background px-3 py-1.5" title={hint}>
      <p
        className={cn(
          "text-[15px] font-semibold leading-tight tabular-nums text-foreground",
          tone === "good" && "text-emerald-600 dark:text-emerald-400",
          tone === "bad" && "text-red-600 dark:text-red-400",
        )}
      >
        {value}
      </p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

/** A titled group of stat boxes (same small uppercase title with a rule as the fact lists). */
export function StatSection({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 flex items-baseline justify-between gap-3 border-b border-border/80 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>{title}</span>
        {note ? <span className="font-normal normal-case tracking-normal">{note}</span> : null}
      </h3>
      <div className="flex flex-wrap items-stretch gap-2">{children}</div>
    </section>
  );
}

/** One-line totals strip above a history grid (Total sold qty · Total sales). */
export function SummaryLine({
  items,
  testId,
}: {
  items: { label: string; value: ReactNode }[];
  testId?: string;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-3 py-1 text-[11px] text-muted-foreground"
      data-testid={testId}
    >
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span>{item.label}</span>
          <span className="font-semibold tabular-nums text-foreground">{item.value}</span>
        </span>
      ))}
    </div>
  );
}

export function PanelMessage({
  title,
  hint,
  tone = "muted",
}: {
  title: string;
  hint?: string;
  tone?: "muted" | "error";
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
      <p className={cn("text-sm font-medium", tone === "error" && "text-destructive")}>{title}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * Overview / Stock read-only field pairs, laid out like an Odoo form group: a small uppercase group title with a rule under
 * it, then label / value rows (label column left, value beside it, one quiet divider per row). Same type scale as the Again
 * form sheet (13 px, label medium, value regular) so a record reads the same whether it is open or being edited.
 */
export function FactList({
  title,
  facts,
  testId,
}: {
  title: string;
  facts: { label: string; value: ReactNode; numeric?: boolean }[];
  testId?: string;
}) {
  return (
    <section data-testid={testId}>
      <h3 className="mb-1 border-b border-border/80 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <dl>
        {facts.map((fact) => (
          <div
            key={fact.label}
            data-fact={fact.label}
            className="grid grid-cols-[minmax(6.5rem,9rem)_minmax(0,1fr)] items-baseline gap-x-3 border-b border-border/40 py-[5px] text-[13px] leading-[1.35] last:border-b-0"
          >
            <dt className="font-medium text-foreground">{fact.label}</dt>
            <dd className={cn("min-w-0 break-words text-foreground", fact.numeric && "tabular-nums")}>{fact.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
