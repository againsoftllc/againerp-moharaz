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
import { RowActionsTrigger } from "@/components/shared/row-actions-icon";
import {
  FinanceAgListGrid,
  type FinanceAgListGridColumn,
  type FinanceAgListGridHandle,
  type FinanceFilterToggle,
} from "@/components/finance/finance-ag-list-grid";
import type { ApiCostCenter } from "@/lib/api/finance-allocation";

export type CostCenterGridHandle = FinanceAgListGridHandle;

const FILTER_TOGGLES: FinanceFilterToggle[] = [
  { key: "search", label: "Search" },
  { key: "status", label: "Status" },
];

type Props = {
  rows: ApiCostCenter[];
  loading?: boolean;
  canWrite?: boolean;
  onFilterCountChange?: (count: number) => void;
  headerLeftActions?: ReactNode;
  footerLeftActions?: ReactNode;
  onEdit: (row: ApiCostCenter) => void;
  onToggleActive: (row: ApiCostCenter) => void;
};

export const CostCenterGrid = forwardRef<CostCenterGridHandle, Props>(function CostCenterGrid(
  {
    rows,
    loading = false,
    canWrite = false,
    onFilterCountChange,
    headerLeftActions,
    footerLeftActions,
    onEdit,
    onToggleActive,
  },
  ref,
) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (status === "active" && !row.is_active) return false;
      if (status === "inactive" && row.is_active) return false;
      if (!q) return true;
      return `${row.code} ${row.name} ${row.kind}`.toLowerCase().includes(q);
    });
  }, [rows, search, status]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (search.trim()) n += 1;
    if (status !== "all") n += 1;
    return n;
  }, [search, status]);

  useEffect(() => {
    onFilterCountChange?.(activeFilterCount);
  }, [activeFilterCount, onFilterCountChange]);

  const resetFilters = () => {
    setSearch("");
    setStatus("all");
  };

  const rowActions = useCallback(
    (row: ApiCostCenter) => {
      if (!canWrite) return null;
      return (
        <div data-row-actions>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <RowActionsTrigger />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => onEdit(row)}>Edit</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onToggleActive(row)}>
                {row.is_active ? "Deactivate" : "Activate"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    },
    [canWrite, onEdit, onToggleActive],
  );

  const columns = useMemo<FinanceAgListGridColumn<ApiCostCenter>[]>(
    () => [
      {
        colId: "code",
        field: "code",
        headerName: "Code",
        width: 110,
        minWidth: 80,
        cellClass: "font-mono text-[11px]",
      },
      {
        colId: "name",
        field: "name",
        headerName: "Name",
        flex: 1.4,
        minWidth: 160,
        cellClass: "font-medium",
      },
      {
        colId: "kind",
        field: "kind",
        headerName: "Kind",
        width: 130,
        minWidth: 100,
        cellClass: "capitalize text-muted-foreground",
      },
      {
        colId: "status",
        headerName: "Status",
        width: 110,
        minWidth: 90,
        cellRenderer: (p: ICellRendererParams<ApiCostCenter>) => {
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
      storageKey="cost-centers"
      rows={filtered}
      columns={columns}
      loading={loading}
      headerLeftActions={headerLeftActions}
      footerLeftActions={footerLeftActions}
      emptyTitle="No cost centers match your filters"
      onRowClicked={canWrite ? onEdit : undefined}
      onResetFilters={resetFilters}
      csvFileName={`cost-centers-${new Date().toISOString().slice(0, 10)}.csv`}
      csvHeaders={["Code", "Name", "Kind", "Status"]}
      csvRow={(row) => [row.code, row.name, row.kind, row.is_active ? "Active" : "Inactive"]}
      filterToggles={FILTER_TOGGLES}
      rowActions={canWrite ? rowActions : undefined}
      mobileLine={(row) => ({
        title: row.name,
        meta: row.code,
        value: row.is_active ? "Active" : "Inactive",
      })}
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
