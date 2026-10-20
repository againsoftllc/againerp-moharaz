import { apiFetch } from "@/lib/api/client";

/** Supplier receipt (docs/RMA.md Stage D): draft -> pending_approval -> approved (the unit is stocked back in, once). */
export type RmaReceiptStatus = "draft" | "pending_approval" | "correction_requested" | "approved" | "rejected" | "cancelled";

export const RECEIPT_STATUS_LABEL: Record<RmaReceiptStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  correction_requested: "Needs correction",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export const RECEIPT_STATUS_TONE: Record<RmaReceiptStatus, string> = {
  draft: "border-muted-foreground/30 bg-muted text-muted-foreground",
  pending_approval: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  correction_requested: "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400",
  approved: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  rejected: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  cancelled: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

export type RmaReceiptOutcome = "replacement" | "repaired" | "returned_unrepaired" | "other";

export const RECEIPT_OUTCOME_LABEL: Record<RmaReceiptOutcome, string> = {
  replacement: "Replacement",
  repaired: "Original unit repaired",
  returned_unrepaired: "Returned unrepaired",
  other: "Other",
};

export type RmaReceipt = {
  id: string;
  rma_id: string;
  claim_id: string;
  receipt_number: string;
  status: RmaReceiptStatus;
  supplier_id: string;
  supplier_name: string;
  sent_serial: string | null;
  received_serial: string | null;
  outcome: RmaReceiptOutcome;
  outcome_note: string | null;
  supplier_delivery_ref: string | null;
  received_date: string | null;
  received_by: string | null;
  condition_notes: string | null;
  accessories_received: string | null;
  warehouse_id: string | null;
  decision: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  posted_at: string | null;
  print_count: number;
  last_printed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RmaReceiptEditable = Partial<
  Pick<
    RmaReceipt,
    | "outcome"
    | "outcome_note"
    | "supplier_delivery_ref"
    | "received_date"
    | "received_by"
    | "condition_notes"
    | "accessories_received"
    | "warehouse_id"
    | "received_serial"
  >
>;

const base = (id: string) => `/api/v1/rma/receipts/${id}`;

export async function fetchRmaReceipts(claimId: string) {
  const res = await apiFetch<{ data: RmaReceipt[] }>(`/api/v1/rma/claims/${claimId}/receipts`);
  return res.data;
}

/** Open a receipt for a dispatched claim; the received serial starts as the serial that was sent. */
export async function createRmaReceipt(claimId: string) {
  const res = await apiFetch<{ data: RmaReceipt }>(`/api/v1/rma/claims/${claimId}/receipts`, { method: "POST" });
  return res.data;
}

export async function fetchRmaReceiptDoc(id: string) {
  const res = await apiFetch<{ data: RmaReceipt }>(base(id));
  return res.data;
}

export async function updateRmaReceipt(id: string, input: RmaReceiptEditable) {
  const res = await apiFetch<{ data: RmaReceipt }>(base(id), { method: "PATCH", body: JSON.stringify(input) });
  return res.data;
}

export async function submitRmaReceipt(id: string) {
  const res = await apiFetch<{ data: RmaReceipt }>(`${base(id)}/submit`, { method: "POST" });
  return res.data;
}

export async function decideRmaReceipt(id: string, decision: "approved" | "rejected" | "correction_requested", reason?: string) {
  const res = await apiFetch<{ data: RmaReceipt }>(`${base(id)}/decision`, {
    method: "POST",
    body: JSON.stringify({ decision, reason: reason || undefined }),
  });
  return res.data;
}

export async function cancelRmaReceipt(id: string, reason?: string) {
  const res = await apiFetch<{ data: RmaReceipt }>(`${base(id)}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason: reason || undefined }),
  });
  return res.data;
}

/** The Replacement Receive Copy (no customer details, no internal notes, no costs). A reprint needs the reprint permission. */
export type RmaReceiptCopy = {
  receipt_no: string;
  status: string;
  status_label: string;
  reprint: boolean;
  print_count: number;
  printed_at: string;
  printed_by: string;
  rma_number: string;
  claim_number: string;
  supplier_name: string;
  supplier_reference: string | null;
  supplier_delivery_ref: string | null;
  product_name: string;
  sku: string;
  serial_sent: string | null;
  serial_received: string | null;
  serial_changed: boolean;
  outcome: string;
  outcome_label: string;
  outcome_note: string | null;
  received_date: string | null;
  received_by: string | null;
  condition_notes: string | null;
  accessories_received: string | null;
  received_into: string | null;
  approved_by: string | null;
};

export async function requestRmaReceiptCopy(id: string) {
  const res = await apiFetch<{ data: RmaReceiptCopy }>(`${base(id)}/print`, { method: "POST" });
  return res.data;
}
