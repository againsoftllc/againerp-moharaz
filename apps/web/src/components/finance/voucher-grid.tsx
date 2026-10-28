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
import {
  VOUCHER_STATUS_LABEL,
  VOUCHER_TYPE_LABEL,
  type ApiVoucher,
  type VoucherStatus,
  type VoucherType,
} from "@/lib/api/finance-vouchers";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

type Filters = { search: string; type: string; status: string };
const DEFAULT_FILTERS: Filters = { search: "", type: "all", status: "all" };

const FILTER_TOGGLES = [
  { key: "search", label: "Search" },
  { key: "type", label: "Type" },
  { key: "status", label: "Status" },
];

const STATUS_CLASS: Record<VoucherStatus, string> = {
  draft: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  approved: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  cancelled: "border-border bg-muted text-muted-foreground line-through",
};

export function VoucherStatusBadge({ status, className }: { status: VoucherStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center border px-1.5 text-[11px] font-medium leading-4", STATUS_CLASS[status], className)}>
      {VOUCHER_STATUS_LABEL[status]}
    </span>
  );
}

/** Where the money moved: the cash / bank side of a money voucher, both sides of a contra, nothing for a journal. */
export function voucherAccounts(row: ApiVoucher): string {
  if (row.voucher_type === "contra") return `${row.payment_account_name ?? "—"} → ${row.to_payment_account_name ?? "—"}`;
  if (row.voucher_type === "journal") return "—";
  return row.payment_account_name ?? "—";
}

export type VoucherGridHandle = FinanceAgListGridHandle;

type Props = {
  rows: ApiVoucher[];
  /** The page is filtered to one type: the type filter and column are not needed. */
  fixedType?: VoucherType | null;
  loading?: boolean;
  headerLeftActions?: ReactNode;
  footerLeftActions?: (visible: ApiVoucher[]) => ReactNode;
  onOpen: (row: ApiVoucher) => void;
  onFilterCountChange?: (count: number) => void;
  className?: string;
};

/** Vouchers as the common datatable (docs/common/datatablecommon.md). */
export const VoucherGrid = forwardRef<VoucherGridHandle, Props>(function VoucherGrid(
  { rows, fixedType, loading, headerLeftActions, footerLeftActions, onOpen, onFilterCountChange, className },
  ref,
) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  useEffect(() => {
    setFilters(DEFAULT_FILTERS);
  }, [fixedType]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filters.type !== "all" && row.voucher_type !== filters.type) return false;
      if (filters.status !== "all" && row.status !== filters.status) return false;
      if (!q) return true;
      return `${row.voucher_number} ${row.description} ${row.reference ?? ""} ${voucherAccounts(row)} ${row.journal_entry_number ?? ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [rows, filters]);

  const activeFilters = Number(Boolean(filters.search.trim())) + Number(filters.type !== "all") + Number(filters.status !== "all");

  useEffect(() => {
    onFilterCountChange?.(activeFilters);
  }, [activeFilters, onFilterCountChange]);

  const rowActions = useMemo(
    () =>
      function RowActions(row: ApiVoucher) {
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
      { colId: "number", field: "voucher_number", headerName: "Voucher no", width: 150, minWidth: 120, cellClass: "font-medium" },
      { colId: "date", field: "voucher_date", headerName: "Date", width: 110, valueFormatter: (p) => formatDate(p.value) },
      {
        colId: "type",
        field: "voucher_type",
        headerName: "Type",
        width: 140,
        hide: Boolean(fixedType),
        valueFormatter: (p) => VOUCHER_TYPE_LABEL[p.value as VoucherType] ?? p.value,
      },
      { colId: "description", field: "description", headerName: "Description", flex: 1, minWidth: 180, valueFormatter: (p) => p.value || "—" },
      { colId: "account", headerName: "Cash / bank", width: 200, valueGetter: (p) => (p.data ? voucherAccounts(p.data) : "") },
      {
        colId: "amount",
        field: "amount",
        headerName: "Amount",
        width: 130,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueGetter: (p) => Number(p.data?.amount ?? 0),
        valueFormatter: (p) => formatCurrency(Number(p.value)),
      },
      {
        colId: "status",
        field: "status",
        headerName: "Status",
        width: 110,
        cellRenderer: (p: ICellRendererParams<ApiVoucher>) =>
          p.data ? (
            <div className="flex h-full items-center overflow-hidden">
              <VoucherStatusBadge status={p.data.status} className="shrink-0" />
            </div>
          ) : null,
      },
      { colId: "journal", field: "journal_entry_number", headerName: "Journal", width: 120, valueFormatter: (p) => p.value || "—" },
      { colId: "reference", field: "reference", headerName: "Reference", width: 140, hide: true, valueFormatter: (p) => p.value || "—" },
      { colId: "createdBy", field: "created_by", headerName: "Entered by", width: 160, hide: true, valueFormatter: (p) => p.value || "—" },
      { colId: "approvedBy", field: "approved_by", headerName: "Approved by", width: 160, hide: true, valueFormatter: (p) => p.value || "—" },
    ],
    [fixedType],
  );

  return (
    <FinanceAgListGrid
      className={className}
      gridRef={ref}
      storageKey="finance-vouchers"
      rows={filtered}
      columns={columns as unknown as FinanceAgListGridColumn[]}
      loading={loading}
      headerLeftActions={headerLeftActions}
      footerLeftActions={footerLeftActions?.(filtered)}
      rowActions={rowActions as unknown as (row: any) => ReactNode}
      onRowClicked={(row) => onOpen(row as ApiVoucher)}
      onResetFilters={() => setFilters(DEFAULT_FILTERS)}
      filterToggles={fixedType ? FILTER_TOGGLES.filter((t) => t.key !== "type") : FILTER_TOGGLES}
      emptyTitle={rows.length === 0 ? "No vouchers yet" : "No vouchers match your filters"}
      emptyHint={rows.length === 0 ? "Click New to enter the first voucher." : undefined}
      csvFileName={`vouchers-${new Date().toISOString().slice(0, 10)}.csv`}
      csvHeaders={["Voucher no", "Date", "Type", "Description", "Cash / bank", "Amount", "Status", "Journal", "Reference"]}
      csvRow={(row: ApiVoucher) => [
        row.voucher_number,
        row.voucher_date,
        VOUCHER_TYPE_LABEL[row.voucher_type],
        row.description,
        voucherAccounts(row),
        row.amount,
        VOUCHER_STATUS_LABEL[row.status],
        row.journal_entry_number ?? "",
        row.reference ?? "",
      ]}
      mobileLine={(row: ApiVoucher) => ({
        title: `${row.voucher_number} · ${VOUCHER_TYPE_LABEL[row.voucher_type]}`,
        meta: `${formatDate(row.voucher_date)} · ${row.description || voucherAccounts(row)} · ${VOUCHER_STATUS_LABEL[row.status]}`,
        value: formatCurrency(Number(row.amount)),
      })}
      filterBar={(visible) => (
        <>
          {visible.search !== false ? (
            <Input
              placeholder="Search voucher no, description, reference…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="w-[260px] shrink-0 rounded-none"
            />
          ) : null}
          {!fixedType && visible.type !== false ? (
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
          {visible.status !== false ? (
            <FilterSelect
              value={filters.status}
              onChange={(status) => setFilters((f) => ({ ...f, status }))}
              width="w-[130px]"
              className="shrink-0"
              ariaLabel="Status"
              options={[
                { value: "all", label: "All statuses" },
                ...(Object.keys(VOUCHER_STATUS_LABEL) as VoucherStatus[]).map((value) => ({ value, label: VOUCHER_STATUS_LABEL[value] })),
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
