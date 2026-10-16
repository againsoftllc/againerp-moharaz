"use client";

import { useAdminAuth } from "@/lib/store/admin-auth-store";

/** Admin and staff can mutate; viewer is read-only (matches API WRITE_ROLES). */
export function useAdminCanWrite(): boolean {
  const role = useAdminAuth((s) => s.user?.role);
  return role !== "viewer";
}

export function useAdminIsViewer(): boolean {
  const role = useAdminAuth((s) => s.user?.role);
  return role === "viewer";
}

/** Matches the API's ADMIN_ROLES — gates admin-only actions like correcting a posted receipt. */
export function useAdminIsAdmin(): boolean {
  const role = useAdminAuth((s) => s.user?.role);
  return role === "admin" || role === "system_manager";
}
