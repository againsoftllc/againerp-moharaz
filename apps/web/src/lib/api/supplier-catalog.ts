import type {
  EnrichedVendorMapping,
  SupplierStockStatus,
  VendorProductMapping,
} from "@/lib/mock-data/vendor-product-mapping";
import { enrichMapping } from "@/lib/mock-data/vendor-product-mapping";
import { apiFetch } from "@/lib/api/client";

export type ApiSupplierProduct = {
  id: string;
  supplier_id: string;
  supplier_sku: string;
  supplier_title: string;
  supplier_price: string;
  currency: string;
  supplier_stock: number | null;
  stock_status: string;
  lead_time_days: number;
  min_order_qty: number;
  warranty: string | null;
  api_source: string;
  sync_status: string;
  is_active: boolean;
  notes: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ApiSupplierLink = {
  id: string;
  item_id: string;
  supplier_id: string;
  supplier_product_id: string | null;
  is_preferred: boolean;
  is_published: boolean;
  conversion_factor: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  supplier_name: string | null;
  supplier_sku: string | null;
  supplier_title: string | null;
  supplier_price: string | null;
  supplier_stock: number | null;
  stock_status: string | null;
  lead_time_days: number | null;
  min_order_qty: number | null;
  warranty: string | null;
  item_sku: string | null;
  item_name: string | null;
  retail_price: number | null;
  margin_pct: number | null;
};

export type ApiSupplierLinkListResponse = {
  data: ApiSupplierLink[];
};

export type ApiSupplierProductListResponse = {
  data: ApiSupplierProduct[];
  meta: { count: number; page: number; per_page: number };
};

export type MapSupplierInput = {
  item_id: string;
  supplier_id: string;
  supplier_sku: string;
  supplier_title: string;
  supplier_price: number;
  supplier_stock?: number;
  stock_status?: SupplierStockStatus;
  lead_time_days?: number;
  min_order_qty?: number;
  warranty?: string;
  is_preferred?: boolean;
  is_published?: boolean;
  conversion_factor?: number;
  api_source?: string;
  currency?: string;
};

export type MapSupplierResponse = {
  supplier_product: ApiSupplierProduct;
  link: ApiSupplierLink;
};

function parseStockStatus(value: string | null | undefined): SupplierStockStatus {
  if (value === "in_stock" || value === "low" || value === "out" || value === "unknown") {
    return value;
  }
  return "unknown";
}

export function apiLinkToVendorMapping(link: ApiSupplierLink): VendorProductMapping {
  return {
    id: link.id,
    supplierId: link.supplier_id,
    productId: link.item_id,
    variantId: null,
    vendorSku: link.supplier_sku ?? "",
    vendorTitle: link.supplier_title ?? link.item_name ?? "",
    vendorPrice: link.supplier_price ? Number(link.supplier_price) : 0,
    supplierStock: link.supplier_stock ?? 0,
    stockStatus: parseStockStatus(link.stock_status),
    leadTimeDays: link.lead_time_days ?? 7,
    minOrderQty: link.min_order_qty ?? 1,
    warranty: link.warranty ?? undefined,
    isPreferred: link.is_preferred,
    isPublishedOnWeb: link.is_published,
    isMapped: true,
    lastSyncedAt: link.updated_at,
    updatedAt: link.updated_at.slice(0, 10),
    supplierProductId: link.supplier_product_id,
  };
}

export function apiProductToUnmappedMapping(product: ApiSupplierProduct): VendorProductMapping {
  return {
    id: product.id,
    supplierId: product.supplier_id,
    productId: null,
    variantId: null,
    vendorSku: product.supplier_sku,
    vendorTitle: product.supplier_title,
    vendorPrice: Number(product.supplier_price),
    supplierStock: product.supplier_stock ?? 0,
    stockStatus: parseStockStatus(product.stock_status),
    leadTimeDays: product.lead_time_days,
    minOrderQty: product.min_order_qty,
    warranty: product.warranty ?? undefined,
    isPreferred: false,
    isPublishedOnWeb: false,
    isMapped: false,
    lastSyncedAt: product.last_synced_at,
    updatedAt: product.updated_at.slice(0, 10),
  };
}

export function apiLinkToEnrichedMapping(link: ApiSupplierLink): EnrichedVendorMapping {
  const base = apiLinkToVendorMapping(link);
  return {
    ...base,
    supplierName: link.supplier_name ?? link.supplier_id,
    productName: link.item_name,
    productSku: link.item_sku,
    retailPrice: link.retail_price,
    marginPct: link.margin_pct,
    supplierProductId: link.supplier_product_id,
  };
}

export async function fetchSupplierLinksByItem(itemId: string): Promise<ApiSupplierLink[]> {
  const res = await apiFetch<ApiSupplierLinkListResponse>(
    `/api/v1/supplier/links/by-item/${encodeURIComponent(itemId)}`,
  );
  return res.data;
}

export async function fetchSupplierLinksBySupplier(supplierId: string): Promise<ApiSupplierLink[]> {
  const res = await apiFetch<ApiSupplierLinkListResponse>(
    `/api/v1/supplier/links/by-supplier/${encodeURIComponent(supplierId)}`,
  );
  return res.data;
}

export async function fetchSupplierProducts(params?: {
  supplier_id?: string;
  api_source?: string;
  search?: string;
  page?: number;
  per_page?: number;
}): Promise<ApiSupplierProductListResponse> {
  const qs = new URLSearchParams();
  if (params?.supplier_id) qs.set("supplier_id", params.supplier_id);
  if (params?.api_source) qs.set("api_source", params.api_source);
  if (params?.search) qs.set("search", params.search);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.per_page) qs.set("per_page", String(params.per_page));
  const query = qs.toString();
  return apiFetch<ApiSupplierProductListResponse>(
    `/api/v1/supplier/products${query ? `?${query}` : ""}`,
  );
}

export async function mapSupplierToItem(payload: MapSupplierInput): Promise<MapSupplierResponse> {
  return apiFetch<MapSupplierResponse>("/api/v1/supplier/links/map", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateSupplierLink(
  linkId: string,
  payload: Partial<{
    is_preferred: boolean;
    is_published: boolean;
    conversion_factor: number;
    sort_order: number;
  }>,
): Promise<ApiSupplierLink> {
  return apiFetch<ApiSupplierLink>(`/api/v1/supplier/links/${encodeURIComponent(linkId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteSupplierLink(linkId: string): Promise<void> {
  await apiFetch<void>(`/api/v1/supplier/links/${encodeURIComponent(linkId)}`, {
    method: "DELETE",
  });
}

export async function updateSupplierProduct(
  productId: string,
  payload: Partial<{
    supplier_price: number;
    supplier_stock: number;
    stock_status: SupplierStockStatus;
    lead_time_days: number;
    min_order_qty: number;
    warranty: string;
  }>,
): Promise<ApiSupplierProduct> {
  return apiFetch<ApiSupplierProduct>(`/api/v1/supplier/products/${encodeURIComponent(productId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/** Reuse mock enrich when product metadata is available locally. */
export function enrichApiLink(link: ApiSupplierLink): EnrichedVendorMapping {
  const withApi = apiLinkToEnrichedMapping(link);
  const fromMock = enrichMapping(apiLinkToVendorMapping(link));
  return {
    ...withApi,
    productName: withApi.productName ?? fromMock.productName,
    productSku: withApi.productSku ?? fromMock.productSku,
    retailPrice: withApi.retailPrice ?? fromMock.retailPrice,
    marginPct: withApi.marginPct ?? fromMock.marginPct,
  };
}
