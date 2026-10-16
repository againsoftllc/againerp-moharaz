import type { ProviderId } from "../core/types";
import type { UniversalProduct, UniversalStockStatus, UniversalProductStatus } from "../models/UniversalProduct";
import { mapBrand } from "./BrandMapper";
import { mapCategory } from "./CategoryMapper";
import {
  collectIgnoredFields,
  mapImages,
  mapSingleImage,
  mapVideos,
  type MappingContext,
  traceField,
} from "./ImageMapper";
import {
  createUniversalId,
  normalizeCurrency,
  normalizeDate,
  normalizeDimensions,
  normalizeNumber,
  normalizePrice,
  normalizeString,
  normalizeUnit,
  normalizeWeight,
} from "./normalize";
import { mapSupplier } from "./SupplierMapper";
import { mapAttributes, mapVariants } from "./VariantMapper";
import { validateProduct, type FieldTrace, type ValidationResult } from "./validation";

export type MappingResult = {
  product: UniversalProduct;
  validation: ValidationResult;
  traces: FieldTrace[];
};

function inferStockStatus(quantity: number | null, status?: string): UniversalStockStatus {
  if (status) {
    const s = status.toLowerCase();
    if (s.includes("out") || s === "0") return "out_of_stock";
    if (s.includes("low")) return "low_stock";
    if (s.includes("in") || s === "active") return "in_stock";
  }
  if (quantity == null) return "unknown";
  if (quantity <= 0) return "out_of_stock";
  if (quantity < 10) return "low_stock";
  return "in_stock";
}

function inferProductStatus(status?: string): UniversalProductStatus {
  if (!status) return "unknown";
  const s = status.toLowerCase();
  if (s.includes("active") || s === "1") return "active";
  if (s.includes("inactive") || s === "0") return "inactive";
  if (s.includes("draft")) return "draft";
  return "unknown";
}

/** Provider-agnostic product mapper — dispatches by provider id. */
export function mapProduct(provider: ProviderId, raw: unknown): MappingResult {
  switch (provider) {
    case "elim":
      return mapElimProduct(raw);
    case "mock":
      return mapMockProduct(raw);
    default:
      return mapGenericProduct(provider, raw);
  }
}

function mapElimProduct(raw: unknown): MappingResult {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const traces: FieldTrace[] = [];
  const ctx: MappingContext = {
    provider: "elim",
    traces,
    usedPaths: new Set<string>(),
  };

  const providerProductId = String(o.id ?? o.mp_id ?? "");
  const title = normalizeString(o.title) || normalizeString(o.titleEn) || providerProductId;
  const basePrice = normalizePrice(o.price) ?? 0;
  const salePrice = normalizePrice(o.promotion_price) ?? undefined;
  const currency = normalizeCurrency(o.currency, "CNY");
  const quantity = normalizeNumber(o.quantity);

  traceField(ctx, "title", "title", title);
  traceField(ctx, "providerProductId", "id", providerProductId);
  traceField(ctx, "basePrice", "price", basePrice);
  traceField(ctx, "salePrice", "promotion_price", salePrice);
  traceField(ctx, "currency", "currency", currency);

  const images = mapImages(o.img_urls, traces, "img_urls");
  const thumb = mapSingleImage(o.img_url, images.length, traces, "img_url");
  if (thumb) images.unshift({ ...thumb, position: 0 });

  const videos = mapVideos(o.video_urls, traces);
  const attributes = mapAttributes(o.attributes, traces);
  const variants = mapVariants(o.skus, ctx);
  const category = mapCategory(
    o.category_name
      ? { id: o.category_id, name: o.category_name }
      : o.category_id,
    traces,
    "category",
  );
  const supplier = mapSupplier(
    { shop_id: o.shop_id, shop_name: o.shop_name, seller_type: o.seller_type, level: o.level },
    traces,
    "shop",
  );
  const brand = mapBrand(o.brand ?? o.brand_name, traces, "brand");

  const shipping = Array.isArray(o.shipping_info) ? o.shipping_info[0] : null;
  const weight = normalizeWeight(
    shipping && typeof shipping === "object" ? (shipping as Record<string, unknown>).weight : o.weight,
  );
  const dimensions = normalizeDimensions(shipping);

  traceField(ctx, "description", "description", o.description);
  traceField(ctx, "minimumOrder", "moq", o.moq);
  traceField(ctx, "unit", "unit", o.unit);
  traceField(ctx, "weight", "shipping_info[0].weight", weight);

  collectIgnoredFields(o, ctx.usedPaths, traces);

  const product: UniversalProduct = {
    id: createUniversalId("elim", providerProductId),
    provider: "elim",
    providerProductId,
    title,
    subtitle: normalizeString(o.titleEn) || undefined,
    shortDescription: normalizeString(o.description)?.slice(0, 280) || undefined,
    description: normalizeString(o.description) || undefined,
    brand,
    category,
    supplier,
    currency,
    basePrice,
    salePrice,
    weight: weight ?? undefined,
    dimensions: dimensions ?? undefined,
    originCountry: "CN",
    stockStatus: inferStockStatus(quantity, typeof o.status === "string" ? o.status : undefined),
    minimumOrder: normalizeNumber(o.moq) ?? undefined,
    unit: normalizeUnit(o.unit),
    status: inferProductStatus(typeof o.status === "string" ? o.status : undefined),
    createdAt: normalizeDate(o.created_at) ?? undefined,
    updatedAt: normalizeDate(o.updated_at) ?? undefined,
    images,
    videos,
    variants,
    attributes,
    rawData: raw,
  };

  const validation = validateProduct(product, traces);
  return { product, validation, traces };
}

function mapMockProduct(raw: unknown): MappingResult {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const traces: FieldTrace[] = [];
  const ctx: MappingContext = { provider: "mock", traces, usedPaths: new Set<string>() };

  const providerProductId = String(o.id ?? "mock-0");
  const title = normalizeString(o.title) || providerProductId;
  const basePrice = normalizePrice(o.price) ?? 0;
  const salePrice = normalizePrice(o.salePrice ?? o.promotion_price) ?? undefined;

  traceField(ctx, "title", "title", title);
  traceField(ctx, "providerProductId", "id", providerProductId);

  const images = mapImages(o.images ?? o.img_urls ?? o.imageUrl, traces, "images");
  const category = mapCategory(o.category ?? o.categoryName, traces, "category");
  const supplier = mapSupplier(o.supplier ?? o.shop_name, traces, "supplier");
  const brand = mapBrand(o.brand, traces, "brand");
  const attributes = mapAttributes(o.attributes, traces);
  const variants = mapVariants(o.variants ?? o.skus, ctx);

  collectIgnoredFields(o, ctx.usedPaths, traces);

  const product: UniversalProduct = {
    id: createUniversalId("mock", providerProductId),
    provider: "mock",
    providerProductId,
    title,
    subtitle: normalizeString(o.titleEn) || undefined,
    description: normalizeString(o.description) || undefined,
    brand,
    category,
    supplier,
    currency: normalizeCurrency(o.currency, "CNY"),
    basePrice,
    salePrice,
    weight: normalizeNumber(o.weight) ?? undefined,
    stockStatus: inferStockStatus(normalizeNumber(o.stock)),
    minimumOrder: normalizeNumber(o.moq) ?? undefined,
    unit: normalizeUnit(o.unit),
    status: "active",
    images,
    videos: [],
    variants,
    attributes,
    rawData: raw,
  };

  return { product, validation: validateProduct(product, traces), traces };
}

function mapGenericProduct(provider: ProviderId, raw: unknown): MappingResult {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const traces: FieldTrace[] = [];
  const providerProductId = String(o.id ?? o.product_id ?? "unknown");

  const product: UniversalProduct = {
    id: createUniversalId(provider, providerProductId),
    provider,
    providerProductId,
    title: normalizeString(o.title) || providerProductId,
    currency: normalizeCurrency(o.currency),
    basePrice: normalizePrice(o.price) ?? 0,
    stockStatus: "unknown",
    status: "unknown",
    images: mapImages(o.images ?? o.img_url, traces),
    videos: [],
    variants: [],
    attributes: [],
    rawData: raw,
  };

  return { product, validation: validateProduct(product, traces), traces };
}

export { mapVariants as mapVariant } from "./VariantMapper";
export { mapBrand } from "./BrandMapper";
export { mapCategory } from "./CategoryMapper";
export { mapSupplier } from "./SupplierMapper";
export { mapImages } from "./ImageMapper";
