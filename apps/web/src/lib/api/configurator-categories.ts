import type { ConfiguratorCategory, SlotCondition } from "@/lib/configurator/types";

export type ApiConfiguratorCategory = {
  id: string;
  company_id: string;
  profile_id: string;
  profile_name: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  is_required: boolean;
  selection_mode: ConfiguratorCategory["selectionMode"];
  catalog_category_slug?: string;
  attribute_profile_id?: string | null;
  product_count: number;
  status: ConfiguratorCategory["status"];
  tab_id?: string | null;
  kind?: ConfiguratorCategory["kind"];
  icon?: string;
  conditions?: SlotCondition[];
  specs?: string[];
  min_select?: number;
  max_select?: number;
  default_sort?: ConfiguratorCategory["defaultSort"];
  created_at: string;
  updated_at: string;
};

export type ApiConfiguratorCategoryListResponse = {
  data: ApiConfiguratorCategory[];
  meta: { count: number };
  errors: string[];
};

export type ApiConfiguratorCategoryResponse = {
  data: ApiConfiguratorCategory;
  errors: string[];
};

export function apiCategoryToConfiguratorCategory(row: ApiConfiguratorCategory): ConfiguratorCategory {
  return {
    id: row.id,
    profileId: row.profile_id,
    profileName: row.profile_name,
    name: row.name,
    slug: row.slug,
    description: row.description ?? undefined,
    sortOrder: row.sort_order,
    isRequired: row.is_required,
    selectionMode: row.selection_mode,
    catalogCategorySlug: row.catalog_category_slug || "",
    attributeProfileId: row.attribute_profile_id ?? null,
    productCount: row.product_count,
    status: row.status,
    updatedAt: row.updated_at.slice(0, 10),
    tabId: row.tab_id ?? null,
    kind: row.kind ?? "product",
    icon: row.icon ?? "settings_input_component",
    conditions: row.conditions ?? [],
    specs: row.specs ?? [],
    minSelect: row.min_select ?? (row.is_required ? 1 : 0),
    maxSelect: row.max_select ?? (row.selection_mode === "multiple" ? 4 : 1),
    defaultSort: row.default_sort ?? "popular",
  };
}

export type CreateConfiguratorCategoryInput = {
  profileId: string;
  name: string;
  slug: string;
  description?: string;
  sortOrder?: number;
  isRequired?: boolean;
  selectionMode?: ConfiguratorCategory["selectionMode"];
  catalogCategorySlug?: string;
  attributeProfileId?: string | null;
  status?: ConfiguratorCategory["status"];
  tabId?: string | null;
  kind?: ConfiguratorCategory["kind"];
  icon?: string;
  conditions?: SlotCondition[];
  specs?: string[];
  minSelect?: number;
  maxSelect?: number;
  defaultSort?: ConfiguratorCategory["defaultSort"];
};

export type UpdateConfiguratorCategoryInput = Partial<CreateConfiguratorCategoryInput>;

function categoryInputToApiPayload(
  input: CreateConfiguratorCategoryInput | UpdateConfiguratorCategoryInput,
) {
  const payload: Record<string, unknown> = {};
  if ("profileId" in input && input.profileId !== undefined) payload.profile_id = input.profileId;
  if ("name" in input && input.name !== undefined) payload.name = input.name;
  if ("slug" in input && input.slug !== undefined) payload.slug = input.slug;
  if ("description" in input && input.description !== undefined) payload.description = input.description;
  if ("sortOrder" in input && input.sortOrder !== undefined) payload.sort_order = input.sortOrder;
  if ("isRequired" in input && input.isRequired !== undefined) payload.is_required = input.isRequired;
  if ("selectionMode" in input && input.selectionMode !== undefined) {
    payload.selection_mode = input.selectionMode;
  }
  if ("catalogCategorySlug" in input && input.catalogCategorySlug !== undefined) {
    payload.catalog_category_slug = input.catalogCategorySlug;
  }
  if ("attributeProfileId" in input && input.attributeProfileId !== undefined) {
    payload.attribute_profile_id = input.attributeProfileId;
  }
  if ("status" in input && input.status !== undefined) payload.status = input.status;
  if ("tabId" in input && input.tabId !== undefined) payload.tab_id = input.tabId;
  if ("kind" in input && input.kind !== undefined) payload.kind = input.kind;
  if ("icon" in input && input.icon !== undefined) payload.icon = input.icon;
  if ("conditions" in input && input.conditions !== undefined) payload.conditions = input.conditions;
  if ("specs" in input && input.specs !== undefined) payload.specs = input.specs;
  if ("minSelect" in input && input.minSelect !== undefined) payload.min_select = input.minSelect;
  if ("maxSelect" in input && input.maxSelect !== undefined) payload.max_select = input.maxSelect;
  if ("defaultSort" in input && input.defaultSort !== undefined) payload.default_sort = input.defaultSort;
  return payload;
}

export function categoryToApiCreatePayload(input: CreateConfiguratorCategoryInput) {
  return categoryInputToApiPayload(input);
}

export function categoryToApiUpdatePayload(input: UpdateConfiguratorCategoryInput) {
  return categoryInputToApiPayload(input);
}

export function partialCategoryToApiUpdate(
  data: Partial<ConfiguratorCategory>,
): UpdateConfiguratorCategoryInput {
  const input: UpdateConfiguratorCategoryInput = {};
  if (data.profileId !== undefined) input.profileId = data.profileId;
  if (data.name !== undefined) input.name = data.name;
  if (data.slug !== undefined) input.slug = data.slug;
  if (data.description !== undefined) input.description = data.description;
  if (data.sortOrder !== undefined) input.sortOrder = data.sortOrder;
  if (data.isRequired !== undefined) input.isRequired = data.isRequired;
  if (data.selectionMode !== undefined) input.selectionMode = data.selectionMode;
  if (data.catalogCategorySlug !== undefined) input.catalogCategorySlug = data.catalogCategorySlug;
  if (data.attributeProfileId !== undefined) input.attributeProfileId = data.attributeProfileId;
  if (data.status !== undefined) input.status = data.status;
  if (data.tabId !== undefined) input.tabId = data.tabId;
  if (data.kind !== undefined) input.kind = data.kind;
  if (data.icon !== undefined) input.icon = data.icon;
  if (data.conditions !== undefined) input.conditions = data.conditions;
  if (data.specs !== undefined) input.specs = data.specs;
  if (data.minSelect !== undefined) input.minSelect = data.minSelect;
  if (data.maxSelect !== undefined) input.maxSelect = data.maxSelect;
  if (data.defaultSort !== undefined) input.defaultSort = data.defaultSort;
  return input;
}
