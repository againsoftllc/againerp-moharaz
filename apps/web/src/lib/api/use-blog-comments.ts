"use client";

import { useCallback, useEffect, useState } from "react";
import type { BlogComment } from "@/lib/blog/blog-comment";
import {
  fetchBlogComments,
  updateBlogCommentStatus,
  type BlogCommentListParams,
  type BlogCommentStatus,
} from "@/lib/api/blog-comments";

type UseBlogCommentsState = {
  comments: BlogComment[];
  total: number;
  pendingCount: number;
  loading: boolean;
  error: string | null;
  refetch: (params?: BlogCommentListParams) => Promise<void>;
  setStatus: (id: string, status: BlogCommentStatus) => Promise<void>;
};

export function useBlogComments(initialParams?: BlogCommentListParams): UseBlogCommentsState {
  const [comments, setComments] = useState<BlogComment[]>([]);
  const [total, setTotal] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async (params?: BlogCommentListParams) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchBlogComments(params ?? initialParams);
      setComments(result.comments);
      setTotal(result.comments.length);
      setPendingCount(result.pendingCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load comments");
      setComments([]);
      setTotal(0);
      setPendingCount(0);
    } finally {
      setLoading(false);
    }
  }, [initialParams]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const setStatus = useCallback(async (id: string, status: BlogCommentStatus) => {
    const saved = await updateBlogCommentStatus(id, status);
    setComments((rows) => {
      const next = rows.map((row) => (row.id === id ? saved : row));
      setPendingCount(next.filter((row) => row.status === "pending").length);
      return next;
    });
  }, []);

  return { comments, total, pendingCount, loading, error, refetch, setStatus };
}
