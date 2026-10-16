import type { BlogCategory, BlogCategoryStatus } from "@/lib/blog/blog-category";
import { apiFetch } from "@/lib/api/client";

export type ApiBlogCategoryRelatedArticle = {
  post_id: string;
  post_title: string;
  post_slug: string;
  sort_order: number;
};

export type ApiBlogCategory = {
  id: string;
  company_id: string;
  name: string;
  slug: string;
  description: string | null;
  status: BlogCategoryStatus;
  sort_order: number;
  parent_id: string | null;
  cover_image_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
  article_count: number;
  related_article_count: number;
  related_articles: ApiBlogCategoryRelatedArticle[];
  created_at: string;
  updated_at: string;
};

export type ApiBlogCategoryListResponse = {
  data: ApiBlogCategory[];
  meta: { count: number };
  errors: string[];
};

export type ApiBlogCategoryResponse = {
  data: ApiBlogCategory;
  errors: string[];
};

export type CreateBlogCategoryInput = {
  name: string;
  slug: string;
  description?: string;
  status?: BlogCategoryStatus;
  sortOrder?: number;
  parentId?: string | null;
  coverImageUrl?: string | null;
  seoTitle?: string;
  seoDescription?: string;
  relatedArticleIds?: string[];
};

export type UpdateBlogCategoryInput = Partial<CreateBlogCategoryInput>;

export function apiBlogCategoryToCategory(row: ApiBlogCategory): BlogCategory {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? "",
    status: row.status,
    sortOrder: row.sort_order,
    parentId: row.parent_id ?? null,
    coverImageUrl: row.cover_image_url ?? null,
    seoTitle: row.seo_title ?? "",
    seoDescription: row.seo_description ?? "",
    relatedArticleIds: row.related_articles?.map((item) => item.post_id) ?? [],
    articleCount: row.article_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toApiPayload(input: CreateBlogCategoryInput | UpdateBlogCategoryInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.slug !== undefined) payload.slug = input.slug;
  if (input.description !== undefined) payload.description = input.description;
  if (input.status !== undefined) payload.status = input.status;
  if (input.sortOrder !== undefined) payload.sort_order = input.sortOrder;
  if (input.parentId !== undefined) payload.parent_id = input.parentId;
  if (input.coverImageUrl !== undefined) payload.cover_image_url = input.coverImageUrl;
  if (input.seoTitle !== undefined) payload.seo_title = input.seoTitle;
  if (input.seoDescription !== undefined) payload.seo_description = input.seoDescription;
  if (input.relatedArticleIds !== undefined) payload.related_article_ids = input.relatedArticleIds;
  return payload;
}

export async function fetchBlogCategories(): Promise<BlogCategory[]> {
  const res = await apiFetch<ApiBlogCategoryListResponse>("/api/v1/catalog/blog/categories");
  return res.data.map(apiBlogCategoryToCategory);
}

export async function fetchBlogCategory(id: string): Promise<BlogCategory> {
  const res = await apiFetch<ApiBlogCategoryResponse>(`/api/v1/catalog/blog/categories/${id}`);
  return apiBlogCategoryToCategory(res.data);
}

export async function createBlogCategory(input: CreateBlogCategoryInput): Promise<BlogCategory> {
  const res = await apiFetch<ApiBlogCategoryResponse>("/api/v1/catalog/blog/categories", {
    method: "POST",
    body: JSON.stringify(toApiPayload(input)),
  });
  return apiBlogCategoryToCategory(res.data);
}

export async function updateBlogCategory(
  id: string,
  input: UpdateBlogCategoryInput,
): Promise<BlogCategory> {
  const res = await apiFetch<ApiBlogCategoryResponse>(`/api/v1/catalog/blog/categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(toApiPayload(input)),
  });
  return apiBlogCategoryToCategory(res.data);
}
