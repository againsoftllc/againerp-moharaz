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
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateRangePresetPicker } from "@/components/shared/date-range-preset-picker";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FilterSelect } from "@/components/shared/filter-select";
import { GridChipBadge } from "@/components/shared/grid-chip-badge";
import { GridFullscreenHeader } from "@/components/shared/grid-fullscreen";
import { AgainListGrid } from "@/components/shared/again-list-grid";
import { useUserScopedState } from "@/lib/hooks/use-user-scoped-state";
import type { ApiFinancePayment } from "@/lib/api/finance";
import {
  apiSalesOrderToOrder,
  fetchSalesOrder,
  persistSalesOrder,
} from "@/lib/api/sales";
import { fetchPurchaseOrder, type ApiPurchaseOrder } from "@/lib/api/purchase-orders";
import { fetchPurchaseReceipt } from "@/lib/api/purchase-receipts";
import { getCommerceCustomer } from "@/lib/api/commerce-customers";
import type { Customer } from "@/lib/mock-data/customers";
import type { Order } from "@/lib/mock-data/orders";
import { AgainPartnerDrawer } from "@/components/shared/again-partner-drawer";
import { GridRefLink } from "@/components/shared/grid-ref-link";
import { SalesOrderFormDrawer } from "@/components/sales/sales-order-form-drawer";
import { SupplierDetailDrawer } from "@/components/suppliers/supplier-detail-drawer";
import { PoFormDrawer } from "@/components/suppliers/po-form-drawer";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

const NUMERIC_CELL = "ag-right-aligned-cell tabular-nums";
const NUMERIC_HEADER = "ag-right-aligned-header";

const DIRECTION_TONE: Record<string, string> = {
  inbound: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  outbound: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
};

const COLUMN_KEYS = [
  "number",
  "date",
  "method",
  "account",
  "source",
  "direction",
  "amount",
  "reference",
  "party",
  "createdAt",
] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  number: "Payment #",
  date: "Date",
  method: "Method",
  account: "Account",
  source: "Source",
  direction: "Direction",
  amount: "Amount",
  reference: "Reference",
  party: "Party",
  createdAt: "Created",
};

const DEFAULT_VISIBLE: Record<ColumnKey, boolean> = {
  number: true,
  date: true,
  method: true,
  account: true,
  source: true,
  direction: true,
  amount: true,
  reference: false,
  party: true,
  createdAt: false,
};

const FILTER_VISIBILITY_KEYS = ["search", "direction", "method", "source"] as const;
type FilterVisibilityKey = (typeof FILTER_VISIBILITY_KEYS)[number];

const FILTER_LABELS: Record<FilterVisibilityKey, string> = {
  search: "Search",
  direction: "Direction",
  method: "Method",
  source: "Source",
};

const DEFAULT_VISIBLE_FILTERS: Record<FilterVisibilityKey, boolean> = {
  search: true,
  direction: true,
  method: true,
  source: false,
};

type FilterState = {
  search: string;
  direction: string;
  method: string;
  source: string;
  dateFrom: string;
  dateTo: string;
};

const DEFAULT_FILTERS: FilterState = {
  search: "",
  direction: "all",
  method: "all",
  source: "all",
  dateFrom: "",
  dateTo: "",
};

function money(value: unknown) {
  const n = Number(value);
  return formatCurrency(Number.isFinite(n) ? n : 0);
}

function pretty(value: string | null | undefined) {
  if (!value) return "—";
  return value.replace(/_/g, " ");
}

export type PaymentGridHandle = {
  openFilters: () => void;
  openColumns: () => void;
  resetFilters: () => void;
  exportCsv: () => void;
};

export const PaymentGrid = forwardRef<
  PaymentGridHandle,
  {
    rows: ApiFinancePayment[];
    loading?: boolean;
    onFilterCountChange?: (count: number) => void;
    headerLeftActions?: ReactNode;
    footerLeftActions?: ReactNode;
    className?: string;
  }
>(function PaymentGrid(
  { rows, loading = false, onFilterCountChange, headerLeftActions, footerLeftActions, className },
  ref,
) {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);
  const [partnerRecord, setPartnerRecord] = useState<Customer | null>(null);
  const [partnerOpen, setPartnerOpen] = useState(false);
  const [supplierDrawerId, setSupplierDrawerId] = useState<string | null>(null);
  const [salesOrder, setSalesOrder] = useState<Order | null>(null);
  const [salesOrderOpen, setSalesOrderOpen] = useState(false);
  const [poOrder, setPoOrder] = useState<ApiPurchaseOrder | null>(null);
  const [visibleCols, setVisibleCols] = useUserScopedState("finance-payment-grid:columns", DEFAULT_VISIBLE);
  const [visibleFilters, setVisibleFilters] = useUserScopedState(
    "finance-payment-grid:filters",
    DEFAULT_VISIBLE_FILTERS,
  );
  const resolvedCols = useMemo(() => ({ ...DEFAULT_VISIBLE, ...visibleCols }), [visibleCols]);
  const resolvedVisibleFilters = useMemo(
    () => ({ ...DEFAULT_VISIBLE_FILTERS, ...visibleFilters }),
    [visibleFilters],
  );

  const methodOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) if (row.payment_method) set.add(row.payment_method);
    return [...set].sort();
  }, [rows]);

  const sourceOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) if (row.source_type) set.add(row.source_type);
    return [...set].sort();
  }, [rows]);

  const openPartyDrawer = useCallback(async (row: ApiFinancePayment) => {
    if (!row.party_id) {
      toast.error("No party linked to this payment");
      return;
    }
    if (row.party_type === "supplier") {
      setSupplierDrawerId(row.party_id);
      return;
    }
    try {
      setPartnerRecord(await getCommerceCustomer(row.party_id));
      setPartnerOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load customer");
    }
  }, []);

  const openSourceDrawer = useCallback(async (row: ApiFinancePayment) => {
    try {
      if (row.source_type === "sales_order" || row.source_type === "commerce_order") {
        const order = apiSalesOrderToOrder(await fetchSalesOrder(row.source_id));
        setSalesOrder(order);
        setSalesOrderOpen(true);
        return;
      }
      if (row.source_type === "purchase_order") {
        setPoOrder(await fetchPurchaseOrder(row.source_id));
        return;
      }
      if (row.source_type === "purchase_receipt") {
        const receipt = await fetchPurchaseReceipt(row.source_id);
        if (!receipt.purchase_order_id) {
          toast.error("No purchase order linked to this payment");
          return;
        }
        setPoOrder(await fetchPurchaseOrder(receipt.purchase_order_id));
        return;
      }
      toast.error("No document linked to this payment");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open document");
    }
  }, []);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filters.direction !== "all" && row.direction !== filters.direction) return false;
      if (filters.method !== "all" && row.payment_method !== filters.method) return false;
      if (filters.source !== "all" && row.source_type !== filters.source) return false;
      const date = row.payment_date ?? "";
      if (filters.dateFrom && date && date < filters.dateFrom) return false;
      if (filters.dateTo && date && date > filters.dateTo) return false;
      if (!q) return true;
      return `${row.payment_number} ${row.payment_method} ${row.source_type} ${row.source_id} ${row.reference ?? ""} ${row.payment_account_name ?? ""} ${row.party_name ?? ""} ${row.party_type ?? ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [rows, filters]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.search.trim()) n += 1;
    if (filters.direction !== "all") n += 1;
    if (filters.method !== "all") n += 1;
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
        row.payment_number,
        row.payment_date,
        pretty(row.payment_method),
        row.payment_account_name ?? "",
        pretty(row.source_type),
        row.direction,
        row.amount,
        row.reference ?? "",
        row.party_name ?? row.party_type ?? "",
        row.created_at,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} payment${filtered.length === 1 ? "" : "s"}`);
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

  const columnDefs = useMemo<ColDef<ApiFinancePayment>[]>(
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
      },
      {
        colId: "number",
        field: "payment_number",
        headerName: COLUMN_LABELS.number,
        hide: !resolvedCols.number,
        width: 140,
        minWidth: 120,
        cellClass: "font-medium",
      },
      {
        colId: "date",
        field: "payment_date",
        headerName: COLUMN_LABELS.date,
        hide: !resolvedCols.date,
        width: 120,
        minWidth: 100,
        valueFormatter: (p) => formatDate(p.value),
      },
      {
        colId: "method",
        field: "payment_method",
        headerName: COLUMN_LABELS.method,
        hide: !resolvedCols.method,
        width: 130,
        minWidth: 110,
        cellClass: "capitalize",
        valueFormatter: (p) => pretty(p.value),
      },
      {
        colId: "account",
        field: "payment_account_name",
        headerName: COLUMN_LABELS.account,
        hide: !resolvedCols.account,
        flex: 1.2,
        minWidth: 140,
        valueFormatter: (p) => (p.value ? String(p.value) : "—"),
      },
      {
        colId: "source",
        field: "source_type",
        headerName: COLUMN_LABELS.source,
        hide: !resolvedCols.source,
        width: 130,
        minWidth: 110,
        cellClass: "capitalize text-muted-foreground",
        valueFormatter: (p) => pretty(p.value),
      },
      {
        colId: "direction",
        field: "direction",
        headerName: COLUMN_LABELS.direction,
        hide: !resolvedCols.direction,
        width: 110,
        minWidth: 96,
        cellRenderer: (p: ICellRendererParams<ApiFinancePayment>) => {
          const direction = p.data?.direction;
          if (!direction) return null;
          return (
            <GridChipBadge className={cn("capitalize", DIRECTION_TONE[direction] ?? "")} title={direction}>
              {direction}
            </GridChipBadge>
          );
        },
      },
      {
        colId: "amount",
        field: "amount",
        headerName: COLUMN_LABELS.amount,
        hide: !resolvedCols.amount,
        width: 130,
        minWidth: 110,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: `${NUMERIC_CELL} font-medium`,
        cellRenderer: (p: ICellRendererParams<ApiFinancePayment>) => {
          const row = p.data;
          if (!row) return null;
          const inbound = row.direction === "inbound";
          return (
            <span
              className={cn(
                inbound ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
              )}
            >
              {inbound ? "+" : "−"}
              {money(row.amount)}
            </span>
          );
        },
      },
      {
        colId: "reference",
        field: "reference",
        headerName: COLUMN_LABELS.reference,
        hide: !resolvedCols.reference,
        width: 140,
        minWidth: 110,
        cellRenderer: (p: ICellRendererParams<ApiFinancePayment>) => {
          const ref = p.data?.reference?.trim() || p.data?.source_id;
          if (!ref) return "—";
          return (
            <GridRefLink title={ref} onClick={() => void openSourceDrawer(p.data!)}>
              {p.data?.reference?.trim() || pretty(p.data?.source_type)}
            </GridRefLink>
          );
        },
      },
      {
        colId: "party",
        headerName: COLUMN_LABELS.party,
        hide: !resolvedCols.party,
        flex: 1.2,
        minWidth: 140,
        valueGetter: (p) => p.data?.party_name || pretty(p.data?.party_type),
        cellRenderer: (p: ICellRendererParams<ApiFinancePayment>) => {
          const row = p.data;
          if (!row?.party_id) return <span className="text-muted-foreground">—</span>;
          const label = row.party_name?.trim() || pretty(row.party_type);
          return (
            <GridRefLink title={label} onClick={() => void openPartyDrawer(row)}>
              {label}
            </GridRefLink>
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
    [openPartyDrawer, openSourceDrawer, resolvedCols],
  );


  return (
    <AgainListGrid<ApiFinancePayment>
      className={className}
      rowData={filtered}
      columnDefs={columnDefs}
      loading={loading}
      headerLeftActions={headerLeftActions}
      filterBar={
        <>
          {resolvedVisibleFilters.search && (
            <Input
              placeholder="Search payment #, account, reference…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="w-[260px] shrink-0 rounded-none"
            />
          )}
          {resolvedVisibleFilters.direction && (
            <FilterSelect
              value={filters.direction}
              onChange={(direction) => setFilters((f) => ({ ...f, direction }))}
              width="w-[150px]"
              className="shrink-0"
              ariaLabel="Direction"
              options={[
                { value: "all", label: "All directions" },
                { value: "inbound", label: "Inbound" },
                { value: "outbound", label: "Outbound" },
              ]}
            />
          )}
          {resolvedVisibleFilters.method && (
            <FilterSelect
              value={filters.method}
              onChange={(method) => setFilters((f) => ({ ...f, method }))}
              width="w-[150px]"
              className="shrink-0"
              ariaLabel="Method"
              options={[
                { value: "all", label: "All methods" },
                ...methodOptions.map((value) => ({ value, label: pretty(value) })),
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
                ...sourceOptions.map((value) => ({ value, label: pretty(value) })),
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
      emptyTitle="No payments match your filters"
      onResetFilters={() => setFilters(DEFAULT_FILTERS)}
      onOpenColumns={() => setColumnSheetOpen(true)}
      mobile={
        <div className="divide-y divide-border">
          {filtered.map((row) => (
            <div key={row.id} className="px-3 py-2.5">
              <p className="truncate text-sm font-medium">{row.payment_number}</p>
              {row.party_name ? (
                <p className="truncate text-[11px] text-muted-foreground">{row.party_name}</p>
              ) : null}
              <p className="text-[11px] capitalize text-muted-foreground">
                {pretty(row.payment_method)} · {row.direction}
              </p>
              <p
                className={cn(
                  "mt-1 text-[11px] tabular-nums",
                  row.direction === "inbound"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400",
                )}
              >
                {row.direction === "inbound" ? "+" : "−"}
                {money(row.amount)}
              </p>
            </div>
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
      <AgainPartnerDrawer
        open={partnerOpen}
        customer={partnerRecord}
        mode="edit"
        onOpenChange={setPartnerOpen}
      />
      <SupplierDetailDrawer
        open={Boolean(supplierDrawerId)}
        supplierId={supplierDrawerId}
        onOpenChange={(next) => {
          if (!next) setSupplierDrawerId(null);
        }}
      />
      <SalesOrderFormDrawer
        open={salesOrderOpen}
        mode="edit"
        order={salesOrder}
        onOpenChange={(next) => {
          setSalesOrderOpen(next);
          if (!next) setSalesOrder(null);
        }}
        onSave={() => {}}
        onSaveAction={async (order, action) => {
          const saved = await persistSalesOrder(order, action);
          setSalesOrder(saved);
          return saved;
        }}
        onSaved={(saved) => setSalesOrder(saved)}
      />
      <PoFormDrawer
        key={poOrder?.id ?? "payment-po"}
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
