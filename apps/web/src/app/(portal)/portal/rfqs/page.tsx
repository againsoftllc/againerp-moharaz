"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, FileText, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PortalChrome } from "@/components/portal/portal-chrome";
import {
  fetchPortalRfqs,
  submitPortalRfqQuote,
  updatePortalRfqQuote,
  type PortalRfq,
  type PortalRfqQuoteInput,
} from "@/lib/api/portal";
import { cn, formatMoney } from "@/lib/utils";

const STATUS_TONE: Record<string, string> = {
  sent: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  vendor_response: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  quotation: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  approved: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  po_created: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  closed: "border-muted-foreground/30 bg-muted text-muted-foreground",
  cancelled: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
};

const STATUS_LABEL: Record<string, string> = {
  sent: "Awaiting your bid",
  vendor_response: "Viewed",
  quotation: "Quoted",
  approved: "Awarded",
  po_created: "Order placed",
  closed: "Closed",
  cancelled: "Cancelled",
};

/** Once an RFQ reaches one of these, bidding (submit or amend) is no longer accepted. */
const LOCKED_STATUSES = new Set(["approved", "po_created", "closed", "cancelled"]);

type DraftState = {
  quoteNumber: string;
  validUntil: string;
  leadTimeDays: string;
  moq: string;
  prices: Record<string, string>;
};

function addDaysIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function num(value: string | number) {
  return formatMoney(value);
}

function buildDraft(rfq: PortalRfq): DraftState {
  const q = rfq.my_quote;
  const prices: Record<string, string> = {};
  for (const line of rfq.lines) {
    const lq = q?.line_quotes.find((x) => x.rfq_line_id === line.id);
    prices[line.id] = lq ? String(lq.unit_price) : "";
  }
  return {
    quoteNumber: q?.quote_number ?? "",
    validUntil: q?.valid_until ?? addDaysIso(14),
    leadTimeDays: q ? String(q.lead_time_days) : "7",
    moq: q ? String(q.moq) : "1",
    prices,
  };
}

export default function PortalRfqsPage() {
  const [rfqs, setRfqs] = useState<PortalRfq[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchPortalRfqs();
      setRfqs(res.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load RFQs");
      setRfqs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (rfq: PortalRfq) => {
    const open = expanded === rfq.id;
    setExpanded(open ? null : rfq.id);
    if (!open) {
      setDrafts((prev) => (prev[rfq.id] ? prev : { ...prev, [rfq.id]: buildDraft(rfq) }));
    }
  };

  const updateDraft = (rfqId: string, patch: Partial<DraftState>) => {
    setDrafts((prev) => ({ ...prev, [rfqId]: { ...prev[rfqId], ...patch } }));
  };

  const updatePrice = (rfqId: string, lineId: string, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [rfqId]: { ...prev[rfqId], prices: { ...prev[rfqId].prices, [lineId]: value } },
    }));
  };

  const submitBid = async (rfq: PortalRfq) => {
    const draft = drafts[rfq.id] ?? buildDraft(rfq);
    const input: PortalRfqQuoteInput = {
      quote_number: draft.quoteNumber.trim() || undefined,
      valid_until: draft.validUntil || undefined,
      lead_time_days: Number.parseInt(draft.leadTimeDays, 10) || 0,
      moq: Number.parseInt(draft.moq, 10) || 1,
      line_quotes: rfq.lines.map((line) => ({
        rfq_line_id: line.id,
        unit_price: Number.parseFloat(draft.prices[line.id] ?? "0") || 0,
      })),
    };
    setSubmitting(rfq.id);
    try {
      if (rfq.my_quote) {
        await updatePortalRfqQuote(rfq.id, rfq.my_quote.id, input);
        toast.success("Your bid was updated");
      } else {
        await submitPortalRfqQuote(rfq.id, input);
        toast.success("Your bid was submitted");
      }
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit your bid");
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <PortalChrome>
      <div className="mb-3 flex items-center gap-2">
        <h1 className="text-sm font-semibold">Requests for quotation</h1>
        <span className="text-[11px] text-muted-foreground">{rfqs.length} RFQs</span>
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
      ) : rfqs.length === 0 ? (
        <div className="border border-border px-3 py-10 text-center">
          <FileText className="mx-auto h-5 w-5 text-muted-foreground" aria-hidden />
          <p className="mt-2 text-sm font-medium">No RFQs yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Requests for quotation appear here once a buyer sends one to you.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rfqs.map((rfq) => {
            const open = expanded === rfq.id;
            const locked = LOCKED_STATUSES.has(rfq.status);
            const draft = drafts[rfq.id] ?? buildDraft(rfq);
            return (
              <div key={rfq.id} className="border border-border">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-3 py-2 text-left"
                  onClick={() => toggle(rfq)}
                >
                  {open ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="font-mono text-[11px]">{rfq.rfq_number}</span>
                  <span className="hidden text-[11px] text-muted-foreground sm:inline">
                    {rfq.title}
                  </span>
                  <span className="text-[11px] text-muted-foreground">Due {rfq.deadline}</span>
                  <Badge
                    variant="outline"
                    className={cn("ml-auto rounded-none text-[10px]", STATUS_TONE[rfq.status])}
                  >
                    {STATUS_LABEL[rfq.status] ?? rfq.status}
                  </Badge>
                  {rfq.my_quote ? (
                    <span className="w-[110px] text-right text-xs font-medium tabular-nums">
                      {num(rfq.my_quote.total_amount)}
                    </span>
                  ) : null}
                </button>

                {open && (
                  <div className="border-t border-border">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[560px] text-xs">
                        <thead className="border-b border-border bg-muted/40 text-left text-[11px] text-muted-foreground">
                          <tr>
                            <th className="px-3 py-1.5 font-medium">Item</th>
                            <th className="px-3 py-1.5 text-right font-medium">Requested qty</th>
                            <th className="px-3 py-1.5 text-right font-medium">Your unit price</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rfq.lines.map((line) => (
                            <tr key={line.id} className="border-b border-border last:border-b-0">
                              <td className="px-3 py-1.5">
                                <span className="font-mono text-[11px]">{line.sku}</span>
                                <span className="ml-2 text-muted-foreground">{line.name}</span>
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{line.quantity}</td>
                              <td className="px-3 py-1.5 text-right">
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  disabled={locked}
                                  value={draft.prices[line.id] ?? ""}
                                  onChange={(e) => updatePrice(rfq.id, line.id, e.target.value)}
                                  className="h-7 w-28 border border-input bg-background px-2 text-right text-xs outline-none focus:border-foreground disabled:opacity-50"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="grid grid-cols-2 gap-3 border-t border-border px-3 py-3 sm:grid-cols-4">
                      <label className="space-y-1 text-[11px] text-muted-foreground">
                        Quote reference
                        <input
                          type="text"
                          disabled={locked}
                          value={draft.quoteNumber}
                          onChange={(e) => updateDraft(rfq.id, { quoteNumber: e.target.value })}
                          placeholder="Your reference #"
                          className="block h-7 w-full border border-input bg-background px-2 text-xs outline-none focus:border-foreground disabled:opacity-50"
                        />
                      </label>
                      <label className="space-y-1 text-[11px] text-muted-foreground">
                        Valid until
                        <input
                          type="date"
                          disabled={locked}
                          value={draft.validUntil}
                          onChange={(e) => updateDraft(rfq.id, { validUntil: e.target.value })}
                          className="block h-7 w-full border border-input bg-background px-2 text-xs outline-none focus:border-foreground disabled:opacity-50"
                        />
                      </label>
                      <label className="space-y-1 text-[11px] text-muted-foreground">
                        Lead time (days)
                        <input
                          type="number"
                          min={0}
                          disabled={locked}
                          value={draft.leadTimeDays}
                          onChange={(e) => updateDraft(rfq.id, { leadTimeDays: e.target.value })}
                          className="block h-7 w-full border border-input bg-background px-2 text-xs outline-none focus:border-foreground disabled:opacity-50"
                        />
                      </label>
                      <label className="space-y-1 text-[11px] text-muted-foreground">
                        MOQ
                        <input
                          type="number"
                          min={1}
                          disabled={locked}
                          value={draft.moq}
                          onChange={(e) => updateDraft(rfq.id, { moq: e.target.value })}
                          className="block h-7 w-full border border-input bg-background px-2 text-xs outline-none focus:border-foreground disabled:opacity-50"
                        />
                      </label>
                    </div>

                    <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2">
                      {locked ? (
                        <span className="text-[11px] text-muted-foreground">
                          This RFQ is no longer accepting bids.
                        </span>
                      ) : null}
                      <Button
                        size="sm"
                        className="rounded-none"
                        disabled={locked || submitting === rfq.id}
                        onClick={() => void submitBid(rfq)}
                      >
                        {submitting === rfq.id
                          ? "Submitting…"
                          : rfq.my_quote
                            ? "Update bid"
                            : "Submit bid"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </PortalChrome>
  );
}
