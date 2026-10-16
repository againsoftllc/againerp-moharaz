"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  closePosSession,
  fetchPosSessions,
  readStoredPosSessionId,
  storePosSessionId,
  type PosSession,
} from "@/lib/api/pos";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export default function PosSessionsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<PosSession[]>([]);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [actual, setActual] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      setRows(await fetchPosSessions());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load sessions");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function close() {
    if (!closingId) return;
    try {
      const row = await closePosSession(closingId, Number(actual || 0), note || undefined);
      if (readStoredPosSessionId() === closingId) storePosSessionId(null);
      toast.success(
        `Closed. Expected ${formatCurrency(Number(row.expected_cash || 0))}, difference ${formatCurrency(Number(row.cash_variance || 0))}`,
      );
      setClosingId(null);
      setActual("");
      setNote("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not close session");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <h1 className="text-sm font-semibold">Sessions</h1>
        <Button size="sm" className="rounded-none" onClick={() => router.push("/pos/sale")}>
          Open / new sale
        </Button>
      </div>
      {closingId ? (
        <div className="border-b border-border p-3 text-xs">
          <p className="mb-2 font-medium">Close session</p>
          <Label>Actual cash</Label>
          <Input className="mt-1 max-w-xs" type="number" min={0} value={actual} onChange={(e) => setActual(e.target.value)} />
          <Label className="mt-2 block">Closing note</Label>
          <Input className="mt-1 max-w-lg" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="mt-2 flex gap-1">
            <Button size="sm" className="rounded-none" onClick={() => void close()}>
              Confirm close
            </Button>
            <Button size="sm" variant="outline" className="rounded-none" onClick={() => setClosingId(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/30 text-left text-[11px] text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 font-medium">Register</th>
              <th className="px-3 py-1.5 font-medium">Cashier</th>
              <th className="px-3 py-1.5 font-medium">Status</th>
              <th className="px-3 py-1.5 font-medium">Opening</th>
              <th className="px-3 py-1.5 font-medium">Sales</th>
              <th className="px-3 py-1.5 font-medium">Expected</th>
              <th className="px-3 py-1.5 font-medium">Actual</th>
              <th className="px-3 py-1.5 font-medium">Diff</th>
              <th className="px-3 py-1.5 font-medium">Opened</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border">
                <td className="px-3 py-1.5">{row.register_name}</td>
                <td className="px-3 py-1.5">{row.cashier_name}</td>
                <td className="px-3 py-1.5">{row.status}</td>
                <td className="px-3 py-1.5 tabular-nums">{formatCurrency(Number(row.opening_float))}</td>
                <td className="px-3 py-1.5 tabular-nums">{formatCurrency(Number(row.total_sales))}</td>
                <td className="px-3 py-1.5 tabular-nums">{row.expected_cash ? formatCurrency(Number(row.expected_cash)) : "—"}</td>
                <td className="px-3 py-1.5 tabular-nums">{row.closing_cash ? formatCurrency(Number(row.closing_cash)) : "—"}</td>
                <td className="px-3 py-1.5 tabular-nums">{row.cash_variance ? formatCurrency(Number(row.cash_variance)) : "—"}</td>
                <td className="px-3 py-1.5">{formatDateTime(row.opened_at)}</td>
                <td className="px-3 py-1.5">
                  {row.status === "open" ? (
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="rounded-none" onClick={() => { storePosSessionId(row.id); router.push("/pos/sale"); }}>
                        Use
                      </Button>
                      <Button size="sm" variant="outline" className="rounded-none" onClick={() => setClosingId(row.id)}>
                        Close
                      </Button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
