import { apiFetch } from "@/lib/api/client";

export type SmartPcBuilderPluginRecord = {
  id: string;
  company_id: string;
  installed: boolean;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type SmartPcBuilderPluginUpdateInput = Partial<{
  enabled: boolean;
}>;

type ApiResponse = { data: SmartPcBuilderPluginRecord };

export async function fetchSmartPcBuilderPlugin(): Promise<SmartPcBuilderPluginRecord> {
  const res = await apiFetch<ApiResponse>("/api/v1/plugins/smart-pc-builder");
  return res.data;
}

export async function installSmartPcBuilderPlugin(): Promise<SmartPcBuilderPluginRecord> {
  const res = await apiFetch<ApiResponse>("/api/v1/plugins/smart-pc-builder/install", {
    method: "POST",
  });
  return res.data;
}

export async function uninstallSmartPcBuilderPlugin(): Promise<SmartPcBuilderPluginRecord> {
  const res = await apiFetch<ApiResponse>("/api/v1/plugins/smart-pc-builder/install", {
    method: "DELETE",
  });
  return res.data;
}

export async function updateSmartPcBuilderPlugin(
  patch: SmartPcBuilderPluginUpdateInput,
): Promise<SmartPcBuilderPluginRecord> {
  const res = await apiFetch<ApiResponse>("/api/v1/plugins/smart-pc-builder", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return res.data;
}
