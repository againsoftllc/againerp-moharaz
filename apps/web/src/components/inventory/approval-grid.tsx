"use client";

import "@/components/providers/ag-grid-provider";
import { forwardRef, useEffect, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import type { ICellRendererParams } from "ag-grid-community";
import { FolderOpen } from "lucide-react";
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
import { GridRefLink } from "@/components/shared/grid-ref-link";
import { RowActionsTrigger } from "@/components/shared/row-actions-icon";
import {
  FinanceAgListGrid,
  NUMERIC_CELL,
  NUMERIC_HEADER,
  type FinanceAgListGridColumn,
  type FinanceAgListGridHandle,
} from "@/components/finance/finance-ag-list-grid";
import {
  APPROVAL_STATUS_LABEL,
  type ApprovalGroupKey,
  type ApprovalRequest,
  type ApprovalStatus,
  type ApprovalSummary,
} from "@/lib/api/approvals";
import { apiDate, waitingFor } from "@/lib/approvals/format";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";

type Filters = {
  search: string;
  status: string;
  group: string;
  type: string;
  requester: string;
  scope: string;
};
// the work queue first: what is waiting
const DEFAULT_FILTERS: Filters = { search: "", status: "pending", group: "all", type: "all", requester: "all", scope: "all" };

const FILTER_TOGGLES = [
  { key: "search", label: "Search" },
  { key: "status", label: "Status" },
  { key: "group", label: "Group" },
  { key: "type", label: "Type" },
  { key: "requester", label: "Requested by" },
  { key: "scope", label: "Show" },
];

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

/** Squared chip tones (docs/common/datatablecommon.md §3.3): warning = waiting, success = done, muted = closed. */
const STATUS_TONE: Record<ApprovalStatus, string> = {
  pending: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  approving: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  approved: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  rejected: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
  cancelled: "border-border bg-muted/40 text-muted-foreground",
};

/** "approving" is still waiting as far as filters go. */
const statusBucket = (status: ApprovalStatus) => (status === "approving" ? "pending" : status);
const amountOf = (row: ApprovalRequest) => (row.amount == null || row.amount === "" ? null : Number(row.amount));

export type ApprovalGridHandle = FinanceAgListGridHandle;

type GridProps = ComponentProps<typeof FinanceAgListGrid>;

type Props = {
  rows: ApprovalRequest[];
  summary: ApprovalSummary | null;
  loading?: boolean;
  /** The request a button is working on now (its buttons are disabled). */
  busyId?: string | null;
  onApprove: (row: ApprovalRequest) => void;
  onReject: (row: ApprovalRequest) => void;
  onCancel: (row: ApprovalRequest) => void;
  headerLeftActions?: ReactNode;
  /** A row (or its reference) was clicked: open the document in its own drawer to cross-check it. */
  onOpen: (row: ApprovalRequest) => void;
  onFilterCountChange?: (count: number) => void;
  className?: string;
};

function SummaryStat({ label, value, active, tone, onClick }: { label: string; value: number; active?: boolean; tone?: "warn"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn("flex items-center gap-1.5 px-2 hover:bg-muted/60", active && "bg-muted font-medium")}
    >
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-semibold tabular-nums", tone === "warn" && value > 0 && "text-amber-600 dark:text-amber-400")}>{value}</span>
    </button>
  );
}

/**
 * Inventory › Approve as the common datatable (docs/common/datatablecommon.md): the requests held for an approver, with the
 * pinned actions column, Columns / Filters drawers and export of every list. A row opens the request in a drawer; a document
 * reference opens that document.
 */
export const ApprovalGrid = forwardRef<ApprovalGridHandle, Props>(function ApprovalGrid(
  { rows, summary, loading, busyId = null, onApprove, onReject, onCancel, headerLeftActions, onOpen, onFilterCountChange, className },
  ref,
) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  const types = useMemo(() => [...new Set(rows.map((r) => r.label))].sort(), [rows]);
  const requesters = useMemo(() => [...new Set(rows.map((r) => r.requested_by_name).filter(Boolean))].sort(), [rows]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filters.status !== "all" && statusBucket(row.status) !== filters.status) return false;
      if (filters.group !== "all" && row.group_key !== filters.group) return false;
      if (filters.type !== "all" && row.label !== filters.type) return false;
      if (filters.requester !== "all" && row.requested_by_name !== filters.requester) return false;
      if (filters.scope === "waiting" && !row.can_decide) return false;
      if (filters.scope === "mine" && !row.is_mine) return false;
      if (!q) return true;
      return `${row.label} ${row.group_label} ${row.reference ?? ""} ${row.party ?? ""} ${row.requested_by_name} ${row.summary ?? ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [rows, filters]);

  const activeFilters =
    Number(Boolean(filters.search.trim())) +
    Number(filters.status !== DEFAULT_FILTERS.status) +
    Number(filters.group !== "all") +
    Number(filters.type !== "all") +
    Number(filters.requester !== "all") +
    Number(filters.scope !== "all");

  useEffect(() => {
    onFilterCountChange?.(activeFilters);
  }, [activeFilters, onFilterCountChange]);

  const rowActions = useMemo(
    () =>
      function RowActions(row: ApprovalRequest) {
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <RowActionsTrigger />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => onOpen(row)}>
                <FolderOpen className="mr-1.5 h-3 w-3" /> Open {row.reference ?? row.label}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    [onOpen],
  );

  const columns = useMemo<FinanceAgListGridColumn<ApprovalRequest>[]>(
    () => [
      {
        // Approve / Reject right where the row starts, so a request is decided from the list itself
        colId: "decide",
        headerName: "Action",
        width: 150,
        minWidth: 130,
        sortable: false,
        cellRenderer: (p: ICellRendererParams<ApprovalRequest>) => {
          const row = p.data;
          if (!row) return null;
          const busy = busyId === row.id;
          const stop = (fn: () => void) => (e: React.MouseEvent) => {
            e.stopPropagation(); // a button must not also open the row
            fn();
          };
          if (row.can_decide) {
            return (
              <div className="flex h-full items-center gap-1">
                <Button size="sm" className="h-5 rounded-none bg-emerald-600 px-2 text-white hover:bg-emerald-700" disabled={busy} onClick={stop(() => onApprove(row))}>
                  {busy ? "Working…" : "Approve"}
                </Button>
                <Button size="sm" className="h-5 rounded-none bg-red-600 px-2 text-white hover:bg-red-700" disabled={busy} onClick={stop(() => onReject(row))}>
                  Reject
                </Button>
              </div>
            );
          }
          // an order edit request is decided by an approver; it has no "cancel"
          if (row.is_mine && row.status === "pending" && row.action_key !== "sales.order_edit") {
            return (
              <div className="flex h-full items-center">
                <Button size="sm" variant="outline" className="h-5 rounded-none px-2" disabled={busy} onClick={stop(() => onCancel(row))}>
                  Cancel request
                </Button>
              </div>
            );
          }
          return null;
        },
      },
      {
        colId: "type",
        field: "label",
        headerName: "Type",
        width: 150,
        minWidth: 110,
        cellClass: "font-medium",
        tooltipValueGetter: (p) => (p.data ? `${p.data.label} · ${p.data.group_label}` : ""),
      },
      {
        colId: "reference",
        field: "reference",
        headerName: "Reference",
        width: 140,
        minWidth: 100,
        cellRenderer: (p: ICellRendererParams<ApprovalRequest>) => {
          const row = p.data;
          if (!row?.reference) return "—";
          return (
            <GridRefLink title={`Open ${row.reference}`} onClick={() => onOpen(row)}>
              {row.reference}
            </GridRefLink>
          );
        },
      },
      { colId: "party", field: "party", headerName: "Party", flex: 1, minWidth: 150, valueFormatter: (p) => p.value || "—" },
      { colId: "requester", field: "requested_by_name", headerName: "Requested by", width: 140, minWidth: 100 },
      {
        colId: "requested",
        field: "requested_at",
        headerName: "Requested",
        width: 160,
        minWidth: 120,
        sort: "desc",
        // the API sends naive UTC timestamps: read them as UTC, show them in the company's time
        valueGetter: (p) => (p.data ? (apiDate(p.data.requested_at)?.getTime() ?? 0) : 0),
        valueFormatter: (p) => (p.value ? formatDateTime(new Date(p.value)) : "—"),
      },
      {
        colId: "waiting",
        headerName: "Waiting",
        width: 90,
        minWidth: 70,
        valueGetter: (p) => (p.data && p.data.status === "pending" ? waitingFor(p.data.requested_at) : "—"),
      },
      {
        colId: "amount",
        field: "amount",
        headerName: "Amount",
        width: 120,
        minWidth: 90,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueGetter: (p) => (p.data ? amountOf(p.data) : null),
        valueFormatter: (p) => (p.value == null ? "—" : formatCurrency(Number(p.value))),
      },
      {
        colId: "status",
        field: "status",
        headerName: "Status",
        width: 110,
        minWidth: 90,
        cellRenderer: (p: ICellRendererParams<ApprovalRequest>) =>
          p.data ? (
            <div className="flex h-full items-center overflow-hidden" title={p.data.last_error ?? p.data.decision_note ?? undefined}>
              <GridChipBadge className={cn("shrink-0 leading-4", STATUS_TONE[p.data.status])}>
                {APPROVAL_STATUS_LABEL[p.data.status]}
              </GridChipBadge>
            </div>
          ) : null,
      },
      { colId: "details", field: "summary", headerName: "Details", flex: 1.4, minWidth: 220, tooltipField: "summary", valueFormatter: (p) => p.value || "—" },
      { colId: "group", field: "group_label", headerName: "Group", width: 140, hide: true },
      { colId: "decidedBy", field: "decided_by_name", headerName: "Decided by", width: 140, hide: true, valueFormatter: (p) => p.value || "—" },
      {
        colId: "decidedAt",
        field: "decided_at",
        headerName: "Decided",
        width: 160,
        hide: true,
        valueFormatter: (p) => (p.value ? formatDateTime(apiDate(p.value) ?? p.value) : "—"),
      },
      { colId: "note", field: "decision_note", headerName: "Decision note", flex: 1, minWidth: 160, hide: true, valueFormatter: (p) => p.value || "—" },
    ],
    [onOpen, busyId, onApprove, onReject, onCancel],
  );

  const total = filtered.reduce((sum, row) => sum + (amountOf(row) ?? 0), 0);
  const waitingForMe = summary ? (summary.can_approve_any ? summary.pending_for_me : summary.my_pending) : 0;

  return (
    <FinanceAgListGrid
      className={className}
      gridRef={ref}
      storageKey="approvals"
      rows={filtered}
      columns={columns as unknown as FinanceAgListGridColumn[]}
      loading={loading}
      headerLeftActions={headerLeftActions}
      rowActions={rowActions as unknown as GridProps["rowActions"]}
      onRowClicked={(row) => onOpen(row as ApprovalRequest)}
      onResetFilters={() => setFilters(DEFAULT_FILTERS)}
      filterToggles={FILTER_TOGGLES}
      summary={
        summary ? (
          <div className="flex items-center divide-x divide-border border-b border-border bg-muted/20 py-1 text-[11px]" data-approval-summary>
            <SummaryStat
              label={summary.can_approve_any ? "Waiting for you" : "Your pending"}
              value={waitingForMe}
              tone="warn"
              active={filters.status === "pending" && filters.scope === (summary.can_approve_any ? "waiting" : "mine") && filters.group === "all"}
              onClick={() => setFilters({ ...DEFAULT_FILTERS, scope: summary.can_approve_any ? "waiting" : "mine" })}
            />
            {summary.groups.map((g) => (
              <SummaryStat
                key={g.key}
                label={g.label}
                value={g.pending}
                active={filters.status === "pending" && filters.group === g.key}
                onClick={() => setFilters({ ...DEFAULT_FILTERS, group: filters.group === g.key ? "all" : (g.key as ApprovalGroupKey) })}
              />
            ))}
          </div>
        ) : null
      }
      footerLeftActions={
        <span className="px-2 text-[10px] text-muted-foreground">
          {filtered.length} shown{total ? ` · ${formatCurrency(total)}` : ""}
        </span>
      }
      emptyTitle={rows.length === 0 ? "Nothing is waiting for approval" : "No requests match your filters"}
      emptyHint={
        rows.length === 0
          ? "Finalizing actions sent by people without the Approve permission appear here."
          : "Clear a filter to see more."
      }
      csvFileName={`approvals-${new Date().toISOString().slice(0, 10)}.csv`}
      csvHeaders={["Type", "Group", "Reference", "Party", "Requested by", "Requested", "Amount", "Status", "Decided by", "Details"]}
      csvRow={(row: ApprovalRequest) => [
        row.label,
        row.group_label,
        row.reference ?? "",
        row.party ?? "",
        row.requested_by_name,
        row.requested_at,
        amountOf(row) ?? "",
        APPROVAL_STATUS_LABEL[row.status],
        row.decided_by_name ?? "",
        row.summary ?? "",
      ]}
      mobileLine={(row: ApprovalRequest) => ({
        title: `${row.label}${row.reference ? ` · ${row.reference}` : ""}`,
        meta: `${row.party ?? row.requested_by_name} · ${APPROVAL_STATUS_LABEL[row.status]}`,
        value: amountOf(row) == null ? "" : formatCurrency(amountOf(row) as number),
      })}
      filterBar={(visible) => (
        <>
          {visible.search !== false ? (
            <Input
              placeholder="Search reference, party, requester…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="w-[240px] shrink-0 rounded-none"
            />
          ) : null}
          {visible.status !== false ? (
            <FilterSelect
              value={filters.status}
              onChange={(status) => setFilters((f) => ({ ...f, status }))}
              width="w-[130px]"
              className="shrink-0"
              ariaLabel="Status"
              options={STATUS_FILTER_OPTIONS}
            />
          ) : null}
          {visible.group !== false ? (
            <FilterSelect
              value={filters.group}
              onChange={(group) => setFilters((f) => ({ ...f, group }))}
              width="w-[160px]"
              className="shrink-0"
              ariaLabel="Group"
              options={[{ value: "all", label: "All groups" }, ...(summary?.groups ?? []).map((g) => ({ value: g.key, label: g.label }))]}
            />
          ) : null}
          {visible.type !== false ? (
            <FilterSelect
              value={filters.type}
              onChange={(type) => setFilters((f) => ({ ...f, type }))}
              width="w-[160px]"
              className="shrink-0"
              ariaLabel="Type"
              searchThreshold={8}
              options={[{ value: "all", label: "All types" }, ...types.map((t) => ({ value: t, label: t }))]}
            />
          ) : null}
          {visible.requester !== false ? (
            <FilterSelect
              value={filters.requester}
              onChange={(requester) => setFilters((f) => ({ ...f, requester }))}
              width="w-[160px]"
              className="shrink-0"
              ariaLabel="Requested by"
              searchThreshold={8}
              options={[{ value: "all", label: "All requesters" }, ...requesters.map((r) => ({ value: r, label: r }))]}
            />
          ) : null}
          {visible.scope !== false ? (
            <FilterSelect
              value={filters.scope}
              onChange={(scope) => setFilters((f) => ({ ...f, scope }))}
              width="w-[150px]"
              className="shrink-0"
              ariaLabel="Show"
              options={[
                { value: "all", label: "All requests" },
                ...(summary?.can_approve_any ? [{ value: "waiting", label: "Waiting for me" }] : []),
                { value: "mine", label: "My requests" },
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
