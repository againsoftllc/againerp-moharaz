"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { fetchPosPayments } from "@/lib/api/pos";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export default function PosPaymentsPage() {
  const [rows, setRows] = useState<
    { id: string; cart_number: string; payment_method: string; amount: string; reference: string | null; created_at: string | null }[]
  >([]);

  const load = useCallback(async () => {
    try {
      setRows(await fetchPosPayments());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load payments");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="border-b border-border px-3 py-1.5">
        <h1 className="text-sm font-semibold">POS payments</h1>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/30 text-left text-[11px] text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 font-medium">Order</th>
              <th className="px-3 py-1.5 font-medium">Method</th>
              <th className="px-3 py-1.5 font-medium">Amount</th>
              <th className="px-3 py-1.5 font-medium">Reference</th>
              <th className="px-3 py-1.5 font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border">
                <td className="px-3 py-1.5">{row.cart_number}</td>
                <td className="px-3 py-1.5">{row.payment_method}</td>
                <td className="px-3 py-1.5 tabular-nums">{formatCurrency(Number(row.amount))}</td>
                <td className="px-3 py-1.5">{row.reference || "—"}</td>
                <td className="px-3 py-1.5">{formatDateTime(row.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
