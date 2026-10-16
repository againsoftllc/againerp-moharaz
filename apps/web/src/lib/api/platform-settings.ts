import { apiFetch } from "./client";

export type PlatformSetting = {
  key: string;
  value: string | null;
  description: string | null;
  is_secret: boolean;
  group: string;
  label: string;
  configured: boolean;
};

export async function fetchPlatformSettings(): Promise<PlatformSetting[]> {
  return apiFetch<PlatformSetting[]>("/api/v1/platform-settings");
}

export async function upsertPlatformSetting(key: string, value: string): Promise<PlatformSetting> {
  return apiFetch<PlatformSetting>(`/api/v1/platform-settings/${key}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
}

export async function clearPlatformSetting(key: string): Promise<void> {
  await apiFetch(`/api/v1/platform-settings/${key}`, { method: "DELETE" });
}

export async function testPlatformSetting(key: string): Promise<{ ok: boolean; status: string }> {
  return apiFetch<{ ok: boolean; status: string }>(`/api/v1/platform-settings/${key}/test`, {
    method: "POST",
  });
}
