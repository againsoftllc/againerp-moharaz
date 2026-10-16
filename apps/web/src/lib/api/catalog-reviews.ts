import type { Review, ReviewMedia, ReviewStatus, ReviewType, SentimentType } from "@/lib/mock-data/reviews";

export type ApiReviewMedia = {
  id: string;
  url: string;
  name?: string;
  media_type?: string;
};

export type ApiProductReview = {
  id: string;
  company_id: string;
  review_number: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  product_brand: string | null;
  product_category: string | null;
  product_image_url: string | null;
  customer_id: string | null;
  customer_name: string;
  customer_image_url: string | null;
  media?: ApiReviewMedia[];
  review_type: string;
  status: string;
  rating: number;
  title: string;
  body: string;
  sentiment: string;
  is_verified_purchase: boolean;
  helpful_votes: number;
  moderated_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ApiProductReviewListResponse = {
  data: ApiProductReview[];
  meta: { count: number; pending_count: number };
};

export type ApiProductReviewResponse = {
  data: ApiProductReview;
};

export type ReviewListParams = {
  search?: string;
  status?: string;
};

const EMPTY_AI_ANALYSIS: Review["aiAnalysis"] = {
  sentiment: "neutral",
  sentimentScore: 50,
  summary: "",
  prosSummary: [],
  consSummary: [],
  autoTags: [],
  complaints: [],
  mostLovedFeatures: [],
  trustScore: 0,
  qualityScore: 0,
  isDuplicate: false,
  isSpam: false,
  suggestedAdminReply: "",
  productInsights: [],
};

function reviewExcerpt(body: string | null | undefined): string {
  const text = (body ?? "").replace(/\s+/g, " ").trim();
  return text.length > 80 ? `${text.slice(0, 80).trimEnd()}…` : text;
}

export function apiProductReviewToReview(row: ApiProductReview): Review {
  const media: ReviewMedia[] = (row.media ?? [])
    .filter((item) => item.url)
    .map((item) => ({
      id: item.id,
      url: item.url,
      type: item.media_type === "video" ? "video" : "image",
      caption: item.name || undefined,
    }));

  if (!media.length && row.customer_image_url) {
    media.push({
      id: `${row.id}-customer-image`,
      url: row.customer_image_url,
      type: "image",
    });
  }

  return {
    id: row.id,
    reviewId: row.review_number,
    type: row.review_type as ReviewType,
    status: row.status as ReviewStatus,
    rating: row.rating,
    // reviews imported from the old shop (and most shoppers) have text only: its start stands in for the title
    title: row.title?.trim() || reviewExcerpt(row.body),
    body: row.body,
    pros: [],
    cons: [],
    categoryRatings: [],
    product: {
      id: row.product_id,
      name: row.product_name,
      sku: row.product_sku ?? "",
      brand: row.product_brand ?? "",
      category: row.product_category ?? "",
      imageUrl: row.product_image_url ?? "https://placehold.co/48x48",
      avgRating: row.rating,
      totalReviews: 0,
    },
    customer: {
      id: row.customer_id ?? "guest",
      name: row.customer_name,
      imageUrl: media[0]?.url ?? row.customer_image_url ?? undefined,
      group: "retail",
      totalOrders: 0,
      ltv: 0,
      trustScore: 0,
      reviewCount: 0,
    },
    isVerifiedPurchase: row.is_verified_purchase,
    helpfulVotes: row.helpful_votes,
    notHelpfulVotes: 0,
    media,
    tags: [],
    aiAnalysis: {
      ...EMPTY_AI_ANALYSIS,
      sentiment: row.sentiment as SentimentType,
    },
    timeline: [],
    notes: row.notes
      ? [
          {
            id: `${row.id}-note`,
            author: row.moderated_by ?? "Admin",
            authorInitials: (row.moderated_by ?? "AD").slice(0, 2).toUpperCase(),
            body: row.notes,
            at: row.updated_at,
          },
        ]
      : [],
    moderatedBy: row.moderated_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function buildReviewQuery(params?: ReviewListParams): string {
  if (!params) return "";
  const q = new URLSearchParams();
  if (params.search) q.set("search", params.search);
  if (params.status) q.set("status", params.status);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export type ReviewMediaInput = {
  id: string;
  url: string;
  name?: string;
  mediaType?: "image" | "video";
};

export type UpdateProductReviewInput = {
  customerName?: string;
  customerImageUrl?: string | null;
  media?: ReviewMediaInput[];
  title?: string;
  body?: string;
  rating?: number;
  reviewType?: ReviewType;
  status?: ReviewStatus;
  sentiment?: SentimentType;
  isVerifiedPurchase?: boolean;
  helpfulVotes?: number;
  moderatedBy?: string;
  notes?: string;
};

export type CreateProductReviewInput = {
  productId: string;
  customerName: string;
  customerImageUrl?: string | null;
  media?: ReviewMediaInput[];
  title: string;
  body?: string;
  rating: number;
  reviewType?: ReviewType;
  status?: ReviewStatus;
  sentiment?: SentimentType;
  isVerifiedPurchase?: boolean;
  notes?: string;
};

function mediaToApi(media?: ReviewMediaInput[]) {
  return (media ?? []).map((item) => ({
    id: item.id,
    url: item.url,
    name: item.name ?? "",
    media_type: item.mediaType ?? "image",
  }));
}

export function productReviewUpdateToApiPayload(input: UpdateProductReviewInput) {
  return {
    customer_name: input.customerName,
    customer_image_url: input.customerImageUrl,
    media: input.media ? mediaToApi(input.media) : undefined,
    title: input.title,
    body: input.body,
    rating: input.rating,
    review_type: input.reviewType,
    status: input.status,
    sentiment: input.sentiment,
    is_verified_purchase: input.isVerifiedPurchase,
    helpful_votes: input.helpfulVotes,
    moderated_by: input.moderatedBy,
    notes: input.notes,
  };
}

export function productReviewCreateToApiPayload(input: CreateProductReviewInput) {
  const media = mediaToApi(input.media);
  return {
    product_id: input.productId,
    customer_name: input.customerName,
    customer_image_url: input.customerImageUrl ?? media[0]?.url ?? null,
    media,
    title: input.title,
    body: input.body ?? "",
    rating: input.rating,
    review_type: input.reviewType ?? "text",
    status: input.status ?? "pending",
    sentiment: input.sentiment ?? "neutral",
    is_verified_purchase: input.isVerifiedPurchase ?? false,
    notes: input.notes,
  };
}
