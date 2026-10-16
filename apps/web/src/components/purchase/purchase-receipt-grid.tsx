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
import { Ban, Eye, PackageCheck } from "lucide-react";
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
import type { ApiPurchaseReceipt } from "@/lib/api/purchase-receipts";
import { fetchPurchaseOrder, type ApiPurchaseOrder } from "@/lib/api/purchase-orders";
import { receiptLabel, receiptTone } from "@/components/purchase/purchase-receiving-history";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useUserScopedState } from "@/lib/hooks/use-user-scoped-state";
import { GridRefLink } from "@/components/shared/grid-ref-link";
import { SupplierDetailDrawer } from "@/components/suppliers/supplier-detail-drawer";
import { PoFormDrawer } from "@/components/suppliers/po-form-drawer";
import type { Supplier } from "@/lib/mock-data/suppliers";

const COLUMN_KEYS = [
  "supplier",
  "receiptNo",
  "poNumber",
  "receiptDate",
  "location",
  "items",
  "status",
  "receivedBy",
  "postedBy",
] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  supplier: "Supplier",
  receiptNo: "Receipt No",
  poNumber: "PO",
  receiptDate: "Receipt Date",
  location: "Location",
  items: "Received Items",
  status: "Status",
  receivedBy: "Received by",
  postedBy: "Posted by",
};

const DEFAULT_VISIBLE: Record<ColumnKey, boolean> = {
  supplier: true,
  receiptNo: true,
  poNumber: true,
  receiptDate: true,
  location: true,
  items: true,
  status: true,
  receivedBy: true,
  postedBy: true,
};

const FILTER_VISIBILITY_KEYS = ["search", "supplier", "status", "warehouse", "po", "buyer"] as const;
type FilterVisibilityKey = (typeof FILTER_VISIBILITY_KEYS)[number];

const FILTER_LABELS: Record<FilterVisibilityKey, string> = {
  search: "Search",
  supplier: "Supplier",
  status: "Status",
  warehouse: "Location",
  po: "Purchase order",
  buyer: "Buyer",
};

const DEFAULT_VISIBLE_FILTERS: Record<FilterVisibilityKey, boolean> = {
  search: true,
  supplier: true,
  status: true,
  warehouse: true,
  po: false,
  buyer: false,
};

type FilterState = {
  search: string;
  supplierId: string;
  status: string;
  warehouseId: string;
  poId: string;
  buyer: string;
  dateFrom: string;
  dateTo: string;
};

const DEFAULT_FILTERS: FilterState = {
  search: "",
  supplierId: "all",
  status: "all",
  warehouseId: "all",
  poId: "all",
  buyer: "all",
  dateFrom: "",
  dateTo: "",
};

function itemCount(row: ApiPurchaseReceipt) {
  return row.lines.length;
}

export type PurchaseReceiptGridHandle = {
  openFilters: () => void;
  openColumns: () => void;
  resetFilters: () => void;
  exportCsv: () => void;
};

export const PurchaseReceiptGrid = forwardRef<
  PurchaseReceiptGridHandle,
  {
    receipts: ApiPurchaseReceipt[];
    suppliers?: Supplier[];
    orders?: ApiPurchaseOrder[];
    loading?: boolean;
    onView: (row: ApiPurchaseReceipt) => void;
    onPost?: (row: ApiPurchaseReceipt) => Promise<void>;
    onCancel?: (row: ApiPurchaseReceipt) => Promise<void>;
    onFilterCountChange?: (count: number) => void;
    headerLeftActions?: ReactNode;
    footerLeftActions?: ReactNode;
    className?: string;
  }
>(function PurchaseReceiptGrid(
  {
    receipts,
    suppliers = [],
    orders = [],
    loading = false,
    onView,
    onPost,
    onCancel,
    onFilterCountChange,
    headerLeftActions,
    footerLeftActions,
    className,
  },
  ref,
) {
  const canWrite = useAdminCanWrite();
  const gridApiRef = useRef<GridApi<ApiPurchaseReceipt> | null>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);
  const [supplierDrawerId, setSupplierDrawerId] = useState<string | null>(null);
  const [poOrder, setPoOrder] = useState<ApiPurchaseOrder | null>(null);
  const [visibleCols, setVisibleCols] = useUserScopedState(
    "purchase-receipt-grid:columns",
    DEFAULT_VISIBLE,
  );
  const [visibleFilters, setVisibleFilters] = useUserScopedState(
    "purchase-receipt-grid:filters",
    DEFAULT_VISIBLE_FILTERS,
  );
  const resolvedCols = useMemo(() => ({ ...DEFAULT_VISIBLE, ...visibleCols }), [visibleCols]);
  const resolvedVisibleFilters = useMemo(
    () => ({ ...DEFAULT_VISIBLE_FILTERS, ...visibleFilters }),
    [visibleFilters],
  );

  const warehouseOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of receipts) {
      if (row.warehouse_id) map.set(row.warehouse_id, row.warehouse_name ?? row.warehouse_id);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [receipts]);

  const buyerOptions = useMemo(() => {
    const names = [...new Set(orders.map((o) => o.buyer_name).filter(Boolean) as string[])];
    return names.sort((a, b) => a.localeCompare(b));
  }, [orders]);

  const orderById = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);

  const openSupplierDrawer = useCallback((row: ApiPurchaseReceipt) => {
    if (!row.supplier_id) {
      toast.error("No supplier record for this receipt");
      return;
    }
    setSupplierDrawerId(row.supplier_id);
  }, []);

  const openPoDrawer = useCallback(
    async (row: ApiPurchaseReceipt) => {
      const cached = orderById.get(row.purchase_order_id);
      if (cached) {
        setPoOrder(cached);
        return;
      }
      try {
        const order = await fetchPurchaseOrder(row.purchase_order_id);
        setPoOrder(order);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not open purchase order");
      }
    },
    [orderById],
  );

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return receipts.filter((row) => {
      if (q) {
        const products = row.lines.map((l) => `${l.sku ?? ""} ${l.name ?? ""}`).join(" ");
        const hay = `${row.receipt_number} ${row.po_number ?? ""} ${row.supplier_name ?? ""} ${row.received_by ?? ""} ${products}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.supplierId !== "all" && row.supplier_id !== filters.supplierId) return false;
      if (filters.status !== "all" && row.status !== filters.status) return false;
      if (filters.warehouseId !== "all" && row.warehouse_id !== filters.warehouseId) return false;
      if (filters.poId !== "all" && row.purchase_order_id !== filters.poId) return false;
      if (filters.buyer !== "all") {
        const buyer = orderById.get(row.purchase_order_id)?.buyer_name ?? "";
        if (buyer !== filters.buyer) return false;
      }
      if (filters.dateFrom && row.receipt_date < filters.dateFrom) return false;
      if (filters.dateTo && row.receipt_date > filters.dateTo) return false;
      return true;
    });
  }, [receipts, filters, orderById]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.search.trim()) n += 1;
    if (filters.supplierId !== "all") n += 1;
    if (filters.status !== "all") n += 1;
    if (filters.warehouseId !== "all") n += 1;
    if (filters.poId !== "all") n += 1;
    if (filters.buyer !== "all") n += 1;
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
        row.receipt_number,
        row.po_number ?? "",
        row.supplier_name ?? "",
        row.receipt_date,
        row.warehouse_name ?? "",
        itemCount(row),
        receiptLabel(row.status),
        row.received_by ?? "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `purchase-receipts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered]);

  useImperativeHandle(ref, () => ({
    openFilters: () => setFilterSheetOpen(true),
    openColumns: () => setColumnSheetOpen(true),
    resetFilters: () => setFilters(DEFAULT_FILTERS),
    exportCsv,
  }), [exportCsv]);

  const RowMenu = useCallback(
    ({ data }: { data: ApiPurchaseReceipt }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <RowActionsTrigger />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => onView(data)}>
            <Eye className="mr-1.5 h-3 w-3" /> View
          </DropdownMenuItem>
          {canWrite && data.status === "draft" && onPost && (
            <DropdownMenuItem onClick={() => void onPost(data)}>
              <PackageCheck className="mr-1.5 h-3 w-3" /> Confirm / post
            </DropdownMenuItem>
          )}
          {canWrite && data.status === "draft" && onCancel && (
            <DropdownMenuItem onClick={() => void onCancel(data)}>
              <Ban className="mr-1.5 h-3 w-3" /> Cancel
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    [canWrite, onCancel, onPost, onView],
  );

  const columnDefs = useMemo<ColDef<ApiPurchaseReceipt>[]>(
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
        headerComponent: GridFullscreenHeader,
        cellRenderer: (p: ICellRendererParams<ApiPurchaseReceipt>) =>
          p.data ? <RowMenu data={p.data} /> : null,
      },
      {
        colId: "supplier",
        field: "supplier_name",
        headerName: COLUMN_LABELS.supplier,
        hide: !resolvedCols.supplier,
        flex: 1.6,
        minWidth: 160,
        tooltipField: "supplier_name",
        cellRenderer: (p: ICellRendererParams<ApiPurchaseReceipt>) => {
          const name = p.data?.supplier_name?.trim();
          if (!name) return "—";
          return (
            <GridRefLink title={name} onClick={() => openSupplierDrawer(p.data!)}>
              {name}
            </GridRefLink>
          );
        },
      },
      {
        colId: "receiptNo",
        field: "receipt_number",
        headerName: COLUMN_LABELS.receiptNo,
        hide: !resolvedCols.receiptNo,
        width: 140,
        minWidth: 120,
        cellClass: "font-mono text-[11px]",
        cellRenderer: (p: ICellRendererParams<ApiPurchaseReceipt>) =>
          p.data ? (
            <GridRefLink className="font-semibold" title={p.data.receipt_number} onClick={() => onView(p.data!)}>
              {p.data.receipt_number}
            </GridRefLink>
          ) : null,
      },
      {
        colId: "poNumber",
        field: "po_number",
        headerName: COLUMN_LABELS.poNumber,
        hide: !resolvedCols.poNumber,
        width: 130,
        minWidth: 110,
        cellClass: "font-mono text-[11px]",
        cellRenderer: (p: ICellRendererParams<ApiPurchaseReceipt>) => {
          const po = p.data?.po_number?.trim();
          if (!po) return "—";
          return (
            <GridRefLink className="font-mono text-[11px]" title={po} onClick={() => void openPoDrawer(p.data!)}>
              {po}
            </GridRefLink>
          );
        },
      },
      {
        colId: "receiptDate",
        field: "receipt_date",
        headerName: COLUMN_LABELS.receiptDate,
        hide: !resolvedCols.receiptDate,
        width: 120,
      },
      {
        colId: "location",
        field: "warehouse_name",
        headerName: COLUMN_LABELS.location,
        hide: !resolvedCols.location,
        width: 140,
      },
      {
        colId: "items",
        headerName: COLUMN_LABELS.items,
        hide: !resolvedCols.items,
        width: 120,
        minWidth: 96,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueGetter: (p) => (p.data ? itemCount(p.data) : 0),
      },
      {
        colId: "status",
        field: "status",
        headerName: COLUMN_LABELS.status,
        hide: !resolvedCols.status,
        width: 120,
        minWidth: 96,
        cellRenderer: (p: ICellRendererParams<ApiPurchaseReceipt>) =>
          p.data ? (
            <GridChipBadge className={receiptTone(p.data.status)} title={receiptLabel(p.data.status)}>
              {receiptLabel(p.data.status)}
            </GridChipBadge>
          ) : null,
      },
      {
        colId: "receivedBy",
        field: "received_by",
        headerName: COLUMN_LABELS.receivedBy,
        hide: !resolvedCols.receivedBy,
        width: 140,
        tooltipValueGetter: () => "Free-text name typed on the receipt form — not a tracked account",
        valueFormatter: (p) => (p.value ? String(p.value) : "—"),
      },
      {
        colId: "postedBy",
        field: "posted_by_name",
        headerName: COLUMN_LABELS.postedBy,
        hide: !resolvedCols.postedBy,
        width: 140,
        tooltipValueGetter: () => "Which account posted this receipt to Finance",
        valueFormatter: (p) => (p.value ? String(p.value) : "Default"),
      },
    ],
    [RowMenu, onView, openPoDrawer, openSupplierDrawer, resolvedCols],
  );

  return (
    <AgainListGrid<ApiPurchaseReceipt>
      className={className}
      rowData={filtered}
      columnDefs={columnDefs}
      loading={loading}
      headerLeftActions={headerLeftActions}
      filterBar={
        <>
          {resolvedVisibleFilters.search && (
            <Input
              placeholder="Search receipt, PO, supplier, product…"
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
                ...suppliers.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
          )}
          {resolvedVisibleFilters.status && (
            <FilterSelect
              value={filters.status}
              onChange={(status) => setFilters((f) => ({ ...f, status }))}
              width="w-[140px]"
              className="shrink-0"
              ariaLabel="Receipt status"
              options={[
                { value: "all", label: "All statuses" },
                { value: "draft", label: "Draft" },
                { value: "posted", label: "Received" },
                { value: "cancelled", label: "Cancelled" },
              ]}
            />
          )}
          {resolvedVisibleFilters.warehouse && (
            <FilterSelect
              value={filters.warehouseId}
              onChange={(warehouseId) => setFilters((f) => ({ ...f, warehouseId }))}
              width="w-[180px]"
              className="shrink-0"
              ariaLabel="Location"
              options={[
                { value: "all", label: "All locations" },
                ...warehouseOptions.map(([value, label]) => ({ value, label })),
              ]}
            />
          )}
          {resolvedVisibleFilters.po && (
            <FilterSelect
              value={filters.poId}
              onChange={(poId) => setFilters((f) => ({ ...f, poId }))}
              width="w-[180px]"
              className="shrink-0"
              ariaLabel="Purchase order"
              options={[
                { value: "all", label: "All POs" },
                ...orders.map((o) => ({ value: o.id, label: o.po_number })),
              ]}
            />
          )}
          {resolvedVisibleFilters.buyer && (
            <FilterSelect
              value={filters.buyer}
              onChange={(buyer) => setFilters((f) => ({ ...f, buyer }))}
              width="w-[160px]"
              className="shrink-0"
              ariaLabel="Buyer"
              options={[
                { value: "all", label: "All buyers" },
                ...buyerOptions.map((name) => ({ value: name, label: name })),
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
      emptyTitle="No purchase receipts match your filters"
      onResetFilters={() => setFilters(DEFAULT_FILTERS)}
      onOpenColumns={() => setColumnSheetOpen(true)}
      apiRef={gridApiRef}
      mobile={
        <div className="divide-y divide-border">
          {filtered.map((row) => (
            <button key={row.id} type="button" className="block w-full px-3 py-2.5 text-left" onClick={() => onView(row)}>
              <p className="truncate text-sm font-medium">{row.supplier_name ?? "Supplier"}</p>
              <p className="font-mono text-[11px] text-muted-foreground">{row.receipt_number}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {row.po_number ?? "PO"} · {receiptLabel(row.status)}
              </p>
            </button>
          ))}
        </div>
      }
    >
      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent side="right" title="Filters" resizable closeButton="inside" className="w-[180px] min-w-[160px] max-w-[720px] gap-2 rounded-none p-3">
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
        <SheetContent side="right" title="Columns" resizable closeButton="inside" className="w-[180px] min-w-[160px] max-w-[720px] gap-2 rounded-none p-3">
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
        key={poOrder?.id ?? "receipt-po"}
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
