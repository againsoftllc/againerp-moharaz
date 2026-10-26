import { apiFetch } from "@/lib/api/client";
import type { AdminUser } from "@/lib/store/admin-auth-store";

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
