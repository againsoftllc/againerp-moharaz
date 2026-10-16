import type {
  Customer,
  CustomerAiInsights,
  CustomerGroup,
  CustomerRewardEvent,
  CustomerStatus,
  LoyaltyTier,
  RiskLevel,
} from "@/lib/mock-data/customers";
import { apiFetch } from "@/lib/api/client";

function normalizeRewardEvents(raw: unknown): CustomerRewardEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((ev): ev is Record<string, unknown> => Boolean(ev) && typeof ev === "object")
    .map((ev, index) => {
      const rawType = String(ev.type || "earned").toLowerCase();
      const type: CustomerRewardEvent["type"] =
        rawType === "redeem" || rawType === "redeemed"
          ? "redeemed"
          : rawType === "expire" || rawType === "expired"
            ? "expired"
            : "earned";
      const amount = Number(ev.points ?? ev.amount ?? 0);
      const points = Math.abs(Number.isFinite(amount) ? amount : 0);
      const orderRef = String(ev.orders || ev.order_number || ev.orderNumber || "").trim();
      const purpose = String(ev.label || ev.purpose || ev.title || "").trim();
      const label =
        purpose ||
        (type === "earned"
          ? orderRef
            ? `Earned from order #${orderRef}`
            : "Points earned"
          : type === "redeemed"
            ? orderRef
              ? `Redeemed on order #${orderRef}`
              : "Points redeemed"
            : "Points expired");
      const atRaw = String(ev.at || ev.date || "");
      const at = atRaw.includes("T") ? atRaw : atRaw ? `${atRaw}T00:00:00Z` : new Date().toISOString();
      return {
        id: String(ev.id || `rw_${index + 1}`),
        label,
        points,
        type,
        at,
      };
    });
}

export type ApiCustomer = {
  id: string;
  company_id: string;
  customer_code: string;
  name: string;
  phone: string;
  email: string;
  phone_verified?: boolean;
  email_verified?: boolean;
  whatsapp_verified?: boolean;
  profile_image: string | null;
  group: string;
  status: string;
  loyalty_tier: string;
  city: string;
  region: string;
  country: string;
  customer_since: string;
  last_order_date: string | null;
  assigned_staff: string | null;
  tags: string[];
  total_orders: number;
  total_spend: string;
  avg_order_value: string;
  return_rate: string;
  reward_points: number;
  wallet_balance: string;
  opening_balance?: string | number;
  credit_limit?: string | number;
  payment_terms?: string | null;
  payment_schedule?: string | null;
  risk_score: number;
  risk_level: string;
  notes: string | null;
  addresses: Record<string, unknown>[];
  recent_orders: Record<string, unknown>[];
  wallet_transactions: Record<string, unknown>[];
  reward_events: Record<string, unknown>[];
  timeline: Record<string, unknown>[];
  comments: Record<string, unknown>[];
  activities: Record<string, unknown>[];
  attachments: Record<string, unknown>[];
  ai_insights: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  party_id?: string | null;
  roles?: string[];
  linked_supplier_id?: string | null;
  linked_supplier_name?: string | null;
  linked_vendor_id?: string | null;
  linked_vendor_name?: string | null;
  due?: string | number;
  advance?: string | number;
  open_invoice_count?: number;
};

export type ApiCustomerListResponse = {
  data: ApiCustomer[];
  meta: {
    count: number;
    total_spend: string;
    total_due?: string | number;
    limit?: number;
    offset?: number;
    sort?: string;
    order?: string;
  };
};

export type ApiCustomerResponse = {
  data: ApiCustomer;
};

export type CustomerListSortKey =
  | "name"
  | "created_at"
  | "customer_since"
  | "total_orders"
  | "total_spend"
  | "last_order_date"
  | "due"
  | "advance";

export type CustomerListParams = {
  search?: string;
  status?: string;
  group?: string;
  city?: string;
  /** Only customers with an outstanding receivable balance. */
  hasDue?: boolean;
  sort?: CustomerListSortKey;
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
  /** Load every matching row in API pages (customers list). Not sent to the API. */
  all?: boolean;
};

/** List row: a Customer plus the AR snapshot the list endpoint adds. */
export type CustomerListRow = Customer & {
  due?: number;
  advance?: number;
  openInvoiceCount?: number;
};

function defaultAiInsights(risk: RiskLevel, score: number): CustomerAiInsights {
  return {
    summary: "Customer profile loaded from database.",
    purchaseSummary: "",
    churnRisk: risk,
    churnScore: score,
    churnReasons: [],
    retentionProbability: risk === "low" ? 80 : risk === "medium" ? 55 : 30,
    predictedLtv: 0,
    favoriteCategories: [],
    favoriteBrands: [],
    recommendedProducts: [],
    marketingSuggestions: [],
  };
}

export function apiCustomerToCustomer(row: ApiCustomer): CustomerListRow {
  const raw = row.ai_insights as Partial<CustomerAiInsights>;
  const risk = (row.risk_level as RiskLevel) || "low";
  const fallback = defaultAiInsights(risk, row.risk_score);
  const addresses = (row.addresses as Customer["addresses"]) ?? [];
  const primaryAddress =
    addresses.find((a) => a.contactType !== "related" && (a.isDefault || a.contactType === "primary")) ??
    addresses.find((a) => a.contactType !== "related");

  return {
    id: row.id,
    customerId: row.customer_code,
    name: row.name ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    phoneVerified: Boolean(row.phone_verified),
    emailVerified: Boolean(row.email_verified),
    whatsappVerified: Boolean(row.whatsapp_verified),
    profileImage: row.profile_image ?? undefined,
    group: row.group as CustomerGroup,
    status: row.status as CustomerStatus,
    loyaltyTier: row.loyalty_tier as LoyaltyTier,
    city: row.city ?? "",
    region: row.region ?? "",
    country: row.country ?? "",
    customerSince: row.customer_since,
    lastOrderDate: row.last_order_date ?? undefined,
    assignedStaff: row.assigned_staff ?? undefined,
    tags: row.tags ?? [],
    totalOrders: row.total_orders,
    totalSpend: Number(row.total_spend),
    avgOrderValue: Number(row.avg_order_value),
    returnRate: Number(row.return_rate),
    rewardPoints: row.reward_points,
    walletBalance: Number(row.wallet_balance),
    openingBalance: Number(row.opening_balance ?? 0),
    creditLimit: Number(row.credit_limit ?? 0),
    paymentTerms: row.payment_terms ?? undefined,
    paymentSchedule: row.payment_schedule ?? undefined,
    riskScore: row.risk_score,
    riskLevel: risk,
    addresses,
    recentOrders: ((row.recent_orders as Customer["recentOrders"]) ?? []).map((order) => {
      const total = Number(order.amount ?? 0);
      const paid = Number(order.paid ?? 0);
      const due = order.due != null ? Number(order.due) : Math.max(0, total - paid);
      return {
        ...order,
        amount: total,
        paid,
        due,
        productLabel: order.productLabel || "Order",
      };
    }),
    walletTransactions: (row.wallet_transactions as Customer["walletTransactions"]) ?? [],
    rewardEvents: normalizeRewardEvents(row.reward_events),
    timeline: (row.timeline as Customer["timeline"]) ?? [],
    comments: (row.comments as Customer["comments"]) ?? [],
    activities: (row.activities as Customer["activities"]) ?? [],
    attachments: (row.attachments as Customer["attachments"]) ?? [],
    aiInsights: {
      summary: (raw.summary as string) ?? fallback.summary,
      purchaseSummary: (raw.purchaseSummary as string) ?? fallback.purchaseSummary,
      churnRisk: (raw.churnRisk as RiskLevel) ?? risk,
      churnScore: (raw.churnScore as number) ?? row.risk_score,
      churnReasons: (raw.churnReasons as string[]) ?? fallback.churnReasons,
      retentionProbability: (raw.retentionProbability as number) ?? fallback.retentionProbability,
      predictedLtv: (raw.predictedLtv as number) ?? fallback.predictedLtv,
      favoriteCategories: (raw.favoriteCategories as string[]) ?? fallback.favoriteCategories,
      favoriteBrands: (raw.favoriteBrands as string[]) ?? fallback.favoriteBrands,
      recommendedProducts:
        (raw.recommendedProducts as CustomerAiInsights["recommendedProducts"]) ??
        fallback.recommendedProducts,
      marketingSuggestions: (raw.marketingSuggestions as string[]) ?? fallback.marketingSuggestions,
    },
    notes: row.notes ?? undefined,
    parentCompany: primaryAddress?.parentCompany ?? undefined,
    parentContactName: primaryAddress?.parentContactName ?? undefined,
    partyId: row.party_id ?? undefined,
    roles: row.roles ?? ["customer"],
    linkedSupplierId: row.linked_supplier_id ?? undefined,
    linkedSupplierName: row.linked_supplier_name ?? undefined,
    linkedVendorId: row.linked_vendor_id ?? undefined,
    linkedVendorName: row.linked_vendor_name ?? undefined,
    due: row.due != null ? Number(row.due) : undefined,
    advance: row.advance != null ? Number(row.advance) : undefined,
    openInvoiceCount: row.open_invoice_count ?? undefined,
  };
}

export function buildCustomerQuery(params?: CustomerListParams): string {
  if (!params) return "";
  const q = new URLSearchParams();
  if (params.search) q.set("search", params.search);
  if (params.status) q.set("status", params.status);
  if (params.group) q.set("group", params.group);
  if (params.city) q.set("city", params.city);
  if (params.hasDue) q.set("has_due", "1");
  if (params.sort && params.sort !== "name") q.set("sort", params.sort);
  if (params.order && params.order !== "asc") q.set("order", params.order);
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.offset != null) q.set("offset", String(params.offset));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export type UpdateCustomerInput = {
  name?: string;
  phone?: string;
  email?: string;
  profileImage?: string;
  city?: string;
  region?: string;
  country?: string;
  status?: CustomerStatus;
  group?: CustomerGroup;
  loyaltyTier?: LoyaltyTier;
  /** `null` clears the stored value; `undefined` leaves it untouched. */
  assignedStaff?: string | null;
  notes?: string | null;
  tags?: string[];
  addresses?: Customer["addresses"];
  comments?: Customer["comments"];
  timeline?: Customer["timeline"];
  openingBalance?: number;
  creditLimit?: number;
  paymentTerms?: string | null;
  paymentSchedule?: string | null;
};

export type CreateCustomerInput = {
  name: string;
  phone?: string;
  email?: string;
  profileImage?: string;
  group?: CustomerGroup;
  city?: string;
  region?: string;
  country?: string;
  assignedStaff?: string | null;
  notes?: string | null;
  tags?: string[];
  addresses?: Customer["addresses"];
  openingBalance?: number;
  creditLimit?: number;
  paymentTerms?: string | null;
  paymentSchedule?: string | null;
};

export function customerUpdateToApiPayload(input: UpdateCustomerInput) {
  return {
    name: input.name,
    phone: input.phone,
    email: input.email,
    profile_image: input.profileImage,
    city: input.city,
    region: input.region,
    country: input.country,
    status: input.status,
    group: input.group,
    loyalty_tier: input.loyaltyTier,
    assigned_staff: input.assignedStaff,
    notes: input.notes,
    tags: input.tags,
    addresses: input.addresses,
    comments: input.comments,
    timeline: input.timeline,
    opening_balance: input.openingBalance,
    credit_limit: input.creditLimit,
    payment_terms: input.paymentTerms,
    payment_schedule: input.paymentSchedule,
  };
}

export function customerCreateToApiPayload(input: CreateCustomerInput) {
  return {
    name: input.name,
    phone: input.phone ?? "",
    email: input.email ?? "",
    profile_image: input.profileImage,
    group: input.group ?? "retail",
    city: input.city ?? "",
    region: input.region ?? "",
    country: input.country ?? "Bangladesh",
    assigned_staff: input.assignedStaff,
    notes: input.notes,
    tags: input.tags,
    addresses: input.addresses,
    opening_balance: input.openingBalance,
    credit_limit: input.creditLimit,
    payment_terms: input.paymentTerms,
    payment_schedule: input.paymentSchedule,
  };
}

export async function getCommerceCustomer(id: string): Promise<Customer> {
  const res = await apiFetch<ApiCustomerResponse>(`/api/v1/commerce/customers/${id}`, {
    cache: "no-store",
  });
  return apiCustomerToCustomer(res.data);
}

export async function createCommerceCustomer(input: CreateCustomerInput): Promise<Customer> {
  const res = await apiFetch<ApiCustomerResponse>("/api/v1/commerce/customers", {
    method: "POST",
    body: JSON.stringify(customerCreateToApiPayload(input)),
  });
  return apiCustomerToCustomer(res.data);
}

export async function updateCommerceCustomer(id: string, input: UpdateCustomerInput): Promise<Customer> {
  const res = await apiFetch<ApiCustomerResponse>(`/api/v1/commerce/customers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(customerUpdateToApiPayload(input)),
  });
  return apiCustomerToCustomer(res.data);
}

export async function deleteCommerceCustomer(id: string): Promise<void> {
  await apiFetch(`/api/v1/commerce/customers/${id}`, { method: "DELETE" });
}

export async function bulkDeleteCommerceCustomers(
  ids: string[],
): Promise<{ deleted: number; skipped: string[] }> {
  const res = await apiFetch<{ data: { deleted: number; skipped: string[] } }>(
    "/api/v1/commerce/customers/bulk-delete",
    {
      method: "POST",
      body: JSON.stringify({ ids }),
    },
  );
  return res.data;
}

export async function rechargeCommerceCustomerWallet(
  id: string,
  input: {
    amount: number;
    paymentMethod: "bkash" | "nagad" | "sslcommerz";
    paymentReference: string;
    note?: string;
  },
): Promise<Customer> {
  const res = await apiFetch<ApiCustomerResponse>(
    `/api/v1/commerce/customers/${id}/wallet/recharge`,
    {
      method: "POST",
      body: JSON.stringify({
        amount: input.amount,
        payment_method: input.paymentMethod,
        payment_reference: input.paymentReference,
        note: input.note,
      }),
    },
  );
  return apiCustomerToCustomer(res.data);
}

export async function verifyCommerceCustomerContact(
  id: string,
  channel: "phone" | "email",
  value?: string,
): Promise<Customer> {
  const res = await apiFetch<ApiCustomerResponse>(
    `/api/v1/commerce/customers/${id}/verify-contact`,
    {
      method: "POST",
      body: JSON.stringify({
        channel,
        value: value?.trim() || undefined,
      }),
    },
  );
  return apiCustomerToCustomer(res.data);
}

export async function verifyCommerceCustomerWhatsApp(id: string): Promise<Customer> {
  const res = await apiFetch<ApiCustomerResponse>(
    `/api/v1/commerce/customers/${id}/verify-whatsapp`,
    { method: "POST" },
  );
  return apiCustomerToCustomer(res.data);
}

export type CustomerOrderDetail = {
  id: string;
  orderNumber: string;
  date: string;
  productLabel: string;
  total: number;
  paid: number;
  due: number;
  status: string;
  paymentStatus: string;
  source: "sales" | "storefront" | string;
  customerName: string;
  phone: string;
  email: string;
  deliveryAddress: string;
  deliveryMethod: string;
  shippingMethod: string;
  products: Array<{
    name: string;
    imageUrl?: string | null;
    totalQty: number;
    lines: Array<{ label: string; qty: number; unitPrice: number }>;
  }>;
};

function mapCustomerOrderDetail(row: Record<string, unknown>): CustomerOrderDetail {
  const productsRaw = Array.isArray(row.products) ? row.products : [];
  return {
    id: String(row.id ?? ""),
    orderNumber: String(row.order_number ?? row.orderNumber ?? ""),
    date: String(row.date ?? ""),
    productLabel: String(row.product_label ?? row.productLabel ?? "Order"),
    total: Number(row.total ?? 0),
    paid: Number(row.paid ?? 0),
    due: Number(row.due ?? 0),
    status: String(row.status ?? ""),
    paymentStatus: String(row.payment_status ?? row.paymentStatus ?? ""),
    source: String(row.source ?? "sales"),
    customerName: String(row.customer_name ?? row.customerName ?? ""),
    phone: String(row.phone ?? ""),
    email: String(row.email ?? ""),
    deliveryAddress: String(row.delivery_address ?? row.deliveryAddress ?? ""),
    deliveryMethod: String(row.delivery_method ?? row.deliveryMethod ?? ""),
    shippingMethod: String(row.shipping_method ?? row.shippingMethod ?? ""),
    products: productsRaw.map((product) => {
      const p = product as Record<string, unknown>;
      const linesRaw = Array.isArray(p.lines) ? p.lines : [];
      return {
        name: String(p.name ?? ""),
        imageUrl: (p.image_url ?? p.imageUrl ?? null) as string | null,
        totalQty: Number(p.total_qty ?? p.totalQty ?? 0),
        lines: linesRaw.map((line) => {
          const l = line as Record<string, unknown>;
          return {
            label: String(l.label ?? ""),
            qty: Number(l.qty ?? 0),
            unitPrice: Number(l.unit_price ?? l.unitPrice ?? 0),
          };
        }),
      };
    }),
  };
}

export async function fetchCustomerOrders(customerId: string): Promise<Customer["recentOrders"]> {
  const res = await apiFetch<{ data: Record<string, unknown>[] }>(
    `/api/v1/commerce/customers/${customerId}/orders`,
    { cache: "no-store" },
  );
  return (res.data ?? []).map((row) => {
    const total = Number(row.total ?? row.amount ?? 0);
    const paid = Number(row.paid ?? 0);
    const due = row.due != null ? Number(row.due) : Math.max(0, total - paid);
    return {
      id: String(row.id ?? ""),
      orderNumber: String(row.order_number ?? row.orderNumber ?? ""),
      date: String(row.date ?? ""),
      amount: total,
      status: String(row.status ?? ""),
      paymentStatus: String(row.payment_status ?? row.paymentStatus ?? ""),
      source: String(row.source ?? ""),
      productLabel: String(row.product_label ?? row.productLabel ?? "Order"),
      paid,
      due,
    };
  });
}

export type CustomerPaymentHistoryItem = {
  id: string;
  at: string;
  amount: number;
  method: string;
  label: string;
  status: string;
  orderId?: string | null;
  orderNumber?: string | null;
  source: string;
  kind: string;
};

export type CustomerPaymentHistoryResult = {
  items: CustomerPaymentHistoryItem[];
  totalPaid: number;
  totalRefunded: number;
};

export async function fetchCustomerPayments(
  customerId: string,
): Promise<CustomerPaymentHistoryResult> {
  const res = await apiFetch<{
    data: Record<string, unknown>[];
    meta?: Record<string, unknown>;
  }>(`/api/v1/commerce/customers/${customerId}/payments`, { cache: "no-store" });
  const items = (res.data ?? []).map((row) => ({
    id: String(row.id ?? ""),
    at: String(row.at ?? ""),
    amount: Number(row.amount ?? 0),
    method: String(row.method ?? "—"),
    label: String(row.label ?? "Payment"),
    status: String(row.status ?? ""),
    orderId: (row.order_id ?? row.orderId ?? null) as string | null,
    orderNumber: (row.order_number ?? row.orderNumber ?? null) as string | null,
    source: String(row.source ?? ""),
    kind: String(row.kind ?? "payment"),
  }));
  return {
    items,
    totalPaid: Number(res.meta?.total_paid ?? res.meta?.totalPaid ?? 0),
    totalRefunded: Number(res.meta?.total_refunded ?? res.meta?.totalRefunded ?? 0),
  };
}

export type CustomerCaseType = "support" | "complaint" | "qc";

export type CustomerCaseReply = {
  id: string;
  at: string;
  author: string;
  role: string;
  message: string;
};

export type CustomerCase = {
  id: string;
  caseNumber: string;
  caseType: CustomerCaseType | string;
  date: string;
  orderId?: string | null;
  orderNumber?: string | null;
  subject: string;
  message: string;
  productLabel?: string | null;
  status: string;
  managerName?: string | null;
  replies: CustomerCaseReply[];
};

function mapCustomerCaseReply(row: Record<string, unknown>): CustomerCaseReply {
  return {
    id: String(row.id ?? ""),
    at: String(row.at ?? ""),
    author: String(row.author ?? "Admin"),
    role: String(row.role ?? "admin"),
    message: String(row.message ?? ""),
  };
}

function mapCustomerCase(row: Record<string, unknown>): CustomerCase {
  const repliesRaw = row.replies;
  const replies = Array.isArray(repliesRaw)
    ? repliesRaw
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
        .map(mapCustomerCaseReply)
    : [];
  return {
    id: String(row.id ?? ""),
    caseNumber: String(row.case_number ?? row.caseNumber ?? ""),
    caseType: String(row.case_type ?? row.caseType ?? "support"),
    date: String(row.date ?? ""),
    orderId: (row.order_id ?? row.orderId ?? null) as string | null,
    orderNumber: (row.order_number ?? row.orderNumber ?? null) as string | null,
    subject: String(row.subject ?? ""),
    message: String(row.message ?? ""),
    productLabel: (row.product_label ?? row.productLabel ?? null) as string | null,
    status: String(row.status ?? "open"),
    managerName: (row.manager_name ?? row.managerName ?? null) as string | null,
    replies,
  };
}

export async function fetchCustomerCases(
  customerId: string,
  caseType?: CustomerCaseType,
): Promise<CustomerCase[]> {
  const qs = caseType ? `?case_type=${caseType}` : "";
  const res = await apiFetch<{ data: Record<string, unknown>[] }>(
    `/api/v1/commerce/customers/${customerId}/cases${qs}`,
    { cache: "no-store" },
  );
  return (res.data ?? []).map(mapCustomerCase);
}

export async function createCustomerCase(
  customerId: string,
  input: {
    caseType: CustomerCaseType;
    subject: string;
    message: string;
    orderId?: string;
    productLabel?: string;
  },
): Promise<CustomerCase> {
  const res = await apiFetch<{ data: Record<string, unknown> }>(
    `/api/v1/commerce/customers/${customerId}/cases`,
    {
      method: "POST",
      body: JSON.stringify({
        case_type: input.caseType,
        subject: input.subject,
        message: input.message,
        order_id: input.orderId,
        product_label: input.productLabel,
      }),
    },
  );
  return mapCustomerCase(res.data);
}

export async function replyCustomerCase(
  customerId: string,
  caseId: string,
  message: string,
): Promise<CustomerCase> {
  const res = await apiFetch<{ data: Record<string, unknown> }>(
    `/api/v1/commerce/customers/${customerId}/cases/${caseId}/replies`,
    {
      method: "POST",
      body: JSON.stringify({ message }),
    },
  );
  return mapCustomerCase(res.data);
}

export async function closeCustomerCase(
  customerId: string,
  caseId: string,
): Promise<CustomerCase> {
  const res = await apiFetch<{ data: Record<string, unknown> }>(
    `/api/v1/commerce/customers/${customerId}/cases/${caseId}/close`,
    { method: "POST" },
  );
  return mapCustomerCase(res.data);
}

export async function fetchCustomerOrderDetail(
  customerId: string,
  orderId: string,
  source: "sales" | "storefront",
): Promise<CustomerOrderDetail> {
  const res = await apiFetch<{ data: Record<string, unknown> }>(
    `/api/v1/commerce/customers/${customerId}/orders/${orderId}?source=${source}`,
    { cache: "no-store" },
  );
  return mapCustomerOrderDetail(res.data);
}

export async function ensureCustomerOrderSales(
  customerId: string,
  orderId: string,
  source: "sales" | "storefront",
): Promise<{ id: string; orderNumber: string }> {
  const res = await apiFetch<{ data: Record<string, unknown> }>(
    `/api/v1/commerce/customers/${customerId}/orders/${orderId}/ensure-sales?source=${source}`,
    { method: "POST" },
  );
  return {
    id: String(res.data?.id ?? ""),
    orderNumber: String(res.data?.order_number ?? res.data?.orderNumber ?? ""),
  };
}

export async function recordCustomerOrderPayment(
  customerId: string,
  orderId: string,
  input: {
    source: "sales" | "storefront";
    amount: number;
    method: string;
    note?: string;
  },
): Promise<CustomerOrderDetail> {
  const res = await apiFetch<{ data: Record<string, unknown> }>(
    `/api/v1/commerce/customers/${customerId}/orders/${orderId}/record-payment`,
    {
      method: "POST",
      body: JSON.stringify({
        source: input.source,
        amount: input.amount,
        method: input.method,
        note: input.note,
      }),
    },
  );
  return mapCustomerOrderDetail(res.data);
}

export async function updateCommerceCustomerStatus(id: string, status: CustomerStatus): Promise<Customer> {
  return updateCommerceCustomer(id, { status });
}
