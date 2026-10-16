"use client";

import "@/components/providers/ag-grid-provider";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ColDef, GridApi, ICellRendererParams } from "ag-grid-community";
import { CreditCard, Eye, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import type { CustomerOrderSummary } from "@/lib/mock-data/customers";
import dynamic from "next/dynamic";
import {
  ensureCustomerOrderSales,
  fetchCustomerOrders,
  recordCustomerOrderPayment,
} from "@/lib/api/commerce-customers";
import {
  apiSalesOrderToOrder,
  fetchSalesOrder,
  persistSalesOrder,
} from "@/lib/api/sales";
import type { Order } from "@/lib/mock-data/orders";
import { useUserScopedState } from "@/lib/hooks/use-user-scoped-state";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RowActionsTrigger } from "@/components/shared/row-actions-icon";
import { AgainListGrid } from "@/components/shared/again-list-grid";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const SalesOrderFormDrawer = dynamic(
  () =>
    import("@/components/sales/sales-order-form-drawer").then((m) => m.SalesOrderFormDrawer),
  { ssr: false },
);

const PAY_METHODS = ["Cash", "bKash", "Nagad", "Card / Bank", "PayPal", "Stripe"] as const;

const COLUMN_KEYS = [
  "product",
  "total",
  "paid",
  "due",
  "status",
  "paymentStatus",
  "source",
  "date",
] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  product: "Product",
  total: "Total",
  paid: "Paid",
  due: "Due",
  status: "Status",
  paymentStatus: "Payment",
  source: "Source",
  date: "Date",
};

const DEFAULT_VISIBLE: Record<ColumnKey, boolean> = {
  product: true,
  total: true,
  paid: true,
  due: true,
  status: true,
  paymentStatus: false,
  source: false,
  date: true,
};

function statusBadgeVariant(
  status: string,
): "success" | "warning" | "muted" | "default" {
  const s = status.toLowerCase();
  if (s.includes("deliver") || s.includes("complete") || s.includes("paid") || s.includes("confirm")) {
    return "success";
  }
  if (s.includes("cancel") || s.includes("fail") || s.includes("refund")) return "muted";
  if (s.includes("pending") || s.includes("due") || s.includes("partial") || s.includes("unpaid") || s.includes("draft")) {
    return "warning";
  }
  return "default";
}

function orderSource(order: CustomerOrderSummary): "sales" | "storefront" {
  return order.source === "storefront" ? "storefront" : "sales";
}

function rowDue(row: CustomerOrderSummary) {
  return Number(row.due ?? Math.max(0, row.amount - (row.paid ?? 0)));
}

function rowPaid(row: CustomerOrderSummary) {
  return Number(row.paid ?? 0);
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={statusBadgeVariant(status)} className="capitalize">
      {status}
    </Badge>
  );
}

type Props = {
  customerId: string;
  orders: CustomerOrderSummary[];
  readOnly?: boolean;
  /** Fill parent height and pin the paging footer (drawer Orders tab). */
  fillHeight?: boolean;
  onOrdersChange?: (orders: CustomerOrderSummary[]) => void;
};

export function PartnerCustomerOrdersPanel({
  customerId,
  orders: initialOrders,
  readOnly,
  fillHeight,
  onOrdersChange,
}: Props) {
  const gridApiRef = useRef<GridApi<CustomerOrderSummary> | null>(null);
  const [orders, setOrders] = useState(initialOrders);
  const [selected, setSelected] = useState<CustomerOrderSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payOrders, setPayOrders] = useState<CustomerOrderSummary[]>([]);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<string>(PAY_METHODS[0]);
  const [payNote, setPayNote] = useState("");
  const [paying, setPaying] = useState(false);
  const [salesOrderOpen, setSalesOrderOpen] = useState(false);
  const [salesOrder, setSalesOrder] = useState<Order | null>(null);
  const [salesOrderLoading, setSalesOrderLoading] = useState(false);
  const [visibleCols, setVisibleCols] = useUserScopedState(
    "partner-customer-orders:columns",
    DEFAULT_VISIBLE,
  );

  useEffect(() => {
    setOrders(initialOrders);
  }, [initialOrders]);

  const selectedDue = useMemo(
    () => selected.reduce((sum, o) => sum + rowDue(o), 0),
    [selected],
  );

  const syncOrders = (next: CustomerOrderSummary[]) => {
    setOrders(next);
    onOrdersChange?.(next);
  };

  const refresh = async () => {
    setLoading(true);
    try {
      const next = await fetchCustomerOrders(customerId);
      syncOrders(next);
      setSelected([]);
      gridApiRef.current?.deselectAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to refresh orders");
    } finally {
      setLoading(false);
    }
  };

  const openSalesOrder = useCallback(
    async (order: CustomerOrderSummary) => {
      if (salesOrderLoading) return;
      setSalesOrderLoading(true);
      try {
        const source = orderSource(order);
        const ensured = await ensureCustomerOrderSales(customerId, order.id, source);
        if (!ensured.id) throw new Error("Sales order not found");
        const row = await fetchSalesOrder(ensured.id);
        setSalesOrder(apiSalesOrderToOrder(row));
        setSalesOrderOpen(true);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to open order");
      } finally {
        setSalesOrderLoading(false);
      }
    },
    [customerId, salesOrderLoading],
  );

  const openPay = useCallback((rows: CustomerOrderSummary[]) => {
    const payable = rows.filter((o) => rowDue(o) > 0);
    if (!payable.length) {
      toast.error("No unpaid balance on selected orders");
      return;
    }
    const first = payable[0];
    setPayOrders(payable);
    setPayAmount(String(rowDue(first).toFixed(2)));
    setPayMethod(PAY_METHODS[0]);
    setPayNote("");
    setPayOpen(true);
  }, []);

  const submitPay = async () => {
    const target = payOrders.find((o) => rowDue(o) > 0) ?? payOrders[0];
    if (!target) return;
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid payment amount");
      return;
    }
    setPaying(true);
    try {
      await recordCustomerOrderPayment(customerId, target.id, {
        source: orderSource(target),
        amount,
        method: payMethod,
        note: payNote.trim() || undefined,
      });
      toast.success(
        payOrders.length > 1
          ? `Payment recorded on ${target.orderNumber}. Remaining selected orders can be paid next.`
          : `Payment recorded on ${target.orderNumber}`,
      );
      setPayOpen(false);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setPaying(false);
    }
  };

  const OrderRowMenu = useCallback(
    ({ data }: { data: CustomerOrderSummary }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <RowActionsTrigger />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="rounded-none">
          <DropdownMenuItem onClick={() => void openSalesOrder(data)}>
            <Eye className="mr-1.5 h-3 w-3" /> Open order
          </DropdownMenuItem>
          {!readOnly ? (
            <DropdownMenuItem onClick={() => openPay([data])}>
              <CreditCard className="mr-1.5 h-3 w-3" /> Pay
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    [openSalesOrder, openPay, readOnly],
  );

  const columnDefs = useMemo<ColDef<CustomerOrderSummary>[]>(
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
        cellRenderer: (p: ICellRendererParams<CustomerOrderSummary>) =>
          p.data ? <OrderRowMenu data={p.data} /> : null,
      },
      {
        colId: "controls",
        headerName: "",
        headerCheckboxSelection: true,
        checkboxSelection: true,
        width: 40,
        maxWidth: 40,
        minWidth: 40,
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
        colId: "order",
        headerName: "Order ID",
        pinned: "left",
        width: 120,
        minWidth: 96,
        resizable: true,
        suppressMovable: true,
        suppressSizeToFit: true,
        sortable: false,
        suppressHeaderMenuButton: true,
        valueGetter: (p) => p.data?.orderNumber ?? "",
        cellRenderer: (p: ICellRendererParams<CustomerOrderSummary>) =>
          p.data ? (
            <button
              type="button"
              className="block w-full cursor-pointer truncate text-left font-semibold text-foreground no-underline hover:text-primary hover:no-underline focus-visible:outline-none"
              title={p.data.orderNumber}
              onClick={(e) => {
                e.stopPropagation();
                void openSalesOrder(p.data!);
              }}
            >
              {p.data.orderNumber}
            </button>
          ) : null,
      },
      {
        colId: "product",
        headerName: "Product",
        hide: !visibleCols.product,
        flex: 2,
        minWidth: 160,
        resizable: true,
        suppressMovable: false,
        tooltipValueGetter: (p) => p.data?.productLabel ?? "",
        valueGetter: (p) => p.data?.productLabel ?? "Order",
        cellRenderer: (p: ICellRendererParams<CustomerOrderSummary>) =>
          p.data ? (
            <button
              type="button"
              className="block w-full cursor-pointer truncate text-left font-semibold text-foreground no-underline hover:text-primary hover:no-underline focus-visible:outline-none"
              title={p.data.productLabel || "Order"}
              onClick={(e) => {
                e.stopPropagation();
                void openSalesOrder(p.data!);
              }}
            >
              {p.data.productLabel || "Order"}
            </button>
          ) : null,
      },
      {
        colId: "total",
        headerName: "Total",
        hide: !visibleCols.total,
        width: 100,
        minWidth: 80,
        type: "rightAligned",
        valueGetter: (p) => p.data?.amount ?? 0,
        valueFormatter: (p) => formatCurrency(Number(p.value ?? 0)),
      },
      {
        colId: "paid",
        headerName: "Paid",
        hide: !visibleCols.paid,
        width: 100,
        minWidth: 80,
        type: "rightAligned",
        valueGetter: (p) => (p.data ? rowPaid(p.data) : 0),
        valueFormatter: (p) => formatCurrency(Number(p.value ?? 0)),
      },
      {
        colId: "due",
        headerName: "Due",
        hide: !visibleCols.due,
        width: 100,
        minWidth: 80,
        type: "rightAligned",
        valueGetter: (p) => (p.data ? rowDue(p.data) : 0),
        valueFormatter: (p) => formatCurrency(Number(p.value ?? 0)),
        cellClass: "ag-right-aligned-cell font-semibold text-[#d32f2f]",
      },
      {
        colId: "status",
        headerName: "Status",
        hide: !visibleCols.status,
        width: 110,
        minWidth: 90,
        field: "status",
        cellRenderer: (p: ICellRendererParams<CustomerOrderSummary>) =>
          p.data ? <StatusBadge status={p.data.status} /> : null,
      },
      {
        colId: "paymentStatus",
        headerName: "Payment",
        hide: !visibleCols.paymentStatus,
        width: 110,
        minWidth: 90,
        field: "paymentStatus",
        cellRenderer: (p: ICellRendererParams<CustomerOrderSummary>) =>
          p.data ? <StatusBadge status={p.data.paymentStatus} /> : null,
      },
      {
        colId: "source",
        headerName: "Source",
        hide: !visibleCols.source,
        width: 100,
        minWidth: 80,
        valueGetter: (p) => p.data?.source ?? "",
        cellRenderer: (p: ICellRendererParams<CustomerOrderSummary>) =>
          p.data ? (
            <span className="capitalize text-[11px] text-muted-foreground">
              {p.data.source || "—"}
            </span>
          ) : null,
      },
      {
        colId: "date",
        headerName: "Date",
        hide: !visibleCols.date,
        width: 110,
        minWidth: 90,
        valueGetter: (p) => p.data?.date ?? "",
        valueFormatter: (p) =>
          p.value ? formatDate(p.value) : "",
      },
    ],
    [OrderRowMenu, openSalesOrder, visibleCols],
  );

  return (
    <AgainListGrid<CustomerOrderSummary>
      embedded
      className={cn(
        "rounded-none border border-border/70",
        fillHeight ? "min-h-0 flex-1" : "h-[360px]",
      )}
      gridClassName="[&_.ag-paging-panel]:pl-[168px]"
      rowData={orders}
      columnDefs={columnDefs}
      getRowId={(p) => `${p.data.source ?? "order"}-${p.data.id}`}
      apiRef={gridApiRef}
      onOpenColumns={() => setColumnSheetOpen(true)}
      emptyTitle="No orders yet"
      emptyHint="Orders for this customer will appear here once sales activity starts."
      banner={
        selected.length > 0 ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/70 bg-muted/20 px-2.5 py-1.5">
            <span className="text-[12px] text-muted-foreground">
              {selected.length} selected · Due {formatCurrency(selectedDue)}
            </span>
            {!readOnly ? (
              <Button
                type="button"
                size="sm"
                className="h-7 rounded-none bg-[#00a09d] text-xs text-white hover:bg-[#008f8c]"
                onClick={() => openPay(selected)}
              >
                Pay selected
              </Button>
            ) : null}
            <Button
              type="button"
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
      footerLeftActions={
        <button
          type="button"
          aria-label="Refresh orders"
          title="Refresh"
          disabled={loading}
          onClick={() => void refresh()}
          className="inline-flex h-full items-center justify-center pl-2 pr-0.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          <RefreshCw
            className={cn("h-3 w-3", loading && "animate-spin")}
            aria-hidden
          />
        </button>
      }
      gridProps={{
        rowSelection: "multiple",
        suppressRowClickSelection: true,
        colResizeDefault: "shift",
        onSelectionChanged: (e) => setSelected(e.api.getSelectedRows()),
      }}
    >
      <Sheet open={columnSheetOpen} onOpenChange={setColumnSheetOpen}>
        <SheetContent
          side="right"
          title="Columns"
          resizable
          closeButton="chevron"
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

      <Sheet open={payOpen} onOpenChange={setPayOpen}>
        <SheetContent side="right" resizable className="w-[380px] min-w-[280px] max-w-[720px] rounded-none p-0">
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Record payment
            </p>
            <SheetTitle className="text-[15px]">
              {payOrders[0]?.orderNumber || "Payment"}
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-3 p-4">
            {payOrders.length > 1 ? (
              <p className="text-[12px] text-muted-foreground">
                Paying one order at a time. {payOrders.length - 1} more selected can be paid next.
              </p>
            ) : null}
            <div className="space-y-1">
              <label className="text-[12px] font-medium text-muted-foreground">Amount</label>
              <input
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                inputMode="decimal"
                className="h-9 w-full rounded-none border border-border bg-background px-2 text-[13px] outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[12px] font-medium text-muted-foreground">Method</label>
              <Select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
                className="h-9 w-full rounded-none border border-border bg-background px-2 text-[13px]"
              >
                {PAY_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[12px] font-medium text-muted-foreground">Note</label>
              <input
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
                placeholder="Optional reference"
                className="h-9 w-full rounded-none border border-border bg-background px-2 text-[13px] outline-none"
              />
            </div>
            <Button
              type="button"
              size="sm"
              className="h-8 rounded-none bg-[#00a09d] text-white hover:bg-[#008f8c]"
              disabled={paying}
              onClick={() => void submitPay()}
            >
              {paying ? "Saving…" : "Confirm payment"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <SalesOrderFormDrawer
        open={salesOrderOpen}
        mode="edit"
        order={salesOrder}
        nested
        onOpenChange={setSalesOrderOpen}
        onSave={() => {}}
        onSaveAction={async (order, action) => {
          const saved = await persistSalesOrder(order, action);
          setSalesOrder(saved);
          await refresh();
          return saved;
        }}
        onSaved={(saved) => {
          setSalesOrder(saved);
          void refresh();
        }}
      />
    </AgainListGrid>
  );
}
