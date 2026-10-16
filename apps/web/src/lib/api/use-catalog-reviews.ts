"use client";

import { useCallback, useEffect, useState } from "react";
import type { Review, ReviewStatus } from "@/lib/mock-data/reviews";
import { apiFetch } from "@/lib/api/client";
import { createSoftListCache } from "@/lib/api/soft-list-cache";
import {
  apiProductReviewToReview,
  buildReviewQuery,
  productReviewCreateToApiPayload,
  productReviewUpdateToApiPayload,
  type ApiProductReviewListResponse,
  type ApiProductReviewResponse,
  type CreateProductReviewInput,
  type ReviewListParams,
  type UpdateProductReviewInput,
} from "@/lib/api/catalog-reviews";

type UseCatalogReviewsState = {
  reviews: Review[];
  total: number;
  pendingCount: number;
  loading: boolean;
  error: string | null;
  refetch: (params?: ReviewListParams) => Promise<void>;
};

const reviewListCache = createSoftListCache<Review>();

function cacheKey(params?: ReviewListParams) {
  return buildReviewQuery(params) || "default";
}

export function useCatalogReviews(initialParams?: ReviewListParams): UseCatalogReviewsState {
  const key = cacheKey(initialParams);
  const seeded = reviewListCache.get(key);
  const [reviews, setReviews] = useState<Review[]>(seeded?.items ?? []);
  const [total, setTotal] = useState(seeded?.total ?? 0);
  const [pendingCount, setPendingCount] = useState(seeded?.meta?.pendingCount ?? 0);
  const [loading, setLoading] = useState(!seeded);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(
    async (params?: ReviewListParams) => {
      const k = cacheKey(params ?? initialParams);
      const current = reviewListCache.get(k);
      const hasRows = Boolean(current?.items.length);
      if (!hasRows) setLoading(true);
      setError(null);
      try {
        const entry = await reviewListCache.load(
          k,
          async () => {
            const query = buildReviewQuery(params ?? initialParams);
            const res = await apiFetch<ApiProductReviewListResponse>(
              `/api/v1/catalog/reviews${query}`,
              { cache: "no-store" },
            );
            return {
              items: (res.data ?? []).map(apiProductReviewToReview),
              total: res.meta?.count ?? res.data?.length ?? 0,
              meta: { pendingCount: res.meta?.pending_count ?? 0 },
            };
          },
          { force: true },
        );
        setReviews(entry.items);
        setTotal(entry.total);
        setPendingCount(entry.meta?.pendingCount ?? 0);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load reviews";
        setError(message);
        if (!hasRows) {
          setReviews([]);
          setTotal(0);
          setPendingCount(0);
        }
      } finally {
        setLoading(false);
      }
    },
    [initialParams],
  );

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { reviews, total, pendingCount, loading, error, refetch };
}

export function useCatalogReview(reviewId: string) {
  const [reviewRow, setReviewRow] = useState<Review | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!reviewId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<ApiProductReviewResponse>(`/api/v1/catalog/reviews/${reviewId}`);
      setReviewRow(apiProductReviewToReview(res.data));
      setNotes(res.data.notes);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load review";
      setError(message);
      setReviewRow(null);
      setNotes(null);
    } finally {
      setLoading(false);
    }
  }, [reviewId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { reviewRow, notes, loading, error, refetch };
}

export async function updateCatalogReview(id: string, input: UpdateProductReviewInput): Promise<Review> {
  const res = await apiFetch<ApiProductReviewResponse>(`/api/v1/catalog/reviews/${id}`, {
    method: "PATCH",
    body: JSON.stringify(productReviewUpdateToApiPayload(input)),
  });
  reviewListCache.clear();
  return apiProductReviewToReview(res.data);
}

export async function createCatalogReview(input: CreateProductReviewInput): Promise<Review> {
  const res = await apiFetch<ApiProductReviewResponse>(`/api/v1/catalog/reviews`, {
    method: "POST",
    body: JSON.stringify(productReviewCreateToApiPayload(input)),
  });
  reviewListCache.clear();
  return apiProductReviewToReview(res.data);
}

export async function updateCatalogReviewStatus(id: string, status: ReviewStatus): Promise<Review> {
  return updateCatalogReview(id, { status });
}
