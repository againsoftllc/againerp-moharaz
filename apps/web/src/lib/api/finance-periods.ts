"use client";

import { apiFetch } from "@/lib/api/client";

export type ApiFinancePeriod = {
  id: string;
  fiscal_year: number;
  period_no: number;
  name: string;
  start_date: string;
  end_date: string;
  status: "open" | "closed";
  closed_at: string | null;
  closed_by: string | null;
};

export type PeriodListMeta = { fiscal_year: number; count: number; fiscal_years: number[] };

export async function fetchFinancePeriods(
  fiscalYear?: number,
): Promise<{ rows: ApiFinancePeriod[]; meta: PeriodListMeta }> {
  const query = fiscalYear ? `?fiscal_year=${fiscalYear}` : "";
  const res = await apiFetch<{ data: ApiFinancePeriod[]; meta: PeriodListMeta }>(
    `/api/v1/finance/periods${query}`,
    { cache: "no-store" },
  );
  return { rows: res.data, meta: res.meta };
}

export async function generateFinancePeriods(fiscalYear: number): Promise<ApiFinancePeriod[]> {
  const res = await apiFetch<{ data: ApiFinancePeriod[] }>("/api/v1/finance/periods/generate", {
    method: "POST",
    body: JSON.stringify({ fiscal_year: fiscalYear }),
  });
  return res.data;
}

export async function setFinancePeriodStatus(
  periodId: string,
  status: "open" | "closed",
): Promise<ApiFinancePeriod> {
  const res = await apiFetch<{ data: ApiFinancePeriod }>(`/api/v1/finance/periods/${periodId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  return res.data;
}
