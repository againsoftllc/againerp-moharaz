"use client";

import { useCallback, useEffect, useState } from "react";
import { Receipt, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { VendorPortalChrome } from "@/components/vendor-portal/vendor-portal-chrome";
import { fetchVendorPortalInvoices, type VendorPortalInvoice } from "@/lib/api/vendor-portal";
import { cn, formatMoney } from "@/lib/utils";

const STATUS_TONE: Record<string, string> = {
  unpaid: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  partial: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  paid: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  overdue: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
};

function money(value: string | number) {
  return formatMoney(value);
}

export default function VendorPortalInvoicesPage() {
  const [rows, setRows] = useState<VendorPortalInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchVendorPortalInvoices());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load invoices");
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
        <h1 className="text-sm font-semibold">Invoices</h1>
        <span className="text-[11px] text-muted-foreground">{rows.length} invoices</span>
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
            <Receipt className="mx-auto h-5 w-5 text-muted-foreground" aria-hidden />
            <p className="mt-2 text-sm font-medium">No invoices yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-xs">
              <thead className="border-b border-border bg-muted/40 text-left text-[11px] text-muted-foreground">
                <tr>
                  <th className="px-3 py-1.5 font-medium">Invoice</th>
                  <th className="px-3 py-1.5 font-medium">Bill date</th>
                  <th className="px-3 py-1.5 font-medium">Due date</th>
                  <th className="px-3 py-1.5 font-medium">Status</th>
                  <th className="px-3 py-1.5 text-right font-medium">Total</th>
                  <th className="px-3 py-1.5 text-right font-medium">Paid</th>
                  <th className="px-3 py-1.5 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((inv) => (
                  <tr key={inv.id} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-1.5 font-mono text-[11px]">{inv.invoice_number}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{inv.bill_date}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{inv.due_date}</td>
                    <td className="px-3 py-1.5">
                      <Badge variant="outline" className={cn("rounded-none text-[10px]", STATUS_TONE[inv.status] ?? STATUS_TONE.unpaid)}>
                        {inv.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-medium">{money(inv.grand_total)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{money(inv.amount_paid)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{money(inv.balance)}</td>
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
