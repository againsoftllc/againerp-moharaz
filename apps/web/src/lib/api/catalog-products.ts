import type { Product, ProductStatus, ProductVisibility, StockStatusLabel } from "@/lib/mock-data/products";
import { apiFetch, ApiError } from "@/lib/api/client";

/** Raw product shape from FastAPI `/api/v1/catalog/products`. */
export type DigitalFile = {
  id: string;
  product_id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  download_limit: number | null;
  expires_days: number | null;
  sort_order: number;
};

export type ApiCatalogProduct = {
  id: string;
  /** Universal Item SSOT key (ADR-014 P7) — authoritative identity across modules. */
  item_id?: string | null;
  company_id: string;
  name: string;
  slug: string;
  sku: string;
  model?: string | null;
  remarks?: string | null;
  description: string | null;
  short_description: string | null;
  price: string;
  compare_at_price: string | null;
  purchase_price?: string | null;
  last_selling_price?: string | null;
  stock: number;
  status: ProductStatus;
  product_type: "simple" | "variable" | "digital" | "combo";
  visibility: ProductVisibility;
  brand: string | null;
  category: string | null;
  brand_id: string | null;
  category_id: string | null;
  category_ids?: string[];
  attribute_profile_id: string | null;
  thumbnail: string | null;
  seo_title: string | null;
  seo_description: string | null;
  focus_keyphrase?: string | null;
  warranty: string | null;
  origin?: string | null;
  alert_quantity?: number | null;
  unit_type?: string | null;
  track_serial?: boolean;
  track_batch?: boolean;
  tracking_type?: "none" | "serial" | "batch";
  track_quantity: boolean;
  barcode?: string | null;
  barcode_type?: string | null;
  not_for_selling?: boolean;
  weight?: string | null;
  tax_rate?: number | null;
  tax_type?: string;
  location_ids?: string[];
  stock_status: string | null;
  tags: string[];
  custom_specs_json: string | null;
  variant_attributes_json?: string | null;
  combo_components_json?: string | null;
  source_url?: string | null;
  seller_info_json?: string | null;
  dropship_meta_json?: string | null;
  in_inventory?: boolean;
  on_website?: boolean;
  gallery_json?: string | null;
  video_urls_json?: string | null;
  created_at: string;
  updated_at: string;
  updated_by_name?: string | null;
};

export type ApiProductVariant = {
  id: string;
  sku: string;
  name: string;
  price: string;
  purchase_price?: string | null;
  stock: number;
  status: ProductStatus;
  is_default: boolean;
  sort_order: number;
  image_id: string | null;
  image_url: string | null;
  options_json?: string | null;
  external_sku_id?: string | null;
};

export type ApiProductMediaLink = {
  id: string;
  media_id: string;
  url: string;
  name: string;
  media_type: string;
  sort_order: number;
  is_primary: boolean;
};

export type ApiProductDetail = ApiCatalogProduct & {
  variants: ApiProductVariant[];
  media: ApiProductMediaLink[];
  has_inventory: boolean;
  ecommerce_publish_status?: string | null;
};

export type ApiProductListResponse = {
  data: ApiCatalogProduct[];
  meta: { count: number; page: number; per_page: number };
  errors: string[];
};

export type ApiProductResponse = {
  data: ApiCatalogProduct;
  errors: string[];
};

export type ApiProductDetailResponse = {
  data: ApiProductDetail;
  errors: string[];
};

export type ProductSellerInfo = {
  id?: string | null;
  name?: string | null;
  store_name?: string | null;
  level?: number | null;
  delivery_score?: number | null;
  item_score?: number | null;
  service_score?: number | null;
  seller_type?: string | null;
  review?: {
    medal_level?: number | string | null;
    retention_rate?: number | string | null;
    service_score?: number | string | null;
    logistics_score?: number | string | null;
    complaint_score?: number | string | null;
    consulting_score?: number | string | null;
    aftersale_score?: number | string | null;
    total_score?: number | string | null;
  } | null;
};

export type ProductDetail = Product & {
  itemId?: string | null;
  productType: "simple" | "variable" | "digital" | "combo";
  categoryId: string | null;
  categoryIds?: string[];
  brandId: string | null;
  attributeProfileId: string | null;
  shortDescription: string;
  metaTitle: string;
  metaDescription: string;
  focusKeyphrase: string;
  warranty: string | null;
  origin?: string | null;
  alertQuantity: number;
  unitType: string;
  trackSerial: boolean;
  trackBatch?: boolean;
  trackingType?: "none" | "serial" | "batch";
  trackQuantity: boolean;
  stockStatus: string | null;
  customSpecsJson: string | null;
  variantAttributesJson?: string | null;
  comboComponentsJson?: string | null;
  sourceUrl?: string | null;
  sellerInfo?: ProductSellerInfo | null;
  dropshipMetaJson?: string | null;
  videoUrls?: string[];
  mediaLinks: ApiProductMediaLink[];
  variants: ApiProductVariant[];
  hasInventory: boolean;
  ecommercePublishStatus?: string | null;
  specs?: ProductSpecs;
};

export type ProductSpecValue = {
  attributeId: string;
  attributeCode: string;
  attributeName: string;
  value: string;
};

export type ProductSpecs = {
  attributeProfileId: string | null;
  values: ProductSpecValue[];
};

/** The product's own stock status (set by hand or copied from a competitor in Price Compare)
 * wins; without one it follows the quantity: none left = Out of Stock, otherwise In Stock. */
function resolveStockStatus(stock: number, stockStatus?: string | null): StockStatusLabel {
  switch (stockStatus) {
    case "in_stock":
      return "In Stock";
    case "out_of_stock":
      return "Out of Stock";
    case "pre_order":
      return "Pre-order";
    case "coming_soon":
      return "Coming Soon";
  }
  return stock > 0 ? "In Stock" : "Out of Stock";
}

/** The fields a table row shows, taken from a freshly saved product (the full detail is heavier than a list row). */
export function productListFields(d: ProductDetail): Partial<Product> {
  return {
    sku: d.sku,
    slug: d.slug,
    model: d.model,
    remarks: d.remarks,
    price: d.price,
    compareAtPrice: d.compareAtPrice,
    offerPrice: d.offerPrice,
    purchasePrice: d.purchasePrice,
    lastSellingPrice: d.lastSellingPrice,
    stock: d.stock,
    trackQuantity: d.trackQuantity,
    stockStatus: d.stockStatus,
    status: d.status,
    visibility: d.visibility,
    category: d.category,
    brand: d.brand,
    seoTitle: d.seoTitle,
    warranty: d.warranty,
    alertQuantity: d.alertQuantity,
    updatedAt: d.updatedAt,
  };
}

export function apiProductToProduct(row: ApiCatalogProduct): Product {
  const price = parseFloat(row.price) || 0;
  const compareAt = row.compare_at_price ? parseFloat(row.compare_at_price) : undefined;
  const lastSelling = row.last_selling_price ? parseFloat(row.last_selling_price) : undefined;
  const purchase = row.purchase_price ? parseFloat(row.purchase_price) : undefined;

  return {
    id: row.id,
    itemId: row.item_id ?? null,
    name: row.name,
    slug: row.slug,
    sku: row.sku,
    sourceUrl: row.source_url ?? null,
    attributeProfileId: row.attribute_profile_id ?? null,
    model: row.model ?? null,
    remarks: row.remarks ?? null,
    price,
    compareAtPrice: compareAt,
    purchasePrice: purchase,
    lastSellingPrice: lastSelling,
    offerPrice: compareAt,
    stock: row.stock,
    trackQuantity: row.track_quantity ?? true,
    stockStatus: resolveStockStatus(row.stock, row.stock_status),
    status: row.status,
    visibility: row.visibility ?? "public",
    category: row.category ?? "Uncategorized",
    categoryIds: row.category_ids?.length
      ? row.category_ids
      : row.category_id
        ? [row.category_id]
        : [],
    brand: row.brand ?? "Unknown",
    thumbnail: resolveThumbnail(row.thumbnail),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by_name ?? undefined,
    seoTitle: row.seo_title ?? `${row.name} | Buy Online — AgainERP`,
    description: row.description ?? undefined,
    shortDescription: row.short_description ?? undefined,
    tags: row.tags ?? [],
    warranty: row.warranty ?? null,
    origin: row.origin ?? null,
    productType: row.product_type,
    alertQuantity: row.alert_quantity ?? 0,
    unitType: row.unit_type ?? "ea",
    barcode: row.barcode ?? null,
    barcodeType: row.barcode_type ?? "C128",
    notForSelling: row.not_for_selling ?? false,
    weight: row.weight ?? null,
    taxRate: row.tax_rate ?? null,
    taxType: row.tax_type ?? "exclusive",
    locationIds: row.location_ids ?? [],
  };
}

/**
 * Only a real uploaded/linked image counts. No random placeholder is generated
 * for products without media — the UI shows a "no image" icon instead. Demo
 * placeholder hosts (picsum/placehold) are treated as missing too.
 */
const PLACEHOLDER_IMAGE_HOST = /picsum\.photos|placehold\.co/i;
function resolveThumbnail(url: string | null | undefined): string {
  const value = (url ?? "").trim();
  if (!value || PLACEHOLDER_IMAGE_HOST.test(value)) return "";
  return value;
}

export function apiProductDetailToProduct(row: ApiProductDetail): ProductDetail {
  const base = apiProductToProduct(row);
  let sellerInfo: ProductSellerInfo | null = null;
  if (row.seller_info_json) {
    try {
      sellerInfo = JSON.parse(row.seller_info_json) as ProductSellerInfo;
    } catch {
      sellerInfo = null;
    }
  }
  let videoUrls: string[] = [];
  if (row.video_urls_json) {
    try {
      const parsed = JSON.parse(row.video_urls_json);
      videoUrls = Array.isArray(parsed) ? parsed.filter((u): u is string => typeof u === "string") : [];
    } catch {
      videoUrls = [];
    }
  }
  return {
    ...base,
    itemId: row.item_id ?? null,
    seoTitle: row.seo_title ?? base.seoTitle,
    shortDescription: row.short_description ?? "",
    productType: row.product_type,
    categoryId: row.category_id,
    categoryIds: row.category_ids?.length
      ? row.category_ids
      : row.category_id
        ? [row.category_id]
        : [],
    brandId: row.brand_id,
    attributeProfileId: row.attribute_profile_id,
    metaTitle: row.seo_title ?? "",
    metaDescription: row.seo_description ?? "",
    focusKeyphrase: row.focus_keyphrase ?? "",
    warranty: row.warranty ?? null,
    origin: row.origin ?? null,
    alertQuantity: row.alert_quantity ?? 0,
    unitType: row.unit_type ?? "ea",
    trackSerial: row.track_serial ?? false,
    trackBatch: row.track_batch ?? false,
    trackingType: row.tracking_type ?? (row.track_serial ? "serial" : row.track_batch ? "batch" : "none"),
    trackQuantity: row.track_quantity ?? true,
    barcode: row.barcode ?? null,
    barcodeType: row.barcode_type ?? "C128",
    notForSelling: row.not_for_selling ?? false,
    weight: row.weight ?? null,
    taxRate: row.tax_rate ?? null,
    taxType: row.tax_type ?? "exclusive",
    locationIds: row.location_ids ?? [],
    stockStatus: row.stock_status ?? null,
    customSpecsJson: row.custom_specs_json ?? null,
    variantAttributesJson: row.variant_attributes_json ?? null,
    comboComponentsJson: row.combo_components_json ?? null,
    sourceUrl: row.source_url ?? null,
    sellerInfo,
    dropshipMetaJson: row.dropship_meta_json ?? null,
    videoUrls,
    mediaLinks: row.media,
    variants: row.variants,
    hasInventory: row.has_inventory ?? false,
    ecommercePublishStatus: row.ecommerce_publish_status ?? null,
  };
}

export type CreateCatalogProductInput = {
  name: string;
  slug: string;
  sku: string;
  model?: string | null;
  remarks?: string | null;
  /** The product's source page (Source link field); AI uploads fill it. */
  source_url?: string | null;
  price: number;
  stock?: number;
  status?: ProductStatus;
  product_type?: "simple" | "variable" | "digital" | "combo";
  visibility?: ProductVisibility;
  brand?: string;
  category?: string;
  brand_id?: string | null;
  category_id?: string | null;
  category_ids?: string[];
  attribute_profile_id?: string | null;
  description?: string;
  short_description?: string;
  thumbnail?: string;
  seo_title?: string;
  seo_description?: string;
  focus_keyphrase?: string | null;
  warranty?: string | null;
  origin?: string | null;
  alert_quantity?: number | null;
  unit_type?: string | null;
  track_serial?: boolean;
  tracking_type?: "none" | "serial" | "batch";
  barcode?: string | null;
  barcode_type?: string;
  not_for_selling?: boolean;
  weight?: string | null;
  tax_rate?: number | null;
  tax_type?: string;
  location_ids?: string[];
  tags?: string[];
  compare_at_price?: number | null;
  purchase_price?: number | null;
  last_selling_price?: number | null;
  custom_specs_json?: string | null;
  variant_attributes_json?: string | null;
  combo_components_json?: string | null;
  track_quantity?: boolean;
  stock_status?: string | null;
  /** Marks product for Dropshipping module list (`channel=dropshipping`). */
  dropship_meta_json?: string | null;
  in_inventory?: boolean;
  on_website?: boolean;
};

export type ProductInventoryInput = {
  warehouse_id: string;
  on_hand?: number;
  min_qty?: number;
  unit_cost?: number;
  /** Serial-tracked items: one serial per unit being added (qty = count). */
  serial_numbers?: string[];
};

export type ProductInventoryRecord = {
  id: string;
  warehouseId: string;
  warehouseName: string;
  variantId: string;
  onHand: number;
  minQty: number;
  unitCost: number;
};

export type UpdateCatalogProductInput = Partial<CreateCatalogProductInput>;

export type VariantUpsertInput = {
  id?: string;
  sku: string;
  name: string;
  price: number;
  purchase_price?: number | null;
  stock: number;
  status?: ProductStatus;
  is_default?: boolean;
  sort_order?: number;
  image_id?: string | null;
  options_json?: string | null;
};

function productPayload(input: CreateCatalogProductInput | UpdateCatalogProductInput) {
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.slug !== undefined) payload.slug = input.slug;
  if (input.sku !== undefined) payload.sku = input.sku;
  if (input.model !== undefined) payload.model = input.model;
  if (input.remarks !== undefined) payload.remarks = input.remarks;
  if (input.source_url !== undefined) payload.source_url = input.source_url;
  if (input.price !== undefined) payload.price = input.price.toFixed(2);
  if (input.compare_at_price !== undefined) {
    payload.compare_at_price =
      input.compare_at_price == null ? null : input.compare_at_price.toFixed(2);
  }
  if (input.purchase_price !== undefined) {
    payload.purchase_price =
      input.purchase_price == null ? null : input.purchase_price.toFixed(2);
  }
  if (input.last_selling_price !== undefined) {
    payload.last_selling_price =
      input.last_selling_price == null ? null : input.last_selling_price.toFixed(2);
  }
  if (input.stock !== undefined) payload.stock = input.stock;
  if (input.status !== undefined) payload.status = input.status;
  if (input.product_type !== undefined) payload.product_type = input.product_type;
  if (input.visibility !== undefined) payload.visibility = input.visibility;
  if (input.brand !== undefined) payload.brand = input.brand;
  if (input.category !== undefined) payload.category = input.category;
  if (input.brand_id !== undefined) payload.brand_id = input.brand_id;
  if (input.category_id !== undefined) payload.category_id = input.category_id;
  if (input.category_ids !== undefined) payload.category_ids = input.category_ids;
  if (input.attribute_profile_id !== undefined) payload.attribute_profile_id = input.attribute_profile_id;
  if (input.description !== undefined) payload.description = input.description;
  if (input.short_description !== undefined) payload.short_description = input.short_description;
  if (input.thumbnail !== undefined) payload.thumbnail = input.thumbnail;
  if (input.seo_title !== undefined) payload.seo_title = input.seo_title;
  if (input.seo_description !== undefined) payload.seo_description = input.seo_description;
  if (input.focus_keyphrase !== undefined) payload.focus_keyphrase = input.focus_keyphrase;
  if (input.warranty !== undefined) payload.warranty = input.warranty;
  if (input.origin !== undefined) payload.origin = input.origin;
  if (input.alert_quantity !== undefined) payload.alert_quantity = input.alert_quantity;
  if (input.unit_type !== undefined) payload.unit_type = input.unit_type;
  if (input.track_serial !== undefined) payload.track_serial = input.track_serial;
  if (input.tracking_type !== undefined) payload.tracking_type = input.tracking_type;
  if (input.tags !== undefined) payload.tags = input.tags;
  if (input.custom_specs_json !== undefined) payload.custom_specs_json = input.custom_specs_json;
  if (input.variant_attributes_json !== undefined) payload.variant_attributes_json = input.variant_attributes_json;
  if (input.combo_components_json !== undefined) payload.combo_components_json = input.combo_components_json;
  if (input.track_quantity !== undefined) payload.track_quantity = input.track_quantity;
  if (input.stock_status !== undefined) payload.stock_status = input.stock_status;
  if (input.dropship_meta_json !== undefined) payload.dropship_meta_json = input.dropship_meta_json;
  if (input.in_inventory !== undefined) payload.in_inventory = input.in_inventory;
  if (input.on_website !== undefined) payload.on_website = input.on_website;
  if (input.barcode !== undefined) payload.barcode = input.barcode;
  if (input.barcode_type !== undefined) payload.barcode_type = input.barcode_type;
  if (input.not_for_selling !== undefined) payload.not_for_selling = input.not_for_selling;
  if (input.weight !== undefined) payload.weight = input.weight;
  if (input.tax_rate !== undefined) payload.tax_rate = input.tax_rate;
  if (input.tax_type !== undefined) payload.tax_type = input.tax_type;
  if (input.location_ids !== undefined) payload.location_ids = input.location_ids;
  return payload;
}

export async function addProductsToInventory(
  productIds: string[],
): Promise<{ added: number; already: number; missing: number }> {
  return apiFetch("/api/v1/catalog/products/add-to-inventory", {
    method: "POST",
    body: JSON.stringify({ product_ids: productIds }),
  });
}

export function productToApiPayload(input: CreateCatalogProductInput) {
  return productPayload(input);
}

export function productToApiUpdatePayload(input: UpdateCatalogProductInput) {
  return productPayload(input);
}

export async function fetchCatalogProductDetail(id: string): Promise<ProductDetail> {
  const res = await apiFetch<ApiProductDetailResponse>(`/api/v1/catalog/products/${id}`);
  return apiProductDetailToProduct(res.data);
}

export async function replaceProductVariants(
  productId: string,
  variants: VariantUpsertInput[],
): Promise<ProductDetail> {
  const res = await apiFetch<ApiProductDetailResponse>(`/api/v1/catalog/products/${productId}/variants`, {
    method: "PUT",
    body: JSON.stringify({
      variants: variants.map((v, idx) => ({
        id: v.id,
        sku: v.sku,
        name: v.name,
        price: v.price.toFixed(2),
        purchase_price: v.purchase_price != null ? v.purchase_price.toFixed(2) : null,
        stock: v.stock,
        status: v.status ?? "draft",
        is_default: v.is_default ?? false,
        sort_order: v.sort_order ?? idx,
        image_id: v.image_id ?? null,
        options_json: v.options_json ?? null,
      })),
    }),
  });
  return apiProductDetailToProduct(res.data);
}

export async function replaceProductMedia(
  productId: string,
  mediaIds: string[],
): Promise<ProductDetail> {
  const res = await apiFetch<ApiProductDetailResponse>(`/api/v1/catalog/products/${productId}/media`, {
    method: "PUT",
    body: JSON.stringify({ media_ids: mediaIds }),
  });
  return apiProductDetailToProduct(res.data);
}

export async function fetchProductSpecs(productId: string): Promise<ProductSpecs> {
  const res = await apiFetch<{ data: { attribute_profile_id: string | null; values: { attribute_id: string; attribute_code: string; attribute_name: string; value: string }[] } }>(
    `/api/v1/catalog/products/${productId}/specs`,
  );
  return {
    attributeProfileId: res.data.attribute_profile_id,
    values: res.data.values.map((v) => ({
      attributeId: v.attribute_id,
      attributeCode: v.attribute_code,
      attributeName: v.attribute_name,
      value: v.value,
    })),
  };
}

export async function replaceProductSpecs(
  productId: string,
  payload: { attributeProfileId: string | null; values: { attributeId: string; value: string; sortOrder?: number }[] },
): Promise<ProductSpecs> {
  const res = await apiFetch<{ data: { attribute_profile_id: string | null; values: { attribute_id: string; attribute_code: string; attribute_name: string; value: string }[] } }>(
    `/api/v1/catalog/products/${productId}/specs`,
    {
      method: "PUT",
      body: JSON.stringify({
        attribute_profile_id: payload.attributeProfileId,
        values: payload.values.map((v, idx) => ({
          attribute_id: v.attributeId,
          value: v.value,
          sort_order: v.sortOrder ?? idx,
        })),
      }),
    },
  );
  return {
    attributeProfileId: res.data.attribute_profile_id,
    values: res.data.values.map((v) => ({
      attributeId: v.attribute_id,
      attributeCode: v.attribute_code,
      attributeName: v.attribute_name,
      value: v.value,
    })),
  };
}

export async function checkCatalogProductSlug(
  slug: string,
  excludeId?: string,
): Promise<{ slug: string; available: boolean; message?: string | null }> {
  const params = new URLSearchParams({ slug });
  if (excludeId) params.set("exclude_id", excludeId);
  return apiFetch(`/api/v1/catalog/products/slug/check?${params.toString()}`);
}

function apiInventoryToRecord(row: {
  id: string;
  warehouse_id: string;
  warehouse_name: string;
  variant_id: string;
  on_hand: number;
  min_qty: number;
  unit_cost: string;
}): ProductInventoryRecord {
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    warehouseName: row.warehouse_name,
    variantId: row.variant_id,
    onHand: row.on_hand,
    minQty: row.min_qty,
    unitCost: parseFloat(row.unit_cost) || 0,
  };
}

export async function fetchProductInventory(productId: string): Promise<ProductInventoryRecord | null> {
  try {
    const res = await apiFetch<{ data: { id: string; warehouse_id: string; warehouse_name: string; variant_id: string; on_hand: number; min_qty: number; unit_cost: string } }>(
      `/api/v1/catalog/products/${productId}/inventory`,
    );
    return apiInventoryToRecord(res.data);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function fetchDigitalFiles(productId: string): Promise<DigitalFile[]> {
  const res = await apiFetch<{ data: DigitalFile[]; errors: string[] }>(
    `/api/v1/catalog/products/${productId}/digital-files`,
  );
  return res.data;
}

export async function uploadDigitalFile(productId: string, file: File): Promise<DigitalFile> {
  const { getApiBaseUrl } = await import("@/lib/api/client");
  const { getStoredAuthToken } = await import("@/lib/store/admin-auth-store");
  const form = new FormData();
  form.append("file", file);
  const token = getStoredAuthToken();
  const res = await fetch(`${getApiBaseUrl()}/api/v1/catalog/products/${productId}/digital-files`, {
    method: "POST",
    body: form,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json() as { data: DigitalFile };
  return json.data;
}

export async function deleteDigitalFile(productId: string, fileId: string): Promise<void> {
  await apiFetch(`/api/v1/catalog/products/${productId}/digital-files/${fileId}`, { method: "DELETE" });
}

export async function upsertProductInventory(
  productId: string,
  input: ProductInventoryInput,
): Promise<ProductInventoryRecord> {
  const res = await apiFetch<{ data: { id: string; warehouse_id: string; warehouse_name: string; variant_id: string; on_hand: number; min_qty: number; unit_cost: string } }>(
    `/api/v1/catalog/products/${productId}/inventory`,
    {
      method: "PUT",
      body: JSON.stringify({
        warehouse_id: input.warehouse_id,
        on_hand: input.on_hand,
        min_qty: input.min_qty,
        unit_cost: input.unit_cost,
        ...(input.serial_numbers?.length ? { serial_numbers: input.serial_numbers } : {}),
      }),
    },
  );
  return apiInventoryToRecord(res.data);
}

/** Server-side product search for pickers — the cached full list is not used
 *  here, so a large catalog stays a single small request per keystroke burst. */
export async function searchCatalogProducts(
  term: string,
  limit = 20,
): Promise<Product[]> {
  const params = new URLSearchParams({ q: term, per_page: String(limit) });
  const res = await apiFetch<ApiProductListResponse>(
    `/api/v1/catalog/products?${params.toString()}`,
  );
  return (res.data ?? []).map(apiProductToProduct);
}