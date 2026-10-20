import { apiFetch } from "@/lib/api/client";

/** RMA settlement: money in / money out against an RMA, separate from handing the product over. */
export type RmaSettlementStatus = "draft" | "pending_approval" | "correction_requested" | "approved" | "rejected" | "cancelled";

export const SETTLEMENT_STATUS_LABEL: Record<RmaSettlementStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  correction_requested: "Needs correction",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export const SETTLEMENT_STATUS_TONE: Record<RmaSettlementStatus, string> = {
  draft: "border-muted-foreground/30 bg-muted text-muted-foreground",
  pending_approval: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  correction_requested: "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400",
  approved: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  rejected: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  cancelled: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

export type SettlementPartyType = "customer" | "dealer" | "supplier" | "other";
export type SettlementDirection = "in" | "out";
export type SettlementPurpose =
  | "parts_service"
  | "damage_compensation"
  | "repair_labour"
  | "refund_settlement"
  | "replacement_price_difference"
  | "other";

export const PARTY_TYPES: { id: SettlementPartyType; label: string }[] = [
  { id: "customer", label: "Customer" },
  { id: "dealer", label: "Dealer" },
  { id: "supplier", label: "Supplier" },
  { id: "other", label: "Other Party" },
];
export const PARTY_TYPE_LABEL = Object.fromEntries(PARTY_TYPES.map((p) => [p.id, p.label])) as Record<SettlementPartyType, string>;
/** The party role each type is searched under (Dealer is the B2B vendor role). "other" can be any party. */
export const PARTY_ROLE_FOR_TYPE: Record<SettlementPartyType, string | undefined> = {
  customer: "customer",
  dealer: "vendor",
  supplier: "supplier",
  other: undefined,
};

export const PURPOSES: { id: SettlementPurpose; label: string }[] = [
  { id: "parts_service", label: "Parts / Service Charge" },
  { id: "damage_compensation", label: "Damage Compensation" },
  { id: "repair_labour", label: "Repair / Labour Charge" },
  { id: "refund_settlement", label: "Refund / Settlement" },
  { id: "replacement_price_difference", label: "Replacement Price Difference" },
  { id: "other", label: "Other" },
];
export const PURPOSE_LABEL = Object.fromEntries(PURPOSES.map((p) => [p.id, p.label])) as Record<SettlementPurpose, string>;

export const DIRECTION_LABEL: Record<SettlementDirection, string> = { in: "Money In (+)", out: "Money Out (-)" };

export type RmaSettlement = {
  id: string;
  rma_id: string;
  settlement_number: string;
  status: RmaSettlementStatus;
  party_type: SettlementPartyType;
  party_id: string | null;
  party_name: string;
  direction: SettlementDirection;
  amount: string;
  purpose: SettlementPurpose;
  purpose_note: string | null;
  payment_account_id: string | null;
  payment_method: string | null;
  transaction_date: string | null;
  reference: string | null;
  created_by_name: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  posted_at: string | null;
  counter_account_code: string | null;
  payment_number: string | null;
  journal_number: string | null;
  receivable_number: string | null;
  /** Set on a reversal: the approved settlement it mirrors. */
  reverses_id: string | null;
  /** Set on an approved settlement once its reversal is approved. */
  reversed_by_id: string | null;
  created_at: string;
  updated_at: string;
};

export type RmaSettlementInput = {
  party_type?: SettlementPartyType;
  party_id?: string | null;
  party_name?: string | null;
  direction?: SettlementDirection;
  amount?: number | string;
  purpose?: SettlementPurpose;
  purpose_note?: string | null;
  payment_account_id?: string | null;
  transaction_date?: string | null;
  reference?: string | null;
};

export type RmaSettlementSummary = {
  total: string;
  paid: string;
  outstanding: string;
  receivable_id: string | null;
  receivable_number: string | null;
  money_in: string;
  money_out: string;
  net: string;
  pending_count: number;
  can_settle: boolean;
  blocker: string | null;
  customer_id: string | null;
  customer_name: string;
};

const base = (id: string) => `/api/v1/rma/settlements/${id}`;

export async function fetchRmaSettlementSummary(ticketId: string) {
  const res = await apiFetch<{ data: RmaSettlementSummary }>(`/api/v1/rma/tickets/${ticketId}/settlement-summary`);
  return res.data;
}

export async function fetchRmaSettlements(ticketId: string) {
  const res = await apiFetch<{ data: RmaSettlement[] }>(`/api/v1/rma/tickets/${ticketId}/settlements`);
  return res.data;
}

export async function createRmaSettlement(ticketId: string, input: RmaSettlementInput) {
  const res = await apiFetch<{ data: RmaSettlement }>(`/api/v1/rma/tickets/${ticketId}/settlements`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function fetchRmaSettlement(id: string) {
  const res = await apiFetch<{ data: RmaSettlement }>(base(id));
  return res.data;
}

export async function updateRmaSettlement(id: string, input: RmaSettlementInput) {
  const res = await apiFetch<{ data: RmaSettlement }>(base(id), { method: "PATCH", body: JSON.stringify(input) });
  return res.data;
}

export async function submitRmaSettlement(id: string) {
  const res = await apiFetch<{ data: RmaSettlement }>(`${base(id)}/submit`, { method: "POST" });
  return res.data;
}

export async function decideRmaSettlement(id: string, decision: "approved" | "rejected" | "correction_requested", reason?: string) {
  const res = await apiFetch<{ data: RmaSettlement }>(`${base(id)}/decision`, {
    method: "POST",
    body: JSON.stringify({ decision, reason: reason || undefined }),
  });
  return res.data;
}

/** Correct an approved settlement: opens a linked draft that mirrors it (it still goes through approval). */
export async function reverseRmaSettlement(id: string, reason: string) {
  const res = await apiFetch<{ data: RmaSettlement }>(`${base(id)}/reverse`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
  return res.data;
}

export async function cancelRmaSettlement(id: string, reason?: string) {
  const res = await apiFetch<{ data: RmaSettlement }>(`${base(id)}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason: reason || undefined }),
  });
  return res.data;
}

export type SettlementPartyOption = { id: string; name: string; roles: string[] };

/** Searchable party selector: the Party master filtered by the role the chosen party type needs. */
export async function searchSettlementParties(type: SettlementPartyType, query: string): Promise<SettlementPartyOption[]> {
  const params = new URLSearchParams({ per_page: "8", status: "active" });
  const role = PARTY_ROLE_FOR_TYPE[type];
  if (role) params.set("role", role);
  if (query.trim()) params.set("search", query.trim());
  const res = await apiFetch<{ data: { id: string; display_name: string; roles: string[] }[] }>(`/api/v1/parties?${params.toString()}`);
  return res.data.map((p) => ({ id: p.id, name: p.display_name, roles: p.roles }));
}
