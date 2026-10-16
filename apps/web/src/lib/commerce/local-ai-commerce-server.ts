/**
 * Aladin's product-from-URL pipeline, backed by our own FastAPI
 * (apps/api `/catalog/ai/import-from-url/*`) instead of the external
 * AgainERP Center gateway. Same job-shaped interface as
 * center-ai-commerce-server.ts (createCommercePreviewImport /
 * fetchCommerceImportProgress / fetchCommerceImportResult) so the chat UI
 * and erp-interactive-workflow.ts don't need to change — only where the
 * preview data comes from changes.
 */
import { consumerAuthorizedFetch } from "@/lib/commerce/catalog-consumer-server";
import { getEphemeralJson, putEphemeralJson } from "@/lib/commerce/server-ephemeral-store";

type ProductDraftSpecItem = { label: string; value: string };
type ProductDraftSpecGroup = { group: string; items: ProductDraftSpecItem[] };

type ProductDraft = {
  name: string;
  sku?: string | null;
  short_description?: string | null;
  description?: string | null;
  brand_name?: string | null;
  category_name?: string | null;
  price?: string | number | null;
  currency: string;
  warranty?: string | null;
  images: string[];
  specifications: ProductDraftSpecGroup[];
  tags: string[];
  seo_title?: string | null;
  seo_description?: string | null;
  source_url?: string | null;
  confidence_notes?: string | null;
};

type ExtractResponse = {
  draft: ProductDraft;
  matched_brand_id: string | null;
  matched_category_id: string | null;
  warnings: string[];
};

export type LocalPreviewJob = {
  id: string;
  sourceUrl: string;
  status: "preview_ready" | "failed";
  canonicalProduct?: Record<string, unknown> | null;
  error?: { code: string; message: string } | null;
  updatedAt: number;
};

function jobKey(id: string) {
  return `ai-url-import-preview-${id}`;
}

function draftToCanonical(url: string, extract: ExtractResponse): Record<string, unknown> {
  const d = extract.draft;
  const price = d.price != null && d.price !== "" ? Number(d.price) : undefined;
  return {
    name: d.name,
    sku: d.sku || undefined,
    shortDescription: d.short_description || undefined,
    description: d.description || undefined,
    brand: d.brand_name ? { name: d.brand_name, id: extract.matched_brand_id ?? undefined } : undefined,
    category: d.category_name
      ? { name: d.category_name, path: [d.category_name], id: extract.matched_category_id ?? undefined }
      : undefined,
    price: price != null && Number.isFinite(price) ? { amount: price, currency: d.currency || "BDT" } : undefined,
    warranty: d.warranty ? { duration: d.warranty } : undefined,
    images: (d.images ?? []).map((src) => ({ url: src })),
    specifications: d.specifications ?? [],
    tags: d.tags ?? [],
    seo:
      d.seo_title || d.seo_description
        ? { title: d.seo_title || undefined, description: d.seo_description || undefined }
        : undefined,
    metadata: {
      sourceUrl: d.source_url || url,
      extractorUsed: "ai_url_import",
      warnings: extract.warnings,
      confidenceNotes: d.confidence_notes || undefined,
    },
  };
}

/** Scrape + AI-extract now, store the finished job — no async polling needed
 * on our side, but the job shape lets the existing preview UI/polling loop
 * work unchanged. */
export async function createLocalPreviewImport(
  url: string,
  authorization: string,
): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  let job: LocalPreviewJob;
  try {
    const extract = await consumerAuthorizedFetch<ExtractResponse>(
      "/api/v1/catalog/ai/import-from-url/extract",
      authorization,
      { method: "POST", body: JSON.stringify({ url }) },
    );
    job = {
      id,
      sourceUrl: url,
      status: "preview_ready",
      canonicalProduct: draftToCanonical(url, extract),
      updatedAt: Date.now(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not extract product data";
    job = { id, sourceUrl: url, status: "failed", error: { code: "extract_failed", message }, updatedAt: Date.now() };
  }
  await putEphemeralJson(jobKey(id), job);
  return { id };
}

export async function getLocalPreviewJob(id: string): Promise<LocalPreviewJob | null> {
  return getEphemeralJson<LocalPreviewJob>(jobKey(id));
}
