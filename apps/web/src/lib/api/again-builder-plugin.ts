import { apiFetch } from "@/lib/api/client";

export type AgainBuilderPluginRecord = {
  id: string;
  company_id: string;
  installed: boolean;
  enabled: boolean;
  enabled_builders: string[];
  default_profile_slug: string;
  admin_builders_href: string;
  created_at: string;
  updated_at: string;
};

export type AgainBuilderPluginUpdateInput = Partial<{
  enabled: boolean;
  enabled_builders: string[];
  default_profile_slug: string;
}>;

type ApiResponse = { data: AgainBuilderPluginRecord };

export async function fetchAgainBuilderPlugin(): Promise<AgainBuilderPluginRecord> {
  const res = await apiFetch<ApiResponse>("/api/v1/plugins/again-builder");
  return res.data;
}

export async function installAgainBuilderPlugin(): Promise<AgainBuilderPluginRecord> {
  const res = await apiFetch<ApiResponse>("/api/v1/plugins/again-builder/install", {
    method: "POST",
  });
  return res.data;
}

export async function uninstallAgainBuilderPlugin(): Promise<AgainBuilderPluginRecord> {
  const res = await apiFetch<ApiResponse>("/api/v1/plugins/again-builder/install", {
    method: "DELETE",
  });
  return res.data;
}

export async function updateAgainBuilderPlugin(
  patch: AgainBuilderPluginUpdateInput,
): Promise<AgainBuilderPluginRecord> {
  const res = await apiFetch<ApiResponse>("/api/v1/plugins/again-builder", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return res.data;
}

export function isAgainBuilderActive(plugin: AgainBuilderPluginRecord | null | undefined): boolean {
  return Boolean(plugin?.installed && plugin?.enabled);
}
