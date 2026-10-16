import { getApiBaseUrl } from "@/lib/api/client";
import { getStoredSuperAdminToken, useSuperAdminAuth } from "@/lib/store/super-admin-auth-store";
import type { SuperAdminUser } from "@/lib/store/super-admin-auth-store";

export class SuperAdminApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "SuperAdminApiError";
    this.status = status;
  }
}

async function saFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredSuperAdminToken();
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    let detail = res.statusText;
    const errText = (await res.text().catch(() => "")).trim();
    if (errText) {
      try {
        const body = JSON.parse(errText) as { detail?: string };
        if (typeof body.detail === "string") detail = body.detail;
      } catch {
        detail = errText;
      }
    }
    if (
      res.status === 401 &&
      typeof window !== "undefined" &&
      !path.includes("/auth/login") &&
      !window.location.pathname.startsWith("/super-admin/login")
    ) {
      useSuperAdminAuth.getState().clearSession();
      window.location.assign("/super-admin/login");
    }
    throw new SuperAdminApiError(detail, res.status);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text.trim()) return undefined as T;
  return JSON.parse(text) as T;
}

export type Company = {
  id: string;
  slug: string;
  name: string;
  status: "trialing" | "active" | "suspended" | "cancelled";
  plan_id: string | null;
  trial_ends_at: string | null;
  subscription_ends_at: string | null;
  suspended_reason: string | null;
  enabled_modules: string[] | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ModuleInfo = { id: string; label: string };

export type ImpersonateResult = {
  token: string;
  expires_at: string;
  user: { id: string; email: string; username: string; name: string; role: string; is_active: boolean };
  permissions: Record<string, string[]>;
};

export type SubscriptionPlan = {
  id: string;
  slug: string;
  name: string;
  price_amount: number;
  price_interval: string;
  max_users: number | null;
  is_trial_default: boolean;
  is_active: boolean;
};

export type DashboardStats = {
  total: number;
  trialing: number;
  active: number;
  suspended: number;
  cancelled: number;
};

export async function loginSuperAdmin(email: string, password: string) {
  return saFetch<{ token: string; expires_at: string; user: SuperAdminUser }>(
    "/api/v1/super-admin/auth/login",
    { method: "POST", body: JSON.stringify({ email, password }) },
  );
}

export async function fetchSuperAdminMe() {
  const res = await saFetch<{ data: SuperAdminUser }>("/api/v1/super-admin/auth/me");
  return res.data;
}

export async function logoutSuperAdmin() {
  await saFetch("/api/v1/super-admin/auth/logout", { method: "POST" });
}

export async function listCompanies(params?: { status?: string; q?: string }) {
  const search = new URLSearchParams();
  if (params?.status) search.set("status", params.status);
  if (params?.q) search.set("q", params.q);
  const qs = search.toString();
  const res = await saFetch<{ data: Company[] }>(
    `/api/v1/super-admin/companies${qs ? `?${qs}` : ""}`,
  );
  return res.data;
}

export async function getCompany(id: string) {
  const res = await saFetch<{ data: Company }>(`/api/v1/super-admin/companies/${id}`);
  return res.data;
}

export async function updateCompany(id: string, payload: Partial<Company>) {
  const res = await saFetch<{ data: Company }>(`/api/v1/super-admin/companies/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function suspendCompany(id: string, reason?: string) {
  const res = await saFetch<{ data: Company }>(`/api/v1/super-admin/companies/${id}/suspend`, {
    method: "POST",
    body: JSON.stringify({ reason: reason ?? null }),
  });
  return res.data;
}

export async function activateCompany(id: string) {
  const res = await saFetch<{ data: Company }>(`/api/v1/super-admin/companies/${id}/activate`, {
    method: "POST",
  });
  return res.data;
}

export async function listModules() {
  const res = await saFetch<{ data: ModuleInfo[] }>("/api/v1/super-admin/modules");
  return res.data;
}

export async function impersonateCompany(companyId: string) {
  return saFetch<ImpersonateResult>(`/api/v1/super-admin/companies/${companyId}/impersonate`, {
    method: "POST",
  });
}

export async function fetchDashboardStats() {
  const res = await saFetch<{ data: DashboardStats }>("/api/v1/super-admin/dashboard/stats");
  return res.data;
}

export async function listPlans() {
  const res = await saFetch<{ data: SubscriptionPlan[] }>("/api/v1/super-admin/plans");
  return res.data;
}

export async function createPlan(payload: {
  slug: string;
  name: string;
  price_amount: number;
  price_interval: string;
  max_users?: number | null;
  is_trial_default?: boolean;
  is_active?: boolean;
}) {
  const res = await saFetch<{ data: SubscriptionPlan }>("/api/v1/super-admin/plans", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function updatePlan(id: string, payload: Partial<SubscriptionPlan>) {
  const res = await saFetch<{ data: SubscriptionPlan }>(`/api/v1/super-admin/plans/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return res.data;
}
