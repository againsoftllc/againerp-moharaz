import {
  listAttributeProfilesLite,
  loadProfileSchema,
  pickBestAttributeProfile,
  type ProfileSchemaField,
} from "@/lib/commerce/catalog-attribute-helpers";
import { consumerAuthorizedFetch } from "@/lib/commerce/catalog-consumer-server";

type CanonicalProduct = Record<string, unknown>;

export type AttributePlanGroup = {
  name: string;
  attributes: Array<{ name: string; filterable: boolean; sample_value?: string }>;
};

export type ProvisionSpecsResult = {
  profileId: string;
  profileName: string;
  customSpecsJson: string;
  groupsCreated: number;
  attributesCreated: number;
  fieldCount: number;
};

type AttributeProfileDetail = {
  id: string;
  name: string;
  groups?: Array<{
    id: string;
    name: string;
    attributes?: Array<{ id: string; name: string; group_id: string }>;
  }>;
};

function productName(canonical: CanonicalProduct): string {
  return (typeof canonical.name === "string" && canonical.name.trim()) || "Product";
}

function brandName(canonical: CanonicalProduct): string | undefined {
  return ((canonical.brand as { name?: string } | undefined)?.name as string | undefined)?.trim() || undefined;
}

function categoryPath(canonical: CanonicalProduct): string[] {
  return ((canonical.category as { path?: string[] } | undefined)?.path as string[] | undefined)?.filter(Boolean) ?? [];
}

export function specificationGroups(canonical: CanonicalProduct) {
  const specs = canonical.specifications;
  return Array.isArray(specs) ? specs : [];
}

/** Map scraped specification table → attribute profile plan (groups + fields). */
export function canonicalToAttributePlan(canonical: CanonicalProduct): AttributePlanGroup[] {
  const plan: AttributePlanGroup[] = [];
  const groupIndex = new Map<string, AttributePlanGroup>();

  for (const rawGroup of specificationGroups(canonical)) {
    const groupName = (rawGroup.group as string | undefined)?.trim() || "Specifications";
    const key = groupName.toLowerCase();
    let target = groupIndex.get(key);
    if (!target) {
      target = { name: groupName, attributes: [] };
      groupIndex.set(key, target);
      plan.push(target);
    }

    const seen = new Set(target.attributes.map((row) => row.name.toLowerCase()));
    for (const item of rawGroup.items ?? []) {
      const label = (item.label as string | undefined)?.trim();
      const value = (item.value as string | undefined)?.trim() ?? "";
      if (!label || seen.has(label.toLowerCase())) continue;
      target.attributes.push({
        name: label,
        filterable: false,
        sample_value: value,
      });
      seen.add(label.toLowerCase());
    }
  }

  return plan.filter((group) => group.attributes.length > 0);
}

export function deriveAttributeProfileName(canonical: CanonicalProduct, categoryName?: string | null): string {
  const path = categoryPath(canonical);
  const leaf = path[path.length - 1] ?? categoryName ?? brandName(canonical);
  if (leaf) return `${leaf} Specifications`;
  return `${productName(canonical).slice(0, 40)} Specifications`;
}

function schemaFieldKey(group: string, field: string) {
  return `${group.trim().toLowerCase()}::${field.trim().toLowerCase()}`;
}

export function buildSpecsJsonFromSchema(
  canonical: CanonicalProduct,
  schema: ProfileSchemaField[],
): { json: string; fieldCount: number } {
  const lookup = new Map<string, ProfileSchemaField>();
  for (const field of schema) {
    lookup.set(schemaFieldKey(field.group, field.field), field);
  }

  const rows: Array<{
    group: string;
    field: string;
    value: string;
    attribute_id: string | null;
    group_id: string | null;
  }> = [];

  for (const rawGroup of specificationGroups(canonical)) {
    const groupName = (rawGroup.group as string | undefined)?.trim() || "Specifications";
    for (const item of rawGroup.items ?? []) {
      const label = (item.label as string | undefined)?.trim();
      const value = (item.value as string | undefined)?.trim() ?? "";
      if (!label) continue;

      const matched =
        lookup.get(schemaFieldKey(groupName, label)) ??
        [...lookup.values()].find((field) => field.field.toLowerCase() === label.toLowerCase());

      rows.push({
        group: matched?.group ?? groupName,
        field: matched?.field ?? label,
        value,
        attribute_id: matched?.id ?? null,
        group_id: matched?.groupId ?? null,
      });
    }
  }

  return { json: JSON.stringify(rows), fieldCount: rows.length };
}

function countPlanFields(plan: AttributePlanGroup[]) {
  return plan.reduce((total, group) => total + group.attributes.length, 0);
}

function countMissingFields(plan: AttributePlanGroup[], schema: ProfileSchemaField[]) {
  const known = new Set(schema.map((field) => schemaFieldKey(field.group, field.field)));
  let missing = 0;
  for (const group of plan) {
    for (const attr of group.attributes) {
      const key = schemaFieldKey(group.name, attr.name);
      if (!known.has(key)) missing += 1;
    }
  }
  return missing;
}

async function createProfileBulk(
  authorization: string,
  profileName: string,
  plan: AttributePlanGroup[],
): Promise<AttributeProfileDetail> {
  const body = await consumerAuthorizedFetch<{ data: AttributeProfileDetail }>(
    "/api/v1/catalog/attribute-profiles/bulk",
    authorization,
    {
      method: "POST",
      body: JSON.stringify({
        profile_name: profileName,
        groups: plan.map((group) => ({
          name: group.name,
          attributes: group.attributes.map((attr) => ({
            name: attr.name,
            filterable: attr.filterable,
            predefined_values: [],
          })),
        })),
      }),
    },
  );
  return body.data;
}

async function extendProfilePlan(
  authorization: string,
  profileId: string,
  plan: AttributePlanGroup[],
): Promise<{ groups_added: number; attributes_added: number }> {
  const detail = await consumerAuthorizedFetch<{
    data: {
      id: string;
      name: string;
      groups?: Array<{
        id: string;
        name: string;
        attributes?: Array<{
          id: string;
          name: string;
          group_id: string;
          is_filterable?: boolean;
          predefined_values?: string[];
        }>;
      }>;
    };
  }>(`/api/v1/catalog/attribute-profiles/${profileId}`, authorization);

  const profile = detail.data;
  type BulkAttr = {
    id?: string;
    name: string;
    filterable: boolean;
    predefined_values: string[];
  };
  type BulkGroup = { id?: string; name: string; attributes: BulkAttr[] };

  const merged = new Map<string, BulkGroup>();
  let groupsAdded = 0;
  let attributesAdded = 0;

  for (const group of profile.groups ?? []) {
    merged.set(group.name.trim().toLowerCase(), {
      id: group.id,
      name: group.name,
      attributes: (group.attributes ?? []).map((attr) => ({
        id: attr.id,
        name: attr.name,
        filterable: Boolean(attr.is_filterable),
        predefined_values: attr.predefined_values ?? [],
      })),
    });
  }

  for (const planGroup of plan) {
    const key = planGroup.name.trim().toLowerCase();
    let target = merged.get(key);
    if (!target) {
      target = { name: planGroup.name.trim(), attributes: [] };
      merged.set(key, target);
      groupsAdded += 1;
    }
    const existingNames = new Set(target.attributes.map((a) => a.name.trim().toLowerCase()));
    for (const planAttr of planGroup.attributes) {
      const attrKey = planAttr.name.trim().toLowerCase();
      if (existingNames.has(attrKey)) continue;
      target.attributes.push({
        name: planAttr.name.trim(),
        filterable: planAttr.filterable,
        predefined_values: [],
      });
      existingNames.add(attrKey);
      attributesAdded += 1;
    }
  }

  if (groupsAdded || attributesAdded) {
    await consumerAuthorizedFetch(`/api/v1/catalog/attribute-profiles/${profileId}/bulk`, authorization, {
      method: "PUT",
      body: JSON.stringify({
        profile_name: profile.name,
        groups: [...merged.values()],
      }),
    });
  }

  return { groups_added: groupsAdded, attributes_added: attributesAdded };
}

/**
 * Step-by-step attribute provisioning:
 * 1. Pick or create attribute profile
 * 2. Create groups + attributes from scraped specs
 * 3. Bind spec values to profile fields (attribute_id / group_id)
 */
export async function provisionProductSpecifications(
  authorization: string,
  canonical: CanonicalProduct,
  input: {
    profileId?: string | null;
    profileName?: string | null;
    categoryName?: string | null;
  } = {},
): Promise<ProvisionSpecsResult> {
  const plan = canonicalToAttributePlan(canonical);
  if (!plan.length) {
    return {
      profileId: input.profileId ?? "",
      profileName: input.profileName ?? "",
      customSpecsJson: "[]",
      groupsCreated: 0,
      attributesCreated: 0,
      fieldCount: 0,
    };
  }

  let profileId = input.profileId ?? null;
  let profileName = input.profileName ?? null;
  let groupsCreated = 0;
  let attributesCreated = 0;

  if (!profileId) {
    const profiles = await listAttributeProfilesLite(authorization);
    const chosen = pickBestAttributeProfile(profiles, {
      name: productName(canonical),
      brand: brandName(canonical),
      text: plan.map((g) => `${g.name} ${g.attributes.map((a) => a.name).join(" ")}`).join(" "),
    });
    if (chosen) {
      profileId = chosen.id;
      profileName = chosen.name;
    }
  }

  if (!profileId) {
    profileName = deriveAttributeProfileName(canonical, input.categoryName);
    const created = await createProfileBulk(authorization, profileName, plan);
    profileId = created.id;
    groupsCreated = plan.length;
    attributesCreated = countPlanFields(plan);
  } else {
    const existing = await loadProfileSchema(profileId, authorization);
    const schema = existing?.schema ?? [];
    const missing = countMissingFields(plan, schema);
    if (missing > 0) {
      const applied = await extendProfilePlan(authorization, profileId, plan);
      groupsCreated = applied.groups_added;
      attributesCreated = applied.attributes_added;
    }
    profileName = profileName ?? existing?.profileName ?? deriveAttributeProfileName(canonical, input.categoryName);
  }

  const loaded = await loadProfileSchema(profileId, authorization);
  if (!loaded?.schema.length) {
    throw new Error("Attribute profile was created but schema could not be loaded.");
  }

  const bound = buildSpecsJsonFromSchema(canonical, loaded.schema);
  return {
    profileId,
    profileName: profileName ?? loaded.profileName,
    customSpecsJson: bound.json,
    groupsCreated,
    attributesCreated,
    fieldCount: bound.fieldCount,
  };
}

export type StoredSpecRow = {
  group?: string;
  field?: string;
  value?: string;
  attribute_id?: string | null;
  group_id?: string | null;
};

export function parseStoredSpecRows(customSpecsJson: string): StoredSpecRow[] {
  try {
    const parsed = JSON.parse(customSpecsJson) as unknown;
    return Array.isArray(parsed) ? (parsed as StoredSpecRow[]) : [];
  } catch {
    return [];
  }
}

/** Persist specification values on the product (catalog_product_attribute_values). */
export async function applyProductSpecificationValues(
  authorization: string,
  productId: string,
  profileId: string | null,
  customSpecsJson: string,
): Promise<number> {
  const values = parseStoredSpecRows(customSpecsJson)
    .filter((row) => typeof row.attribute_id === "string" && row.attribute_id.trim())
    .map((row, idx) => ({
      attribute_id: row.attribute_id as string,
      value: String(row.value ?? "").trim(),
      sort_order: idx,
    }));

  if (!values.length) return 0;

  await consumerAuthorizedFetch(`/api/v1/catalog/products/${productId}/specs`, authorization, {
    method: "PUT",
    body: JSON.stringify({
      attribute_profile_id: profileId,
      values,
    }),
  });

  return values.length;
}
