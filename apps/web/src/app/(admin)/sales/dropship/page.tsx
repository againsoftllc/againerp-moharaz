"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api/client";
import {
  fetchDropshipOrders,
  updateDropshipOrder,
  type DropshipOrder,
} from "@/lib/api/dropship";
import { cn } from "@/lib/utils";

const STATUSES = [
  { value: "pending", label: "Pending (place on 1688)" },
  { value: "ordered", label: "Ordered on supplier" },
  { value: "shipped", label: "Supplier shipped" },
  { value: "done", label: "Done" },
] as const;

export default function DropshipFulfillmentPage() {
  const [orders, setOrders] = useState<DropshipOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<
    Record<string, { status: string; supplier_order_id: string; notes: string }>
  >({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchDropshipOrders();
      setOrders(res.data);
      const next: typeof drafts = {};
      for (const o of res.data) {
        next[o.order_id] = {
          status: o.supplier_order_status || "pending",
          supplier_order_id: o.supplier_order_id || "",
          notes: o.supplier_notes || "",
        };
      }
      setDrafts(next);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to load dropship orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (orderId: string) => {
    const d = drafts[orderId];
    if (!d) return;
    setSavingId(orderId);
    try {
      const updated = await updateDropshipOrder(orderId, {
        supplier_order_status: d.status,
        supplier_order_id: d.supplier_order_id,
        supplier_notes: d.notes,
      });
      setOrders((list) => list.map((o) => (o.order_id === orderId ? updated : o)));
      toast.success("Supplier fulfillment saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-5 p-4 lg:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Sales · Dropship
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">1688 Fulfillment</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Customer orders with Elim products. Open supplier link, place order on 1688/Taobao
            manually, then mark status here.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/website/import">Elim Import</Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}

      {!loading && orders.length === 0 && (
        <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
          No dropship orders yet. Import Elim products, publish them, then wait for customer orders.
        </div>
      )}

      <div className="space-y-4">
        {orders.map((order) => {
          const draft = drafts[order.order_id] || {
            status: "pending",
            supplier_order_id: "",
            notes: "",
          };
          return (
            <div
              key={order.order_id}
              className="rounded-xl border border-input bg-card p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {order.order_number}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      · {order.customer_name} · ৳{order.grand_total}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Order status: {order.status} · Supplier: {order.supplier_order_status}
                  </p>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {order.lines.map((line) => (
                  <div
                    key={`${order.order_id}-${line.sku}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-input/70 bg-muted/20 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="line-clamp-1 font-medium">{line.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {line.sku} · qty {line.quantity} · sell ৳{line.unit_price_bdt}
                        {line.cost_cny != null ? ` · cost ¥${line.cost_cny}` : ""}
                      </p>
                    </div>
                    {line.supplier_link && (
                      <Button size="sm" variant="outline" asChild>
                        <a href={line.supplier_link} target="_blank" rel="noreferrer">
                          Open 1688/Taobao <ExternalLink className="ml-1 h-3.5 w-3.5" />
                        </a>
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <label className="text-[11px] font-medium text-muted-foreground">
                  Supplier status
                  <select
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={draft.status}
                    onChange={(e) =>
                      setDrafts((d) => ({
                        ...d,
                        [order.order_id]: { ...draft, status: e.target.value },
                      }))
                    }
                  >
                    {STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-[11px] font-medium text-muted-foreground">
                  Supplier order ID
                  <Input
                    className="mt-1"
                    value={draft.supplier_order_id}
                    placeholder="1688 order #"
                    onChange={(e) =>
                      setDrafts((d) => ({
                        ...d,
                        [order.order_id]: { ...draft, supplier_order_id: e.target.value },
                      }))
                    }
                  />
                </label>
                <label className="text-[11px] font-medium text-muted-foreground">
                  Notes
                  <Input
                    className="mt-1"
                    value={draft.notes}
                    placeholder="Tracking / remarks"
                    onChange={(e) =>
                      setDrafts((d) => ({
                        ...d,
                        [order.order_id]: { ...draft, notes: e.target.value },
                      }))
                    }
                  />
                </label>
              </div>
              <div className="mt-3 flex justify-end">
                <Button
                  size="sm"
                  disabled={savingId === order.order_id}
                  onClick={() => void save(order.order_id)}
                >
                  {savingId === order.order_id ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Save fulfillment
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
