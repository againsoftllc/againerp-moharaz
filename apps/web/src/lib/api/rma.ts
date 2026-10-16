import { apiFetch } from "@/lib/api/client";

export type RmaStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "awaiting_return"
  | "received"
  | "diagnosing"
  | "awaiting_approval"
  | "in_repair"
  | "sent_to_supplier"
  | "at_supplier"
  | "returned_from_supplier"
  | "ready_for_delivery"
  | "delivered"
  | "closed"
  | "rejected"
  | "cancelled"
  | "on_hold";

export type WarrantyStatus = "in_warranty" | "out_of_warranty" | "unknown";

export type RmaResolutionType =
  | "repair"
  | "warranty_repair"
  | "paid_repair"
  | "replace"
  | "refund"
  | "partial_refund"
  | "store_credit"
  | "supplier_return"
  | "resellable"
  | "scrap"
  | "reject";

export const RMA_STATUS_LABEL: Record<RmaStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  approved: "Approved",
  awaiting_return: "Awaiting return",
  received: "Received",
  diagnosing: "Inspection",
  awaiting_approval: "Resolution pending",
  in_repair: "Processing",
  sent_to_supplier: "Sent to supplier",
  at_supplier: "At supplier",
  returned_from_supplier: "Back from supplier",
  ready_for_delivery: "Ready for delivery",
  delivered: "Delivered",
  closed: "Completed",
  rejected: "Rejected",
  cancelled: "Cancelled",
  on_hold: "On hold",
};

/** Mirrors RMA_STATUS_TRANSITIONS on the server so the UI only offers legal moves. */
export const RMA_NEXT_STATUSES: Record<RmaStatus, RmaStatus[]> = {
  draft: ["pending_approval", "received", "rejected", "cancelled"],
  pending_approval: ["approved", "rejected", "cancelled"],
  approved: ["awaiting_return", "received", "cancelled"],
  awaiting_return: ["received", "cancelled"],
  received: ["diagnosing", "in_repair", "rejected", "on_hold", "cancelled"],
  diagnosing: [
    "awaiting_approval",
    "in_repair",
    "sent_to_supplier",
    "ready_for_delivery",
    "rejected",
    "on_hold",
    "cancelled",
  ],
  awaiting_approval: ["in_repair", "sent_to_supplier", "rejected", "on_hold", "cancelled"],
  in_repair: ["sent_to_supplier", "ready_for_delivery", "on_hold", "cancelled"],
  sent_to_supplier: ["at_supplier", "cancelled"],
  at_supplier: ["returned_from_supplier", "cancelled"],
  returned_from_supplier: ["in_repair", "ready_for_delivery", "cancelled"],
  ready_for_delivery: ["delivered", "cancelled"],
  delivered: ["closed"],
  on_hold: ["received", "diagnosing", "awaiting_approval", "in_repair", "cancelled"],
  closed: [],
  rejected: [],
  cancelled: [],
};

export const RMA_STATUS_TONE: Record<string, string> = {
  draft: "border-muted-foreground/30 bg-muted text-muted-foreground",
  pending_approval: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  approved: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  awaiting_return: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  received: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  diagnosing: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  awaiting_approval: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  in_repair: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  sent_to_supplier: "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400",
  at_supplier: "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400",
  returned_from_supplier: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  ready_for_delivery: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  delivered: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  closed: "border-muted-foreground/30 bg-muted text-muted-foreground",
  rejected: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  cancelled: "border-muted-foreground/30 bg-muted text-muted-foreground",
  on_hold: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

export const RESOLUTION_LABEL: Record<string, string> = {
  repair: "Repair",
  warranty_repair: "Warranty repair",
  paid_repair: "Paid repair",
  replace: "Replacement",
  refund: "Refund",
  partial_refund: "Partial refund",
  store_credit: "Store credit",
  supplier_return: "Supplier return",
  resellable: "Resellable return",
  scrap: "Scrap",
  reject: "Reject",
};

export const WARRANTY_TONE: Record<WarrantyStatus, string> = {
  in_warranty: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  out_of_warranty: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  unknown: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

export const WARRANTY_LABEL: Record<WarrantyStatus, string> = {
  in_warranty: "In warranty",
  out_of_warranty: "Out of warranty",
  unknown: "Unverified",
};

export type RmaCharge = {
  id: string;
  kind: "part" | "labour" | "misc";
  item_id: string | null;
  sku: string | null;
  description: string;
  quantity: string;
  unit_price: string;
  tax_rate: string;
  line_total: string;
  notes: string | null;
  created_at: string;
};

export type RmaSupplierJob = {
  id: string;
  supplier_id: string;
  supplier_name: string;
  status: string;
  dispatched_at: string | null;
  supplier_reference: string | null;
  expected_return_date: string | null;
  returned_at: string | null;
  outcome: string | null;
  cost: string;
  notes: string | null;
  updated_at: string;
};

export type RmaTicket = {
  id: string;
  rma_number: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  order_id: string | null;
  order_number: string | null;
  purchased_at: string | null;
  product_id: string | null;
  item_id: string | null;
  sku: string;
  product_name: string;
  serial_number: string | null;
  quantity: number;
  received_at: string;
  received_by: string | null;
  accessories: string | null;
  condition_notes: string | null;
  fault_reported: string;
  fault_diagnosed: string | null;
  warranty_status: WarrantyStatus;
  warranty_source: string;
  warranty_expires_on: string | null;
  warranty_note: string | null;
  resolution_type: string | null;
  status: RmaStatus;
  priority: string;
  assigned_to: string | null;
  parts_total: string;
  labour_total: string;
  tax_total: string;
  total: string;
  is_billable: boolean;
  bill_status: string;
  receivable_id: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  rma_type?: string;
  reason_id?: string | null;
  warehouse_id?: string | null;
  expected_return_date?: string | null;
  courier?: string | null;
  tracking_number?: string | null;
  internal_notes?: string | null;
  physical_condition?: string | null;
  functional_result?: string | null;
  qc_result?: string | null;
  inspected_by?: string | null;
  inspected_at?: string | null;
  inspection_notes?: string | null;
  resolution_status?: string;
  service_job_id?: string | null;
  refund_id?: string | null;
  refund_amount?: string;
  replacement_sku?: string | null;
  charges: RmaCharge[];
  supplier_job: RmaSupplierJob | null;
};

export type RmaHistoryEntry = {
  id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string | null;
  note: string | null;
  created_at: string;
};

export type WarrantyLookup = {
  order_number: string | null;
  order_found: boolean;
  purchased_at: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  sku: string | null;
  product_name: string | null;
  warranty_text: string | null;
  warranty_status: WarrantyStatus;
  warranty_expires_on: string | null;
  warranty_note: string;
};

export type RmaDashboard = {
  total: number;
  open_count: number;
  at_supplier_count: number;
  in_warranty_count: number;
  unbilled_total: string;
  pending_approval_count?: number;
  awaiting_return_count?: number;
  status_breakdown: Record<string, number>;
};

type ListMeta = { count: number; total: number; limit: number; offset: number };

export type RmaFilters = {
  status?: string;
  warrantyStatus?: string;
  supplierId?: string;
  rmaType?: string;
  search?: string;
};

export async function fetchRmaTickets(filters: RmaFilters = {}) {
  const qs = new URLSearchParams({ limit: "500" });
  if (filters.status) qs.set("status", filters.status);
  if (filters.warrantyStatus) qs.set("warranty_status", filters.warrantyStatus);
  if (filters.supplierId) qs.set("supplier_id", filters.supplierId);
  if (filters.rmaType) qs.set("rma_type", filters.rmaType);
  if (filters.search) qs.set("search", filters.search);
  return apiFetch<{ data: RmaTicket[]; meta: ListMeta }>(`/api/v1/rma/tickets?${qs}`);
}

export async function fetchRmaTicket(id: string) {
  const res = await apiFetch<{ data: RmaTicket }>(`/api/v1/rma/tickets/${id}`);
  return res.data;
}

export async function fetchRmaHistory(id: string) {
  const res = await apiFetch<{ data: RmaHistoryEntry[] }>(`/api/v1/rma/tickets/${id}/history`);
  return res.data;
}

export async function fetchRmaDashboard() {
  const res = await apiFetch<{ data: RmaDashboard }>("/api/v1/rma/dashboard");
  return res.data;
}

export async function lookupWarranty(orderNumber: string, sku?: string) {
  const qs = new URLSearchParams({ order_number: orderNumber });
  if (sku) qs.set("sku", sku);
  const res = await apiFetch<{ data: WarrantyLookup }>(`/api/v1/rma/warranty-lookup?${qs}`);
  return res.data;
}

export type OrderSearchLine = {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  serial_numbers: string[];
  warranty_status: WarrantyStatus;
  warranty_note: string;
};

export type OrderSearchHit = {
  order_id: string;
  order_number: string;
  source: "commerce" | "sales" | string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  purchased_at: string | null;
  matched_by: "order_number" | "phone" | "serial" | string;
  matched_serial: string | null;
  lines: OrderSearchLine[];
};

export async function searchRmaOrders(query: string) {
  const qs = new URLSearchParams({ q: query });
  const res = await apiFetch<{ data: OrderSearchHit[] }>(`/api/v1/rma/order-search?${qs}`);
  return res.data;
}

export type CreateRmaInput = {
  fault_reported: string;
  order_number?: string;
  customer_id?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  sku?: string;
  product_name?: string;
  serial_number?: string;
  quantity?: number;
  received_by?: string;
  accessories?: string;
  condition_notes?: string;
  priority?: string;
  assigned_to?: string;
  rma_type?: string;
  reason_id?: string;
  warehouse_id?: string;
  start_status?: RmaStatus;
  courier?: string;
  tracking_number?: string;
  internal_notes?: string;
  order_item_id?: string;
  claim_group_id?: string;
};

export async function createRmaTicket(input: CreateRmaInput) {
  const res = await apiFetch<{ data: RmaTicket }>("/api/v1/rma/tickets", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function updateRmaTicket(id: string, input: Record<string, unknown>) {
  const res = await apiFetch<{ data: RmaTicket }>(`/api/v1/rma/tickets/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function changeRmaStatus(id: string, status: RmaStatus, note?: string) {
  const res = await apiFetch<{ data: RmaTicket }>(`/api/v1/rma/tickets/${id}/status`, {
    method: "POST",
    body: JSON.stringify({ status, note: note || undefined }),
  });
  return res.data;
}

export async function overrideWarranty(
  id: string,
  warrantyStatus: WarrantyStatus,
  note?: string,
  expiresOn?: string,
) {
  const res = await apiFetch<{ data: RmaTicket }>(`/api/v1/rma/tickets/${id}/warranty`, {
    method: "POST",
    body: JSON.stringify({
      warranty_status: warrantyStatus,
      note: note || undefined,
      warranty_expires_on: expiresOn || undefined,
    }),
  });
  return res.data;
}

export async function recheckWarranty(id: string) {
  const res = await apiFetch<{ data: RmaTicket }>(`/api/v1/rma/tickets/${id}/warranty/recheck`, {
    method: "POST",
  });
  return res.data;
}

export type AddChargeInput = {
  kind: "part" | "labour" | "misc";
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate?: number;
  sku?: string;
  notes?: string;
};

export async function addRmaCharge(id: string, input: AddChargeInput) {
  const res = await apiFetch<{ data: RmaTicket }>(`/api/v1/rma/tickets/${id}/charges`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function removeRmaCharge(id: string, chargeId: string) {
  const res = await apiFetch<{ data: RmaTicket }>(
    `/api/v1/rma/tickets/${id}/charges/${chargeId}`,
    { method: "DELETE" },
  );
  return res.data;
}

export type SupplierJobInput = {
  supplier_id: string;
  status: string;
  dispatched_at?: string;
  supplier_reference?: string;
  expected_return_date?: string;
  returned_at?: string;
  outcome?: string;
  cost?: number;
  notes?: string;
};

export async function saveSupplierJob(id: string, input: SupplierJobInput) {
  const res = await apiFetch<{ data: RmaTicket }>(`/api/v1/rma/tickets/${id}/supplier-job`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function raiseRmaBill(id: string, dueDate?: string) {
  const res = await apiFetch<{
    data: { receivable_id: string; invoice_number: string; amount: string; due_date: string | null };
  }>(`/api/v1/rma/tickets/${id}/bill`, {
    method: "POST",
    body: JSON.stringify({ due_date: dueDate || undefined }),
  });
  return res.data;
}

export type RmaReason = {
  id: string;
  code: string;
  name: string;
  category: string;
  is_active: boolean;
  sort_order: number;
};

export async function fetchRmaReasons() {
  const res = await apiFetch<{ data: RmaReason[] }>("/api/v1/rma/reasons");
  return res.data;
}

export type RmaReports = {
  total: number;
  open: number;
  refund_amount: string;
  repair_charges: string;
  avg_resolution_days: number;
  by_reason: Record<string, number>;
  by_warranty: Record<string, number>;
  by_resolution: Record<string, number>;
  by_product: { sku: string; name: string; count: number }[];
};

export async function fetchRmaReports() {
  const res = await apiFetch<{ data: RmaReports }>("/api/v1/rma/reports");
  return res.data;
}

async function ticketAction(id: string, path: string, body?: unknown) {
  const res = await apiFetch<{ data: RmaTicket }>(`/api/v1/rma/tickets/${id}/${path}`, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.data;
}

export function inspectRmaTicket(
  id: string,
  input: {
    physical_condition: string;
    functional_result: string;
    qc_result: string;
    notes?: string;
    accessories?: string;
  },
) {
  return ticketAction(id, "inspect", input);
}

export function resolveRmaTicket(id: string, resolutionType: RmaResolutionType, note?: string) {
  return ticketAction(id, "resolve", { resolution_type: resolutionType, note });
}

export function createRmaServiceJob(id: string, labourTotal = 0, partsTotal = 0) {
  return ticketAction(id, "create-service", {
    labour_total: labourTotal,
    parts_total: partsTotal,
  });
}

export function refundRmaTicket(id: string, amount: number, method = "original") {
  return ticketAction(id, "refund", { amount, method });
}

export function replaceRmaTicket(
  id: string,
  input: { item_id: string; warehouse_id: string; quantity?: number },
) {
  return ticketAction(id, "replacement", input);
}

export function restockRmaTicket(id: string, warehouseId: string) {
  return ticketAction(id, "release-stock", { warehouse_id: warehouseId });
}

export function scrapRmaTicket(id: string) {
  return ticketAction(id, "scrap");
}
