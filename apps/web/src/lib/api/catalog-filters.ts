import type { CatalogFacetFilter } from "@/lib/mock-data/catalog-filters";

/** Raw filter shape from FastAPI `/api/v1/catalog/filters`. */
export type ApiCatalogFilter = {
  id: string;
  company_id: string;
  name: string;
  param_key: string;
  display_type: CatalogFacetFilter["displayType"];
  source: CatalogFacetFilter["source"];
  attribute_id: string | null;
  attribute_name: string;
  sort_order: number;
  is_active: boolean;
  storefront_visible: boolean;
  category_scope: string;
  value_count: number;
  url_example: string;
  is_system: boolean;
  created_at: string;
  updated_at: string;
};

export type ApiFilterListResponse = {
  data: ApiCatalogFilter[];
  meta: { count: number };
  errors: string[];
};

export type ApiFilterResponse = {
  data: ApiCatalogFilter;
  errors: string[];
};

export function apiFilterToFilter(row: ApiCatalogFilter): CatalogFacetFilter {
  return {
    id: row.id,
    name: row.name,
    paramKey: row.param_key,
    displayType: row.display_type,
    source: row.source,
    attributeId: row.attribute_id ?? undefined,
    attributeName: row.attribute_name,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    storefrontVisible: row.storefront_visible,
    categoryScope: row.category_scope,
    valueCount: row.value_count,
    urlExample: row.url_example,
    updatedAt: row.updated_at.slice(0, 10),
    isSystem: row.is_system || undefined,
  };
}

export type CreateCatalogFilterInput = {
  name: string;
  paramKey: string;
  displayType?: CatalogFacetFilter["displayType"];
  source?: CatalogFacetFilter["source"];
  attributeId?: string;
  attributeName?: string;
  isActive?: boolean;
  storefrontVisible?: boolean;
  categoryScope?: string;
  urlExample?: string;
};

export type UpdateCatalogFilterInput = Partial<CreateCatalogFilterInput>;

function filterInputToApiPayload(input: CreateCatalogFilterInput | UpdateCatalogFilterInput) {
  const payload: Record<string, unknown> = {};
  if ("name" in input && input.name !== undefined) payload.name = input.name;
  if ("paramKey" in input && input.paramKey !== undefined) payload.param_key = input.paramKey;
  if ("displayType" in input && input.displayType !== undefined) {
    payload.display_type = input.displayType;
  }
  if ("source" in input && input.source !== undefined) payload.source = input.source;
  if ("attributeId" in input && input.attributeId !== undefined) {
    payload.attribute_id = input.attributeId || null;
  }
  if ("attributeName" in input && input.attributeName !== undefined) {
    payload.attribute_name = input.attributeName;
  }
  if ("isActive" in input && input.isActive !== undefined) payload.is_active = input.isActive;
  if ("storefrontVisible" in input && input.storefrontVisible !== undefined) {
    payload.storefront_visible = input.storefrontVisible;
  }
  if ("categoryScope" in input && input.categoryScope !== undefined) {
    payload.category_scope = input.categoryScope;
  }
  if ("urlExample" in input && input.urlExample !== undefined) payload.url_example = input.urlExample;
  return payload;
}

export function filterToApiCreatePayload(input: CreateCatalogFilterInput) {
  return filterInputToApiPayload(input);
}

export function filterToApiUpdatePayload(input: UpdateCatalogFilterInput) {
  return filterInputToApiPayload(input);
}

export function partialFilterToApiUpdate(data: Partial<CatalogFacetFilter>): UpdateCatalogFilterInput {
  const input: UpdateCatalogFilterInput = {};
  if (data.name !== undefined) input.name = data.name;
  if (data.paramKey !== undefined) input.paramKey = data.paramKey;
  if (data.displayType !== undefined) input.displayType = data.displayType;
  if (data.source !== undefined) input.source = data.source;
  if (data.attributeId !== undefined) input.attributeId = data.attributeId;
  if (data.attributeName !== undefined) input.attributeName = data.attributeName;
  if (data.isActive !== undefined) input.isActive = data.isActive;
  if (data.storefrontVisible !== undefined) input.storefrontVisible = data.storefrontVisible;
  if (data.categoryScope !== undefined) input.categoryScope = data.categoryScope;
  if (data.urlExample !== undefined) input.urlExample = data.urlExample;
  return input;
}
