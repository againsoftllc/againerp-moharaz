import type { ConfiguratorProfile } from "@/lib/configurator/types";

export type ApiConfiguratorProfile = {
  id: string;
  company_id: string;
  name: string;
  slug: string;
  profile_type: ConfiguratorProfile["profileType"];
  description: string | null;
  is_default: boolean;
  status: ConfiguratorProfile["status"];
  category_count: number;
  rule_count: number;
  template_count: number;
  build_count: number;
  created_at: string;
  updated_at: string;
};

export type ApiConfiguratorProfileListResponse = {
  data: ApiConfiguratorProfile[];
  meta: { count: number };
  errors: string[];
};

export type ApiConfiguratorProfileResponse = {
  data: ApiConfiguratorProfile;
  errors: string[];
};

export function apiProfileToConfiguratorProfile(row: ApiConfiguratorProfile): ConfiguratorProfile {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    profileType: row.profile_type,
    description: row.description ?? undefined,
    isDefault: row.is_default,
    status: row.status,
    categoryCount: row.category_count,
    ruleCount: row.rule_count,
    templateCount: row.template_count,
    buildCount: row.build_count,
    updatedAt: row.updated_at.slice(0, 10),
    createdAt: row.created_at.slice(0, 10),
  };
}

export type CreateConfiguratorProfileInput = {
  name: string;
  slug: string;
  profileType?: ConfiguratorProfile["profileType"];
  description?: string;
  isDefault?: boolean;
  status?: ConfiguratorProfile["status"];
};

export type UpdateConfiguratorProfileInput = Partial<CreateConfiguratorProfileInput>;

function profileInputToApiPayload(
  input: CreateConfiguratorProfileInput | UpdateConfiguratorProfileInput,
) {
  const payload: Record<string, unknown> = {};
  if ("name" in input && input.name !== undefined) payload.name = input.name;
  if ("slug" in input && input.slug !== undefined) payload.slug = input.slug;
  if ("profileType" in input && input.profileType !== undefined) {
    payload.profile_type = input.profileType;
  }
  if ("description" in input && input.description !== undefined) {
    payload.description = input.description;
  }
  if ("isDefault" in input && input.isDefault !== undefined) payload.is_default = input.isDefault;
  if ("status" in input && input.status !== undefined) payload.status = input.status;
  return payload;
}

export function profileToApiCreatePayload(input: CreateConfiguratorProfileInput) {
  return profileInputToApiPayload(input);
}

export function profileToApiUpdatePayload(input: UpdateConfiguratorProfileInput) {
  return profileInputToApiPayload(input);
}

export function partialProfileToApiUpdate(
  data: Partial<ConfiguratorProfile>,
): UpdateConfiguratorProfileInput {
  const input: UpdateConfiguratorProfileInput = {};
  if (data.name !== undefined) input.name = data.name;
  if (data.slug !== undefined) input.slug = data.slug;
  if (data.profileType !== undefined) input.profileType = data.profileType;
  if (data.description !== undefined) input.description = data.description;
  if (data.isDefault !== undefined) input.isDefault = data.isDefault;
  if (data.status !== undefined) input.status = data.status;
  return input;
}
