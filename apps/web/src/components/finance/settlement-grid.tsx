"use client";

import "@/components/providers/ag-grid-provider";
import { forwardRef, useEffect, useMemo, useState, type ReactNode } from "react";
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
import type { ApiSettlement } from "@/lib/api/finance-settlements";
import { formatCurrency, formatDate } from "@/lib/utils";

type Filters = { search: string; party: string };
const DEFAULT_FILTERS: Filters = { search: "", party: "all" };
const FILTER_TOGGLES = [
  { key: "search", label: "Search" },
  { key: "party", label: "Party type" },
];

const moved = (row: ApiSettlement) =>
  row.lines.map((l) => `${l.number} ${Number(l.amount) < 0 ? "→" : "←"}`).join(" ");

export type SettlementGridHandle = FinanceAgListGridHandle;

type Props = {
  rows: ApiSettlement[];
  loading?: boolean;
  headerLeftActions?: ReactNode;
  footerLeftActions?: (visible: ApiSettlement[]) => ReactNode;
  onOpen: (row: ApiSettlement) => void;
  onFilterCountChange?: (count: number) => void;
  className?: string;
};

/** Party settlements as the common datatable. */
export const SettlementGrid = forwardRef<SettlementGridHandle, Props>(function SettlementGrid(
  { rows, loading, headerLeftActions, footerLeftActions, onOpen, onFilterCountChange, className },
  ref,
) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filters.party !== "all" && row.party_type !== filters.party) return false;
      return !q || `${row.settlement_number} ${row.party_name ?? ""} ${row.note ?? ""} ${moved(row)}`.toLowerCase().includes(q);
    });
  }, [rows, filters]);

  const activeFilters = Number(Boolean(filters.search.trim())) + Number(filters.party !== "all");
  useEffect(() => {
    onFilterCountChange?.(activeFilters);
  }, [activeFilters, onFilterCountChange]);

  const rowActions = useMemo(
    () =>
      function RowActions(row: ApiSettlement) {
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
      { colId: "number", field: "settlement_number", headerName: "Settlement no", width: 150, cellClass: "font-medium" },
      { colId: "date", field: "settlement_date", headerName: "Date", width: 110, valueFormatter: (p) => formatDate(p.value) },
      { colId: "partyType", field: "party_type", headerName: "For", width: 100, valueFormatter: (p) => (p.value === "customer" ? "Customer" : "Supplier") },
      { colId: "party", field: "party_name", headerName: "Party", flex: 1, minWidth: 160, valueFormatter: (p) => p.value || "—" },
      { colId: "moved", headerName: "Documents", flex: 1, minWidth: 200, valueGetter: (p) => (p.data ? moved(p.data) : "") },
      {
        colId: "total",
        field: "total",
        headerName: "Moved",
        width: 120,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueGetter: (p) => Number(p.data?.total ?? 0),
        valueFormatter: (p) => formatCurrency(Number(p.value)),
      },
      { colId: "note", field: "note", headerName: "Note", width: 180, hide: true, valueFormatter: (p) => p.value || "—" },
      { colId: "by", field: "created_by", headerName: "By", width: 160, hide: true, valueFormatter: (p) => p.value || "—" },
    ],
    [],
  );

  return (
    <FinanceAgListGrid
      className={className}
      gridRef={ref}
      storageKey="finance-settlements"
      rows={filtered}
      columns={columns as unknown as FinanceAgListGridColumn[]}
      loading={loading}
      headerLeftActions={headerLeftActions}
      footerLeftActions={footerLeftActions?.(filtered)}
      rowActions={rowActions as unknown as (row: any) => ReactNode}
      onRowClicked={(row) => onOpen(row as ApiSettlement)}
      onResetFilters={() => setFilters(DEFAULT_FILTERS)}
      filterToggles={FILTER_TOGGLES}
      emptyTitle={rows.length === 0 ? "No settlements yet" : "No settlements match your filters"}
      emptyHint={rows.length === 0 ? "Click New to move money from one invoice or bill to another." : undefined}
      csvFileName={`settlements-${new Date().toISOString().slice(0, 10)}.csv`}
      csvHeaders={["Settlement no", "Date", "For", "Party", "Documents", "Moved", "Note"]}
      csvRow={(row: ApiSettlement) => [
        row.settlement_number,
        row.settlement_date,
        row.party_type,
        row.party_name ?? "",
        moved(row),
        row.total,
        row.note ?? "",
      ]}
      mobileLine={(row: ApiSettlement) => ({
        title: `${row.settlement_number} · ${row.party_name ?? ""}`,
        meta: `${formatDate(row.settlement_date)} · ${moved(row)}`,
        value: formatCurrency(Number(row.total)),
      })}
      filterBar={(visible) => (
        <>
          {visible.search !== false ? (
            <Input
              placeholder="Search settlement, party, invoice…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="w-[240px] shrink-0 rounded-none"
            />
          ) : null}
          {visible.party !== false ? (
            <FilterSelect
              value={filters.party}
              onChange={(party) => setFilters((f) => ({ ...f, party }))}
              width="w-[140px]"
              className="shrink-0"
              ariaLabel="Party type"
              options={[
                { value: "all", label: "Customers & suppliers" },
                { value: "customer", label: "Customers" },
                { value: "supplier", label: "Suppliers" },
              ]}
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
