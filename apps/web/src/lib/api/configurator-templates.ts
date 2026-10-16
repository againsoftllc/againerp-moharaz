import type { BuildComponentPick, ConfiguratorTemplate } from "@/lib/configurator/types";

export type ApiBuildComponentPick = {
  category_id: string;
  category_name: string;
  product_id?: string | null;
  product_name?: string | null;
  quantity: number;
};

export type ApiConfiguratorTemplate = {
  id: string;
  company_id: string;
  profile_id: string;
  profile_name: string;
  name: string;
  slug: string;
  description: string | null;
  components: ApiBuildComponentPick[];
  is_featured: boolean;
  status: ConfiguratorTemplate["status"];
  use_count: number;
  created_at: string;
  updated_at: string;
};

export type ApiConfiguratorTemplateListResponse = {
  data: ApiConfiguratorTemplate[];
  meta: { count: number };
  errors: string[];
};

export type ApiConfiguratorTemplateResponse = {
  data: ApiConfiguratorTemplate;
  errors: string[];
};

function apiComponentToBuildComponentPick(row: ApiBuildComponentPick): BuildComponentPick {
  return {
    categoryId: row.category_id,
    categoryName: row.category_name,
    productId: row.product_id ?? undefined,
    productName: row.product_name ?? undefined,
    quantity: row.quantity,
  };
}

function buildComponentPickToApi(row: BuildComponentPick): ApiBuildComponentPick {
  return {
    category_id: row.categoryId,
    category_name: row.categoryName,
    product_id: row.productId ?? null,
    product_name: row.productName ?? null,
    quantity: row.quantity,
  };
}

export function apiTemplateToConfiguratorTemplate(row: ApiConfiguratorTemplate): ConfiguratorTemplate {
  return {
    id: row.id,
    profileId: row.profile_id,
    profileName: row.profile_name,
    name: row.name,
    slug: row.slug,
    description: row.description ?? undefined,
    components: row.components.map(apiComponentToBuildComponentPick),
    isFeatured: row.is_featured,
    status: row.status,
    useCount: row.use_count,
    updatedAt: row.updated_at.slice(0, 10),
  };
}

export type CreateConfiguratorTemplateInput = {
  profileId: string;
  name: string;
  slug: string;
  description?: string;
  components?: BuildComponentPick[];
  isFeatured?: boolean;
  status?: ConfiguratorTemplate["status"];
};

export type UpdateConfiguratorTemplateInput = Partial<CreateConfiguratorTemplateInput>;

function templateInputToApiPayload(
  input: CreateConfiguratorTemplateInput | UpdateConfiguratorTemplateInput,
) {
  const payload: Record<string, unknown> = {};
  if ("profileId" in input && input.profileId !== undefined) payload.profile_id = input.profileId;
  if ("name" in input && input.name !== undefined) payload.name = input.name;
  if ("slug" in input && input.slug !== undefined) payload.slug = input.slug;
  if ("description" in input && input.description !== undefined) payload.description = input.description;
  if ("components" in input && input.components !== undefined) {
    payload.components = input.components.map(buildComponentPickToApi);
  }
  if ("isFeatured" in input && input.isFeatured !== undefined) payload.is_featured = input.isFeatured;
  if ("status" in input && input.status !== undefined) payload.status = input.status;
  return payload;
}

export function templateToApiCreatePayload(input: CreateConfiguratorTemplateInput) {
  return templateInputToApiPayload(input);
}

export function templateToApiUpdatePayload(input: UpdateConfiguratorTemplateInput) {
  return templateInputToApiPayload(input);
}

export function partialTemplateToApiUpdate(
  data: Partial<ConfiguratorTemplate>,
): UpdateConfiguratorTemplateInput {
  const input: UpdateConfiguratorTemplateInput = {};
  if (data.profileId !== undefined) input.profileId = data.profileId;
  if (data.name !== undefined) input.name = data.name;
  if (data.slug !== undefined) input.slug = data.slug;
  if (data.description !== undefined) input.description = data.description;
  if (data.components !== undefined) input.components = data.components;
  if (data.isFeatured !== undefined) input.isFeatured = data.isFeatured;
  if (data.status !== undefined) input.status = data.status;
  return input;
}
