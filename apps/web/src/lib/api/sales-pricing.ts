import { apiFetch } from "@/lib/api/client";

const BASE = "/api/v1/sales/pricing";

export type ApiCustomerGroup = {
  id: string;
  code: string;
  name: string;
  price_type_id: string | null;
  discount_type_id: string | null;
  is_active: boolean;
  sort_order: number;
  customer_count: number;
};

export type CustomerGroupInput = {
  code?: string;
  name?: string;
  price_type_id?: string | null;
  discount_type_id?: string | null;
  is_active?: boolean;
  sort_order?: number;
};

export type ApiPriceTypeItem = {
  item_id: string;
  min_qty: number;
  price: string;
  valid_from: string | null;
  valid_to: string | null;
  sku?: string | null;
  name?: string | null;
  list_price?: string | null;
};

export type ApiPriceType = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  /** the seller may change the price (within the limits when set) */
  allow_change: boolean;
  lower_limit_pct: string | null;
  upper_limit_pct: string | null;
  is_active: boolean;
  items: ApiPriceTypeItem[];
};

export type PriceTypeInput = {
  code?: string;
  name?: string;
  description?: string | null;
  allow_change?: boolean;
  lower_limit_pct?: string | null;
  upper_limit_pct?: string | null;
  is_active?: boolean;
  items?: { item_id: string; min_qty: number; price: string; valid_from: string | null; valid_to: string | null }[];
};

export type ApiDiscountTypeItem = {
  item_id: string | null;
  brand_id: string | null;
  category_id: string | null;
  min_qty: number;
  discount_pct: string;
  valid_from: string | null;
  valid_to: string | null;
  target_label?: string | null;
};

export type ApiDiscountType = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  max_pct: string | null;
  is_active: boolean;
  items: ApiDiscountTypeItem[];
};

export type DiscountTypeInput = {
  code?: string;
  name?: string;
  description?: string | null;
  max_pct?: string | null;
  is_active?: boolean;
  items?: Omit<ApiDiscountTypeItem, "target_label">[];
};

export type ApiPricingRule = {
  id: string;
  name: string;
  price_type_id: string | null;
  discount_type_id: string | null;
  customer_group: string | null;
  warehouse_id: string | null;
  user_id: string | null;
  brand_id: string | null;
  category_id: string | null;
  valid_from: string | null;
  valid_to: string | null;
  priority: number;
  is_active: boolean;
};

export type PricingRuleInput = Partial<Omit<ApiPricingRule, "id">>;

export type ApiPriceQuote = {
  item_id: string;
  quantity: number;
  list_price: string;
  price: string;
  source: "customer_price" | "price_type" | "catalog";
  price_type_id: string | null;
  price_type_name: string | null;
  allow_change: boolean;
  min_price: string | null;
  max_price: string | null;
  discount_pct: string;
  discount_type_id: string | null;
  discount_type_name: string | null;
  max_discount_pct: string | null;
  rule_names: string[];
};

const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) });

export const fetchCustomerGroups = () => apiFetch<{ data: ApiCustomerGroup[] }>(`${BASE}/customer-groups`);
export const createCustomerGroup = (input: CustomerGroupInput) =>
  apiFetch<{ data: ApiCustomerGroup }>(`${BASE}/customer-groups`, json("POST", input));
export const updateCustomerGroup = (id: string, input: CustomerGroupInput) =>
  apiFetch<{ data: ApiCustomerGroup }>(`${BASE}/customer-groups/${encodeURIComponent(id)}`, json("PATCH", input));

export const fetchPriceTypes = () => apiFetch<{ data: ApiPriceType[] }>(`${BASE}/price-types`);
export const createPriceType = (input: PriceTypeInput) => apiFetch<{ data: ApiPriceType }>(`${BASE}/price-types`, json("POST", input));
export const updatePriceType = (id: string, input: PriceTypeInput) =>
  apiFetch<{ data: ApiPriceType }>(`${BASE}/price-types/${encodeURIComponent(id)}`, json("PATCH", input));

export const fetchDiscountTypes = () => apiFetch<{ data: ApiDiscountType[] }>(`${BASE}/discount-types`);
export const createDiscountType = (input: DiscountTypeInput) =>
  apiFetch<{ data: ApiDiscountType }>(`${BASE}/discount-types`, json("POST", input));
export const updateDiscountType = (id: string, input: DiscountTypeInput) =>
  apiFetch<{ data: ApiDiscountType }>(`${BASE}/discount-types/${encodeURIComponent(id)}`, json("PATCH", input));

export const fetchPricingRules = () => apiFetch<{ data: ApiPricingRule[] }>(`${BASE}/rules`);
export const createPricingRule = (input: PricingRuleInput) => apiFetch<{ data: ApiPricingRule }>(`${BASE}/rules`, json("POST", input));
export const updatePricingRule = (id: string, input: PricingRuleInput) =>
  apiFetch<{ data: ApiPricingRule }>(`${BASE}/rules/${encodeURIComponent(id)}`, json("PATCH", input));

/** What a sales line for this product should start at, and the bounds the server checks it against on save. */
export async function fetchPriceQuote(params: { itemId: string; quantity?: number; customerId?: string | null; warehouseId?: string | null }) {
  const q = new URLSearchParams({ item_id: params.itemId, quantity: String(Math.max(1, Math.round(params.quantity ?? 1))) });
  if (params.customerId) q.set("customer_id", params.customerId);
  if (params.warehouseId) q.set("warehouse_id", params.warehouseId);
  const res = await apiFetch<{ data: ApiPriceQuote }>(`${BASE}/quote?${q.toString()}`);
  return res.data;
}
