"use client";

import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import type { ApiPurchaseOrder } from "@/lib/api/purchase-orders";
import { fetchPurchaseReceipts, type ApiPurchaseReceipt } from "@/lib/api/purchase-receipts";
import { PO_STATUS_LABEL, PO_STATUS_TONE } from "@/components/suppliers/supplier-purchase-orders";
import {
  PurchaseReceivingHistory,
  poReceiveSummary,
} from "@/components/purchase/purchase-receiving-history";
import { cn, formatCurrency } from "@/lib/utils";

export function PoDetailDrawer({
  open,
  onOpenChange,
  order,
  billedByLineId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: ApiPurchaseOrder | null;
  billedByLineId?: Map<string, number>;
}) {
  const lines = useMemo(() => order?.lines ?? [], [order]);
  const [receipts, setReceipts] = useState<ApiPurchaseReceipt[]>([]);

  useEffect(() => {
    if (!open || !order?.id) {
      setReceipts([]);
      return;
    }
    let cancelled = false;
    void fetchPurchaseReceipts({ purchase_order_id: order.id })
      .then((res) => {
        if (!cancelled) setReceipts(res.data);
      })
      .catch(() => {
        if (!cancelled) setReceipts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, order?.id]);

  const summary = order ? poReceiveSummary(order) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        resizable
        resizeMaxWidth={720}
        className="flex min-w-[160px] w-[560px] max-w-[720px] flex-col gap-0 p-0"
      >
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{order?.po_number ?? "Purchase order"}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {order
              ? `${order.supplier_name ?? "Supplier"} · ${order.warehouse_name ?? "Warehouse"}`
              : "Select an order"}
          </p>
        </div>
        {order && (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="border border-border px-2 py-1.5">
                <p className="text-[10px] uppercase text-muted-foreground">Status</p>
                <Badge
                  variant="outline"
                  className={cn("mt-1 rounded-none text-[10px]", PO_STATUS_TONE[order.status])}
                >
                  {PO_STATUS_LABEL[order.status] ?? order.status}
                </Badge>
              </div>
              <div className="border border-border px-2 py-1.5">
                <p className="text-[10px] uppercase text-muted-foreground">Expected</p>
                <p className="mt-1 tabular-nums">{order.expected_date ?? "—"}</p>
              </div>
              <div className="border border-border px-2 py-1.5">
                <p className="text-[10px] uppercase text-muted-foreground">Order date</p>
                <p className="mt-1 tabular-nums">{order.order_date}</p>
              </div>
              <div className="border border-border px-2 py-1.5">
                <p className="text-[10px] uppercase text-muted-foreground">Total</p>
                <p className="mt-1 tabular-nums">{formatCurrency(Number(order.total))}</p>
              </div>
            </div>

            <div className="border border-border">
              <div className="grid grid-cols-[1fr_52px_52px_52px_72px] gap-1 border-b border-border bg-muted/40 px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
                <span>Item</span>
                <span className="text-right">Ordered</span>
                <span className="text-right">Recv</span>
                <span className="text-right">Billed</span>
                <span className="text-right">Cost</span>
              </div>
              {lines.map((l) => (
                <div
                  key={l.id}
                  className="grid grid-cols-[1fr_52px_52px_52px_72px] items-center gap-1 border-b border-border px-2 py-1.5 last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[11px]">{l.sku}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{l.name}</p>
                  </div>
                  <span className="text-right text-xs tabular-nums">{l.quantity_ordered}</span>
                  <span className="text-right text-xs tabular-nums">{l.quantity_received}</span>
                  <span className="text-right text-xs tabular-nums">
                    {billedByLineId?.get(l.id) ?? 0}
                  </span>
                  <span className="text-right text-xs tabular-nums">
                    {formatCurrency(Number(l.unit_cost))}
                  </span>
                </div>
              ))}
            </div>

            {summary && (
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="border border-border px-2 py-1.5">
                  <p className="text-[10px] uppercase text-muted-foreground">Ordered</p>
                  <p className="mt-0.5 tabular-nums font-medium">{summary.ordered}</p>
                </div>
                <div className="border border-border px-2 py-1.5">
                  <p className="text-[10px] uppercase text-muted-foreground">Received</p>
                  <p className="mt-0.5 tabular-nums font-medium">{summary.received}</p>
                </div>
                <div className="border border-border px-2 py-1.5">
                  <p className="text-[10px] uppercase text-muted-foreground">Remaining</p>
                  <p className="mt-0.5 tabular-nums font-medium">{summary.remaining}</p>
                </div>
              </div>
            )}

            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase text-muted-foreground">
                Receiving history
              </p>
              <PurchaseReceivingHistory receipts={receipts} warehouseName={order.warehouse_name} />
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
