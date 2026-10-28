import { apiFetch } from "@/lib/api/client";

export type AuthModuleInfo = {
  id: string;
  label: string;
  /** The application area the role editor files this module under ("Finance", "After-sales" …). */
  group: string;
  /** One line on what the module opens. */
  hint: string;
};

export type RolePermissionFlags = {
  module: string;
  can_read: boolean;
  can_create: boolean;
  can_write: boolean;
  can_delete: boolean;
  can_publish: boolean;
  can_export: boolean;
  /** Finalize the documents that need approval without asking, and approve other people's requests. */
  can_approve: boolean;
};

export type AuthRoleRecord = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
  permissions: RolePermissionFlags[];
  user_count: number;
  created_at?: string | null;
  updated_at?: string | null;
};

const BASE = "/api/v1/auth/roles";

export async function fetchAuthModules(): Promise<AuthModuleInfo[]> {
  const res = await apiFetch<{ data: AuthModuleInfo[] }>(`${BASE}/modules`);
  return res.data;
}

export async function fetchAuthRoles(): Promise<AuthRoleRecord[]> {
  const res = await apiFetch<{ data: AuthRoleRecord[] }>(BASE);
  return res.data;
}

/** A job-based starting point for a new role (Sales Executive, Accountant, Warehouse Keeper …). */
export type AuthRoleTemplate = {
  id: string;
  name: string;
  description: string;
  permissions: RolePermissionFlags[];
};

export async function fetchAuthRoleTemplates(): Promise<AuthRoleTemplate[]> {
  const res = await apiFetch<{ data: AuthRoleTemplate[] }>(`${BASE}/templates`);
  return res.data;
}

export async function createAuthRole(payload: {
  name: string;
  slug?: string;
  description?: string;
  /** Id of a template from `fetchAuthRoleTemplates`; omitted = read-only on the business modules. */
  template?: string;
}): Promise<AuthRoleRecord> {
  const res = await apiFetch<{ data: AuthRoleRecord }>(BASE, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function updateAuthRole(
  roleId: string,
  payload: { name?: string; description?: string; is_active?: boolean },
): Promise<AuthRoleRecord> {
  const res = await apiFetch<{ data: AuthRoleRecord }>(`${BASE}/${roleId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function deleteAuthRole(roleId: string): Promise<void> {
  await apiFetch<void>(`${BASE}/${roleId}`, { method: "DELETE" });
}

export async function putAuthRolePermissions(
  roleId: string,
  permissions: RolePermissionFlags[],
): Promise<AuthRoleRecord> {
  const res = await apiFetch<{ data: AuthRoleRecord }>(`${BASE}/${roleId}/permissions`, {
    method: "PUT",
    body: JSON.stringify({ permissions }),
  });
  return res.data;
}
