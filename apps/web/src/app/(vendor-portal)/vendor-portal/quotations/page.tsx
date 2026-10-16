"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, FileText, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { VendorPortalChrome } from "@/components/vendor-portal/vendor-portal-chrome";
import {
  acceptVendorPortalQuotation,
  fetchVendorPortalQuotations,
  negotiateVendorPortalQuotation,
  rejectVendorPortalQuotation,
  type VendorPortalQuotation,
} from "@/lib/api/vendor-portal";
import { cn, formatMoney } from "@/lib/utils";

const STATUS_TONE: Record<string, string> = {
  draft: "border-muted-foreground/30 bg-muted text-muted-foreground",
  sent: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  viewed: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  negotiation: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  accepted: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  rejected: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  expired: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  cancelled: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  superseded: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

const RESPONDABLE = new Set(["sent", "viewed", "negotiation"]);

function money(value: string | number) {
  return formatMoney(value);
}

export default function VendorPortalQuotationsPage() {
  const [rows, setRows] = useState<VendorPortalQuotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [negotiateId, setNegotiateId] = useState<string | null>(null);
  const [negotiateMessage, setNegotiateMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchVendorPortalQuotations());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load quotations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function accept(id: string) {
    setBusyId(id);
    try {
      await acceptVendorPortalQuotation(id);
      toast.success("Quotation accepted");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not accept quotation");
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: string) {
    setBusyId(id);
    try {
      await rejectVendorPortalQuotation(id);
      toast.success("Quotation rejected");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reject quotation");
    } finally {
      setBusyId(null);
    }
  }

  async function sendNegotiation(id: string) {
    if (!negotiateMessage.trim()) return;
    setBusyId(id);
    try {
      await negotiateVendorPortalQuotation(id, { request_type: "other", message: negotiateMessage.trim() });
      toast.success("Negotiation request sent");
      setNegotiateId(null);
      setNegotiateMessage("");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send negotiation request");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <VendorPortalChrome>
      <div className="mb-3 flex items-center gap-2">
        <h1 className="text-sm font-semibold">Quotations</h1>
        <span className="text-[11px] text-muted-foreground">{rows.length} quotations</span>
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
          <FileText className="mx-auto h-5 w-5 text-muted-foreground" aria-hidden />
          <p className="mt-2 text-sm font-medium">No quotations yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Your buyer sends quotations for your order requests.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((q) => {
            const open = expanded === q.id;
            const respondable = RESPONDABLE.has(q.status);
            return (
              <div key={q.id} className="border border-border">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-3 py-2 text-left"
                  onClick={() => setExpanded(open ? null : q.id)}
                >
                  {open ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="font-mono text-[11px]">{q.quotation_number}</span>
                  <span className="text-[11px] text-muted-foreground">rev {q.revision_number}</span>
                  {q.valid_until && (
                    <span className="hidden text-[11px] text-muted-foreground sm:inline">
                      Valid until {q.valid_until}
                    </span>
                  )}
                  <Badge variant="outline" className={cn("ml-auto rounded-none text-[10px]", STATUS_TONE[q.status])}>
                    {q.status}
                  </Badge>
                  <span className="w-[110px] text-right text-xs font-medium tabular-nums">{money(q.grand_total)}</span>
                </button>

                {open && (
                  <div className="border-t border-border">
                    <div className="overflow-x-auto">
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
                          {q.items.map((i) => (
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
                    </div>

                    {q.notes && (
                      <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
                        Note: {q.notes}
                      </p>
                    )}
                    {q.payment_terms && (
                      <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
                        Payment terms: {q.payment_terms}
                        {q.delivery_terms ? ` · Delivery: ${q.delivery_terms}` : ""}
                      </p>
                    )}

                    {respondable && (
                      <div className="border-t border-border px-3 py-2">
                        {negotiateId === q.id ? (
                          <div className="space-y-2">
                            <Textarea
                              rows={2}
                              className="rounded-none"
                              placeholder="Describe what you'd like changed (price, quantity, delivery date, terms)…"
                              value={negotiateMessage}
                              onChange={(e) => setNegotiateMessage(e.target.value)}
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                className="rounded-none"
                                disabled={!negotiateMessage.trim() || busyId === q.id}
                                onClick={() => void sendNegotiation(q.id)}
                              >
                                Send request
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-none"
                                onClick={() => {
                                  setNegotiateId(null);
                                  setNegotiateMessage("");
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" className="rounded-none" disabled={busyId === q.id} onClick={() => void accept(q.id)}>
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-none"
                              disabled={busyId === q.id}
                              onClick={() => setNegotiateId(q.id)}
                            >
                              Request changes
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-none text-red-600 dark:text-red-400"
                              disabled={busyId === q.id}
                              onClick={() => void reject(q.id)}
                            >
                              Reject
                            </Button>
                          </div>
                        )}
                      </div>
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
