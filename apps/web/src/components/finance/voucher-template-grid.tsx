"use client";

import "@/components/providers/ag-grid-provider";
import { forwardRef, useEffect, useMemo, useState, type ReactNode } from "react";
import { BookOpen, FilePlus2 } from "lucide-react";
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
  type FinanceAgListGridColumn,
  type FinanceAgListGridHandle,
} from "@/components/finance/finance-ag-list-grid";
import { VOUCHER_TYPE_LABEL, type ApiVoucherTemplate, type VoucherType } from "@/lib/api/finance-vouchers";
import { formatDate } from "@/lib/utils";

type Filters = { search: string; type: string; active: string };
const DEFAULT_FILTERS: Filters = { search: "", type: "all", active: "all" };

const FILTER_TOGGLES = [
  { key: "search", label: "Search" },
  { key: "type", label: "Type" },
  { key: "active", label: "Active" },
];

function heads(row: ApiVoucherTemplate) {
  if (row.voucher_type === "contra") return `${row.payment_account_name ?? "—"} → ${row.to_payment_account_name ?? "—"}`;
  return row.lines.map((l) => l.account_name ?? l.account_code ?? "").filter(Boolean).join(", ") || "—";
}

export type VoucherTemplateGridHandle = FinanceAgListGridHandle;

type Props = {
  rows: ApiVoucherTemplate[];
  loading?: boolean;
  headerLeftActions?: ReactNode;
  footerLeftActions?: (visible: ApiVoucherTemplate[]) => ReactNode;
  onOpen: (row: ApiVoucherTemplate) => void;
  onUse: (row: ApiVoucherTemplate) => void;
  onFilterCountChange?: (count: number) => void;
  className?: string;
};

/** Voucher templates as the common datatable. */
export const VoucherTemplateGrid = forwardRef<VoucherTemplateGridHandle, Props>(function VoucherTemplateGrid(
  { rows, loading, headerLeftActions, footerLeftActions, onOpen, onUse, onFilterCountChange, className },
  ref,
) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filters.type !== "all" && row.voucher_type !== filters.type) return false;
      if (filters.active !== "all" && String(row.is_active) !== filters.active) return false;
      return !q || `${row.name} ${row.description} ${heads(row)}`.toLowerCase().includes(q);
    });
  }, [rows, filters]);

  const activeFilters = Number(Boolean(filters.search.trim())) + Number(filters.type !== "all") + Number(filters.active !== "all");
  useEffect(() => {
    onFilterCountChange?.(activeFilters);
  }, [activeFilters, onFilterCountChange]);

  const rowActions = useMemo(
    () =>
      function RowActions(row: ApiVoucherTemplate) {
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <RowActionsTrigger />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => onOpen(row)}>
                <BookOpen className="mr-1.5 h-3 w-3" /> Open
              </DropdownMenuItem>
              {row.is_active ? (
                <DropdownMenuItem onClick={() => onUse(row)}>
                  <FilePlus2 className="mr-1.5 h-3 w-3" /> New voucher from this
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    [onOpen, onUse],
  );

  const columns = useMemo<FinanceAgListGridColumn<any>[]>(
    () => [
      { colId: "name", field: "name", headerName: "Template", width: 200, minWidth: 140, cellClass: "font-medium" },
      { colId: "type", field: "voucher_type", headerName: "Type", width: 140, valueFormatter: (p) => VOUCHER_TYPE_LABEL[p.value as VoucherType] ?? p.value },
      { colId: "heads", headerName: "Heads", flex: 1, minWidth: 200, valueGetter: (p) => (p.data ? heads(p.data) : "") },
      { colId: "account", field: "payment_account_name", headerName: "Cash / bank", width: 160, valueFormatter: (p) => p.value || "—" },
      { colId: "active", field: "is_active", headerName: "Active", width: 90, valueFormatter: (p) => (p.value ? "Yes" : "No") },
      { colId: "description", field: "description", headerName: "Description", flex: 1, minWidth: 160, hide: true, valueFormatter: (p) => p.value || "—" },
      { colId: "created", field: "created_at", headerName: "Created", width: 120, hide: true, valueFormatter: (p) => formatDate(p.value) },
    ],
    [],
  );

  return (
    <FinanceAgListGrid
      className={className}
      gridRef={ref}
      storageKey="finance-voucher-templates"
      rows={filtered}
      columns={columns as unknown as FinanceAgListGridColumn[]}
      loading={loading}
      headerLeftActions={headerLeftActions}
      footerLeftActions={footerLeftActions?.(filtered)}
      rowActions={rowActions as unknown as (row: any) => ReactNode}
      onRowClicked={(row) => onOpen(row as ApiVoucherTemplate)}
      onResetFilters={() => setFilters(DEFAULT_FILTERS)}
      filterToggles={FILTER_TOGGLES}
      emptyTitle={rows.length === 0 ? "No voucher templates yet" : "No templates match your filters"}
      emptyHint={rows.length === 0 ? "Click New to keep a voucher you enter often (rent, salaries, the daily cash deposit)." : undefined}
      csvFileName={`voucher-templates-${new Date().toISOString().slice(0, 10)}.csv`}
      csvHeaders={["Template", "Type", "Heads", "Cash / bank", "Active"]}
      csvRow={(row: ApiVoucherTemplate) => [row.name, VOUCHER_TYPE_LABEL[row.voucher_type], heads(row), row.payment_account_name ?? "", row.is_active ? "Yes" : "No"]}
      mobileLine={(row: ApiVoucherTemplate) => ({
        title: row.name,
        meta: `${VOUCHER_TYPE_LABEL[row.voucher_type]} · ${heads(row)}`,
        value: row.is_active ? "Active" : "Inactive",
      })}
      filterBar={(visible) => (
        <>
          {visible.search !== false ? (
            <Input
              placeholder="Search template, heads…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="w-[220px] shrink-0 rounded-none"
            />
          ) : null}
          {visible.type !== false ? (
            <FilterSelect
              value={filters.type}
              onChange={(type) => setFilters((f) => ({ ...f, type }))}
              width="w-[150px]"
              className="shrink-0"
              ariaLabel="Type"
              options={[
                { value: "all", label: "All types" },
                ...(Object.keys(VOUCHER_TYPE_LABEL) as VoucherType[]).map((value) => ({ value, label: VOUCHER_TYPE_LABEL[value] })),
              ]}
            />
          ) : null}
          {visible.active !== false ? (
            <FilterSelect
              value={filters.active}
              onChange={(active) => setFilters((f) => ({ ...f, active }))}
              width="w-[120px]"
              className="shrink-0"
              ariaLabel="Active"
              options={[
                { value: "all", label: "All" },
                { value: "true", label: "Active" },
                { value: "false", label: "Inactive" },
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
