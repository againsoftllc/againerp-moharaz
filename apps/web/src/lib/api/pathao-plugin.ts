import { apiFetch } from "@/lib/api/client";

export type PathaoPluginRecord = {
  id: string;
  installed: boolean;
  enabled: boolean;
  environment: "sandbox" | "production";
  client_id: string;
  client_id_set: boolean;
  client_id_hint: string;
  client_secret_set: boolean;
  username: string;
  password_set: boolean;
  store_id: string;
  pickup_address: string;
  pickup_phone: string;
  default_service: string;
  item_type: string;
  auto_create_shipment: boolean;
  sync_tracking: boolean;
  cod_enabled: boolean;
  webhook_url: string;
  connection_status: string;
  connection_message: string;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PathaoPluginUpdateInput = Partial<{
  enabled: boolean;
  environment: "sandbox" | "production";
  client_id: string;
  client_secret: string;
  username: string;
  password: string;
  store_id: string;
  pickup_address: string;
  pickup_phone: string;
  default_service: string;
  item_type: string;
  auto_create_shipment: boolean;
  sync_tracking: boolean;
  cod_enabled: boolean;
  webhook_url: string;
  verify_connection: boolean;
}>;

const BASE = "/api/v1/plugins/pathao";

export async function fetchPathaoPlugin(): Promise<PathaoPluginRecord> {
  const res = await apiFetch<{ data: PathaoPluginRecord }>(BASE);
  return res.data;
}

export async function installPathaoPlugin(): Promise<PathaoPluginRecord> {
  const res = await apiFetch<{ data: PathaoPluginRecord }>(`${BASE}/install`, {
    method: "POST",
  });
  return res.data;
}

export async function uninstallPathaoPlugin(): Promise<PathaoPluginRecord> {
  const res = await apiFetch<{ data: PathaoPluginRecord }>(`${BASE}/install`, {
    method: "DELETE",
  });
  return res.data;
}

export async function updatePathaoPlugin(
  input: PathaoPluginUpdateInput,
): Promise<PathaoPluginRecord> {
  const res = await apiFetch<{ data: PathaoPluginRecord }>(BASE, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return res.data;
}

export type PathaoConsignmentResult = {
  created: boolean;
  skipped: boolean;
  consignment_id: string;
  tracking_url: string;
  message: string;
};

/** Soft: returns skipped=true when Pathao plugin is not installed/ready. */
export async function createPathaoConsignmentForOrder(
  orderId: string,
  input?: { mark_shipped?: boolean; notes?: string },
): Promise<PathaoConsignmentResult> {
  const res = await apiFetch<{ data: PathaoConsignmentResult }>(
    `/api/v1/commerce/orders/${orderId}/pathao-consignment`,
    {
      method: "POST",
      body: JSON.stringify(input ?? {}),
    },
  );
  return res.data;
}
