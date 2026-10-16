"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PermissionMap } from "@/lib/auth/permissions";

export type AdminRoleSummary = {
  id: string;
  name: string;
  slug: string;
};

export type AdminUser = {
  id: string;
  email: string;
  username: string;
  name: string;
  role: string;
  is_active: boolean;
  role_ids?: string[];
  roles?: AdminRoleSummary[];
  company_id?: string | null;
  company_name?: string | null;
  company_slug?: string | null;
};

type AdminAuthState = {
  _hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
  user: AdminUser | null;
  token: string | null;
  expiresAt: string | null;
  permissions: PermissionMap;
  /** null = no restriction (all modules enabled) */
  enabledModules: string[] | null;
  setSession: (payload: {
    user: AdminUser;
    token: string;
    expiresAt: string;
    permissions?: PermissionMap;
    enabledModules?: string[] | null;
  }) => void;
  setPermissions: (permissions: PermissionMap) => void;
  clearSession: () => void;
};

export const useAdminAuth = create<AdminAuthState>()(
  persist(
    (set) => ({
      _hasHydrated: false,
      setHasHydrated: (v) => set({ _hasHydrated: v }),
      user: null,
      token: null,
      expiresAt: null,
      permissions: {},
      enabledModules: null,
      setSession: ({ user, token, expiresAt, permissions, enabledModules }) =>
        set({
          user,
          token,
          expiresAt,
          permissions: permissions ?? {},
          enabledModules: enabledModules ?? null,
        }),
      setPermissions: (permissions) => set({ permissions }),
      clearSession: () =>
        set({ user: null, token: null, expiresAt: null, permissions: {}, enabledModules: null }),
    }),
    {
      name: "againerp-admin-auth",
      partialize: (s) => ({
        user: s.user,
        token: s.token,
        expiresAt: s.expiresAt,
        permissions: s.permissions,
        enabledModules: s.enabledModules,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

export function getStoredAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const fromStore = useAdminAuth.getState().token;
    if (fromStore) return fromStore;
    const raw = localStorage.getItem("againerp-admin-auth");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { token?: string | null } };
    return parsed.state?.token ?? null;
  } catch {
    return null;
  }
}
