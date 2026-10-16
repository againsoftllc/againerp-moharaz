"use client";

import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import type { ICellRendererParams } from "ag-grid-community";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  FinanceAgListGrid,
  NUMERIC_CELL,
  NUMERIC_HEADER,
  type FinanceAgListGridColumn,
  type FinanceAgListGridHandle,
} from "@/components/finance/finance-ag-list-grid";
import { downloadCsv, money } from "@/components/finance/finance-report-shell";
import type { ApiFinanceReport } from "@/lib/api/finance";
import { cn } from "@/lib/utils";

/**
 * Odoo-style Balance Sheet grid.
 *
 * Renders the API's section → group → bucket → account tree as a flat AG Grid: section headers
 * (ASSETS), group headers (Current Assets), bucket lines (Bank and Cash Accounts…) that unfold into
 * their accounts, "Total …" rows, and the closing LIABILITIES + EQUITY line. When the report carries
 * a comparison column, the compare and % variance columns appear automatically.
 */

export type BalanceSheetRowKind = "section" | "group" | "line" | "account" | "total" | "section_total" | "grand";

export type BalanceSheetRow = {
  id: string;
  kind: BalanceSheetRowKind;
  depth: number;
  label: string;
  code: string;
  account_id: string;
  line_key: string;
  expandable: boolean;
  expanded: boolean;
  amount: number | null;
  compare: number | null;
  variance: number | null;
  variance_pct: number | null;
  /** money (default) | percent | days | ratio — how amount / compare render. */
  format: string;
};

export type BalanceSheetColumnMeta = { key: "amount" | "compare" | "variance_pct"; label: string };

type Node = Record<string, unknown>;

function str(value: unknown) {
  return value == null ? "" : String(value);
}

function numOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function balanceSheetColumnsFromReport(report: ApiFinanceReport | null): BalanceSheetColumnMeta[] {
  const raw = (report?.filters as Record<string, unknown> | undefined)?.columns;
  if (Array.isArray(raw) && raw.length) {
    return raw
      .map((c) => ({ key: str((c as Node).key) as BalanceSheetColumnMeta["key"], label: str((c as Node).label) }))
      .filter((c) => c.key === "amount" || c.key === "compare" || c.key === "variance_pct");
  }
  return [{ key: "amount", label: "Balance" }];
}

function baseRow(partial: Partial<BalanceSheetRow> & Pick<BalanceSheetRow, "id" | "kind" | "depth" | "label">): BalanceSheetRow {
  return {
    code: "",
    account_id: "",
    line_key: "",
    expandable: false,
    expanded: false,
    amount: null,
    compare: null,
    variance: null,
    variance_pct: null,
    format: "money",
    ...partial,
  };
}

function amountsOf(node: Node) {
  return {
    amount: numOrNull(node.amount),
    compare: numOrNull(node.compare),
    variance: numOrNull(node.variance),
    variance_pct: numOrNull(node.variance_pct),
  };
}

/** Flatten the API tree. Account rows are emitted only for expanded lines unless `includeCollapsed`. */
export function flattenBalanceSheetRows(
  report: ApiFinanceReport | null,
  expanded: ReadonlySet<string>,
  opts: { includeCollapsed?: boolean } = {},
): BalanceSheetRow[] {
  if (!report) return [];
  const out: BalanceSheetRow[] = [];

  const walk = (node: Node, depth: number) => {
    const kind = str(node.kind);
    const key = str(node.key);
    const label = str(node.label);
    const children = Array.isArray(node.children) ? (node.children as Node[]) : [];
    const accounts = Array.isArray(node.accounts) ? (node.accounts as Node[]) : [];

    if (kind === "section" || kind === "group") {
      // A header may carry its own amount (cash flow "Net increase…") and may opt out of a
      // trailing "Total …" row by sending total_label: null.
      out.push(baseRow({ id: `h:${key}`, kind, depth, label, line_key: key, ...(node.show_amount ? amountsOf(node) : {}) }));
      for (const child of children) walk(child, depth + 1);
      if (node.total_label !== null) {
        out.push(
          baseRow({
            id: `t:${key}`,
            kind: kind === "section" ? "section_total" : "total",
            depth,
            label: str(node.total_label) || `Total ${label}`,
            line_key: key,
            ...amountsOf(node),
          }),
        );
      }
      return;
    }
    if (kind === "grand") {
      out.push(baseRow({ id: `g:${key}`, kind: "grand", depth, label, line_key: key, ...amountsOf(node) }));
      return;
    }
    // bucket line
    const isOpen = expanded.has(key);
    out.push(
      baseRow({
        id: `l:${key}`,
        kind: "line",
        depth,
        label,
        line_key: key,
        expandable: accounts.length > 0,
        expanded: isOpen,
        format: str(node.format) || "money",
        ...amountsOf(node),
      }),
    );
    if (!accounts.length || (!isOpen && !opts.includeCollapsed)) return;
    accounts.forEach((acc, index) => {
      out.push(
        baseRow({
          id: `a:${key}:${str(acc.account_id) || str(acc.account_code) || index}`,
          kind: "account",
          depth: depth + 1,
          label: str(acc.account_name),
          code: str(acc.account_code),
          account_id: str(acc.account_id),
          line_key: key,
          ...amountsOf(acc),
        }),
      );
    });
  };

  for (const node of report.rows) walk(node, 0);
  return out;
}

export function balanceSheetLineKeys(report: ApiFinanceReport | null): string[] {
  const keys: string[] = [];
  const walk = (node: Node) => {
    const kind = str(node.kind);
    if (kind === "line") {
      const accounts = Array.isArray(node.accounts) ? node.accounts : [];
      if (accounts.length) keys.push(str(node.key));
      return;
    }
    for (const child of Array.isArray(node.children) ? (node.children as Node[]) : []) walk(child);
  };
  for (const node of report?.rows ?? []) walk(node);
  return keys;
}

export type BalanceSheetGridHandle = FinanceAgListGridHandle & {
  expandAll: () => void;
  collapseAll: () => void;
};

type Props = {
  report: ApiFinanceReport | null;
  loading?: boolean;
  headerLeftActions?: ReactNode;
  filterBar?: ReactNode;
  summary?: ReactNode;
  footerLeftActions?: (visibleRows: number) => ReactNode;
  csvFileName: string;
  onAccount?: (accountId: string) => void;
};

function rowTone(kind: BalanceSheetRowKind) {
  switch (kind) {
    case "section":
      return "bg-muted/50 font-semibold uppercase tracking-wide text-[11px]";
    case "group":
      return "font-semibold";
    case "total":
      return "font-semibold border-t border-border";
    case "section_total":
      return "font-bold border-t border-border";
    case "grand":
      return "bg-muted/50 font-bold uppercase tracking-wide text-[11px]";
    case "account":
      return "text-muted-foreground";
    default:
      return "";
  }
}

function pct(value: number | null) {
  if (value == null) return "";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export const BalanceSheetGrid = forwardRef<BalanceSheetGridHandle, Props>(function BalanceSheetGrid(
  { report, loading = false, headerLeftActions, filterBar, summary, footerLeftActions, csvFileName, onAccount },
  ref,
) {
  const innerRef = useRef<FinanceAgListGridHandle>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());

  const columnsMeta = useMemo(() => balanceSheetColumnsFromReport(report), [report]);
  const hasCompare = columnsMeta.some((c) => c.key === "compare");
  const rows = useMemo(() => flattenBalanceSheetRows(report, expanded), [report, expanded]);

  // Row + cell click both arrive for one physical click — key the toggle off the rendered snapshot.
  const toggle = useCallback((key: string, currentlyOpen: boolean) => {
    setExpanded((prev) => {
      if (prev.has(key) === !currentlyOpen) return prev;
      const next = new Set(prev);
      if (currentlyOpen) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const expandAll = useCallback(() => setExpanded(new Set(balanceSheetLineKeys(report))), [report]);
  const collapseAll = useCallback(() => setExpanded(new Set()), []);

  const csvHeaders = useMemo(
    () => ["Line", "Code", "Account", ...columnsMeta.map((c) => c.label)],
    [columnsMeta],
  );
  const csvRow = useCallback(
    (row: BalanceSheetRow): Array<string | number> => [
      row.kind === "account" ? "" : `${"  ".repeat(row.depth)}${row.label}`,
      row.code,
      row.kind === "account" ? row.label : "",
      ...columnsMeta.map((c) => {
        const v = row[c.key];
        if (v == null) return "";
        return c.key === "variance_pct" ? pct(v) : v;
      }),
    ],
    [columnsMeta],
  );
  const exportCsv = useCallback(() => {
    const all = flattenBalanceSheetRows(report, expanded, { includeCollapsed: true });
    downloadCsv(csvFileName, csvHeaders, all.map(csvRow));
  }, [report, expanded, csvFileName, csvHeaders, csvRow]);

  useImperativeHandle(
    ref,
    () => ({
      openFilters: () => innerRef.current?.openFilters(),
      openColumns: () => innerRef.current?.openColumns(),
      resetFilters: () => innerRef.current?.resetFilters(),
      exportCsv,
      expandAll,
      collapseAll,
    }),
    [exportCsv, expandAll, collapseAll],
  );

  const columns = useMemo<FinanceAgListGridColumn<BalanceSheetRow>[]>(() => {
    const moneyCol = (meta: BalanceSheetColumnMeta): FinanceAgListGridColumn<BalanceSheetRow> => ({
      colId: meta.key,
      field: meta.key,
      headerName: meta.label,
      width: meta.key === "variance_pct" ? 90 : 150,
      minWidth: meta.key === "variance_pct" ? 70 : 120,
      sortable: false,
      type: "numericColumn" as const,
      headerClass: NUMERIC_HEADER,
      cellClass: (p: { data?: BalanceSheetRow }) => {
        const kind = p.data?.kind ?? "line";
        const v = p.data?.[meta.key];
        return cn(
          NUMERIC_CELL,
          rowTone(kind),
          meta.key === "variance_pct" && v != null && v < 0 && "text-red-600 dark:text-red-400",
          meta.key === "variance_pct" && v != null && v > 0 && "text-emerald-700 dark:text-emerald-400",
        );
      },
      valueFormatter: (p: { value: unknown; data?: BalanceSheetRow }) => {
        const kind = p.data?.kind;
        if (kind === "section" || kind === "group") return "";
        const v = numOrNull(p.value);
        if (meta.key === "variance_pct") {
          // No % when the comparison balance is zero (division by zero) — Odoo shows n/a there too.
          if (v == null) return p.data?.compare != null ? "n/a" : "";
          return pct(v);
        }
        if (v == null) return "";
        return money(v);
      },
    });

    return [
      {
        colId: "label",
        field: "label",
        headerName: "",
        flex: 2,
        minWidth: 280,
        sortable: false,
        cellClass: (p: { data?: BalanceSheetRow }) => rowTone(p.data?.kind ?? "line"),
        cellRenderer: (p: ICellRendererParams<BalanceSheetRow>) => {
          const row = p.data;
          if (!row) return null;
          const indent = { paddingLeft: `${row.depth * 16}px` };
          if (row.kind === "line") {
            const Icon = row.expanded ? ChevronDown : ChevronRight;
            return (
              <span className="inline-flex items-center gap-1" style={indent}>
                {row.expandable ? (
                  <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                ) : (
                  <span className="inline-block h-3.5 w-3.5 shrink-0" aria-hidden />
                )}
                <span>{row.label}</span>
              </span>
            );
          }
          if (row.kind === "account") {
            return (
              <span className="inline-flex items-center gap-2" style={{ paddingLeft: `${row.depth * 16 + 18}px` }}>
                {row.code ? <span className="font-mono text-[11px]">{row.code}</span> : null}
                <span className={cn(row.account_id && "underline decoration-dotted underline-offset-2")}>{row.label}</span>
              </span>
            );
          }
          return (
            <span style={indent}>
              {row.label}
            </span>
          );
        },
      },
      ...columnsMeta.map(moneyCol),
    ];
  }, [columnsMeta]);

  return (
    <FinanceAgListGrid
      gridRef={innerRef}
      storageKey={hasCompare ? "balance-sheet:compare" : "balance-sheet"}
      paginationPageSize={500}
      paginationPageSizeSelector={[100, 200, 500]}
      rows={rows}
      columns={columns as FinanceAgListGridColumn[]}
      loading={loading}
      headerLeftActions={headerLeftActions}
      filterBar={filterBar}
      summary={summary}
      footerLeftActions={footerLeftActions?.(rows.length)}
      emptyTitle="No balance sheet lines"
      emptyHint="Post journal entries to see balances here."
      csvFileName={csvFileName}
      csvHeaders={csvHeaders}
      csvRow={csvRow}
      onRowClicked={(row: BalanceSheetRow) => {
        if (row.kind === "line" && row.expandable) toggle(row.line_key, row.expanded);
        else if (row.kind === "account" && row.account_id) onAccount?.(row.account_id);
      }}
      mobileLine={(row: BalanceSheetRow) => ({
        title: `${"· ".repeat(Math.min(row.depth, 3))}${row.label}`,
        meta: row.code,
        value: row.amount == null ? "" : money(row.amount),
      })}
    />
  );
});
