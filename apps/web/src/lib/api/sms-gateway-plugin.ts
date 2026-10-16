import { apiFetch } from "@/lib/api/client";

export type SmsGatewayPluginId = "bulksms-bd" | "ssl-wireless" | "zaman-it" | "alpha-sms";

export const SMS_GATEWAY_PLUGIN_IDS: readonly SmsGatewayPluginId[] = [
  "bulksms-bd",
  "ssl-wireless",
  "zaman-it",
  "alpha-sms",
];

export function isSmsGatewayPluginId(id: string): id is SmsGatewayPluginId {
  return (SMS_GATEWAY_PLUGIN_IDS as readonly string[]).includes(id);
}

export type SmsGatewayPluginRecord = {
  id: string;
  provider: string;
  installed: boolean;
  enabled: boolean;
  environment: "sandbox" | "production";
  api_key_set: boolean;
  api_key_hint: string;
  api_secret_set: boolean;
  sender_id: string;
  base_url: string;
  connection_status: string;
  connection_message: string;
  verified_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type SmsGatewayPluginUpdateInput = Partial<{
  enabled: boolean;
  environment: "sandbox" | "production";
  api_key: string;
  api_secret: string;
  sender_id: string;
  base_url: string;
  verify_connection: boolean;
  test_phone: string;
}>;

function base(pluginId: SmsGatewayPluginId) {
  return `/api/v1/plugins/sms-gateway/${pluginId}`;
}

export async function fetchSmsGatewayPlugin(
  pluginId: SmsGatewayPluginId,
): Promise<SmsGatewayPluginRecord> {
  const res = await apiFetch<{ data: SmsGatewayPluginRecord }>(base(pluginId));
  return res.data;
}

export async function installSmsGatewayPlugin(
  pluginId: SmsGatewayPluginId,
): Promise<SmsGatewayPluginRecord> {
  const res = await apiFetch<{ data: SmsGatewayPluginRecord }>(`${base(pluginId)}/install`, {
    method: "POST",
  });
  return res.data;
}

export async function uninstallSmsGatewayPlugin(
  pluginId: SmsGatewayPluginId,
): Promise<SmsGatewayPluginRecord> {
  const res = await apiFetch<{ data: SmsGatewayPluginRecord }>(`${base(pluginId)}/install`, {
    method: "DELETE",
  });
  return res.data;
}

export async function updateSmsGatewayPlugin(
  pluginId: SmsGatewayPluginId,
  input: SmsGatewayPluginUpdateInput,
): Promise<SmsGatewayPluginRecord> {
  const res = await apiFetch<{ data: SmsGatewayPluginRecord }>(base(pluginId), {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function testSmsGatewayPlugin(
  pluginId: SmsGatewayPluginId,
  phone: string,
  message?: string,
): Promise<{ ok: boolean; message: string }> {
  return apiFetch<{ ok: boolean; message: string }>(`${base(pluginId)}/test`, {
    method: "POST",
    body: JSON.stringify({ phone, message }),
  });
}
