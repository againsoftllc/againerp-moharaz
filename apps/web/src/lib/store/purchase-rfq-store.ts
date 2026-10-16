import { create } from "zustand";
import {
  purchaseRfqSeed,
  type PurchaseRfq,
  type QuotationStatus,
  type RfqStatus,
  type RfqVendorQuote,
} from "@/lib/mock-data/purchase-rfq";

type PurchaseRfqStore = {
  rfqs: PurchaseRfq[];
  getById: (id: string) => PurchaseRfq | undefined;
  updateStatus: (id: string, status: RfqStatus) => void;
  patchRfq: (id: string, patch: Partial<PurchaseRfq>) => void;
  addRfq: (rfq: PurchaseRfq) => void;
  removeRfqs: (ids: string[]) => void;
  upsertQuote: (rfqId: string, quote: RfqVendorQuote, lines?: PurchaseRfq["lines"]) => void;
  removeQuotes: (ids: string[]) => void;
  awardQuote: (rfqId: string, quoteId: string) => void;
  updateQuoteStatus: (rfqId: string, quoteId: string, status: QuotationStatus) => void;
};

export const usePurchaseRfqStore = create<PurchaseRfqStore>()((set, get) => ({
  rfqs: [...purchaseRfqSeed],
  getById: (id) => get().rfqs.find((r) => r.id === id),
  updateStatus: (id, status) =>
    set((s) => ({
      rfqs: s.rfqs.map((r) => (r.id === id ? { ...r, status } : r)),
    })),
  patchRfq: (id, patch) =>
    set((s) => ({
      rfqs: s.rfqs.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    })),
  addRfq: (rfq) => set((s) => ({ rfqs: [rfq, ...s.rfqs] })),
  removeRfqs: (ids) => {
    const drop = new Set(ids);
    set((s) => ({ rfqs: s.rfqs.filter((r) => !drop.has(r.id)) }));
  },
  upsertQuote: (rfqId, quote, lines) =>
    set((s) => ({
      rfqs: s.rfqs.map((r) => {
        if (r.id !== rfqId) return r;
        let merged = r.lines;
        if (lines) {
          merged = [...r.lines];
          for (const line of lines) {
            const idx = merged.findIndex((x) => x.id === line.id || x.sku === line.sku);
            if (idx >= 0) merged[idx] = { ...merged[idx], ...line, id: merged[idx].id };
            else merged.push(line);
          }
        }
        const remapped: RfqVendorQuote = {
          ...quote,
          lineQuotes: quote.lineQuotes.map((lq) => {
            const draft = lines?.find((l) => l.id === lq.rfqLineId);
            if (!draft) return lq;
            const kept = merged.find((l) => l.id === draft.id || l.sku === draft.sku);
            return kept ? { ...lq, rfqLineId: kept.id } : lq;
          }),
        };
        const exists = r.quotes.some((q) => q.id === remapped.id);
        const quotes = exists
          ? r.quotes.map((q) => (q.id === remapped.id ? remapped : q))
          : [remapped, ...r.quotes];
        const invited = r.invitedSupplierIds.includes(remapped.supplierId)
          ? r.invitedSupplierIds
          : [...r.invitedSupplierIds, remapped.supplierId];
        const nextStatus: RfqStatus =
          r.status === "draft" || r.status === "sent" || r.status === "vendor_response"
            ? "quotation"
            : r.status;
        return {
          ...r,
          lines: merged,
          quotes,
          invitedSupplierIds: invited,
          status: nextStatus,
        };
      }),
    })),
  removeQuotes: (ids) => {
    const drop = new Set(ids);
    set((s) => ({
      rfqs: s.rfqs.map((r) => ({
        ...r,
        quotes: r.quotes.filter((q) => !drop.has(q.id)),
      })),
    }));
  },
  awardQuote: (rfqId, quoteId) =>
    set((s) => ({
      rfqs: s.rfqs.map((r) => {
        if (r.id !== rfqId) return r;
        const quote = r.quotes.find((q) => q.id === quoteId);
        if (!quote) return r;
        return {
          ...r,
          status: "approved" as RfqStatus,
          awardedSupplierId: quote.supplierId,
          quotes: r.quotes.map((q) => ({
            ...q,
            status: q.id === quoteId ? ("accepted" as QuotationStatus) : q.status === "submitted" ? ("rejected" as QuotationStatus) : q.status,
          })),
        };
      }),
    })),
  updateQuoteStatus: (rfqId, quoteId, status) =>
    set((s) => ({
      rfqs: s.rfqs.map((r) =>
        r.id === rfqId
          ? {
              ...r,
              quotes: r.quotes.map((q) => (q.id === quoteId ? { ...q, status } : q)),
            }
          : r,
      ),
    })),
}));

export function rfqStatusBadgeVariant(
  status: RfqStatus,
): "default" | "secondary" | "success" | "warning" | "muted" | "outline" {
  switch (status) {
    case "draft":
      return "muted";
    case "sent":
    case "vendor_response":
      return "secondary";
    case "quotation":
      return "warning";
    case "approved":
    case "po_created":
      return "success";
    case "closed":
      return "outline";
    case "cancelled":
      return "outline";
    default:
      return "muted";
  }
}

export function quotationStatusBadgeVariant(
  status: QuotationStatus,
): "default" | "secondary" | "success" | "warning" | "muted" | "outline" {
  switch (status) {
    case "draft":
      return "muted";
    case "submitted":
      return "secondary";
    case "accepted":
      return "success";
    case "rejected":
      return "outline";
    default:
      return "muted";
  }
}

export function allQuotationsFromStore(rfqs: PurchaseRfq[]): (RfqVendorQuote & { rfqNumber: string; rfqTitle: string })[] {
  return rfqs.flatMap((r) =>
    r.quotes.map((q) => ({
      ...q,
      rfqNumber: r.number,
      rfqTitle: r.title,
    })),
  );
}
