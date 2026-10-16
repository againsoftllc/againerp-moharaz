/** Matches apps/api/app/models/catalog_product.py + ProductBase schema */
export const PRODUCT_FIELD_LIMITS = {
  name: 255,
  slug: 255,
  sku: 100,
  model: 200,
  seoTitle: 255,
  brand: 100,
  category: 100,
  thumbnail: 500,
  variantName: 255,
  variantSku: 100,
} as const;

export function truncateToLimit(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}
