"use client";

import type { ReactNode } from "react";
import { Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { DateRangePresetPicker } from "@/components/shared/date-range-preset-picker";
import { downloadCsv, money } from "@/components/finance/finance-report-shell";
import { cn, formatCurrency, formatQuantity } from "@/lib/utils";

export { downloadCsv, money };

export const NUMERIC_CELL = "ag-right-aligned-cell tabular-nums";

export function qty(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? formatQuantity(n) : "0";
}

export function taka(value: unknown) {
  return formatCurrency(Number(value) || 0);
}

export function InventoryReportToolbar({
  title,
  dateFrom,
  dateTo,
  onDateFrom,
  onDateTo,
  showDates,
  onRefresh,
  onExport,
  loading,
  extraFilters,
}: {
  title: string;
  dateFrom?: string;
  dateTo?: string;
  onDateFrom?: (value: string) => void;
  onDateTo?: (value: string) => void;
  showDates?: boolean;
  onRefresh: () => void;
  onExport?: () => void;
  loading?: boolean;
  extraFilters?: ReactNode;
}) {
  return (
    <>
      <ListGridHeaderStart title={title} />
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {showDates && onDateFrom && onDateTo ? (
          <DateRangePresetPicker
            value={{ dateFrom: dateFrom ?? "", dateTo: dateTo ?? "" }}
            onChange={(next) => {
              onDateFrom(next.dateFrom);
              onDateTo(next.dateTo);
            }}
            clearable={false}
          />
        ) : null}
        {extraFilters}
      </div>
      <Button
        variant="outline"
        size="icon"
        className="h-[26px] w-[26px] shrink-0 rounded-none"
        onClick={onRefresh}
        disabled={loading}
        aria-label="Refresh"
        title="Refresh"
      >
        <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
      </Button>
      {onExport ? (
        <Button
          variant="outline"
          size="sm"
          className="h-[26px] shrink-0 rounded-none"
          onClick={onExport}
          disabled={loading}
        >
          <Download className="mr-1 h-3.5 w-3.5" />
          CSV
        </Button>
      ) : null}
    </>
  );
}

export function ReportStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger" | "ok";
}) {
  return (
    <div className="border-r border-border px-3 py-1 last:border-r-0">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-sm font-semibold tabular-nums",
          tone === "danger" && "text-red-600 dark:text-red-400",
          tone === "ok" && "text-emerald-700 dark:text-emerald-400",
        )}
      >
        {value}
      </p>
    </div>
  );
}
