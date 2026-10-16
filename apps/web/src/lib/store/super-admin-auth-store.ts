"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SuperAdminUser = {
  id: string;
  email: string;
  username: string;
  name: string;
  is_active: boolean;
};

type SuperAdminAuthState = {
  _hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
  user: SuperAdminUser | null;
  token: string | null;
  expiresAt: string | null;
  setSession: (payload: { user: SuperAdminUser; token: string; expiresAt: string }) => void;
  clearSession: () => void;
};

export const useSuperAdminAuth = create<SuperAdminAuthState>()(
  persist(
    (set) => ({
      _hasHydrated: false,
      setHasHydrated: (v) => set({ _hasHydrated: v }),
      user: null,
      token: null,
      expiresAt: null,
      setSession: ({ user, token, expiresAt }) => set({ user, token, expiresAt }),
      clearSession: () => set({ user: null, token: null, expiresAt: null }),
    }),
    {
      name: "againerp-super-admin-auth",
      partialize: (s) => ({ user: s.user, token: s.token, expiresAt: s.expiresAt }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

export function getStoredSuperAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const fromStore = useSuperAdminAuth.getState().token;
    if (fromStore) return fromStore;
    const raw = localStorage.getItem("againerp-super-admin-auth");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { token?: string | null } };
    return parsed.state?.token ?? null;
  } catch {
    return null;
  }
}
