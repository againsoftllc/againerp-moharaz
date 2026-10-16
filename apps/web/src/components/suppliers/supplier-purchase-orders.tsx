"use client";

import "@/components/providers/ag-grid-provider";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { Ban, CheckCircle2, PackageCheck, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { GridChipBadge } from "@/components/shared/grid-chip-badge";
import { AgainListGrid } from "@/components/shared/again-list-grid";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import {
  cancelPurchaseOrder,
  confirmPurchaseOrder,
  fetchPurchaseOrders,
  type ApiPurchaseOrder,
} from "@/lib/api/purchase-orders";
import { PoFormDrawer } from "@/components/suppliers/po-form-drawer";
import { cn, formatCurrency } from "@/lib/utils";

const NUMERIC_CELL = "ag-right-aligned-cell tabular-nums";
const NUMERIC_HEADER = "ag-right-aligned-header";

export const PO_STATUS_TONE: Record<string, string> = {
  draft: "border-muted-foreground/30 bg-muted text-muted-foreground",
  confirmed: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  partial_received: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  completed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  cancelled: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
};

export const PO_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  confirmed: "Confirmed",
  partial_received: "Partially Received",
  completed: "Fully Received",
  cancelled: "Cancelled",
};

export function receivedPct(order: ApiPurchaseOrder): number {
  const ordered = order.lines.reduce((s, l) => s + l.quantity_ordered, 0);
  if (!ordered) return 0;
  const received = order.lines.reduce((s, l) => s + l.quantity_received, 0);
  return Math.round((received / ordered) * 100);
}

/** Purchase orders for one supplier — used by the workspace PO History tab. */
export function SupplierPurchaseOrders({
  supplierId,
  supplierName,
  fillHeight,
}: {
  supplierId: string;
  supplierName?: string;
  fillHeight?: boolean;
}) {
  const canWrite = useAdminCanWrite();
  const [orders, setOrders] = useState<ApiPurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOrder, setEditOrder] = useState<ApiPurchaseOrder | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchPurchaseOrders({ supplier_id: supplierId, per_page: 500 });
      setOrders(res.data);
      setEditOrder((current) =>
        current ? (res.data.find((o) => o.id === current.id) ?? current) : current,
      );
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (fn: () => Promise<unknown>, message: string) => {
      try {
        await fn();
        toast.success(message);
        void load();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Action failed");
      }
    },
    [load],
  );

  const openOrder = useCallback((order: ApiPurchaseOrder) => {
    setCreateOpen(false);
    setEditOrder(order);
  }, []);

  const displayOrders = useMemo(
    () =>
      [...orders].sort((a, b) => {
        if (b.order_date !== a.order_date) return b.order_date.localeCompare(a.order_date);
        return (b.created_at || "").localeCompare(a.created_at || "");
      }),
    [orders],
  );

  const columnDefs = useMemo<ColDef<ApiPurchaseOrder>[]>(
    () => [
      {
        colId: "po",
        headerName: "PO",
        field: "po_number",
        minWidth: 120,
        flex: 1.1,
        cellClass: "font-mono text-[11px]",
        cellRenderer: (p: ICellRendererParams<ApiPurchaseOrder>) =>
          p.data ? (
            <button
              type="button"
              className="block w-full cursor-pointer truncate text-left font-semibold text-foreground no-underline hover:text-primary hover:no-underline focus-visible:outline-none"
              title={p.data.po_number}
              onClick={(e) => {
                e.stopPropagation();
                openOrder(p.data!);
              }}
            >
              {p.data.po_number}
            </button>
          ) : null,
      },
      {
        colId: "date",
        headerName: "Date",
        field: "order_date",
        width: 112,
        minWidth: 96,
        sort: "desc",
      },
      {
        colId: "warehouse",
        headerName: "Warehouse",
        field: "warehouse_name",
        minWidth: 120,
        flex: 1,
        valueFormatter: (p) => (p.value ? String(p.value) : "—"),
      },
      {
        colId: "lines",
        headerName: "Lines",
        width: 80,
        minWidth: 64,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueGetter: (p) => p.data?.lines.length ?? 0,
      },
      {
        colId: "received",
        headerName: "Received",
        width: 96,
        minWidth: 80,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueGetter: (p) => (p.data ? receivedPct(p.data) : 0),
        valueFormatter: (p) => `${Number(p.value ?? 0)}%`,
      },
      {
        colId: "total",
        headerName: "Total",
        width: 120,
        minWidth: 96,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueGetter: (p) => Number(p.data?.total ?? 0),
        valueFormatter: (p) => formatCurrency(Number(p.value ?? 0)),
      },
      {
        colId: "status",
        headerName: "Status",
        field: "status",
        width: 140,
        minWidth: 120,
        cellRenderer: (p: ICellRendererParams<ApiPurchaseOrder>) => {
          const status = p.data?.status;
          if (!status) return "—";
          const label = PO_STATUS_LABEL[status] ?? status;
          return (
            <GridChipBadge className={PO_STATUS_TONE[status]} title={label}>
              {label}
            </GridChipBadge>
          );
        },
      },
      ...(canWrite
        ? [
            {
              colId: "actions",
              headerName: "",
              width: 88,
              minWidth: 72,
              maxWidth: 100,
              sortable: false,
              resizable: false,
              cellRenderer: (p: ICellRendererParams<ApiPurchaseOrder>) => {
                const o = p.data;
                if (!o) return null;
                return (
                  <div className="flex h-full items-center justify-end gap-1">
                    {o.status === "draft" && (
                      <>
                        <button
                          type="button"
                          title="Confirm"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            void act(() => confirmPurchaseOrder(o.id), `${o.po_number} confirmed`);
                          }}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Cancel"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            void act(() => cancelPurchaseOrder(o.id), `${o.po_number} cancelled`);
                          }}
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                    {(o.status === "confirmed" || o.status === "partial_received") && (
                      <button
                        type="button"
                        title="Receive goods"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          openOrder(o);
                        }}
                      >
                        <PackageCheck className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              },
            } satisfies ColDef<ApiPurchaseOrder>,
          ]
        : []),
    ],
    [act, canWrite, openOrder],
  );

  return (
    <div className={cn(fillHeight ? "flex min-h-full flex-1 flex-col" : undefined)}>
      <section
        className={cn(
          "border border-border",
          fillHeight && "flex min-h-[220px] flex-1 flex-col overflow-hidden",
        )}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
          <h3 className="text-xs font-semibold">Purchase orders</h3>
          <span className="text-[11px] text-muted-foreground">{orders.length} total</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-none"
            aria-label="Refresh orders"
            onClick={() => void load()}
          >
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
          </Button>
          {canWrite && (
            <Button
              size="sm"
              className="ml-auto h-6 rounded-none text-xs"
              onClick={() => {
                setEditOrder(null);
                setCreateOpen(true);
              }}
            >
              <Plus className="mr-1 h-3 w-3" /> New PO
            </Button>
          )}
        </div>
        <AgainListGrid<ApiPurchaseOrder>
          embedded
          className={fillHeight ? "flex min-h-[220px] flex-1 flex-col" : "h-[360px]"}
          gridClassName="[&_.ag-root-wrapper]:flex [&_.ag-root-wrapper]:flex-col [&_.ag-root-wrapper-body]:min-h-0 [&_.ag-root-wrapper-body]:flex-1 [&_.ag-paging-panel]:shrink-0 [&_.ag-paging-panel]:pl-[220px]"
          rowData={displayOrders}
          columnDefs={columnDefs}
          defaultColDef={{
            sortable: true,
            resizable: true,
            filter: false,
            suppressHeaderMenuButton: true,
            minWidth: 72,
          }}
          footerLeftActions={
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {loading
                ? "Loading…"
                : `${orders.length} ${orders.length === 1 ? "order" : "orders"}`}
            </span>
          }
          emptyTitle="No purchase orders raised for this supplier yet."
          gridProps={{ colResizeDefault: "shift" }}
        />
      </section>

      <PoFormDrawer
        key={`po:${editOrder?.id ?? "new"}:${createOpen}`}
        open={createOpen || Boolean(editOrder)}
        onOpenChange={(open) => {
          if (open) return;
          setEditOrder(null);
          setCreateOpen(false);
        }}
        supplierId={supplierId}
        supplierName={supplierName}
        order={editOrder}
        onCreated={load}
      />
    </div>
  );
}
