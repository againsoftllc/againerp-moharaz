"use client";

import { useCallback, useEffect, useState } from "react";
import { Package, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { VendorPortalChrome } from "@/components/vendor-portal/vendor-portal-chrome";
import { fetchVendorPortalOrders, type VendorPortalFinalOrder } from "@/lib/api/vendor-portal";
import { cn, formatDate, formatMoney } from "@/lib/utils";

const STATUS_TONE: Record<string, string> = {
  confirmed: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  processing: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  shipped: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  delivered: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  cancelled: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
};

const PAYMENT_TONE: Record<string, string> = {
  paid: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  partial: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  unpaid: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
};

function money(value: string | number) {
  return formatMoney(value);
}

export default function VendorPortalOrdersPage() {
  const [rows, setRows] = useState<VendorPortalFinalOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchVendorPortalOrders());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <VendorPortalChrome>
      <div className="mb-3 flex items-center gap-2">
        <h1 className="text-sm font-semibold">Orders</h1>
        <span className="text-[11px] text-muted-foreground">{rows.length} orders</span>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7 rounded-none"
          aria-label="Refresh"
          onClick={() => void load()}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
      </div>

      <div className="border border-border">
        {loading ? (
          <p className="px-3 py-6 text-xs text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="px-3 py-10 text-center">
            <Package className="mx-auto h-5 w-5 text-muted-foreground" aria-hidden />
            <p className="mt-2 text-sm font-medium">No orders yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Orders appear here once you accept a quotation.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-xs">
              <thead className="border-b border-border bg-muted/40 text-left text-[11px] text-muted-foreground">
                <tr>
                  <th className="px-3 py-1.5 font-medium">Order</th>
                  <th className="px-3 py-1.5 font-medium">Date</th>
                  <th className="px-3 py-1.5 font-medium">Status</th>
                  <th className="px-3 py-1.5 font-medium">Payment</th>
                  <th className="px-3 py-1.5 text-right font-medium">Total</th>
                  <th className="px-3 py-1.5 text-right font-medium">Due</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-1.5 font-mono text-[11px]">{o.order_number}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{formatDate(o.created_at)}</td>
                    <td className="px-3 py-1.5">
                      <Badge variant="outline" className={cn("rounded-none text-[10px]", STATUS_TONE[o.status] ?? STATUS_TONE.confirmed)}>
                        {o.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-1.5">
                      <Badge variant="outline" className={cn("rounded-none text-[10px]", PAYMENT_TONE[o.payment_status] ?? PAYMENT_TONE.unpaid)}>
                        {o.payment_status}
                      </Badge>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-medium">{money(o.grand_total)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{money(o.due_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </VendorPortalChrome>
  );
}
