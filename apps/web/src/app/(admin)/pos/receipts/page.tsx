"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { fetchPosReceipts, type PosReceipt } from "@/lib/api/pos";
import { PosReceiptView } from "@/components/pos/pos-receipt-print";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatDateTime } from "@/lib/utils";

export default function PosReceiptsPage() {
  const [rows, setRows] = useState<PosReceipt[]>([]);
  const [active, setActive] = useState<PosReceipt | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await fetchPosReceipts());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load receipts");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="border-b border-border px-3 py-1.5">
        <h1 className="text-sm font-semibold">Receipts</h1>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/30 text-left text-[11px] text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 font-medium">Receipt</th>
              <th className="px-3 py-1.5 font-medium">Invoice</th>
              <th className="px-3 py-1.5 font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="cursor-pointer border-b border-border hover:bg-muted/30" onClick={() => setActive(row)}>
                <td className="px-3 py-1.5">{row.receipt_number}</td>
                <td className="px-3 py-1.5">{row.invoice_number}</td>
                <td className="px-3 py-1.5">{formatDateTime(row.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Sheet open={Boolean(active)} onOpenChange={(open) => !open && setActive(null)}>
        <SheetContent resizable className="min-w-[280px] w-[420px] max-w-[720px] rounded-none p-0" title="Receipt">
          <SheetHeader className="border-b border-border px-3 py-2">
            <SheetTitle className="text-sm">Receipt</SheetTitle>
          </SheetHeader>
          <div className="p-3">{active ? <PosReceiptView receipt={active} /> : null}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
