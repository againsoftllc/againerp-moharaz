import { apiFetch } from "@/lib/api/client";

export type BkashPluginRecord = {
  id: string;
  installed: boolean;
  enabled: boolean;
  environment: "sandbox" | "production";
  username: string;
  password_set: boolean;
  app_key_set: boolean;
  app_key_hint: string;
  app_secret_set: boolean;
  checkout_enabled: boolean;
  auto_verify: boolean;
  connection_status: string;
  connection_message: string;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BkashPluginUpdateInput = Partial<{
  enabled: boolean;
  environment: "sandbox" | "production";
  username: string;
  password: string;
  app_key: string;
  app_secret: string;
  checkout_enabled: boolean;
  auto_verify: boolean;
  verify_connection: boolean;
}>;

const BASE = "/api/v1/plugins/bkash";

export async function fetchBkashPlugin(): Promise<BkashPluginRecord> {
  const res = await apiFetch<{ data: BkashPluginRecord }>(BASE);
  return res.data;
}

export async function installBkashPlugin(): Promise<BkashPluginRecord> {
  const res = await apiFetch<{ data: BkashPluginRecord }>(`${BASE}/install`, {
    method: "POST",
  });
  return res.data;
}

export async function uninstallBkashPlugin(): Promise<BkashPluginRecord> {
  const res = await apiFetch<{ data: BkashPluginRecord }>(`${BASE}/install`, {
    method: "DELETE",
  });
  return res.data;
}

export async function updateBkashPlugin(
  input: BkashPluginUpdateInput,
): Promise<BkashPluginRecord> {
  const res = await apiFetch<{ data: BkashPluginRecord }>(BASE, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return res.data;
}
