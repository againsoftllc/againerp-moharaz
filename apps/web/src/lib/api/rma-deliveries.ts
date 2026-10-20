import { apiFetch } from "@/lib/api/client";

/**
 * Customer delivery (docs/RMA.md Stage E): the hand-over of the unit. The payment fields and presets are kept only so deliveries
 * made before settlements existed still read correctly; new deliveries never carry a payment.
 */
export type RmaDeliveryStatus = "draft" | "pending_approval" | "correction_requested" | "approved" | "rejected" | "cancelled";

export const DELIVERY_STATUS_LABEL: Record<RmaDeliveryStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  correction_requested: "Needs correction",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export const DELIVERY_STATUS_TONE: Record<RmaDeliveryStatus, string> = {
  draft: "border-muted-foreground/30 bg-muted text-muted-foreground",
  pending_approval: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  correction_requested: "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400",
  approved: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  rejected: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  cancelled: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

export type PaymentState = "none" | "received" | "due";

export type DeliveryPreset =
  | "without_payment"
  | "payment_received"
  | "payment_payable"
  | "product_payment_received"
  | "product_payment_payable"
  | "custom";

/** The five familiar cases: each is a physical action + a payment state (the labels the staff already use). */
export const DELIVERY_PRESETS: { id: Exclude<DeliveryPreset, "custom">; label: string; deliver: boolean; payment: PaymentState; hint: string }[] = [
  { id: "without_payment", label: "Without Payment", deliver: true, payment: "none", hint: "Hand the product over, nothing to pay (warranty)." },
  { id: "payment_received", label: "Payment Received", deliver: false, payment: "received", hint: "Take the money now. The product stays here." },
  { id: "payment_payable", label: "Payment Payable", deliver: false, payment: "due", hint: "Record the amount owed. The product stays here." },
  { id: "product_payment_received", label: "Product with Payment Received", deliver: true, payment: "received", hint: "Hand the product over and take the money." },
  { id: "product_payment_payable", label: "Product with Payment Payable", deliver: true, payment: "due", hint: "Hand the product over, the amount stays owed." },
];

export const DELIVERY_PRESET_LABEL: Record<DeliveryPreset, string> = {
  ...Object.fromEntries(DELIVERY_PRESETS.map((p) => [p.id, p.label])),
  custom: "Custom",
} as Record<DeliveryPreset, string>;

export type RmaDelivery = {
  id: string;
  rma_id: string;
  delivery_number: string;
  status: RmaDeliveryStatus;
  preset: DeliveryPreset;
  deliver_product: boolean;
  payment_state: PaymentState;
  amount_total: string;
  amount_received: string;
  amount_due: string;
  payment_account_id: string | null;
  payment_reference: string | null;
  due_date: string | null;
  delivery_date: string | null;
  delivered_to: string | null;
  serial_delivered: string | null;
  notes: string | null;
  decision: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  posted_at: string | null;
  stock_posted: boolean;
  payment_number: string | null;
  receivable_number: string | null;
  print_count: number;
  last_printed_at: string | null;
  created_at: string;
  updated_at: string;
};

/** A delivery is the hand-over only; money is an RMA settlement (see rma-settlements.ts). */
export type RmaDeliveryEditable = {
  delivery_date?: string;
  delivered_to?: string;
  notes?: string;
};

export type RmaDeliverySummary = {
  total: string;
  paid: string;
  outstanding: string;
  receivable_id: string | null;
  receivable_number: string | null;
  can_deliver_product: boolean;
  deliver_blocker: string | null;
  held_serial: string | null;
  charge_estimate: string;
};

const base = (id: string) => `/api/v1/rma/deliveries/${id}`;

export async function fetchRmaDeliverySummary(ticketId: string) {
  const res = await apiFetch<{ data: RmaDeliverySummary }>(`/api/v1/rma/tickets/${ticketId}/delivery-summary`);
  return res.data;
}

export async function fetchRmaDeliveries(ticketId: string) {
  const res = await apiFetch<{ data: RmaDelivery[] }>(`/api/v1/rma/tickets/${ticketId}/deliveries`);
  return res.data;
}

export async function createRmaDelivery(ticketId: string) {
  const res = await apiFetch<{ data: RmaDelivery }>(`/api/v1/rma/tickets/${ticketId}/deliveries`, { method: "POST" });
  return res.data;
}

export async function fetchRmaDelivery(id: string) {
  const res = await apiFetch<{ data: RmaDelivery }>(base(id));
  return res.data;
}

export async function updateRmaDelivery(id: string, input: RmaDeliveryEditable) {
  const res = await apiFetch<{ data: RmaDelivery }>(base(id), { method: "PATCH", body: JSON.stringify(input) });
  return res.data;
}

export async function submitRmaDelivery(id: string) {
  const res = await apiFetch<{ data: RmaDelivery }>(`${base(id)}/submit`, { method: "POST" });
  return res.data;
}

export async function decideRmaDelivery(id: string, decision: "approved" | "rejected" | "correction_requested", reason?: string) {
  const res = await apiFetch<{ data: RmaDelivery }>(`${base(id)}/decision`, {
    method: "POST",
    body: JSON.stringify({ decision, reason: reason || undefined }),
  });
  return res.data;
}

export async function cancelRmaDelivery(id: string, reason?: string) {
  const res = await apiFetch<{ data: RmaDelivery }>(`${base(id)}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason: reason || undefined }),
  });
  return res.data;
}

/** The Customer Delivery Copy (no internal notes, no supplier cost). A reprint needs the reprint permission. */
export type RmaDeliveryCopy = {
  delivery_no: string;
  status: string;
  status_label: string;
  reprint: boolean;
  print_count: number;
  printed_at: string;
  printed_by: string;
  rma_number: string;
  delivery_date: string | null;
  customer_name: string;
  customer_phone: string;
  delivered_to: string | null;
  product_name: string;
  sku: string;
  serial_delivered: string | null;
  serial_original: string | null;
  serial_changed: boolean;
  problem: string;
  diagnosis: string | null;
  deliver_product: boolean;
  payment_state: PaymentState;
  preset: DeliveryPreset;
  amount_total: string;
  amount_received: string;
  amount_due: string;
  payment_method: string | null;
  payment_reference: string | null;
  payment_number: string | null;
  invoice_number: string | null;
  due_date: string | null;
  approved_by: string | null;
};

export async function requestRmaDeliveryCopy(id: string) {
  const res = await apiFetch<{ data: RmaDeliveryCopy }>(`${base(id)}/print`, { method: "POST" });
  return res.data;
}
