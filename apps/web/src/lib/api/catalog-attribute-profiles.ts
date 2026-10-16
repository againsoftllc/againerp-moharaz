import type {
  AttributeFieldType,
  AttributeGroup,
  AttributeProfile,
  AttributeSpec,
} from "@/lib/mock-data/attribute-profiles";
import { apiFetch } from "@/lib/api/client";

export type ApiAttributeField = {
  id: string;
  group_id: string;
  name: string;
  code: string;
  field_type: string;
  sort_order: number;
  is_required: boolean;
  is_filterable: boolean;
  is_comparable: boolean;
  is_searchable: boolean;
  is_visible: boolean;
  is_active: boolean;
  filter_display_type?: string;
  storefront_filter_visible?: boolean;
  unit: string | null;
  help_text: string | null;
  predefined_values: string[];
};

export type ApiAttributeGroup = {
  id: string;
  profile_id: string;
  name: string;
  code: string;
  sort_order: number;
  is_active: boolean;
  description: string | null;
  attributes?: ApiAttributeField[];
};

export type ApiAttributeProfile = {
  id: string;
  company_id: string;
  name: string;
  code: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  icon_url: string | null;
  image_url: string | null;
  category_labels: string[];
  product_count: number;
  group_count: number;
  attribute_count: number;
  created_at: string;
  updated_at: string;
};

export type ApiAttributeProfileListResponse = {
  data: ApiAttributeProfile[];
  groups: ApiAttributeGroup[];
  attributes: ApiAttributeField[];
  meta: { count: number };
  errors: string[];
};

export type ApiAttributeProfileResponse = {
  data: ApiAttributeProfile & {
    groups: ApiAttributeGroup[];
  };
  errors: string[];
};

export function apiProfileToProfile(row: ApiAttributeProfile): AttributeProfile {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description ?? undefined,
    sortOrder: row.sort_order,
    active: row.is_active,
    productCount: row.product_count,
    iconUrl: row.icon_url ?? undefined,
    imageUrl: row.image_url ?? undefined,
    categoryLabels: row.category_labels ?? [],
    updatedAt: row.updated_at.slice(0, 10),
  };
}

export function apiGroupToGroup(row: ApiAttributeGroup): AttributeGroup {
  return {
    id: row.id,
    profileId: row.profile_id,
    name: row.name,
    code: row.code,
    sortOrder: row.sort_order,
    active: row.is_active,
    description: row.description ?? undefined,
  };
}

export function apiAttributeToSpec(row: ApiAttributeField): AttributeSpec {
  return {
    id: row.id,
    groupId: row.group_id,
    name: row.name,
    code: row.code,
    fieldType: row.field_type as AttributeFieldType,
    sortOrder: row.sort_order,
    isRequired: row.is_required,
    isFilterable: row.is_filterable,
    isComparable: row.is_comparable,
    isSearchable: row.is_searchable,
    isVisible: row.is_visible,
    active: row.is_active,
    filterDisplayType: (row.filter_display_type as AttributeSpec["filterDisplayType"]) || "multi_select",
    storefrontFilterVisible: row.storefront_filter_visible ?? true,
    unit: row.unit ?? undefined,
    helpText: row.help_text ?? undefined,
    predefinedValues: row.predefined_values ?? [],
  };
}

export type BulkSaveGroupInput = {
  id?: string;
  name: string;
  attributes: {
    id?: string;
    name: string;
    filterable?: boolean;
    filterDisplayType?: string;
    storefrontFilterVisible?: boolean;
    predefinedValues?: string[];
  }[];
};

export type BulkSaveProfileInput = {
  profileId?: string;
  profileName: string;
  imageUrl?: string;
  groups: BulkSaveGroupInput[];
};

export function bulkSaveToApiPayload(input: BulkSaveProfileInput) {
  return {
    profile_name: input.profileName,
    image_url: input.imageUrl ?? null,
    groups: input.groups.map((g) => ({
      id: g.id,
      name: g.name,
      attributes: g.attributes.map((a) => ({
        id: a.id,
        name: a.name,
        filterable: a.filterable ?? false,
        filter_display_type: a.filterDisplayType ?? "multi_select",
        storefront_filter_visible: a.storefrontFilterVisible ?? true,
        predefined_values: a.predefinedValues ?? [],
      })),
    })),
  };
}

export type AttributeValueUsage = {
  attributeId: string;
  value: string;
  productCount: number;
};

/** Map attributeId -> values locked because products still use them. */
export type LockedFilterValuesByAttrId = Record<string, string[]>;

export async function fetchAttributeProfileValueUsage(
  profileId: string,
): Promise<LockedFilterValuesByAttrId> {
  const res = await apiFetch<{
    data: { attribute_id: string; value: string; product_count: number }[];
  }>(`/api/v1/catalog/attribute-profiles/${profileId}/value-usage`);
  const locked: LockedFilterValuesByAttrId = {};
  for (const item of res.data ?? []) {
    if (!item.product_count) continue;
    const list = locked[item.attribute_id] ?? [];
    list.push(item.value);
    locked[item.attribute_id] = list;
  }
  return locked;
}

export type CreateAttributeProfileInput = {
  name: string;
  code: string;
  description?: string;
  active?: boolean;
  iconUrl?: string;
  imageUrl?: string;
  categoryLabels?: string[];
};

export type UpdateAttributeProfileInput = Partial<CreateAttributeProfileInput>;

export function partialProfileToApiUpdate(data: Partial<AttributeProfile>) {
  const payload: Record<string, unknown> = {};
  if (data.name !== undefined) payload.name = data.name;
  if (data.code !== undefined) payload.code = data.code;
  if (data.description !== undefined) payload.description = data.description;
  if (data.active !== undefined) payload.is_active = data.active;
  if (data.iconUrl !== undefined) payload.icon_url = data.iconUrl;
  if (data.imageUrl !== undefined) payload.image_url = data.imageUrl;
  if (data.categoryLabels !== undefined) payload.category_labels = data.categoryLabels;
  return payload;
}
