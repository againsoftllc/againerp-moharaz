"use client";

import type { ReactNode } from "react";
import { Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { DateRangePresetPicker } from "@/components/shared/date-range-preset-picker";
import { cn, formatCurrency } from "@/lib/utils";
import { fiscalYearStartIso, zonedTodayIso } from "@/lib/localisation/company-format";
import { getCompanyFormat } from "@/lib/store/company-format-store";

export function money(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? formatCurrency(n) : formatCurrency(0);
}

export function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const escape = (cell: string | number) => {
    const s = String(cell ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const body = [headers.map(escape).join(","), ...rows.map((row) => row.map(escape).join(","))].join("\n");
  const blob = new Blob([body], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function yearStartIso() {
  return fiscalYearStartIso(getCompanyFormat());
}

export function todayIso() {
  return zonedTodayIso(getCompanyFormat());
}

export function FinanceReportShell({
  title,
  dateFrom,
  dateTo,
  onDateFrom,
  onDateTo,
  onRefresh,
  onExport,
  loading,
  integrityWarning,
  extraFilters,
  summary,
  children,
}: {
  title: string;
  dateFrom: string;
  dateTo: string;
  onDateFrom: (value: string) => void;
  onDateTo: (value: string) => void;
  onRefresh: () => void;
  onExport?: () => void;
  loading?: boolean;
  integrityWarning?: string | null;
  extraFilters?: ReactNode;
  summary?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-1.5 border-b border-border py-1 pl-2 pr-2">
        <ListGridHeaderStart title={title} />
        <DateRangePresetPicker
          value={{ dateFrom, dateTo }}
          onChange={(next) => {
            onDateFrom(next.dateFrom);
            onDateTo(next.dateTo);
          }}
          buttonClassName="h-7"
          clearable={false}
        />
        {extraFilters}
        <Button variant="outline" size="sm" className="h-7 rounded-none" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
        {onExport ? (
          <Button variant="outline" size="sm" className="h-7 rounded-none" onClick={onExport} disabled={loading}>
            <Download className="mr-1 h-3.5 w-3.5" />
            CSV
          </Button>
        ) : null}
      </div>
      {integrityWarning ? (
        <div className="border-b border-border bg-muted/40 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-400">
          Accounting integrity: {integrityWarning}
        </div>
      ) : null}
      {summary ? <div className="shrink-0 border-b border-border px-3 py-2">{summary}</div> : null}
      <div className="min-h-0 flex-1 overflow-y-auto bg-background px-3 py-3">{children}</div>
    </div>
  );
}

export function ReportTable({
  columns,
  children,
  footer,
}: {
  columns: string[];
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border border-border bg-background">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead className="sticky top-0 z-[1] border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
            <tr>
              {columns.map((col) => (
                <th key={col} className="px-3 py-2 font-medium">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
          {footer}
        </table>
      </div>
    </div>
  );
}
