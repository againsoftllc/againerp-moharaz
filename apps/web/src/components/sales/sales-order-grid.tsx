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
import {
  ClipboardList,
  Eye,
  Link2,
  Star,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ORDER_STATUS_LABELS, type Order, type OrderStatus } from "@/lib/mock-data/orders";
import {
  createSalesInvoicePublicLink,
  isSalesQuotation,
  salesPublicInvoiceUrl,
  type SalesRecordMeta,
} from "@/lib/api/sales";
import type { SalesListSort } from "@/lib/api/use-sales-orders";
import { AgainPartnerDrawer } from "@/components/shared/again-partner-drawer";
import { buildMinimalPartnerFromSales } from "@/lib/mock-data/partner-drawer-seed";
import type { Customer } from "@/lib/mock-data/customers";
import type { SalesListFilter } from "@/components/sales/sales-module-chrome";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { useAdminCanWrite, useAdminIsAdmin } from "@/lib/hooks/use-admin-can-write";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { FilterSelect } from "@/components/shared/filter-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RowActionsTrigger } from "@/components/shared/row-actions-icon";
import { GridFullscreenHeader } from "@/components/shared/grid-fullscreen";
import {
  AgainListGrid,
  AgainListGridSkeleton,
  NUMERIC_CELL,
  NUMERIC_HEADER,
  type AgainListServerPaging,
} from "@/components/shared/again-list-grid";
import { useActivityStore } from "@/lib/store/activity-store";
import { statusBadgeProps } from "@/lib/order-status";


/** Current user mock for "My Quotations" facet. */
const MY_STAFF = "Karim Ahmed";

type Row = Order & Partial<SalesRecordMeta>;

/**
 * Grid column → API `sort_by`. Only these columns sort; the rest are computed
 * client-side (paid/due) or not indexed, and sorting one page of a server-paged
 * list would mislead.
 */
const SORT_KEYS: Record<string, string> = {
  orderNumber: "order_number",
  invoiceNumber: "invoice_number",
  customer: "customer_name",
  orderDate: "order_date",
  amount: "total",
  discount: "discount_total",
  tax: "tax_total",
  status: "status",
};

const COLUMN_KEYS = [
  "invoiceNumber",
  "orderDate",
  "phone",
  "email",
  "city",
  "branch",
  "items",
  "amount",
  "paid",
  "due",
  "returned",
  "refundDue",
  "discount",
  "tax",
  "shipping",
  "paymentStatus",
  "paymentMethod",
  "shipmentStatus",
  "courier",
  "source",
  "assignedStaff",
  "priority",
  "tags",
  "customerGroup",
] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  invoiceNumber: "Invoice #",
  orderDate: "Date",
  phone: "Phone",
  email: "Email",
  city: "City",
  branch: "Warehouse",
  items: "Items",
  amount: "Amount",
  paid: "Paid",
  due: "Due",
  returned: "Returned",
  refundDue: "Refund due",
  discount: "Discount",
  tax: "Tax",
  shipping: "Shipping",
  paymentStatus: "Payment",
  paymentMethod: "Pay Method",
  shipmentStatus: "Shipment",
  courier: "Courier",
  source: "Source",
  assignedStaff: "Assigned",
  priority: "Priority",
  tags: "Tags",
  customerGroup: "Customer Group",
};

const DEFAULT_VISIBLE: Record<ColumnKey, boolean> = {
  invoiceNumber: true,
  orderDate: true,
  phone: true,
  email: false,
  city: false,
  branch: true,
  items: true,
  amount: true,
  paid: true,
  due: true,
  returned: true,
  refundDue: true,
  discount: false,
  tax: false,
  shipping: false,
  paymentStatus: true,
  paymentMethod: false,
  shipmentStatus: true,
  courier: false,
  source: false,
  assignedStaff: false,
  priority: false,
  tags: false,
  customerGroup: false,
};

type FilterState = {
  search: string;
  paymentStatus: string;
  branch: string;
  shipmentStatus: string;
  paymentMethod: string;
  priority: string;
  customerGroup: string;
};

const DEFAULT_FILTERS: FilterState = {
  search: "",
  paymentStatus: "all",
  branch: "all",
  shipmentStatus: "all",
  paymentMethod: "all",
  priority: "all",
  customerGroup: "all",
};

/** Money column: numeric value (sorts/aligns as a number), currency only at display time. */
/** The status a row shows: a website order's customer-facing status, else its Sales status. */
function shownOrderStatus(o: Order): OrderStatus {
  const web = o.websiteStatus as OrderStatus | undefined;
  return web && web in ORDER_STATUS_LABELS ? web : o.status;
}

function moneyCol(get: (o: Order) => number): Pick<
  ColDef<Order>,
  "valueGetter" | "valueFormatter" | "cellClass" | "headerClass"
> {
  return {
    valueGetter: (p) => (p.data ? get(p.data) : null),
    valueFormatter: (p) => (p.value == null || p.value === "" ? "" : formatCurrency(Number(p.value))),
    cellClass: NUMERIC_CELL,
    headerClass: NUMERIC_HEADER,
  };
}

function isBulkDeletable(o: Row): boolean {
  return !isSalesQuotation(o) && (o.status === "draft" || o.status === "cancelled");
}

function sameSort(a: SalesListSort | null, b: SalesListSort | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.by === b.by && a.dir === b.dir;
}

// comparator → 0: rows arrive already sorted by the API; AG Grid's own sort
// must not re-order the page (its stable sort then keeps the server order).
const GRID_DEFAULT_COL_DEF: ColDef<Order> = { minWidth: 72, comparator: () => 0 };

type Props = {
  orders: Row[];
  /** First load only — later fetches keep the grid mounted so sort/selection survive. */
  loading?: boolean;
  /** Real server paging (page/pageSize/total from the API). */
  serverPaging?: AgainListServerPaging;
  /** Server sort state; header clicks report through `onSortChange`. */
  sort?: SalesListSort | null;
  onSortChange?: (sort: SalesListSort | null) => void;
  /** Quotations / My Quotations facet. */
  listFilter?: SalesListFilter;
  onListFilterChange?: (filter: SalesListFilter) => void;
  /** Search is server-side: the value is mirrored into the input, the API filters. */
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  /** Open order form (view + edit are the same page). */
  onOpen?: (order: Order) => void;
  onStatusChange?: (id: string, status: OrderStatus) => void;
  onBulkDelete?: (ids: string[]) => void;
  onBulkStatusChange?: (ids: string[], status: OrderStatus) => void;
  onAdvancedFilterCountChange?: (count: number) => void;
  /** Reports visible row count for pager (e.g. 1–4 / 4). */
  onFilteredCountChange?: (count: number) => void;
  footerLeftActions?: ReactNode;
  /** Left of filter bar — usually New (dropshipping products pattern). */
  headerLeftActions?: ReactNode;
  className?: string;
};

export type SalesOrderGridHandle = {
  openFilters: () => void;
  openColumns: () => void;
};

export const SalesOrderGrid = forwardRef<SalesOrderGridHandle, Props>(function SalesOrderGrid(
  {
    orders,
    loading = false,
    serverPaging,
    sort = null,
    onSortChange,
    listFilter = "all",
    onListFilterChange,
    searchQuery,
    onSearchChange,
    onOpen,
    onStatusChange,
    onBulkDelete,
    onBulkStatusChange,
    onAdvancedFilterCountChange,
    onFilteredCountChange,
    footerLeftActions,
    headerLeftActions,
    className,
  },
  ref,
) {
  const canWrite = useAdminCanWrite();
  const isAdmin = useAdminIsAdmin();
  const openOrder = useCallback(
    (order: Order) => {
      onOpen?.(order);
    },
    [onOpen],
  );

  const [rowData, setRowData] = useState(orders);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [visibleCols, setVisibleCols] = useState(DEFAULT_VISIBLE);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);
  const [selected, setSelected] = useState<Order[]>([]);
  const [starred, setStarred] = useState<Record<string, boolean>>({});
  const [partnerRecord, setPartnerRecord] = useState<Customer | null>(null);
  const [partnerSheetOpen, setPartnerSheetOpen] = useState(false);

  const openPartnerDrawer = useCallback((order: Order) => {
    if (!order.customer?.id || order.customer.id === "guest") {
      toast.error("No customer record for this order");
      return;
    }
    setPartnerRecord(
      buildMinimalPartnerFromSales(
        order.customer.id,
        order.customer.name,
        order.customer.email,
        order.customer.phone,
      ),
    );
    setPartnerSheetOpen(true);
  }, []);

  useEffect(() => {
    if (searchQuery === undefined) return;
    setFilters((f) => (f.search === searchQuery ? f : { ...f, search: searchQuery }));
  }, [searchQuery]);

  useEffect(() => {
    setRowData(orders);
  }, [orders]);

  const branches = useMemo(
    () => [...new Set(rowData.map((o) => o.branch).filter(Boolean))].sort(),
    [rowData],
  );
  const paymentMethods = useMemo(
    () => [...new Set(rowData.map((o) => o.payment.method).filter(Boolean))].sort(),
    [rowData],
  );
  const customerGroups = useMemo(
    () => [...new Set(rowData.map((o) => o.customer.group).filter(Boolean))].sort(),
    [rowData],
  );

  const filtered = useMemo(() => {
    return rowData.filter((o) => {
      const quotation = isSalesQuotation(o);
      if (listFilter === "quotations" && !quotation) return false;
      if (listFilter === "all" && quotation) return false;
      if (listFilter === "my_quotations") {
        if (!quotation) return false;
        if (o.assignedStaff && o.assignedStaff !== MY_STAFF) return false;
      }
      // Search is applied by the API (order #, invoice #, customer) — no second pass here.
      if (filters.paymentStatus !== "all" && o.paymentStatus !== filters.paymentStatus) return false;
      if (filters.branch !== "all" && o.branch !== filters.branch) return false;
      if (filters.shipmentStatus !== "all" && o.shipmentStatus !== filters.shipmentStatus) return false;
      if (filters.paymentMethod !== "all" && o.payment.method !== filters.paymentMethod) return false;
      if (filters.priority !== "all" && o.priority !== filters.priority) return false;
      if (filters.customerGroup !== "all" && o.customer.group !== filters.customerGroup) return false;
      return true;
    });
  }, [rowData, listFilter, filters]);

  const advancedCount = [
    filters.search !== "",
    filters.paymentStatus !== "all",
    filters.branch !== "all",
    filters.shipmentStatus !== "all",
    filters.paymentMethod !== "all",
    filters.priority !== "all",
    filters.customerGroup !== "all",
  ].filter(Boolean).length;

  useEffect(() => {
    onFilteredCountChange?.(filtered.length);
  }, [filtered.length, onFilteredCountChange]);

  useEffect(() => {
    onAdvancedFilterCountChange?.(advancedCount);
  }, [advancedCount, onAdvancedFilterCountChange]);

  useImperativeHandle(
    ref,
    () => ({
      openFilters: () => setFilterSheetOpen(true),
      openColumns: () => setColumnSheetOpen(true),
    }),
    [],
  );

  const StatusCell = useCallback(
    ({ data }: ICellRendererParams<Order>) => {
      if (!data) return null;
      // a website order shows the status the shopper sees (the drawer's Order status), not its Sales status
      const shown = shownOrderStatus(data);
      const badge = statusBadgeProps(shown);
      // Status changes only from the order drawer now — no inline grid editor.
      return (
        <span className="inline-flex items-center gap-1">
          <Badge variant={badge.variant} className={cn("capitalize", badge.className)}>
            {ORDER_STATUS_LABELS[shown]}
          </Badge>
          {data.editRequest?.status === "pending" ? (
            <Badge
              variant="outline"
              className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-400"
              title={`Edit requested by ${data.editRequest.requestedByName ?? "staff"}`}
            >
              Edit req.
            </Badge>
          ) : null}
        </span>
      );
    },
    [],
  );

  const OrderRowMenu = useCallback(
    ({ data }: { data: Order }) => {
      const openDrawer = useActivityStore.getState().openDrawer;
      const shareInvoice = async () => {
        if (isSalesQuotation(data) || data.id.startsWith("ord_")) {
          toast.error("Save the sales order first, then share its invoice link");
          return;
        }
        try {
          const link = await createSalesInvoicePublicLink(data.id);
          const url = salesPublicInvoiceUrl(link.path);
          await navigator.clipboard.writeText(url);
          toast.success("Public invoice link copied");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not create invoice link");
        }
      };
      const openPublicInvoice = async () => {
        if (isSalesQuotation(data) || data.id.startsWith("ord_")) {
          toast.error("Save the sales order first, then share its invoice link");
          return;
        }
        try {
          const link = await createSalesInvoicePublicLink(data.id);
          window.open(salesPublicInvoiceUrl(link.path), "_blank", "noopener,noreferrer");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not open invoice link");
        }
      };
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <RowActionsTrigger onClick={(e) => e.stopPropagation()} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                openOrder(data);
              }}
            >
              <Eye className="mr-2 h-3.5 w-3.5" /> Open
            </DropdownMenuItem>
            {!isSalesQuotation(data) ? (
              <>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    void shareInvoice();
                  }}
                >
                  <Link2 className="mr-2 h-3.5 w-3.5" /> Copy invoice link
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    void openPublicInvoice();
                  }}
                >
                  <Link2 className="mr-2 h-3.5 w-3.5" /> Open public invoice
                </DropdownMenuItem>
              </>
            ) : null}
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                openDrawer({
                  type: "order",
                  id: data.id,
                  label: data.orderNumber,
                  subtitle: data.customer.name,
                });
              }}
            >
              <ClipboardList className="mr-2 h-3.5 w-3.5" /> Activity
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
    [openOrder],
  );

  const OrderControlsCell = useCallback(
    (p: ICellRendererParams<Order>) => {
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
            <Star
              className={cn("h-3 w-3", on && "fill-amber-400 text-amber-400")}
              aria-hidden
            />
          </button>
        </div>
      );
    },
    [starred],
  );

  const columnDefs = useMemo<ColDef<Order>[]>(() => {
    const cols: ColDef<Order>[] = [
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
        cellRenderer: (p: ICellRendererParams<Order>) =>
          p.data ? <OrderRowMenu data={p.data} /> : null,
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
        cellRenderer: OrderControlsCell,
      },
      {
        field: "orderNumber",
        headerName: "Order #",
        width: 118,
        pinned: "left",
        cellRenderer: (p: ICellRendererParams<Order>) =>
          p.data ? (
            <button
              type="button"
              className="min-w-0 max-w-full cursor-pointer truncate text-left font-semibold text-foreground no-underline hover:text-primary hover:no-underline focus-visible:outline-none"
              title={p.data.orderNumber}
              onClick={(e) => {
                e.stopPropagation();
                openOrder(p.data!);
              }}
            >
              {p.data.orderNumber}
            </button>
          ) : null,
      },
    ];

    if (visibleCols.invoiceNumber)
      cols.push({
        colId: "invoiceNumber",
        headerName: "Invoice #",
        width: 110,
        cellClass: "font-mono text-[11px]",
        valueGetter: (p) => (p.data as Row | undefined)?.invoiceNumber ?? "",
        valueFormatter: (p) => (p.value ? String(p.value) : "—"),
      });

    cols.push(
      {
        colId: "customer",
        headerName: "Customer",
        width: 160,
        valueGetter: (p) => p.data?.customer.name ?? "",
        cellRenderer: (p: ICellRendererParams<Order>) =>
          p.data ? (
            <button
              type="button"
              className="min-w-0 max-w-full cursor-pointer truncate text-left text-foreground no-underline hover:text-primary hover:no-underline focus-visible:outline-none"
              title={p.data.customer.name}
              onClick={(e) => {
                e.stopPropagation();
                openPartnerDrawer(p.data!);
              }}
            >
              {p.data.customer.name}
            </button>
          ) : null,
      },
    );

    if (visibleCols.orderDate)
      cols.push({
        colId: "orderDate",
        headerName: "Date",
        width: 110,
        valueGetter: (p) => p.data?.orderDate ?? "",
        valueFormatter: (p) => (p.value ? formatDate(String(p.value)) : ""),
      });

    if (visibleCols.phone)
      cols.push({
        colId: "phone",
        headerName: "Phone",
        width: 128,
        valueGetter: (p) => p.data?.customer.phone?.trim() || "—",
      });

    if (visibleCols.email)
      cols.push({
        colId: "email",
        headerName: "Email",
        width: 170,
        valueGetter: (p) => p.data?.customer.email?.trim() || "—",
      });

    if (visibleCols.city)
      cols.push({
        colId: "city",
        headerName: "City",
        width: 100,
        valueGetter: (p) =>
          p.data?.shipping.city?.trim() ||
          p.data?.billing.city?.trim() ||
          "—",
      });

    if (visibleCols.branch) cols.push({ field: "branch", headerName: "Warehouse", width: 110 });

    if (visibleCols.items)
      cols.push({
        colId: "items",
        headerName: "Items",
        width: 72,
        valueGetter: (p) => p.data?.items.length ?? 0,
        cellClass: NUMERIC_CELL,
        headerClass: NUMERIC_HEADER,
      });

    if (visibleCols.amount)
      cols.push({
        colId: "amount",
        headerName: "Amount",
        width: 112,
        ...moneyCol((o) => o.grandTotal),
      });

    if (visibleCols.paid)
      cols.push({
        colId: "paid",
        headerName: "Paid",
        width: 100,
        ...moneyCol((o) => o.payment.paidAmount ?? 0),
      });

    if (visibleCols.due)
      cols.push({
        colId: "due",
        headerName: "Due",
        width: 100,
        ...moneyCol((o) => o.payment.dueAmount ?? 0),
      });

    if (visibleCols.returned)
      cols.push({
        colId: "returned",
        headerName: "Returned",
        width: 104,
        ...moneyCol((o) => o.returnedTotal ?? 0),
      });

    if (visibleCols.refundDue)
      cols.push({
        colId: "refundDue",
        headerName: "Refund due",
        width: 104,
        ...moneyCol((o) => {
          const netTotal = Math.max(0, o.grandTotal - (o.returnedTotal ?? 0));
          return Math.max(0, (o.payment.paidAmount ?? 0) - netTotal);
        }),
      });

    if (visibleCols.discount)
      cols.push({
        colId: "discount",
        headerName: "Discount",
        width: 100,
        ...moneyCol((o) => o.discountAmount ?? 0),
      });

    if (visibleCols.tax)
      cols.push({
        colId: "tax",
        headerName: "Tax",
        width: 90,
        ...moneyCol((o) => o.taxAmount ?? 0),
      });

    if (visibleCols.shipping)
      cols.push({
        colId: "shipping",
        headerName: "Shipping",
        width: 100,
        ...moneyCol((o) => o.shippingAmount ?? 0),
      });

    if (visibleCols.paymentStatus)
      cols.push({
        colId: "paymentStatus",
        headerName: "Payment",
        width: 100,
        cellRenderer: (p: ICellRendererParams<Order>) =>
          p.data ? (
            <span className="capitalize text-[11px]">{p.data.paymentStatus}</span>
          ) : null,
      });

    if (visibleCols.paymentMethod)
      cols.push({
        colId: "paymentMethod",
        headerName: "Pay Method",
        width: 110,
        valueGetter: (p) => p.data?.payment.method || "—",
      });

    if (visibleCols.shipmentStatus)
      cols.push({
        colId: "shipmentStatus",
        headerName: "Shipment",
        width: 110,
        cellRenderer: (p: ICellRendererParams<Order>) =>
          p.data ? (
            <span className="capitalize text-[11px]">{p.data.shipmentStatus}</span>
          ) : null,
      });

    if (visibleCols.courier)
      cols.push({
        colId: "courier",
        headerName: "Courier",
        width: 120,
        valueGetter: (p) => {
          const courier = p.data?.shipment.courier?.trim();
          const tracking = p.data?.shipment.trackingNumber?.trim();
          if (courier && tracking) return `${courier} · ${tracking}`;
          return courier || tracking || "—";
        },
        tooltipValueGetter: (p) => {
          const courier = p.data?.shipment.courier?.trim();
          const tracking = p.data?.shipment.trackingNumber?.trim();
          if (courier && tracking) return `${courier} · ${tracking}`;
          return courier || tracking || "";
        },
      });

    if (visibleCols.source) cols.push({ field: "source", headerName: "Source", width: 96 });

    if (visibleCols.assignedStaff)
      cols.push({
        colId: "assignedStaff",
        headerName: "Assigned",
        width: 120,
        valueGetter: (p) => p.data?.assignedStaff ?? "—",
      });

    if (visibleCols.priority)
      cols.push({
        colId: "priority",
        headerName: "Priority",
        width: 90,
        cellRenderer: (p: ICellRendererParams<Order>) =>
          p.data ? (
            <span className="capitalize text-[11px]">{p.data.priority}</span>
          ) : null,
      });

    if (visibleCols.tags)
      cols.push({
        colId: "tags",
        headerName: "Tags",
        width: 140,
        valueGetter: (p) =>
          p.data?.tags?.length ? p.data.tags.join(", ") : "—",
        tooltipValueGetter: (p) =>
          p.data?.tags?.length ? p.data.tags.join(", ") : "",
      });

    if (visibleCols.customerGroup)
      cols.push({
        colId: "customerGroup",
        headerName: "Customer Group",
        width: 120,
        valueGetter: (p) => p.data?.customer.group || "—",
      });

    cols.push({
      colId: "status",
      field: "status",
      headerName: "Status",
      width: 160,
      cellRenderer: StatusCell,
    });

    // Sorting is server-side: only API-sortable columns get a header sort, and
    // the indicator mirrors the query's sort rather than AG Grid's own state.
    return cols.map((col) => {
      if (col.sortable === false) return col;
      const key = SORT_KEYS[col.colId ?? col.field ?? ""];
      if (!key) return { ...col, sortable: false };
      return { ...col, sortable: true, sort: sort?.by === key ? sort.dir : null };
    });
  }, [
    OrderControlsCell,
    OrderRowMenu,
    StatusCell,
    canWrite,
    openOrder,
    openPartnerDrawer,
    sort,
    visibleCols,
  ]);

  const handleSortChanged = useCallback(
    (api: { getColumnState: () => { colId: string; sort?: "asc" | "desc" | null }[] }) => {
      if (!onSortChange) return;
      const active = api.getColumnState().find((c) => c.sort);
      const key = active ? SORT_KEYS[active.colId] : undefined;
      const next: SalesListSort | null =
        active && key && active.sort ? { by: key, dir: active.sort } : null;
      if (sameSort(next, sort)) return;
      onSortChange(next);
    },
    [onSortChange, sort],
  );

  const selectionDeletable = selected.length > 0 && selected.every(isBulkDeletable);

  const resetAllFilters = () => {
    setFilters(DEFAULT_FILTERS);
    onSearchChange?.("");
  };

  return (
    <AgainListGrid<Order>
      className={className}
      rowData={filtered}
      columnDefs={columnDefs}
      loading={loading}
      serverPaging={serverPaging}
      headerLeftActions={headerLeftActions}
      footerLeftActions={footerLeftActions}
      filterBar={
        <>
          <Input
            placeholder="Search order #, customer…"
            value={filters.search}
            onChange={(e) => {
              const next = e.target.value;
              setFilters((f) => ({ ...f, search: next }));
              onSearchChange?.(next);
            }}
            className="w-[220px] shrink-0 rounded-none"
          />
          <FilterSelect
            value={listFilter}
            onChange={(next) => onListFilterChange?.(next as SalesListFilter)}
            width="w-[152px]"
            className="shrink-0"
            ariaLabel="List type"
            options={[
              { value: "all", label: "Orders" },
              { value: "quotations", label: "Quotations" },
              { value: "my_quotations", label: "My Quotations" },
            ]}
          />
          <FilterSelect
            value={filters.paymentStatus}
            onChange={(paymentStatus) => setFilters((f) => ({ ...f, paymentStatus }))}
            width="w-[140px]"
            className="shrink-0"
            ariaLabel="Payment status"
            options={[
              { value: "all", label: "All payments" },
              { value: "paid", label: "Paid" },
              { value: "unpaid", label: "Unpaid" },
              { value: "partial", label: "Partial" },
              { value: "refunded", label: "Refunded" },
            ]}
          />
          <FilterSelect
            value={filters.branch}
            onChange={(branch) => setFilters((f) => ({ ...f, branch }))}
            width="w-[140px]"
            className="shrink-0"
            ariaLabel="Warehouse"
            options={[
              { value: "all", label: "All warehouses" },
              ...branches.map((b) => ({ value: b, label: b })),
            ]}
          />
        </>
      }
      banner={
        selected.length > 0 && canWrite ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-primary/30 bg-primary/5 px-3 py-2">
            <span className="text-xs font-medium">{selected.length} selected</span>
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => {
                const ids = selected.map((row) => row.id);
                onBulkStatusChange?.(ids, "confirmed");
                setSelected([]);
              }}
            >
              Update status
            </Button>
            {onBulkDelete && isAdmin ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-destructive hover:text-destructive"
                disabled={!selectionDeletable}
                title={
                  selectionDeletable
                    ? undefined
                    : "Only draft or cancelled orders can be deleted — deselect the others"
                }
                onClick={() => {
                  const ids = selected.map((row) => row.id);
                  if (!window.confirm(`Delete ${ids.length} order(s)? This cannot be undone.`)) return;
                  onBulkDelete(ids);
                  setSelected([]);
                }}
              >
                Delete
              </Button>
            ) : null}
            <Button size="sm" variant="outline" className="h-7" onClick={() => toast.success("Export selected (mock)")}>
              Export
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 w-7 p-0"
              onClick={() => setSelected([])}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : null
      }
      emptyTitle="No orders match your filters"
      emptyHint="Clear filters or create a new order"
      onResetFilters={resetAllFilters}
      onOpenColumns={() => setColumnSheetOpen(true)}
      defaultColDef={GRID_DEFAULT_COL_DEF}
      gridProps={{
        rowSelection: "multiple",
        suppressRowClickSelection: true,
        onSelectionChanged: (e) => setSelected(e.api.getSelectedRows()),
        onSortChanged: (e) => handleSortChanged(e.api),
      }}
      mobile={
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
          {loading ? (
            <AgainListGridSkeleton rows={6} />
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No orders match filters</p>
          ) : (
            filtered.slice(0, 50).map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => openOrder(o)}
                className="flex w-full gap-3 border border-input bg-card p-3 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-primary">{o.orderNumber}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{o.customer.name}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{formatCurrency(o.grandTotal)}</span>
                    <Badge
                      variant={statusBadgeProps(shownOrderStatus(o)).variant}
                      className={cn("text-[9px] capitalize", statusBadgeProps(shownOrderStatus(o)).className)}
                    >
                      {ORDER_STATUS_LABELS[shownOrderStatus(o)]}
                    </Badge>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      }
    >
      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent side="right" className="w-full max-w-sm overflow-y-auto">
          <h2 className="pr-8 text-base font-semibold">Filters</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Narrow the list by any of these. Search is in the filter bar.
          </p>
          <div className="mt-4 space-y-3">
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Payment</span>
              <Select
                value={filters.paymentStatus}
                onChange={(e) => setFilters((f) => ({ ...f, paymentStatus: e.target.value }))}
                className="w-full"
              >
                <option value="all">All payments</option>
                <option value="paid">Paid</option>
                <option value="unpaid">Unpaid</option>
                <option value="partial">Partial</option>
                <option value="refunded">Refunded</option>
              </Select>
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Warehouse</span>
              <Select
                value={filters.branch}
                onChange={(e) => setFilters((f) => ({ ...f, branch: e.target.value }))}
                className="w-full"
              >
                <option value="all">All warehouses</option>
                {branches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Shipment</span>
              <Select
                value={filters.shipmentStatus}
                onChange={(e) => setFilters((f) => ({ ...f, shipmentStatus: e.target.value }))}
                className="w-full"
              >
                <option value="all">All shipment statuses</option>
                <option value="unfulfilled">Unfulfilled</option>
                <option value="partial">Partial</option>
                <option value="shipped">Shipped</option>
                <option value="delivered">Delivered</option>
                <option value="returned">Returned</option>
              </Select>
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Pay method</span>
              <Select
                value={filters.paymentMethod}
                onChange={(e) => setFilters((f) => ({ ...f, paymentMethod: e.target.value }))}
                className="w-full"
              >
                <option value="all">All methods</option>
                {paymentMethods.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Priority</span>
              <Select
                value={filters.priority}
                onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))}
                className="w-full"
              >
                <option value="all">All priorities</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </Select>
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Customer group</span>
              <Select
                value={filters.customerGroup}
                onChange={(e) => setFilters((f) => ({ ...f, customerGroup: e.target.value }))}
                className="w-full"
              >
                <option value="all">All groups</option>
                {customerGroups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <Button variant="outline" size="sm" className="mt-4" onClick={resetAllFilters}>
            Reset all filters
          </Button>
        </SheetContent>
      </Sheet>

      <Sheet open={columnSheetOpen} onOpenChange={setColumnSheetOpen}>
        <SheetContent
          side="right"
          title="Columns"
          resizable
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
                  checked={visibleCols[key]}
                  onChange={(e) =>
                    setVisibleCols((v) => ({ ...v, [key]: e.target.checked }))
                  }
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

      <AgainPartnerDrawer
        open={partnerSheetOpen}
        customer={partnerRecord}
        mode="edit"
        onOpenChange={setPartnerSheetOpen}
      />
    </AgainListGrid>
  );
});
