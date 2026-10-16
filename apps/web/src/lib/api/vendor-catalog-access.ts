import { apiFetch } from "@/lib/api/client";

// ------------------------------------------------------------ visibility

export type VendorCatalogVisibilityRule = {
  id: string;
  item_id: string;
  vendor_group_id: string | null;
  vendor_group_name: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
};

export async function fetchCatalogVisibilityRules(itemId: string): Promise<VendorCatalogVisibilityRule[]> {
  const res = await apiFetch<{ data: VendorCatalogVisibilityRule[] }>(
    `/api/v1/vendors/catalog-visibility?item_id=${encodeURIComponent(itemId)}`,
  );
  return res.data;
}

export async function upsertCatalogVisibilityRule(payload: {
  item_id: string;
  vendor_group_id?: string;
  vendor_id?: string;
  is_visible: boolean;
}): Promise<VendorCatalogVisibilityRule> {
  const res = await apiFetch<{ data: VendorCatalogVisibilityRule }>("/api/v1/vendors/catalog-visibility", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function deleteCatalogVisibilityRule(ruleId: string): Promise<void> {
  await apiFetch(`/api/v1/vendors/catalog-visibility/${ruleId}`, { method: "DELETE" });
}

// --------------------------------------------------------- price overrides

export type VendorProductPriceOverride = {
  id: string;
  vendor_id: string;
  vendor_name: string | null;
  item_id: string;
  unit_price: string;
  min_qty: number;
  max_qty: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export async function fetchProductPriceOverrides(itemId: string): Promise<VendorProductPriceOverride[]> {
  const res = await apiFetch<{ data: VendorProductPriceOverride[] }>(
    `/api/v1/vendors/product-prices?item_id=${encodeURIComponent(itemId)}`,
  );
  return res.data;
}

export async function upsertProductPriceOverride(payload: {
  vendor_id: string;
  item_id: string;
  unit_price: number;
  min_qty?: number;
  max_qty?: number;
}): Promise<VendorProductPriceOverride> {
  const res = await apiFetch<{ data: VendorProductPriceOverride }>("/api/v1/vendors/product-prices", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function deleteProductPriceOverride(priceId: string): Promise<void> {
  await apiFetch(`/api/v1/vendors/product-prices/${priceId}`, { method: "DELETE" });
}
