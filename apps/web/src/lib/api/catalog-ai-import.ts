import { apiFetch } from "@/lib/api/client";

export type ProductDraftSpecItem = { label: string; value: string };
export type ProductDraftSpecGroup = { group: string; items: ProductDraftSpecItem[] };

export type ProductDraft = {
  name: string;
  sku?: string | null;
  short_description?: string | null;
  description?: string | null;
  brand_name?: string | null;
  category_name?: string | null;
  price?: string | number | null;
  compare_at_price?: string | number | null;
  stock_status?: string | null;
  currency: string;
  warranty?: string | null;
  images: string[];
  specifications: ProductDraftSpecGroup[];
  tags: string[];
  seo_title?: string | null;
  seo_description?: string | null;
  source_url?: string | null;
  confidence_notes?: string | null;
};

export type CatalogAiExtractResponse = {
  draft: ProductDraft;
  matched_brand_id: string | null;
  matched_category_id: string | null;
  warnings: string[];
};

export async function extractProductFromUrl(url: string): Promise<CatalogAiExtractResponse> {
  return apiFetch<CatalogAiExtractResponse>("/api/v1/catalog/ai/import-from-url/extract", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

export type CatalogAiCreateResponse = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  status: string;
};

export async function createProductFromDraft(payload: {
  draft: ProductDraft;
  brand_id?: string | null;
  category_id?: string | null;
  create_brand_if_missing?: boolean;
  import_images?: boolean;
  status?: "draft" | "published";
}): Promise<CatalogAiCreateResponse> {
  return apiFetch<CatalogAiCreateResponse>("/api/v1/catalog/ai/import-from-url/create", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type FillFromSourceResult = {
  id: string;
  name: string;
  source_url: string;
  price: string | null;
  brand: string | null;
  category: string | null;
  images: number;
  images_reused: number;
  image_warnings: string[];
  status: string;
};

/** Fill a draft product from its own source URL — the AI chat's product-link import, applied to the existing row. */
export async function fillProductFromSource(productId: string): Promise<FillFromSourceResult> {
  return apiFetch<FillFromSourceResult>(`/api/v1/catalog/ai/products/${encodeURIComponent(productId)}/fill-from-source`, {
    method: "POST",
  });
}

export type SimpleCategory = { id: string; name: string };

export async function fetchSimpleCategories(): Promise<SimpleCategory[]> {
  const res = await apiFetch<{ data: SimpleCategory[] }>("/api/v1/catalog/categories");
  return res.data;
}

export type SpecFillField = {
  id: string;
  name: string;
  group: string;
  options: string[];
  unit?: string | null;
  /** Storefront filter — the server tries hardest to land these on an option. */
  filterable?: boolean;
};

export type SpecFillResult = {
  url: string;
  source_count: number;
  /** field id → value from the source page */
  values: Record<string, string>;
  /** field id → source value that is not one of the field's dropdown options */
  off_options: Record<string, string>;
};

/** Product editor → Specifications → Fill: map a source page's spec table onto the editor's fields. Read-only. */
export function fillSpecsFromSource(url: string, fields: SpecFillField[]): Promise<SpecFillResult> {
  return apiFetch<SpecFillResult>("/api/v1/catalog/ai/spec-fill", {
    method: "POST",
    body: JSON.stringify({ url, fields }),
  });
}

/** What the AI collected from a draft's source page, shown as a review card in the product drawer before anything is saved. */
export type FillReview = {
  product: { id: string; name: string; source_url?: string | null };
  title: { current: string; new: string };
  images: string[];
  price: number | null;
  compare_at_price: number | null;
  stock_status: string;
  warranty?: string | null;
  origin?: string | null;
  brand: { name?: string | null; matched_id?: string | null };
  categories: { name?: string | null; matched_ids: string[]; is_new: boolean; new_level?: string | null };
  profile: {
    status: "existing" | "new" | "none";
    matched_id?: string | null;
    matched_name?: string | null;
    attributes: number;
    source_filters: number;
    key_feature_filters: string[];
  };
  tags: string[];
  short_description: string[];
  description_words: number;
  description_excerpt: string;
  warnings: string[];
  /** values the admin dictated in the chat while this review was open (merged over the scraped data) */
  overrides?: Record<string, string | number>;
};

export type FillApproval = {
  brandId?: string;
  categoryIds: string[];
  /** an existing profile id, "new" (create from the source) or "none" */
  profileId?: string;
};

/** The review card's Accept: fill the draft with the admin's approved category / brand / specification profile. */
export async function applyFillFromSource(productId: string, a: FillApproval): Promise<FillFromSourceResult> {
  return apiFetch<FillFromSourceResult>(`/api/v1/catalog/ai/products/${encodeURIComponent(productId)}/fill-from-source/apply`, {
    method: "POST",
    body: JSON.stringify({ brand_id: a.brandId || null, category_ids: a.categoryIds, profile_id: a.profileId || null }),
  });
}
