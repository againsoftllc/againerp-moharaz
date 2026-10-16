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
import {
  Ban,
  CheckCircle2,
  Eye,
  PackageCheck,
  Pencil,
  Star,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import * as Dialog from "@radix-ui/react-dialog";
import { GridChipBadge } from "@/components/shared/grid-chip-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FilterSelect } from "@/components/shared/filter-select";
import { RowActionsTrigger } from "@/components/shared/row-actions-icon";
import { GridFullscreenHeader } from "@/components/shared/grid-fullscreen";
import { AgainListGrid, NUMERIC_CELL, NUMERIC_HEADER } from "@/components/shared/again-list-grid";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  bulkDeletePurchaseOrders,
  cancelPurchaseOrder,
  confirmPurchaseOrder,
  deletePurchaseOrder,
  type ApiPurchaseOrder,
} from "@/lib/api/purchase-orders";
import {
  PO_STATUS_LABEL,
  PO_STATUS_TONE,
  receivedPct,
} from "@/components/suppliers/supplier-purchase-orders";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useUserScopedState } from "@/lib/hooks/use-user-scoped-state";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import type { Supplier } from "@/lib/mock-data/suppliers";
import { purchaseOrderIsReturnable } from "@/lib/mock-data/purchase-returns";
import { SupplierDetailDrawer } from "@/components/suppliers/supplier-detail-drawer";

const COLUMN_KEYS = [
  "poNumber",
  "supplier",
  "address",
  "referenceNo",
  "orderDate",
  "status",
  "warehouse",
  "expectedDate",
  "buyer",
  "createdBy",
  "products",
  "quantity",
  "unitCost",
  "discount",
  "amount",
  "received",
  "billed",
  "paymentTerms",
  "updatedAt",
] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  poNumber: "PO",
  supplier: "Supplier",
  address: "Address",
  referenceNo: "Reference No",
  orderDate: "Purchase Date",
  status: "Purchase Status",
  warehouse: "Business Location",
  expectedDate: "Expected date",
  buyer: "Buyer",
  createdBy: "Created by",
  products: "Product",
  quantity: "Quantity",
  unitCost: "Unit Cost",
  discount: "Disc",
  amount: "Amount",
  received: "Received",
  billed: "Billed",
  paymentTerms: "Payment",
  updatedAt: "Updated",
};

const DEFAULT_VISIBLE: Record<ColumnKey, boolean> = {
  poNumber: true,
  supplier: true,
  address: false,
  referenceNo: true,
  orderDate: true,
  status: true,
  warehouse: true,
  expectedDate: true,
  buyer: true,
  createdBy: true,
  products: true,
  quantity: true,
  unitCost: false,
  discount: false,
  amount: true,
  received: true,
  billed: false,
  paymentTerms: true,
  updatedAt: false,
};

const FILTER_VISIBILITY_KEYS = ["search", "supplier", "status", "warehouse", "buyer"] as const;
type FilterVisibilityKey = (typeof FILTER_VISIBILITY_KEYS)[number];

const FILTER_LABELS: Record<FilterVisibilityKey, string> = {
  search: "Search",
  supplier: "Supplier",
  status: "Purchase Status",
  warehouse: "Business Location",
  buyer: "Buyer",
};

const DEFAULT_VISIBLE_FILTERS: Record<FilterVisibilityKey, boolean> = {
  search: true,
  supplier: true,
  status: true,
  warehouse: true,
  buyer: false,
};

type FilterState = {
  search: string;
  supplierId: string;
  status: string;
  warehouseId: string;
  buyer: string;
};

const DEFAULT_FILTERS: FilterState = {
  search: "",
  supplierId: "all",
  status: "all",
  warehouseId: "all",
  buyer: "all",
};

function parsePoNotes(notes: string | null | undefined) {
  const rows = (notes ?? "").split("\n");
  let referenceNo = "";
  let paymentTerms = "";
  for (const row of rows) {
    if (row.startsWith("Ref: ")) referenceNo = row.slice(5).trim();
    if (row.startsWith("Payment terms: ")) paymentTerms = row.slice("Payment terms: ".length).trim();
  }
  return { referenceNo, paymentTerms };
}

function supplierAddress(supplier: Supplier | undefined) {
  if (!supplier) return "";
  return [supplier.country, supplier.phone].filter(Boolean).join(" · ");
}

function productLabel(order: ApiPurchaseOrder) {
  return order.lines.map((line) => line.name || line.sku).filter(Boolean).join(", ");
}

function qtyOrdered(order: ApiPurchaseOrder) {
  return order.lines.reduce((sum, line) => sum + line.quantity_ordered, 0);
}

function qtyReceived(order: ApiPurchaseOrder) {
  return order.lines.reduce((sum, line) => sum + line.quantity_received, 0);
}

function avgUnitCost(order: ApiPurchaseOrder) {
  const qty = qtyOrdered(order);
  if (!qty) return 0;
  const spend = order.lines.reduce(
    (sum, line) => sum + (Number(line.unit_cost) || 0) * line.quantity_ordered,
    0,
  );
  return spend / qty;
}

export type PurchaseOrderGridHandle = {
  openFilters: () => void;
  openColumns: () => void;
  resetFilters: () => void;
  exportCsv: () => void;
};

export const PurchaseOrderGrid = forwardRef<
  PurchaseOrderGridHandle,
  {
    orders: ApiPurchaseOrder[];
    suppliers?: Supplier[];
    loading?: boolean;
    billedByOrderId?: Map<string, number>;
    initialSupplierId?: string;
    onEdit: (order: ApiPurchaseOrder) => void;
    onReceive: (order: ApiPurchaseOrder) => void;
    onReturn?: (order: ApiPurchaseOrder) => void;
    onChanged?: () => void;
    onFilterCountChange?: (count: number) => void;
    headerLeftActions?: ReactNode;
    footerLeftActions?: ReactNode;
    className?: string;
  }
>(function PurchaseOrderGrid(
  {
    orders,
    suppliers = [],
    loading = false,
    billedByOrderId,
    initialSupplierId,
    onEdit,
    onReceive,
    onReturn,
    onChanged,
    onFilterCountChange,
    headerLeftActions,
    footerLeftActions,
    className,
  },
  ref,
) {
  const canWrite = useAdminCanWrite();
  const gridApiRef = useRef<GridApi<ApiPurchaseOrder> | null>(null);

  const [filters, setFilters] = useState<FilterState>(() =>
    initialSupplierId ? { ...DEFAULT_FILTERS, supplierId: initialSupplierId } : DEFAULT_FILTERS,
  );
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);
  const [selected, setSelected] = useState<ApiPurchaseOrder[]>([]);
  const [starred, setStarred] = useState<Record<string, boolean>>({});
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<ApiPurchaseOrder[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [supplierDrawerId, setSupplierDrawerId] = useState<string | null>(null);

  const [visibleCols, setVisibleCols] = useUserScopedState(
    "purchase-order-grid:columns",
    DEFAULT_VISIBLE,
  );
  const [visibleFilters, setVisibleFilters] = useUserScopedState(
    "purchase-order-grid:filters",
    DEFAULT_VISIBLE_FILTERS,
  );
  const resolvedCols = useMemo(() => ({ ...DEFAULT_VISIBLE, ...visibleCols }), [visibleCols]);
  const resolvedVisibleFilters = useMemo(
    () => ({ ...DEFAULT_VISIBLE_FILTERS, ...visibleFilters }),
    [visibleFilters],
  );

  useEffect(() => {
    if (initialSupplierId) {
      setFilters((f) => ({ ...f, supplierId: initialSupplierId }));
    }
  }, [initialSupplierId]);

  const supplierById = useMemo(() => {
    const map = new Map<string, Supplier>();
    for (const supplier of suppliers) map.set(supplier.id, supplier);
    return map;
  }, [suppliers]);

  const warehouseOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const order of orders) {
      if (order.warehouse_id) {
        seen.set(order.warehouse_id, order.warehouse_name ?? order.warehouse_id);
      }
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [orders]);

  const buyerOptions = useMemo(() => {
    const set = new Set<string>();
    for (const order of orders) {
      const name = order.buyer_name?.trim();
      if (name) set.add(name);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [orders]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return orders.filter((order) => {
      const notes = parsePoNotes(order.notes);
      if (q) {
        const haystack = [
          order.po_number,
          order.supplier_name ?? "",
          order.buyer_name ?? "",
          notes.referenceNo,
          notes.paymentTerms,
          productLabel(order),
          order.warehouse_name ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (filters.supplierId !== "all" && order.supplier_id !== filters.supplierId) return false;
      if (filters.status !== "all" && order.status !== filters.status) return false;
      if (filters.warehouseId !== "all" && order.warehouse_id !== filters.warehouseId) return false;
      if (filters.buyer !== "all" && (order.buyer_name ?? "") !== filters.buyer) return false;
      return true;
    });
  }, [orders, filters]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.search.trim()) n += 1;
    if (filters.supplierId !== "all") n += 1;
    if (filters.status !== "all") n += 1;
    if (filters.warehouseId !== "all") n += 1;
    if (filters.buyer !== "all") n += 1;
    return n;
  }, [filters]);

  useEffect(() => {
    onFilterCountChange?.(activeFilterCount);
  }, [activeFilterCount, onFilterCountChange]);

  const act = useCallback(
    async (fn: () => Promise<unknown>, message: string) => {
      try {
        await fn();
        toast.success(message);
        onChanged?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Action failed");
      }
    },
    [onChanged],
  );

  const openDeleteConfirm = useCallback((targets: ApiPurchaseOrder[]) => {
    if (!targets.length) return;
    setDeleteTargets(targets);
    setDeleteOpen(true);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteTargets.length) return;
    setDeleting(true);
    try {
      if (deleteTargets.length === 1) {
        await deletePurchaseOrder(deleteTargets[0].id);
        toast.success(`${deleteTargets[0].po_number} deleted`);
      } else {
        const result = await bulkDeletePurchaseOrders(deleteTargets.map((order) => order.id));
        if (result.deleted) {
          toast.success(
            `${result.deleted} purchase order${result.deleted === 1 ? "" : "s"} deleted`,
          );
        }
        if (result.skipped.length) {
          toast.error(
            result.deleted
              ? `${result.skipped.length} skipped (received goods cannot be deleted)`
              : result.skipped[0] ?? "Could not delete selected purchase orders",
          );
        }
      }
      setDeleteOpen(false);
      setSelected([]);
      gridApiRef.current?.deselectAll();
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }, [deleteTargets, onChanged]);

  const exportCsv = useCallback(() => {
    const rows = selected.length ? selected : filtered;
    const header = COLUMN_KEYS.map((key) => COLUMN_LABELS[key]);
    const body = rows.map((order) => {
      const notes = parsePoNotes(order.notes);
      const values = [
        order.po_number,
        order.supplier_name ?? "",
        supplierAddress(supplierById.get(order.supplier_id)),
        notes.referenceNo,
        formatDate(order.order_date),
        PO_STATUS_LABEL[order.status] ?? order.status,
        order.warehouse_name ?? "",
        formatDate(order.expected_date),
        order.buyer_name ?? "",
        productLabel(order),
        qtyOrdered(order),
        avgUnitCost(order),
        Number(order.discount_total) || 0,
        Number(order.total) || 0,
        qtyReceived(order),
        billedByOrderId?.get(order.id) ?? 0,
        notes.paymentTerms,
        formatDate(order.updated_at),
      ];
      return values.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
    });
    const blob = new Blob([[header.join(","), ...body].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `purchase-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} order${rows.length === 1 ? "" : "s"}`);
  }, [selected, filtered, supplierById, billedByOrderId]);

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

  const toggleVisibleFilter = (key: FilterVisibilityKey, enabled: boolean) => {
    setVisibleFilters((v) => {
      const merged = { ...DEFAULT_VISIBLE_FILTERS, ...v, [key]: enabled };
      return Object.fromEntries(
        FILTER_VISIBILITY_KEYS.map((k) => [k, merged[k]]),
      ) as Record<FilterVisibilityKey, boolean>;
    });
    if (!enabled) {
      setFilters((f) => ({
        ...f,
        ...(key === "search" ? { search: "" } : {}),
        ...(key === "supplier" ? { supplierId: "all" } : {}),
        ...(key === "status" ? { status: "all" } : {}),
        ...(key === "warehouse" ? { warehouseId: "all" } : {}),
        ...(key === "buyer" ? { buyer: "all" } : {}),
      }));
    }
  };

  const resetAllFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setVisibleFilters(DEFAULT_VISIBLE_FILTERS);
  };

  const PoRowMenu = useCallback(
    ({ data }: { data: ApiPurchaseOrder }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <RowActionsTrigger />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => onEdit(data)}>
            {canWrite ? <Pencil className="mr-1.5 h-3 w-3" /> : <Eye className="mr-1.5 h-3 w-3" />}
            {canWrite ? "Edit" : "View"}
          </DropdownMenuItem>
          {canWrite && data.status === "draft" && (
            <>
              <DropdownMenuItem
                onClick={() => void act(() => confirmPurchaseOrder(data.id), `${data.po_number} confirmed`)}
              >
                <CheckCircle2 className="mr-1.5 h-3 w-3" /> Confirm
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => void act(() => cancelPurchaseOrder(data.id), `${data.po_number} cancelled`)}
              >
                <Ban className="mr-1.5 h-3 w-3" /> Cancel
              </DropdownMenuItem>
            </>
          )}
          {canWrite && (data.status === "confirmed" || data.status === "partial_received") && (
            <DropdownMenuItem onClick={() => onReceive(data)}>
              <PackageCheck className="mr-1.5 h-3 w-3" /> Receive goods
            </DropdownMenuItem>
          )}
          {canWrite && onReturn && purchaseOrderIsReturnable(data) && (
            <DropdownMenuItem onClick={() => onReturn(data)}>
              <Undo2 className="mr-1.5 h-3 w-3" /> Return goods
            </DropdownMenuItem>
          )}
          {canWrite && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => openDeleteConfirm([data])}
              >
                <Trash2 className="mr-1.5 h-3 w-3" /> Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    [act, canWrite, onEdit, onReceive, onReturn, openDeleteConfirm],
  );

  const ControlsCell = useCallback(
    (p: ICellRendererParams<ApiPurchaseOrder>) => {
      if (!p.data) return null;
      const on = Boolean(starred[p.data.id]);
      return (
        <div className="flex h-full items-center">
          <button
            type="button"
            className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label={on ? "Unfavorite" : "Favorite"}
            onClick={(e) => {
              e.stopPropagation();
              setStarred((prev) => ({ ...prev, [p.data!.id]: !prev[p.data!.id] }));
            }}
          >
            <Star className={cn("h-3 w-3", on && "fill-amber-400 text-amber-400")} aria-hidden />
          </button>
        </div>
      );
    },
    [starred],
  );

  const columnDefs = useMemo<ColDef<ApiPurchaseOrder>[]>(
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
        cellRenderer: (p: ICellRendererParams<ApiPurchaseOrder>) =>
          p.data ? <PoRowMenu data={p.data} /> : null,
      },
      {
        colId: "controls",
        headerName: "",
        headerCheckboxSelection: canWrite,
        checkboxSelection: canWrite,
        width: canWrite ? 40 : 24,
        maxWidth: canWrite ? 40 : 24,
        minWidth: canWrite ? 40 : 24,
        pinned: "left",
        resizable: false,
        suppressMovable: true,
        suppressHeaderMenuButton: true,
        suppressSizeToFit: true,
        sortable: false,
        headerClass: "product-grid-controls-col",
        cellClass: "product-grid-controls-col",
        cellRenderer: ControlsCell,
      },
      {
        colId: "poNumber",
        field: "po_number",
        headerName: COLUMN_LABELS.poNumber,
        hide: !resolvedCols.poNumber,
        pinned: "left",
        width: 128,
        minWidth: 108,
        cellClass: "font-mono text-[11px]",
        cellRenderer: (p: ICellRendererParams<ApiPurchaseOrder>) =>
          p.data ? (
            <button
              type="button"
              className="block w-full cursor-pointer truncate text-left font-semibold text-foreground no-underline hover:text-primary hover:no-underline focus-visible:outline-none"
              title={p.data.po_number}
              onClick={(e) => {
                e.stopPropagation();
                onEdit(p.data!);
              }}
            >
              {p.data.po_number}
            </button>
          ) : null,
      },
      {
        colId: "supplier",
        field: "supplier_name",
        headerName: COLUMN_LABELS.supplier,
        hide: !resolvedCols.supplier,
        flex: 1.4,
        minWidth: 160,
        tooltipField: "supplier_name",
        cellRenderer: (p: ICellRendererParams<ApiPurchaseOrder>) => {
          const name = p.data?.supplier_name?.trim();
          if (!name) return "—";
          return (
            <button
              type="button"
              className="min-w-0 max-w-full cursor-pointer truncate text-left text-foreground no-underline hover:text-primary hover:no-underline focus-visible:outline-none"
              title={name}
              onClick={(e) => {
                e.stopPropagation();
                const id = p.data?.supplier_id;
                if (!id) {
                  toast.error("No supplier record for this order");
                  return;
                }
                setSupplierDrawerId(id);
              }}
            >
              {name}
            </button>
          );
        },
      },
      {
        colId: "address",
        headerName: COLUMN_LABELS.address,
        hide: !resolvedCols.address,
        flex: 1.2,
        minWidth: 140,
        valueGetter: (p) => supplierAddress(supplierById.get(p.data?.supplier_id ?? "")),
        valueFormatter: (p) => (p.value ? String(p.value) : "—"),
      },
      {
        colId: "referenceNo",
        headerName: COLUMN_LABELS.referenceNo,
        hide: !resolvedCols.referenceNo,
        width: 130,
        minWidth: 110,
        valueGetter: (p) => parsePoNotes(p.data?.notes).referenceNo,
        valueFormatter: (p) => (p.value ? String(p.value) : "—"),
      },
      {
        colId: "orderDate",
        field: "order_date",
        headerName: COLUMN_LABELS.orderDate,
        hide: !resolvedCols.orderDate,
        width: 128,
        minWidth: 112,
        valueFormatter: (p) => formatDate(p.value),
      },
      {
        colId: "status",
        field: "status",
        headerName: COLUMN_LABELS.status,
        hide: !resolvedCols.status,
        width: 130,
        minWidth: 110,
        cellRenderer: (p: ICellRendererParams<ApiPurchaseOrder>) => {
          const status = p.data?.status;
          if (!status) return null;
          return (
            <GridChipBadge className={PO_STATUS_TONE[status]} title={PO_STATUS_LABEL[status] ?? status}>
              {PO_STATUS_LABEL[status] ?? status}
            </GridChipBadge>
          );
        },
      },
      {
        colId: "warehouse",
        field: "warehouse_name",
        headerName: COLUMN_LABELS.warehouse,
        hide: !resolvedCols.warehouse,
        width: 160,
        minWidth: 130,
        valueFormatter: (p) => (p.value ? String(p.value) : "—"),
      },
      {
        colId: "expectedDate",
        field: "expected_date",
        headerName: COLUMN_LABELS.expectedDate,
        hide: !resolvedCols.expectedDate,
        width: 128,
        minWidth: 112,
        valueFormatter: (p) => formatDate(p.value),
      },
      {
        colId: "buyer",
        field: "buyer_name",
        headerName: COLUMN_LABELS.buyer,
        hide: !resolvedCols.buyer,
        width: 140,
        minWidth: 110,
        valueFormatter: (p) => (p.value ? String(p.value) : "—"),
      },
      {
        colId: "createdBy",
        field: "created_by_name",
        headerName: COLUMN_LABELS.createdBy,
        hide: !resolvedCols.createdBy,
        width: 140,
        minWidth: 110,
        tooltipValueGetter: () => "Which account created this purchase order",
        valueFormatter: (p) => (p.value ? String(p.value) : "Default"),
      },
      {
        colId: "products",
        headerName: COLUMN_LABELS.products,
        hide: !resolvedCols.products,
        flex: 1.6,
        minWidth: 160,
        tooltipValueGetter: (p) => (p.data ? productLabel(p.data) : ""),
        valueGetter: (p) => (p.data ? productLabel(p.data) : ""),
        valueFormatter: (p) => (p.value ? String(p.value) : "—"),
      },
      {
        colId: "quantity",
        headerName: COLUMN_LABELS.quantity,
        hide: !resolvedCols.quantity,
        width: 100,
        minWidth: 84,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueGetter: (p) => (p.data ? qtyOrdered(p.data) : 0),
      },
      {
        colId: "unitCost",
        headerName: COLUMN_LABELS.unitCost,
        hide: !resolvedCols.unitCost,
        width: 110,
        minWidth: 90,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueGetter: (p) => (p.data ? avgUnitCost(p.data) : 0),
        valueFormatter: (p) => formatCurrency(Number(p.value ?? 0)),
      },
      {
        colId: "discount",
        field: "discount_total",
        headerName: COLUMN_LABELS.discount,
        hide: !resolvedCols.discount,
        width: 100,
        minWidth: 80,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueFormatter: (p) => formatCurrency(Number(p.value ?? 0)),
      },
      {
        colId: "amount",
        field: "total",
        headerName: COLUMN_LABELS.amount,
        hide: !resolvedCols.amount,
        width: 120,
        minWidth: 100,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: `${NUMERIC_CELL} font-medium`,
        valueFormatter: (p) => formatCurrency(Number(p.value ?? 0)),
      },
      {
        colId: "received",
        headerName: COLUMN_LABELS.received,
        hide: !resolvedCols.received,
        width: 120,
        minWidth: 100,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueGetter: (p) => (p.data ? qtyReceived(p.data) : 0),
        cellRenderer: (p: ICellRendererParams<ApiPurchaseOrder>) =>
          p.data ? (
            <span className="block w-full text-right tabular-nums">
              {qtyReceived(p.data)}{" "}
              <span className="text-muted-foreground">({receivedPct(p.data)}%)</span>
            </span>
          ) : null,
      },
      {
        colId: "billed",
        headerName: COLUMN_LABELS.billed,
        hide: !resolvedCols.billed,
        width: 90,
        minWidth: 76,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueGetter: (p) => billedByOrderId?.get(p.data?.id ?? "") ?? 0,
      },
      {
        colId: "paymentTerms",
        headerName: COLUMN_LABELS.paymentTerms,
        hide: !resolvedCols.paymentTerms,
        width: 130,
        minWidth: 110,
        valueGetter: (p) => parsePoNotes(p.data?.notes).paymentTerms,
        valueFormatter: (p) => (p.value ? String(p.value) : "—"),
      },
      {
        colId: "updatedAt",
        field: "updated_at",
        headerName: COLUMN_LABELS.updatedAt,
        hide: !resolvedCols.updatedAt,
        width: 116,
        minWidth: 96,
        valueFormatter: (p) => formatDate(p.value),
      },
    ],
    [
      ControlsCell,
      PoRowMenu,
      billedByOrderId,
      canWrite,
      onEdit,
      resolvedCols,
      supplierById,
    ],
  );

  return (
    <AgainListGrid<ApiPurchaseOrder>
      className={className}
      rowData={filtered}
      columnDefs={columnDefs}
      loading={loading}
      headerLeftActions={headerLeftActions}
      filterBar={
        <>
          {resolvedVisibleFilters.search && (
            <Input
              placeholder="Search PO, supplier, product…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="w-[220px] shrink-0 rounded-none"
            />
          )}
          {resolvedVisibleFilters.supplier && (
            <FilterSelect
              value={filters.supplierId}
              onChange={(supplierId) => setFilters((f) => ({ ...f, supplierId }))}
              width="w-[200px]"
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
              width="w-[160px]"
              className="shrink-0"
              ariaLabel="Purchase status"
              options={[
                { value: "all", label: "All statuses" },
                { value: "draft", label: "Draft" },
                { value: "confirmed", label: "Confirmed" },
                { value: "partial_received", label: "Partially Received" },
                { value: "completed", label: "Fully Received" },
                { value: "cancelled", label: "Cancelled" },
              ]}
            />
          )}
          {resolvedVisibleFilters.warehouse && (
            <FilterSelect
              value={filters.warehouseId}
              onChange={(warehouseId) => setFilters((f) => ({ ...f, warehouseId }))}
              width="w-[200px]"
              className="shrink-0"
              ariaLabel="Business location"
              options={[
                { value: "all", label: "All locations" },
                ...warehouseOptions.map(([value, label]) => ({ value, label })),
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
      banner={
        selected.length > 0 ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-2 py-1.5">
            <span className="text-xs font-medium">{selected.length} selected</span>
            <Button variant="outline" size="sm" className="rounded-none" onClick={exportCsv}>
              Export selected
            </Button>
            {canWrite && (
              <Button
                variant="destructive"
                size="sm"
                className="rounded-none"
                onClick={() => openDeleteConfirm(selected)}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete selected
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 w-7 rounded-none p-0"
              onClick={() => {
                setSelected([]);
                gridApiRef.current?.deselectAll();
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : null
      }
      footerLeftActions={footerLeftActions}
      emptyTitle="No purchase orders match your filters"
      emptyHint="Raise one against a supplier or clear the filters"
      onResetFilters={() => setFilters(DEFAULT_FILTERS)}
      onOpenColumns={() => setColumnSheetOpen(true)}
      apiRef={gridApiRef}
      gridProps={{
        rowSelection: "multiple",
        suppressRowClickSelection: true,
        onSelectionChanged: (e) => setSelected(e.api.getSelectedRows()),
      }}
      mobile={
        <div className="divide-y divide-border">
          {filtered.map((order) => (
            <button
              key={order.id}
              type="button"
              className="block w-full px-3 py-2.5 text-left"
              onClick={() => onEdit(order)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm font-medium">{order.po_number}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {order.supplier_name ?? "Supplier"} · {formatDate(order.order_date)}
                  </p>
                </div>
                <GridChipBadge
                  className={cn("shrink-0", PO_STATUS_TONE[order.status])}
                >
                  {PO_STATUS_LABEL[order.status] ?? order.status}
                </GridChipBadge>
              </div>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">
                {productLabel(order) || "No products"} · {formatCurrency(Number(order.total))}
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
              <label
                key={key}
                className="flex cursor-pointer items-center gap-2 text-xs text-foreground"
              >
                <input
                  type="checkbox"
                  checked={resolvedVisibleFilters[key]}
                  onChange={(e) => toggleVisibleFilter(key, e.target.checked)}
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
            onClick={resetAllFilters}
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
              <label
                key={key}
                className="flex cursor-pointer items-center gap-2 text-xs text-foreground"
              >
                <input
                  type="checkbox"
                  checked={resolvedCols[key]}
                  onChange={(e) => setVisibleCols((v) => ({ ...v, [key]: e.target.checked }))}
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
              {deleteTargets.length === 1 ? "Delete purchase order?" : "Delete purchase orders?"}
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              {deleteTargets.length === 1
                ? `${deleteTargets[0]?.po_number} will be permanently deleted. Orders with received goods are blocked.`
                : `${deleteTargets.length} purchase orders will be permanently deleted. Orders with received goods are skipped.`}
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

      <SupplierDetailDrawer
        open={Boolean(supplierDrawerId)}
        supplierId={supplierDrawerId}
        onOpenChange={(next) => {
          if (!next) setSupplierDrawerId(null);
        }}
        onChanged={onChanged}
      />
    </AgainListGrid>
  );
});
