"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, ClipboardList, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { VendorPortalChrome } from "@/components/vendor-portal/vendor-portal-chrome";
import { fetchVendorPortalOrderRequests, type VendorPortalOrderRequest } from "@/lib/api/vendor-portal";
import { cn, formatDate, formatMoney } from "@/lib/utils";

const STATUS_TONE: Record<string, string> = {
  submitted: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  under_review: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  revision_required: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  quotation_created: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  negotiation: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  approved: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  rejected: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  converted_to_order: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  cancelled: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
};

function money(value: string | number) {
  return formatMoney(value);
}

export default function VendorPortalOrderRequestsPage() {
  const [rows, setRows] = useState<VendorPortalOrderRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchVendorPortalOrderRequests());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load order requests");
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
        <h1 className="text-sm font-semibold">Order requests</h1>
        <span className="text-[11px] text-muted-foreground">{rows.length} requests</span>
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
      ) : rows.length === 0 ? (
        <div className="border border-border px-3 py-10 text-center">
          <ClipboardList className="mx-auto h-5 w-5 text-muted-foreground" aria-hidden />
          <p className="mt-2 text-sm font-medium">No order requests yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Submit a cart to see it appear here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const open = expanded === r.id;
            return (
              <div key={r.id} className="border border-border">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-3 py-2 text-left"
                  onClick={() => setExpanded(open ? null : r.id)}
                >
                  {open ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="font-mono text-[11px]">{r.order_request_number}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {formatDate(r.created_at)}
                  </span>
                  <Badge variant="outline" className={cn("ml-auto rounded-none text-[10px]", STATUS_TONE[r.status])}>
                    {r.status.replace(/_/g, " ")}
                  </Badge>
                  <span className="w-[110px] text-right text-xs font-medium tabular-nums">{money(r.grand_total)}</span>
                </button>

                {open && (
                  <div className="overflow-x-auto border-t border-border">
                    <table className="w-full min-w-[560px] text-xs">
                      <thead className="border-b border-border bg-muted/40 text-left text-[11px] text-muted-foreground">
                        <tr>
                          <th className="px-3 py-1.5 font-medium">Item</th>
                          <th className="px-3 py-1.5 text-right font-medium">Qty</th>
                          <th className="px-3 py-1.5 text-right font-medium">Unit</th>
                          <th className="px-3 py-1.5 text-right font-medium">Line total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.items.map((i) => (
                          <tr key={i.id} className="border-b border-border last:border-b-0">
                            <td className="px-3 py-1.5">
                              <span className="font-mono text-[11px]">{i.sku_snapshot}</span>
                              <span className="ml-2 text-muted-foreground">{i.name_snapshot}</span>
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{i.quantity}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{money(i.unit_price)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{money(i.line_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {r.vendor_note && (
                      <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
                        Note: {r.vendor_note}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </VendorPortalChrome>
  );
}
