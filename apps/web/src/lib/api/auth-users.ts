import { apiFetch } from "@/lib/api/client";
import type { AdminUser } from "@/lib/store/admin-auth-store";
import type { ApiSession } from "@/lib/api/auth";

export type ApiUserListResponse = {
  data: AdminUser[];
  meta: { count: number };
};

export type ApiUserResponse = {
  data: AdminUser;
};

export type ApiUserCreate = {
  email: string;
  username: string;
  name: string;
  role?: string;
  role_ids?: string[];
  /** Warehouses the user may work in; omit or empty = every warehouse. */
  warehouse_ids?: string[];
  default_warehouse_id?: string;
  password: string;
  /** The member sets their own password at the first sign-in. */
  must_change_password?: boolean;
  /** Cash / bank accounts the user may use; omit or empty = every account. */
  payment_account_ids?: string[];
};

export type ApiUserUpdate = {
  email?: string;
  username?: string;
  name?: string;
  role?: string;
  role_ids?: string[];
  warehouse_ids?: string[];
  default_warehouse_id?: string;
  is_active?: boolean;
  password?: string;
  must_change_password?: boolean;
  /** Replace-all: every allow / deny the user should have after the save. */
  permission_overrides?: { module: string; action: string; allow: boolean }[];
  payment_account_ids?: string[];
};

export async function fetchAuthUsers(): Promise<AdminUser[]> {
  const res = await apiFetch<ApiUserListResponse>("/api/v1/auth/users");
  return res.data;
}

export async function fetchMentionableUsers(): Promise<
  Pick<AdminUser, "id" | "name" | "username" | "role">[]
> {
  const res = await apiFetch<{ data: Pick<AdminUser, "id" | "name" | "username" | "role">[] }>(
    "/api/v1/auth/users/mentionable",
  );
  return res.data;
}

export async function fetchAuthUser(userId: string): Promise<AdminUser> {
  const res = await apiFetch<ApiUserResponse>(`/api/v1/auth/users/${userId}`);
  return res.data;
}

export async function createAuthUser(payload: ApiUserCreate): Promise<AdminUser> {
  const res = await apiFetch<ApiUserResponse>("/api/v1/auth/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function updateAuthUser(userId: string, payload: ApiUserUpdate): Promise<AdminUser> {
  const res = await apiFetch<ApiUserResponse>(`/api/v1/auth/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function deleteAuthUser(userId: string): Promise<void> {
  await apiFetch<void>(`/api/v1/auth/users/${userId}`, { method: "DELETE" });
}

export type ActivityEntry = {
  id: string;
  action: string;
  detail: string | null;
  actor_id: string | null;
  actor_name: string | null;
  created_at: string;
};

export async function fetchUserActivity(userId: string): Promise<ActivityEntry[]> {
  const res = await apiFetch<{ data: ActivityEntry[] }>(`/api/v1/auth/users/${userId}/activity`);
  return res.data;
}

/** Lift a wrong-password lock before it runs out. */
export async function unlockAuthUser(userId: string): Promise<AdminUser> {
  return (await apiFetch<ApiUserResponse>(`/api/v1/auth/users/${encodeURIComponent(userId)}/unlock`, { method: "POST" })).data;
}

export async function fetchUserSessions(userId: string): Promise<ApiSession[]> {
  return (await apiFetch<{ data: ApiSession[] }>(`/api/v1/auth/users/${encodeURIComponent(userId)}/sessions`)).data;
}

/** Sign the member out everywhere. */
export async function endUserSessions(userId: string): Promise<ApiSession[]> {
  return (await apiFetch<{ data: ApiSession[] }>(`/api/v1/auth/users/${encodeURIComponent(userId)}/sessions`, { method: "DELETE" })).data;
}

export type ApiPermissionModuleRow = {
  id: string;
  label: string;
  group: string;
  /** The company has this module. */
  enabled: boolean;
  from_roles: string[];
  effective: string[];
};

export type ApiUserPermissions = {
  actions: string[];
  system_manager: boolean;
  modules: ApiPermissionModuleRow[];
  overrides: { module: string; action: string; allow: boolean }[];
};

/** Per module: what the roles give, what the user ends up with, and whether the company has the module. */
export async function fetchUserPermissions(userId: string): Promise<ApiUserPermissions> {
  return (await apiFetch<{ data: ApiUserPermissions }>(`/api/v1/auth/users/${encodeURIComponent(userId)}/permissions`)).data;
}
