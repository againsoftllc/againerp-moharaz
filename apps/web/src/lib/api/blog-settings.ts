import type { BlogSettings, BlogSettingsInput } from "@/lib/blog/blog-settings";
import { apiFetch } from "@/lib/api/client";

export type ApiBlogSettings = {
  id: string;
  company_id: string;
  enabled: boolean;
  posts_per_page: number;
  comments_enabled: boolean;
  moderate_comments: boolean;
  rss_enabled: boolean;
  rss_items_limit: number;
  default_author: string;
  show_related_products: boolean;
  seo_index_blog: boolean;
  blog_base_slug: string;
  created_at: string;
  updated_at: string;
};

export type ApiBlogSettingsResponse = {
  data: ApiBlogSettings;
  errors: string[];
};

export function apiBlogSettingsToSettings(row: ApiBlogSettings): BlogSettings {
  return {
    id: row.id,
    enabled: row.enabled,
    postsPerPage: row.posts_per_page,
    commentsEnabled: row.comments_enabled,
    moderateComments: row.moderate_comments,
    rssEnabled: row.rss_enabled,
    rssItemsLimit: row.rss_items_limit,
    defaultAuthor: row.default_author,
    showRelatedProducts: row.show_related_products,
    seoIndexBlog: row.seo_index_blog,
    blogBaseSlug: row.blog_base_slug,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toApiPayload(input: BlogSettingsInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (input.enabled !== undefined) payload.enabled = input.enabled;
  if (input.postsPerPage !== undefined) payload.posts_per_page = input.postsPerPage;
  if (input.commentsEnabled !== undefined) payload.comments_enabled = input.commentsEnabled;
  if (input.moderateComments !== undefined) payload.moderate_comments = input.moderateComments;
  if (input.rssEnabled !== undefined) payload.rss_enabled = input.rssEnabled;
  if (input.rssItemsLimit !== undefined) payload.rss_items_limit = input.rssItemsLimit;
  if (input.defaultAuthor !== undefined) payload.default_author = input.defaultAuthor;
  if (input.showRelatedProducts !== undefined) payload.show_related_products = input.showRelatedProducts;
  if (input.seoIndexBlog !== undefined) payload.seo_index_blog = input.seoIndexBlog;
  if (input.blogBaseSlug !== undefined) payload.blog_base_slug = input.blogBaseSlug;
  return payload;
}

export async function fetchBlogSettings(): Promise<BlogSettings> {
  const res = await apiFetch<ApiBlogSettingsResponse>("/api/v1/catalog/blog/settings");
  return apiBlogSettingsToSettings(res.data);
}

export async function updateBlogSettings(input: BlogSettingsInput): Promise<BlogSettings> {
  const res = await apiFetch<ApiBlogSettingsResponse>("/api/v1/catalog/blog/settings", {
    method: "PATCH",
    body: JSON.stringify(toApiPayload(input)),
  });
  return apiBlogSettingsToSettings(res.data);
}
