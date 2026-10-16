import { apiFetch } from "@/lib/api/client";
import type { CompatibilityRule, CompatibilityRuleBody } from "@/lib/compatibility/types";

type ApiCompatibilityRule = {
  id: string;
  company_id: string;
  name: string;
  code: string;
  configurator_profile_id: string;
  configurator_profile_name: string;
  description: string | null;
  priority: number;
  active: boolean;
  body: CompatibilityRuleBody;
  created_at: string;
  updated_at: string;
};

type ListResponse = { data: ApiCompatibilityRule[]; meta: { count: number } };
type ItemResponse = { data: ApiCompatibilityRule };

function toRule(row: ApiCompatibilityRule): CompatibilityRule {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    configuratorProfileId: row.configurator_profile_id,
    configuratorProfileName: row.configurator_profile_name,
    description: row.description ?? undefined,
    priority: row.priority,
    active: row.active,
    body: row.body,
    updatedAt: row.updated_at.slice(0, 10),
  };
}

export async function fetchCompatibilityRules(): Promise<CompatibilityRule[]> {
  const res = await apiFetch<ListResponse>("/api/v1/configurator/compatibility-rules");
  return res.data.map(toRule);
}

export type CompatibilityRuleInput = {
  name: string;
  code?: string;
  configuratorProfileId: string;
  configuratorProfileName: string;
  description?: string;
  priority: number;
  active: boolean;
  body: CompatibilityRuleBody;
};

export async function createCompatibilityRule(input: CompatibilityRuleInput): Promise<CompatibilityRule> {
  const res = await apiFetch<ItemResponse>("/api/v1/configurator/compatibility-rules", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      code: input.code,
      configurator_profile_id: input.configuratorProfileId,
      configurator_profile_name: input.configuratorProfileName,
      description: input.description,
      priority: input.priority,
      active: input.active,
      body: input.body,
    }),
  });
  return toRule(res.data);
}

export async function updateCompatibilityRule(
  id: string,
  input: CompatibilityRuleInput,
): Promise<CompatibilityRule> {
  const res = await apiFetch<ItemResponse>(`/api/v1/configurator/compatibility-rules/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: input.name,
      code: input.code,
      configurator_profile_id: input.configuratorProfileId,
      configurator_profile_name: input.configuratorProfileName,
      description: input.description,
      priority: input.priority,
      active: input.active,
      body: input.body,
    }),
  });
  return toRule(res.data);
}

export async function deleteCompatibilityRule(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/configurator/compatibility-rules/${id}`, { method: "DELETE" });
}
