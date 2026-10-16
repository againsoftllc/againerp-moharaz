import { apiFetch } from "@/lib/api/client";
import {
  recalcBundle,
  type BundleItem,
  type BundlePricingMode,
  type BundleStatus,
  type ProductBundle,
} from "@/lib/mock-data/bundles";

export type ApiBundleComponent = {
  id: string;
  product_id: string;
  product_name: string;
  sku: string;
  quantity: number;
  unit_price: string | number;
  is_optional: boolean;
  thumbnail?: string | null;
};

export type ApiCatalogBundle = {
  id: string;
  company_id: string;
  name: string;
  slug: string;
  sku: string;
  status: BundleStatus;
  pricing_mode: BundlePricingMode;
  bundle_price: string | number;
  discount_percent: string | number;
  retail_total: string | number;
  component_count: number;
  components_summary: string;
  stock: number;
  thumbnail?: string | null;
  category: string;
  description?: string | null;
  components: ApiBundleComponent[];
  created_at: string;
  updated_at: string;
};

type BundleListResponse = {
  data: ApiCatalogBundle[];
  meta: { count: number };
  errors: string[];
};

type BundleResponse = {
  data: ApiCatalogBundle;
  errors: string[];
};

function money(value: string | number | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function apiBundleToBundle(row: ApiCatalogBundle): ProductBundle {
  const components: BundleItem[] = (row.components ?? []).map((c) => ({
    id: c.id,
    productId: c.product_id,
    productName: c.product_name,
    sku: c.sku,
    quantity: c.quantity,
    unitPrice: money(c.unit_price),
    isOptional: Boolean(c.is_optional),
    thumbnail: c.thumbnail ?? undefined,
  }));
  const base: ProductBundle = {
    id: row.id,
    name: row.name,
    slug: row.slug,
    sku: row.sku,
    status: row.status,
    pricingMode: row.pricing_mode,
    bundlePrice: money(row.bundle_price),
    discountPercent: money(row.discount_percent),
    retailTotal: money(row.retail_total),
    componentCount: row.component_count,
    componentsSummary: row.components_summary,
    stock: row.stock,
    thumbnail: row.thumbnail ?? undefined,
    category: row.category || "General",
    updatedAt: (row.updated_at || "").slice(0, 10),
    description: row.description ?? undefined,
    components,
  };
  return { ...base, ...recalcBundle(base) };
}

function componentToApi(c: BundleItem): ApiBundleComponent {
  return {
    id: c.id,
    product_id: c.productId,
    product_name: c.productName,
    sku: c.sku,
    quantity: c.quantity,
    unit_price: c.unitPrice,
    is_optional: c.isOptional,
    thumbnail: c.thumbnail ?? null,
  };
}

export function bundleToApiPayload(data: Partial<ProductBundle> & { name?: string; slug?: string }) {
  const payload: Record<string, unknown> = {};
  if (data.name !== undefined) payload.name = data.name;
  if (data.slug !== undefined) payload.slug = data.slug;
  if (data.sku !== undefined) payload.sku = data.sku;
  if (data.status !== undefined) payload.status = data.status;
  if (data.pricingMode !== undefined) payload.pricing_mode = data.pricingMode;
  if (data.bundlePrice !== undefined) payload.bundle_price = data.bundlePrice;
  if (data.discountPercent !== undefined) payload.discount_percent = data.discountPercent;
  if (data.stock !== undefined) payload.stock = data.stock;
  if (data.thumbnail !== undefined) payload.thumbnail = data.thumbnail;
  if (data.category !== undefined) payload.category = data.category;
  if (data.description !== undefined) payload.description = data.description;
  if (data.components !== undefined) {
    payload.components = data.components.map(componentToApi);
  }
  return payload;
}

export async function fetchCatalogBundles(): Promise<ProductBundle[]> {
  const res = await apiFetch<BundleListResponse>("/api/v1/catalog/bundles");
  return (res.data ?? []).map(apiBundleToBundle);
}

export async function createCatalogBundle(
  data: Partial<ProductBundle> & { name: string; slug: string },
): Promise<ProductBundle> {
  const res = await apiFetch<BundleResponse>("/api/v1/catalog/bundles", {
    method: "POST",
    body: JSON.stringify(bundleToApiPayload(data)),
  });
  return apiBundleToBundle(res.data);
}

export async function updateCatalogBundle(
  id: string,
  data: Partial<ProductBundle>,
): Promise<ProductBundle> {
  const res = await apiFetch<BundleResponse>(`/api/v1/catalog/bundles/${id}`, {
    method: "PATCH",
    body: JSON.stringify(bundleToApiPayload(data)),
  });
  return apiBundleToBundle(res.data);
}

export async function deleteCatalogBundles(ids: string[]): Promise<void> {
  if (ids.length === 1) {
    await apiFetch(`/api/v1/catalog/bundles/${ids[0]}`, { method: "DELETE" });
    return;
  }
  await apiFetch("/api/v1/catalog/bundles/bulk-delete", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}
