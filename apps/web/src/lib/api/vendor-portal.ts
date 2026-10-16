"use client";

/**
 * Vendor portal API client.
 *
 * Deliberately separate from lib/api/client.ts (admin) and lib/api/portal.ts
 * (supplier): the vendor portal keeps its own token under its own storage
 * key so no session can leak between the three. Mirrors lib/api/portal.ts
 * structurally, against /api/v1/vendor-portal/* instead of /api/v1/portal/*.
 */

import { hydrateCompanyFormat } from "@/lib/store/company-format-store";

const VENDOR_PORTAL_STORAGE_KEY = "againerp-vendor-portal-auth";

export type VendorPortalUser = {
  id: string;
  email: string;
  name: string;
  phone: string;
  role: string;
  vendor_id: string;
  vendor_name: string | null;
  is_active: boolean;
  accepted_at: string | null;
  last_login_at: string | null;
  created_at: string;
};

type StoredSession = {
  token: string;
  expiresAt: string;
  user: VendorPortalUser;
  permissions: string[];
};

export function getVendorPortalSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(VENDOR_PORTAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed.token) return null;
    if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() < Date.now()) {
      localStorage.removeItem(VENDOR_PORTAL_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setVendorPortalSession(session: StoredSession) {
  localStorage.setItem(VENDOR_PORTAL_STORAGE_KEY, JSON.stringify(session));
}

export function clearVendorPortalSession() {
  localStorage.removeItem(VENDOR_PORTAL_STORAGE_KEY);
}

export function vendorPortalHasPermission(permission: string): boolean {
  return getVendorPortalSession()?.permissions.includes(permission) ?? false;
}

export class VendorPortalApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "VendorPortalApiError";
    this.status = status;
  }
}

async function extractDetail(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
  } catch {
    /* keep the default */
  }
  return fallback;
}

async function vendorPortalFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const session = getVendorPortalSession();
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (session?.token) headers.set("Authorization", `Bearer ${session.token}`);

  const res = await fetch(`/api/v1/vendor-portal${path}`, { ...init, headers });
  if (res.status === 401) {
    clearVendorPortalSession();
    throw new VendorPortalApiError("Your session has expired. Please sign in again.", 401);
  }
  if (!res.ok) {
    throw new VendorPortalApiError(await extractDetail(res, `Request failed (${res.status})`), res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/* ---------------------------------------------------------------- auth */

export async function vendorPortalLogin(email: string, password: string): Promise<StoredSession> {
  const res = await fetch("/api/v1/vendor-portal/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new VendorPortalApiError(await extractDetail(res, "Sign in failed"), res.status);
  const data = (await res.json()) as {
    token: string;
    expires_at: string;
    user: VendorPortalUser;
    permissions: string[];
  };
  const session = { token: data.token, expiresAt: data.expires_at, user: data.user, permissions: data.permissions };
  setVendorPortalSession(session);
  return session;
}

export async function vendorPortalAcceptInvite(token: string, password: string): Promise<StoredSession> {
  const res = await fetch("/api/v1/vendor-portal/auth/accept-invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
  if (!res.ok) throw new VendorPortalApiError(await extractDetail(res, "Could not set your password"), res.status);
  const data = (await res.json()) as {
    token: string;
    expires_at: string;
    user: VendorPortalUser;
    permissions: string[];
  };
  const session = { token: data.token, expiresAt: data.expires_at, user: data.user, permissions: data.permissions };
  setVendorPortalSession(session);
  return session;
}

/** Company localisation for portal screens — money/dates match the ERP. */
export async function loadVendorPortalCompanyFormat(): Promise<void> {
  const res = await vendorPortalFetch<{ company_format?: unknown }>("/auth/me");
  if (res.company_format) hydrateCompanyFormat(res.company_format);
}

export async function vendorPortalLogout(): Promise<void> {
  try {
    await vendorPortalFetch("/auth/logout", { method: "POST" });
  } finally {
    clearVendorPortalSession();
  }
}

export async function vendorPortalChangePassword(currentPassword: string, newPassword: string): Promise<void> {
  await vendorPortalFetch("/auth/password", {
    method: "POST",
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}

/* -------------------------------------------------------------- catalog */

export type VendorPortalProduct = {
  id: string;
  item_id: string | null;
  name: string;
  sku: string;
  model: string | null;
  brand: string | null;
  category: string | null;
  thumbnail: string | null;
  short_description: string | null;
  warranty: string | null;
  stock_mode: string;
  stock_status: string;
  stock_label: string;
  available_quantity: number | null;
  list_price: string;
  unit_price: string;
  discount_percent: string;
  price_source: string;
  min_order_quantity: number;
  max_order_quantity: number | null;
  orderable: boolean;
};

export async function fetchVendorPortalProducts(params?: {
  search?: string;
  brand_id?: string;
  category_id?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: VendorPortalProduct[]; total: number }> {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  if (params?.brand_id) qs.set("brand_id", params.brand_id);
  if (params?.category_id) qs.set("category_id", params.category_id);
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  const q = qs.toString();
  return vendorPortalFetch(`/products${q ? `?${q}` : ""}`);
}

/* ------------------------------------------------------------------ cart */

export type VendorPortalCartLine = {
  item_id: string;
  sku: string;
  name: string;
  quantity: number;
  list_price: string;
  unit_price: string;
  line_total: string;
  stock_status: string;
  orderable: boolean;
  issue: string | null;
};

export type VendorPortalCart = {
  cart_id: string;
  lines: VendorPortalCartLine[];
  subtotal: string;
  min_order_quantity: number;
  has_blocking_issues: boolean;
};

export async function fetchVendorPortalCart(): Promise<VendorPortalCart> {
  const res = await vendorPortalFetch<{ data: VendorPortalCart }>("/cart");
  return res.data;
}

export async function setVendorPortalCartItem(itemId: string, quantity: number): Promise<VendorPortalCart> {
  const res = await vendorPortalFetch<{ data: VendorPortalCart }>("/cart/items", {
    method: "POST",
    body: JSON.stringify({ item_id: itemId, quantity }),
  });
  return res.data;
}

export type VendorPortalOrderRequestItem = {
  id: string;
  item_id: string;
  sku_snapshot: string;
  name_snapshot: string;
  unit_price: string;
  quantity: number;
  discount_amount: string;
  tax_amount: string;
  line_total: string;
};

export type VendorPortalOrderRequest = {
  id: string;
  order_request_number: string;
  vendor_id: string;
  vendor_name: string | null;
  status: string;
  subtotal: string;
  discount_amount: string;
  tax_amount: string;
  shipping_amount: string;
  grand_total: string;
  payment_terms: string;
  requested_delivery_date: string | null;
  delivery_address: string | null;
  vendor_note: string | null;
  requires_credit_approval: boolean;
  created_at: string;
  updated_at: string;
  items: VendorPortalOrderRequestItem[];
};

export async function submitVendorPortalCart(payload: {
  notes?: string;
  delivery_address?: string;
  requested_delivery_date?: string;
}): Promise<VendorPortalOrderRequest> {
  const res = await vendorPortalFetch<{ data: VendorPortalOrderRequest }>("/cart/submit", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function fetchVendorPortalOrderRequests(): Promise<VendorPortalOrderRequest[]> {
  const res = await vendorPortalFetch<{ data: VendorPortalOrderRequest[]; total: number }>("/order-requests");
  return res.data;
}

export async function fetchVendorPortalOrderRequest(id: string): Promise<VendorPortalOrderRequest> {
  const res = await vendorPortalFetch<{ data: VendorPortalOrderRequest }>(`/order-requests/${id}`);
  return res.data;
}

/* ---------------------------------------------------------------- credit */

export type VendorPortalCreditSummary = {
  credit_limit: string;
  outstanding: string;
  overdue: string;
  available_credit: string;
  utilization_percent: string;
  exceeded: boolean;
};

export async function fetchVendorPortalCredit(): Promise<VendorPortalCreditSummary> {
  const res = await vendorPortalFetch<{ data: VendorPortalCreditSummary }>("/credit");
  return res.data;
}

/* ------------------------------------------------------------- quotations */

export type VendorPortalQuotationItem = {
  id: string;
  item_id: string;
  sku_snapshot: string;
  name_snapshot: string;
  unit_price: string;
  quantity: number;
  discount_amount: string;
  tax_amount: string;
  line_total: string;
};

export type VendorPortalQuotation = {
  id: string;
  quotation_number: string;
  order_request_id: string;
  vendor_id: string;
  vendor_name: string | null;
  status: string;
  revision_number: number;
  previous_quotation_id: string | null;
  superseded_by_id: string | null;
  subtotal: string;
  discount_amount: string;
  tax_amount: string;
  shipping_amount: string;
  grand_total: string;
  payment_terms: string;
  delivery_terms: string;
  valid_until: string | null;
  notes: string | null;
  viewed_at: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
  items: VendorPortalQuotationItem[];
};

export async function fetchVendorPortalQuotations(): Promise<VendorPortalQuotation[]> {
  const res = await vendorPortalFetch<{ data: VendorPortalQuotation[]; total: number }>("/quotations");
  return res.data;
}

export async function fetchVendorPortalQuotation(id: string): Promise<VendorPortalQuotation> {
  const res = await vendorPortalFetch<{ data: VendorPortalQuotation }>(`/quotations/${id}`);
  return res.data;
}

export async function acceptVendorPortalQuotation(id: string): Promise<VendorPortalQuotation> {
  const res = await vendorPortalFetch<{ data: VendorPortalQuotation }>(`/quotations/${id}/accept`, {
    method: "POST",
  });
  return res.data;
}

export async function rejectVendorPortalQuotation(id: string): Promise<VendorPortalQuotation> {
  const res = await vendorPortalFetch<{ data: VendorPortalQuotation }>(`/quotations/${id}/reject`, {
    method: "POST",
  });
  return res.data;
}

export async function negotiateVendorPortalQuotation(
  id: string,
  payload: {
    request_type?: string;
    message?: string;
    requested_price?: number;
    requested_quantity?: number;
    requested_delivery_date?: string;
    requested_payment_terms?: string;
  },
): Promise<void> {
  await vendorPortalFetch(`/quotations/${id}/negotiate`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/* ----------------------------------------------------------------- orders */

export type VendorPortalFinalOrder = {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  vendor_id: string | null;
  vendor_quotation_id: string | null;
  vendor_order_request_id: string | null;
  subtotal: string;
  discount_amount: string;
  tax_amount: string;
  shipping_amount: string;
  grand_total: string;
  paid_amount: string;
  due_amount: string;
  created_at: string;
};

export async function fetchVendorPortalOrders(): Promise<VendorPortalFinalOrder[]> {
  return vendorPortalFetch<VendorPortalFinalOrder[]>("/orders");
}

export async function fetchVendorPortalOrder(id: string): Promise<VendorPortalFinalOrder> {
  const res = await vendorPortalFetch<{ data: VendorPortalFinalOrder }>(`/orders/${id}`);
  return res.data;
}

/* --------------------------------------------------------------- invoices */

export type VendorPortalInvoice = {
  id: string;
  invoice_number: string;
  vendor_id: string;
  vendor_name: string | null;
  order_id: string;
  quotation_id: string | null;
  status: string;
  bill_date: string;
  due_date: string;
  subtotal: string;
  tax_amount: string;
  shipping_amount: string;
  grand_total: string;
  amount_paid: string;
  balance: string;
  created_at: string;
};

export async function fetchVendorPortalInvoices(): Promise<VendorPortalInvoice[]> {
  const res = await vendorPortalFetch<{ data: VendorPortalInvoice[]; total: number }>("/invoices");
  return res.data;
}

export async function fetchVendorPortalInvoice(id: string): Promise<VendorPortalInvoice> {
  const res = await vendorPortalFetch<{ data: VendorPortalInvoice }>(`/invoices/${id}`);
  return res.data;
}

/* ---------------------------------------------------------- notifications */

export type VendorPortalNotification = {
  id: string;
  event: string;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
};

export async function fetchVendorPortalNotifications(
  unreadOnly?: boolean,
): Promise<{ data: VendorPortalNotification[]; unread_count: number }> {
  const qs = unreadOnly ? "?unread_only=true" : "";
  return vendorPortalFetch(`/notifications${qs}`);
}

export async function markVendorPortalNotificationRead(id: string): Promise<void> {
  await vendorPortalFetch(`/notifications/${id}/read`, { method: "POST" });
}

export async function markAllVendorPortalNotificationsRead(): Promise<void> {
  await vendorPortalFetch("/notifications/read-all", { method: "POST" });
}
