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
import { CheckCircle2, Scale, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateRangePresetPicker } from "@/components/shared/date-range-preset-picker";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FilterSelect } from "@/components/shared/filter-select";
import { GridChipBadge } from "@/components/shared/grid-chip-badge";
import { RowActionsTrigger } from "@/components/shared/row-actions-icon";
import { GridFullscreenHeader } from "@/components/shared/grid-fullscreen";
import { AgainListGrid, NUMERIC_CELL, NUMERIC_HEADER } from "@/components/shared/again-list-grid";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useUserScopedState } from "@/lib/hooks/use-user-scoped-state";
import { formatCurrency } from "@/lib/utils";
import {
  BILL_STATUS_LABELS,
  MATCH_STATUS_LABELS,
  billSupplierName,
  type BillStatus,
  type MatchStatus,
  type VendorBill,
} from "@/lib/mock-data/purchase-bills";
import type { Supplier } from "@/lib/mock-data/suppliers";
import { fetchPurchaseOrder, type ApiPurchaseOrder } from "@/lib/api/purchase-orders";
import { GridRefLink } from "@/components/shared/grid-ref-link";
import { SupplierDetailDrawer } from "@/components/suppliers/supplier-detail-drawer";
import { PoFormDrawer } from "@/components/suppliers/po-form-drawer";

const STATUS_TONE: Record<BillStatus, string> = {
  draft: "border-muted-foreground/30 bg-muted text-muted-foreground",
  unmatched: "border-muted-foreground/30 bg-muted text-muted-foreground",
  matched: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  exception: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  approved: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  posted: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  paid: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  cancelled: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
};

const MATCH_TONE: Record<MatchStatus, string> = {
  unmatched: "border-muted-foreground/30 bg-muted text-muted-foreground",
  partial_match: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  matched: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  exception: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
};

const COLUMN_KEYS = [
  "supplier",
  "number",
  "invoice",
  "poNumber",
  "receiptNumber",
  "match",
  "total",
  "billDate",
  "dueDate",
  "status",
] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  supplier: "Supplier",
  number: "Bill No",
  invoice: "Invoice",
  poNumber: "PO",
  receiptNumber: "Receipt",
  match: "Match",
  total: "Total",
  billDate: "Bill Date",
  dueDate: "Due Date",
  status: "Status",
};

const DEFAULT_VISIBLE: Record<ColumnKey, boolean> = {
  supplier: true,
  number: true,
  invoice: true,
  poNumber: true,
  receiptNumber: false,
  match: true,
  total: true,
  billDate: true,
  dueDate: false,
  status: true,
};

const FILTER_VISIBILITY_KEYS = ["search", "supplier", "status", "match"] as const;
type FilterVisibilityKey = (typeof FILTER_VISIBILITY_KEYS)[number];

const FILTER_LABELS: Record<FilterVisibilityKey, string> = {
  search: "Search",
  supplier: "Supplier",
  status: "Status",
  match: "Match",
};

const DEFAULT_VISIBLE_FILTERS: Record<FilterVisibilityKey, boolean> = {
  search: true,
  supplier: true,
  status: true,
  match: false,
};

type FilterState = {
  search: string;
  supplierId: string;
  status: string;
  match: string;
  dateFrom: string;
  dateTo: string;
};

const DEFAULT_FILTERS: FilterState = {
  search: "",
  supplierId: "all",
  status: "all",
  match: "all",
  dateFrom: "",
  dateTo: "",
};

export type PurchaseBillGridHandle = {
  openFilters: () => void;
  openColumns: () => void;
  resetFilters: () => void;
  exportCsv: () => void;
};

export const PurchaseBillGrid = forwardRef<
  PurchaseBillGridHandle,
  {
    bills: VendorBill[];
    suppliers?: Supplier[];
    onMatch: (row: VendorBill) => void;
    onApprove: (row: VendorBill) => void;
    onPost: (row: VendorBill) => void;
    onFilterCountChange?: (count: number) => void;
    headerLeftActions?: ReactNode;
    footerLeftActions?: ReactNode;
    className?: string;
  }
>(function PurchaseBillGrid(
  {
    bills,
    suppliers = [],
    onMatch,
    onApprove,
    onPost,
    onFilterCountChange,
    headerLeftActions,
    footerLeftActions,
    className,
  },
  ref,
) {
  const canWrite = useAdminCanWrite();
  const gridApiRef = useRef<GridApi<VendorBill> | null>(null);

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);
  const [supplierDrawerId, setSupplierDrawerId] = useState<string | null>(null);
  const [poOrder, setPoOrder] = useState<ApiPurchaseOrder | null>(null);
  const [visibleCols, setVisibleCols] = useUserScopedState(
    "purchase-bill-grid:columns",
    DEFAULT_VISIBLE,
  );
  const [visibleFilters, setVisibleFilters] = useUserScopedState(
    "purchase-bill-grid:filters",
    DEFAULT_VISIBLE_FILTERS,
  );
  const resolvedCols = useMemo(() => ({ ...DEFAULT_VISIBLE, ...visibleCols }), [visibleCols]);
  const resolvedVisibleFilters = useMemo(
    () => ({ ...DEFAULT_VISIBLE_FILTERS, ...visibleFilters }),
    [visibleFilters],
  );

  const supplierName = useCallback(
    (id: string) => suppliers.find((s) => s.id === id)?.name ?? billSupplierName(id),
    [suppliers],
  );

  const openSupplierDrawer = useCallback((row: VendorBill) => {
    if (!row.supplierId) {
      toast.error("No supplier record for this bill");
      return;
    }
    setSupplierDrawerId(row.supplierId);
  }, []);

  const openPoDrawer = useCallback(async (row: VendorBill) => {
    if (!row.purchaseOrderId) {
      toast.error("No purchase order linked to this bill");
      return;
    }
    try {
      const order = await fetchPurchaseOrder(row.purchaseOrderId);
      setPoOrder(order);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open purchase order");
    }
  }, []);

  const supplierOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of suppliers) map.set(s.id, s.name);
    for (const row of bills) {
      if (!map.has(row.supplierId)) map.set(row.supplierId, supplierName(row.supplierId));
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [bills, suppliers, supplierName]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return bills.filter((row) => {
      if (filters.supplierId !== "all" && row.supplierId !== filters.supplierId) return false;
      if (filters.status !== "all" && row.status !== filters.status) return false;
      if (filters.match !== "all" && row.matchStatus !== filters.match) return false;
      if (filters.dateFrom && row.billDate < filters.dateFrom) return false;
      if (filters.dateTo && row.billDate > filters.dateTo) return false;
      if (!q) return true;
      const products = row.lines.map((l) => `${l.sku} ${l.name}`).join(" ");
      return `${row.number} ${row.vendorInvoiceNumber} ${row.poNumber} ${row.receiptNumber ?? ""} ${supplierName(row.supplierId)} ${products}`
        .toLowerCase()
        .includes(q);
    });
  }, [bills, filters, supplierName]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.search.trim()) n += 1;
    if (filters.supplierId !== "all") n += 1;
    if (filters.status !== "all") n += 1;
    if (filters.match !== "all") n += 1;
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
        supplierName(row.supplierId),
        row.number,
        row.vendorInvoiceNumber,
        row.poNumber,
        row.receiptNumber ?? "",
        MATCH_STATUS_LABELS[row.matchStatus],
        row.total,
        row.billDate,
        row.dueDate,
        BILL_STATUS_LABELS[row.status],
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `purchase-bills-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} bill${filtered.length === 1 ? "" : "s"}`);
  }, [filtered, supplierName]);

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
    ({ data }: { data: VendorBill }) => {
      const items: ReactNode[] = [];
      if (canWrite && (data.status === "unmatched" || data.status === "draft")) {
        items.push(
          <DropdownMenuItem key="match" onClick={() => onMatch(data)}>
            <Scale className="mr-1.5 h-3 w-3" /> Match
          </DropdownMenuItem>,
        );
      }
      if (canWrite && (data.status === "matched" || data.status === "exception")) {
        items.push(
          <DropdownMenuItem key="approve" onClick={() => onApprove(data)}>
            <CheckCircle2 className="mr-1.5 h-3 w-3" /> Approve
          </DropdownMenuItem>,
        );
      }
      if (canWrite && data.status === "approved") {
        items.push(
          <DropdownMenuItem key="post" onClick={() => onPost(data)}>
            <Wallet className="mr-1.5 h-3 w-3" /> Post to AP
          </DropdownMenuItem>,
        );
      }
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <RowActionsTrigger />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {items.length > 0 ? items : <DropdownMenuItem disabled>No actions</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
    [canWrite, onApprove, onMatch, onPost],
  );

  const columnDefs = useMemo<ColDef<VendorBill>[]>(
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
        cellRenderer: (p: ICellRendererParams<VendorBill>) =>
          p.data ? <RowMenu data={p.data} /> : null,
      },
      {
        colId: "supplier",
        headerName: COLUMN_LABELS.supplier,
        hide: !resolvedCols.supplier,
        flex: 1.6,
        minWidth: 160,
        tooltipValueGetter: (p) => (p.data ? supplierName(p.data.supplierId) : ""),
        valueGetter: (p) => (p.data ? supplierName(p.data.supplierId) : ""),
        cellRenderer: (p: ICellRendererParams<VendorBill>) => {
          const name = p.data ? supplierName(p.data.supplierId) : "";
          if (!name) return "—";
          return (
            <GridRefLink title={name} onClick={() => openSupplierDrawer(p.data!)}>
              {name}
            </GridRefLink>
          );
        },
      },
      {
        colId: "number",
        field: "number",
        headerName: COLUMN_LABELS.number,
        hide: !resolvedCols.number,
        width: 140,
        minWidth: 120,
        cellClass: "font-mono text-[11px]",
      },
      {
        colId: "invoice",
        field: "vendorInvoiceNumber",
        headerName: COLUMN_LABELS.invoice,
        hide: !resolvedCols.invoice,
        width: 130,
        minWidth: 110,
        valueFormatter: (p) => (p.value ? String(p.value) : "—"),
      },
      {
        colId: "poNumber",
        field: "poNumber",
        headerName: COLUMN_LABELS.poNumber,
        hide: !resolvedCols.poNumber,
        width: 130,
        minWidth: 110,
        cellClass: "font-mono text-[11px]",
        cellRenderer: (p: ICellRendererParams<VendorBill>) => {
          const po = p.data?.poNumber?.trim();
          if (!po) return "—";
          return (
            <GridRefLink className="font-mono text-[11px]" title={po} onClick={() => void openPoDrawer(p.data!)}>
              {po}
            </GridRefLink>
          );
        },
      },
      {
        colId: "receiptNumber",
        field: "receiptNumber",
        headerName: COLUMN_LABELS.receiptNumber,
        hide: !resolvedCols.receiptNumber,
        width: 130,
        minWidth: 110,
        cellClass: "font-mono text-[11px]",
        valueFormatter: (p) => (p.value ? String(p.value) : "—"),
      },
      {
        colId: "match",
        field: "matchStatus",
        headerName: COLUMN_LABELS.match,
        hide: !resolvedCols.match,
        width: 130,
        minWidth: 110,
        cellRenderer: (p: ICellRendererParams<VendorBill>) => {
          const match = p.data?.matchStatus;
          if (!match) return null;
          return (
            <GridChipBadge className={MATCH_TONE[match]} title={MATCH_STATUS_LABELS[match]}>
              {MATCH_STATUS_LABELS[match]}
            </GridChipBadge>
          );
        },
      },
      {
        colId: "total",
        field: "total",
        headerName: COLUMN_LABELS.total,
        hide: !resolvedCols.total,
        width: 120,
        minWidth: 96,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: `${NUMERIC_CELL} font-medium`,
        valueFormatter: (p) => formatCurrency(Number(p.value ?? 0)),
      },
      {
        colId: "billDate",
        field: "billDate",
        headerName: COLUMN_LABELS.billDate,
        hide: !resolvedCols.billDate,
        width: 120,
        minWidth: 100,
      },
      {
        colId: "dueDate",
        field: "dueDate",
        headerName: COLUMN_LABELS.dueDate,
        hide: !resolvedCols.dueDate,
        width: 120,
        minWidth: 100,
      },
      {
        colId: "status",
        field: "status",
        headerName: COLUMN_LABELS.status,
        hide: !resolvedCols.status,
        width: 120,
        minWidth: 96,
        cellRenderer: (p: ICellRendererParams<VendorBill>) => {
          const status = p.data?.status;
          if (!status) return null;
          return (
            <GridChipBadge className={STATUS_TONE[status]} title={BILL_STATUS_LABELS[status]}>
              {BILL_STATUS_LABELS[status]}
            </GridChipBadge>
          );
        },
      },
    ],
    [RowMenu, openPoDrawer, openSupplierDrawer, resolvedCols, supplierName],
  );

  return (
    <AgainListGrid<VendorBill>
      className={className}
      rowData={filtered}
      columnDefs={columnDefs}
      headerLeftActions={headerLeftActions}
      filterBar={
        <>
          {resolvedVisibleFilters.search && (
            <Input
              placeholder="Search bill, invoice, PO, supplier…"
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
              width="w-[150px]"
              className="shrink-0"
              ariaLabel="Status"
              options={[
                { value: "all", label: "All statuses" },
                ...Object.entries(BILL_STATUS_LABELS).map(([value, label]) => ({ value, label })),
              ]}
            />
          )}
          {resolvedVisibleFilters.match && (
            <FilterSelect
              value={filters.match}
              onChange={(match) => setFilters((f) => ({ ...f, match }))}
              width="w-[150px]"
              className="shrink-0"
              ariaLabel="Match"
              options={[
                { value: "all", label: "All matches" },
                ...Object.entries(MATCH_STATUS_LABELS).map(([value, label]) => ({ value, label })),
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
      emptyTitle="No supplier bills match your filters"
      onResetFilters={() => setFilters(DEFAULT_FILTERS)}
      onOpenColumns={() => setColumnSheetOpen(true)}
      apiRef={gridApiRef}
      mobile={
        <div className="divide-y divide-border">
          {filtered.map((row) => (
            <div key={row.id} className="px-3 py-2.5">
              <p className="truncate text-sm font-medium">{supplierName(row.supplierId)}</p>
              <p className="font-mono text-[11px] text-muted-foreground">{row.number}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {row.poNumber} · {BILL_STATUS_LABELS[row.status]} · {formatCurrency(row.total)}
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
      <SupplierDetailDrawer
        open={Boolean(supplierDrawerId)}
        supplierId={supplierDrawerId}
        onOpenChange={(next) => {
          if (!next) setSupplierDrawerId(null);
        }}
      />
      <PoFormDrawer
        key={poOrder?.id ?? "bill-po"}
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
