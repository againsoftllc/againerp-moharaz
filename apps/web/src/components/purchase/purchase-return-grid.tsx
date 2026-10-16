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
import { Ban, CheckCircle2, Eye, Wallet } from "lucide-react";
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
  RETURN_REASON_LABELS,
  RETURN_STATUS_LABELS,
  type PurchaseReturn,
  type ReturnReason,
  type ReturnStatus,
} from "@/lib/mock-data/purchase-returns";
import type { Supplier } from "@/lib/mock-data/suppliers";
import { fetchPurchaseOrder, type ApiPurchaseOrder } from "@/lib/api/purchase-orders";
import { GridRefLink } from "@/components/shared/grid-ref-link";
import { SupplierDetailDrawer } from "@/components/suppliers/supplier-detail-drawer";
import { PoFormDrawer } from "@/components/suppliers/po-form-drawer";
import { ReturnDrawer } from "@/components/purchase/return-drawer";

const STATUS_TONE: Record<ReturnStatus, string> = {
  requested: "border-muted-foreground/30 bg-muted text-muted-foreground",
  approved: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  credited: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  rejected: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  cancelled: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

const REASON_TONE: Record<ReturnReason, string> = {
  defective: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  wrong_item: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  over_shipment: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  warranty: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  expired: "border-muted-foreground/30 bg-muted text-muted-foreground",
  other: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

const COLUMN_KEYS = [
  "supplier",
  "number",
  "poNumber",
  "receiptNumber",
  "reason",
  "credit",
  "requestDate",
  "warehouse",
  "status",
  "requestedBy",
] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];

function PurchaseReturnNumberCell(
  p: ICellRendererParams<PurchaseReturn> & { onOpenRow?: (row: PurchaseReturn) => void },
) {
  const no = p.data?.number?.trim();
  if (!no || !p.data) return "—";
  return (
    <button
      type="button"
      className="block h-full w-full cursor-pointer truncate text-left font-mono text-[11px] font-semibold text-foreground no-underline hover:text-primary hover:no-underline focus-visible:outline-none"
      title={no}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        p.onOpenRow?.(p.data!);
      }}
    >
      {no}
    </button>
  );
}

const COLUMN_LABELS: Record<ColumnKey, string> = {
  supplier: "Supplier",
  number: "Return No",
  poNumber: "PO",
  receiptNumber: "Receipt",
  reason: "Reason",
  credit: "Credit",
  requestDate: "Requested",
  warehouse: "Location",
  status: "Status",
  requestedBy: "Requested By",
};

const DEFAULT_VISIBLE: Record<ColumnKey, boolean> = {
  supplier: true,
  number: true,
  poNumber: true,
  receiptNumber: false,
  reason: true,
  credit: true,
  requestDate: true,
  warehouse: false,
  status: true,
  requestedBy: false,
};

const FILTER_VISIBILITY_KEYS = ["search", "supplier", "status", "reason", "warehouse"] as const;
type FilterVisibilityKey = (typeof FILTER_VISIBILITY_KEYS)[number];

const FILTER_LABELS: Record<FilterVisibilityKey, string> = {
  search: "Search",
  supplier: "Supplier",
  status: "Status",
  reason: "Reason",
  warehouse: "Location",
};

const DEFAULT_VISIBLE_FILTERS: Record<FilterVisibilityKey, boolean> = {
  search: true,
  supplier: true,
  status: true,
  reason: false,
  warehouse: false,
};

type FilterState = {
  search: string;
  supplierId: string;
  status: string;
  reason: string;
  warehouse: string;
  dateFrom: string;
  dateTo: string;
};

const DEFAULT_FILTERS: FilterState = {
  search: "",
  supplierId: "all",
  status: "all",
  reason: "all",
  warehouse: "all",
  dateFrom: "",
  dateTo: "",
};

export type PurchaseReturnGridHandle = {
  openFilters: () => void;
  openColumns: () => void;
  resetFilters: () => void;
  exportCsv: () => void;
};

export const PurchaseReturnGrid = forwardRef<
  PurchaseReturnGridHandle,
  {
    returns: PurchaseReturn[];
    suppliers?: Supplier[];
    onApprove: (row: PurchaseReturn) => void;
    onReject: (row: PurchaseReturn) => void;
    onCredit: (row: PurchaseReturn) => void;
    onOpen?: (row: PurchaseReturn) => void;
    onChanged?: () => void;
    onFilterCountChange?: (count: number) => void;
    headerLeftActions?: ReactNode;
    footerLeftActions?: ReactNode;
    className?: string;
  }
>(function PurchaseReturnGrid(
  {
    returns,
    suppliers = [],
    onApprove,
    onReject,
    onCredit,
    onOpen,
    onChanged,
    onFilterCountChange,
    headerLeftActions,
    footerLeftActions,
    className,
  },
  ref,
) {
  const canWrite = useAdminCanWrite();
  const gridApiRef = useRef<GridApi<PurchaseReturn> | null>(null);

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);
  const [supplierDrawerId, setSupplierDrawerId] = useState<string | null>(null);
  const [poOrder, setPoOrder] = useState<ApiPurchaseOrder | null>(null);
  const [viewedReturn, setViewedReturn] = useState<PurchaseReturn | null>(null);
  const ignoreViewCloseUntil = useRef(0);

  const openViewedReturn = useCallback(
    (row: PurchaseReturn) => {
      ignoreViewCloseUntil.current = Date.now() + 300;
      window.setTimeout(() => {
        setViewedReturn(row);
        onOpen?.(row);
      }, 0);
    },
    [onOpen],
  );
  const [visibleCols, setVisibleCols] = useUserScopedState(
    "purchase-return-grid:columns",
    DEFAULT_VISIBLE,
  );
  const [visibleFilters, setVisibleFilters] = useUserScopedState(
    "purchase-return-grid:filters",
    DEFAULT_VISIBLE_FILTERS,
  );
  const resolvedCols = useMemo(() => ({ ...DEFAULT_VISIBLE, ...visibleCols }), [visibleCols]);
  const resolvedVisibleFilters = useMemo(
    () => ({ ...DEFAULT_VISIBLE_FILTERS, ...visibleFilters }),
    [visibleFilters],
  );

  const supplierName = useCallback(
    (id: string) => suppliers.find((s) => s.id === id)?.name ?? id,
    [suppliers],
  );

  const openSupplierDrawer = useCallback((row: PurchaseReturn) => {
    if (!row.supplierId) {
      toast.error("No supplier record for this return");
      return;
    }
    setSupplierDrawerId(row.supplierId);
  }, []);

  const openPoDrawer = useCallback(async (row: PurchaseReturn) => {
    if (!row.purchaseOrderId) {
      toast.error("No purchase order linked to this return");
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
    for (const row of returns) {
      if (!map.has(row.supplierId)) map.set(row.supplierId, supplierName(row.supplierId));
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [returns, suppliers, supplierName]);

  const warehouseOptions = useMemo(() => {
    const names = [...new Set(returns.map((r) => r.warehouse).filter(Boolean))];
    return names.sort((a, b) => a.localeCompare(b));
  }, [returns]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return returns.filter((row) => {
      if (filters.supplierId !== "all" && row.supplierId !== filters.supplierId) return false;
      if (filters.status !== "all" && row.status !== filters.status) return false;
      if (filters.reason !== "all" && row.reason !== filters.reason) return false;
      if (filters.warehouse !== "all" && row.warehouse !== filters.warehouse) return false;
      if (filters.dateFrom && row.requestDate < filters.dateFrom) return false;
      if (filters.dateTo && row.requestDate > filters.dateTo) return false;
      if (!q) return true;
      const products = row.lines.map((l) => `${l.sku} ${l.name}`).join(" ");
      return `${row.number} ${row.poNumber} ${row.receiptNumber ?? ""} ${supplierName(row.supplierId)} ${products}`
        .toLowerCase()
        .includes(q);
    });
  }, [returns, filters, supplierName]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.search.trim()) n += 1;
    if (filters.supplierId !== "all") n += 1;
    if (filters.status !== "all") n += 1;
    if (filters.reason !== "all") n += 1;
    if (filters.warehouse !== "all") n += 1;
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
        row.poNumber,
        row.receiptNumber ?? "",
        RETURN_REASON_LABELS[row.reason],
        row.creditAmount,
        row.requestDate,
        row.warehouse,
        RETURN_STATUS_LABELS[row.status],
        row.requestedBy,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `purchase-returns-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} return${filtered.length === 1 ? "" : "s"}`);
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
    ({ data }: { data: PurchaseReturn }) => {
      const items: ReactNode[] = [];
      items.push(
        <DropdownMenuItem key="open" onClick={() => openViewedReturn(data)}>
          <Eye className="mr-1.5 h-3 w-3" /> Open
        </DropdownMenuItem>,
      );
      if (canWrite && data.status === "requested") {
        items.push(
          <DropdownMenuItem key="approve" onClick={() => onApprove(data)}>
            <CheckCircle2 className="mr-1.5 h-3 w-3" /> Approve
          </DropdownMenuItem>,
          <DropdownMenuItem key="reject" onClick={() => onReject(data)}>
            <Ban className="mr-1.5 h-3 w-3" /> Reject
          </DropdownMenuItem>,
        );
      }
      if (canWrite && data.status === "approved") {
        items.push(
          <DropdownMenuItem key="credit" onClick={() => onCredit(data)}>
            <Wallet className="mr-1.5 h-3 w-3" /> Credit AP
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
    [canWrite, onApprove, onCredit, onReject, openViewedReturn],
  );

  const columnDefs = useMemo<ColDef<PurchaseReturn>[]>(
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
        cellRenderer: (p: ICellRendererParams<PurchaseReturn>) =>
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
        cellRenderer: (p: ICellRendererParams<PurchaseReturn>) => {
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
        cellRenderer: PurchaseReturnNumberCell,
        cellRendererParams: { onOpenRow: openViewedReturn },
      },
      {
        colId: "poNumber",
        field: "poNumber",
        headerName: COLUMN_LABELS.poNumber,
        hide: !resolvedCols.poNumber,
        width: 130,
        minWidth: 110,
        cellClass: "font-mono text-[11px]",
        cellRenderer: (p: ICellRendererParams<PurchaseReturn>) => {
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
        colId: "reason",
        field: "reason",
        headerName: COLUMN_LABELS.reason,
        hide: !resolvedCols.reason,
        width: 130,
        minWidth: 110,
        cellRenderer: (p: ICellRendererParams<PurchaseReturn>) => {
          const reason = p.data?.reason;
          if (!reason) return null;
          return (
            <GridChipBadge className={REASON_TONE[reason]} title={RETURN_REASON_LABELS[reason]}>
              {RETURN_REASON_LABELS[reason]}
            </GridChipBadge>
          );
        },
      },
      {
        colId: "credit",
        field: "creditAmount",
        headerName: COLUMN_LABELS.credit,
        hide: !resolvedCols.credit,
        width: 120,
        minWidth: 96,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: `${NUMERIC_CELL} font-medium`,
        valueFormatter: (p) => formatCurrency(Number(p.value ?? 0)),
      },
      {
        colId: "requestDate",
        field: "requestDate",
        headerName: COLUMN_LABELS.requestDate,
        hide: !resolvedCols.requestDate,
        width: 120,
        minWidth: 100,
      },
      {
        colId: "warehouse",
        field: "warehouse",
        headerName: COLUMN_LABELS.warehouse,
        hide: !resolvedCols.warehouse,
        width: 120,
        minWidth: 96,
      },
      {
        colId: "status",
        field: "status",
        headerName: COLUMN_LABELS.status,
        hide: !resolvedCols.status,
        width: 140,
        minWidth: 110,
        cellRenderer: (p: ICellRendererParams<PurchaseReturn>) => {
          const status = p.data?.status;
          if (!status) return null;
          return (
            <GridChipBadge className={STATUS_TONE[status]} title={RETURN_STATUS_LABELS[status]}>
              {RETURN_STATUS_LABELS[status]}
            </GridChipBadge>
          );
        },
      },
      {
        colId: "requestedBy",
        field: "requestedBy",
        headerName: COLUMN_LABELS.requestedBy,
        hide: !resolvedCols.requestedBy,
        width: 140,
        minWidth: 110,
      },
    ],
    [RowMenu, openPoDrawer, openSupplierDrawer, openViewedReturn, resolvedCols, supplierName],
  );

  return (
    <AgainListGrid<PurchaseReturn>
      className={className}
      rowData={filtered}
      columnDefs={columnDefs}
      headerLeftActions={headerLeftActions}
      filterBar={
        <>
          {resolvedVisibleFilters.search && (
            <Input
              placeholder="Search return, PO, supplier, product…"
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
              width="w-[160px]"
              className="shrink-0"
              ariaLabel="Status"
              options={[
                { value: "all", label: "All statuses" },
                ...Object.entries(RETURN_STATUS_LABELS).map(([value, label]) => ({ value, label })),
              ]}
            />
          )}
          {resolvedVisibleFilters.reason && (
            <FilterSelect
              value={filters.reason}
              onChange={(reason) => setFilters((f) => ({ ...f, reason }))}
              width="w-[150px]"
              className="shrink-0"
              ariaLabel="Reason"
              options={[
                { value: "all", label: "All reasons" },
                ...Object.entries(RETURN_REASON_LABELS).map(([value, label]) => ({ value, label })),
              ]}
            />
          )}
          {resolvedVisibleFilters.warehouse && (
            <FilterSelect
              value={filters.warehouse}
              onChange={(warehouse) => setFilters((f) => ({ ...f, warehouse }))}
              width="w-[140px]"
              className="shrink-0"
              ariaLabel="Location"
              options={[
                { value: "all", label: "All locations" },
                ...warehouseOptions.map((name) => ({ value: name, label: name })),
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
      emptyTitle="No purchase returns match your filters"
      onResetFilters={() => setFilters(DEFAULT_FILTERS)}
      onOpenColumns={() => setColumnSheetOpen(true)}
      onRowClicked={openViewedReturn}
      apiRef={gridApiRef}
      mobile={
        <div className="divide-y divide-border">
          {filtered.map((row) => (
            <div
              key={row.id}
              className="cursor-pointer px-3 py-2.5"
              onClick={() => openViewedReturn(row)}
            >
              <p className="truncate text-sm font-medium">{supplierName(row.supplierId)}</p>
              <button
                type="button"
                className="font-mono text-[11px] text-foreground hover:text-primary"
                onClick={(e) => {
                  e.stopPropagation();
                  openViewedReturn(row);
                }}
              >
                {row.number}
              </button>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {row.poNumber} · {RETURN_STATUS_LABELS[row.status]} · {formatCurrency(row.creditAmount)}
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
        key={poOrder?.id ?? "return-po"}
        open={Boolean(poOrder)}
        onOpenChange={(next) => {
          if (!next) setPoOrder(null);
        }}
        order={poOrder}
        supplierId={poOrder?.supplier_id}
        supplierName={poOrder?.supplier_name ?? undefined}
      />
      <ReturnDrawer
        open={Boolean(viewedReturn)}
        onOpenChange={(next) => {
          if (next) return;
          if (Date.now() < ignoreViewCloseUntil.current) return;
          setViewedReturn(null);
        }}
        orders={[]}
        record={viewedReturn}
        onUpdated={(row) => {
          setViewedReturn(row);
          onChanged?.();
        }}
        onCreated={() => onChanged?.()}
      />
    </AgainListGrid>
  );
});
