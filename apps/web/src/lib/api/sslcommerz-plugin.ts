import { apiFetch } from "@/lib/api/client";

export type SslcommerzPluginRecord = {
  id: string;
  installed: boolean;
  enabled: boolean;
  environment: "sandbox" | "production";
  store_id: string;
  store_password_set: boolean;
  checkout_enabled: boolean;
  connection_status: string;
  connection_message: string;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SslcommerzPluginUpdateInput = Partial<{
  enabled: boolean;
  environment: "sandbox" | "production";
  store_id: string;
  store_password: string;
  checkout_enabled: boolean;
  verify_connection: boolean;
}>;

const BASE = "/api/v1/plugins/sslcommerz";

export async function fetchSslcommerzPlugin(): Promise<SslcommerzPluginRecord> {
  const res = await apiFetch<{ data: SslcommerzPluginRecord }>(BASE);
  return res.data;
}

export async function installSslcommerzPlugin(): Promise<SslcommerzPluginRecord> {
  const res = await apiFetch<{ data: SslcommerzPluginRecord }>(`${BASE}/install`, {
    method: "POST",
  });
  return res.data;
}

export async function uninstallSslcommerzPlugin(): Promise<SslcommerzPluginRecord> {
  const res = await apiFetch<{ data: SslcommerzPluginRecord }>(`${BASE}/install`, {
    method: "DELETE",
  });
  return res.data;
}

export async function updateSslcommerzPlugin(
  input: SslcommerzPluginUpdateInput,
): Promise<SslcommerzPluginRecord> {
  const res = await apiFetch<{ data: SslcommerzPluginRecord }>(BASE, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return res.data;
}
