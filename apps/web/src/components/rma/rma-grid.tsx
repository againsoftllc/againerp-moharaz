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
import { useRouter } from "next/navigation";
import type { ColDef, GridApi, ICellRendererParams } from "ag-grid-community";
import { Eye, Factory, X } from "lucide-react";
import { toast } from "sonner";
import { cn, formatCurrency } from "@/lib/utils";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useUserScopedState } from "@/lib/hooks/use-user-scoped-state";
import { Badge } from "@/components/ui/badge";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RmaIntakeDrawer } from "@/components/rma/rma-intake-drawer";
import { RmaClaimDrawer } from "@/components/rma/rma-claim-drawer";
import { GridRefLink } from "@/components/shared/grid-ref-link";
import { AgainPartnerDrawer } from "@/components/shared/again-partner-drawer";
import { SalesOrderFormDrawer } from "@/components/sales/sales-order-form-drawer";
import { SupplierDetailDrawer } from "@/components/suppliers/supplier-detail-drawer";
import { buildMinimalPartnerFromSales } from "@/lib/mock-data/partner-drawer-seed";
import type { Customer } from "@/lib/mock-data/customers";
import type { Order } from "@/lib/mock-data/orders";
import {
  apiSalesOrderToOrder,
  fetchSalesOrder,
  persistSalesOrder,
} from "@/lib/api/sales";
import {
  RMA_STATUS_LABEL,
  RMA_STATUS_TONE,
  WARRANTY_LABEL,
  WARRANTY_TONE,
  type RmaStatus,
  type RmaTicket,
  type WarrantyStatus,
} from "@/lib/api/rma";



type FilterState = { search: string; status: string; warranty: string };
const DEFAULT_FILTERS: FilterState = { search: "", status: "all", warranty: "all" };

const DEFAULT_VISIBLE = {
  rmaNumber: true,
  customer: true,
  product: true,
  serial: true,
  orderNumber: false,
  warranty: true,
  status: true,
  age: true,
  assigned: false,
  supplier: true,
  total: true,
  bill: true,
};

const COLUMN_LABELS: Record<keyof typeof DEFAULT_VISIBLE, string> = {
  rmaNumber: "RMA",
  customer: "Customer",
  product: "Product",
  serial: "Serial",
  orderNumber: "Order",
  warranty: "Warranty",
  status: "Status",
  age: "Age",
  assigned: "Assigned",
  supplier: "Supplier",
  total: "Charges",
  bill: "Billing",
};

const DEFAULT_VISIBLE_FILTERS = { search: true, status: true, warranty: true };

function ageInDays(iso: string): number {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

export type RmaGridHandle = {
  openIntake: () => void;
  openFilters: () => void;
  openColumns: () => void;
  resetFilters: () => void;
};

export const RmaGrid = forwardRef<
  RmaGridHandle,
  {
    tickets: RmaTicket[];
    loading?: boolean;
    claimId?: string | null;
    onOpenClaim?: (id: string) => void;
    onCloseClaim?: () => void;
    onChanged?: () => void;
    onFilterCountChange?: (count: number) => void;
    headerLeftActions?: ReactNode;
    className?: string;
  }
>(function RmaGrid(
  {
    tickets,
    loading = false,
    claimId = null,
    onOpenClaim,
    onCloseClaim,
    onChanged,
    onFilterCountChange,
    headerLeftActions,
    className,
  },
  ref,
) {
  const router = useRouter();
  const canWrite = useAdminCanWrite();
  const gridApiRef = useRef<GridApi<RmaTicket> | null>(null);

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [selected, setSelected] = useState<RmaTicket[]>([]);
  const [partnerRecord, setPartnerRecord] = useState<Customer | null>(null);
  const [partnerOpen, setPartnerOpen] = useState(false);
  const [salesOrder, setSalesOrder] = useState<Order | null>(null);
  const [salesOrderOpen, setSalesOrderOpen] = useState(false);
  const [supplierDrawerId, setSupplierDrawerId] = useState<string | null>(null);

  const [visibleCols, setVisibleCols] = useUserScopedState("rma-grid:columns", DEFAULT_VISIBLE);
  const [visibleFilters, setVisibleFilters] = useUserScopedState(
    "rma-grid:filters",
    DEFAULT_VISIBLE_FILTERS,
  );
  const resolvedCols = useMemo(() => ({ ...DEFAULT_VISIBLE, ...visibleCols }), [visibleCols]);
  const resolvedVisibleFilters = useMemo(
    () => ({ ...DEFAULT_VISIBLE_FILTERS, ...visibleFilters }),
    [visibleFilters],
  );

  useImperativeHandle(ref, () => ({
    openIntake: () => setIntakeOpen(true),
    openFilters: () => setFilterSheetOpen(true),
    openColumns: () => setColumnSheetOpen(true),
    resetFilters: () => setFilters(DEFAULT_FILTERS),
  }));

  const openCustomerDrawer = useCallback((row: RmaTicket) => {
    if (!row.customer_id) {
      toast.error("No customer record for this RMA");
      return;
    }
    setPartnerRecord(
      buildMinimalPartnerFromSales(row.customer_id, row.customer_name, row.customer_email, row.customer_phone),
    );
    setPartnerOpen(true);
  }, []);

  const openOrderDrawer = useCallback(async (row: RmaTicket) => {
    if (!row.order_id) {
      toast.error("No sales order linked to this RMA");
      return;
    }
    try {
      const order = apiSalesOrderToOrder(await fetchSalesOrder(row.order_id));
      setSalesOrder(order);
      setSalesOrderOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open sales order");
    }
  }, []);

  const openSupplierDrawer = useCallback((row: RmaTicket) => {
    const id = row.supplier_job?.supplier_id;
    if (!id) {
      toast.error("No supplier job on this RMA");
      return;
    }
    setSupplierDrawerId(id);
  }, []);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return tickets.filter((t) => {
      if (
        q &&
        !`${t.rma_number} ${t.customer_name} ${t.sku} ${t.product_name} ${t.serial_number ?? ""} ${t.order_number ?? ""}`
          .toLowerCase()
          .includes(q)
      )
        return false;
      if (filters.status !== "all" && t.status !== filters.status) return false;
      if (filters.warranty !== "all" && t.warranty_status !== filters.warranty) return false;
      return true;
    });
  }, [tickets, filters]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.search.trim()) n += 1;
    if (filters.status !== "all") n += 1;
    if (filters.warranty !== "all") n += 1;
    return n;
  }, [filters]);

  useEffect(() => {
    onFilterCountChange?.(activeFilterCount);
  }, [activeFilterCount, onFilterCountChange]);

  const RmaRowMenu = useCallback(
    ({ data }: { data: RmaTicket }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <RowActionsTrigger />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => onOpenClaim?.(data.id)}>
            <Eye className="mr-1.5 h-3 w-3" /> Open claim
          </DropdownMenuItem>
          {data.supplier_job && (
            <DropdownMenuItem onClick={() => router.push(`/suppliers/${data.supplier_job!.supplier_id}`)}>
              <Factory className="mr-1.5 h-3 w-3" /> Open supplier
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    [router, onOpenClaim],
  );

  const columnDefs = useMemo<ColDef<RmaTicket>[]>(
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
        cellRenderer: (p: ICellRendererParams<RmaTicket>) =>
          p.data ? <RmaRowMenu data={p.data} /> : null,
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
      },
      {
        colId: "rmaNumber",
        field: "rma_number",
        headerName: COLUMN_LABELS.rmaNumber,
        hide: !resolvedCols.rmaNumber,
        pinned: "left",
        width: 150,
        minWidth: 120,
        cellClass: "font-mono text-[11px]",
        cellRenderer: (p: ICellRendererParams<RmaTicket>) =>
          p.data ? (
            <button
              type="button"
              className="text-left hover:underline"
              onClick={() => onOpenClaim?.(p.data!.id)}
            >
              {p.data.rma_number}
            </button>
          ) : null,
      },
      {
        colId: "customer",
        field: "customer_name",
        headerName: COLUMN_LABELS.customer,
        hide: !resolvedCols.customer,
        flex: 1,
        minWidth: 140,
        cellRenderer: (p: ICellRendererParams<RmaTicket>) => {
          const name = p.data?.customer_name?.trim();
          if (!name) return "—";
          return (
            <GridRefLink title={name} onClick={() => openCustomerDrawer(p.data!)}>
              {name}
            </GridRefLink>
          );
        },
      },
      {
        colId: "product",
        headerName: COLUMN_LABELS.product,
        hide: !resolvedCols.product,
        flex: 2,
        minWidth: 180,
        valueGetter: (p) => (p.data ? `${p.data.sku} ${p.data.product_name}` : ""),
        cellRenderer: (p: ICellRendererParams<RmaTicket>) =>
          p.data ? (
            <span className="truncate">
              <span className="font-mono text-[11px]">{p.data.sku}</span>
              <span className="ml-2 text-muted-foreground">{p.data.product_name}</span>
            </span>
          ) : null,
      },
      {
        colId: "serial",
        field: "serial_number",
        headerName: COLUMN_LABELS.serial,
        hide: !resolvedCols.serial,
        width: 150,
        minWidth: 110,
        cellClass: "font-mono text-[11px]",
      },
      {
        colId: "orderNumber",
        field: "order_number",
        headerName: COLUMN_LABELS.orderNumber,
        hide: !resolvedCols.orderNumber,
        width: 130,
        minWidth: 100,
        cellClass: "font-mono text-[11px]",
        cellRenderer: (p: ICellRendererParams<RmaTicket>) => {
          const orderNo = p.data?.order_number?.trim();
          if (!orderNo) return "—";
          return (
            <GridRefLink className="font-mono text-[11px]" title={orderNo} onClick={() => void openOrderDrawer(p.data!)}>
              {orderNo}
            </GridRefLink>
          );
        },
      },
      {
        colId: "warranty",
        field: "warranty_status",
        headerName: COLUMN_LABELS.warranty,
        hide: !resolvedCols.warranty,
        width: 140,
        minWidth: 120,
        cellRenderer: (p: ICellRendererParams<RmaTicket>) => {
          const status = p.data?.warranty_status as WarrantyStatus | undefined;
          if (!status) return null;
          return (
            <Badge variant="outline" className={cn("max-w-full truncate rounded-none text-[10px] leading-4", WARRANTY_TONE[status])}>
              {WARRANTY_LABEL[status]}
            </Badge>
          );
        },
      },
      {
        colId: "status",
        field: "status",
        headerName: COLUMN_LABELS.status,
        hide: !resolvedCols.status,
        width: 160,
        minWidth: 130,
        cellRenderer: (p: ICellRendererParams<RmaTicket>) => {
          const status = p.data?.status as RmaStatus | undefined;
          if (!status) return null;
          return (
            <Badge
              variant="outline"
              className={cn("max-w-full truncate rounded-none text-[10px] leading-4", RMA_STATUS_TONE[status])}
            >
              {RMA_STATUS_LABEL[status]}
            </Badge>
          );
        },
      },
      {
        colId: "age",
        headerName: COLUMN_LABELS.age,
        hide: !resolvedCols.age,
        width: 84,
        minWidth: 70,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueGetter: (p) => (p.data ? ageInDays(p.data.received_at) : 0),
        valueFormatter: (p) => `${p.value}d`,
      },
      {
        colId: "assigned",
        field: "assigned_to",
        headerName: COLUMN_LABELS.assigned,
        hide: !resolvedCols.assigned,
        width: 130,
        minWidth: 100,
      },
      {
        colId: "supplier",
        headerName: COLUMN_LABELS.supplier,
        hide: !resolvedCols.supplier,
        width: 160,
        minWidth: 120,
        valueGetter: (p) => p.data?.supplier_job?.supplier_name ?? "",
        cellRenderer: (p: ICellRendererParams<RmaTicket>) =>
          p.data?.supplier_job ? (
            <GridRefLink className="truncate text-[11px]" title={p.data.supplier_job.supplier_name} onClick={() => openSupplierDrawer(p.data!)}>
              {p.data.supplier_job.supplier_name}
            </GridRefLink>
          ) : (
            <span className="text-[11px] text-muted-foreground">—</span>
          ),
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
        cellClass: NUMERIC_CELL,
        valueFormatter: (p) => (Number(p.value) > 0 ? formatCurrency(Number(p.value)) : "—"),
      },
      {
        colId: "bill",
        field: "bill_status",
        headerName: COLUMN_LABELS.bill,
        hide: !resolvedCols.bill,
        width: 110,
        minWidth: 90,
        cellRenderer: (p: ICellRendererParams<RmaTicket>) => {
          const t = p.data;
          if (!t) return null;
          if (t.bill_status === "billed")
            return (
              <Badge
                variant="outline"
                className="max-w-full truncate rounded-none border-emerald-500/30 bg-emerald-500/10 text-[10px] leading-4 text-emerald-600 dark:text-emerald-400"
              >
                Billed
              </Badge>
            );
          if (t.is_billable && Number(t.total) > 0)
            return (
              <Badge
                variant="outline"
                className="max-w-full truncate rounded-none border-amber-500/30 bg-amber-500/10 text-[10px] leading-4 text-amber-600 dark:text-amber-400"
              >
                To bill
              </Badge>
            );
          return <span className="text-[11px] text-muted-foreground">—</span>;
        },
      },
    ],
    [resolvedCols, canWrite, RmaRowMenu, onOpenClaim, openCustomerDrawer, openOrderDrawer, openSupplierDrawer],
  );

  const exportSelected = useCallback(() => {
    const rows = selected.length ? selected : filtered;
    const header = ["RMA", "Customer", "SKU", "Serial", "Warranty", "Status", "Charges", "Billing"];
    const body = rows.map((r) =>
      [
        r.rma_number,
        r.customer_name,
        r.sku,
        r.serial_number ?? "",
        r.warranty_status,
        r.status,
        r.total,
        r.bill_status,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...body].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rma-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} claim${rows.length === 1 ? "" : "s"}`);
  }, [selected, filtered]);

  return (
    <AgainListGrid<RmaTicket>
      className={className}
      rowData={filtered}
      columnDefs={columnDefs}
      loading={loading}
      headerLeftActions={headerLeftActions}
      filterBar={
        <>
          {resolvedVisibleFilters.search && (
            <Input
              placeholder="Search RMA, customer, serial…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="w-[220px] shrink-0 rounded-none"
            />
          )}
          {resolvedVisibleFilters.status && (
            <FilterSelect
              value={filters.status}
              onChange={(status) => setFilters((f) => ({ ...f, status }))}
              width="w-[180px]"
              className="shrink-0"
              ariaLabel="Status"
              options={[
                { value: "all", label: "All statuses" },
                ...(Object.keys(RMA_STATUS_LABEL) as RmaStatus[]).map((s) => ({
                  value: s,
                  label: RMA_STATUS_LABEL[s],
                })),
              ]}
            />
          )}
          {resolvedVisibleFilters.warranty && (
            <FilterSelect
              value={filters.warranty}
              onChange={(warranty) => setFilters((f) => ({ ...f, warranty }))}
              width="w-[160px]"
              className="shrink-0"
              ariaLabel="Warranty"
              options={[
                { value: "all", label: "All warranty" },
                { value: "in_warranty", label: "In warranty" },
                { value: "out_of_warranty", label: "Out of warranty" },
                { value: "unknown", label: "Unverified" },
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
            <Button variant="outline" size="sm" onClick={exportSelected}>
              Export selected
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 w-7 p-0"
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
      emptyTitle="No warranty claims match your filters"
      emptyHint="Receive a claim, or clear the filters"
      onResetFilters={() => setFilters(DEFAULT_FILTERS)}
      onOpenColumns={() => setColumnSheetOpen(true)}
      onRowClicked={(row) => onOpenClaim?.(row.id)}
      apiRef={gridApiRef}
      gridProps={{
        rowSelection: "multiple",
        suppressRowClickSelection: true,
        onSelectionChanged: (e) => setSelected(e.api.getSelectedRows()),
      }}
      mobile={
        <div className="divide-y divide-border">
          {filtered.map((t) => (
            <button
              key={t.id}
              type="button"
              className="block w-full px-3 py-2.5 text-left"
              onClick={() => onOpenClaim?.(t.id)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-mono text-[11px]">{t.rma_number}</p>
                  <p className="truncate text-sm font-medium">{t.product_name || t.sku}</p>
                </div>
                <Badge
                  variant="outline"
                  className={cn("shrink-0 rounded-none text-[10px]", RMA_STATUS_TONE[t.status])}
                >
                  {RMA_STATUS_LABEL[t.status]}
                </Badge>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t.customer_name} · {WARRANTY_LABEL[t.warranty_status]} · {ageInDays(t.received_at)}d
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
            {(Object.keys(DEFAULT_VISIBLE_FILTERS) as (keyof typeof DEFAULT_VISIBLE_FILTERS)[]).map(
              (key) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-2 text-xs text-foreground"
                >
                  <input
                    type="checkbox"
                    checked={resolvedVisibleFilters[key]}
                    onChange={(e) =>
                      setVisibleFilters({ ...resolvedVisibleFilters, [key]: e.target.checked })
                    }
                    className="h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none rounded-none border border-input bg-background checked:border-primary checked:bg-primary"
                  />
                  <span className="capitalize">{key}</span>
                </label>
              ),
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 h-7 rounded-none text-xs"
            onClick={() => setFilters(DEFAULT_FILTERS)}
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
            {(Object.keys(DEFAULT_VISIBLE) as (keyof typeof DEFAULT_VISIBLE)[]).map((key) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-2 text-xs text-foreground"
              >
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

      <RmaIntakeDrawer
        key={`intake:${intakeOpen}`}
        open={intakeOpen}
        onOpenChange={setIntakeOpen}
        onCreated={(id) => {
          onChanged?.();
          onOpenClaim?.(id);
        }}
      />
      <RmaClaimDrawer
        ticketId={claimId}
        onClose={() => onCloseClaim?.()}
        onChanged={onChanged}
      />
      <AgainPartnerDrawer
        open={partnerOpen}
        customer={partnerRecord}
        mode="edit"
        onOpenChange={setPartnerOpen}
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
      <SupplierDetailDrawer
        open={Boolean(supplierDrawerId)}
        supplierId={supplierDrawerId}
        onOpenChange={(next) => {
          if (!next) setSupplierDrawerId(null);
        }}
      />
    </AgainListGrid>
  );
});
