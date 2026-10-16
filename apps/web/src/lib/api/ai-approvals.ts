"use client";

import { apiFetch } from "@/lib/api/client";

export type AiApprovalRisk =
  | "read"
  | "write"
  | "approve"
  | "delete"
  | "financial"
  | "sensitive"
  | "external";

export type AiApprovalStatus = "pending" | "approved" | "rejected";

export type ApiAiApproval = {
  id: string;
  company_id: string;
  agent: string;
  tool: string;
  summary: string;
  reason: string;
  risk: AiApprovalRisk;
  status: AiApprovalStatus;
  entity: string;
  requested_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AiApprovalListMeta = {
  count: number;
  pending_count: number;
};

export async function fetchAiApprovals(
  statusFilter?: AiApprovalStatus,
): Promise<{ rows: ApiAiApproval[]; meta: AiApprovalListMeta }> {
  const q = statusFilter ? `?status_filter=${statusFilter}` : "";
  const res = await apiFetch<{ data: ApiAiApproval[]; meta: AiApprovalListMeta }>(
    `/api/v1/ai/approvals${q}`,
    { cache: "no-store" },
  );
  return { rows: res.data, meta: res.meta };
}

export async function resolveAiApproval(
  id: string,
  status: "approved" | "rejected",
): Promise<ApiAiApproval> {
  const res = await apiFetch<{ data: ApiAiApproval }>(`/api/v1/ai/approvals/${id}/resolve`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
  return res.data;
}
