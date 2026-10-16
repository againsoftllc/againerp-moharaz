import type { Brand } from "@/lib/mock-data/brands";

/** Raw brand shape from FastAPI `/api/v1/catalog/brands`. */
export type ApiCatalogBrand = {
  id: string;
  company_id: string;
  name: string;
  slug: string;
  sort_order: number;
  product_count: number;
  is_active: boolean;
  description: string | null;
  website: string | null;
  meta_title: string | null;
  meta_description: string | null;
  meta_keywords: string | null;
  logo_url: string | null;
  banner_url: string | null;
  logo_media_id: string | null;
  banner_media_id: string | null;
  channel?: "catalog" | "dropshipping";
  created_at: string;
  updated_at: string;
};

export type ApiBrandListResponse = {
  data: ApiCatalogBrand[];
  meta: { count: number };
  errors: string[];
};

export type ApiBrandResponse = {
  data: ApiCatalogBrand;
  errors: string[];
};

export function apiBrandToBrand(row: ApiCatalogBrand): Brand {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    sortOrder: row.sort_order,
    productCount: row.product_count,
    active: row.is_active,
    updatedAt: row.updated_at.slice(0, 10),
    description: row.description ?? undefined,
    websiteUrl: row.website ?? undefined,
    metaTitle: row.meta_title ?? undefined,
    metaDescription: row.meta_description ?? undefined,
    metaKeywords: row.meta_keywords ?? undefined,
    logoUrl: row.logo_url ?? undefined,
    bannerUrl: row.banner_url ?? undefined,
    logoMediaId: row.logo_media_id ?? undefined,
    bannerMediaId: row.banner_media_id ?? undefined,
    channel: row.channel === "dropshipping" ? "dropshipping" : "catalog",
  };
}

export type CreateCatalogBrandInput = {
  name: string;
  slug: string;
  active?: boolean;
  description?: string;
  websiteUrl?: string;
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
  logoUrl?: string;
  bannerUrl?: string;
  logoMediaId?: string;
  bannerMediaId?: string;
  channel?: "catalog" | "dropshipping";
};

export type UpdateCatalogBrandInput = Partial<CreateCatalogBrandInput>;

function brandInputToApiPayload(input: CreateCatalogBrandInput | UpdateCatalogBrandInput) {
  const payload: Record<string, unknown> = {};
  if ("name" in input && input.name !== undefined) payload.name = input.name;
  if ("slug" in input && input.slug !== undefined) payload.slug = input.slug;
  if ("active" in input && input.active !== undefined) payload.is_active = input.active;
  if ("description" in input && input.description !== undefined) {
    payload.description = input.description;
  }
  if ("websiteUrl" in input && input.websiteUrl !== undefined) payload.website = input.websiteUrl;
  if ("metaTitle" in input && input.metaTitle !== undefined) payload.meta_title = input.metaTitle;
  if ("metaDescription" in input && input.metaDescription !== undefined) {
    payload.meta_description = input.metaDescription;
  }
  if ("metaKeywords" in input && input.metaKeywords !== undefined) {
    payload.meta_keywords = input.metaKeywords;
  }
  if ("logoUrl" in input && input.logoUrl !== undefined) payload.logo_url = input.logoUrl;
  if ("bannerUrl" in input && input.bannerUrl !== undefined) payload.banner_url = input.bannerUrl;
  if ("logoMediaId" in input && input.logoMediaId !== undefined) {
    payload.logo_media_id = input.logoMediaId;
  }
  if ("bannerMediaId" in input && input.bannerMediaId !== undefined) {
    payload.banner_media_id = input.bannerMediaId;
  }
  if ("channel" in input && input.channel !== undefined) {
    payload.channel = input.channel;
  }
  return payload;
}

export function brandToApiCreatePayload(input: CreateCatalogBrandInput) {
  return brandInputToApiPayload(input);
}

export function brandToApiUpdatePayload(input: UpdateCatalogBrandInput) {
  return brandInputToApiPayload(input);
}

export function partialBrandToApiUpdate(data: Partial<Brand>): UpdateCatalogBrandInput {
  const input: UpdateCatalogBrandInput = {};
  if (data.name !== undefined) input.name = data.name;
  if (data.slug !== undefined) input.slug = data.slug;
  if (data.active !== undefined) input.active = data.active;
  if (data.description !== undefined) input.description = data.description;
  if (data.websiteUrl !== undefined) input.websiteUrl = data.websiteUrl;
  if (data.metaTitle !== undefined) input.metaTitle = data.metaTitle;
  if (data.metaDescription !== undefined) input.metaDescription = data.metaDescription;
  if (data.metaKeywords !== undefined) input.metaKeywords = data.metaKeywords;
  if (data.logoUrl !== undefined) input.logoUrl = data.logoUrl;
  if (data.bannerUrl !== undefined) input.bannerUrl = data.bannerUrl;
  if (data.logoMediaId !== undefined) input.logoMediaId = data.logoMediaId;
  if (data.bannerMediaId !== undefined) input.bannerMediaId = data.bannerMediaId;
  if (data.channel !== undefined) input.channel = data.channel;
  return input;
}
