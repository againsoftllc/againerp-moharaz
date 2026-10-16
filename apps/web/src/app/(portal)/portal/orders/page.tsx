"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, RefreshCw, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PortalChrome } from "@/components/portal/portal-chrome";
import { fetchPortalOrders, type PortalOrder } from "@/lib/api/portal";
import { cn, formatMoney } from "@/lib/utils";

const STATUS_TONE: Record<string, string> = {
  confirmed: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  partial_received: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  completed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  cancelled: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
};

const STATUS_LABEL: Record<string, string> = {
  confirmed: "Confirmed",
  partial_received: "Partially received",
  completed: "Completed",
  cancelled: "Cancelled",
};

function money(value: string | number) {
  return formatMoney(value);
}

export default function PortalOrdersPage() {
  const [orders, setOrders] = useState<PortalOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchPortalOrders();
      setOrders(res.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load orders");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PortalChrome>
      <div className="mb-3 flex items-center gap-2">
        <h1 className="text-sm font-semibold">Purchase orders</h1>
        <span className="text-[11px] text-muted-foreground">{orders.length} orders</span>
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

      {loading ? (
        <p className="border border-border px-3 py-6 text-xs text-muted-foreground">Loading…</p>
      ) : orders.length === 0 ? (
        <div className="border border-border px-3 py-10 text-center">
          <ShoppingCart className="mx-auto h-5 w-5 text-muted-foreground" aria-hidden />
          <p className="mt-2 text-sm font-medium">No orders yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Orders appear here once your buyer confirms them.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map((o) => {
            const open = expanded === o.id;
            return (
              <div key={o.id} className="border border-border">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-3 py-2 text-left"
                  onClick={() => setExpanded(open ? null : o.id)}
                >
                  {open ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="font-mono text-[11px]">{o.po_number}</span>
                  <span className="text-[11px] text-muted-foreground">{o.order_date}</span>
                  <span className="hidden text-[11px] text-muted-foreground sm:inline">
                    → {o.warehouse_name ?? "—"}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn("ml-auto rounded-none text-[10px]", STATUS_TONE[o.status])}
                  >
                    {STATUS_LABEL[o.status] ?? o.status}
                  </Badge>
                  <span className="w-[110px] text-right text-xs font-medium tabular-nums">
                    {money(o.total)}
                  </span>
                </button>

                {open && (
                  <div className="overflow-x-auto border-t border-border">
                    <table className="w-full min-w-[560px] text-xs">
                      <thead className="border-b border-border bg-muted/40 text-left text-[11px] text-muted-foreground">
                        <tr>
                          <th className="px-3 py-1.5 font-medium">Item</th>
                          <th className="px-3 py-1.5 text-right font-medium">Ordered</th>
                          <th className="px-3 py-1.5 text-right font-medium">Received</th>
                          <th className="px-3 py-1.5 text-right font-medium">Unit</th>
                          <th className="px-3 py-1.5 text-right font-medium">Line total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {o.lines.map((l, i) => (
                          <tr key={i} className="border-b border-border last:border-b-0">
                            <td className="px-3 py-1.5">
                              <span className="font-mono text-[11px]">{l.sku}</span>
                              <span className="ml-2 text-muted-foreground">{l.name}</span>
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {l.quantity_ordered}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {l.quantity_received}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {money(l.unit_cost)}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {money(l.line_total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </PortalChrome>
  );
}
