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
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { ColDef, GridApi, ICellRendererParams } from "ag-grid-community";
import { Eye, Package, ScrollText, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { cn, formatDate } from "@/lib/utils";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useUserScopedState } from "@/lib/hooks/use-user-scoped-state";
import { Badge } from "@/components/ui/badge";
import { GRID_CHIP_CLASS, GridChipBadge } from "@/components/shared/grid-chip-badge";
import { GridRefLink } from "@/components/shared/grid-ref-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FilterSelect } from "@/components/shared/filter-select";
import { RowActionsTrigger } from "@/components/shared/row-actions-icon";
import { GridFullscreenHeader } from "@/components/shared/grid-fullscreen";
import { AgainListGrid } from "@/components/shared/again-list-grid";
import { AgainPartnerDrawer } from "@/components/shared/again-partner-drawer";
import { SerialDetailSheet, serialWhereabouts } from "@/components/inventory/serial-detail-sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  deleteSerial,
  serialLocationLabel,
  serialSourceLabel,
  SERIAL_STATUS_LABEL,
  SERIAL_STATUS_TONE,
  type InventorySerial,
  type SerialListMeta,
  type SerialListParams,
  type SerialStatus,
} from "@/lib/api/inventory-serials";
import { apiSalesOrderToOrder, fetchSalesOrder, persistSalesOrder } from "@/lib/api/sales";
import { getCommerceCustomer } from "@/lib/api/commerce-customers";
import type { Order } from "@/lib/mock-data/orders";
import type { Customer } from "@/lib/mock-data/customers";
import type { Warehouse } from "@/lib/mock-data/inventory";

const SalesOrderFormDrawer = dynamic(
  () =>
    import("@/components/sales/sales-order-form-drawer").then((m) => m.SalesOrderFormDrawer),
  { ssr: false },
);

type FilterState = { search: string; warehouse: string; status: string };
const DEFAULT_FILTERS: FilterState = { search: "", warehouse: "all", status: "all" };

const DEFAULT_VISIBLE = {
  thumbnail: true,
  serial: true,
  name: true,
  sku: true,
  status: true,
  location: true,
  source: true,
  supplier: true,
  customer: true,
  order: true,
  soldAt: true,
  receivedBy: false,
  soldBy: false,
  receivedAt: true,
  warrantyExpires: true,
  rma: false,
};

const COLUMN_LABELS: Record<keyof typeof DEFAULT_VISIBLE, string> = {
  thumbnail: "Image",
  serial: "Serial",
  name: "Product",
  sku: "SKU",
  status: "Status",
  location: "Location",
  source: "Source",
  supplier: "Supplier",
  customer: "Customer",
  order: "Order #",
  soldAt: "Sold on",
  receivedBy: "Received by",
  soldBy: "Sold by",
  receivedAt: "Received",
  warrantyExpires: "Warranty until",
  rma: "RMA",
};

/** "3 days ago" — the user wants purchase age at a glance, not just a raw date. */
function daysAgoLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const purchased = new Date(iso);
  if (Number.isNaN(purchased.getTime())) return "—";
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfPurchase = new Date(purchased);
  startOfPurchase.setHours(0, 0, 0, 0);
  const diffDays = Math.round((startOfToday.getTime() - startOfPurchase.getTime()) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "1 day ago";
  return `${diffDays} days ago`;
}

const DEFAULT_VISIBLE_FILTERS = { search: true, warehouse: true, status: true };
const FILTER_LABELS: Record<keyof typeof DEFAULT_VISIBLE_FILTERS, string> = {
  search: "Search",
  warehouse: "Warehouse",
  status: "Status",
};

const SEARCH_DEBOUNCE_MS = 300;

function warehouseName(row: InventorySerial, warehouses: Warehouse[]): string {
  if (row.warehouse_name) return row.warehouse_name;
  return warehouses.find((w) => w.id === row.warehouse_id)?.name ?? "";
}

function dash(value: unknown): string {
  return value == null || String(value).trim() === "" ? "—" : String(value);
}

const OTHER_STATUSES: (keyof SerialListMeta)[] = [
  "in_service",
  "replaced",
  "scrapped",
  "lost",
  "damaged",
];

function SummaryStat({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: number;
  active?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </>
  );
  if (!onClick) {
    return <span className="flex items-center gap-1.5 px-2">{body}</span>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 px-2 hover:text-primary",
        active && "text-primary underline underline-offset-2",
      )}
    >
      {body}
    </button>
  );
}

export type SerialGridHandle = {
  openFilters: () => void;
  openColumns: () => void;
  resetFilters: () => void;
};

export const SerialGrid = forwardRef<
  SerialGridHandle,
  {
    serials: InventorySerial[];
    meta?: SerialListMeta | null;
    warehouses?: Warehouse[];
    loading?: boolean;
    onChanged?: () => void;
    onFilterCountChange?: (count: number) => void;
    /** Filters are also pushed to the API so search/status work past the loaded page. */
    onQueryChange?: (params: SerialListParams) => void;
    headerLeftActions?: ReactNode;
    className?: string;
  }
>(function SerialGrid(
  {
    serials,
    meta = null,
    warehouses = [],
    loading = false,
    onChanged,
    onFilterCountChange,
    onQueryChange,
    headerLeftActions,
    className,
  },
  ref,
) {
  const router = useRouter();
  const canWrite = useAdminCanWrite();
  const gridApiRef = useRef<GridApi<InventorySerial> | null>(null);

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);
  const [detail, setDetail] = useState<InventorySerial | null>(null);
  const [salesOrder, setSalesOrder] = useState<Order | null>(null);
  const [partnerRecord, setPartnerRecord] = useState<Customer | null>(null);

  const [visibleCols, setVisibleCols] = useUserScopedState("serial-grid:columns", DEFAULT_VISIBLE);
  const [visibleFilters, setVisibleFilters] = useUserScopedState(
    "serial-grid:filters",
    DEFAULT_VISIBLE_FILTERS,
  );
  const resolvedCols = useMemo(() => ({ ...DEFAULT_VISIBLE, ...visibleCols }), [visibleCols]);
  const resolvedVisibleFilters = useMemo(
    () => ({ ...DEFAULT_VISIBLE_FILTERS, ...visibleFilters }),
    [visibleFilters],
  );

  useImperativeHandle(ref, () => ({
    openFilters: () => setFilterSheetOpen(true),
    openColumns: () => setColumnSheetOpen(true),
    resetFilters: () => setFilters(DEFAULT_FILTERS),
  }));

  // Warehouses the API knows, plus any name that only appears on a row — so the
  // filter never hides a location the grid is already showing.
  const warehouseOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const w of warehouses) byId.set(w.id, w.code ? `${w.code} — ${w.name}` : w.name);
    for (const row of serials) {
      if (row.warehouse_id && !byId.has(row.warehouse_id)) {
        byId.set(row.warehouse_id, row.warehouse_name || row.warehouse_id);
      }
    }
    return [...byId.entries()].map(([value, label]) => ({ value, label }));
  }, [warehouses, serials]);

  // Client-side pass keeps the grid responsive while the debounced server
  // refetch is in flight; once the API-filtered rows land it is a no-op.
  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return serials.filter((row) => {
      if (
        q &&
        !`${row.serial_number} ${row.sku} ${row.product_name} ${row.customer_name} ${row.order_number ?? ""}`
          .toLowerCase()
          .includes(q)
      ) {
        return false;
      }
      if (filters.warehouse !== "all" && row.warehouse_id !== filters.warehouse) return false;
      if (filters.status !== "all" && row.status !== filters.status) return false;
      return true;
    });
  }, [serials, filters]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.search.trim()) n += 1;
    if (filters.warehouse !== "all") n += 1;
    if (filters.status !== "all") n += 1;
    return n;
  }, [filters]);

  useEffect(() => {
    onFilterCountChange?.(activeFilterCount);
  }, [activeFilterCount, onFilterCountChange]);

  useEffect(() => {
    if (!onQueryChange) return;
    const timer = setTimeout(
      () =>
        onQueryChange({
          status: filters.status !== "all" ? filters.status : undefined,
          warehouse_id: filters.warehouse !== "all" ? filters.warehouse : undefined,
          q: filters.search.trim() || undefined,
        }),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [filters, onQueryChange]);

  const removeSerial = useCallback(
    async (row: InventorySerial) => {
      try {
        await deleteSerial(row.id);
        toast.success(`${row.serial_number} removed`);
        onChanged?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not delete the serial");
      }
    },
    [onChanged],
  );

  const openOrder = useCallback(async (row: InventorySerial) => {
    if (!row.order_id || row.order_kind !== "sales") return;
    try {
      setSalesOrder(apiSalesOrderToOrder(await fetchSalesOrder(row.order_id)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open the order");
    }
  }, []);

  const openCustomer = useCallback(async (row: InventorySerial) => {
    if (!row.customer_id) return;
    try {
      setPartnerRecord(await getCommerceCustomer(row.customer_id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load the customer");
    }
  }, []);

  const SerialRowMenu = useCallback(
    ({ data }: { data: InventorySerial }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <RowActionsTrigger />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => setDetail(data)}>
            <Eye className="mr-1.5 h-3 w-3" /> Trace
          </DropdownMenuItem>
          {data.order_number && data.order_kind === "sales" && (
            <DropdownMenuItem onClick={() => void openOrder(data)}>
              <ScrollText className="mr-1.5 h-3 w-3" /> Open {data.order_number}
            </DropdownMenuItem>
          )}
          {data.rma_id && (
            <DropdownMenuItem onClick={() => router.push(`/rma/${data.rma_id}`)}>
              <Wrench className="mr-1.5 h-3 w-3" /> Open claim
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => void removeSerial(data)}
            disabled={!canWrite || data.status === "in_service"}
            className="text-red-600 dark:text-red-400"
          >
            <Trash2 className="mr-1.5 h-3 w-3" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    [canWrite, openOrder, removeSerial, router],
  );

  const columnDefs = useMemo<ColDef<InventorySerial>[]>(
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
        cellRenderer: (p: ICellRendererParams<InventorySerial>) =>
          p.data ? <SerialRowMenu data={p.data} /> : null,
      },
      {
        colId: "thumbnail",
        headerName: "",
        hide: !resolvedCols.thumbnail,
        width: 28,
        maxWidth: 28,
        minWidth: 28,
        resizable: false,
        suppressMovable: true,
        suppressSizeToFit: true,
        sortable: false,
        suppressHeaderMenuButton: true,
        cellClass: "product-grid-icon-col",
        cellRenderer: (p: ICellRendererParams<InventorySerial>) =>
          p.data?.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.data.thumbnail}
              alt=""
              className="h-5 w-5 rounded-none object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-5 w-5 items-center justify-center bg-muted">
              <Package className="h-3 w-3 text-muted-foreground" aria-hidden />
            </div>
          ),
      },
      {
        colId: "serial",
        field: "serial_number",
        headerName: COLUMN_LABELS.serial,
        hide: !resolvedCols.serial,
        width: 170,
        minWidth: 130,
        cellClass: "font-mono text-[11px]",
        cellRenderer: (p: ICellRendererParams<InventorySerial>) =>
          p.data ? (
            <GridRefLink
              className="font-mono text-[11px]"
              title="Trace this unit"
              onClick={() => setDetail(p.data!)}
            >
              {p.data.serial_number}
            </GridRefLink>
          ) : null,
      },
      {
        colId: "name",
        field: "product_name",
        headerName: COLUMN_LABELS.name,
        hide: !resolvedCols.name,
        flex: 2,
        minWidth: 160,
        tooltipField: "product_name",
        valueFormatter: (p) => dash(p.value),
      },
      {
        colId: "sku",
        field: "sku",
        headerName: COLUMN_LABELS.sku,
        hide: !resolvedCols.sku,
        width: 110,
        minWidth: 80,
        cellClass: "font-mono text-[11px]",
        valueFormatter: (p) => dash(p.value),
      },
      {
        colId: "status",
        field: "status",
        headerName: COLUMN_LABELS.status,
        hide: !resolvedCols.status,
        width: 110,
        minWidth: 96,
        cellRenderer: (p: ICellRendererParams<InventorySerial>) => {
          const status = p.data?.status as SerialStatus | undefined;
          if (!status) return null;
          return (
            <GridChipBadge className={SERIAL_STATUS_TONE[status]} title={SERIAL_STATUS_LABEL[status]}>
              {SERIAL_STATUS_LABEL[status]}
            </GridChipBadge>
          );
        },
      },
      {
        colId: "location",
        headerName: COLUMN_LABELS.location,
        hide: !resolvedCols.location,
        width: 150,
        minWidth: 110,
        valueGetter: (p) =>
          p.data ? serialLocationLabel(p.data, warehouseName(p.data, warehouses)) : "",
        tooltipValueGetter: (p) => (p.data ? serialWhereabouts(p.data) : ""),
      },
      {
        colId: "source",
        headerName: COLUMN_LABELS.source,
        hide: !resolvedCols.source,
        width: 170,
        minWidth: 120,
        valueGetter: (p) => (p.data ? serialSourceLabel(p.data) : ""),
        tooltipValueGetter: (p) =>
          p.data?.received_at ? `Received ${formatDate(p.data.received_at)}` : "Received date unknown",
      },
      {
        colId: "supplier",
        field: "supplier_name",
        headerName: COLUMN_LABELS.supplier,
        hide: !resolvedCols.supplier,
        flex: 1,
        minWidth: 120,
        tooltipField: "supplier_name",
        valueFormatter: (p) => dash(p.value),
      },
      {
        colId: "receivedBy",
        field: "received_by_name",
        headerName: COLUMN_LABELS.receivedBy,
        hide: !resolvedCols.receivedBy,
        width: 130,
        minWidth: 110,
        valueFormatter: (p) => dash(p.value),
      },
      {
        colId: "soldBy",
        field: "sold_by_name",
        headerName: COLUMN_LABELS.soldBy,
        hide: !resolvedCols.soldBy,
        width: 130,
        minWidth: 110,
        valueFormatter: (p) => dash(p.value),
      },
      {
        colId: "customer",
        field: "customer_name",
        headerName: COLUMN_LABELS.customer,
        hide: !resolvedCols.customer,
        flex: 1,
        minWidth: 130,
        tooltipField: "customer_name",
        cellRenderer: (p: ICellRendererParams<InventorySerial>) => {
          const name = p.data?.customer_name?.trim();
          if (!name) return "—";
          if (!p.data?.customer_id) return name;
          return (
            <GridRefLink title={name} onClick={() => void openCustomer(p.data!)}>
              {name}
            </GridRefLink>
          );
        },
      },
      {
        colId: "order",
        field: "order_number",
        headerName: COLUMN_LABELS.order,
        hide: !resolvedCols.order,
        width: 120,
        minWidth: 100,
        cellClass: "font-mono text-[11px]",
        cellRenderer: (p: ICellRendererParams<InventorySerial>) => {
          const ref = p.data?.order_number?.trim();
          if (!ref) return "—";
          if (p.data?.order_kind !== "sales" || !p.data.order_id) return ref;
          return (
            <GridRefLink
              className="font-mono text-[11px]"
              title={`Open ${ref}`}
              onClick={() => void openOrder(p.data!)}
            >
              {ref}
            </GridRefLink>
          );
        },
      },
      {
        colId: "soldAt",
        field: "sold_at",
        headerName: COLUMN_LABELS.soldAt,
        hide: !resolvedCols.soldAt,
        width: 110,
        minWidth: 90,
        valueFormatter: (p) => (p.value ? formatDate(p.value as string) : "—"),
      },
      {
        colId: "receivedAt",
        field: "received_at",
        headerName: COLUMN_LABELS.receivedAt,
        hide: !resolvedCols.receivedAt,
        width: 120,
        minWidth: 100,
        valueFormatter: (p) => daysAgoLabel(p.value as string | null),
        tooltipValueGetter: (p) => (p.value ? formatDate(p.value as string) : "—"),
      },
      {
        colId: "warrantyExpires",
        field: "warranty_expires_on",
        headerName: COLUMN_LABELS.warrantyExpires,
        hide: !resolvedCols.warrantyExpires,
        width: 130,
        minWidth: 110,
        valueFormatter: (p) => (p.value ? formatDate(p.value as string) : "—"),
      },
      {
        colId: "rma",
        field: "rma_id",
        headerName: COLUMN_LABELS.rma,
        hide: !resolvedCols.rma,
        width: 100,
        minWidth: 80,
        cellRenderer: (p: ICellRendererParams<InventorySerial>) =>
          p.data?.rma_id ? (
            <button
              type="button"
              className="text-[11px] text-primary hover:underline"
              onClick={() => router.push(`/rma/${p.data!.rma_id}`)}
            >
              Open
            </button>
          ) : (
            <span className="text-[11px] text-muted-foreground">—</span>
          ),
      },
    ],
    [resolvedCols, SerialRowMenu, router, warehouses, openCustomer, openOrder],
  );

  const otherCount = meta
    ? OTHER_STATUSES.reduce((sum, key) => sum + Number(meta[key] ?? 0), 0)
    : 0;
  const toggleStatus = (status: SerialStatus) =>
    setFilters((f) => ({ ...f, status: f.status === status ? "all" : status }));

  return (
    <AgainListGrid<InventorySerial>
      className={className}
      rowData={filtered}
      columnDefs={columnDefs}
      loading={loading}
      headerLeftActions={headerLeftActions}
      onRowClicked={(row) => setDetail(row)}
      summary={
        meta ? (
          <div
            className="flex items-center divide-x divide-border border-b border-border bg-muted/20 py-1 text-[11px]"
            data-serial-summary
          >
            <SummaryStat
              label="In stock"
              value={meta.in_stock ?? 0}
              active={filters.status === "in_stock"}
              onClick={() => toggleStatus("in_stock")}
            />
            <SummaryStat
              label="Sold"
              value={meta.sold ?? 0}
              active={filters.status === "sold"}
              onClick={() => toggleStatus("sold")}
            />
            <SummaryStat
              label="In transit"
              value={meta.in_transit ?? 0}
              active={filters.status === "in_transit"}
              onClick={() => toggleStatus("in_transit")}
            />
            <SummaryStat label="Other" value={otherCount} />
            <span className="px-2 text-muted-foreground">
              {meta.total ?? 0} {meta.total === 1 ? "unit" : "units"} total
            </span>
          </div>
        ) : null
      }
      filterBar={
        <>
          {resolvedVisibleFilters.search && (
            <Input
              placeholder="Search serial, SKU, product, customer…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="w-[240px] shrink-0 rounded-none"
            />
          )}
          {resolvedVisibleFilters.warehouse && (
            <FilterSelect
              value={filters.warehouse}
              onChange={(warehouse) => setFilters((f) => ({ ...f, warehouse }))}
              width="w-[190px]"
              className="shrink-0"
              ariaLabel="Warehouse"
              options={[{ value: "all", label: "All warehouses" }, ...warehouseOptions]}
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
                ...(Object.keys(SERIAL_STATUS_LABEL) as SerialStatus[]).map((s) => ({
                  value: s,
                  label: SERIAL_STATUS_LABEL[s],
                })),
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
      emptyTitle="No serials match your filters"
      emptyHint="Register some, or clear the filters"
      onResetFilters={() => setFilters(DEFAULT_FILTERS)}
      onOpenColumns={() => setColumnSheetOpen(true)}
      apiRef={gridApiRef}
      mobile={
        <div className="divide-y divide-border">
          {filtered.slice(0, 50).map((row) => (
            <button
              key={row.id}
              type="button"
              className="flex w-full gap-3 px-3 py-2.5 text-left"
              onClick={() => setDetail(row)}
            >
              {row.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.thumbnail}
                  alt=""
                  className="h-9 w-9 shrink-0 object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-muted">
                  <Package className="h-4 w-4 text-muted-foreground" aria-hidden />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.product_name || row.sku}</p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">{row.sku}</p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn("shrink-0", GRID_CHIP_CLASS, SERIAL_STATUS_TONE[row.status])}
                  >
                    {SERIAL_STATUS_LABEL[row.status]}
                  </Badge>
                </div>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">{row.serial_number}</p>
                <p className="truncate text-[11px] text-muted-foreground">{serialWhereabouts(row)}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {serialSourceLabel(row)}
                  {row.supplier_name ? ` · ${row.supplier_name}` : ""}
                </p>
              </div>
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
            {(Object.keys(DEFAULT_VISIBLE_FILTERS) as (keyof typeof DEFAULT_VISIBLE_FILTERS)[]).map(
              (key) => (
                <label key={key} className="flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={resolvedVisibleFilters[key]}
                    onChange={(e) =>
                      setVisibleFilters({ ...resolvedVisibleFilters, [key]: e.target.checked })
                    }
                    className="h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none rounded-none border border-input bg-background checked:border-primary checked:bg-primary"
                  />
                  <span>{FILTER_LABELS[key]}</span>
                </label>
              ),
            )}
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
            {(Object.keys(DEFAULT_VISIBLE) as (keyof typeof DEFAULT_VISIBLE)[]).map((key) => (
              <label key={key} className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={resolvedCols[key]}
                  onChange={(e) => setVisibleCols({ ...resolvedCols, [key]: e.target.checked })}
                  className="h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none rounded-none border border-input bg-background checked:border-primary checked:bg-primary"
                />
                <span>{COLUMN_LABELS[key]}</span>
              </label>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <SerialDetailSheet
        open={detail != null}
        serial={detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
        onOpenOrder={(row) => void openOrder(row)}
        onOpenCustomer={(row) => void openCustomer(row)}
      />

      <AgainPartnerDrawer
        open={partnerRecord != null}
        customer={partnerRecord}
        mode="edit"
        nested={detail != null}
        onOpenChange={(open) => {
          if (!open) setPartnerRecord(null);
        }}
      />

      <SalesOrderFormDrawer
        open={salesOrder != null}
        mode="edit"
        order={salesOrder}
        nested={detail != null}
        onOpenChange={(open) => {
          if (!open) setSalesOrder(null);
        }}
        onSave={() => {}}
        onSaveAction={async (order, action) => {
          const saved = await persistSalesOrder(order, action);
          setSalesOrder(saved);
          return saved;
        }}
        onSaved={(saved) => setSalesOrder(saved)}
      />
    </AgainListGrid>
  );
});
