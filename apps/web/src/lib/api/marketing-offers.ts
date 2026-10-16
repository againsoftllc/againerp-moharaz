import { apiFetch } from "@/lib/api/client";

export type OfferStatus = "draft" | "scheduled" | "running" | "ended" | "disabled";

export type ApiOfferSection = {
  id?: string;
  key: string;
  label: string;
  category_slug: string;
  sort_order: number;
};

export type ApiMarketingOffer = {
  id: string;
  slug: string;
  title: string;
  description: string;
  image_url?: string | null;
  outlet_label: string;
  starts_at: string;
  ends_at: string;
  status: OfferStatus;
  sort_order: number;
  products_limit: number;
  sections: ApiOfferSection[];
  created_at: string;
  updated_at: string;
};

export type OfferWriteInput = {
  slug: string;
  title: string;
  description?: string;
  image_url?: string | null;
  outlet_label?: string;
  starts_at: string;
  ends_at: string;
  status: OfferStatus;
  sort_order?: number;
  products_limit?: number;
  sections: {
    key?: string;
    label: string;
    category_slug: string;
    sort_order?: number;
  }[];
};

type ListResponse = { data: ApiMarketingOffer[]; meta: { count: number } };
type ItemResponse = { data: ApiMarketingOffer };

export async function fetchMarketingOffers(params?: {
  search?: string;
  status?: string;
}): Promise<ApiMarketingOffer[]> {
  const q = new URLSearchParams();
  if (params?.search) q.set("search", params.search);
  if (params?.status) q.set("status", params.status);
  const qs = q.toString();
  const res = await apiFetch<ListResponse>(`/api/v1/marketing/offers${qs ? `?${qs}` : ""}`);
  return res.data ?? [];
}

export async function createMarketingOffer(input: OfferWriteInput): Promise<ApiMarketingOffer> {
  const res = await apiFetch<ItemResponse>("/api/v1/marketing/offers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function updateMarketingOffer(
  id: string,
  input: Partial<OfferWriteInput>,
): Promise<ApiMarketingOffer> {
  const res = await apiFetch<ItemResponse>(`/api/v1/marketing/offers/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function deleteMarketingOffer(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/marketing/offers/${id}`, { method: "DELETE" });
}
