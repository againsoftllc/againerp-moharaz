"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  fetchPurchaseReceipts,
  type ApiPurchaseReceipt,
} from "@/lib/api/purchase-receipts";
import type { ApiPurchaseOrder } from "@/lib/api/purchase-orders";

export function PurchaseReceivingHistory({
  receipts,
  warehouseName,
}: {
  receipts: ApiPurchaseReceipt[];
  warehouseName?: string | null;
}) {
  const ordered = useMemo(
    () => [...receipts].sort((a, b) => a.receipt_date.localeCompare(b.receipt_date)),
    [receipts],
  );

  if (ordered.length === 0) {
    return <p className="text-xs text-muted-foreground">No receipts yet.</p>;
  }

  return (
    <div className="overflow-x-auto border border-border">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-[11px] text-muted-foreground">
            <th className="px-2 py-1.5 font-medium">Receipt</th>
            <th className="px-2 py-1.5 font-medium">Date</th>
            <th className="px-2 py-1.5 text-right font-medium">Received qty</th>
            <th className="px-2 py-1.5 font-medium">Warehouse</th>
            <th className="px-2 py-1.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((row) => {
            const qty = row.lines.reduce((sum, line) => sum + line.quantity_received, 0);
            return (
              <tr key={row.id} className="border-b border-border last:border-b-0">
                <td className="px-2 py-1.5 font-mono text-[11px]">{row.receipt_number}</td>
                <td className="px-2 py-1.5 text-muted-foreground">{row.receipt_date}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{qty}</td>
                <td className="px-2 py-1.5">{row.warehouse_name ?? warehouseName ?? "—"}</td>
                <td className="px-2 py-1.5">
                  <Badge variant="outline" className={cn("rounded-none text-[10px]", receiptTone(row.status))}>
                    {receiptLabel(row.status)}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function receiptLabel(status: string) {
  if (status === "posted") return "Received";
  if (status === "draft") return "Draft";
  if (status === "cancelled") return "Cancelled";
  return status;
}

export function receiptTone(status: string) {
  if (status === "posted") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  if (status === "cancelled") return "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400";
  return "border-muted-foreground/30 bg-muted text-muted-foreground";
}

export async function loadReceiptsForOrder(orderId: string) {
  const res = await fetchPurchaseReceipts({ purchase_order_id: orderId });
  return res.data;
}

export function poReceiveSummary(order: ApiPurchaseOrder) {
  const ordered = order.lines.reduce((sum, line) => sum + line.quantity_ordered, 0);
  const received = order.lines.reduce((sum, line) => sum + line.quantity_received, 0);
  return {
    ordered,
    received,
    remaining: Math.max(0, ordered - received),
  };
}
