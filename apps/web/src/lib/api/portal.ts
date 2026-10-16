"use client";

/**
 * Supplier portal API client.
 *
 * Deliberately separate from lib/api/client.ts: the portal keeps its own token
 * under its own storage key so an admin session can never leak into portal
 * requests, or the other way round.
 */

import { hydrateCompanyFormat } from "@/lib/store/company-format-store";

const PORTAL_STORAGE_KEY = "againerp-portal-auth";

export type PortalUser = {
  id: string;
  email: string;
  name: string;
  supplier_id: string;
  supplier_name: string | null;
  is_active: boolean;
  last_login_at: string | null;
};

type StoredSession = { token: string; expiresAt: string; user: PortalUser };

export function getPortalSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PORTAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed.token) return null;
    if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() < Date.now()) {
      localStorage.removeItem(PORTAL_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setPortalSession(session: StoredSession) {
  localStorage.setItem(PORTAL_STORAGE_KEY, JSON.stringify(session));
}

export function clearPortalSession() {
  localStorage.removeItem(PORTAL_STORAGE_KEY);
}

export class PortalApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "PortalApiError";
    this.status = status;
  }
}

async function portalFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const session = getPortalSession();
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (session?.token) headers.set("Authorization", `Bearer ${session.token}`);

  const res = await fetch(`/api/v1/portal${path}`, { ...init, headers });
  if (res.status === 401) {
    clearPortalSession();
    throw new PortalApiError("Your session has expired. Please sign in again.", 401);
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* keep the default */
    }
    throw new PortalApiError(detail, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/* ---------------------------------------------------------------- auth */

export async function portalLogin(email: string, password: string): Promise<StoredSession> {
  const res = await fetch("/api/v1/portal/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    let detail = "Sign in failed";
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* keep the default */
    }
    throw new PortalApiError(detail, res.status);
  }
  const data = (await res.json()) as { token: string; expires_at: string; user: PortalUser };
  const session = { token: data.token, expiresAt: data.expires_at, user: data.user };
  setPortalSession(session);
  return session;
}

export async function portalAcceptInvite(
  token: string,
  password: string,
): Promise<StoredSession> {
  const res = await fetch("/api/v1/portal/auth/accept-invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
  if (!res.ok) {
    let detail = "Could not set your password";
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* keep the default */
    }
    throw new PortalApiError(detail, res.status);
  }
  const data = (await res.json()) as { token: string; expires_at: string; user: PortalUser };
  const session = { token: data.token, expiresAt: data.expires_at, user: data.user };
  setPortalSession(session);
  return session;
}

/** Company localisation for portal screens — money/dates match the ERP. */
export async function loadPortalCompanyFormat(): Promise<void> {
  const res = await portalFetch<{ company_format?: unknown }>("/auth/me");
  if (res.company_format) hydrateCompanyFormat(res.company_format);
}

export async function portalLogout(): Promise<void> {
  try {
    await portalFetch("/auth/logout", { method: "POST" });
  } finally {
    clearPortalSession();
  }
}

/* -------------------------------------------------------------- catalog */

export type PortalProduct = {
  id: string;
  supplier_sku: string;
  supplier_title: string;
  supplier_price: string;
  currency: string;
  supplier_stock: number | null;
  stock_status: string;
  lead_time_days: number;
  min_order_qty: number;
  warranty: string | null;
  is_active: boolean;
  mapped_item_sku: string | null;
  mapped_item_name: string | null;
  is_preferred: boolean;
  updated_at: string;
};

export async function fetchPortalProducts(search?: string) {
  const qs = search ? `?search=${encodeURIComponent(search)}` : "";
  return portalFetch<{ data: PortalProduct[]; meta: { count: number; mapped: number } }>(
    `/products${qs}`,
  );
}

export type PortalProductInput = {
  supplier_sku: string;
  supplier_title: string;
  supplier_price: number;
  supplier_stock?: number;
  stock_status?: string;
  lead_time_days?: number;
  min_order_qty?: number;
  warranty?: string;
};

export async function upsertPortalProduct(input: PortalProductInput) {
  return portalFetch<PortalProduct>("/products", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type PortalItem = { id: string; sku: string; name: string };

export async function fetchPortalItems(search?: string) {
  const qs = search ? `?search=${encodeURIComponent(search)}` : "";
  return portalFetch<{ data: PortalItem[] }>(`/items${qs}`);
}

export async function mapPortalProduct(supplierProductId: string, itemId: string) {
  return portalFetch<PortalProduct>("/mappings", {
    method: "POST",
    body: JSON.stringify({ supplier_product_id: supplierProductId, item_id: itemId }),
  });
}

/* --------------------------------------------------------------- orders */

export type PortalOrder = {
  id: string;
  po_number: string;
  status: string;
  order_date: string;
  expected_date: string | null;
  warehouse_name: string | null;
  total: string;
  lines: {
    sku: string;
    name: string;
    quantity_ordered: number;
    quantity_received: number;
    unit_cost: string;
    line_total: string;
  }[];
};

export async function fetchPortalOrders() {
  return portalFetch<{ data: PortalOrder[]; meta: { count: number } }>("/orders");
}

/* ----------------------------------------------------------------- RFQs */

export type PortalRfqLine = {
  /**
   * The RFQ line's real id — needed to key `line_quotes[].rfq_line_id` when submitting a
   * bid. Not explicit in the original one-line contract summary (`{sku,name,quantity}`),
   * but required for the bid form to function at all; the backend's `purchase_rfq_lines`
   * table already has this as its primary key, so this is additive, not a divergence.
   */
  id: string;
  sku: string;
  name: string;
  quantity: number;
};

export type PortalRfqQuoteLine = {
  rfq_line_id: string;
  unit_price: string | number;
};

export type PortalRfqQuote = {
  id: string;
  status: string;
  quote_number: string;
  valid_until: string | null;
  lead_time_days: number;
  moq: number;
  total_amount: string | number;
  line_quotes: PortalRfqQuoteLine[];
};

export type PortalRfq = {
  id: string;
  rfq_number: string;
  title: string;
  status: string;
  deadline: string;
  lines: PortalRfqLine[];
  my_quote: PortalRfqQuote | null;
};

export async function fetchPortalRfqs() {
  return portalFetch<{ data: PortalRfq[]; meta: { count: number } }>("/rfqs");
}

export async function fetchPortalRfq(id: string) {
  return portalFetch<{ data: PortalRfq }>(`/rfqs/${id}`).then((res) => res.data);
}

export type PortalRfqQuoteInput = {
  quote_number?: string;
  valid_until?: string;
  lead_time_days: number;
  moq: number;
  line_quotes: { rfq_line_id: string; unit_price: number }[];
};

export async function submitPortalRfqQuote(id: string, input: PortalRfqQuoteInput) {
  return portalFetch<{ data: PortalRfqQuote }>(`/rfqs/${id}/quotes`, {
    method: "POST",
    body: JSON.stringify(input),
  }).then((res) => res.data);
}

export async function updatePortalRfqQuote(
  id: string,
  quoteId: string,
  input: PortalRfqQuoteInput,
) {
  return portalFetch<{ data: PortalRfqQuote }>(`/rfqs/${id}/quotes/${quoteId}`, {
    method: "PUT",
    body: JSON.stringify(input),
  }).then((res) => res.data);
}
