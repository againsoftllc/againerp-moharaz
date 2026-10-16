import type { CouponStatus, MarketingCoupon } from "@/lib/mock-data/marketing";
import { apiFetch } from "@/lib/api/client";

export type ApiCoupon = {
  id: string;
  code: string;
  name: string;
  discount_type: string;
  discount_value: string | number;
  discount_label: string;
  status: string;
  redemptions: number;
  redemption_limit: number | null;
  starts_at: string;
  ends_at: string;
  min_order_amount: string | number | null;
};

export type ApiCouponListResponse = {
  data: ApiCoupon[];
  meta: { count: number; active_count: number };
};

export type ApiCouponResponse = {
  data: ApiCoupon;
};

export type CouponWriteInput = {
  code: string;
  name: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  discount_label?: string | null;
  status: CouponStatus;
  redemption_limit?: number | null;
  starts_at: string;
  ends_at: string;
  min_order_amount?: number | null;
};

export function apiCouponToMarketingCoupon(row: ApiCoupon): MarketingCoupon {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    discount: row.discount_label,
    status: row.status as CouponStatus,
    redemptions: row.redemptions,
    limit: row.redemption_limit ?? undefined,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  };
}

export function buildCouponQuery(params?: { search?: string; status?: string }): string {
  const q = new URLSearchParams();
  if (params?.search) q.set("search", params.search);
  if (params?.status) q.set("status", params.status);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export async function createMarketingCoupon(input: CouponWriteInput): Promise<MarketingCoupon> {
  const res = await apiFetch<ApiCouponResponse>("/api/v1/marketing/coupons", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return apiCouponToMarketingCoupon(res.data);
}

export async function updateMarketingCoupon(
  id: string,
  input: Partial<CouponWriteInput>,
): Promise<MarketingCoupon> {
  const res = await apiFetch<ApiCouponResponse>(`/api/v1/marketing/coupons/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return apiCouponToMarketingCoupon(res.data);
}

export async function deleteMarketingCoupon(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/marketing/coupons/${id}`, { method: "DELETE" });
}
