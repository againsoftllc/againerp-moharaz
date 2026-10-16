import type { BlogComment, BlogCommentStatus } from "@/lib/blog/blog-comment";
import { apiFetch } from "@/lib/api/client";

export type ApiBlogComment = {
  id: string;
  company_id: string;
  post_id: string;
  article_title: string;
  author_name: string;
  author_email: string | null;
  body: string;
  status: BlogCommentStatus;
  parent_id: string | null;
  moderated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ApiBlogCommentListResponse = {
  data: ApiBlogComment[];
  meta: { count: number; pending_count: number };
  errors: string[];
};

export type ApiBlogCommentResponse = {
  data: ApiBlogComment;
  errors: string[];
};

export type BlogCommentListParams = {
  search?: string;
  status?: BlogCommentStatus;
};

export type UpdateBlogCommentInput = {
  status?: BlogCommentStatus;
  moderatedBy?: string;
};

export function apiBlogCommentToComment(row: ApiBlogComment): BlogComment {
  return {
    id: row.id,
    postId: row.post_id,
    articleTitle: row.article_title,
    authorName: row.author_name,
    authorEmail: row.author_email,
    body: row.body,
    status: row.status,
    parentId: row.parent_id,
    moderatedBy: row.moderated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function buildBlogCommentQuery(params?: BlogCommentListParams): string {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  if (params?.status) qs.set("status", params.status);
  const query = qs.toString();
  return query ? `?${query}` : "";
}

export async function fetchBlogComments(params?: BlogCommentListParams): Promise<{
  comments: BlogComment[];
  pendingCount: number;
}> {
  const res = await apiFetch<ApiBlogCommentListResponse>(
    `/api/v1/catalog/blog/comments${buildBlogCommentQuery(params)}`,
  );
  return {
    comments: res.data.map(apiBlogCommentToComment),
    pendingCount: res.meta.pending_count,
  };
}

export async function updateBlogCommentStatus(
  id: string,
  status: BlogCommentStatus,
  moderatedBy = "Admin",
): Promise<BlogComment> {
  const res = await apiFetch<ApiBlogCommentResponse>(`/api/v1/catalog/blog/comments/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status, moderated_by: moderatedBy }),
  });
  return apiBlogCommentToComment(res.data);
}
