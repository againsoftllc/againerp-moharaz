import { apiFetch } from "@/lib/api/client";

/**
 * Customer delivery (docs/RMA.md Stage E): what the customer gets back and what they pay or are paid. The type mirrors what came
 * back from the supplier; the three unit types must match the unit the RMA holds, cash back pays money out. The customer can be
 * charged (service charge, parts, labour, fine): part collected now, the rest left owed.
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

/** What the customer gets. The first three hand a unit over (and must match the unit the RMA holds); cash back pays money out. */
export type RmaDeliveryOutcome = "same_unit" | "same_product" | "different_product" | "cash_back";

export const DELIVERY_OUTCOMES: RmaDeliveryOutcome[] = ["same_unit", "same_product", "different_product", "cash_back"];

export const DELIVERY_OUTCOME_LABEL: Record<RmaDeliveryOutcome, string> = {
  same_unit: "Same product, same serial",
  same_product: "Same product, different serial",
  different_product: "Different product, different serial",
  cash_back: "Cash back",
};

export const DELIVERY_OUTCOME_HINT: Record<RmaDeliveryOutcome, string> = {
  same_unit: "The customer's own unit goes back (repaired, or as it was).",
  same_product: "A replacement of the same product goes back, with a new serial.",
  different_product: "Another product goes back to the customer, with its own serial.",
  cash_back: "No unit goes back: money is paid back to the customer.",
};

export type RmaDelivery = {
  id: string;
  rma_id: string;
  delivery_number: string;
  status: RmaDeliveryStatus;
  outcome: RmaDeliveryOutcome;
  deliver_product: boolean;
  payment_state: PaymentState;
  refund_amount: string | number | null;
  refund_account_id: string | null;
  collect_settlement_id: string | null;
  refund_settlement_id: string | null;
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

export type RmaDeliveryEditable = {
  delivery_date?: string;
  delivered_to?: string;
  notes?: string;
  outcome?: RmaDeliveryOutcome;
  /** cash back: what is paid back and the account it is paid from */
  refund_amount?: number;
  refund_account_id?: string;
  /** charges collected NOW (the rest stays owed) and the account / reference it goes in with */
  amount_received?: number;
  payment_account_id?: string;
  payment_reference?: string;
};

export type RmaDeliverySummary = {
  total: string;
  paid: string;
  outstanding: string;
  receivable_id: string | null;
  receivable_number: string | null;
  can_deliver_product: boolean;
  deliver_blocker: string | null;
  can_cash_back: boolean;
  cash_back_blocker: string | null;
  /** which unit type the RMA's held unit is: the three unit types must match it */
  unit_outcome: RmaDeliveryOutcome;
  held_serial: string | null;
  held_sku: string | null;
  held_product_name: string | null;
  original_serial: string | null;
  original_product_name: string | null;
  refunded: string;
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
  outcome: RmaDeliveryOutcome;
  outcome_label: string;
  product_name: string;
  sku: string;
  original_product_name: string;
  serial_delivered: string | null;
  serial_original: string | null;
  serial_changed: boolean;
  problem: string;
  diagnosis: string | null;
  deliver_product: boolean;
  payment_state: PaymentState;
  charges: { kind: string; description: string; amount: string }[];
  refund_amount: string | null;
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
