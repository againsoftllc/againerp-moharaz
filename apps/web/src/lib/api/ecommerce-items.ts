import { apiFetch } from "@/lib/api/client";

export type EcommercePublishStatus =
  | "draft"
  | "review"
  | "published"
  | "hidden"
  | "archived";

export type ApiEcommerceItem = {
  id: string;
  item_id: string;
  catalog_product_id: string | null;
  publish_status: EcommercePublishStatus;
  visibility: "public" | "private";
  featured: boolean;
  sort_order: number;
  slug: string;
  short_description: string | null;
  full_description: string | null;
  selling_price: string;
  compare_at_price: string | null;
  special_price: string | null;
  seo_title: string | null;
  seo_description: string | null;
  thumbnail_url: string | null;
  is_active: boolean;
  updated_at: string;
};

async function postAction(itemId: string, action: string): Promise<ApiEcommerceItem> {
  const res = await apiFetch<{ data: ApiEcommerceItem }>(
    `/api/v1/ecommerce/items/${itemId}/${action}`,
    { method: "POST" },
  );
  return res.data;
}

export async function fetchEcommerceItem(itemId: string): Promise<ApiEcommerceItem> {
  const res = await apiFetch<{ data: ApiEcommerceItem }>(`/api/v1/ecommerce/items/${itemId}`);
  return res.data;
}

export async function syncEcommerceFromCatalog(itemId: string): Promise<ApiEcommerceItem> {
  return postAction(itemId, "sync-from-catalog");
}

export async function submitEcommerceForReview(itemId: string): Promise<ApiEcommerceItem> {
  return postAction(itemId, "submit-for-review");
}

export async function rejectEcommerceReview(itemId: string): Promise<ApiEcommerceItem> {
  return postAction(itemId, "reject-review");
}

export async function publishEcommerceItem(itemId: string): Promise<ApiEcommerceItem> {
  return postAction(itemId, "publish");
}

export async function unpublishEcommerceItem(
  itemId: string,
  hidden = false,
): Promise<ApiEcommerceItem> {
  const qs = hidden ? "?hidden=true" : "";
  const res = await apiFetch<{ data: ApiEcommerceItem }>(
    `/api/v1/ecommerce/items/${itemId}/unpublish${qs}`,
    { method: "POST" },
  );
  return res.data;
}

export async function archiveEcommerceItem(itemId: string): Promise<ApiEcommerceItem> {
  return postAction(itemId, "archive");
}

export async function restoreEcommerceItem(itemId: string): Promise<ApiEcommerceItem> {
  return postAction(itemId, "restore");
}

export const PUBLISH_STATUS_LABELS: Record<EcommercePublishStatus, string> = {
  draft: "Draft",
  review: "In review",
  published: "Published",
  hidden: "Hidden",
  archived: "Archived",
};
