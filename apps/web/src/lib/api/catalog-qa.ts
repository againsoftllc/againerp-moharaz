import type { CatalogQa, QaStatus } from "@/lib/mock-data/catalog-qa";

export type ApiProductQa = {
  id: string;
  company_id: string;
  question_number: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  product_brand: string | null;
  product_category: string | null;
  product_image_url: string | null;
  customer_name: string;
  question: string;
  answer: string | null;
  answered_by: string | null;
  status: string;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
};

export type ApiProductQaListResponse = {
  data: ApiProductQa[];
  meta: { count: number; pending_count: number };
};

export type ApiProductQaResponse = {
  data: ApiProductQa;
};

export type QaListParams = {
  search?: string;
  status?: string;
};

export function apiProductQaToQa(row: ApiProductQa): CatalogQa {
  return {
    id: row.id,
    questionId: row.question_number,
    status: row.status as QaStatus,
    question: row.question,
    answer: row.answer ?? undefined,
    answeredBy: row.answered_by ?? undefined,
    isVerified: row.is_verified,
    product: {
      id: row.product_id,
      name: row.product_name,
      sku: row.product_sku,
      brand: row.product_brand ?? "",
      category: row.product_category ?? "",
      imageUrl: row.product_image_url ?? "https://placehold.co/48x48",
    },
    customer: {
      name: row.customer_name,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function buildQaQuery(params?: QaListParams): string {
  if (!params) return "";
  const q = new URLSearchParams();
  if (params.search) q.set("search", params.search);
  if (params.status) q.set("status", params.status);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export type CreateProductQaInput = {
  productId: string;
  customerName: string;
  question: string;
  answer?: string;
  answeredBy?: string;
  status?: QaStatus;
  isVerified?: boolean;
};

export type UpdateProductQaInput = {
  customerName?: string;
  question?: string;
  answer?: string | null;
  answeredBy?: string | null;
  status?: QaStatus;
  isVerified?: boolean;
};

export function productQaCreateToApiPayload(input: CreateProductQaInput) {
  return {
    product_id: input.productId,
    customer_name: input.customerName,
    question: input.question,
    answer: input.answer,
    answered_by: input.answeredBy,
    status: input.status ?? "pending",
    is_verified: input.isVerified ?? false,
  };
}

export function productQaUpdateToApiPayload(input: UpdateProductQaInput) {
  return {
    customer_name: input.customerName,
    question: input.question,
    answer: input.answer,
    answered_by: input.answeredBy,
    status: input.status,
    is_verified: input.isVerified,
  };
}
