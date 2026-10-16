import type {
  Supplier,
  SupplierDetail,
  SupplierStatus,
  VendorPerformance,
} from "@/lib/mock-data/suppliers";

export type ApiSupplier = {
  id: string;
  company_id: string;
  vendor_code: string;
  name: string;
  email: string;
  phone: string;
  payment_terms: string;
  lead_time_days: number;
  rating: string;
  open_pos: number;
  spend_ytd: string;
  status: string;
  country: string;
  tax_id: string | null;
  website: string | null;
  currency: string | null;
  opening_balance: string | number | null;
  credit_limit: string | number | null;
  payment_schedule: string | null;
  min_order_value: string | null;
  incoterms: string | null;
  buyer_name: string | null;
  contacts: Record<string, unknown>[];
  addresses: Record<string, unknown>[];
  contracts: Record<string, unknown>[];
  bills: Record<string, unknown>[];
  performance: Record<string, unknown>;
  timeline: Record<string, unknown>[];
  rfq_count: number;
  receipt_count: number;
  has_stock_feed: boolean;
  total_pos: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  party_id?: string | null;
  roles?: string[];
  linked_customer_id?: string | null;
  linked_customer_name?: string | null;
  linked_vendor_id?: string | null;
  linked_vendor_name?: string | null;
};

export type ApiSupplierListResponse = {
  data: ApiSupplier[];
  meta: { count: number; total_spend_ytd: string };
};

export type ApiSupplierResponse = {
  data: ApiSupplier;
};

export type SupplierListParams = {
  search?: string;
  status?: string;
};

const DEFAULT_PERFORMANCE: VendorPerformance = {
  onTimeDeliveryPct: 0,
  qualityRejectRatePct: 0,
  priceVariancePct: 0,
  avgLeadTimeDays: 0,
};

function formatUpdatedAt(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function primaryContactName(contacts: Record<string, unknown>[]): string | undefined {
  const primary = contacts.find((c) => c.isPrimary === true) ?? contacts[0];
  const name = primary?.name;
  return typeof name === "string" && name.trim() ? name.trim() : undefined;
}

export function apiSupplierToSupplier(row: ApiSupplier): Supplier {
  return {
    id: row.id,
    vendorCode: row.vendor_code,
    name: row.name,
    email: row.email,
    phone: row.phone,
    paymentTerms: row.payment_terms,
    leadTimeDays: row.lead_time_days,
    rating: Number(row.rating),
    openPos: row.open_pos,
    spendYtd: Number(row.spend_ytd),
    status: row.status as SupplierStatus,
    country: row.country,
    updatedAt: formatUpdatedAt(row.updated_at),
    taxId: row.tax_id ?? undefined,
    website: row.website ?? undefined,
    currency: row.currency ?? undefined,
    openingBalance: Number(row.opening_balance ?? 0),
    creditLimit: Number(row.credit_limit ?? 0),
    paymentSchedule: row.payment_schedule ?? undefined,
    minOrderValue: row.min_order_value != null ? Number(row.min_order_value) : undefined,
    incoterms: row.incoterms ?? undefined,
    buyerName: row.buyer_name ?? undefined,
    partyId: row.party_id ?? undefined,
    roles: row.roles ?? ["supplier"],
    linkedCustomerId: row.linked_customer_id ?? undefined,
    linkedCustomerName: row.linked_customer_name ?? undefined,
    linkedVendorId: row.linked_vendor_id ?? undefined,
    linkedVendorName: row.linked_vendor_name ?? undefined,
    contactPerson: primaryContactName(row.contacts),
  };
}

export function apiSupplierToSupplierDetail(row: ApiSupplier): SupplierDetail {
  const base = apiSupplierToSupplier(row);
  const perf = row.performance as Partial<VendorPerformance>;

  return {
    ...base,
    contacts: (row.contacts as SupplierDetail["contacts"]) ?? [],
    addresses: (row.addresses as SupplierDetail["addresses"]) ?? [],
    contracts: (row.contracts as SupplierDetail["contracts"]) ?? [],
    bills: (row.bills as SupplierDetail["bills"]) ?? [],
    performance: {
      onTimeDeliveryPct: Number(perf.onTimeDeliveryPct ?? DEFAULT_PERFORMANCE.onTimeDeliveryPct),
      qualityRejectRatePct: Number(
        perf.qualityRejectRatePct ?? DEFAULT_PERFORMANCE.qualityRejectRatePct,
      ),
      priceVariancePct: Number(perf.priceVariancePct ?? DEFAULT_PERFORMANCE.priceVariancePct),
      avgLeadTimeDays: Number(perf.avgLeadTimeDays ?? DEFAULT_PERFORMANCE.avgLeadTimeDays),
    },
    timeline: (row.timeline as SupplierDetail["timeline"]) ?? [],
    totalPos: row.total_pos,
    rfqCount: row.rfq_count,
    receiptCount: row.receipt_count,
    hasStockFeed: row.has_stock_feed,
    notes: row.notes ?? undefined,
  };
}

export function buildSupplierQuery(params?: SupplierListParams): string {
  if (!params) return "";
  const q = new URLSearchParams();
  if (params.search) q.set("search", params.search);
  if (params.status) q.set("status", params.status);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export type UpdateSupplierInput = {
  name?: string;
  email?: string;
  phone?: string;
  status?: SupplierStatus;
  paymentTerms?: string;
  leadTimeDays?: number;
  country?: string;
  taxId?: string;
  website?: string;
  currency?: string;
  openingBalance?: number;
  creditLimit?: number;
  paymentSchedule?: string;
  buyerName?: string;
  notes?: string;
  address?: string;
  contacts?: CreateSupplierContactInput[];
};

export function supplierUpdateToApiPayload(input: UpdateSupplierInput) {
  return {
    name: input.name,
    email: input.email,
    phone: input.phone,
    status: input.status,
    payment_terms: input.paymentTerms,
    lead_time_days: input.leadTimeDays,
    country: input.country,
    tax_id: input.taxId,
    website: input.website,
    currency: input.currency,
    opening_balance: input.openingBalance,
    credit_limit: input.creditLimit,
    payment_schedule: input.paymentSchedule,
    buyer_name: input.buyerName,
    notes: input.notes,
    address: input.address,
    contacts: input.contacts,
  };
}

export type CreateSupplierContactInput = {
  name: string;
  role?: string;
  email?: string;
  phone?: string;
};

export type CreateSupplierInput = {
  name: string;
  email?: string;
  phone?: string;
  vendorCode?: string;
  paymentTerms?: string;
  leadTimeDays?: number;
  status?: SupplierStatus;
  country?: string;
  taxId?: string;
  website?: string;
  currency?: string;
  openingBalance?: number;
  creditLimit?: number;
  paymentSchedule?: string;
  buyerName?: string;
  notes?: string;
  address?: string;
  contactName?: string;
  contactRole?: string;
  contacts?: CreateSupplierContactInput[];
};

export function supplierCreateToApiPayload(input: CreateSupplierInput) {
  return {
    name: input.name,
    email: input.email ?? "",
    phone: input.phone ?? "",
    vendor_code: input.vendorCode,
    payment_terms: input.paymentTerms ?? "Net 30",
    lead_time_days: input.leadTimeDays ?? 7,
    status: input.status ?? "active",
    country: input.country ?? "Bangladesh",
    tax_id: input.taxId,
    website: input.website,
    currency: input.currency,
    opening_balance: input.openingBalance,
    credit_limit: input.creditLimit,
    payment_schedule: input.paymentSchedule,
    buyer_name: input.buyerName,
    notes: input.notes,
    address: input.address,
    contact_name: input.contactName,
    contact_role: input.contactRole,
    contacts: input.contacts,
  };
}
