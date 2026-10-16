"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { fetchPosOrders, type PosOrderSummary } from "@/lib/api/pos";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export default function PosOrdersPage() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<PosOrderSummary[]>([]);

  const load = useCallback(async (search?: string) => {
    try {
      setRows(await fetchPosOrders({ status: "completed", q: search }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load orders");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <h1 className="text-sm font-semibold">POS orders</h1>
        <Input
          className="max-w-xs"
          placeholder="Search order, customer, phone"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            void load(e.target.value);
          }}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/30 text-left text-[11px] text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 font-medium">Order</th>
              <th className="px-3 py-1.5 font-medium">Customer</th>
              <th className="px-3 py-1.5 font-medium">Items</th>
              <th className="px-3 py-1.5 font-medium">Amount</th>
              <th className="px-3 py-1.5 font-medium">Payment</th>
              <th className="px-3 py-1.5 font-medium">Cashier</th>
              <th className="px-3 py-1.5 font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border">
                <td className="px-3 py-1.5">{row.cart_number}</td>
                <td className="px-3 py-1.5">{row.customer_name}</td>
                <td className="px-3 py-1.5 tabular-nums">{row.item_count}</td>
                <td className="px-3 py-1.5 tabular-nums">{formatCurrency(row.total)}</td>
                <td className="px-3 py-1.5">{row.payment_methods.join(", ")}</td>
                <td className="px-3 py-1.5">{row.cashier_name || "—"}</td>
                <td className="px-3 py-1.5">{formatDateTime(row.completed_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
