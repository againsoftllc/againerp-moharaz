import { apiFetch } from "@/lib/api/client";

export type SerialStatus =
  | "in_stock"
  | "in_transit"
  | "sold"
  | "in_service"
  | "replaced"
  | "scrapped"
  | "lost"
  | "damaged"
  | "returned";

export const SERIAL_STATUS_LABEL: Record<SerialStatus, string> = {
  in_stock: "In stock",
  in_transit: "In transit",
  sold: "Sold",
  in_service: "In service",
  replaced: "Replaced",
  scrapped: "Scrapped",
  lost: "Lost",
  damaged: "Damaged",
  returned: "Returned to supplier",
};

export const SERIAL_STATUS_TONE: Record<SerialStatus, string> = {
  in_stock: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  in_transit: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  sold: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  in_service: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  replaced: "border-slate-500/30 bg-slate-500/10 text-slate-500 dark:text-slate-400",
  scrapped: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  lost: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  damaged: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  returned: "border-slate-500/30 bg-slate-500/10 text-slate-500 dark:text-slate-400",
};

/** Which table `order_id` points at — only "sales" rows can open the sales order drawer. */
export type SerialOrderKind = "sales" | "commerce";

export type InventorySerial = {
  id: string;
  company_id: string;
  serial_number: string;
  item_id: string | null;
  product_id: string | null;
  sku: string;
  product_name: string;
  thumbnail?: string | null;
  status: SerialStatus;
  warehouse_id: string | null;
  warehouse_name?: string | null;
  source_type: string;
  source_id: string | null;
  supplier_id: string | null;
  received_at: string | null;
  sold_at: string | null;
  order_id: string | null;
  order_number: string | null;
  customer_id: string | null;
  customer_name: string;
  warranty_expires_on: string | null;
  rma_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Trace fields — optional because an API built before them simply omits them.
  supplier_name?: string | null;
  /** Human text, e.g. "Purchase · GRN-00012", "Opening stock · ADJ-00003", "Manual entry". */
  source_label?: string | null;
  source_number?: string | null;
  order_kind?: SerialOrderKind | null;
  /** When the unit came back from a customer (sales return). */
  returned_at?: string | null;
  last_note?: string | null;
  /** Staff who received/purchased the unit and who sold it (trace). */
  received_by_name?: string | null;
  sold_by_name?: string | null;
  /** What this exact unit was bought for / sold for (the purchase/sales line price). */
  purchase_unit_cost?: string | number | null;
  sold_unit_price?: string | number | null;
};

const SOURCE_TYPE_FALLBACK: Record<string, string> = {
  receipt: "Purchase receipt",
  manual: "Manual entry",
  rma_replacement: "RMA replacement",
  adjustment: "Adjustment",
  stock_count: "Stock count",
  opening: "Opening stock",
};

/** Where the unit came from, as text — prefers the API's label, falls back to the raw source_type. */
export function serialSourceLabel(row: Pick<InventorySerial, "source_type" | "source_label">): string {
  const label = row.source_label?.trim();
  if (label) return label;
  const type = (row.source_type || "").trim();
  if (!type) return "—";
  return SOURCE_TYPE_FALLBACK[type] ?? type.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** Current physical location; a sold unit is with the customer, not in any warehouse. */
export function serialLocationLabel(
  row: Pick<InventorySerial, "status" | "warehouse_name">,
  fallbackWarehouseName?: string,
): string {
  if (row.status === "sold") return "— (sold)";
  return row.warehouse_name?.trim() || fallbackWarehouseName?.trim() || "—";
}

export type SerialListMeta = {
  count: number;
  total: number;
  /** Rows matching the current filters/search across all pages (newer API builds). */
  total_matching?: number;
  in_stock: number;
  in_transit?: number;
  lost?: number;
  damaged?: number;
  sold: number;
  in_service: number;
  replaced: number;
  scrapped: number;
};

export type SerialResult = {
  serial_number: string;
  outcome: "created" | "duplicate" | "rejected";
  detail: string;
  serial_id: string | null;
};

export type SerialBatchResponse = {
  data: SerialResult[];
  created: number;
  duplicates: number;
  rejected: number;
};

export type SerialLookupResponse = {
  data: InventorySerial | null;
  warranty_status: string | null;
  warranty_note: string | null;
  purchased_on: string | null;
  open_rma_id: string | null;
  open_rma_number: string | null;
};

export type SerialListParams = {
  status?: string;
  item_id?: string;
  warehouse_id?: string;
  /** Matches serial, SKU, product, customer and order number. */
  q?: string;
  limit?: number;
  offset?: number;
};

function buildQuery(params?: SerialListParams): string {
  const qs = new URLSearchParams();
  if (params?.status && params.status !== "all") qs.set("status", params.status);
  if (params?.item_id) qs.set("item_id", params.item_id);
  if (params?.warehouse_id && params.warehouse_id !== "all") qs.set("warehouse_id", params.warehouse_id);
  if (params?.q?.trim()) qs.set("q", params.q.trim());
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export function sameSerialListParams(a?: SerialListParams, b?: SerialListParams): boolean {
  return buildQuery(a) === buildQuery(b);
}

export async function fetchSerials(params?: SerialListParams) {
  return apiFetch<{ data: InventorySerial[]; meta: SerialListMeta }>(
    `/api/v1/inventory/serials${buildQuery(params)}`,
  );
}

export async function fetchSerial(id: string) {
  const res = await apiFetch<{ data: InventorySerial }>(`/api/v1/inventory/serials/${id}`);
  return res.data;
}

export async function registerSerials(input: {
  serial_numbers: string[];
  item_id?: string;
  sku?: string;
  warehouse_id?: string;
  source_type?: string;
  notes?: string;
}) {
  return apiFetch<SerialBatchResponse>("/api/v1/inventory/serials", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function assignSerialsToOrder(input: { serial_numbers: string[]; order_number: string }) {
  return apiFetch<SerialBatchResponse>("/api/v1/inventory/serials/assign-order", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Unknown serial resolves to `data: null` rather than throwing — not every lookup finds one. */
export async function lookupSerial(serialNumber: string) {
  return apiFetch<SerialLookupResponse>(
    `/api/v1/inventory/serials/lookup?serial_number=${encodeURIComponent(serialNumber)}`,
  );
}

export async function updateSerial(
  id: string,
  input: { status?: SerialStatus; warehouse_id?: string; notes?: string },
) {
  const res = await apiFetch<{ data: InventorySerial }>(`/api/v1/inventory/serials/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function deleteSerial(id: string) {
  await apiFetch<void>(`/api/v1/inventory/serials/${id}`, { method: "DELETE" });
}
