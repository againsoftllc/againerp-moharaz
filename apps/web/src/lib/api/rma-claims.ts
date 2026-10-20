import { apiFetch } from "@/lib/api/client";

/** Supplier claim (docs/RMA.md Stage C): draft -> pending_approval -> approved -> dispatched. */
export type RmaClaimStatus =
  | "draft"
  | "pending_approval"
  | "correction_requested"
  | "approved"
  | "dispatched"
  | "rejected"
  | "cancelled";

export const CLAIM_STATUS_LABEL: Record<RmaClaimStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  correction_requested: "Needs correction",
  approved: "Approved",
  dispatched: "Dispatched",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export const CLAIM_STATUS_TONE: Record<RmaClaimStatus, string> = {
  draft: "border-muted-foreground/30 bg-muted text-muted-foreground",
  pending_approval: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  correction_requested: "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400",
  approved: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  dispatched: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  rejected: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  cancelled: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

export const CLAIM_OPEN: RmaClaimStatus[] = ["draft", "pending_approval", "correction_requested", "approved", "dispatched"];

export type RmaClaim = {
  id: string;
  rma_id: string;
  claim_number: string;
  status: RmaClaimStatus;
  supplier_id: string;
  supplier_name: string;
  supplier_reference: string | null;
  purchase_receipt_no: string | null;
  purchase_bill_no: string | null;
  vendor_invoice_no: string | null;
  sku: string;
  product_name: string;
  serial_number: string | null;
  quantity: number;
  problem: string;
  diagnosis: string | null;
  accessories_sent: string | null;
  notes: string | null;
  dispatch_date: string | null;
  courier: string | null;
  tracking_number: string | null;
  expected_return_date: string | null;
  decision: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  dispatched_by_name: string | null;
  dispatched_at: string | null;
  print_count: number;
  last_printed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RmaClaimEditable = Partial<
  Pick<
    RmaClaim,
    | "supplier_reference"
    | "problem"
    | "diagnosis"
    | "accessories_sent"
    | "notes"
    | "dispatch_date"
    | "courier"
    | "tracking_number"
    | "expected_return_date"
  >
>;

const base = (id: string) => `/api/v1/rma/claims/${id}`;

export async function fetchRmaClaims(ticketId: string) {
  const res = await apiFetch<{ data: RmaClaim[] }>(`/api/v1/rma/tickets/${ticketId}/claims`);
  return res.data;
}

export async function fetchRmaClaim(id: string) {
  const res = await apiFetch<{ data: RmaClaim }>(base(id));
  return res.data;
}

/** Raise a claim from an approved RMA whose unit is in the RMA store. A supplier is only passed when the purchase trace found none. */
export async function createRmaClaim(ticketId: string, input: { supplier_id?: string; override_reason?: string } = {}) {
  const res = await apiFetch<{ data: RmaClaim }>(`/api/v1/rma/tickets/${ticketId}/claims`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function updateRmaClaim(id: string, input: RmaClaimEditable) {
  const res = await apiFetch<{ data: RmaClaim }>(base(id), { method: "PATCH", body: JSON.stringify(input) });
  return res.data;
}

export async function submitRmaClaim(id: string) {
  const res = await apiFetch<{ data: RmaClaim }>(`${base(id)}/submit`, { method: "POST" });
  return res.data;
}

export async function decideRmaClaim(id: string, decision: "approved" | "rejected" | "correction_requested", reason?: string) {
  const res = await apiFetch<{ data: RmaClaim }>(`${base(id)}/decision`, {
    method: "POST",
    body: JSON.stringify({ decision, reason: reason || undefined }),
  });
  return res.data;
}

export async function dispatchRmaClaim(
  id: string,
  input: { dispatch_date?: string; courier?: string; tracking_number?: string; expected_return_date?: string; note?: string },
) {
  const res = await apiFetch<{ data: RmaClaim }>(`${base(id)}/dispatch`, { method: "POST", body: JSON.stringify(input) });
  return res.data;
}

export async function cancelRmaClaim(id: string, reason?: string) {
  const res = await apiFetch<{ data: RmaClaim }>(`${base(id)}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason: reason || undefined }),
  });
  return res.data;
}

/** The supplier's copy (no customer details, no internal notes, no costs). A reprint needs the reprint permission. */
export type RmaClaimCopy = {
  claim_no: string;
  status: string;
  status_label: string;
  reprint: boolean;
  print_count: number;
  printed_at: string;
  printed_by: string;
  rma_number: string;
  supplier_name: string;
  supplier_reference: string | null;
  product_name: string;
  sku: string;
  serial_number: string | null;
  quantity: number;
  problem: string;
  diagnosis: string | null;
  accessories_sent: string | null;
  purchase_receipt_no: string | null;
  purchase_bill_no: string | null;
  vendor_invoice_no: string | null;
  sold_on: string | null;
  dispatch_date: string | null;
  courier: string | null;
  tracking_number: string | null;
  expected_return_date: string | null;
  approved_by: string | null;
  dispatched_by: string | null;
};

export async function requestRmaClaimCopy(id: string) {
  const res = await apiFetch<{ data: RmaClaimCopy }>(`${base(id)}/print`, { method: "POST" });
  return res.data;
}
