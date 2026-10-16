"use client";

import "@/components/providers/ag-grid-provider";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateRangePresetPicker } from "@/components/shared/date-range-preset-picker";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FilterSelect } from "@/components/shared/filter-select";
import { GridChipBadge } from "@/components/shared/grid-chip-badge";
import { RowActionsTrigger } from "@/components/shared/row-actions-icon";
import { GridFullscreenHeader } from "@/components/shared/grid-fullscreen";
import { AgainListGrid } from "@/components/shared/again-list-grid";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useUserScopedState } from "@/lib/hooks/use-user-scoped-state";
import type { ApiFinancePayable } from "@/lib/api/finance";
import { fetchPurchaseOrder, type ApiPurchaseOrder } from "@/lib/api/purchase-orders";
import { fetchPurchaseReceipt } from "@/lib/api/purchase-receipts";
import { SupplierDetailDrawer } from "@/components/suppliers/supplier-detail-drawer";
import { PoFormDrawer } from "@/components/suppliers/po-form-drawer";
import { GridRefLink } from "@/components/shared/grid-ref-link";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

async function purchaseOrderForPayable(row: ApiFinancePayable): Promise<ApiPurchaseOrder | null> {
  if (row.source_type === "purchase_receipt") {
    const receipt = await fetchPurchaseReceipt(row.source_id);
    if (!receipt.purchase_order_id) return null;
    return fetchPurchaseOrder(receipt.purchase_order_id);
  }
  try {
    return await fetchPurchaseOrder(row.source_id);
  } catch {
    return null;
  }
}

const NUMERIC_CELL = "ag-right-aligned-cell tabular-nums";
const NUMERIC_HEADER = "ag-right-aligned-header";

const STATUS_TONE: Record<string, string> = {
  open: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  partial: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  paid: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  void: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

const POSTING_TONE: Record<string, string> = {
  posted: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  pending: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  failed: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
};

const COLUMN_KEYS = [
  "reference",
  "supplier",
  "source",
  "dueDate",
  "amount",
  "paid",
  "balance",
  "tax",
  "status",
  "posting",
  "createdAt",
] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  reference: "Reference #",
  supplier: "Supplier",
  source: "Source",
  dueDate: "Due",
  amount: "Amount",
  paid: "Paid",
  balance: "Balance",
  tax: "Tax",
  status: "Status",
  posting: "Posting",
  createdAt: "Created",
};

const DEFAULT_VISIBLE: Record<ColumnKey, boolean> = {
  reference: true,
  supplier: true,
  source: true,
  dueDate: true,
  amount: true,
  paid: false,
  balance: true,
  tax: false,
  status: true,
  posting: false,
  createdAt: false,
};

const FILTER_VISIBILITY_KEYS = ["search", "supplier", "status", "source"] as const;
type FilterVisibilityKey = (typeof FILTER_VISIBILITY_KEYS)[number];

const FILTER_LABELS: Record<FilterVisibilityKey, string> = {
  search: "Search",
  supplier: "Supplier",
  status: "Status",
  source: "Source",
};

const DEFAULT_VISIBLE_FILTERS: Record<FilterVisibilityKey, boolean> = {
  search: true,
  supplier: true,
  status: true,
  source: false,
};

type FilterState = {
  search: string;
  supplierId: string;
  status: string;
  source: string;
  dateFrom: string;
  dateTo: string;
};

const DEFAULT_FILTERS: FilterState = {
  search: "",
  supplierId: "all",
  status: "all",
  source: "all",
  dateFrom: "",
  dateTo: "",
};

function money(value: unknown) {
  const n = Number(value);
  return formatCurrency(Number.isFinite(n) ? n : 0);
}

function sourceLabel(value: string) {
  return value.replace(/_/g, " ");
}

function supplierLabel(row: ApiFinancePayable) {
  return row.supplier_name?.trim() || row.supplier_id;
}


export type PayableGridHandle = {
  openFilters: () => void;
  openColumns: () => void;
  resetFilters: () => void;
  exportCsv: () => void;
};

export const PayableGrid = forwardRef<
  PayableGridHandle,
  {
    rows: ApiFinancePayable[];
    loading?: boolean;
    onSettle: (row: ApiFinancePayable) => void;
    onFilterCountChange?: (count: number) => void;
    headerLeftActions?: ReactNode;
    footerLeftActions?: ReactNode;
    className?: string;
  }
>(function PayableGrid(
  { rows, loading = false, onSettle, onFilterCountChange, headerLeftActions, footerLeftActions, className },
  ref,
) {
  const canWrite = useAdminCanWrite();

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);
  const [supplierDrawerId, setSupplierDrawerId] = useState<string | null>(null);
  const [poOrder, setPoOrder] = useState<ApiPurchaseOrder | null>(null);

  const openSupplierDrawer = useCallback((row: ApiFinancePayable) => {
    if (!row.supplier_id) {
      toast.error("No supplier record for this payable");
      return;
    }
    setSupplierDrawerId(row.supplier_id);
  }, []);

  const openPurchaseOrderDrawer = useCallback(async (row: ApiFinancePayable) => {
    try {
      const order = await purchaseOrderForPayable(row);
      if (!order) {
        toast.error("No purchase order linked to this payable");
        return;
      }
      setPoOrder(order);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open purchase order");
    }
  }, []);
  const [visibleCols, setVisibleCols] = useUserScopedState("finance-payable-grid:columns", DEFAULT_VISIBLE);
  const [visibleFilters, setVisibleFilters] = useUserScopedState(
    "finance-payable-grid:filters",
    DEFAULT_VISIBLE_FILTERS,
  );
  const resolvedCols = useMemo(() => ({ ...DEFAULT_VISIBLE, ...visibleCols }), [visibleCols]);
  const resolvedVisibleFilters = useMemo(
    () => ({ ...DEFAULT_VISIBLE_FILTERS, ...visibleFilters }),
    [visibleFilters],
  );

  const supplierOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) map.set(row.supplier_id, supplierLabel(row));
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const sourceOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) if (row.source_type) set.add(row.source_type);
    return [...set].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filters.supplierId !== "all" && row.supplier_id !== filters.supplierId) return false;
      if (filters.status !== "all" && row.status !== filters.status) return false;
      if (filters.source !== "all" && row.source_type !== filters.source) return false;
      const due = row.due_date ?? "";
      if (filters.dateFrom && due && due < filters.dateFrom) return false;
      if (filters.dateTo && due && due > filters.dateTo) return false;
      if (!q) return true;
      return `${row.reference_number} ${supplierLabel(row)} ${row.source_type} ${row.source_id}`
        .toLowerCase()
        .includes(q);
    });
  }, [rows, filters]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.search.trim()) n += 1;
    if (filters.supplierId !== "all") n += 1;
    if (filters.status !== "all") n += 1;
    if (filters.source !== "all") n += 1;
    if (filters.dateFrom) n += 1;
    if (filters.dateTo) n += 1;
    return n;
  }, [filters]);

  useEffect(() => {
    onFilterCountChange?.(activeFilterCount);
  }, [activeFilterCount, onFilterCountChange]);


  const exportCsv = useCallback(() => {
    const header = COLUMN_KEYS.map((key) => COLUMN_LABELS[key]);
    const body = filtered.map((row) =>
      [
        row.reference_number,
        supplierLabel(row),
        sourceLabel(row.source_type),
        row.due_date ?? "",
        row.amount,
        row.amount_paid,
        row.balance,
        row.tax_amount,
        row.status,
        row.posting_status ?? "",
        row.created_at,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payables-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} payable${filtered.length === 1 ? "" : "s"}`);
  }, [filtered]);

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

  const RowMenu = useCallback(
    ({ data }: { data: ApiFinancePayable }) => {
      const canSettle = canWrite && (data.status === "open" || data.status === "partial");
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <RowActionsTrigger />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {canSettle ? (
              <DropdownMenuItem onClick={() => onSettle(data)}>
                <Wallet className="mr-1.5 h-3 w-3" /> Record payment
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem disabled>No actions</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
    [canWrite, onSettle],
  );

  const columnDefs = useMemo<ColDef<ApiFinancePayable>[]>(
    () => [
      {
        colId: "actions",
        headerName: "",
        width: 26,
        maxWidth: 26,
        minWidth: 26,
        pinned: "left",
        resizable: false,
        sortable: false,
        suppressMovable: true,
        suppressHeaderMenuButton: true,
        suppressSizeToFit: true,
        headerClass: "product-grid-actions-col",
        cellClass: "product-grid-actions-col",
        headerComponent: GridFullscreenHeader,
        cellRenderer: (p: ICellRendererParams<ApiFinancePayable>) =>
          p.data ? <RowMenu data={p.data} /> : null,
      },
      {
        colId: "reference",
        field: "reference_number",
        headerName: COLUMN_LABELS.reference,
        hide: !resolvedCols.reference,
        width: 140,
        minWidth: 120,
        cellClass: "font-medium",
        cellRenderer: (p: ICellRendererParams<ApiFinancePayable>) => {
          const ref = p.data?.reference_number?.trim();
          if (!ref) return "—";
          return (
            <GridRefLink className="font-medium" title={ref} onClick={() => void openPurchaseOrderDrawer(p.data!)}>
              {ref}
            </GridRefLink>
          );
        },
      },
      {
        colId: "supplier",
        headerName: COLUMN_LABELS.supplier,
        hide: !resolvedCols.supplier,
        flex: 1.4,
        minWidth: 160,
        tooltipValueGetter: (p) => (p.data ? supplierLabel(p.data) : ""),
        valueGetter: (p) => (p.data ? supplierLabel(p.data) : ""),
        cellRenderer: (p: ICellRendererParams<ApiFinancePayable>) => {
          const name = p.data ? supplierLabel(p.data) : "";
          if (!name) return "—";
          return (
            <GridRefLink title={name} onClick={() => openSupplierDrawer(p.data!)}>
              {name}
            </GridRefLink>
          );
        },
      },
      {
        colId: "source",
        field: "source_type",
        headerName: COLUMN_LABELS.source,
        hide: !resolvedCols.source,
        width: 130,
        minWidth: 110,
        cellClass: "capitalize text-muted-foreground",
        valueFormatter: (p) => (p.value ? sourceLabel(String(p.value)) : "—"),
      },
      {
        colId: "dueDate",
        field: "due_date",
        headerName: COLUMN_LABELS.dueDate,
        hide: !resolvedCols.dueDate,
        width: 120,
        minWidth: 100,
        valueFormatter: (p) => formatDate(p.value),
      },
      {
        colId: "amount",
        field: "amount",
        headerName: COLUMN_LABELS.amount,
        hide: !resolvedCols.amount,
        width: 120,
        minWidth: 96,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueFormatter: (p) => money(p.value),
      },
      {
        colId: "paid",
        field: "amount_paid",
        headerName: COLUMN_LABELS.paid,
        hide: !resolvedCols.paid,
        width: 120,
        minWidth: 96,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueFormatter: (p) => money(p.value),
      },
      {
        colId: "balance",
        field: "balance",
        headerName: COLUMN_LABELS.balance,
        hide: !resolvedCols.balance,
        width: 120,
        minWidth: 96,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: `${NUMERIC_CELL} font-medium`,
        valueFormatter: (p) => money(p.value),
      },
      {
        colId: "tax",
        field: "tax_amount",
        headerName: COLUMN_LABELS.tax,
        hide: !resolvedCols.tax,
        width: 110,
        minWidth: 88,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueFormatter: (p) => money(p.value),
      },
      {
        colId: "status",
        field: "status",
        headerName: COLUMN_LABELS.status,
        hide: !resolvedCols.status,
        width: 110,
        minWidth: 90,
        cellRenderer: (p: ICellRendererParams<ApiFinancePayable>) => {
          const status = p.data?.status;
          if (!status) return null;
          return (
            <GridChipBadge className={cn("capitalize", STATUS_TONE[status] ?? "")} title={status}>
              {status}
            </GridChipBadge>
          );
        },
      },
      {
        colId: "posting",
        field: "posting_status",
        headerName: COLUMN_LABELS.posting,
        hide: !resolvedCols.posting,
        width: 120,
        minWidth: 96,
        cellRenderer: (p: ICellRendererParams<ApiFinancePayable>) => {
          const posting = p.data?.posting_status;
          if (!posting) return <span className="text-muted-foreground">—</span>;
          return (
            <GridChipBadge className={POSTING_TONE[posting] ?? ""} title={p.data?.posting_error ?? posting}>
              {posting}
            </GridChipBadge>
          );
        },
      },
      {
        colId: "createdAt",
        field: "created_at",
        headerName: COLUMN_LABELS.createdAt,
        hide: !resolvedCols.createdAt,
        width: 120,
        minWidth: 100,
        valueFormatter: (p) => formatDate(p.value),
      },
    ],
    [RowMenu, openPurchaseOrderDrawer, openSupplierDrawer, resolvedCols],
  );


  return (
    <AgainListGrid<ApiFinancePayable>
      className={className}
      rowData={filtered}
      columnDefs={columnDefs}
      loading={loading}
      headerLeftActions={headerLeftActions}
      filterBar={
        <>
          {resolvedVisibleFilters.search && (
            <Input
              placeholder="Search reference, supplier…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="w-[240px] shrink-0 rounded-none"
            />
          )}
          {resolvedVisibleFilters.supplier && (
            <FilterSelect
              value={filters.supplierId}
              onChange={(supplierId) => setFilters((f) => ({ ...f, supplierId }))}
              width="w-[180px]"
              className="shrink-0"
              ariaLabel="Supplier"
              options={[
                { value: "all", label: "All suppliers" },
                ...supplierOptions.map(([value, label]) => ({ value, label })),
              ]}
            />
          )}
          {resolvedVisibleFilters.status && (
            <FilterSelect
              value={filters.status}
              onChange={(status) => setFilters((f) => ({ ...f, status }))}
              width="w-[140px]"
              className="shrink-0"
              ariaLabel="Status"
              options={[
                { value: "all", label: "All statuses" },
                { value: "open", label: "Open" },
                { value: "partial", label: "Partial" },
                { value: "paid", label: "Paid" },
                { value: "void", label: "Void" },
              ]}
            />
          )}
          {resolvedVisibleFilters.source && (
            <FilterSelect
              value={filters.source}
              onChange={(source) => setFilters((f) => ({ ...f, source }))}
              width="w-[150px]"
              className="shrink-0"
              ariaLabel="Source"
              options={[
                { value: "all", label: "All sources" },
                ...sourceOptions.map((value) => ({ value, label: sourceLabel(value) })),
              ]}
            />
          )}
          <DateRangePresetPicker
            value={{ dateFrom: filters.dateFrom, dateTo: filters.dateTo }}
            onChange={(next) => setFilters((f) => ({ ...f, dateFrom: next.dateFrom, dateTo: next.dateTo }))}
            buttonClassName="shrink-0"
          />
          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 rounded-none text-xs"
              onClick={() => setFilters(DEFAULT_FILTERS)}
            >
              Clear
            </Button>
          )}
        </>
      }
      footerLeftActions={footerLeftActions}
      emptyTitle="No payables match your filters"
      onResetFilters={() => setFilters(DEFAULT_FILTERS)}
      onOpenColumns={() => setColumnSheetOpen(true)}
      mobile={
        <div className="divide-y divide-border">
          {filtered.map((row) => (
            <button
              key={row.id}
              type="button"
              className="block w-full px-3 py-2.5 text-left"
              onClick={() => {
                if (canWrite && (row.status === "open" || row.status === "partial")) onSettle(row);
              }}
            >
              <p className="truncate text-sm font-medium">{row.reference_number}</p>
              <p className="text-[11px] text-muted-foreground">{supplierLabel(row)}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {row.status} · {money(row.balance)} due
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
              <label key={key} className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={resolvedVisibleFilters[key]}
                  onChange={(e) =>
                    setVisibleFilters({ ...resolvedVisibleFilters, [key]: e.target.checked })
                  }
                  className="h-3.5 w-3.5 shrink-0 appearance-none rounded-none border border-input bg-background checked:border-primary checked:bg-primary"
                />
                {FILTER_LABELS[key]}
              </label>
            ))}
          </div>
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
              <label key={key} className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={resolvedCols[key]}
                  onChange={(e) => setVisibleCols((v) => ({ ...v, [key]: e.target.checked }))}
                  className="h-3.5 w-3.5 shrink-0 appearance-none rounded-none border border-input bg-background checked:border-primary checked:bg-primary"
                />
                {COLUMN_LABELS[key]}
              </label>
            ))}
          </div>
        </SheetContent>
      </Sheet>
      <SupplierDetailDrawer
        open={Boolean(supplierDrawerId)}
        supplierId={supplierDrawerId}
        onOpenChange={(next) => {
          if (!next) setSupplierDrawerId(null);
        }}
      />
      <PoFormDrawer
        key={poOrder?.id ?? "payable-po"}
        open={Boolean(poOrder)}
        onOpenChange={(next) => {
          if (!next) setPoOrder(null);
        }}
        order={poOrder}
        supplierId={poOrder?.supplier_id}
        supplierName={poOrder?.supplier_name ?? undefined}
      />
    </AgainListGrid>
  );
});
