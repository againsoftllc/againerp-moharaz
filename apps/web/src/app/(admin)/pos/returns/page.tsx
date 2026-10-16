"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createPosReturn,
  fetchPosReturns,
  lookupPosSale,
  readStoredPosSessionId,
  type PosReturnRow,
  type PosSaleLookup,
} from "@/lib/api/pos";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export default function PosReturnsPage() {
  const [q, setQ] = useState("");
  const [sale, setSale] = useState<PosSaleLookup | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState("cash");
  const [rows, setRows] = useState<PosReturnRow[]>([]);

  const load = useCallback(async () => {
    try {
      setRows(await fetchPosReturns());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load returns");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function findSale() {
    try {
      const data = await lookupPosSale(q);
      setSale(data);
      setQty(Object.fromEntries(data.lines.map((line) => [line.sales_order_line_id, 0])));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Original sale not found");
      setSale(null);
    }
  }

  async function confirm() {
    const sessionId = readStoredPosSessionId();
    if (!sessionId || !sale) {
      toast.error("Open a POS session before refunding");
      return;
    }
    const lines = sale.lines
      .filter((line) => (qty[line.sales_order_line_id] || 0) > 0)
      .map((line) => {
        const quantity = qty[line.sales_order_line_id];
        const unit = line.quantity_sold ? line.line_total / line.quantity_sold : line.unit_price;
        return {
          item_id: line.item_id,
          quantity,
          refund_amount: Number((unit * quantity).toFixed(2)),
          sales_order_line_id: line.sales_order_line_id,
          serial_number: line.serial_number || undefined,
        };
      });
    if (!lines.length) {
      toast.error("Select items to return");
      return;
    }
    try {
      await createPosReturn(sessionId, {
        original_sales_order_id: sale.sales_order_id,
        lines,
        refund_method: method,
        reason: reason || undefined,
      });
      toast.success("Return posted");
      setSale(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not post return");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="border-b border-border px-3 py-1.5">
        <h1 className="text-sm font-semibold">Returns</h1>
      </div>
      <div className="border-b border-border p-3">
        <div className="flex max-w-lg gap-1">
          <Input placeholder="Order, receipt, invoice, or POS number" value={q} onChange={(e) => setQ(e.target.value)} />
          <Button className="rounded-none" onClick={() => void findSale()}>
            Find
          </Button>
        </div>
        {sale ? (
          <div className="mt-3 text-xs">
            <p className="font-medium">
              {sale.cart_number || sale.order_number} · {sale.customer_name || "Walk-in"} · {formatCurrency(sale.total)}
            </p>
            <table className="mt-2 w-full">
              <tbody>
                {sale.lines.map((line) => (
                  <tr key={line.sales_order_line_id} className="border-b border-border">
                    <td className="py-1.5">{line.name}</td>
                    <td className="py-1.5 text-muted-foreground">Sold {line.quantity_sold} · remaining {line.quantity_remaining}</td>
                    <td className="py-1.5">
                      <Input
                        type="number"
                        min={0}
                        max={line.quantity_remaining}
                        className="h-7 w-20"
                        value={qty[line.sales_order_line_id] ?? 0}
                        onChange={(e) => setQty((s) => ({ ...s, [line.sales_order_line_id]: Number(e.target.value) }))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <div>
                <Label>Refund method</Label>
                <select className="mt-1 flex h-8 rounded-none border border-input bg-background px-2 text-xs" value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="bank">Bank</option>
                  <option value="mobile_banking">Mobile Banking</option>
                </select>
              </div>
              <div className="flex-1">
                <Label>Reason</Label>
                <Input className="mt-1" value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
              <Button className="rounded-none" onClick={() => void confirm()}>
                Confirm return
              </Button>
            </div>
          </div>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/30 text-left text-[11px] text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 font-medium">Return</th>
              <th className="px-3 py-1.5 font-medium">Amount</th>
              <th className="px-3 py-1.5 font-medium">Method</th>
              <th className="px-3 py-1.5 font-medium">Reason</th>
              <th className="px-3 py-1.5 font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border">
                <td className="px-3 py-1.5">{row.return_number}</td>
                <td className="px-3 py-1.5 tabular-nums">{formatCurrency(Number(row.refund_total))}</td>
                <td className="px-3 py-1.5">{row.refund_method}</td>
                <td className="px-3 py-1.5">{row.reason || "—"}</td>
                <td className="px-3 py-1.5">{formatDateTime(row.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
