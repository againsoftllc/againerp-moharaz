import { apiFetch } from "@/lib/api/client";

export type StripePluginRecord = {
  id: string;
  installed: boolean;
  enabled: boolean;
  environment: "sandbox" | "production";
  publishable_key: string;
  publishable_key_set: boolean;
  publishable_key_hint: string;
  secret_key_set: boolean;
  currency: string;
  bdt_per_usd: string | number;
  checkout_enabled: boolean;
  connection_status: string;
  connection_message: string;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
};

export type StripePluginUpdateInput = Partial<{
  enabled: boolean;
  environment: "sandbox" | "production";
  publishable_key: string;
  secret_key: string;
  currency: string;
  bdt_per_usd: number;
  checkout_enabled: boolean;
  verify_connection: boolean;
}>;

const BASE = "/api/v1/plugins/stripe";

export async function fetchStripePlugin(): Promise<StripePluginRecord> {
  const res = await apiFetch<{ data: StripePluginRecord }>(BASE);
  return res.data;
}

export async function installStripePlugin(): Promise<StripePluginRecord> {
  const res = await apiFetch<{ data: StripePluginRecord }>(`${BASE}/install`, {
    method: "POST",
  });
  return res.data;
}

export async function uninstallStripePlugin(): Promise<StripePluginRecord> {
  const res = await apiFetch<{ data: StripePluginRecord }>(`${BASE}/install`, {
    method: "DELETE",
  });
  return res.data;
}

export async function updateStripePlugin(
  input: StripePluginUpdateInput,
): Promise<StripePluginRecord> {
  const res = await apiFetch<{ data: StripePluginRecord }>(BASE, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return res.data;
}
