import { apiFetch } from "@/lib/api/client";
import type { AdminUser } from "@/lib/store/admin-auth-store";
import type { PermissionMap } from "@/lib/auth/permissions";

export type ApiUser = AdminUser;

export type ApiLoginResponse = {
  token: string;
  expires_at: string;
  user: ApiUser;
  permissions?: PermissionMap;
  enabled_modules?: string[] | null;
};

export type ApiMeResponse = {
  data: ApiUser;
  permissions?: PermissionMap;
  enabled_modules?: string[] | null;
};

export async function loginAdmin(email: string, password: string): Promise<ApiLoginResponse> {
  return apiFetch<ApiLoginResponse>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export type RegisterCompanyPayload = {
  company_name: string;
  slug?: string;
  owner_name: string;
  email: string;
  username: string;
  password: string;
};

export async function registerCompany(
  payload: RegisterCompanyPayload,
): Promise<ApiLoginResponse> {
  return apiFetch<ApiLoginResponse>("/api/v1/public/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchAdminMe(): Promise<{
  user: ApiUser;
  permissions: PermissionMap;
  enabledModules: string[] | null;
}> {
  const res = await apiFetch<ApiMeResponse>("/api/v1/auth/me");
  return { user: res.data, permissions: res.permissions ?? {}, enabledModules: res.enabled_modules ?? null };
}

export async function logoutAdmin(): Promise<void> {
  await apiFetch("/api/v1/auth/logout", { method: "POST" });
}
