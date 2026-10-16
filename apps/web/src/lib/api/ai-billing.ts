"use client";

import { apiFetch } from "@/lib/api/client";

export type ApiAiPackage = {
  id: string;
  slug: string;
  name: string;
  price_bdt: string;
  included_tokens: number;
  description: string;
};

export type ApiAiOverageInvoice = {
  id: string;
  period_start: string;
  period_end: string;
  overage_tokens: number;
  amount_bdt: string;
  status: "unpaid" | "paid";
  paid_at: string | null;
  created_at: string;
};

export type ApiAiPlanOverview = {
  package: ApiAiPackage;
  on_demand_enabled: boolean;
  current_period_start: string;
  current_period_end: string;
  tokens_used: number;
  percent_used: number;
  unpaid_invoice: ApiAiOverageInvoice | null;
};

const BASE = "/api/v1/ai/billing";

export async function fetchAiPackages(): Promise<ApiAiPackage[]> {
  const res = await apiFetch<{ data: ApiAiPackage[] }>(`${BASE}/packages`, { cache: "no-store" });
  return res.data;
}

export async function fetchAiPlanOverview(): Promise<ApiAiPlanOverview> {
  const res = await apiFetch<{ data: ApiAiPlanOverview }>(`${BASE}/plan`, { cache: "no-store" });
  return res.data;
}

export async function changeAiPackage(packageId: string): Promise<ApiAiPlanOverview> {
  const res = await apiFetch<{ data: ApiAiPlanOverview }>(`${BASE}/plan/package`, {
    method: "POST",
    body: JSON.stringify({ package_id: packageId }),
  });
  return res.data;
}

export async function setAiOnDemand(enabled: boolean): Promise<ApiAiPlanOverview> {
  const res = await apiFetch<{ data: ApiAiPlanOverview }>(`${BASE}/plan/on-demand`, {
    method: "POST",
    body: JSON.stringify({ enabled }),
  });
  return res.data;
}

export async function payAiInvoice(invoiceId: string): Promise<ApiAiOverageInvoice> {
  return apiFetch<ApiAiOverageInvoice>(`${BASE}/invoices/${invoiceId}/pay`, { method: "POST" });
}
