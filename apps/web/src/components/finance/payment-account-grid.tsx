"use client";

import { forwardRef, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ICellRendererParams } from "ag-grid-community";
import { Star } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterSelect } from "@/components/shared/filter-select";
import { GridChipBadge } from "@/components/shared/grid-chip-badge";
import { RowActionsTrigger } from "@/components/shared/row-actions-icon";
import {
  FinanceAgListGrid,
  NUMERIC_CELL,
  NUMERIC_HEADER,
  type FinanceAgListGridColumn,
  type FinanceAgListGridHandle,
  type FinanceFilterToggle,
} from "@/components/finance/finance-ag-list-grid";
import type { ApiFinancePaymentAccount } from "@/lib/api/finance";
import { cn, formatCurrency } from "@/lib/utils";

export type PaymentAccountGridHandle = FinanceAgListGridHandle;

const KIND_LABELS: Record<string, string> = {
  cash: "Cash",
  bank: "Bank",
  mobile_wallet: "Mobile banking",
  card: "Card",
  other: "Other",
};

const KIND_TONE: Record<string, string> = {
  cash: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  bank: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  mobile_wallet: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  card: "border-border text-foreground",
  other: "border-border bg-muted/40 text-muted-foreground",
};

const FILTER_TOGGLES: FinanceFilterToggle[] = [
  { key: "search", label: "Search" },
  { key: "kind", label: "Type" },
  { key: "status", label: "Status" },
];

function money(value: unknown) {
  const n = Number(value);
  return formatCurrency(Number.isFinite(n) ? n : 0);
}

type Props = {
  rows: ApiFinancePaymentAccount[];
  loading?: boolean;
  canWrite?: boolean;
  busyId?: string | null;
  onFilterCountChange?: (count: number) => void;
  headerLeftActions?: ReactNode;
  footerLeftActions?: ReactNode;
  onSetDefault: (account: ApiFinancePaymentAccount) => void;
  onToggleActive: (account: ApiFinancePaymentAccount) => void;
  onTransfer?: (account: ApiFinancePaymentAccount) => void;
};

export const PaymentAccountGrid = forwardRef<PaymentAccountGridHandle, Props>(function PaymentAccountGrid(
  {
    rows,
    loading = false,
    canWrite = false,
    busyId = null,
    onFilterCountChange,
    headerLeftActions,
    footerLeftActions,
    onSetDefault,
    onToggleActive,
    onTransfer,
  },
  ref,
) {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [status, setStatus] = useState("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (kind !== "all" && row.kind !== kind) return false;
      if (status === "active" && !row.is_active) return false;
      if (status === "inactive" && row.is_active) return false;
      if (!q) return true;
      return `${row.name} ${row.kind} ${row.gl_account_code ?? ""} ${row.gl_account_name ?? ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [rows, search, kind, status]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (search.trim()) n += 1;
    if (kind !== "all") n += 1;
    if (status !== "all") n += 1;
    return n;
  }, [search, kind, status]);

  useEffect(() => {
    onFilterCountChange?.(activeFilterCount);
  }, [activeFilterCount, onFilterCountChange]);

  const resetFilters = () => {
    setSearch("");
    setKind("all");
    setStatus("all");
  };

  const rowActions = useCallback(
    (account: ApiFinancePaymentAccount) => {
      if (!canWrite) return null;
      const busy = busyId === account.id;
      return (
        <div data-row-actions>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <RowActionsTrigger disabled={busy} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {onTransfer && account.is_active ? (
                <DropdownMenuItem onClick={() => onTransfer(account)}>Transfer funds</DropdownMenuItem>
              ) : null}
              {!account.is_default ? (
                <DropdownMenuItem onClick={() => onSetDefault(account)}>Set default</DropdownMenuItem>
              ) : (
                <DropdownMenuItem disabled>Default account</DropdownMenuItem>
              )}
              <DropdownMenuItem disabled={account.is_default} onClick={() => onToggleActive(account)}>
                {account.is_active ? "Deactivate" : "Activate"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    },
    [busyId, canWrite, onSetDefault, onToggleActive, onTransfer],
  );

  const columns = useMemo<FinanceAgListGridColumn<ApiFinancePaymentAccount>[]>(
    () => [
      {
        colId: "name",
        field: "name",
        headerName: "Account",
        flex: 1.2,
        minWidth: 160,
        cellRenderer: (p: ICellRendererParams<ApiFinancePaymentAccount>) => {
          const account = p.data;
          if (!account) return null;
          return (
            <span className="inline-flex items-center gap-1.5 font-medium">
              {account.is_default ? (
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-label="Default" />
              ) : null}
              {account.name}
            </span>
          );
        },
      },
      {
        colId: "kind",
        field: "kind",
        headerName: "Type",
        width: 140,
        minWidth: 110,
        cellRenderer: (p: ICellRendererParams<ApiFinancePaymentAccount>) => {
          const value = p.data?.kind;
          if (!value) return null;
          return (
            <GridChipBadge className={KIND_TONE[value] ?? ""} title={KIND_LABELS[value] ?? value}>
              {KIND_LABELS[value] ?? value}
            </GridChipBadge>
          );
        },
      },
      {
        colId: "gl",
        headerName: "GL account",
        flex: 1.1,
        minWidth: 160,
        valueGetter: (p) =>
          p.data ? `${p.data.gl_account_code ?? ""} ${p.data.gl_account_name ?? ""}`.trim() || "—" : "—",
        cellClass: "text-muted-foreground",
      },
      {
        colId: "balance",
        field: "balance",
        headerName: "Balance",
        width: 130,
        minWidth: 110,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        cellRenderer: (p: ICellRendererParams<ApiFinancePaymentAccount>) => {
          const n = Number(p.data?.balance);
          return (
            <span className={cn("font-medium", n < 0 && "text-red-600 dark:text-red-400")}>{money(p.data?.balance)}</span>
          );
        },
      },
      {
        colId: "status",
        headerName: "Status",
        width: 110,
        minWidth: 90,
        valueGetter: (p) => (p.data?.is_active ? "Active" : "Inactive"),
        cellClass: "text-muted-foreground",
      },
      {
        colId: "opening",
        field: "opening_balance",
        headerName: "Opening",
        hide: true,
        width: 120,
        minWidth: 100,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueFormatter: (p) => money(p.value),
      },
    ],
    [],
  );

  return (
    <FinanceAgListGrid
      gridRef={ref}
      storageKey="payment-accounts"
      rows={filtered}
      columns={columns}
      loading={loading}
      headerLeftActions={headerLeftActions}
      footerLeftActions={footerLeftActions}
      emptyTitle="No payment accounts match your filters"
      onResetFilters={resetFilters}
      csvFileName={`payment-accounts-${new Date().toISOString().slice(0, 10)}.csv`}
      csvHeaders={["Account", "Type", "GL account", "Balance", "Status", "Default"]}
      csvRow={(row) => [
        row.name,
        KIND_LABELS[row.kind] ?? row.kind,
        `${row.gl_account_code ?? ""} ${row.gl_account_name ?? ""}`.trim(),
        row.balance,
        row.is_active ? "Active" : "Inactive",
        row.is_default ? "Yes" : "No",
      ]}
      filterToggles={FILTER_TOGGLES}
      rowActions={canWrite ? rowActions : undefined}
      mobileLine={(row) => ({
        title: row.name,
        meta: KIND_LABELS[row.kind] ?? row.kind,
        value: money(row.balance),
      })}
      filterBar={(visible) => (
        <>
          {visible.search !== false && (
            <Input
              placeholder="Search account, GL code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-[240px] shrink-0 rounded-none"
            />
          )}
          {visible.kind !== false && (
            <FilterSelect
              value={kind}
              onChange={setKind}
              width="w-[150px]"
              className="shrink-0"
              ariaLabel="Type"
              options={[
                { value: "all", label: "All types" },
                ...Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label })),
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
