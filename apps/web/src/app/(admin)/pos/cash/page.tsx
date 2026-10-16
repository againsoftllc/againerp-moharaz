"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addPosCashMovement, fetchPosCash, readStoredPosSessionId, type PosCashMovement } from "@/lib/api/pos";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export default function PosCashPage() {
  const [rows, setRows] = useState<PosCashMovement[]>([]);
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("other");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      setRows(await fetchPosCash(readStoredPosSessionId() || undefined));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load cash movements");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    const sessionId = readStoredPosSessionId();
    if (!sessionId) {
      toast.error("Open a POS session first");
      return;
    }
    try {
      await addPosCashMovement(sessionId, {
        direction,
        amount: Number(amount),
        reason,
        note: note || undefined,
      });
      setAmount("");
      setNote("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not record cash movement");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="border-b border-border px-3 py-1.5">
        <h1 className="text-sm font-semibold">Cash management</h1>
      </div>
      <div className="grid gap-2 border-b border-border p-3 sm:grid-cols-5">
        <div>
          <Label>Direction</Label>
          <select className="mt-1 flex h-8 w-full rounded-none border border-input bg-background px-2 text-xs" value={direction} onChange={(e) => setDirection(e.target.value as "in" | "out")}>
            <option value="in">Cash in</option>
            <option value="out">Cash out</option>
          </select>
        </div>
        <div>
          <Label>Amount</Label>
          <Input className="mt-1" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <Label>Reason</Label>
          <select className="mt-1 flex h-8 w-full rounded-none border border-input bg-background px-2 text-xs" value={reason} onChange={(e) => setReason(e.target.value)}>
            {direction === "in" ? (
              <>
                <option value="drawer_add">Drawer add</option>
                <option value="owner_deposit">Owner deposit</option>
                <option value="opening_adjustment">Opening adjustment</option>
                <option value="other">Other</option>
              </>
            ) : (
              <>
                <option value="expense">Expense</option>
                <option value="supplier_payment">Supplier payment</option>
                <option value="petty_cash">Petty cash</option>
                <option value="other">Other</option>
              </>
            )}
          </select>
        </div>
        <div>
          <Label>Note</Label>
          <Input className="mt-1" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="flex items-end">
          <Button className="rounded-none" onClick={() => void save()} disabled={!amount}>
            Record
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/30 text-left text-[11px] text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 font-medium">When</th>
              <th className="px-3 py-1.5 font-medium">Direction</th>
              <th className="px-3 py-1.5 font-medium">Amount</th>
              <th className="px-3 py-1.5 font-medium">Reason</th>
              <th className="px-3 py-1.5 font-medium">User</th>
              <th className="px-3 py-1.5 font-medium">Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border">
                <td className="px-3 py-1.5">{formatDateTime(row.created_at)}</td>
                <td className="px-3 py-1.5">{row.direction}</td>
                <td className="px-3 py-1.5 tabular-nums">{formatCurrency(Number(row.amount))}</td>
                <td className="px-3 py-1.5">{row.reason}</td>
                <td className="px-3 py-1.5">{row.created_by_name || "—"}</td>
                <td className="px-3 py-1.5">{row.note || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
