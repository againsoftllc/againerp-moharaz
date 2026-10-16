"use client";

import { forwardRef, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ICellRendererParams } from "ag-grid-community";
import { Trash2 } from "lucide-react";
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
import { RowActionsTrigger } from "@/components/shared/row-actions-icon";
import {
  FinanceAgListGrid,
  type FinanceAgListGridColumn,
  type FinanceAgListGridHandle,
  type FinanceFilterToggle,
} from "@/components/finance/finance-ag-list-grid";
import type { ApiAllocationRule } from "@/lib/api/finance-allocation";

export type AllocationRuleGridHandle = FinanceAgListGridHandle;

const FILTER_TOGGLES: FinanceFilterToggle[] = [
  { key: "search", label: "Search" },
  { key: "method", label: "Method" },
  { key: "status", label: "Status" },
];

type Props = {
  rows: ApiAllocationRule[];
  loading?: boolean;
  canWrite?: boolean;
  onFilterCountChange?: (count: number) => void;
  headerLeftActions?: ReactNode;
  footerLeftActions?: ReactNode;
  onEdit: (row: ApiAllocationRule) => void;
  onDelete: (row: ApiAllocationRule) => void;
};

export const AllocationRuleGrid = forwardRef<AllocationRuleGridHandle, Props>(function AllocationRuleGrid(
  {
    rows,
    loading = false,
    canWrite = false,
    onFilterCountChange,
    headerLeftActions,
    footerLeftActions,
    onEdit,
    onDelete,
  },
  ref,
) {
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState("all");
  const [status, setStatus] = useState("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (method !== "all" && row.method !== method) return false;
      if (status === "active" && !row.is_active) return false;
      if (status === "inactive" && row.is_active) return false;
      if (!q) return true;
      return `${row.name} ${row.method} ${row.unit_label} ${row.account_code ?? ""} ${row.account_name ?? ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [rows, search, method, status]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (search.trim()) n += 1;
    if (method !== "all") n += 1;
    if (status !== "all") n += 1;
    return n;
  }, [search, method, status]);

  useEffect(() => {
    onFilterCountChange?.(activeFilterCount);
  }, [activeFilterCount, onFilterCountChange]);

  const resetFilters = () => {
    setSearch("");
    setMethod("all");
    setStatus("all");
  };

  const rowActions = useCallback(
    (row: ApiAllocationRule) => {
      if (!canWrite) return null;
      return (
        <div data-row-actions>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <RowActionsTrigger />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => onEdit(row)}>Edit</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDelete(row)}>
                <Trash2 className="mr-1.5 h-3 w-3" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    },
    [canWrite, onDelete, onEdit],
  );

  const columns = useMemo<FinanceAgListGridColumn<ApiAllocationRule>[]>(
    () => [
      {
        colId: "name",
        field: "name",
        headerName: "Name",
        flex: 1.4,
        minWidth: 160,
        cellClass: "font-medium",
      },
      {
        colId: "method",
        field: "method",
        headerName: "Method",
        width: 120,
        minWidth: 100,
        cellClass: "capitalize",
      },
      {
        colId: "unit",
        field: "unit_label",
        headerName: "Unit",
        width: 130,
        minWidth: 100,
        valueFormatter: (p) => (p.value ? String(p.value) : "—"),
        cellClass: "text-muted-foreground",
      },
      {
        colId: "account",
        headerName: "Account",
        flex: 1.1,
        minWidth: 140,
        valueGetter: (p) =>
          p.data?.account_code ? `${p.data.account_code} ${p.data.account_name ?? ""}`.trim() : "Any expense",
        cellClass: "text-muted-foreground",
      },
      {
        colId: "lines",
        headerName: "Lines",
        width: 80,
        minWidth: 64,
        valueGetter: (p) => p.data?.lines.length ?? 0,
      },
      {
        colId: "status",
        headerName: "Status",
        width: 110,
        minWidth: 90,
        cellRenderer: (p: ICellRendererParams<ApiAllocationRule>) => {
          const active = p.data?.is_active;
          return (
            <GridChipBadge title={active ? "Active" : "Inactive"}>
              {active ? "Active" : "Inactive"}
            </GridChipBadge>
          );
        },
      },
    ],
    [],
  );

  return (
    <FinanceAgListGrid
      gridRef={ref}
      storageKey="allocation-rules"
      rows={filtered}
      columns={columns}
      loading={loading}
      headerLeftActions={headerLeftActions}
      footerLeftActions={footerLeftActions}
      emptyTitle="No allocation rules match your filters"
      onRowClicked={canWrite ? onEdit : undefined}
      onResetFilters={resetFilters}
      csvFileName={`allocation-rules-${new Date().toISOString().slice(0, 10)}.csv`}
      csvHeaders={["Name", "Method", "Unit", "Account", "Lines", "Status"]}
      csvRow={(row) => [
        row.name,
        row.method,
        row.unit_label,
        row.account_code ? `${row.account_code} ${row.account_name ?? ""}`.trim() : "Any expense",
        row.lines.length,
        row.is_active ? "Active" : "Inactive",
      ]}
      filterToggles={FILTER_TOGGLES}
      rowActions={canWrite ? rowActions : undefined}
      mobileLine={(row) => ({
        title: row.name,
        meta: row.method,
        value: String(row.lines.length),
      })}
      filterBar={(visible) => (
        <>
          {visible.search !== false && (
            <Input
              placeholder="Search name, account…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-[240px] shrink-0 rounded-none"
            />
          )}
          {visible.method !== false && (
            <FilterSelect
              value={method}
              onChange={setMethod}
              width="w-[140px]"
              className="shrink-0"
              ariaLabel="Method"
              options={[
                { value: "all", label: "All methods" },
                { value: "quantity", label: "Quantity" },
                { value: "percentage", label: "Percentage" },
                { value: "fixed", label: "Fixed" },
                { value: "equal", label: "Equal" },
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
