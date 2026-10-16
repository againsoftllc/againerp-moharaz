import { apiFetch } from "@/lib/api/client";

// ---------------------------------------------------------------- types

export type VendorType = {
  id: string;
  code: string;
  name: string;
  is_system: boolean;
  is_active: boolean;
};

export type VendorGroup = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price_list_id: string | null;
  default_discount_percent: string;
  default_credit_limit: string;
  default_payment_terms: string;
  min_order_quantity: number | null;
  order_limit: string | null;
  requires_order_approval: boolean;
  stock_visibility_mode: "exact" | "availability" | "threshold" | "hidden";
  negotiation_enabled: boolean;
  is_active: boolean;
  created_at: string;
};

export type VendorAddress = {
  type: string;
  label: string;
  line1: string;
  line2: string;
  city: string;
  state_division: string;
  country: string;
  postal_code: string;
  is_default: boolean;
};

export type Vendor = {
  id: string;
  vendor_code: string;
  company_name: string;
  legal_name: string;
  display_name: string;
  contact_person: string;
  phone: string;
  email: string;
  website: string;
  logo: string | null;
  vendor_type_id: string | null;
  vendor_group_id: string | null;
  price_list_id: string | null;
  status: string;
  addresses: VendorAddress[];
  city: string;
  state_division: string;
  country: string;
  postal_code: string;
  trade_license: string;
  vat_tax_id: string;
  bin_tin: string;
  business_registration_number: string;
  payment_terms: string;
  payment_schedule?: string | null;
  credit_limit: string;
  opening_balance: string;
  currency: string;
  preferred_payment_method: string;
  account_manager_id: string | null;
  sales_rep_id: string | null;
  onboarding_date: string | null;
  last_order_date: string | null;
  last_payment_date: string | null;
  notes: string | null;
  portal_enabled: boolean;
  created_at: string;
  updated_at: string;
  party_id?: string | null;
  roles?: string[];
  linked_customer_id?: string | null;
  linked_customer_name?: string | null;
  linked_supplier_id?: string | null;
  linked_supplier_name?: string | null;
};

export type VendorWrite = {
  company_name: string;
  legal_name?: string;
  display_name?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  website?: string;
  vendor_type_id?: string | null;
  vendor_group_id?: string | null;
  price_list_id?: string | null;
  status?: string;
  city?: string;
  state_division?: string;
  country?: string;
  postal_code?: string;
  payment_terms?: string;
  payment_schedule?: string | null;
  credit_limit?: number;
  opening_balance?: number;
  currency?: string;
  notes?: string | null;
  portal_enabled?: boolean;
};

export type VendorGroupWrite = {
  code: string;
  name: string;
  description?: string | null;
  price_list_id?: string | null;
  default_discount_percent?: number;
  default_credit_limit?: number;
  default_payment_terms?: string;
  min_order_quantity?: number | null;
  order_limit?: number | null;
  requires_order_approval?: boolean;
  stock_visibility_mode?: string;
  negotiation_enabled?: boolean;
  is_active?: boolean;
};

export type VendorPortalUser = {
  id: string;
  email: string;
  name: string;
  phone: string;
  role: "owner" | "purchase_manager" | "accounts_manager" | "staff";
  vendor_id: string;
  vendor_name: string | null;
  is_active: boolean;
  accepted_at: string | null;
  last_login_at: string | null;
  created_at: string;
  has_password: boolean;
  invite_pending: boolean;
  invite_expires_at: string | null;
  invite_token: string | null;
};

export type VendorPriceList = {
  id: string;
  code: string;
  name: string;
  currency: string;
  is_active: boolean;
  created_at: string;
};

export type VendorPriceListItem = {
  id: string;
  price_list_id: string;
  item_id: string;
  sku: string | null;
  product_name: string | null;
  unit_price: string;
  min_qty: number;
  max_qty: number | null;
  is_active: boolean;
};

// ------------------------------------------------------------- vendor types

export async function fetchVendorTypes(): Promise<VendorType[]> {
  return apiFetch<VendorType[]>("/api/v1/vendors/types");
}

export async function createVendorType(payload: { code: string; name: string }): Promise<VendorType> {
  return apiFetch<VendorType>("/api/v1/vendors/types", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ------------------------------------------------------------ vendor groups

export async function fetchVendorGroups(): Promise<VendorGroup[]> {
  const res = await apiFetch<{ data: VendorGroup[] }>("/api/v1/vendors/groups");
  return res.data;
}

export async function createVendorGroup(payload: VendorGroupWrite): Promise<VendorGroup> {
  const res = await apiFetch<{ data: VendorGroup }>("/api/v1/vendors/groups", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function updateVendorGroup(id: string, payload: VendorGroupWrite): Promise<VendorGroup> {
  const res = await apiFetch<{ data: VendorGroup }>(`/api/v1/vendors/groups/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return res.data;
}

// ------------------------------------------------------------------ vendors

export type VendorListParams = {
  search?: string;
  status?: string;
  vendor_group_id?: string;
  /** Archived vendors are hidden by the API unless this is set (or status=archived). */
  include_archived?: boolean;
  limit?: number;
  offset?: number;
};

function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export async function fetchVendors(params?: VendorListParams): Promise<{ data: Vendor[]; total: number }> {
  const { include_archived, ...rest } = params ?? {};
  return apiFetch(`/api/v1/vendors${buildQuery({ ...rest, include_archived: include_archived ? "true" : undefined })}`);
}

export async function fetchVendor(id: string): Promise<Vendor> {
  const res = await apiFetch<{ data: Vendor }>(`/api/v1/vendors/${id}`);
  return res.data;
}

export type VendorAuditLogEntry = {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  performed_by: string | null;
  performed_by_type: string;
  old_value: string | null;
  new_value: string | null;
  details_json: string | null;
  created_at: string;
};

export async function fetchVendorAuditLog(vendorId: string): Promise<VendorAuditLogEntry[]> {
  const res = await apiFetch<{ data: VendorAuditLogEntry[] }>(`/api/v1/vendors/${vendorId}/audit-log`);
  return res.data;
}

export async function createVendor(payload: VendorWrite): Promise<Vendor> {
  const res = await apiFetch<{ data: Vendor }>("/api/v1/vendors", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function updateVendor(id: string, payload: VendorWrite): Promise<Vendor> {
  const res = await apiFetch<{ data: Vendor }>(`/api/v1/vendors/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return res.data;
}

// ------------------------------------------------------------- portal users

export async function fetchVendorPortalUsers(vendorId: string): Promise<VendorPortalUser[]> {
  const res = await apiFetch<{ data: VendorPortalUser[] }>(`/api/v1/vendors/${vendorId}/portal-users`);
  return res.data;
}

export async function inviteVendorPortalUser(
  vendorId: string,
  payload: { email: string; name: string; role: string },
): Promise<VendorPortalUser> {
  const res = await apiFetch<{ data: VendorPortalUser }>(`/api/v1/vendors/${vendorId}/portal-users`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function revokeVendorPortalUser(vendorId: string, portalUserId: string): Promise<void> {
  await apiFetch(`/api/v1/vendors/${vendorId}/portal-users/${portalUserId}`, { method: "DELETE" });
}

// ------------------------------------------------------------- price lists

export async function fetchVendorPriceLists(): Promise<VendorPriceList[]> {
  const res = await apiFetch<{ data: VendorPriceList[] }>("/api/v1/vendors/price-lists");
  return res.data;
}

export async function createVendorPriceList(payload: {
  code: string;
  name: string;
  currency?: string;
}): Promise<VendorPriceList> {
  const res = await apiFetch<{ data: VendorPriceList }>("/api/v1/vendors/price-lists", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function fetchVendorPriceListItems(priceListId: string): Promise<VendorPriceListItem[]> {
  const res = await apiFetch<{ data: VendorPriceListItem[] }>(
    `/api/v1/vendors/price-lists/${priceListId}/items`,
  );
  return res.data;
}

export async function upsertVendorPriceListItem(
  priceListId: string,
  payload: { item_id: string; unit_price: number; min_qty?: number; max_qty?: number | null },
): Promise<VendorPriceListItem> {
  const res = await apiFetch<{ data: VendorPriceListItem }>(
    `/api/v1/vendors/price-lists/${priceListId}/items`,
    { method: "POST", body: JSON.stringify(payload) },
  );
  return res.data;
}

export async function deleteVendorPriceListItem(priceListId: string, itemRowId: string): Promise<void> {
  await apiFetch(`/api/v1/vendors/price-lists/${priceListId}/items/${itemRowId}`, { method: "DELETE" });
}

// ------------------------------------------------------------- item lookup

export type ItemOption = { id: string; sku: string; name: string };

export async function searchItems(q: string): Promise<ItemOption[]> {
  if (!q.trim()) return [];
  const res = await apiFetch<{ data: ItemOption[] }>(`/api/v1/items?q=${encodeURIComponent(q)}&per_page=10`);
  return res.data;
}
