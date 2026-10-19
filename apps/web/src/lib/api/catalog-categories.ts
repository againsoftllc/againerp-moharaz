import type { Category } from "@/lib/mock-data/categories";

/** Raw category shape from FastAPI `/api/v1/catalog/categories`. */
export type ApiCatalogCategory = {
  id: string;
  company_id: string;
  parent_id: string | null;
  path: string;
  depth: number;
  name: string;
  caption: string;
  slug: string;
  sort_order: number;
  product_count: number;
  is_active: boolean;
  show_in_top_menu: boolean;
  description: string | null;
  meta_title: string | null;
  meta_description: string | null;
  meta_keywords: string | null;
  show_price_comparison?: boolean;
  icon_url: string | null;
  banner_url: string | null;
  icon_media_id: string | null;
  banner_media_id: string | null;
  china_search_keyword?: string | null;
  channel?: "catalog" | "dropshipping";
  updated_by_name?: string | null;
  created_at: string;
  updated_at: string;
};

export type ApiCategoryListResponse = {
  data: ApiCatalogCategory[];
  meta: { count: number };
  errors: string[];
};

export type ApiCategoryResponse = {
  data: ApiCatalogCategory;
  errors: string[];
};

export function apiCategoryToCategory(row: ApiCatalogCategory): Category {
  return {
    id: row.id,
    name: row.name,
    caption: row.caption || row.name,
    slug: row.slug,
    parentId: row.parent_id,
    sortOrder: row.sort_order,
    productCount: row.product_count,
    active: row.is_active,
    showInTopMenu: row.show_in_top_menu,
    showPriceComparison: row.show_price_comparison !== false,
    updatedAt: row.updated_at.slice(0, 10),
    updatedBy: row.updated_by_name ?? undefined,
    description: row.description ?? undefined,
    metaTitle: row.meta_title ?? undefined,
    metaDescription: row.meta_description ?? undefined,
    metaKeywords: row.meta_keywords ?? undefined,
    iconUrl: row.icon_url ?? undefined,
    bannerUrl: row.banner_url ?? undefined,
    iconMediaId: row.icon_media_id ?? undefined,
    bannerMediaId: row.banner_media_id ?? undefined,
    chinaSearchKeyword: row.china_search_keyword ?? undefined,
    channel: row.channel === "dropshipping" ? "dropshipping" : "catalog",
  };
}

export type CreateCatalogCategoryInput = {
  name: string;
  caption?: string;
  slug?: string;
  parentId?: string | null;
  active?: boolean;
  showInTopMenu?: boolean;
  showPriceComparison?: boolean;
  description?: string;
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
  iconUrl?: string;
  bannerUrl?: string;
  iconMediaId?: string;
  bannerMediaId?: string;
  chinaSearchKeyword?: string;
  channel?: "catalog" | "dropshipping";
};

export type UpdateCatalogCategoryInput = Partial<CreateCatalogCategoryInput>;

function categoryInputToApiPayload(input: CreateCatalogCategoryInput | UpdateCatalogCategoryInput) {
  const payload: Record<string, unknown> = {};
  if ("name" in input && input.name !== undefined) payload.name = input.name;
  if ("caption" in input && input.caption !== undefined) payload.caption = input.caption;
  if ("slug" in input && input.slug !== undefined) payload.slug = input.slug;
  if ("parentId" in input && input.parentId !== undefined) payload.parent_id = input.parentId;
  if ("active" in input && input.active !== undefined) payload.is_active = input.active;
  if ("showInTopMenu" in input && input.showInTopMenu !== undefined) {
    payload.show_in_top_menu = input.showInTopMenu;
  }
  if ("showPriceComparison" in input && input.showPriceComparison !== undefined) {
    payload.show_price_comparison = input.showPriceComparison;
  }
  if ("description" in input && input.description !== undefined) {
    payload.description = input.description;
  }
  if ("metaTitle" in input && input.metaTitle !== undefined) payload.meta_title = input.metaTitle;
  if ("metaDescription" in input && input.metaDescription !== undefined) {
    payload.meta_description = input.metaDescription;
  }
  if ("metaKeywords" in input && input.metaKeywords !== undefined) {
    payload.meta_keywords = input.metaKeywords;
  }
  if ("iconUrl" in input && input.iconUrl !== undefined) payload.icon_url = input.iconUrl;
  if ("bannerUrl" in input && input.bannerUrl !== undefined) payload.banner_url = input.bannerUrl;
  if ("iconMediaId" in input && input.iconMediaId !== undefined) {
    payload.icon_media_id = input.iconMediaId;
  }
  if ("bannerMediaId" in input && input.bannerMediaId !== undefined) {
    payload.banner_media_id = input.bannerMediaId;
  }
  if ("chinaSearchKeyword" in input && input.chinaSearchKeyword !== undefined) {
    payload.china_search_keyword = input.chinaSearchKeyword || null;
  }
  if ("channel" in input && input.channel !== undefined) {
    payload.channel = input.channel;
  }
  return payload;
}

export function categoryToApiCreatePayload(input: CreateCatalogCategoryInput) {
  return categoryInputToApiPayload(input);
}

export function categoryToApiUpdatePayload(input: UpdateCatalogCategoryInput) {
  return categoryInputToApiPayload(input);
}

export function partialCategoryToApiUpdate(data: Partial<Category>): UpdateCatalogCategoryInput {
  const input: UpdateCatalogCategoryInput = {};
  if (data.name !== undefined) input.name = data.name;
  if (data.caption !== undefined) input.caption = data.caption;
  if (data.slug !== undefined) input.slug = data.slug;
  if (data.parentId !== undefined) input.parentId = data.parentId;
  if (data.active !== undefined) input.active = data.active;
  if (data.showInTopMenu !== undefined) input.showInTopMenu = data.showInTopMenu;
  if (data.showPriceComparison !== undefined) {
    input.showPriceComparison = data.showPriceComparison;
  }
  if (data.description !== undefined) input.description = data.description;
  if (data.metaTitle !== undefined) input.metaTitle = data.metaTitle;
  if (data.metaDescription !== undefined) input.metaDescription = data.metaDescription;
  if (data.metaKeywords !== undefined) input.metaKeywords = data.metaKeywords;
  if (data.iconUrl !== undefined) input.iconUrl = data.iconUrl;
  if (data.bannerUrl !== undefined) input.bannerUrl = data.bannerUrl;
  if (data.iconMediaId !== undefined) input.iconMediaId = data.iconMediaId;
  if (data.bannerMediaId !== undefined) input.bannerMediaId = data.bannerMediaId;
  if (data.chinaSearchKeyword !== undefined) input.chinaSearchKeyword = data.chinaSearchKeyword;
  if (data.channel !== undefined) input.channel = data.channel;
  return input;
}
