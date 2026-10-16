import {
  type ApiBrandListResponse,
  type ApiBrandResponse,
  brandToApiCreatePayload,
} from "@/lib/api/catalog-brands";
import {
  type ApiCategoryListResponse,
  type ApiCategoryResponse,
  categoryToApiCreatePayload,
} from "@/lib/api/catalog-categories";
import {
  type ApiProductDetailResponse,
  productToApiPayload,
} from "@/lib/api/catalog-products";
import { consumerAuthorizedFetch } from "@/lib/commerce/catalog-consumer-server";

export type ErpProgressCallback = (message: string, percent: number) => void;

export type ErpProductCreateResult = {
  productId: string;
  sku: string;
  name: string;
  slug: string;
  brandId: string | null;
  categoryId: string | null;
  imagesUploaded: number;
  attributesStored: number;
  summary: Record<string, unknown>;
};

type CanonicalProduct = Record<string, unknown>;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function imageUrlsFromCanonical(canonical: CanonicalProduct): string[] {
  const raw = [...((canonical.images as Array<{ url?: string }>) ?? []), ...((canonical.gallery as Array<{ url?: string }>) ?? [])];
  const urls = raw.map((item) => (typeof item === "string" ? item : item.url)).filter(Boolean) as string[];
  return [...new Set(urls)];
}

function specificationGroups(canonical: CanonicalProduct): Array<{ group?: string; items?: Array<{ label?: string; value?: string }> }> {
  const specs = canonical.specifications;
  return Array.isArray(specs) ? specs : [];
}

function specsToCustomJson(canonical: CanonicalProduct): string {
  const rows = specificationGroups(canonical).flatMap((group) =>
    (group.items ?? []).map((item) => ({
      group: group.group ?? "Specifications",
      field: item.label ?? "Field",
      value: item.value ?? "",
    })),
  );
  if (rows.length) return JSON.stringify(rows);
  const attrs = (canonical.attributes as Array<{ group?: string; name?: string; value?: string }>) ?? [];
  if (attrs.length) {
    return JSON.stringify(
      attrs.map((row) => ({
        group: row.group ?? "Attributes",
        field: row.name ?? "Field",
        value: row.value ?? "",
      })),
    );
  }
  return "[]";
}

async function uniqueProductSlug(base: string, authorization: string): Promise<string> {
  const root = slugify(base) || "product";
  let candidate = root;
  let n = 2;
  while (true) {
    const check = await consumerAuthorizedFetch<{ available: boolean }>(
      `/api/v1/catalog/products/slug/check?slug=${encodeURIComponent(candidate)}`,
      authorization,
    );
    if (check.available) return candidate;
    candidate = `${root}-${n}`;
    n += 1;
  }
}

function generateSku(canonical: CanonicalProduct, slug: string): string {
  const fromCanonical = typeof canonical.sku === "string" ? canonical.sku.trim() : "";
  if (fromCanonical) return fromCanonical.slice(0, 64);
  const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${slug.slice(0, 24).toUpperCase().replace(/-/g, "")}-${suffix}`;
}

async function resolveOrCreateBrand(
  brandName: string,
  authorization: string,
  onProgress: ErpProgressCallback,
): Promise<{ brandId: string; brandName: string; created: boolean }> {
  onProgress(`Checking Brand... (${brandName})`, 15);
  const list = await consumerAuthorizedFetch<ApiBrandListResponse>("/api/v1/catalog/brands", authorization);
  const existing = list.data.find((row) => row.name.toLowerCase() === brandName.toLowerCase());
  if (existing) {
    return { brandId: existing.id, brandName: existing.name, created: false };
  }

  onProgress(`Checking Brand... creating ${brandName}`, 20);
  const slug = slugify(brandName) || "brand";
  const created = await consumerAuthorizedFetch<ApiBrandResponse>(
    "/api/v1/catalog/brands",
    authorization,
    {
      method: "POST",
      body: JSON.stringify(
        brandToApiCreatePayload({
          name: brandName,
          slug,
          active: true,
        }),
      ),
    },
  );
  return { brandId: created.data.id, brandName: created.data.name, created: true };
}

async function resolveOrCreateCategoryPath(
  path: string[],
  authorization: string,
  onProgress: ErpProgressCallback,
): Promise<{ categoryId: string | null; categoryName: string | null; createdCount: number }> {
  if (!path.length) {
    onProgress("Checking Category... (none detected)", 30);
    return { categoryId: null, categoryName: null, createdCount: 0 };
  }

  onProgress(`Checking Category... (${path.join(" › ")})`, 30);
  const list = await consumerAuthorizedFetch<ApiCategoryListResponse>(
    "/api/v1/catalog/categories",
    authorization,
  );
  const categories = [...list.data];
  let parentId: string | null = null;
  let leafId: string | null = null;
  let leafName: string | null = null;
  let createdCount = 0;

  for (const segment of path) {
    const match = categories.find(
      (row) => row.name.toLowerCase() === segment.toLowerCase() && row.parent_id === parentId,
    );
    if (match) {
      parentId = match.id;
      leafId = match.id;
      leafName = match.name;
      continue;
    }

    const slugBase = slugify(segment) || "category";
    let slug = slugBase;
    let suffix = 2;
    while (categories.some((row) => row.slug === slug)) {
      slug = `${slugBase}-${suffix}`;
      suffix += 1;
    }

    onProgress(`Checking Category... creating ${segment}`, 35);
    const created: ApiCategoryResponse = await consumerAuthorizedFetch<ApiCategoryResponse>(
      "/api/v1/catalog/categories",
      authorization,
      {
        method: "POST",
        body: JSON.stringify(
          categoryToApiCreatePayload({
            name: segment,
            slug,
            parentId,
            active: true,
          }),
        ),
      },
    );
    categories.push(created.data);
    parentId = created.data.id;
    leafId = created.data.id;
    leafName = created.data.name;
    createdCount += 1;
  }

  return { categoryId: leafId, categoryName: leafName, createdCount };
}

async function storeAttributes(
  canonical: CanonicalProduct,
  onProgress: ErpProgressCallback,
): Promise<{ customSpecsJson: string; attributeCount: number }> {
  const groups = specificationGroups(canonical);
  const attributeCount =
    groups.reduce((sum, group) => sum + (group.items?.length ?? 0), 0) +
    (((canonical.attributes as unknown[]) ?? []).length || 0);
  onProgress(`Checking Attributes... (${attributeCount} fields)`, 45);
  return { customSpecsJson: specsToCustomJson(canonical), attributeCount };
}

async function uploadProductImages(
  canonical: CanonicalProduct,
  productName: string,
  authorization: string,
  onProgress: ErpProgressCallback,
): Promise<string[]> {
  const urls = imageUrlsFromCanonical(canonical);
  onProgress(`Upload Images... (${urls.length} images)`, 60);
  if (!urls.length) return [];

  try {
    const imported = await consumerAuthorizedFetch<{
      items: Array<{ id: string }>;
    }>("/api/v1/catalog/ai/import-images", authorization, {
      method: "POST",
      body: JSON.stringify({
        urls,
        alt_prefix: productName,
      }),
    });
    return imported.items.map((item) => item.id);
  } catch (err) {
    // Live API may not have /catalog/ai/import-images yet — still create the draft product.
    const message = err instanceof Error ? err.message : "image import failed";
    const status = typeof err === "object" && err && "status" in err ? Number((err as { status: number }).status) : 0;
    if (status === 404 || /not found/i.test(message)) {
      onProgress("Upload Images... skipped (import-images API not available yet)", 65);
      return [];
    }
    throw err;
  }
}

/** Persists a Center canonical product into AgainERP catalog (brand → category → specs → images → product). */
export async function createProductFromCanonical(
  canonical: CanonicalProduct,
  authorization: string,
  onProgress: ErpProgressCallback = () => undefined,
): Promise<ErpProductCreateResult> {
  const name = (typeof canonical.name === "string" && canonical.name.trim()) || "Untitled product";
  const brandName =
    ((canonical.brand as { name?: string } | undefined)?.name as string | undefined)?.trim() ||
    undefined;
  const categoryPath =
    ((canonical.category as { path?: string[] } | undefined)?.path as string[] | undefined) ??
    [];

  let brandId: string | null = null;
  let brandCreated = false;
  if (brandName) {
    const brand = await resolveOrCreateBrand(brandName, authorization, onProgress);
    brandId = brand.brandId;
    brandCreated = brand.created;
  } else {
    onProgress("Checking Brand... (none detected)", 15);
  }

  const category = await resolveOrCreateCategoryPath(categoryPath, authorization, onProgress);
  const attributes = await storeAttributes(canonical, onProgress);

  const slug = await uniqueProductSlug((typeof canonical.slug === "string" && canonical.slug) || name, authorization);
  const sku = generateSku(canonical, slug);
  const priceAmount = Number((canonical.price as { amount?: number } | undefined)?.amount ?? 0);
  const compareAt = (canonical.metadata as { extensions?: { compareAtPrice?: { amount?: number } } } | undefined)
    ?.extensions?.compareAtPrice?.amount;

  const mediaIds = await uploadProductImages(canonical, name, authorization, onProgress);

  onProgress("Creating Product...", 82);
  const created = await consumerAuthorizedFetch<ApiProductDetailResponse>(
    "/api/v1/catalog/products",
    authorization,
    {
      method: "POST",
      body: JSON.stringify(
        productToApiPayload({
          name,
          slug,
          sku,
          price: Number.isFinite(priceAmount) ? priceAmount : 0,
          compare_at_price: compareAt,
          status: "draft",
          visibility: "private",
          brand: brandName,
          brand_id: brandId,
          category: category.categoryName ?? undefined,
          category_id: category.categoryId,
          description: (canonical.description as string | undefined) ?? "",
          short_description: (canonical.shortDescription as string | undefined) ?? "",
          seo_title: ((canonical.seo as { title?: string } | undefined)?.title as string | undefined) ?? undefined,
          seo_description:
            ((canonical.seo as { description?: string } | undefined)?.description as string | undefined) ?? undefined,
          warranty: ((canonical.warranty as { duration?: string } | undefined)?.duration as string | undefined) ?? null,
          custom_specs_json: attributes.customSpecsJson,
        }),
      ),
    },
  );

  const productId = created.data.id;
  if (mediaIds.length) {
    await consumerAuthorizedFetch(`/api/v1/catalog/products/${productId}/media`, authorization, {
      method: "PUT",
      body: JSON.stringify({ media_ids: mediaIds }),
    });
  }

  onProgress("Product created successfully.", 100);

  return {
    productId,
    sku: created.data.sku,
    name: created.data.name,
    slug: created.data.slug,
    brandId,
    categoryId: category.categoryId,
    imagesUploaded: mediaIds.length,
    attributesStored: attributes.attributeCount,
    summary: {
      name: created.data.name,
      sku: created.data.sku,
      productId,
      brand: brandName,
      brandCreated,
      categoryPath,
      categoriesCreated: category.createdCount,
      imagesUploaded: mediaIds.length,
      attributesStored: attributes.attributeCount,
    },
  };
}
