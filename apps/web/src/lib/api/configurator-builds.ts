import type { BuildComponentPick, SavedBuild } from "@/lib/configurator/types";

export type ApiBuildComponentPick = {
  category_id: string;
  category_name: string;
  product_id?: string | null;
  product_name?: string | null;
  quantity: number;
};

export type ApiConfiguratorBuild = {
  id: string;
  company_id: string;
  profile_id: string;
  profile_name: string;
  name: string;
  build_code: string;
  customer_name: string | null;
  user_name: string | null;
  components: ApiBuildComponentPick[];
  total_price: number | string;
  compatibility_status: SavedBuild["compatibilityStatus"];
  status: SavedBuild["status"];
  created_at: string;
  updated_at: string;
};

export type ApiConfiguratorBuildListResponse = {
  data: ApiConfiguratorBuild[];
  meta: { count: number };
  errors: string[];
};

export type ApiConfiguratorBuildResponse = {
  data: ApiConfiguratorBuild;
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

export function apiBuildToSavedBuild(row: ApiConfiguratorBuild): SavedBuild {
  return {
    id: row.id,
    profileId: row.profile_id,
    profileName: row.profile_name,
    name: row.name,
    buildCode: row.build_code,
    customerName: row.customer_name ?? undefined,
    userName: row.user_name ?? undefined,
    components: row.components.map(apiComponentToBuildComponentPick),
    totalPrice: Number(row.total_price),
    compatibilityStatus: row.compatibility_status,
    status: row.status,
    updatedAt: row.updated_at.slice(0, 10),
    createdAt: row.created_at.slice(0, 10),
  };
}

export type UpdateConfiguratorBuildInput = {
  name?: string;
  status?: SavedBuild["status"];
  compatibilityStatus?: SavedBuild["compatibilityStatus"];
};

export function buildToApiUpdatePayload(input: UpdateConfiguratorBuildInput) {
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.status !== undefined) payload.status = input.status;
  if (input.compatibilityStatus !== undefined) {
    payload.compatibility_status = input.compatibilityStatus;
  }
  return payload;
}

export function partialBuildToApiUpdate(data: Partial<SavedBuild>): UpdateConfiguratorBuildInput {
  const input: UpdateConfiguratorBuildInput = {};
  if (data.name !== undefined) input.name = data.name;
  if (data.status !== undefined) input.status = data.status;
  if (data.compatibilityStatus !== undefined) input.compatibilityStatus = data.compatibilityStatus;
  return input;
}
