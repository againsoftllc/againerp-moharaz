"use client";

import { useMemo, useState } from "react";
import { Pencil, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { submitRfqQuote, updateRfqQuote } from "@/lib/api/purchase-rfq";
import {
  QUOTATION_STATUS_LABELS,
  quotationStatusBadgeVariant,
  type PurchaseRfq,
  type RfqVendorQuote,
} from "@/lib/mock-data/purchase-rfq";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

type SupplierOption = { id: string; name: string };

/** Bid comparison: statuses past which the deal is already committed — awarding a
 * different quote no longer makes sense (mirrors the RFQ status transitions doc). */
const AWARD_LOCKED_RFQ_STATUSES = new Set(["approved", "po_created", "cancelled"]);

/**
 * Side-by-side supplier bid comparison for one RFQ — rows are the RFQ's request lines,
 * columns are the union of invited suppliers and suppliers who actually quoted (an
 * invited-but-silent supplier still gets a column reading "Awaiting bid"). Follows the
 * same "one dynamic column per option" pattern as `CompetitorPriceCell` in
 * `product-grid.tsx`, adapted so the *lowest* price per row is the one that's highlighted
 * (the buyer wants the cheapest bid, the opposite meaning from that price-compare view).
 *
 * Footer totals always render the backend-provided `totalAmount` — never a client-side
 * re-sum of the cells — per the STEP 02 cost-audit lesson about client/server total drift.
 */
export function RfqQuoteComparison({
  rfq,
  suppliers,
  onAward,
  onRecorded,
}: {
  rfq: PurchaseRfq;
  suppliers: SupplierOption[];
  onAward: (quoteId: string, supplierId: string) => void;
  /** Called after staff record or change a bid so the parent reloads the RFQ. */
  onRecorded?: () => void;
}) {
  // Staff-recorded bid (phone / email / WhatsApp quote): one supplier column at a time turns into inputs.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [leadDays, setLeadDays] = useState("7");
  const [moqValue, setMoqValue] = useState("1");
  const [validUntil, setValidUntil] = useState("");
  const [saving, setSaving] = useState(false);
  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? id;

  const quoteBySupplier = useMemo(() => {
    const map = new Map<string, RfqVendorQuote>();
    for (const quote of rfq.quotes) {
      const existing = map.get(quote.supplierId);
      if (!existing || (quote.submittedAt ?? "") >= (existing.submittedAt ?? "")) {
        map.set(quote.supplierId, quote);
      }
    }
    return map;
  }, [rfq.quotes]);

  const supplierIds = useMemo(() => {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const id of rfq.invitedSupplierIds) {
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
    for (const quote of rfq.quotes) {
      if (!seen.has(quote.supplierId)) {
        seen.add(quote.supplierId);
        ids.push(quote.supplierId);
      }
    }
    return ids;
  }, [rfq.invitedSupplierIds, rfq.quotes]);

  const lowestByLine = useMemo(() => {
    const lows = new Map<string, number>();
    for (const line of rfq.lines) {
      let min: number | undefined;
      for (const id of supplierIds) {
        const quote = quoteBySupplier.get(id);
        if (!quote || (quote.status !== "submitted" && quote.status !== "accepted")) continue;
        const lq = quote.lineQuotes.find((q) => q.rfqLineId === line.id);
        if (lq == null) continue;
        if (min == null || lq.unitPrice < min) min = lq.unitPrice;
      }
      if (min != null) lows.set(line.id, min);
    }
    return lows;
  }, [rfq.lines, supplierIds, quoteBySupplier]);

  const rfqLocked = AWARD_LOCKED_RFQ_STATUSES.has(rfq.status);

  const lowestTotal = useMemo(() => {
    let min: number | undefined;
    for (const id of supplierIds) {
      const quote = quoteBySupplier.get(id);
      if (!quote || (quote.status !== "submitted" && quote.status !== "accepted")) continue;
      if (min == null || quote.totalAmount < min) min = quote.totalAmount;
    }
    return min;
  }, [supplierIds, quoteBySupplier]);

  const bidCount = supplierIds.filter((id) => quoteBySupplier.has(id)).length;
  const winner = rfq.quotes.find((q) => q.status === "accepted");

  const startRecording = (supplierId: string) => {
    const existing = quoteBySupplier.get(supplierId);
    const next: Record<string, string> = {};
    for (const line of rfq.lines) {
      const lq = existing?.lineQuotes.find((q) => q.rfqLineId === line.id);
      next[line.id] = lq ? String(lq.unitPrice) : "";
    }
    setPrices(next);
    setLeadDays(String(existing?.leadTimeDays ?? 7));
    setMoqValue(String(existing?.moq ?? 1));
    setValidUntil(existing?.validUntil ?? "");
    setEditingId(supplierId);
  };

  const saveRecording = async () => {
    if (!editingId) return;
    const lineQuotes = rfq.lines
      .map((line) => ({ rfq_line_id: line.id, unit_price: Number(prices[line.id]) }))
      .filter((q) => Number.isFinite(q.unit_price) && q.unit_price > 0);
    if (lineQuotes.length === 0) {
      toast.error("Enter a unit price for at least one line");
      return;
    }
    const existing = quoteBySupplier.get(editingId);
    const input = {
      supplier_id: editingId,
      valid_until: validUntil || undefined,
      lead_time_days: Math.max(0, Math.floor(Number(leadDays) || 0)),
      moq: Math.max(1, Math.floor(Number(moqValue) || 1)),
      line_quotes: lineQuotes,
    };
    setSaving(true);
    try {
      if (existing) await updateRfqQuote(rfq.id, existing.id, input);
      else await submitRfqQuote(rfq.id, input);
      toast.success(`Bid recorded for ${supplierName(editingId)}`);
      setEditingId(null);
      onRecorded?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not record bid");
    } finally {
      setSaving(false);
    }
  };

  if (supplierIds.length === 0) {
    return (
      <p className="px-1 py-8 text-center text-xs text-muted-foreground">
        Invite at least one supplier to compare bids.
      </p>
    );
  }

  return (
    <div className="space-y-2">
    <p className="border border-border bg-muted/20 px-2 py-1.5 text-[11px] text-muted-foreground">
      {winner ? (
        <>
          <span className="font-medium text-foreground">Awarded to {supplierName(winner.supplierId)}</span> —
          other bids were marked Not selected.
        </>
      ) : rfqLocked ? (
        "This RFQ is closed — bids can no longer be changed."
      ) : bidCount === 0 ? (
        "No bids yet. Use Record bid under a supplier to enter the price they quoted you."
      ) : (
        `${bidCount} of ${supplierIds.length} supplier${supplierIds.length === 1 ? "" : "s"} bid. The lowest price in each row is green — Award the best bid to create the purchase order.`
      )}
    </p>
    <div className="overflow-x-auto border border-border">
      <table className="w-full min-w-[640px] border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-border bg-muted/20 text-left text-muted-foreground">
            <th className="sticky left-0 z-10 min-w-[200px] bg-muted/20 px-2 py-2 align-bottom font-medium">
              Line
            </th>
            {supplierIds.map((id) => {
              const quote = quoteBySupplier.get(id);
              const canAward = Boolean(quote) && quote?.status === "submitted" && !rfqLocked;
              return (
                <th
                  key={id}
                  className="min-w-[190px] border-l border-border px-2 py-2 align-bottom font-normal"
                >
                  <div className="space-y-1">
                    <p
                      className="truncate text-[12px] font-semibold text-foreground"
                      title={supplierName(id)}
                    >
                      {supplierName(id)}
                    </p>
                    {editingId === id ? (
                      <div className="space-y-1">
                        <label className="block text-[10px] text-muted-foreground">
                          Lead time (days)
                          <Input type="number" min={0} value={leadDays} onChange={(e) => setLeadDays(e.target.value)} className="mt-0.5 h-7 rounded-none px-2 text-[11px]" />
                        </label>
                        <label className="block text-[10px] text-muted-foreground">
                          MOQ
                          <Input type="number" min={1} value={moqValue} onChange={(e) => setMoqValue(e.target.value)} className="mt-0.5 h-7 rounded-none px-2 text-[11px]" />
                        </label>
                        <label className="block text-[10px] text-muted-foreground">
                          Valid until
                          <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="mt-0.5 h-7 rounded-none px-2 text-[11px]" />
                        </label>
                        <div className="flex gap-1 pt-1">
                          <Button type="button" size="sm" className="h-6 rounded-none px-2 text-[10px]" disabled={saving} onClick={() => void saveRecording()}>
                            {saving ? "Saving…" : "Save bid"}
                          </Button>
                          <Button type="button" size="sm" variant="ghost" className="h-6 rounded-none px-2 text-[10px]" disabled={saving} onClick={() => setEditingId(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : quote ? (
                      <>
                        <Badge
                          variant={quotationStatusBadgeVariant(quote.status)}
                          className="rounded-none text-[10px]"
                        >
                          {quote.status === "rejected" ? "Not selected" : QUOTATION_STATUS_LABELS[quote.status]}
                        </Badge>
                        <p
                          className="truncate font-mono text-[10px] text-muted-foreground"
                          title={quote.quoteNumber}
                        >
                          {quote.quoteNumber || "—"}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          Valid until {quote.validUntil ? formatDate(quote.validUntil) : "—"}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {quote.leadTimeDays}d lead · MOQ {quote.moq}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {quote.source === "portal" ? "Via portal" : "Recorded by staff"}
                        </p>
                      </>
                    ) : (
                      <Badge variant="muted" className="rounded-none text-[10px]">
                        Awaiting bid
                      </Badge>
                    )}
                    {editingId !== id && !rfqLocked ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="mt-1 mr-1 h-6 rounded-none px-2 text-[10px]"
                        onClick={() => startRecording(id)}
                      >
                        <Pencil className="mr-1 h-3 w-3" />
                        {quote ? "Edit bid" : "Record bid"}
                      </Button>
                    ) : null}
                    {quote?.status === "accepted" ? (
                      <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                        <Trophy className="h-3 w-3" />
                        Awarded
                      </span>
                    ) : null}
                    {quote?.status === "accepted" ? null : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-1 h-6 rounded-none px-2 text-[10px]"
                      disabled={!canAward}
                      title={
                        rfqLocked
                          ? "This RFQ is already awarded or closed"
                          : !quote
                            ? "Awaiting a bid from this supplier"
                            : quote.status !== "submitted"
                              ? "Only a submitted quote can be awarded"
                              : "Award this quote and create the PO"
                      }
                      onClick={() => quote && onAward(quote.id, id)}
                    >
                      <Trophy className="mr-1 h-3 w-3" />
                      Award
                    </Button>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rfq.lines.map((line) => (
            <tr key={line.id} className="border-b border-border/70">
              <td className="sticky left-0 z-10 bg-card px-2 py-2 align-top">
                <p className="truncate text-[12px] font-medium" title={line.name}>
                  {line.name || line.sku}
                </p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {line.sku} · Qty {line.quantity}
                </p>
              </td>
              {supplierIds.map((id) => {
                const quote = quoteBySupplier.get(id);
                const lq = quote?.lineQuotes.find((q) => q.rfqLineId === line.id);
                const lowest = lowestByLine.get(line.id);
                const isLowest =
                  lq != null &&
                  lowest != null &&
                  lq.unitPrice === lowest &&
                  (quote?.status === "submitted" || quote?.status === "accepted");
                return (
                  <td
                    key={id}
                    className={cn(
                      "border-l border-border px-2 py-2 text-right tabular-nums",
                      isLowest && "font-semibold text-emerald-600 dark:text-emerald-400",
                    )}
                  >
                    {editingId === id ? (
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={prices[line.id] ?? ""}
                        onChange={(e) => setPrices((p) => ({ ...p, [line.id]: e.target.value }))}
                        placeholder="Unit price"
                        className="h-7 rounded-none px-2 text-right text-[12px]"
                      />
                    ) : lq ? (
                      formatCurrency(lq.unitPrice)
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border bg-muted/10">
            <td className="sticky left-0 z-10 bg-muted/10 px-2 py-2 text-[11px] font-semibold">
              Total
            </td>
            {supplierIds.map((id) => {
              const quote = quoteBySupplier.get(id);
              return (
                <td
                  key={id}
                  className={cn(
                    "border-l border-border px-2 py-2 text-right text-[12px] font-semibold tabular-nums",
                    quote && lowestTotal != null && quote.totalAmount === lowestTotal &&
                      (quote.status === "submitted" || quote.status === "accepted") &&
                      "text-emerald-600 dark:text-emerald-400",
                  )}
                >
                  {/* Always the backend-computed total_amount — never re-summed from cells. */}
                  {quote ? formatCurrency(quote.totalAmount) : "—"}
                  {quote && lowestTotal != null && quote.totalAmount === lowestTotal &&
                  (quote.status === "submitted" || quote.status === "accepted") ? (
                    <span className="block text-[10px] font-normal">Lowest total</span>
                  ) : null}
                </td>
              );
            })}
          </tr>
        </tfoot>
      </table>
    </div>
    </div>
  );
}
