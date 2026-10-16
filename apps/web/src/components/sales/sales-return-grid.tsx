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
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { Ban, CheckCircle2, Eye, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FilterSelect } from "@/components/shared/filter-select";
import { GridChipBadge } from "@/components/shared/grid-chip-badge";
import { RowActionsTrigger } from "@/components/shared/row-actions-icon";
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
  SALES_RETURN_REASON_LABELS,
  SALES_RETURN_STATUS_LABELS,
  type SalesReturn,
  type SalesReturnReason,
  type SalesReturnStatus,
} from "@/lib/sales/sales-returns";
import { GridRefLink } from "@/components/shared/grid-ref-link";
import { AgainPartnerDrawer } from "@/components/shared/again-partner-drawer";
import { buildMinimalPartnerFromSales } from "@/lib/mock-data/partner-drawer-seed";
import { fetchSalesOrder, apiSalesOrderToOrder } from "@/lib/api/sales";
import type { Order } from "@/lib/mock-data/orders";
import { SalesOrderFormDrawer } from "@/components/sales/sales-order-form-drawer";
import { SalesReturnDrawer } from "@/components/sales/sales-return-drawer";

export type SalesReturnGridHandle = {
  openFilters: () => void;
  openColumns: () => void;
  resetFilters: () => void;
  exportCsv: () => void;
};

const STATUS_TONE: Record<SalesReturnStatus, string> = {
  draft: "border-muted-foreground/30 bg-muted text-muted-foreground",
  confirmed: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  credited: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  cancelled: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

const REASON_TONE: Record<SalesReturnReason, string> = {
  defective: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  wrong_item: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  customer_changed_mind: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  warranty: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  damaged_in_transit: "border-muted-foreground/30 bg-muted text-muted-foreground",
  other: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

const COLUMN_KEYS = [
  "customer",
  "number",
  "orderNumber",
  "invoiceNumber",
  "reason",
  "credit",
  "returnDate",
  "warehouse",
  "status",
] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];

function SalesReturnNumberCell(
  p: ICellRendererParams<SalesReturn> & { onOpenRow?: (row: SalesReturn) => void },
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
  customer: "Customer",
  number: "Credit note",
  orderNumber: "Order",
  invoiceNumber: "Invoice",
  reason: "Reason",
  credit: "Credit",
  returnDate: "Date",
  warehouse: "Warehouse",
  status: "Status",
};

const DEFAULT_VISIBLE: Record<ColumnKey, boolean> = {
  customer: true,
  number: true,
  orderNumber: true,
  invoiceNumber: false,
  reason: true,
  credit: true,
  returnDate: true,
  warehouse: false,
  status: true,
};

type Props = {
  returns: SalesReturn[];
  onConfirm: (row: SalesReturn) => void;
  onCancel: (row: SalesReturn) => void;
  onCredit: (row: SalesReturn) => void;
  onChanged?: () => void;
  onFilterCountChange?: (count: number) => void;
  headerLeftActions?: ReactNode;
  footerLeftActions?: ReactNode;
  className?: string;
};

const DEFAULT_FILTERS = { search: "", status: "all", reason: "all" };

export const SalesReturnGrid = forwardRef<SalesReturnGridHandle, Props>(function SalesReturnGrid(
  { returns, onConfirm, onCancel, onCredit, onChanged, onFilterCountChange, headerLeftActions, footerLeftActions, className },
  ref,
) {
  const canWrite = useAdminCanWrite();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [visibleCols, setVisibleCols] = useUserScopedState("sales-return-cols", DEFAULT_VISIBLE);
  const resolvedCols = { ...DEFAULT_VISIBLE, ...visibleCols };
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [viewedReturn, setViewedReturn] = useState<SalesReturn | null>(null);
  const ignoreViewCloseUntil = useRef(0);

  const openViewedReturn = useCallback((row: SalesReturn) => {
    ignoreViewCloseUntil.current = Date.now() + 300;
    window.setTimeout(() => setViewedReturn(row), 0);
  }, []);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return returns.filter((row) => {
      if (filters.status !== "all" && row.status !== filters.status) return false;
      if (filters.reason !== "all" && row.reason !== filters.reason) return false;
      if (!q) return true;
      const products = row.lines.map((l) => `${l.sku} ${l.name}`).join(" ");
      return `${row.number} ${row.orderNumber} ${row.invoiceNumber ?? ""} ${row.customerName} ${products}`
        .toLowerCase()
        .includes(q);
    });
  }, [returns, filters]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.search.trim()) n += 1;
    if (filters.status !== "all") n += 1;
    if (filters.reason !== "all") n += 1;
    return n;
  }, [filters]);

  useEffect(() => {
    onFilterCountChange?.(activeFilterCount);
  }, [activeFilterCount, onFilterCountChange]);

  const exportCsv = useCallback(() => {
    const header = COLUMN_KEYS.map((key) => COLUMN_LABELS[key]);
    const body = filtered.map((row) =>
      [
        row.customerName,
        row.number,
        row.orderNumber,
        row.invoiceNumber ?? "",
        SALES_RETURN_REASON_LABELS[row.reason],
        row.creditAmount,
        row.returnDate,
        row.warehouse,
        SALES_RETURN_STATUS_LABELS[row.status],
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sales-returns-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} return${filtered.length === 1 ? "" : "s"}`);
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

  const openOrder = async (row: SalesReturn) => {
    try {
      const api = await fetchSalesOrder(row.salesOrderId);
      setOrder(apiSalesOrderToOrder(api));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open order");
    }
  };

  const RowMenu = useCallback(
    ({ data }: { data: SalesReturn }) => {
      const items: ReactNode[] = [
        <DropdownMenuItem key="open" onClick={() => openViewedReturn(data)}>
          <Eye className="mr-1.5 h-3 w-3" /> Open
        </DropdownMenuItem>,
      ];
      if (canWrite && data.status === "draft") {
        items.push(
          <DropdownMenuItem key="confirm" onClick={() => onConfirm(data)}>
            <CheckCircle2 className="mr-1.5 h-3 w-3" /> Confirm
          </DropdownMenuItem>,
          <DropdownMenuItem key="cancel" onClick={() => onCancel(data)}>
            <Ban className="mr-1.5 h-3 w-3" /> Cancel
          </DropdownMenuItem>,
        );
      }
      if (canWrite && data.status === "confirmed") {
        items.push(
          <DropdownMenuItem key="credit" onClick={() => onCredit(data)}>
            <Wallet className="mr-1.5 h-3 w-3" /> Post credit note
          </DropdownMenuItem>,
          <DropdownMenuItem key="cancel" onClick={() => onCancel(data)}>
            <Ban className="mr-1.5 h-3 w-3" /> Cancel
          </DropdownMenuItem>,
        );
      }
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <RowActionsTrigger />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="rounded-none">
            {items.length > 0 ? items : <DropdownMenuItem disabled>No actions</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
    [canWrite, onCancel, onConfirm, onCredit, openViewedReturn],
  );

  const columnDefs = useMemo<ColDef<SalesReturn>[]>(
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
        cellRenderer: (p: ICellRendererParams<SalesReturn>) => (p.data ? <RowMenu data={p.data} /> : null),
      },
      {
        colId: "customer",
        field: "customerName",
        headerName: COLUMN_LABELS.customer,
        hide: !resolvedCols.customer,
        flex: 1,
        minWidth: 160,
        cellRenderer: (p: ICellRendererParams<SalesReturn>) => {
          const name = p.data?.customerName?.trim();
          if (!name) return "—";
          return (
            <GridRefLink title={name} onClick={() => setPartnerId(p.data!.customerId)}>
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
        cellClass: "font-mono text-[11px]",
        cellRenderer: SalesReturnNumberCell,
        cellRendererParams: { onOpenRow: openViewedReturn },
      },
      {
        colId: "orderNumber",
        field: "orderNumber",
        headerName: COLUMN_LABELS.orderNumber,
        hide: !resolvedCols.orderNumber,
        width: 130,
        cellRenderer: (p: ICellRendererParams<SalesReturn>) => {
          const no = p.data?.orderNumber?.trim();
          if (!no) return "—";
          return (
            <GridRefLink className="font-mono text-[11px]" title={no} onClick={() => void openOrder(p.data!)}>
              {no}
            </GridRefLink>
          );
        },
      },
      {
        colId: "invoiceNumber",
        field: "invoiceNumber",
        headerName: COLUMN_LABELS.invoiceNumber,
        hide: !resolvedCols.invoiceNumber,
        width: 130,
        cellClass: "font-mono text-[11px]",
        valueFormatter: (p) => (p.value ? String(p.value) : "—"),
      },
      {
        colId: "reason",
        field: "reason",
        headerName: COLUMN_LABELS.reason,
        hide: !resolvedCols.reason,
        width: 160,
        cellRenderer: (p: ICellRendererParams<SalesReturn>) => {
          const reason = p.data?.reason;
          if (!reason) return null;
          return (
            <GridChipBadge className={REASON_TONE[reason]} title={SALES_RETURN_REASON_LABELS[reason]}>
              {SALES_RETURN_REASON_LABELS[reason]}
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
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: `${NUMERIC_CELL} font-medium`,
        valueFormatter: (p) => formatCurrency(Number(p.value ?? 0)),
      },
      {
        colId: "returnDate",
        field: "returnDate",
        headerName: COLUMN_LABELS.returnDate,
        hide: !resolvedCols.returnDate,
        width: 120,
      },
      {
        colId: "warehouse",
        field: "warehouse",
        headerName: COLUMN_LABELS.warehouse,
        hide: !resolvedCols.warehouse,
        width: 130,
      },
      {
        colId: "status",
        field: "status",
        headerName: COLUMN_LABELS.status,
        hide: !resolvedCols.status,
        width: 130,
        cellRenderer: (p: ICellRendererParams<SalesReturn>) => {
          const status = p.data?.status;
          if (!status) return null;
          return (
            <GridChipBadge className={STATUS_TONE[status]} title={SALES_RETURN_STATUS_LABELS[status]}>
              {SALES_RETURN_STATUS_LABELS[status]}
            </GridChipBadge>
          );
        },
      },
    ],
    [RowMenu, openViewedReturn, resolvedCols],
  );

  return (
    <AgainListGrid<SalesReturn>
      className={className}
      rowData={filtered}
      columnDefs={columnDefs}
      headerLeftActions={headerLeftActions}
      filterBar={
        <>
          <Input
            placeholder="Search credit note, order, customer…"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            className="w-[240px] shrink-0 rounded-none"
          />
          <FilterSelect
            value={filters.status}
            onChange={(status) => setFilters((f) => ({ ...f, status }))}
            width="w-[150px]"
            className="shrink-0"
            ariaLabel="Status"
            options={[
              { value: "all", label: "All statuses" },
              ...Object.entries(SALES_RETURN_STATUS_LABELS).map(([value, label]) => ({ value, label })),
            ]}
          />
          <FilterSelect
            value={filters.reason}
            onChange={(reason) => setFilters((f) => ({ ...f, reason }))}
            width="w-[170px]"
            className="shrink-0"
            ariaLabel="Reason"
            options={[
              { value: "all", label: "All reasons" },
              ...Object.entries(SALES_RETURN_REASON_LABELS).map(([value, label]) => ({ value, label })),
            ]}
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
      emptyTitle="No sales returns match your filters"
      onResetFilters={() => setFilters(DEFAULT_FILTERS)}
      onOpenColumns={() => setColumnSheetOpen(true)}
      onRowClicked={openViewedReturn}
      mobile={
        <div className="divide-y divide-border">
          {filtered.map((row) => (
            <div
              key={row.id}
              className="cursor-pointer px-3 py-2.5"
              onClick={() => openViewedReturn(row)}
            >
              <p className="truncate text-sm font-medium">{row.customerName || "Customer"}</p>
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
                {row.orderNumber} · {SALES_RETURN_STATUS_LABELS[row.status]} · {formatCurrency(row.creditAmount)}
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
        open={Boolean(partnerId)}
        onOpenChange={(next) => {
          if (!next) setPartnerId(null);
        }}
        customer={
          partnerId
            ? buildMinimalPartnerFromSales(
                partnerId,
                returns.find((r) => r.customerId === partnerId)?.customerName ?? "Customer",
                "",
                "",
              )
            : null
        }
      />
      <SalesOrderFormDrawer
        open={Boolean(order)}
        mode="edit"
        order={order}
        onOpenChange={(next) => {
          if (!next) setOrder(null);
        }}
        onSave={() => {}}
      />
      <SalesReturnDrawer
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
