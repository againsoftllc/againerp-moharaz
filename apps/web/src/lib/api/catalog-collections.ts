import type { ProductCollection } from "@/lib/mock-data/collections";

/** Raw collection shape from FastAPI `/api/v1/catalog/collections`. */
export type ApiCatalogCollection = {
  id: string;
  company_id: string;
  name: string;
  slug: string;
  collection_type: ProductCollection["type"];
  status: ProductCollection["status"];
  sort_order: number;
  product_count: number;
  rule_summary: string | null;
  hero_image_url: string | null;
  description: string | null;
  meta_title: string | null;
  meta_description: string | null;
  schedule_start: string | null;
  schedule_end: string | null;
  is_system: boolean;
  created_at: string;
  updated_at: string;
};

export type ApiCollectionListResponse = {
  data: ApiCatalogCollection[];
  meta: { count: number };
  errors: string[];
};

export type ApiCollectionResponse = {
  data: ApiCatalogCollection;
  errors: string[];
};

export function apiCollectionToCollection(row: ApiCatalogCollection): ProductCollection {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    type: row.collection_type,
    status: row.status,
    sortOrder: row.sort_order,
    productCount: row.product_count,
    ruleSummary: row.rule_summary ?? "",
    heroImageUrl: row.hero_image_url ?? undefined,
    description: row.description ?? undefined,
    metaTitle: row.meta_title ?? undefined,
    metaDescription: row.meta_description ?? undefined,
    scheduleStart: row.schedule_start ?? undefined,
    scheduleEnd: row.schedule_end ?? undefined,
    updatedAt: row.updated_at.slice(0, 10),
    isSystem: row.is_system || undefined,
  };
}

export type CreateCatalogCollectionInput = {
  name: string;
  slug: string;
  type?: ProductCollection["type"];
  status?: ProductCollection["status"];
  ruleSummary?: string;
  heroImageUrl?: string;
  description?: string;
  metaTitle?: string;
  metaDescription?: string;
  scheduleStart?: string;
  scheduleEnd?: string;
};

export type UpdateCatalogCollectionInput = Partial<CreateCatalogCollectionInput>;

function collectionInputToApiPayload(
  input: CreateCatalogCollectionInput | UpdateCatalogCollectionInput,
) {
  const payload: Record<string, unknown> = {};
  if ("name" in input && input.name !== undefined) payload.name = input.name;
  if ("slug" in input && input.slug !== undefined) payload.slug = input.slug;
  if ("type" in input && input.type !== undefined) payload.collection_type = input.type;
  if ("status" in input && input.status !== undefined) payload.status = input.status;
  if ("ruleSummary" in input && input.ruleSummary !== undefined) {
    payload.rule_summary = input.ruleSummary;
  }
  if ("heroImageUrl" in input && input.heroImageUrl !== undefined) {
    payload.hero_image_url = input.heroImageUrl;
  }
  if ("description" in input && input.description !== undefined) {
    payload.description = input.description;
  }
  if ("metaTitle" in input && input.metaTitle !== undefined) payload.meta_title = input.metaTitle;
  if ("metaDescription" in input && input.metaDescription !== undefined) {
    payload.meta_description = input.metaDescription;
  }
  if ("scheduleStart" in input && input.scheduleStart !== undefined) {
    payload.schedule_start = input.scheduleStart || null;
  }
  if ("scheduleEnd" in input && input.scheduleEnd !== undefined) {
    payload.schedule_end = input.scheduleEnd || null;
  }
  return payload;
}

export function collectionToApiCreatePayload(input: CreateCatalogCollectionInput) {
  return collectionInputToApiPayload(input);
}

export function collectionToApiUpdatePayload(input: UpdateCatalogCollectionInput) {
  return collectionInputToApiPayload(input);
}

export function partialCollectionToApiUpdate(
  data: Partial<ProductCollection>,
): UpdateCatalogCollectionInput {
  const input: UpdateCatalogCollectionInput = {};
  if (data.name !== undefined) input.name = data.name;
  if (data.slug !== undefined) input.slug = data.slug;
  if (data.type !== undefined) input.type = data.type;
  if (data.status !== undefined) input.status = data.status;
  if (data.ruleSummary !== undefined) input.ruleSummary = data.ruleSummary;
  if (data.heroImageUrl !== undefined) input.heroImageUrl = data.heroImageUrl;
  if (data.description !== undefined) input.description = data.description;
  if (data.metaTitle !== undefined) input.metaTitle = data.metaTitle;
  if (data.metaDescription !== undefined) input.metaDescription = data.metaDescription;
  if (data.scheduleStart !== undefined) input.scheduleStart = data.scheduleStart;
  if (data.scheduleEnd !== undefined) input.scheduleEnd = data.scheduleEnd;
  return input;
}
