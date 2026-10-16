import { apiFetch } from "@/lib/api/client";

export type PaypalPluginRecord = {
  id: string;
  installed: boolean;
  enabled: boolean;
  environment: "sandbox" | "production";
  client_id: string;
  client_id_set: boolean;
  client_id_hint: string;
  client_secret_set: boolean;
  currency: string;
  bdt_per_usd: string | number;
  checkout_enabled: boolean;
  connection_status: string;
  connection_message: string;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PaypalPluginUpdateInput = Partial<{
  enabled: boolean;
  environment: "sandbox" | "production";
  client_id: string;
  client_secret: string;
  currency: string;
  bdt_per_usd: number;
  checkout_enabled: boolean;
  verify_connection: boolean;
}>;

const BASE = "/api/v1/plugins/paypal";

export async function fetchPaypalPlugin(): Promise<PaypalPluginRecord> {
  const res = await apiFetch<{ data: PaypalPluginRecord }>(BASE);
  return res.data;
}

export async function installPaypalPlugin(): Promise<PaypalPluginRecord> {
  const res = await apiFetch<{ data: PaypalPluginRecord }>(`${BASE}/install`, {
    method: "POST",
  });
  return res.data;
}

export async function uninstallPaypalPlugin(): Promise<PaypalPluginRecord> {
  const res = await apiFetch<{ data: PaypalPluginRecord }>(`${BASE}/install`, {
    method: "DELETE",
  });
  return res.data;
}

export async function updatePaypalPlugin(
  input: PaypalPluginUpdateInput,
): Promise<PaypalPluginRecord> {
  const res = await apiFetch<{ data: PaypalPluginRecord }>(BASE, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return res.data;
}
