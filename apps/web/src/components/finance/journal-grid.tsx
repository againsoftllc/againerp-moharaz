"use client";

import { forwardRef, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ICellRendererParams } from "ag-grid-community";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterSelect } from "@/components/shared/filter-select";
import { GridChipBadge } from "@/components/shared/grid-chip-badge";
import {
  FinanceAgListGrid,
  NUMERIC_CELL,
  NUMERIC_HEADER,
  type FinanceAgListGridColumn,
  type FinanceAgListGridHandle,
  type FinanceFilterToggle,
} from "@/components/finance/finance-ag-list-grid";
import type { ApiFinanceJournalEntry, ApiFinanceSourceType } from "@/lib/api/finance";
import { formatCurrency } from "@/lib/utils";

export type JournalGridHandle = FinanceAgListGridHandle;

const FILTER_TOGGLES: FinanceFilterToggle[] = [
  { key: "search", label: "Search" },
  { key: "source", label: "Source" },
];

const STATUS_TONE: Record<string, string> = {
  posted: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  draft: "border-border text-foreground",
  void: "border-border bg-muted/40 text-muted-foreground",
};

function pretty(value: string | null | undefined) {
  if (!value) return "—";
  return value.replace(/_/g, " ");
}

function money(value: unknown) {
  const n = Number(value);
  return formatCurrency(Number.isFinite(n) ? n : 0);
}

function amount(row: ApiFinanceJournalEntry, side: "debit" | "credit") {
  return Number(side === "debit" ? row.debit_total : row.credit_total) || 0;
}

type Props = {
  rows: ApiFinanceJournalEntry[];
  sourceTypes: ApiFinanceSourceType[];
  initialSourceType?: string;
  loading?: boolean;
  onFilterCountChange?: (count: number) => void;
  headerLeftActions?: ReactNode;
  footerLeftActions?: ReactNode;
  onOpenEntry: (entry: ApiFinanceJournalEntry) => void;
};

export const JournalGrid = forwardRef<JournalGridHandle, Props>(function JournalGrid(
  {
    rows,
    sourceTypes,
    initialSourceType = "all",
    loading = false,
    onFilterCountChange,
    headerLeftActions,
    footerLeftActions,
    onOpenEntry,
  },
  ref,
) {
  const [search, setSearch] = useState("");
  const [sourceType, setSourceType] = useState(initialSourceType || "all");

  useEffect(() => {
    if (initialSourceType) setSourceType(initialSourceType);
  }, [initialSourceType]);

  const sourceOptions = useMemo(
    () => [{ value: "all", label: "All sources" }, ...sourceTypes.map((s) => ({ value: s.value, label: s.label }))],
    [sourceTypes],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (sourceType !== "all" && row.source_type !== sourceType) return false;
      if (!q) return true;
      return `${row.entry_number} ${row.description} ${row.source_type} ${row.status}`
        .toLowerCase()
        .includes(q);
    });
  }, [rows, search, sourceType]);

  const period = useMemo(() => {
    const debit = filtered.reduce((sum, row) => sum + amount(row, "debit"), 0);
    const credit = filtered.reduce((sum, row) => sum + amount(row, "credit"), 0);
    return { debit, credit, balanced: Math.abs(debit - credit) < 0.005 };
  }, [filtered]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (search.trim()) n += 1;
    if (sourceType !== "all") n += 1;
    return n;
  }, [search, sourceType]);

  useEffect(() => {
    onFilterCountChange?.(activeFilterCount);
  }, [activeFilterCount, onFilterCountChange]);

  const resetFilters = () => {
    setSearch("");
    setSourceType("all");
  };

  const columns = useMemo<FinanceAgListGridColumn<ApiFinanceJournalEntry>[]>(
    () => [
      {
        colId: "date",
        field: "entry_date",
        headerName: "Date",
        width: 118,
        minWidth: 100,
      },
      {
        colId: "number",
        field: "entry_number",
        headerName: "JV No.",
        width: 132,
        minWidth: 110,
        cellClass: "font-medium",
        cellRenderer: (p: ICellRendererParams<ApiFinanceJournalEntry>) => {
          const number = p.data?.entry_number;
          if (!number) return "—";
          return (
            <button
              type="button"
              className="block w-full min-w-0 cursor-pointer truncate text-left font-medium text-foreground no-underline hover:text-primary hover:no-underline focus-visible:outline-none"
              title={number}
              onClick={(e) => {
                e.stopPropagation();
                onOpenEntry(p.data!);
              }}
            >
              {number}
            </button>
          );
        },
      },
      {
        colId: "description",
        field: "description",
        headerName: "Particulars",
        flex: 1.6,
        minWidth: 180,
        tooltipField: "description",
      },
      {
        colId: "debit",
        headerName: "Debit",
        width: 128,
        minWidth: 100,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: `${NUMERIC_CELL} font-medium`,
        valueGetter: (p) => (p.data ? amount(p.data, "debit") : 0),
        valueFormatter: (p) => money(p.value),
      },
      {
        colId: "credit",
        headerName: "Credit",
        width: 128,
        minWidth: 100,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueGetter: (p) => (p.data ? amount(p.data, "credit") : 0),
        valueFormatter: (p) => money(p.value),
      },
      {
        colId: "source",
        field: "source_type",
        headerName: "Source",
        width: 150,
        minWidth: 120,
        cellClass: "capitalize",
        valueFormatter: (p) => pretty(p.value),
      },
      {
        colId: "status",
        field: "status",
        headerName: "Status",
        width: 110,
        minWidth: 90,
        cellRenderer: (p: ICellRendererParams<ApiFinanceJournalEntry>) => {
          const status = p.data?.status;
          if (!status) return null;
          return (
            <GridChipBadge className={`capitalize ${STATUS_TONE[status] ?? ""}`} title={status}>
              {status}
            </GridChipBadge>
          );
        },
      },
    ],
    [onOpenEntry],
  );

  return (
    <FinanceAgListGrid
      gridRef={ref}
      storageKey="journal"
      rows={filtered}
      columns={columns}
      loading={loading}
      headerLeftActions={headerLeftActions}
      footerLeftActions={footerLeftActions}
      emptyTitle="No journal entries match your filters"
      onRowClicked={onOpenEntry}
      onResetFilters={resetFilters}
      csvFileName={`journal-${new Date().toISOString().slice(0, 10)}.csv`}
      csvHeaders={["Date", "JV No.", "Particulars", "Debit", "Credit", "Source", "Status"]}
      csvRow={(row: ApiFinanceJournalEntry) => [
        row.entry_date,
        row.entry_number,
        row.description,
        money(amount(row, "debit")),
        money(amount(row, "credit")),
        row.source_type,
        row.status,
      ]}
      filterToggles={FILTER_TOGGLES}
      mobileLine={(row: ApiFinanceJournalEntry) => ({
        title: row.entry_number,
        meta: `${row.entry_date} · ${pretty(row.source_type)}`,
        value: money(amount(row, "debit")),
      })}
      summary={
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-3 py-1.5 text-[11px] tabular-nums">
          <span className="text-muted-foreground">
            Debit <span className="font-semibold text-foreground">{money(period.debit)}</span>
          </span>
          <span className="text-muted-foreground">
            Credit <span className="font-semibold text-foreground">{money(period.credit)}</span>
          </span>
          <span className={period.balanced ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
            {period.balanced ? "In balance" : `Out of balance ${money(Math.abs(period.debit - period.credit))}`}
          </span>
        </div>
      }
      filterBar={(visible) => (
        <>
          {visible.search !== false && (
            <Input
              placeholder="Search JV no., particulars, source…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-[260px] shrink-0 rounded-none"
            />
          )}
          {visible.source !== false && (
            <FilterSelect
              value={sourceType}
              onChange={setSourceType}
              width="w-[200px]"
              className="shrink-0"
              ariaLabel="Source"
              options={sourceOptions}
            />
          )}
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" className="h-7 shrink-0 rounded-none text-xs" onClick={resetFilters}>
              Clear
            </Button>
          )}
        </>
      )}
    />
  );
});
