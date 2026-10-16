import { apiFetch } from "@/lib/api/client";

export type AgainDropApiPluginRecord = {
  id: string;
  installed: boolean;
  enabled: boolean;
  base_url: string;
  api_key_set: boolean;
  api_key_hint: string;
  use_server_key: boolean;
  server_key_available: boolean;
  environment: "sandbox" | "production";
  timeout_ms: number;
  retry_count: number;
  default_platform: "taobao" | "alibaba";
  default_lang: string;
  connection_status: string;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AgainDropApiPluginUpdateInput = Partial<{
  enabled: boolean;
  base_url: string;
  api_key: string;
  use_server_key: boolean;
  environment: "sandbox" | "production";
  timeout_ms: number;
  retry_count: number;
  default_platform: "taobao" | "alibaba";
  default_lang: string;
}>;

export type AgainDropApiTestResult = {
  ok: boolean;
  message: string;
  latency_ms: number;
  via: "server" | "plugin";
  sample_count: number;
};

const BASE = "/api/v1/plugins/again-drop-api";

export async function fetchAgainDropApiPlugin(): Promise<AgainDropApiPluginRecord> {
  const res = await apiFetch<{ data: AgainDropApiPluginRecord }>(BASE);
  return res.data;
}

export async function installAgainDropApiPlugin(): Promise<AgainDropApiPluginRecord> {
  const res = await apiFetch<{ data: AgainDropApiPluginRecord }>(`${BASE}/install`, {
    method: "POST",
  });
  return res.data;
}

export async function uninstallAgainDropApiPlugin(): Promise<AgainDropApiPluginRecord> {
  const res = await apiFetch<{ data: AgainDropApiPluginRecord }>(`${BASE}/install`, {
    method: "DELETE",
  });
  return res.data;
}

export async function updateAgainDropApiPlugin(
  input: AgainDropApiPluginUpdateInput,
): Promise<AgainDropApiPluginRecord> {
  const res = await apiFetch<{ data: AgainDropApiPluginRecord }>(BASE, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function testAgainDropApiPlugin(): Promise<{
  result: AgainDropApiTestResult;
  plugin: AgainDropApiPluginRecord;
}> {
  const res = await apiFetch<{ data: AgainDropApiTestResult; plugin: AgainDropApiPluginRecord }>(
    `${BASE}/test`,
    { method: "POST" },
  );
  return { result: res.data, plugin: res.plugin };
}
