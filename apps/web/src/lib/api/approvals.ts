import { apiFetch } from "@/lib/api/client";

export type ApprovalStatus = "pending" | "approving" | "approved" | "rejected" | "cancelled";

export type ApprovalGroupKey = "purchase" | "sales" | "rma" | "finance";

export type ApprovalRequest = {
  id: string;
  action_key: string;
  group_key: ApprovalGroupKey;
  group_label: string;
  label: string;
  reference: string | null;
  party: string | null;
  amount: string | number | null;
  summary: string | null;
  entity_id: string | null;
  /** The record whose own drawer opens for this request (null = a review dialog instead). */
  doc_kind: string | null;
  doc_id: string | null;
  status: ApprovalStatus;
  requested_by: string;
  requested_by_name: string;
  requested_at: string;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_note: string | null;
  last_error: string | null;
  can_decide: boolean;
  is_mine: boolean;
};

export type ApprovalListParams = {
  status?: "pending" | "approved" | "rejected" | "cancelled" | "all";
  group?: ApprovalGroupKey | "";
  mine?: boolean;
  q?: string;
  page?: number;
  per_page?: number;
};

export type ApprovalList = {
  data: ApprovalRequest[];
  meta: { count: number; page: number; per_page: number; pending: number };
};

export type ApprovalSummary = {
  pending_for_me: number;
  my_pending: number;
  can_approve_any: boolean;
  groups: { key: ApprovalGroupKey; label: string; pending: number; can_approve: boolean }[];
};

export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, string> = {
  pending: "Pending",
  approving: "Approving…",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export async function fetchApprovals(params: ApprovalListParams = {}): Promise<ApprovalList> {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.group) qs.set("group", params.group);
  if (params.mine) qs.set("mine", "true");
  if (params.q?.trim()) qs.set("q", params.q.trim());
  if (params.page) qs.set("page", String(params.page));
  if (params.per_page) qs.set("per_page", String(params.per_page));
  const query = qs.toString();
  // always fresh: the list is a work queue other people change under you
  return apiFetch<ApprovalList>(`/api/v1/approvals${query ? `?${query}` : ""}`, { cache: "no-store" });
}

export async function fetchApprovalSummary(): Promise<ApprovalSummary> {
  return apiFetch<ApprovalSummary>("/api/v1/approvals/summary", { cache: "no-store" });
}

export async function approveRequest(id: string, note?: string): Promise<void> {
  await apiFetch(`/api/v1/approvals/${id}/approve`, { method: "POST", body: JSON.stringify({ note: note ?? null }) });
}

export async function rejectRequest(id: string, note?: string): Promise<void> {
  await apiFetch(`/api/v1/approvals/${id}/reject`, { method: "POST", body: JSON.stringify({ note: note ?? null }) });
}

export async function cancelRequest(id: string): Promise<void> {
  await apiFetch(`/api/v1/approvals/${id}/cancel`, { method: "POST" });
}

export type ApprovalFact = { label: string; value: string; tone: "good" | "warn" | "bad" | null };

export type ApprovalTable = {
  title: string;
  columns: { key: string; label: string; align: "left" | "right" }[];
  rows: Record<string, string>[];
  footer: Record<string, string> | null;
  /** Indexes of rows to flag (stock short of what the document needs, a count that moved …). */
  warn_rows: number[];
};

/** The document a held call points at, read now (docs/approval.md). */
export type ApprovalDocument = {
  heading: string;
  facts: ApprovalFact[];
  tables: ApprovalTable[];
  notes: string[];
  /** Records to open in their own drawer to cross-check (sales order, quotation, stock adjustment, stock transfer). */
  links: { kind: "sales_order" | "quotation" | "stock_adjustment" | "stock_transfer"; id: string; label: string }[];
};

export type ApprovalTimelineEvent = { at: string | null; by: string | null; text: string; tone: "good" | "bad" | "warn" | null };

export type ApprovalDetail = ApprovalRequest & {
  document: ApprovalDocument;
  timeline: ApprovalTimelineEvent[];
  http_method: string;
  http_path: string;
  request_body: string | null;
};

export async function fetchApprovalDetail(id: string): Promise<ApprovalDetail> {
  return apiFetch<ApprovalDetail>(`/api/v1/approvals/${id}`, { cache: "no-store" });
}
