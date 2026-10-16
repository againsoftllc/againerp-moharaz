"use client";

import { forwardRef, type ReactNode } from "react";
import {
  FinanceAgListGrid,
  type FinanceAgListGridColumn,
  type FinanceAgListGridHandle,
} from "@/components/finance/finance-ag-list-grid";

export type ReportAgRow = { id: string } & Record<string, unknown>;

export type FinanceReportAgGridHandle = FinanceAgListGridHandle;

type Props = {
  storageKey: string;
  rows: ReportAgRow[];
  columns: FinanceAgListGridColumn[];
  loading?: boolean;
  headerLeftActions?: ReactNode;
  filterBar?: ReactNode;
  summary?: ReactNode;
  footerLeftActions?: ReactNode;
  emptyTitle?: string;
  csvFileName: string;
  csvHeaders: string[];
  csvRow: (row: ReportAgRow) => Array<string | number>;
  onRowClicked?: (row: ReportAgRow) => void;
};

export const FinanceReportAgGrid = forwardRef<FinanceReportAgGridHandle, Props>(function FinanceReportAgGrid(
  {
    storageKey,
    rows,
    columns,
    loading = false,
    headerLeftActions,
    filterBar,
    summary,
    footerLeftActions,
    emptyTitle = "No rows for this period",
    csvFileName,
    csvHeaders,
    csvRow,
    onRowClicked,
  },
  ref,
) {
  return (
    <FinanceAgListGrid
      gridRef={ref}
      storageKey={storageKey}
      rows={rows}
      columns={columns}
      loading={loading}
      headerLeftActions={headerLeftActions}
      filterBar={filterBar}
      summary={summary}
      footerLeftActions={footerLeftActions}
      emptyTitle={emptyTitle}
      csvFileName={csvFileName}
      csvHeaders={csvHeaders}
      csvRow={csvRow}
      onRowClicked={onRowClicked}
      mobileLine={(row) => ({
        title: String(row.account || row.label || row.name || row.title || row.id),
        meta: String(row.code || row.section || row.date || ""),
        value: String(row.amount ?? row.net ?? row.outstanding ?? ""),
      })}
    />
  );
});
