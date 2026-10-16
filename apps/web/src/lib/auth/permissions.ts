"use client";

import { useAdminAuth } from "@/lib/store/admin-auth-store";

export type PermissionAction = "read" | "create" | "write" | "delete";

export type PermissionMap = Record<string, PermissionAction[]>;

/** Map sidebar / workspace nav ids → RBAC module ids */
export const NAV_MODULE_MAP: Record<string, string> = {
  home: "dashboard",
  catalog: "catalog",
  dropshipping: "dropshipping",
  hrm: "hrm",
  blog: "blog",
  website: "website",
  sales: "sales",
  customers: "customers",
  media: "media",
  workspace: "workspace",
  inventory: "inventory",
  purchase: "purchase",
  suppliers: "purchase",
  rma: "rma",
  service: "service",
  finance: "finance",
  accounting: "finance",
  pos: "pos",
  dashboard: "dashboard",
  ai: "dashboard",
};

export function hasPermission(
  permissions: PermissionMap | null | undefined,
  module: string,
  action: PermissionAction,
  legacyRole?: string | null,
): boolean {
  if (legacyRole === "admin" || legacyRole === "system_manager") return true;
  const actions = permissions?.[module];
  if (!actions) return false;
  return actions.includes(action);
}

export function usePermission(module: string, action: PermissionAction = "read"): boolean {
  const permissions = useAdminAuth((s) => s.permissions);
  const role = useAdminAuth((s) => s.user?.role);
  return hasPermission(permissions, module, action, role);
}

export function useCanManageWorkspace(): boolean {
  return usePermission("workspace", "write");
}

/**
 * Account administration (users + roles) is System Manager only, matching the
 * `require_system_manager` guard on the API.
 */
export function useIsSystemManager(): boolean {
  const user = useAdminAuth((s) => s.user);
  if (!user) return false;
  if (user.roles?.length) return user.roles.some((r) => r.slug === "system_manager");
  return user.role === "admin" || user.role === "system_manager";
}
