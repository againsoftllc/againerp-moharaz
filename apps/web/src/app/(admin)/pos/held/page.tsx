"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fetchHeldCarts, fetchPosOrders, readStoredPosSessionId, resumePosCart, type PosCart, type PosOrderSummary } from "@/lib/api/pos";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export default function PosHeldPage() {
  const router = useRouter();
  const [rows, setRows] = useState<PosCart[]>([]);
  const [fallback, setFallback] = useState<PosOrderSummary[]>([]);

  const load = useCallback(async () => {
    const sessionId = readStoredPosSessionId();
    try {
      if (sessionId) {
        setRows(await fetchHeldCarts(sessionId));
        setFallback([]);
      } else {
        setRows([]);
        setFallback(await fetchPosOrders({ status: "held" }));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load held orders");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function resume(id: string) {
    try {
      await resumePosCart(id);
      router.push("/pos/sale");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not resume order");
    }
  }

  const empty = rows.length === 0 && fallback.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="border-b border-border px-3 py-1.5">
        <h1 className="text-sm font-semibold">Held orders</h1>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {empty ? <p className="p-4 text-xs text-muted-foreground">No held orders.</p> : null}
        <table className="w-full text-xs">
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border">
                <td className="px-3 py-1.5">{row.held_label || row.cart_number}</td>
                <td className="px-3 py-1.5 tabular-nums">{formatCurrency(Number(row.total))}</td>
                <td className="px-3 py-1.5">{row.held_at ? formatDateTime(row.held_at) : ""}</td>
                <td className="px-3 py-1.5">
                  <Button size="sm" className="rounded-none" onClick={() => void resume(row.id)}>
                    Resume
                  </Button>
                </td>
              </tr>
            ))}
            {fallback.map((row) => (
              <tr key={row.id} className="border-b border-border">
                <td className="px-3 py-1.5">{row.held_label || row.cart_number}</td>
                <td className="px-3 py-1.5 tabular-nums">{formatCurrency(row.total)}</td>
                <td className="px-3 py-1.5">{row.held_at ? formatDateTime(row.held_at) : ""}</td>
                <td className="px-3 py-1.5">
                  <Button size="sm" className="rounded-none" onClick={() => void resume(row.id)}>
                    Resume
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
