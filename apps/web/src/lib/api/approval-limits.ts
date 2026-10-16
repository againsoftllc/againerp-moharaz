"use client";

import { apiFetch } from "@/lib/api/client";

export type ApiApprovalLimit = {
  id: string | null;
  role_slug: string;
  role_name: string;
  document_type: string;
  document_label: string;
  max_amount: string | null;
  is_active: boolean;
};

export type ApprovalLimitMeta = {
  count: number;
  documents: { value: string; label: string }[];
  roles: { value: string; label: string }[];
};

export async function fetchApprovalLimits(): Promise<{
  rows: ApiApprovalLimit[];
  meta: ApprovalLimitMeta;
}> {
  const res = await apiFetch<{ data: ApiApprovalLimit[]; meta: ApprovalLimitMeta }>(
    "/api/v1/workspace/approval-limits",
    { cache: "no-store" },
  );
  return { rows: res.data, meta: res.meta };
}

/** `maxAmount: null` clears the ceiling — that role becomes unlimited again. */
export async function saveApprovalLimit(
  roleSlug: string,
  documentType: string,
  maxAmount: number | null,
): Promise<ApiApprovalLimit> {
  const res = await apiFetch<{ data: ApiApprovalLimit }>("/api/v1/workspace/approval-limits", {
    method: "PUT",
    body: JSON.stringify({
      role_slug: roleSlug,
      document_type: documentType,
      max_amount: maxAmount,
      is_active: true,
    }),
  });
  return res.data;
}
