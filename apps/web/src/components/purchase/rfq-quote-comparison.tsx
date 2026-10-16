"use client";

import { useMemo } from "react";
import { Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
}: {
  rfq: PurchaseRfq;
  suppliers: SupplierOption[];
  onAward: (quoteId: string, supplierId: string) => void;
}) {
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

  if (supplierIds.length === 0) {
    return (
      <p className="px-1 py-8 text-center text-xs text-muted-foreground">
        Invite at least one supplier to compare bids.
      </p>
    );
  }

  return (
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
                    {quote ? (
                      <>
                        <Badge
                          variant={quotationStatusBadgeVariant(quote.status)}
                          className="rounded-none text-[10px]"
                        >
                          {QUOTATION_STATUS_LABELS[quote.status]}
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
                    {lq ? (
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
                  className="border-l border-border px-2 py-2 text-right text-[12px] font-semibold tabular-nums"
                >
                  {/* Always the backend-computed total_amount — never re-summed from cells. */}
                  {quote ? formatCurrency(quote.totalAmount) : "—"}
                </td>
              );
            })}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
