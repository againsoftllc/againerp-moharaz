import { apiFetch } from "@/lib/api/client";

export type HappyHourStatus = "draft" | "scheduled" | "running" | "ended" | "disabled";

export type ApiHappyHourDeal = {
  id?: string;
  product_slug: string;
  offer_price: number;
  note?: string | null;
  sort_order: number;
};

export type ApiHappyHourSection = {
  id?: string;
  key: string;
  label: string;
  sort_order: number;
  deals: ApiHappyHourDeal[];
};

export type ApiMarketingHappyHour = {
  id: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  description: string;
  outlet_label: string;
  starts_at: string;
  ends_at: string;
  daily_start_hour: number;
  daily_end_hour: number;
  status: HappyHourStatus;
  terms: string[];
  sort_order: number;
  sections: ApiHappyHourSection[];
  created_at: string;
  updated_at: string;
};

export type HappyHourWriteInput = {
  slug: string;
  title: string;
  subtitle?: string | null;
  description?: string;
  outlet_label?: string;
  starts_at: string;
  ends_at: string;
  daily_start_hour?: number;
  daily_end_hour?: number;
  status: HappyHourStatus;
  terms?: string[];
  sort_order?: number;
  sections: {
    key?: string;
    label: string;
    sort_order?: number;
    deals: {
      product_slug: string;
      offer_price: number;
      note?: string | null;
      sort_order?: number;
    }[];
  }[];
};

type ListResponse = { data: ApiMarketingHappyHour[]; meta: { count: number } };
type ItemResponse = { data: ApiMarketingHappyHour };

export async function fetchMarketingHappyHours(params?: {
  search?: string;
  status?: string;
}): Promise<ApiMarketingHappyHour[]> {
  const q = new URLSearchParams();
  if (params?.search) q.set("search", params.search);
  if (params?.status) q.set("status", params.status);
  const qs = q.toString();
  const res = await apiFetch<ListResponse>(`/api/v1/marketing/happy-hours${qs ? `?${qs}` : ""}`);
  return res.data ?? [];
}

export async function createMarketingHappyHour(
  input: HappyHourWriteInput,
): Promise<ApiMarketingHappyHour> {
  const res = await apiFetch<ItemResponse>("/api/v1/marketing/happy-hours", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function updateMarketingHappyHour(
  id: string,
  input: Partial<HappyHourWriteInput>,
): Promise<ApiMarketingHappyHour> {
  const res = await apiFetch<ItemResponse>(`/api/v1/marketing/happy-hours/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function deleteMarketingHappyHour(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/marketing/happy-hours/${id}`, { method: "DELETE" });
}
