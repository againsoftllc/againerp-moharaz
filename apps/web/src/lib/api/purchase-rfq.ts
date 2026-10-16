import { apiFetch } from "@/lib/api/client";
import type {
  PurchaseRfq,
  QuotationStatus,
  RfqStatus,
  RfqVendorQuote,
} from "@/lib/mock-data/purchase-rfq";

/* ------------------------------------------------------------------ types */

export type ApiPurchaseRfqLine = {
  id: string;
  item_id: string | null;
  sku: string;
  name: string;
  quantity: number;
};

export type ApiRfqQuoteLine = {
  rfq_line_id: string;
  unit_price: string | number;
};

export type ApiPurchaseRfqQuote = {
  id: string;
  purchase_rfq_id: string;
  supplier_id: string;
  quote_number: string;
  status: QuotationStatus;
  valid_until: string | null;
  lead_time_days: number;
  moq: number;
  total_amount: string | number;
  submitted_at: string | null;
  source: "portal" | "manual";
  line_quotes: ApiRfqQuoteLine[];
};

export type ApiPurchaseRfq = {
  id: string;
  company_id: string;
  rfq_number: string;
  title: string;
  status: RfqStatus;
  deadline: string;
  buyer_name: string | null;
  notes: string | null;
  created_by: string | null;
  sent_at: string | null;
  awarded_supplier_id: string | null;
  linked_po_id: string | null;
  created_at: string;
  updated_at: string;
  lines: ApiPurchaseRfqLine[];
  invited_supplier_ids: string[];
  quotes: ApiPurchaseRfqQuote[];
};

export type ApiPurchaseRfqListResponse = {
  data: ApiPurchaseRfq[];
  meta: { count: number; page: number; per_page: number };
};

export type ApiPurchaseRfqResponse = { data: ApiPurchaseRfq };
export type ApiPurchaseRfqQuoteResponse = { data: ApiPurchaseRfqQuote };

export type ApiPurchaseRfqStatusHistory = {
  id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string | null;
  notes: string | null;
  created_at: string;
};

/** Flat, cross-RFQ row for the Quotations grid — same quote shape, plus the parent RFQ's
 * number/title so the grid doesn't need to join client-side. */
export type ApiRfqQuoteRow = ApiPurchaseRfqQuote & { rfq_number: string; rfq_title: string };

export type PurchaseRfqListParams = {
  status?: string;
  supplier_id?: string;
  page?: number;
  per_page?: number;
};

export type CreatePurchaseRfqLineInput = {
  item_id?: string;
  sku?: string;
  quantity: number;
};

/** Same field set for create (POST) and update (PUT) — matches how the backend service
 * treats them (update_rfq mirrors create_rfq's argument list). */
export type PurchaseRfqInput = {
  title: string;
  deadline: string;
  buyer_name?: string;
  notes?: string;
  invited_supplier_ids: string[];
  lines: CreatePurchaseRfqLineInput[];
};

export type RfqQuoteLineInput = { rfq_line_id: string; unit_price: number };

export type RfqQuoteInput = {
  supplier_id: string;
  quote_number?: string;
  valid_until?: string;
  lead_time_days: number;
  moq: number;
  line_quotes: RfqQuoteLineInput[];
  notes?: string;
  /**
   * Judgment call: the documented contract for POST/PUT .../quotes doesn't list a
   * `status` field, and there's no separate "submit" action route distinct from "record a
   * quote". The existing quotation-form-drawer UI has a Save-draft vs Submit distinction,
   * so this field carries that through — the backend's `submit_quote`/`update_quote`
   * already track a `status` column, so it should be a harmless additive field even if the
   * initial implementation ignores it (in which case every recorded quote lands as
   * "submitted", which is an acceptable default for this workflow).
   */
  status?: QuotationStatus;
};

/* -------------------------------------------------------------- utilities */

export function buildPurchaseRfqQuery(params?: PurchaseRfqListParams): string {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.supplier_id) qs.set("supplier_id", params.supplier_id);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.per_page) qs.set("per_page", String(params.per_page));
  const query = qs.toString();
  return query ? `?${query}` : "";
}

function num(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/** Convert one API quote row into the legacy camelCase `RfqVendorQuote` the existing UI
 * (rfq-form-drawer, quotation-form-drawer, both grids, the comparison table) already
 * operates on — keeps the churn in those files to a data-source swap. */
export function apiRfqQuoteToLegacy(row: ApiPurchaseRfqQuote): RfqVendorQuote & { source: "portal" | "manual" } {
  return {
    id: row.id,
    rfqId: row.purchase_rfq_id,
    supplierId: row.supplier_id,
    quoteNumber: row.quote_number,
    status: row.status,
    validUntil: row.valid_until ?? "",
    leadTimeDays: row.lead_time_days,
    moq: row.moq,
    lineQuotes: row.line_quotes.map((lq) => ({
      rfqLineId: lq.rfq_line_id,
      unitPrice: num(lq.unit_price),
    })),
    totalAmount: num(row.total_amount),
    submittedAt: row.submitted_at ?? undefined,
    source: row.source,
  };
}

export function apiRfqToLegacy(row: ApiPurchaseRfq): PurchaseRfq {
  return {
    id: row.id,
    number: row.rfq_number,
    title: row.title,
    status: row.status,
    deadline: row.deadline,
    createdAt: row.created_at,
    buyer: row.buyer_name ?? "—",
    lines: row.lines.map((line) => ({
      id: line.id,
      sku: line.sku,
      name: line.name,
      quantity: line.quantity,
      productId: line.item_id ?? undefined,
    })),
    invitedSupplierIds: row.invited_supplier_ids,
    quotes: row.quotes.map(apiRfqQuoteToLegacy),
    awardedSupplierId: row.awarded_supplier_id ?? undefined,
    linkedPoId: row.linked_po_id ?? undefined,
    notes: row.notes ?? undefined,
  };
}

export type RfqQuotationRow = RfqVendorQuote & {
  source: "portal" | "manual";
  rfqNumber: string;
  rfqTitle: string;
};

export function apiRfqQuoteRowToLegacy(row: ApiRfqQuoteRow): RfqQuotationRow {
  return {
    ...apiRfqQuoteToLegacy(row),
    rfqNumber: row.rfq_number,
    rfqTitle: row.rfq_title,
  };
}

/* -------------------------------------------------------------------- RFQ */

export async function fetchPurchaseRfqs(
  params?: PurchaseRfqListParams,
): Promise<ApiPurchaseRfqListResponse> {
  return apiFetch(`/api/v1/purchase/rfqs${buildPurchaseRfqQuery(params)}`);
}

export async function createPurchaseRfq(input: PurchaseRfqInput): Promise<ApiPurchaseRfq> {
  const res = await apiFetch<ApiPurchaseRfqResponse>("/api/v1/purchase/rfqs", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function fetchPurchaseRfq(id: string): Promise<ApiPurchaseRfq> {
  const res = await apiFetch<ApiPurchaseRfqResponse>(`/api/v1/purchase/rfqs/${id}`);
  return res.data;
}

export async function updatePurchaseRfq(
  id: string,
  input: PurchaseRfqInput,
): Promise<ApiPurchaseRfq> {
  const res = await apiFetch<ApiPurchaseRfqResponse>(`/api/v1/purchase/rfqs/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function updatePurchaseRfqStatus(
  id: string,
  status: RfqStatus,
  notes?: string,
): Promise<ApiPurchaseRfq> {
  const res = await apiFetch<ApiPurchaseRfqResponse>(`/api/v1/purchase/rfqs/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status, ...(notes !== undefined ? { notes } : {}) }),
  });
  return res.data;
}

export async function deletePurchaseRfq(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/purchase/rfqs/${id}`, { method: "DELETE" });
}

export async function bulkDeletePurchaseRfqs(
  ids: string[],
): Promise<{ deleted: number; skipped: string[] }> {
  const res = await apiFetch<{ data: { deleted: number; skipped: string[] } }>(
    "/api/v1/purchase/rfqs/bulk-delete",
    { method: "POST", body: JSON.stringify({ ids }) },
  );
  return res.data;
}

export async function fetchPurchaseRfqHistory(id: string): Promise<ApiPurchaseRfqStatusHistory[]> {
  const res = await apiFetch<{ data: ApiPurchaseRfqStatusHistory[] }>(
    `/api/v1/purchase/rfqs/${id}/history`,
  );
  return res.data;
}

export async function sendPurchaseRfq(id: string): Promise<ApiPurchaseRfq> {
  const res = await apiFetch<ApiPurchaseRfqResponse>(`/api/v1/purchase/rfqs/${id}/send`, {
    method: "POST",
  });
  return res.data;
}

export async function cancelPurchaseRfq(id: string): Promise<ApiPurchaseRfq> {
  const res = await apiFetch<ApiPurchaseRfqResponse>(`/api/v1/purchase/rfqs/${id}/cancel`, {
    method: "POST",
  });
  return res.data;
}

export async function linkRfqPo(rfqId: string, poId: string): Promise<ApiPurchaseRfq> {
  const res = await apiFetch<ApiPurchaseRfqResponse>(`/api/v1/purchase/rfqs/${rfqId}/link-po`, {
    method: "POST",
    body: JSON.stringify({ po_id: poId }),
  });
  return res.data;
}

/* ----------------------------------------------------------------- Quotes */

export async function submitRfqQuote(
  rfqId: string,
  input: RfqQuoteInput,
): Promise<ApiPurchaseRfqQuote> {
  const res = await apiFetch<ApiPurchaseRfqQuoteResponse>(`/api/v1/purchase/rfqs/${rfqId}/quotes`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function updateRfqQuote(
  rfqId: string,
  quoteId: string,
  input: RfqQuoteInput,
): Promise<ApiPurchaseRfqQuote> {
  const res = await apiFetch<ApiPurchaseRfqQuoteResponse>(
    `/api/v1/purchase/rfqs/${rfqId}/quotes/${quoteId}`,
    { method: "PUT", body: JSON.stringify(input) },
  );
  return res.data;
}

export async function awardRfqQuote(rfqId: string, quoteId: string): Promise<ApiPurchaseRfq> {
  const res = await apiFetch<ApiPurchaseRfqResponse>(
    `/api/v1/purchase/rfqs/${rfqId}/quotes/${quoteId}/award`,
    { method: "POST" },
  );
  return res.data;
}

export async function fetchAllRfqQuotes(): Promise<RfqQuotationRow[]> {
  const res = await apiFetch<{ data: ApiRfqQuoteRow[] }>("/api/v1/purchase/rfq-quotes");
  return res.data.map(apiRfqQuoteRowToLegacy);
}

export async function updateRfqQuoteStatus(
  quoteId: string,
  status: QuotationStatus,
): Promise<ApiPurchaseRfqQuote> {
  const res = await apiFetch<ApiPurchaseRfqQuoteResponse>(
    `/api/v1/purchase/rfq-quotes/${quoteId}/status`,
    { method: "PATCH", body: JSON.stringify({ status }) },
  );
  return res.data;
}

export async function bulkDeleteRfqQuotes(
  ids: string[],
): Promise<{ deleted: number; skipped: string[] }> {
  const res = await apiFetch<{ data: { deleted: number; skipped: string[] } }>(
    "/api/v1/purchase/rfq-quotes/bulk-delete",
    { method: "POST", body: JSON.stringify({ ids }) },
  );
  return res.data;
}
