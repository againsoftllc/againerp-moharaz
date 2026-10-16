"use client";

import "@/components/providers/ag-grid-provider";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ColDef, GridApi, ICellRendererParams } from "ag-grid-community";
import { Check, Pencil, Trash2, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FilterSelect } from "@/components/shared/filter-select";
import { GridChipBadge } from "@/components/shared/grid-chip-badge";
import { RowActionsTrigger } from "@/components/shared/row-actions-icon";
import { GridFullscreenHeader } from "@/components/shared/grid-fullscreen";
import { AgainListGrid, NUMERIC_CELL, NUMERIC_HEADER } from "@/components/shared/again-list-grid";
import { useUserScopedState } from "@/lib/hooks/use-user-scoped-state";
import type { ApiExpense, ApiExpenseCategory, ExpenseStatus } from "@/lib/api/expenses";
import { cn, formatCurrency } from "@/lib/utils";

/**
 * Expenses list on the shared AgainListGrid datatable — same shape as the vendor / supplier /
 * purchase-order grids: pinned row-actions + selection columns, user-scoped column chooser and
 * filter toggles, bulk banner, CSV export, mobile list, and an imperative handle for the page header menu.
 */

const COLUMN_KEYS = [
  "number",
  "date",
  "category",
  "payee",
  "description",
  "total",
  "status",
  "method",
  "reference",
  "account",
] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  number: "Expense #",
  date: "Date",
  category: "Category",
  payee: "Paid to",
  description: "Description",
  total: "Total",
  status: "Status",
  method: "Method",
  reference: "Reference",
  account: "GL account",
};

const DEFAULT_VISIBLE: Record<ColumnKey, boolean> = {
  number: true,
  date: true,
  category: true,
  payee: true,
  description: true,
  total: true,
  status: true,
  method: false,
  reference: false,
  account: false,
};

const FILTER_VISIBILITY_KEYS = ["search", "status", "category"] as const;
type FilterVisibilityKey = (typeof FILTER_VISIBILITY_KEYS)[number];

const FILTER_LABELS: Record<FilterVisibilityKey, string> = {
  search: "Search",
  status: "Status",
  category: "Category",
};

const DEFAULT_VISIBLE_FILTERS: Record<FilterVisibilityKey, boolean> = {
  search: true,
  status: true,
  category: true,
};

const STATUS_LABEL: Record<string, string> = {
  paid: "Paid",
  approved: "Approved",
  rejected: "Rejected",
  draft: "Draft",
};

const STATUS_TONE: Record<string, string> = {
  paid: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  approved: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  rejected: "border-border bg-muted/40 text-muted-foreground",
  draft: "border-border text-foreground",
};

function money(value: unknown) {
  const n = Number(value);
  return formatCurrency(Number.isFinite(n) ? n : 0);
}

type FilterState = { search: string; status: ExpenseStatus | "all"; category: string };
const DEFAULT_FILTERS: FilterState = { search: "", status: "all", category: "all" };

export type ExpenseGridHandle = {
  openFilters: () => void;
  openColumns: () => void;
  resetFilters: () => void;
  exportCsv: () => void;
};

type Props = {
  rows: ApiExpense[];
  categories: ApiExpenseCategory[];
  loading?: boolean;
  canEdit?: boolean;
  onFilterCountChange?: (count: number) => void;
  headerLeftActions?: ReactNode;
  footerLeftActions?: ReactNode;
  summary?: ReactNode;
  onRowClick: (expense: ApiExpense) => void;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
  onPayClick: (expense: ApiExpense) => void;
  onDelete: (id: string) => Promise<void>;
};

export const ExpenseGrid = forwardRef<ExpenseGridHandle, Props>(function ExpenseGrid(
  {
    rows,
    categories,
    loading = false,
    canEdit = false,
    onFilterCountChange,
    headerLeftActions,
    footerLeftActions,
    summary,
    onRowClick,
    onApprove,
    onReject,
    onPayClick,
    onDelete,
  },
  ref,
) {
  const gridApiRef = useRef<GridApi<ApiExpense> | null>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ApiExpense[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<ApiExpense[]>([]);
  const [deleting, setDeleting] = useState(false);

  const [visibleCols, setVisibleCols] = useUserScopedState("expense-grid:columns", DEFAULT_VISIBLE);
  const [visibleFilters, setVisibleFilters] = useUserScopedState(
    "expense-grid:filters",
    DEFAULT_VISIBLE_FILTERS,
  );
  const resolvedCols = useMemo(() => ({ ...DEFAULT_VISIBLE, ...visibleCols }), [visibleCols]);
  const resolvedVisibleFilters = useMemo(
    () => ({ ...DEFAULT_VISIBLE_FILTERS, ...visibleFilters }),
    [visibleFilters],
  );

  const categoryOptions = useMemo(
    () => [{ value: "all", label: "All categories" }, ...categories.map((c) => ({ value: c.id, label: c.name }))],
    [categories],
  );
  const categoryName = useCallback(
    (id: string | null | undefined) => categories.find((c) => c.id === id)?.name ?? "",
    [categories],
  );

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filters.status !== "all" && row.status !== filters.status) return false;
      if (filters.category !== "all" && row.category_id !== filters.category) return false;
      if (!q) return true;
      return `${row.expense_number} ${row.payee} ${row.description} ${row.category_name ?? ""} ${row.reference ?? ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [rows, filters]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.search.trim()) n += 1;
    if (filters.status !== "all") n += 1;
    if (filters.category !== "all") n += 1;
    return n;
  }, [filters]);

  useEffect(() => {
    onFilterCountChange?.(activeFilterCount);
  }, [activeFilterCount, onFilterCountChange]);

  async function run(id: string, action: (id: string) => Promise<void>, successMsg: string) {
    setBusyId(id);
    try {
      await action(id);
      toast.success(successMsg);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  const openDeleteConfirm = useCallback((targets: ApiExpense[]) => {
    const drafts = targets.filter((t) => t.status === "draft");
    if (!drafts.length) {
      toast.error("Only draft expenses can be deleted");
      return;
    }
    setDeleteTargets(drafts);
    setDeleteOpen(true);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteTargets.length) return;
    setDeleting(true);
    try {
      let done = 0;
      for (const target of deleteTargets) {
        await onDelete(target.id);
        done += 1;
      }
      toast.success(`Deleted ${done} expense${done === 1 ? "" : "s"}`);
      setDeleteOpen(false);
      setSelected([]);
      gridApiRef.current?.deselectAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }, [deleteTargets, onDelete]);

  const exportCsv = useCallback(() => {
    const source = selected.length ? selected : filtered;
    const header = ["Expense #", "Date", "Category", "Paid to", "Description", "Total", "Status"];
    const body = source.map((row) =>
      [
        row.expense_number,
        row.expense_date,
        row.category_name ?? categoryName(row.category_id),
        row.payee,
        row.description,
        row.total,
        row.status,
      ]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `expenses-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${source.length} expense${source.length === 1 ? "" : "s"}`);
  }, [selected, filtered, categoryName]);

  useImperativeHandle(
    ref,
    () => ({
      openFilters: () => setFilterSheetOpen(true),
      openColumns: () => setColumnSheetOpen(true),
      resetFilters: () => setFilters(DEFAULT_FILTERS),
      exportCsv,
    }),
    [exportCsv],
  );

  const ExpenseRowMenu = useCallback(
    ({ data }: { data: ApiExpense }) => {
      const busy = busyId === data.id;
      const canEditRow = data.status === "draft" || data.status === "approved";
      const canApprove = data.status === "draft";
      const canPay = data.status === "approved";
      const canReject = data.status === "approved";
      const canDeleteRow = data.status === "draft";
      if (!canEditRow && !canApprove && !canPay && !canReject && !canDeleteRow) return null;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <RowActionsTrigger disabled={busy} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {canEditRow ? (
              <DropdownMenuItem onClick={() => onRowClick(data)}>
                <Pencil className="mr-1.5 h-3 w-3" /> Edit
              </DropdownMenuItem>
            ) : null}
            {canApprove ? (
              <DropdownMenuItem onClick={() => void run(data.id, onApprove, "Expense approved")}>
                <Check className="mr-1.5 h-3 w-3" /> Approve
              </DropdownMenuItem>
            ) : null}
            {canPay ? (
              <DropdownMenuItem onClick={() => onPayClick(data)}>
                <Wallet className="mr-1.5 h-3 w-3" /> Mark paid
              </DropdownMenuItem>
            ) : null}
            {canReject ? (
              <DropdownMenuItem onClick={() => void run(data.id, onReject, "Expense rejected")}>
                <X className="mr-1.5 h-3 w-3" /> Reject
              </DropdownMenuItem>
            ) : null}
            {canDeleteRow ? (
              <DropdownMenuItem className="text-destructive" onClick={() => openDeleteConfirm([data])}>
                <Trash2 className="mr-1.5 h-3 w-3" /> Delete
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
    [busyId, onApprove, onPayClick, onReject, onRowClick, openDeleteConfirm],
  );

  const columnDefs = useMemo<ColDef<ApiExpense>[]>(
    () => [
      {
        colId: "actions",
        headerName: "",
        width: 26,
        maxWidth: 26,
        minWidth: 26,
        pinned: "left",
        resizable: false,
        suppressMovable: true,
        suppressHeaderMenuButton: true,
        suppressSizeToFit: true,
        sortable: false,
        headerClass: "product-grid-actions-col",
        cellClass: "product-grid-actions-col",
        headerComponent: GridFullscreenHeader,
        cellRenderer: (p: ICellRendererParams<ApiExpense>) =>
          canEdit && p.data ? <ExpenseRowMenu data={p.data} /> : null,
      },
      {
        colId: "controls",
        headerName: "",
        headerCheckboxSelection: canEdit,
        checkboxSelection: canEdit,
        width: canEdit ? 40 : 24,
        maxWidth: canEdit ? 40 : 24,
        minWidth: canEdit ? 40 : 24,
        pinned: "left",
        resizable: false,
        suppressMovable: true,
        suppressHeaderMenuButton: true,
        suppressSizeToFit: true,
        sortable: false,
        headerClass: "product-grid-controls-col",
        cellClass: "product-grid-controls-col",
      },
      {
        colId: "number",
        field: "expense_number",
        headerName: COLUMN_LABELS.number,
        hide: !resolvedCols.number,
        pinned: "left",
        width: 130,
        minWidth: 110,
        cellClass: "font-mono text-[11px] font-medium",
        cellRenderer: (p: ICellRendererParams<ApiExpense>) =>
          p.data ? (
            <button
              type="button"
              className="block w-full cursor-pointer truncate text-left font-semibold text-foreground no-underline hover:text-primary hover:no-underline focus-visible:outline-none"
              title={p.data.expense_number}
              onClick={(e) => {
                e.stopPropagation();
                onRowClick(p.data!);
              }}
            >
              {p.data.expense_number}
            </button>
          ) : null,
      },
      {
        colId: "date",
        field: "expense_date",
        headerName: COLUMN_LABELS.date,
        hide: !resolvedCols.date,
        width: 110,
        minWidth: 96,
      },
      {
        colId: "category",
        field: "category_name",
        headerName: COLUMN_LABELS.category,
        hide: !resolvedCols.category,
        width: 140,
        minWidth: 110,
        valueFormatter: (p) => (p.value ? String(p.value) : "—"),
      },
      {
        colId: "payee",
        field: "payee",
        headerName: COLUMN_LABELS.payee,
        hide: !resolvedCols.payee,
        flex: 1.1,
        minWidth: 140,
      },
      {
        colId: "description",
        field: "description",
        headerName: COLUMN_LABELS.description,
        hide: !resolvedCols.description,
        flex: 1.4,
        minWidth: 160,
        tooltipField: "description",
        valueFormatter: (p) => (p.value ? String(p.value) : "—"),
      },
      {
        colId: "total",
        field: "total",
        headerName: COLUMN_LABELS.total,
        hide: !resolvedCols.total,
        width: 120,
        minWidth: 100,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: `${NUMERIC_CELL} font-medium`,
        valueFormatter: (p) => money(p.value),
      },
      {
        colId: "status",
        field: "status",
        headerName: COLUMN_LABELS.status,
        hide: !resolvedCols.status,
        width: 110,
        minWidth: 90,
        cellRenderer: (p: ICellRendererParams<ApiExpense>) => {
          const status = p.data?.status;
          if (!status) return null;
          return (
            <GridChipBadge className={STATUS_TONE[status] ?? ""} title={STATUS_LABEL[status] ?? status}>
              {STATUS_LABEL[status] ?? status}
            </GridChipBadge>
          );
        },
      },
      {
        colId: "method",
        field: "payment_method",
        headerName: COLUMN_LABELS.method,
        hide: !resolvedCols.method,
        width: 120,
        minWidth: 90,
        cellClass: "capitalize text-muted-foreground",
        valueFormatter: (p) => (p.value ? String(p.value).replace(/_/g, " ") : "—"),
      },
      {
        colId: "reference",
        field: "reference",
        headerName: COLUMN_LABELS.reference,
        hide: !resolvedCols.reference,
        width: 130,
        minWidth: 100,
        valueFormatter: (p) => (p.value ? String(p.value) : "—"),
      },
      {
        colId: "account",
        headerName: COLUMN_LABELS.account,
        hide: !resolvedCols.account,
        width: 160,
        minWidth: 120,
        valueGetter: (p) =>
          p.data?.account_code ? `${p.data.account_code} ${p.data.account_name ?? ""}`.trim() : "—",
      },
    ],
    [ExpenseRowMenu, canEdit, onRowClick, resolvedCols],
  );

  return (
    <AgainListGrid<ApiExpense>
      rowData={filtered}
      columnDefs={columnDefs}
      loading={loading}
      headerLeftActions={headerLeftActions}
      summary={summary}
      filterBar={
        <>
          {resolvedVisibleFilters.search ? (
            <Input
              placeholder="Search payee, description, expense #…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="w-[240px] shrink-0 rounded-none"
            />
          ) : null}
          {resolvedVisibleFilters.status ? (
            <FilterSelect
              value={filters.status}
              onChange={(next) => setFilters((f) => ({ ...f, status: next as ExpenseStatus | "all" }))}
              width="w-[130px]"
              className="shrink-0"
              ariaLabel="Status"
              options={[
                { value: "all", label: "All statuses" },
                { value: "draft", label: "Draft" },
                { value: "approved", label: "Approved" },
                { value: "paid", label: "Paid" },
                { value: "rejected", label: "Rejected" },
              ]}
            />
          ) : null}
          {resolvedVisibleFilters.category ? (
            <FilterSelect
              value={filters.category}
              onChange={(category) => setFilters((f) => ({ ...f, category }))}
              width="w-[160px]"
              className="shrink-0"
              ariaLabel="Category"
              options={categoryOptions}
            />
          ) : null}
          {activeFilterCount > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 rounded-none text-xs"
              onClick={() => setFilters(DEFAULT_FILTERS)}
            >
              Clear
            </Button>
          ) : null}
        </>
      }
      banner={
        selected.length > 0 ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-2 py-1.5">
            <span className="text-xs font-medium">{selected.length} selected</span>
            <Button variant="outline" size="sm" className="rounded-none" onClick={exportCsv}>
              Export selected
            </Button>
            {canEdit ? (
              <Button
                variant="destructive"
                size="sm"
                className="rounded-none"
                onClick={() => openDeleteConfirm(selected)}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete selected
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 w-7 rounded-none p-0"
              onClick={() => {
                setSelected([]);
                gridApiRef.current?.deselectAll();
              }}
              aria-label="Clear selection"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : null
      }
      footerLeftActions={footerLeftActions}
      emptyTitle="No expenses match your filters"
      emptyHint="Try a different search or status."
      onResetFilters={() => setFilters(DEFAULT_FILTERS)}
      onOpenColumns={() => setColumnSheetOpen(true)}
      onRowClicked={onRowClick}
      apiRef={gridApiRef}
      gridProps={{
        rowSelection: "multiple",
        suppressRowClickSelection: true,
        onSelectionChanged: (e) => setSelected(e.api.getSelectedRows()),
      }}
      mobile={
        <div className="divide-y divide-border">
          {filtered.map((row) => (
            <button
              key={row.id}
              type="button"
              className="block w-full px-3 py-2.5 text-left"
              onClick={() => onRowClick(row)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm font-medium">{row.expense_number}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {row.payee} · {row.expense_date}
                  </p>
                </div>
                <GridChipBadge className={cn("shrink-0", STATUS_TONE[row.status] ?? "")}>
                  {STATUS_LABEL[row.status] ?? row.status}
                </GridChipBadge>
              </div>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">
                {row.description || "No description"} · {money(row.total)}
              </p>
            </button>
          ))}
        </div>
      }
    >
      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent
          side="right"
          title="Filters"
          resizable
          closeButton="inside"
          className="w-[180px] min-w-[160px] max-w-[720px] gap-2 rounded-none p-3"
        >
          <h2 className="border-b border-border pb-2 pr-8 text-sm font-semibold">Filters</h2>
          <div className="mt-1 flex-1 space-y-1.5 overflow-y-auto">
            {FILTER_VISIBILITY_KEYS.map((key) => (
              <label key={key} className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={resolvedVisibleFilters[key]}
                  onChange={(e) => setVisibleFilters({ ...resolvedVisibleFilters, [key]: e.target.checked })}
                  className="h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none rounded-none border border-input bg-background checked:border-primary checked:bg-primary"
                />
                {FILTER_LABELS[key]}
              </label>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 h-7 rounded-none text-xs"
            onClick={() => setVisibleFilters(DEFAULT_VISIBLE_FILTERS)}
          >
            Reset filters
          </Button>
        </SheetContent>
      </Sheet>

      <Sheet open={columnSheetOpen} onOpenChange={setColumnSheetOpen}>
        <SheetContent
          side="right"
          title="Columns"
          resizable
          closeButton="inside"
          className="w-[180px] min-w-[160px] max-w-[720px] gap-2 rounded-none p-3"
        >
          <h2 className="border-b border-border pb-2 pr-8 text-sm font-semibold">Columns</h2>
          <div className="mt-1 flex-1 space-y-1.5 overflow-y-auto">
            {COLUMN_KEYS.map((key) => (
              <label key={key} className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={resolvedCols[key]}
                  onChange={(e) => setVisibleCols({ ...resolvedCols, [key]: e.target.checked })}
                  className="h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none rounded-none border border-input bg-background checked:border-primary checked:bg-primary"
                />
                {COLUMN_LABELS[key]}
              </label>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 h-7 rounded-none text-xs"
            onClick={() => setVisibleCols(DEFAULT_VISIBLE)}
          >
            Reset columns
          </Button>
        </SheetContent>
      </Sheet>

      <Dialog.Root
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!deleting) setDeleteOpen(open);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(400px,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-none border border-input bg-background p-6 shadow-xl">
            <Dialog.Title className="text-base font-semibold">
              {deleteTargets.length === 1 ? "Delete expense?" : "Delete expenses?"}
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              {deleteTargets.length === 1
                ? `${deleteTargets[0]?.expense_number} will be permanently deleted.`
                : `${deleteTargets.length} draft expenses will be permanently deleted.`}
            </Dialog.Description>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-none"
                disabled={deleting}
                onClick={() => setDeleteOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="rounded-none"
                disabled={deleting}
                onClick={() => void confirmDelete()}
              >
                {deleting ? "Deleting…" : "Delete permanently"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </AgainListGrid>
  );
});
