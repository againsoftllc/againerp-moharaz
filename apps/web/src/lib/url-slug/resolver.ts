import { brandsSeed, getBrandBySlug } from "@/lib/mock-data/brands";
// getBrandBySlug added in brands.ts
import { categoriesFlat, getCategoryBySlug } from "@/lib/mock-data/categories";
import { getCmsPageBySlug } from "@/lib/mock-data/cms-pages";
import { getProductBySlug, products } from "@/lib/mock-data/products";
import { isReservedSlug } from "@/lib/url-slug/reserved-slugs";
import type { ResolvedStorefrontSlug } from "@/lib/url-slug/types";

export function normalizeSlug(input: string) {
  return decodeURIComponent(input).trim().toLowerCase();
}

export function resolveStorefrontSlug(rawSlug: string): ResolvedStorefrontSlug | null {
  const slug = normalizeSlug(rawSlug);
  if (!slug || isReservedSlug(slug)) return null;

  const page = getCmsPageBySlug(slug);
  if (page) return { type: "page", slug: page.slug, page };

  const category = getCategoryBySlug(slug, categoriesFlat);
  if (category?.active) return { type: "category", slug: category.slug, category };

  const brand = getBrandBySlug(slug) ?? brandsSeed.find((b) => b.slug === slug && b.active);
  if (brand?.active) return { type: "brand", slug: brand.slug, brand };

  const product = getProductBySlug(slug);
  if (product?.status === "published") return { type: "product", slug: product.slug, product };

  return null;
}

export function isSlugTaken(slug: string, exclude?: { id: string }) {
  const normalized = normalizeSlug(slug);
  if (!normalized || isReservedSlug(normalized)) return true;

  if (getCmsPageBySlug(normalized)) return true;
  if (categoriesFlat.some((c) => c.slug === normalized && c.id !== exclude?.id)) return true;
  if (brandsSeed.some((b) => b.slug === normalized && b.id !== exclude?.id)) return true;
  if (products.some((p) => p.slug === normalized && p.id !== exclude?.id)) return true;

  return false;
}
