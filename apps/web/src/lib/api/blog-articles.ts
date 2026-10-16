import type { BlogArticle, BlogArticleStatus, BlogRelatedProduct } from "@/lib/blog/blog-article";
import { apiFetch } from "@/lib/api/client";

export type ApiBlogRelatedProduct = {
  product_id: string;
  product_name: string;
  product_slug: string;
  sort_order: number;
};

export type ApiBlogArticle = {
  id: string;
  company_id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  status: BlogArticleStatus;
  category_id: string | null;
  category_name: string | null;
  author_name: string | null;
  cover_image_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
  related_product_count: number;
  related_products?: ApiBlogRelatedProduct[];
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ApiBlogArticleListResponse = {
  data: ApiBlogArticle[];
  meta: { count: number };
  errors: string[];
};

export type ApiBlogArticleResponse = {
  data: ApiBlogArticle;
  errors: string[];
};

export type CreateBlogArticleInput = {
  title: string;
  slug: string;
  excerpt?: string;
  content?: string;
  status?: BlogArticleStatus;
  categoryId?: string | null;
  categoryName?: string;
  authorName?: string;
  coverImageUrl?: string | null;
  seoTitle?: string;
  seoDescription?: string;
  relatedProductIds?: string[];
};

export type UpdateBlogArticleInput = Partial<CreateBlogArticleInput>;

function mapRelated(row: ApiBlogRelatedProduct): BlogRelatedProduct {
  return {
    productId: row.product_id,
    productName: row.product_name,
    productSlug: row.product_slug,
    sortOrder: row.sort_order,
  };
}

export function apiBlogArticleToArticle(row: ApiBlogArticle): BlogArticle {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt ?? "",
    content: row.content ?? "",
    status: row.status,
    categoryId: row.category_id,
    categoryName: row.category_name ?? "",
    authorName: row.author_name ?? "",
    coverImageUrl: row.cover_image_url,
    seoTitle: row.seo_title ?? "",
    seoDescription: row.seo_description ?? "",
    relatedProductCount: row.related_product_count,
    relatedProducts: (row.related_products ?? []).map(mapRelated),
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toApiPayload(input: CreateBlogArticleInput | UpdateBlogArticleInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (input.title !== undefined) payload.title = input.title;
  if (input.slug !== undefined) payload.slug = input.slug;
  if (input.excerpt !== undefined) payload.excerpt = input.excerpt;
  if (input.content !== undefined) payload.content = input.content;
  if (input.status !== undefined) payload.status = input.status;
  if (input.categoryId !== undefined) payload.category_id = input.categoryId;
  if (input.categoryName !== undefined) payload.category_name = input.categoryName;
  if (input.authorName !== undefined) payload.author_name = input.authorName;
  if (input.coverImageUrl !== undefined) payload.cover_image_url = input.coverImageUrl;
  if (input.seoTitle !== undefined) payload.seo_title = input.seoTitle;
  if (input.seoDescription !== undefined) payload.seo_description = input.seoDescription;
  if (input.relatedProductIds !== undefined) payload.related_product_ids = input.relatedProductIds;
  return payload;
}

export async function fetchBlogArticles(): Promise<BlogArticle[]> {
  const res = await apiFetch<ApiBlogArticleListResponse>("/api/v1/catalog/blog/articles");
  return res.data.map(apiBlogArticleToArticle);
}

export async function fetchBlogArticle(id: string): Promise<BlogArticle> {
  const res = await apiFetch<ApiBlogArticleResponse>(`/api/v1/catalog/blog/articles/${id}`);
  return apiBlogArticleToArticle(res.data);
}

export async function createBlogArticle(input: CreateBlogArticleInput): Promise<BlogArticle> {
  const res = await apiFetch<ApiBlogArticleResponse>("/api/v1/catalog/blog/articles", {
    method: "POST",
    body: JSON.stringify(toApiPayload(input)),
  });
  return apiBlogArticleToArticle(res.data);
}

export async function updateBlogArticle(id: string, input: UpdateBlogArticleInput): Promise<BlogArticle> {
  const res = await apiFetch<ApiBlogArticleResponse>(`/api/v1/catalog/blog/articles/${id}`, {
    method: "PATCH",
    body: JSON.stringify(toApiPayload(input)),
  });
  return apiBlogArticleToArticle(res.data);
}
