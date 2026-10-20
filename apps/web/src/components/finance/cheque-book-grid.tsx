"use client";

import "@/components/providers/ag-grid-provider";
import { forwardRef, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ICellRendererParams } from "ag-grid-community";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FilterSelect } from "@/components/shared/filter-select";
import { RowActionsTrigger } from "@/components/shared/row-actions-icon";
import {
  FinanceAgListGrid,
  NUMERIC_CELL,
  NUMERIC_HEADER,
  type FinanceAgListGridColumn,
  type FinanceAgListGridHandle,
} from "@/components/finance/finance-ag-list-grid";
import { BOOK_STATE_LABEL, ChequeBookStateBadge, chequeRangeLabel } from "@/components/finance/cheque-book-status";
import type { ApiChequeBook, ChequeBookState } from "@/lib/api/finance";
import { formatDate } from "@/lib/utils";

type Filters = { search: string; state: string; bank: string; account: string };
const DEFAULT_FILTERS: Filters = { search: "", state: "all", bank: "all", account: "all" };

const FILTER_TOGGLES = [
  { key: "search", label: "Search" },
  { key: "state", label: "State" },
  { key: "bank", label: "Bank" },
  { key: "account", label: "Account" },
];

export type ChequeBookGridHandle = FinanceAgListGridHandle;

type Props = {
  rows: ApiChequeBook[];
  loading?: boolean;
  headerLeftActions?: ReactNode;
  footerLeftActions?: (visible: ApiChequeBook[]) => ReactNode;
  onOpen: (book: ApiChequeBook) => void;
  onFilterCountChange?: (count: number) => void;
  className?: string;
};

/** Cheque books as the common datatable (same shell as Payments / Products): pinned actions column, Columns + Filters drawers, export. */
export const ChequeBookGrid = forwardRef<ChequeBookGridHandle, Props>(function ChequeBookGrid(
  { rows, loading, headerLeftActions, footerLeftActions, onOpen, onFilterCountChange, className },
  ref,
) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  const banks = useMemo(() => [...new Set(rows.map((r) => r.bank_name).filter(Boolean))].sort(), [rows]);
  const accounts = useMemo(
    () => [...new Set(rows.map((r) => r.payment_account_name).filter((v): v is string => !!v))].sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filters.state !== "all" && row.state !== filters.state) return false;
      if (filters.bank !== "all" && row.bank_name !== filters.bank) return false;
      if (filters.account !== "all" && row.payment_account_name !== filters.account) return false;
      if (!q) return true;
      return `${row.book_number} ${row.bank_name} ${row.payment_account_name ?? ""} ${row.branch_name ?? ""} ${row.routing_number ?? ""} ${chequeRangeLabel(row.cheque_prefix, row.number_from, row.number_to)}`
        .toLowerCase()
        .includes(q);
    });
  }, [rows, filters]);

  const activeFilters =
    Number(Boolean(filters.search.trim())) +
    Number(filters.state !== "all") +
    Number(filters.bank !== "all") +
    Number(filters.account !== "all");

  useEffect(() => {
    onFilterCountChange?.(activeFilters);
  }, [activeFilters, onFilterCountChange]);

  const rowActions = useMemo(
    () =>
      function RowActions(row: ApiChequeBook) {
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <RowActionsTrigger />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => onOpen(row)}>
                <BookOpen className="mr-1.5 h-3 w-3" /> Open
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    [onOpen],
  );

  const columns = useMemo<FinanceAgListGridColumn<any>[]>(
    () => [
      { colId: "number", field: "book_number", headerName: "Cheque book no", width: 150, minWidth: 120, cellClass: "font-medium" },
      { colId: "bank", field: "bank_name", headerName: "Bank", flex: 1, minWidth: 140 },
      { colId: "account", field: "payment_account_name", headerName: "Account", flex: 1, minWidth: 150, valueFormatter: (p) => p.value || "—" },
      { colId: "branch", field: "branch_name", headerName: "Branch", width: 150, valueFormatter: (p) => p.value || "—" },
      {
        colId: "range",
        headerName: "Cheque numbers",
        width: 190,
        valueGetter: (p) => (p.data ? chequeRangeLabel(p.data.cheque_prefix, p.data.number_from, p.data.number_to) : ""),
        cellClass: "tabular-nums",
      },
      {
        colId: "leaves",
        field: "leaf_count",
        headerName: "Leaves",
        width: 90,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
      },
      {
        colId: "unused",
        field: "unused_count",
        headerName: "Unused",
        width: 90,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
      },
      {
        colId: "state",
        field: "state",
        headerName: "State",
        width: 110,
        cellRenderer: (p: ICellRendererParams<ApiChequeBook>) =>
          p.data ? (
            <div className="flex h-full items-center overflow-hidden">
              <ChequeBookStateBadge state={p.data.state} className="shrink-0 leading-4" />
            </div>
          ) : null,
      },
      { colId: "routing", field: "routing_number", headerName: "Routing no.", width: 130, hide: true, valueFormatter: (p) => p.value || "—" },
      { colId: "remarks", field: "remarks", headerName: "Remarks", flex: 1, minWidth: 160, hide: true, valueFormatter: (p) => p.value || "—" },
      { colId: "created", field: "created_at", headerName: "Created", width: 120, hide: true, valueFormatter: (p) => formatDate(p.value) },
    ],
    [],
  );

  return (
    <FinanceAgListGrid
      className={className}
      gridRef={ref}
      storageKey="cheque-books"
      rows={filtered}
      columns={columns as unknown as FinanceAgListGridColumn[]}
      loading={loading}
      headerLeftActions={headerLeftActions}
      footerLeftActions={footerLeftActions?.(filtered)}
      rowActions={rowActions as unknown as (row: any) => ReactNode}
      onRowClicked={(row) => onOpen(row as ApiChequeBook)}
      onResetFilters={() => setFilters(DEFAULT_FILTERS)}
      filterToggles={FILTER_TOGGLES}
      emptyTitle={rows.length === 0 ? "No cheque books yet" : "No cheque books match your filters"}
      emptyHint={rows.length === 0 ? "Click New cheque book to register the first one." : undefined}
      csvFileName={`cheque-books-${new Date().toISOString().slice(0, 10)}.csv`}
      csvHeaders={["Cheque book no", "Bank", "Account", "Branch", "Routing no.", "Cheque numbers", "Leaves", "Unused", "State"]}
      csvRow={(row: ApiChequeBook) => [
        row.book_number,
        row.bank_name,
        row.payment_account_name ?? "",
        row.branch_name ?? "",
        row.routing_number ?? "",
        chequeRangeLabel(row.cheque_prefix, row.number_from, row.number_to),
        row.leaf_count,
        row.unused_count,
        BOOK_STATE_LABEL[row.state as ChequeBookState] ?? row.state,
      ]}
      mobileLine={(row: ApiChequeBook) => ({
        title: `${row.book_number} · ${row.bank_name}`,
        meta: `${chequeRangeLabel(row.cheque_prefix, row.number_from, row.number_to)} · ${BOOK_STATE_LABEL[row.state as ChequeBookState] ?? row.state}`,
        value: `${row.unused_count}/${row.leaf_count} unused`,
      })}
      filterBar={(visible) => (
        <>
          {visible.search !== false ? (
            <Input
              placeholder="Search book no, bank, account…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="w-[240px] shrink-0 rounded-none"
            />
          ) : null}
          {visible.state !== false ? (
            <FilterSelect
              value={filters.state}
              onChange={(state) => setFilters((f) => ({ ...f, state }))}
              width="w-[130px]"
              className="shrink-0"
              ariaLabel="State"
              options={[
                { value: "all", label: "All states" },
                ...(Object.keys(BOOK_STATE_LABEL) as ChequeBookState[]).map((value) => ({ value, label: BOOK_STATE_LABEL[value] })),
              ]}
            />
          ) : null}
          {visible.bank !== false ? (
            <FilterSelect
              value={filters.bank}
              onChange={(bank) => setFilters((f) => ({ ...f, bank }))}
              width="w-[170px]"
              className="shrink-0"
              ariaLabel="Bank"
              searchThreshold={8}
              options={[{ value: "all", label: "All banks" }, ...banks.map((b) => ({ value: b, label: b }))]}
            />
          ) : null}
          {visible.account !== false ? (
            <FilterSelect
              value={filters.account}
              onChange={(account) => setFilters((f) => ({ ...f, account }))}
              width="w-[170px]"
              className="shrink-0"
              ariaLabel="Account"
              searchThreshold={8}
              options={[{ value: "all", label: "All accounts" }, ...accounts.map((a) => ({ value: a, label: a }))]}
            />
          ) : null}
          {activeFilters > 0 ? (
            <Button variant="ghost" size="sm" className="h-7 shrink-0 rounded-none text-xs" onClick={() => setFilters(DEFAULT_FILTERS)}>
              Clear
            </Button>
          ) : null}
        </>
      )}
    />
  );
});
