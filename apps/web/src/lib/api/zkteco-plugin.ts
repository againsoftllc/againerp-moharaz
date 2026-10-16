import { apiFetch } from "@/lib/api/client";

export type ZktecoPluginRecord = {
  id: string;
  installed: boolean;
  enabled: boolean;
  receiver_enabled: boolean;
  allowed_serials: string;
  raw_traffic_enabled: boolean;
  device_name: string;
  device_serial_number: string;
  firmware_version: string;
  push_version: string;
  server_address: string;
  server_port: number;
  https_enabled: boolean;
  connection_status: string;
  connection_message: string;
  last_device_seen_at: string | null;
  last_device_sn: string;
  adms_base_url: string;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ZktecoPluginUpdateInput = Partial<{
  enabled: boolean;
  receiver_enabled: boolean;
  allowed_serials: string;
  raw_traffic_enabled: boolean;
  device_name: string;
  device_serial_number: string;
  firmware_version: string;
  push_version: string;
  server_address: string;
  server_port: number;
  https_enabled: boolean;
  verify_connection: boolean;
}>;

export type ZktecoPunchItem = {
  id: number;
  serial_number: string;
  employee_code: string;
  punch_time: string;
  verify_mode: number | null;
  inout_mode: number | null;
  source_table: string | null;
  raw_payload: string | null;
  received_at: string | null;
  employee_id?: string | null;
  employee_name?: string | null;
  matched?: boolean;
};

export type ZktecoPunchesResult = {
  items: ZktecoPunchItem[];
  page: number;
  page_size: number;
  total: number;
  summary: {
    total_punches: number;
    today_punches: number;
    device_count: number;
  };
};

const BASE = "/api/v1/plugins/zkteco";

export async function fetchZktecoPlugin(): Promise<ZktecoPluginRecord> {
  const res = await apiFetch<{ data: ZktecoPluginRecord }>(BASE);
  return res.data;
}

export async function installZktecoPlugin(): Promise<ZktecoPluginRecord> {
  const res = await apiFetch<{ data: ZktecoPluginRecord }>(`${BASE}/install`, {
    method: "POST",
  });
  return res.data;
}

export async function uninstallZktecoPlugin(): Promise<ZktecoPluginRecord> {
  const res = await apiFetch<{ data: ZktecoPluginRecord }>(`${BASE}/install`, {
    method: "DELETE",
  });
  return res.data;
}

export async function updateZktecoPlugin(
  input: ZktecoPluginUpdateInput,
): Promise<ZktecoPluginRecord> {
  const res = await apiFetch<{ data: ZktecoPluginRecord }>(BASE, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function fetchZktecoPunches(params?: {
  page?: number;
  pageSize?: number;
  employeeCode?: string;
  sn?: string;
  fromDate?: string;
  toDate?: string;
}): Promise<ZktecoPunchesResult> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.pageSize) qs.set("page_size", String(params.pageSize));
  if (params?.employeeCode) qs.set("employee_code", params.employeeCode);
  if (params?.sn) qs.set("sn", params.sn);
  if (params?.fromDate) qs.set("from_date", params.fromDate);
  if (params?.toDate) qs.set("to_date", params.toDate);
  const q = qs.toString();
  const res = await apiFetch<{ data: ZktecoPunchesResult }>(
    `${BASE}/punches${q ? `?${q}` : ""}`,
  );
  return res.data;
}
