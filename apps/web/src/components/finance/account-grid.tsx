"use client";

import { forwardRef, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ICellRendererParams } from "ag-grid-community";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FilterSelect } from "@/components/shared/filter-select";
import { GridChipBadge } from "@/components/shared/grid-chip-badge";
import { GridRefLink } from "@/components/shared/grid-ref-link";
import { RowActionsTrigger } from "@/components/shared/row-actions-icon";
import {
  FinanceAgListGrid,
  NUMERIC_CELL,
  NUMERIC_HEADER,
  type FinanceAgListGridColumn,
  type FinanceAgListGridHandle,
  type FinanceFilterToggle,
} from "@/components/finance/finance-ag-list-grid";
import type { ApiFinanceAccount } from "@/lib/api/finance";
import { cn, formatCurrency } from "@/lib/utils";

export type AccountGridHandle = FinanceAgListGridHandle;

const TYPE_TONE: Record<string, string> = {
  revenue: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  expense: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  liability: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  asset: "border-border text-foreground",
  equity: "border-border bg-muted/40 text-muted-foreground",
};

const FILTER_TOGGLES: FinanceFilterToggle[] = [
  { key: "search", label: "Search" },
  { key: "type", label: "Type" },
  { key: "status", label: "Status" },
];

function money(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return "";
  return formatCurrency(n);
}

function moneyOrDash(value: unknown) {
  const n = Number(value);
  return formatCurrency(Number.isFinite(n) ? n : 0);
}

function natureLabel(value: string | undefined) {
  return value === "credit" ? "Cr" : "Dr";
}

type Props = {
  rows: ApiFinanceAccount[];
  loading?: boolean;
  canWrite?: boolean;
  onFilterCountChange?: (count: number) => void;
  headerLeftActions?: ReactNode;
  footerLeftActions?: ReactNode;
  onEdit: (row: ApiFinanceAccount) => void;
  onToggleActive: (row: ApiFinanceAccount) => void;
  onOpenLedger: (row: ApiFinanceAccount) => void;
};

export const AccountGrid = forwardRef<AccountGridHandle, Props>(function AccountGrid(
  {
    rows,
    loading = false,
    canWrite = false,
    onFilterCountChange,
    headerLeftActions,
    footerLeftActions,
    onEdit,
    onToggleActive,
    onOpenLedger,
  },
  ref,
) {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (type !== "all" && row.account_type !== type) return false;
      if (status === "active" && !row.is_active) return false;
      if (status === "inactive" && row.is_active) return false;
      if (!q) return true;
      return `${row.code} ${row.name} ${row.account_type} ${row.parent_code ?? ""}`.toLowerCase().includes(q);
    });
  }, [rows, search, type, status]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (search.trim()) n += 1;
    if (type !== "all") n += 1;
    if (status !== "all") n += 1;
    return n;
  }, [search, type, status]);

  useEffect(() => {
    onFilterCountChange?.(activeFilterCount);
  }, [activeFilterCount, onFilterCountChange]);

  const resetFilters = () => {
    setSearch("");
    setType("all");
    setStatus("all");
  };

  const totals = useMemo(() => {
    let debit = 0;
    let credit = 0;
    for (const row of filtered) {
      debit += Number(row.debit) || 0;
      credit += Number(row.credit) || 0;
    }
    return { debit, credit, balanced: Math.abs(debit - credit) < 0.005 };
  }, [filtered]);

  const rowActions = useCallback(
    (row: ApiFinanceAccount) => (
      <div data-row-actions>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <RowActionsTrigger />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => onOpenLedger(row)}>Ledger</DropdownMenuItem>
            {canWrite ? <DropdownMenuItem onClick={() => onEdit(row)}>Edit</DropdownMenuItem> : null}
            {canWrite && !row.is_system ? (
              <DropdownMenuItem onClick={() => onToggleActive(row)}>
                {row.is_active ? "Deactivate" : "Activate"}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    ),
    [canWrite, onEdit, onOpenLedger, onToggleActive],
  );

  const columns = useMemo<FinanceAgListGridColumn<ApiFinanceAccount>[]>(
    () => [
      {
        colId: "code",
        field: "code",
        headerName: "Code",
        width: 100,
        minWidth: 80,
        cellClass: "font-mono text-[11px]",
        cellRenderer: (p: ICellRendererParams<ApiFinanceAccount>) => {
          const row = p.data;
          if (!row) return null;
          return (
            <GridRefLink className="font-mono text-[11px]" title={row.code} onClick={() => onOpenLedger(row)}>
              {row.code}
            </GridRefLink>
          );
        },
      },
      {
        colId: "name",
        field: "name",
        headerName: "Account",
        flex: 1.8,
        minWidth: 220,
        cellRenderer: (p: ICellRendererParams<ApiFinanceAccount>) => {
          const row = p.data;
          if (!row) return null;
          const depth = row.depth ?? 0;
          return (
            <GridRefLink
              className={cn("font-medium", depth > 0 && "text-foreground")}
              title={row.parent_code ? `${row.name} · under ${row.parent_code}` : row.name}
              onClick={() => onOpenLedger(row)}
            >
              <span className="block truncate" style={{ paddingLeft: depth * 14 }}>
                {row.name}
              </span>
            </GridRefLink>
          );
        },
      },
      {
        colId: "type",
        field: "account_type",
        headerName: "Type",
        width: 120,
        minWidth: 96,
        cellRenderer: (p: ICellRendererParams<ApiFinanceAccount>) => {
          const value = p.data?.account_type;
          if (!value) return null;
          return (
            <GridChipBadge className={cn("capitalize", TYPE_TONE[value] ?? "")} title={value}>
              {value}
            </GridChipBadge>
          );
        },
      },
      {
        colId: "nature",
        headerName: "Nature",
        width: 80,
        minWidth: 70,
        valueGetter: (p) => natureLabel(p.data?.nature),
        cellClass: "text-muted-foreground",
      },
      {
        colId: "debit",
        headerName: "Debit",
        width: 120,
        minWidth: 96,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueGetter: (p) => Number(p.data?.debit) || 0,
        valueFormatter: (p) => money(p.value),
      },
      {
        colId: "credit",
        headerName: "Credit",
        width: 120,
        minWidth: 96,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueGetter: (p) => Number(p.data?.credit) || 0,
        valueFormatter: (p) => money(p.value),
      },
      {
        colId: "balance",
        headerName: "Balance",
        width: 140,
        minWidth: 110,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueGetter: (p) => Number(p.data?.balance) || 0,
        valueFormatter: (p) => {
          const row = p.data;
          const n = Number(row?.balance) || 0;
          if (!row || n === 0) return "";
          return `${moneyOrDash(n)} ${natureLabel(row.balance_side)}`;
        },
      },
      {
        colId: "status",
        headerName: "Status",
        width: 100,
        minWidth: 84,
        valueGetter: (p) => (p.data?.is_active ? "Active" : "Inactive"),
        cellRenderer: (p: ICellRendererParams<ApiFinanceAccount>) => {
          const active = p.data?.is_active;
          return (
            <GridChipBadge title={active ? "Active" : "Inactive"}>
              {active ? "Active" : "Inactive"}
            </GridChipBadge>
          );
        },
      },
      {
        colId: "parent",
        headerName: "Parent",
        hide: true,
        width: 90,
        minWidth: 80,
        valueGetter: (p) => p.data?.parent_code ?? "",
      },
      {
        colId: "system",
        headerName: "System",
        hide: true,
        width: 90,
        minWidth: 80,
        valueGetter: (p) => (p.data?.is_system ? "Yes" : "No"),
      },
    ],
    [onOpenLedger],
  );

  return (
    <FinanceAgListGrid
      gridRef={ref}
      storageKey="accounts"
      rows={filtered}
      columns={columns}
      loading={loading}
      headerLeftActions={headerLeftActions}
      footerLeftActions={footerLeftActions}
      emptyTitle="No accounts match your filters"
      onRowClicked={onOpenLedger}
      onResetFilters={resetFilters}
      csvFileName={`chart-of-accounts-${new Date().toISOString().slice(0, 10)}.csv`}
      csvHeaders={["Code", "Account", "Type", "Nature", "Debit", "Credit", "Balance", "Status"]}
      csvRow={(row) => [
        row.code,
        `${"— ".repeat(row.depth ?? 0)}${row.name}`,
        row.account_type,
        natureLabel(row.nature),
        moneyOrDash(row.debit),
        moneyOrDash(row.credit),
        Number(row.balance) ? `${moneyOrDash(row.balance)} ${natureLabel(row.balance_side)}` : "",
        row.is_active ? "Active" : "Inactive",
      ]}
      filterToggles={FILTER_TOGGLES}
      rowActions={rowActions}
      mobileLine={(row) => ({
        title: row.name,
        meta: `${row.code} · ${natureLabel(row.nature)}`,
        value: Number(row.balance) ? `${moneyOrDash(row.balance)} ${natureLabel(row.balance_side)}` : row.account_type,
      })}
      summary={
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-3 py-1.5 text-[11px] tabular-nums">
          <span className="text-muted-foreground">
            Debit <span className="font-semibold text-foreground">{moneyOrDash(totals.debit)}</span>
          </span>
          <span className="text-muted-foreground">
            Credit <span className="font-semibold text-foreground">{moneyOrDash(totals.credit)}</span>
          </span>
          <span className={totals.balanced ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
            {totals.balanced ? "In balance" : `Out of balance ${moneyOrDash(Math.abs(totals.debit - totals.credit))}`}
          </span>
        </div>
      }
      filterBar={(visible) => (
        <>
          {visible.search !== false && (
            <Input
              placeholder="Search code or name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-[240px] shrink-0 rounded-none"
            />
          )}
          {visible.type !== false && (
            <FilterSelect
              value={type}
              onChange={setType}
              width="w-[140px]"
              className="shrink-0"
              ariaLabel="Type"
              options={[
                { value: "all", label: "All types" },
                { value: "asset", label: "Asset" },
                { value: "liability", label: "Liability" },
                { value: "equity", label: "Equity" },
                { value: "revenue", label: "Revenue" },
                { value: "expense", label: "Expense" },
              ]}
            />
          )}
          {visible.status !== false && (
            <FilterSelect
              value={status}
              onChange={setStatus}
              width="w-[130px]"
              className="shrink-0"
              ariaLabel="Status"
              options={[
                { value: "all", label: "All statuses" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ]}
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
