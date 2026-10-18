"use client";

import "@/components/providers/ag-grid-provider";
import { useMemo, useState, type ReactNode } from "react";
import type { ICellRendererParams } from "ag-grid-community";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateRangePresetPicker } from "@/components/shared/date-range-preset-picker";
import { FilterSelect } from "@/components/shared/filter-select";
import { GridChipBadge } from "@/components/shared/grid-chip-badge";
import {
  FinanceAgListGrid,
  NUMERIC_CELL,
  NUMERIC_HEADER,
  type FinanceAgListGridColumn,
} from "@/components/finance/finance-ag-list-grid";
import { CHEQUE_STATUS_LABEL, ChequeStatusBadge } from "@/components/finance/cheque-status-badge";
import type { ApiFinanceCheque } from "@/lib/api/finance";
import { formatCurrency, formatDate } from "@/lib/utils";

type Filters = { search: string; status: string; direction: string; dateFrom: string; dateTo: string };
const DEFAULT_FILTERS: Filters = { search: "", status: "all", direction: "all", dateFrom: "", dateTo: "" };

type Props = {
  rows: ApiFinanceCheque[];
  loading?: boolean;
  headerLeftActions?: ReactNode;
  footerLeftActions?: (visible: ApiFinanceCheque[]) => ReactNode;
  onOpen: (cheque: ApiFinanceCheque) => void;
  className?: string;
};

export function ChequeGrid({ rows, loading, headerLeftActions, footerLeftActions, onOpen, className }: Props) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filters.status !== "all" && row.status !== filters.status) return false;
      if (filters.direction !== "all" && row.direction !== filters.direction) return false;
      if (filters.dateFrom && row.cheque_date < filters.dateFrom) return false;
      if (filters.dateTo && row.cheque_date > filters.dateTo) return false;
      if (!q) return true;
      return `${row.cheque_number} ${row.bank_name} ${row.party_name ?? ""} ${row.document_number ?? ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [rows, filters]);

  const active =
    Number(Boolean(filters.search.trim())) +
    Number(filters.status !== "all") +
    Number(filters.direction !== "all") +
    Number(Boolean(filters.dateFrom || filters.dateTo));

  const columns = useMemo<FinanceAgListGridColumn<any>[]>(
    () => [
      { colId: "number", field: "cheque_number", headerName: "Cheque #", width: 150, cellClass: "font-medium" },
      { colId: "date", field: "cheque_date", headerName: "Date", width: 120, valueFormatter: (p) => formatDate(p.value) },
      { colId: "party", field: "party_name", headerName: "Party", flex: 1.2, minWidth: 160, valueFormatter: (p) => p.value || "—" },
      { colId: "bank", field: "bank_name", headerName: "Bank", flex: 1, minWidth: 130 },
      {
        colId: "direction",
        field: "direction",
        headerName: "Direction",
        width: 110,
        cellRenderer: (p: ICellRendererParams<ApiFinanceCheque>) =>
          p.data ? (
            <GridChipBadge className="capitalize" title={p.data.direction}>
              {p.data.direction}
            </GridChipBadge>
          ) : null,
      },
      {
        colId: "amount",
        field: "amount",
        headerName: "Amount",
        width: 130,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: `${NUMERIC_CELL} font-medium`,
        valueFormatter: (p) => formatCurrency(Number(p.value)),
      },
      {
        colId: "status",
        field: "status",
        headerName: "Status",
        width: 130,
        cellRenderer: (p: ICellRendererParams<ApiFinanceCheque>) =>
          p.data ? (
            <GridChipBadge className="capitalize" title={p.data.status}>
              <ChequeStatusBadge status={p.data.status} className="border-0 bg-transparent p-0" />
            </GridChipBadge>
          ) : null,
      },
      { colId: "document", field: "document_number", headerName: "Invoice / Bill", width: 140, hide: true, valueFormatter: (p) => p.value || "—" },
    ],
    [],
  );

  return (
    <FinanceAgListGrid
      className={className}
      storageKey="cheques"
      rows={filtered}
      columns={columns as unknown as FinanceAgListGridColumn[]}
      loading={loading}
      headerLeftActions={headerLeftActions}
      onRowClicked={(row) => onOpen(row as ApiFinanceCheque)}
      onResetFilters={() => setFilters(DEFAULT_FILTERS)}
      emptyTitle={rows.length === 0 ? "No cheques yet" : "No cheques match your filters"}
      emptyHint={rows.length === 0 ? "Use New cheque to record a received or issued cheque." : undefined}
      csvFileName={`cheques-${new Date().toISOString().slice(0, 10)}.csv`}
      csvHeaders={["Cheque #", "Date", "Party", "Bank", "Direction", "Amount", "Status"]}
      csvRow={(row: ApiFinanceCheque) => [
        row.cheque_number,
        row.cheque_date,
        row.party_name ?? "",
        row.bank_name,
        row.direction,
        row.amount,
        row.status,
      ]}
      mobileLine={(row: ApiFinanceCheque) => ({
        title: `${row.cheque_number} · ${row.party_name ?? "—"}`,
        meta: `${row.bank_name} · ${CHEQUE_STATUS_LABEL[row.status]}`,
        value: formatCurrency(Number(row.amount)),
      })}
      footerLeftActions={footerLeftActions?.(filtered)}
      filterBar={
        <>
          <Input
            placeholder="Search cheque #, party, bank…"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            className="w-[240px] shrink-0 rounded-none"
          />
          <FilterSelect
            value={filters.direction}
            onChange={(direction) => setFilters((f) => ({ ...f, direction }))}
            width="w-[140px]"
            className="shrink-0"
            ariaLabel="Direction"
            options={[
              { value: "all", label: "All directions" },
              { value: "received", label: "Received" },
              { value: "issued", label: "Issued" },
            ]}
          />
          <FilterSelect
            value={filters.status}
            onChange={(status) => setFilters((f) => ({ ...f, status }))}
            width="w-[140px]"
            className="shrink-0"
            ariaLabel="Status"
            options={[
              { value: "all", label: "All statuses" },
              ...(["received", "issued", "deposited", "presented", "cleared", "bounced", "cancelled"] as const).map((value) => ({
                value,
                label: CHEQUE_STATUS_LABEL[value],
              })),
            ]}
          />
          <DateRangePresetPicker
            value={{ dateFrom: filters.dateFrom, dateTo: filters.dateTo }}
            onChange={(next) => setFilters((f) => ({ ...f, dateFrom: next.dateFrom, dateTo: next.dateTo }))}
            buttonClassName="shrink-0"
          />
          {active > 0 ? (
            <Button variant="ghost" size="sm" className="h-7 shrink-0 rounded-none text-xs" onClick={() => setFilters(DEFAULT_FILTERS)}>
              Clear
            </Button>
          ) : null}
        </>
      }
    />
  );
}
