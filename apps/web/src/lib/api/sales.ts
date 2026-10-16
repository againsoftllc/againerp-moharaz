import type { Order, OrderLine, OrderStatus, PaymentStatus, ShipmentStatus } from "@/lib/mock-data/orders";

function checkoutAddress(a: ApiSalesOrderAddress | null | undefined) {
  return a
    ? { address: a.address, city: a.city, region: a.region, country: a.country || "Bangladesh", zip: a.postal_code }
    : undefined;
}

const SHIPMENT_STATUSES: readonly string[] = ["unfulfilled", "partial", "shipped", "delivered", "returned"];
import { defaultAiInsights } from "@/lib/mock-data/orders";
import { apiFetch, invalidateApiGetCache } from "@/lib/api/client";

export type ApiSalesOrderLine = {
  id: string;
  item_id: string;
  line_number: number;
  sku: string;
  name: string;
  quantity_ordered: number;
  quantity_delivered: number;
  quantity_returned?: number;
  quantity_reserved: number;
  unit_price: string | number;
  tax_rate: string | number;
  tax_amount: string | number;
  discount_amount: string | number;
  line_total: string | number;
  notes: string | null;
  image_url?: string | null;
  serial_numbers?: string[];
};

export type ApiSalesCustomerSnapshot = {
  customer_phone?: string | null;
  customer_email?: string | null;
  customer_group?: string | null;
  customer_city?: string | null;
  customer_region?: string | null;
  customer_country?: string | null;
  customer_tags?: string[];
  customer_assigned_staff?: string | null;
  customer_order_count?: number;
  customer_lifetime_value?: string | number;
  customer_risk_score?: number;
};

export type ApiSalesOrderActivity = {
  id: string;
  activity_type: string;
  title: string;
  description: string | null;
  actor_id: string | null;
  actor_name: string | null;
  created_at: string;
};

export type ApiSalesOrderEditRequest = {
  id: string;
  status: "pending" | "approved" | "rejected" | "consumed";
  reason: string | null;
  requested_by: string;
  requested_by_name: string | null;
  requested_at: string;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_note: string | null;
};

/** An address the shopper gave at checkout (website orders). */
type ApiSalesOrderAddress = {
  address: string;
  city: string;
  region: string;
  postal_code: string;
  country: string;
};

export type ApiSalesOrder = ApiSalesCustomerSnapshot & {
  id: string;
  company_id: string;
  order_number: string;
  customer_id: string;
  customer_name: string | null;
  warehouse_id: string;
  warehouse_name: string | null;
  sales_quotation_id: string | null;
  status: string;
  delivery_status: string;
  order_date: string;
  expected_date: string | null;
  sales_rep: string | null;
  notes: string | null;
  payment_terms: string | null;
  sale_stage: string;
  invoice_scheme: string;
  shipping_status: string | null;
  delivered_to: string | null;
  delivery_person_id: string | null;
  delivery_person_name: string | null;
  courier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  activities?: ApiSalesOrderActivity[];
  edit_request?: ApiSalesOrderEditRequest | null;
  /** Sum of non-cancelled return credit totals against this order. */
  returned_total?: string | number | null;
  /** Website orders only (see Order.websiteStatus). */
  website_order_id?: string | null;
  website_status?: string | null;
  website_next_statuses?: string[] | null;
  website_billing_address?: ApiSalesOrderAddress | null;
  website_shipping_address?: ApiSalesOrderAddress | null;
  order_discount?: string | number | null;
  order_discount_type?: "fixed" | "percent" | null;
  shipping_charge?: string | number | null;
  additional_expenses?: { title: string; amount: string | number }[] | null;
  subtotal: string | number;
  tax_total: string | number;
  discount_total: string | number;
  total: string | number;
  invoice_id: string | null;
  invoice_number: string | null;
  invoiced_at: string | null;
  public_key?: string | null;
  confirmed_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  lines: ApiSalesOrderLine[];
};

export type ApiSalesQuotationLine = {
  id: string;
  item_id: string;
  line_number: number;
  sku: string;
  name: string;
  quantity: number;
  unit_price: string | number;
  tax_rate: string | number;
  tax_amount: string | number;
  discount_amount: string | number;
  line_total: string | number;
  notes: string | null;
};

export type ApiSalesQuotation = ApiSalesCustomerSnapshot & {
  id: string;
  company_id: string;
  quotation_number: string;
  customer_id: string;
  customer_name: string | null;
  warehouse_id: string | null;
  status: string;
  quote_date: string;
  valid_until: string | null;
  sales_rep: string | null;
  notes: string | null;
  subtotal: string | number;
  tax_total: string | number;
  discount_total: string | number;
  total: string | number;
  sales_order_id: string | null;
  sent_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
  lines: ApiSalesQuotationLine[];
};

export type SalesListParams = {
  search?: string;
  status?: string;
  customer_id?: string;
  page?: number;
  per_page?: number;
  sort_by?: string;
  sort_dir?: "asc" | "desc";
};

export type SalesLineInput = {
  item_id?: string;
  sku?: string;
  quantity: number;
  unit_price: number;
  tax_rate?: number;
  discount_amount?: number;
  notes?: string;
  serial_numbers?: string[];
};

export type CreateSalesOrderInput = {
  customer_id: string;
  warehouse_id?: string;
  order_date?: string;
  expected_date?: string;
  sales_rep?: string;
  notes?: string;
  payment_terms?: string;
  sale_stage?: string;
  invoice_scheme?: string;
  shipping_status?: string;
  delivered_to?: string;
  delivery_person_id?: string;
  order_discount?: number;
  order_discount_type?: "fixed" | "percent";
  shipping_charge?: number;
  additional_expenses?: { title: string; amount: number }[];
  lines: SalesLineInput[];
};

export type UpdateSalesOrderInput = CreateSalesOrderInput;

export type CreateSalesQuotationInput = {
  customer_id: string;
  warehouse_id?: string;
  quote_date?: string;
  valid_until?: string;
  sales_rep?: string;
  notes?: string;
  lines: SalesLineInput[];
};

export type SalesRecordKind = "order" | "quotation";

export type SalesRecordMeta = {
  kind: SalesRecordKind;
  invoiceNumber?: string | null;
  invoicedAt?: string | null;
};

const QUOTATION_STATUS_TO_UI: Record<string, OrderStatus> = {
  draft: "draft",
  sent: "pending",
  approved: "pending",
  rejected: "cancelled",
};

const ORDER_STATUS_TO_UI: Record<string, OrderStatus> = {
  draft: "draft",
  confirmed: "confirmed",
  processing: "processing",
  completed: "completed",
  cancelled: "cancelled",
};

const UI_STATUS_TO_ORDER: Record<OrderStatus, string> = {
  draft: "draft",
  pending: "draft",
  confirmed: "confirmed",
  processing: "processing",
  packed: "processing",
  shipped: "processing",
  delivered: "completed",
  completed: "completed",
  cancelled: "cancelled",
  returned: "cancelled",
  refunded: "cancelled",
  failed: "cancelled",
};

const UI_STATUS_TO_QUOTATION: Record<OrderStatus, string> = {
  draft: "draft",
  pending: "sent",
  confirmed: "approved",
  processing: "approved",
  packed: "approved",
  shipped: "approved",
  delivered: "approved",
  completed: "approved",
  cancelled: "rejected",
  returned: "rejected",
  refunded: "rejected",
  failed: "rejected",
};

function num(value: string | number | null | undefined): number {
  if (value == null) return 0;
  return typeof value === "number" ? value : parseFloat(value) || 0;
}

function parseLineVariant(notes: string | null | undefined): string | undefined {
  if (!notes) return undefined;
  const trimmed = notes.trim();
  if (trimmed.toLowerCase().startsWith("variant:")) {
    return trimmed.slice("variant:".length).trim() || undefined;
  }
  // Legacy / freeform short notes from sync — treat as variant when short.
  if (trimmed.length > 0 && trimmed.length <= 120 && !trimmed.includes("\n")) {
    return trimmed;
  }
  return undefined;
}

const LINE_LAYOUT_START = "<!--againerp:lines-->";
const LINE_LAYOUT_END = "<!--/againerp:lines-->";
const LINE_LAYOUT_RE = /<!--againerp:lines-->([\s\S]*?)<!--\/againerp:lines-->/;

const PAYMENT_META_START = "<!--againerp:payment-->";
const PAYMENT_META_END = "<!--/againerp:payment-->";
const PAYMENT_META_RE = /<!--againerp:payment-->([\s\S]*?)<!--\/againerp:payment-->/;

type LineLayoutEntry =
  | { t: "p" }
  | { t: "s"; n: string }
  | { t: "n"; n: string };

export type PackedPaymentMeta = {
  paid: number;
  due: number;
  status: PaymentStatus;
  method?: string;
  shipping?: number;
  discount?: number;
  tax?: number;
  subtotal?: number;
  grand_total?: number;
  coupon_code?: string | null;
  history?: Array<{
    id: string;
    label: string;
    amount: number;
    status: string;
    at: string;
    method?: string;
    account?: string;
    accountId?: string;
    kind?: "payment" | "refund";
  }>;
};

/** Map storefront / legacy payment labels onto Sales payment method chips. */
export function normalizeApiPaymentMethod(raw: string | null | undefined): string {
  const value = (raw || "").trim();
  if (!value) return "Manual";
  const key = value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  const aliases: Record<string, string> = {
    cod: "COD",
    "cash on delivery": "COD",
    cashondelivery: "COD",
    bkash: "bKash",
    "b kash": "bKash",
    nagad: "Nagad",
    card: "Card",
    "card / sslcommerz": "Card",
    sslcommerz: "Card",
    stripe: "Card",
    paypal: "Card",
    bank: "Manual Payment (Bank)",
    "bank transfer": "Manual Payment (Bank)",
    "manual payment (bank)": "Manual Payment (Bank)",
    manual: "Manual Payment (Bank)",
    cash: "Cash",
  };
  return aliases[key] || value;
}

export function isProductOrderLine(item: OrderLine): boolean {
  return !item.displayType || item.displayType === "product";
}

export function stripPaymentMeta(notes: string | null | undefined): string {
  if (!notes) return "";
  return notes.replace(PAYMENT_META_RE, "").trim();
}

export function unpackPaymentMeta(notes: string | null | undefined): PackedPaymentMeta | null {
  const match = (notes ?? "").match(PAYMENT_META_RE);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1] ?? "{}") as Partial<PackedPaymentMeta>;
    const paid = Number(parsed.paid ?? 0);
    const due = Number(parsed.due ?? 0);
    const status = (parsed.status as PaymentStatus | undefined) ?? (
      paid <= 0 ? "unpaid" : due > 0 ? "partial" : "paid"
    );
    return {
      paid: Number.isFinite(paid) ? paid : 0,
      due: Number.isFinite(due) ? due : 0,
      status,
      method: typeof parsed.method === "string" ? parsed.method : undefined,
      shipping: Number.isFinite(Number(parsed.shipping)) ? Number(parsed.shipping) : undefined,
      discount: Number.isFinite(Number(parsed.discount)) ? Number(parsed.discount) : undefined,
      tax: Number.isFinite(Number(parsed.tax)) ? Number(parsed.tax) : undefined,
      subtotal: Number.isFinite(Number(parsed.subtotal)) ? Number(parsed.subtotal) : undefined,
      grand_total: Number.isFinite(Number(parsed.grand_total))
        ? Number(parsed.grand_total)
        : undefined,
      coupon_code:
        typeof parsed.coupon_code === "string" && parsed.coupon_code.trim()
          ? parsed.coupon_code.trim()
          : null,
      history: Array.isArray(parsed.history) ? parsed.history : undefined,
    };
  } catch {
    return null;
  }
}

export function stripOrderLineLayout(notes: string | null | undefined): string {
  if (!notes) return "";
  return stripPaymentMeta(notes.replace(LINE_LAYOUT_RE, "").trim());
}

export function packOrderNotesWithLineLayout(
  userNotes: string | null | undefined,
  items: OrderLine[],
): string | undefined {
  const clean = stripOrderLineLayout(userNotes);
  const hasSpecial = items.some(
    (item) => item.displayType === "section" || item.displayType === "note",
  );
  if (!hasSpecial) return clean || undefined;
  const layout: LineLayoutEntry[] = items.map((item) => {
    if (item.displayType === "section") return { t: "s", n: item.name };
    if (item.displayType === "note") return { t: "n", n: item.name };
    return { t: "p" };
  });
  const block = `${LINE_LAYOUT_START}${JSON.stringify(layout)}${LINE_LAYOUT_END}`;
  return clean ? `${clean}\n\n${block}` : block;
}

/** Persist payment due/paid (+ optional line layout) inside sales order notes. */
export function packSalesOrderNotes(
  userNotes: string | null | undefined,
  items: OrderLine[],
  payment?: PackedPaymentMeta | null,
): string | undefined {
  const withLines = packOrderNotesWithLineLayout(userNotes, items) ?? "";
  if (!payment) return withLines || undefined;
  const block = `${PAYMENT_META_START}${JSON.stringify({
    paid: payment.paid,
    due: payment.due,
    status: payment.status,
    method: payment.method,
    history: payment.history ?? [],
  })}${PAYMENT_META_END}`;
  return withLines ? `${withLines}\n\n${block}` : block;
}

function paymentMetaFromOrder(order: Order): PackedPaymentMeta {
  const paid = order.payment?.paidAmount ?? 0;
  // Always derive `due` from grandTotal (subtotal + tax - discount + shipping) minus
  // paid, exactly like the drawer's live footer (dueBalance) does — never trust a
  // pre-existing order.payment.dueAmount here. That field is supposed to already equal
  // this same formula (see formToOrder), but treating it as authoritative let a stale
  // or differently-derived dueAmount (e.g. tax-less, from an older code path) leak into
  // the persisted `<!--againerp:payment-->` notes blob even after grandTotal itself was
  // fixed to include tax. Deriving `due` here directly closes that gap for good.
  const due = Math.max(0, (order.grandTotal ?? 0) - paid);
  const status: PaymentStatus =
    order.paymentStatus ??
    (paid <= 0 ? "unpaid" : due > 0 ? "partial" : "paid");
  return {
    paid,
    due,
    status,
    method: order.payment?.method,
    history: (order.paymentTimeline ?? []).map((evt) => ({
      id: evt.id,
      label: evt.label,
      amount: evt.amount,
      status: evt.status,
      at: evt.at,
      method: evt.method,
      account: evt.accountName,
      accountId: evt.accountId,
      kind: evt.kind,
    })),
  };
}

export function unpackOrderItemsWithLineLayout(
  notes: string | null | undefined,
  productItems: OrderLine[],
): { notes: string | undefined; items: OrderLine[] } {
  const raw = notes ?? "";
  const match = raw.match(LINE_LAYOUT_RE);
  if (!match) {
    return { notes: raw || undefined, items: productItems };
  }
  let layout: LineLayoutEntry[] = [];
  try {
    const parsed = JSON.parse(match[1] ?? "[]") as unknown;
    layout = Array.isArray(parsed) ? (parsed as LineLayoutEntry[]) : [];
  } catch {
    return { notes: raw.replace(LINE_LAYOUT_RE, "").trim() || undefined, items: productItems };
  }
  const userNotes = raw.replace(LINE_LAYOUT_RE, "").trim() || undefined;
  const items: OrderLine[] = [];
  let productIdx = 0;
  layout.forEach((entry, idx) => {
    if (entry?.t === "p") {
      if (productIdx < productItems.length) {
        items.push(productItems[productIdx++]);
      }
      return;
    }
    if (entry?.t === "s") {
      items.push({
        id: `sec_${idx}_${Date.now()}`,
        productId: "",
        name: String(entry.n ?? ""),
        sku: "",
        quantity: 0,
        unitPrice: 0,
        discount: 0,
        tax: 0,
        lineTotal: 0,
        displayType: "section",
      });
      return;
    }
    if (entry?.t === "n") {
      items.push({
        id: `note_${idx}_${Date.now()}`,
        productId: "",
        name: String(entry.n ?? ""),
        sku: "",
        quantity: 0,
        unitPrice: 0,
        discount: 0,
        tax: 0,
        lineTotal: 0,
        displayType: "note",
      });
    }
  });
  while (productIdx < productItems.length) {
    items.push(productItems[productIdx++]);
  }
  return { notes: userNotes, items };
}

function mapLines(lines: ApiSalesOrderLine[]): OrderLine[] {
  return lines.map((line) => ({
    id: line.id,
    productId: line.item_id,
    name: line.name,
    sku: line.sku,
    imageUrl: line.image_url || undefined,
    quantity: line.quantity_ordered,
    quantityDelivered: line.quantity_delivered,
    quantityReturned: line.quantity_returned,
    unitPrice: num(line.unit_price),
    discount: num(line.discount_amount),
    tax: num(line.tax_amount),
    lineTotal: num(line.line_total),
    variant: parseLineVariant(line.notes),
    serialNumbers: line.serial_numbers?.length ? line.serial_numbers : undefined,
  }));
}

function mapQuotationLines(lines: ApiSalesQuotationLine[]): OrderLine[] {
  return lines.map((line) => ({
    id: line.id,
    productId: line.item_id,
    name: line.name,
    sku: line.sku,
    quantity: line.quantity,
    unitPrice: num(line.unit_price),
    discount: num(line.discount_amount),
    tax: num(line.tax_amount),
    lineTotal: num(line.line_total),
    variant: parseLineVariant(line.notes),
  }));
}

function baseOrderFields(
  row: {
    id: string;
    customer_id: string;
    customer_name: string | null;
    sales_rep: string | null;
    notes: string | null;
    subtotal: string | number;
    tax_total: string | number;
    discount_total: string | number;
    total: string | number;
    /** Credited sales returns against the order (orders only; quotations have none). */
    returned_total?: string | number | null;
    /** Website orders only: the customer-facing status, and the shipment status of that order. */
    website_status?: string | null;
    shipping_status?: string | null;
    website_billing_address?: ApiSalesOrderAddress | null;
    website_shipping_address?: ApiSalesOrderAddress | null;
  } & ApiSalesCustomerSnapshot,
  orderNumber: string,
  orderDate: string,
  status: OrderStatus,
  items: OrderLine[],
  kind: SalesRecordKind,
): Order & SalesRecordMeta {
  const paymentMeta = unpackPaymentMeta(row.notes);
  const subtotal = paymentMeta?.subtotal ?? num(row.subtotal);
  const taxAmount = paymentMeta?.tax ?? num(row.tax_total);
  const discountAmount = paymentMeta?.discount ?? num(row.discount_total);
  const shippingAmount = paymentMeta?.shipping ?? 0;
  const grandTotal =
    paymentMeta?.grand_total ??
    num(row.total) ??
    Math.max(0, subtotal - discountAmount + taxAmount + shippingAmount);
  const paidAmount = paymentMeta?.paid ?? 0;
  // Due is always recomputed from the real numbers: the blob's `due` was written
  // at save time and goes stale once a return is credited against the order.
  const returnedTotal = num(row.returned_total ?? 0);
  const dueAmount = Math.max(0, grandTotal - paidAmount - returnedTotal);
  const refundAmount = (paymentMeta?.history ?? [])
    .filter((evt) => evt.kind === "refund" && (evt.status ?? "completed") === "completed")
    .reduce((s, evt) => s + (Number(evt.amount) || 0), 0);
  const paymentStatus: PaymentStatus =
    paymentMeta?.status === "refunded" || paymentMeta?.status === "failed"
      ? paymentMeta.status
      : paidAmount <= 0
        ? "unpaid"
        : dueAmount > 0
          ? "partial"
          : "paid";
  const customerCity = row.customer_city?.trim() || "";
  const customerRegion = row.customer_region?.trim() || "";
  const customerCountry = row.customer_country?.trim() || "Bangladesh";
  const addressBlock = {
    address: "",
    city: customerCity,
    region: customerRegion,
    country: customerCountry,
  };

  return {
    kind,
    id: row.id,
    orderNumber,
    orderDate: `${orderDate.slice(0, 10)}T12:00:00`,
    status,
    paymentStatus,
    // a website order carries its real shipment status (unfulfilled / shipped / delivered …); others infer it
    shipmentStatus:
      row.website_status && SHIPMENT_STATUSES.includes(row.shipping_status as ShipmentStatus)
        ? (row.shipping_status as ShipmentStatus)
        : status === "completed"
          ? "delivered"
          : status === "processing"
            ? "partial"
            : "unfulfilled",
    source: kind === "quotation" ? "Quotation" : "Sales",
    branch: "Dhaka HQ",
    assignedStaff: row.sales_rep ?? row.customer_assigned_staff ?? undefined,
    priority: "normal",
    tags: row.customer_tags ?? [],
    customer: {
      id: row.customer_id,
      name: row.customer_name ?? "Customer",
      phone: row.customer_phone?.trim() || "",
      email: row.customer_email?.trim() || "",
      group: row.customer_group?.trim() || "Retail",
      lifetimeValue: num(row.customer_lifetime_value),
      orderCount: row.customer_order_count ?? 0,
      riskScore: row.customer_risk_score ?? 0,
    },
    // a website order shows the address the shopper entered; others fall back to the customer's city / country
    billing: checkoutAddress(row.website_billing_address) ?? addressBlock,
    shipping: checkoutAddress(row.website_shipping_address) ?? addressBlock,
    payment: {
      method: paymentMeta?.method
        ? normalizeApiPaymentMethod(paymentMeta.method)
        : "Manual",
      paidAmount,
      dueAmount,
      refundAmount,
    },
    shipment: { shippingCost: shippingAmount },
    items,
    subtotal,
    discountAmount,
    taxAmount,
    shippingAmount,
    grandTotal,
    notes: stripOrderLineLayout(row.notes) || undefined,
    timeline: [],
    activities: [],
    comments: [],
    attachments: [],
    paymentTimeline: (paymentMeta?.history ?? []).map((evt) => ({
      id: evt.id,
      label: evt.label,
      amount: evt.amount,
      status: (evt.status as "completed" | "pending" | "failed") || "completed",
      at: evt.at,
      method: evt.method,
      accountName: evt.account,
      accountId: evt.accountId,
      kind: evt.kind,
    })),
    followers: [],
    aiRisk: "low",
    aiInsights: defaultAiInsights("low", 20),
  };
}

export function apiSalesOrderToOrder(row: ApiSalesOrder): Order & SalesRecordMeta {
  const products = mapLines(row.lines ?? []);
  const { items } = unpackOrderItemsWithLineLayout(row.notes, products);
  // Keep original notes so payment meta (<!--againerp:payment-->) is preserved.
  const mapped = baseOrderFields(
    { ...row, notes: row.notes },
    row.order_number,
    row.order_date,
    ORDER_STATUS_TO_UI[row.status] ?? "draft",
    items,
    "order",
  );
  const shippingExtras = {
    paymentTerms: row.payment_terms ?? undefined,
    saleStage: (row.sale_stage as Order["saleStage"]) ?? "final",
    invoiceScheme: (row.invoice_scheme as Order["invoiceScheme"]) ?? "standard",
    shippingStatus: (row.shipping_status as Order["shippingStatus"]) ?? undefined,
    deliveredTo: row.delivered_to ?? undefined,
    deliveryPersonId: row.delivery_person_id ?? undefined,
    deliveryPersonName: row.delivery_person_name ?? undefined,
    courier: row.courier ?? undefined,
    trackingNumber: row.tracking_number ?? undefined,
    trackingUrl: row.tracking_url ?? undefined,
    timeline: (row.activities ?? []).map((a) => ({
      id: a.id,
      type: a.activity_type,
      title: a.title,
      description: a.description ?? undefined,
      actor: a.actor_name ?? "System",
      actorInitials: (a.actor_name ?? "SY").slice(0, 2).toUpperCase(),
      at: a.created_at,
    })),
    editRequest: row.edit_request
      ? {
          id: row.edit_request.id,
          status: row.edit_request.status,
          reason: row.edit_request.reason ?? undefined,
          requestedBy: row.edit_request.requested_by,
          requestedByName: row.edit_request.requested_by_name ?? undefined,
          requestedAt: row.edit_request.requested_at,
          reviewedBy: row.edit_request.reviewed_by ?? undefined,
          reviewedByName: row.edit_request.reviewed_by_name ?? undefined,
          reviewedAt: row.edit_request.reviewed_at ?? undefined,
          reviewNote: row.edit_request.review_note ?? undefined,
        }
      : undefined,
    returnedTotal: num(row.returned_total ?? 0),
    websiteOrderId: row.website_order_id ?? undefined,
    websiteStatus: row.website_status ?? undefined,
    websiteNextStatuses: row.website_next_statuses ?? undefined,
    orderDiscountValue: num(row.order_discount ?? 0) > 0 ? num(row.order_discount) : null,
    orderDiscountType: row.order_discount_type ?? "fixed",
    additionalExpenses: (row.additional_expenses ?? []).map((e, idx) => ({
      id: `exp_${idx}`,
      title: e.title,
      amount: num(e.amount),
    })),
    // The persisted header shipping charge wins over the legacy notes-blob value.
    ...(num(row.shipping_charge ?? 0) > 0 ? { shippingAmount: num(row.shipping_charge) } : {}),
  };
  if (row.notes?.includes("Storefront checkout")) {
    return {
      ...mapped,
      warehouseId: row.warehouse_id ?? undefined,
      source: "Web Store",
      invoiceNumber: row.invoice_number,
      invoicedAt: row.invoiced_at,
      ...shippingExtras,
    };
  }
  return {
    ...mapped,
    warehouseId: row.warehouse_id ?? undefined,
    invoiceNumber: row.invoice_number,
    invoicedAt: row.invoiced_at,
    ...shippingExtras,
  };
}

export function apiSalesQuotationToOrder(row: ApiSalesQuotation): Order & SalesRecordMeta {
  const products = mapQuotationLines(row.lines ?? []);
  const { notes, items } = unpackOrderItemsWithLineLayout(row.notes, products);
  return baseOrderFields(
    { ...row, notes: notes ?? null },
    row.quotation_number,
    row.quote_date,
    QUOTATION_STATUS_TO_UI[row.status] ?? "draft",
    items,
    "quotation",
  );
}

export function isSalesQuotation(order: Order & Partial<SalesRecordMeta>): boolean {
  return order.kind === "quotation" || order.orderNumber.startsWith("QUO-");
}

function resolveSalesRecordKind(
  order: Order & Partial<SalesRecordMeta>,
  isNew: boolean,
): "order" | "quotation" {
  if (isSalesQuotation(order)) return "quotation";
  if (isNew && order.orderNumber === "New") return order.kind === "order" ? "order" : "quotation";
  return "order";
}

export function buildSalesQuery(params?: SalesListParams): string {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  if (params?.status) qs.set("status", params.status);
  if (params?.customer_id) qs.set("customer_id", params.customer_id);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.per_page) qs.set("per_page", String(params.per_page));
  if (params?.sort_by) qs.set("sort_by", params.sort_by);
  if (params?.sort_dir) qs.set("sort_dir", params.sort_dir);
  const query = qs.toString();
  return query ? `?${query}` : "";
}

export type SalesListMeta = { count: number; page: number; per_page: number };
export type SalesListPage<T> = { data: T[]; meta: SalesListMeta };
export type SalesFetchOptions = {
  /** Bypass the same-session GET cache (explicit Refresh, post-mutation refetch). */
  fresh?: boolean;
};

function listInit(opts?: SalesFetchOptions): RequestInit | undefined {
  return opts?.fresh ? { cache: "no-store" } : undefined;
}

function listMeta<T>(res: Partial<SalesListPage<T>>, params?: SalesListParams): SalesListMeta {
  const data = res.data ?? [];
  return (
    res.meta ?? {
      count: data.length,
      page: params?.page ?? 1,
      per_page: params?.per_page ?? data.length,
    }
  );
}

export async function fetchSalesOrdersPage(
  params?: SalesListParams,
  opts?: SalesFetchOptions,
): Promise<SalesListPage<ApiSalesOrder>> {
  const res = await apiFetch<SalesListPage<ApiSalesOrder>>(
    `/api/v1/sales/orders${buildSalesQuery(params)}`,
    listInit(opts),
  );
  return { data: res.data ?? [], meta: listMeta(res, params) };
}

export async function fetchSalesQuotationsPage(
  params?: SalesListParams,
  opts?: SalesFetchOptions,
): Promise<SalesListPage<ApiSalesQuotation>> {
  const res = await apiFetch<SalesListPage<ApiSalesQuotation>>(
    `/api/v1/sales/quotations${buildSalesQuery(params)}`,
    listInit(opts),
  );
  return { data: res.data ?? [], meta: listMeta(res, params) };
}

export async function fetchSalesOrders(params?: SalesListParams): Promise<ApiSalesOrder[]> {
  return (await fetchSalesOrdersPage(params)).data;
}

export async function fetchSalesQuotations(params?: SalesListParams): Promise<ApiSalesQuotation[]> {
  return (await fetchSalesQuotationsPage(params)).data;
}

export type SalesRecordsPage = {
  rows: (Order & SalesRecordMeta)[];
  /** Server-side total for the query (`meta.count`), not the rows on this page. */
  total: number;
};

/** One page of orders *or* quotations — the list shows one kind at a time, so
 * paging can be real server paging instead of merging two capped lists. */
export async function fetchSalesRecordsPage(
  kind: SalesRecordKind,
  params?: SalesListParams,
  opts?: SalesFetchOptions,
): Promise<SalesRecordsPage> {
  if (kind === "quotation") {
    const page = await fetchSalesQuotationsPage(params, opts);
    return { rows: page.data.map(apiSalesQuotationToOrder), total: page.meta.count };
  }
  const page = await fetchSalesOrdersPage(params, opts);
  return { rows: page.data.map(apiSalesOrderToOrder), total: page.meta.count };
}

export async function fetchSalesRecords(params?: SalesListParams): Promise<(Order & SalesRecordMeta)[]> {
  const [orders, quotations] = await Promise.all([
    fetchSalesOrders(params),
    fetchSalesQuotations(params),
  ]);
  return [
    ...quotations.map(apiSalesQuotationToOrder),
    ...orders.map(apiSalesOrderToOrder),
  ].sort((a, b) => b.orderDate.localeCompare(a.orderDate));
}

/** Outstanding dues for a customer across sales orders (excludes quotations). */
export type CustomerDueRow = {
  id: string;
  orderNumber: string;
  orderDate: string;
  status: OrderStatus;
  dueAmount: number;
  grandTotal: number;
  paidAmount: number;
};

/**
 * What the customer still owes on one order. Only a confirmed sale reaches the
 * ledger, so drafts, quotations and cancelled orders never count — and what
 * came back as a return is no longer owed.
 */
export function orderOutstandingDue(order: Order & Partial<SalesRecordMeta>): number {
  if ((order as SalesRecordMeta).kind === "quotation") return 0;
  if (
    order.status === "draft" ||
    order.status === "cancelled" ||
    order.status === "refunded" ||
    order.status === "failed"
  ) {
    return 0;
  }
  const total = order.grandTotal ?? 0;
  const returned = order.returnedTotal ?? 0;
  const paid = order.payment?.paidAmount;
  if (typeof paid === "number" && Number.isFinite(paid)) {
    return Math.max(0, total - paid - returned);
  }
  const due = order.payment?.dueAmount;
  if (typeof due === "number" && Number.isFinite(due)) return Math.max(0, due - returned);
  return Math.max(0, total - returned);
}

export async function fetchCustomerDueList(
  customerId: string,
  excludeOrderId?: string | null,
): Promise<CustomerDueRow[]> {
  if (!customerId) return [];
  const rows = await fetchSalesOrders({
    customer_id: customerId,
    per_page: 100,
    sort_by: "order_date",
    sort_dir: "desc",
  });
  return rows
    .map(apiSalesOrderToOrder)
    .filter((o) => !excludeOrderId || o.id !== excludeOrderId)
    .map((o) => {
      const dueAmount = orderOutstandingDue(o);
      return {
        id: o.id,
        orderNumber: o.orderNumber,
        orderDate: o.orderDate,
        status: o.status,
        dueAmount,
        grandTotal: o.grandTotal,
        paidAmount: o.payment?.paidAmount ?? 0,
      };
    })
    .filter((row) => row.dueAmount > 0);
}

export async function fetchSalesOrder(id: string): Promise<ApiSalesOrder> {
  const res = await apiFetch<{ data: ApiSalesOrder }>(`/api/v1/sales/orders/${id}`);
  return res.data;
}

export async function fetchSalesQuotation(id: string): Promise<ApiSalesQuotation> {
  const res = await apiFetch<{ data: ApiSalesQuotation }>(`/api/v1/sales/quotations/${id}`);
  return res.data;
}

/** A NaN from a half-edited line serialises as JSON null, which the API rejects. */
function finiteOrZero(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function orderToSalesLineInput(item: OrderLine): SalesLineInput {
  const quantity = finiteOrZero(item.quantity);
  const unitPrice = finiteOrZero(item.unitPrice);
  const discount = finiteOrZero(item.discount);
  const tax = finiteOrZero(item.tax);
  const base = quantity * unitPrice;
  const net = Math.max(0, base - discount);
  const taxRate = net > 0 && tax > 0 ? (tax / net) * 100 : 0;
  return {
    item_id: item.productId && !item.productId.startsWith("mock_") ? item.productId : undefined,
    sku: item.sku !== "—" ? item.sku : undefined,
    quantity,
    unit_price: unitPrice,
    tax_rate: Math.round(taxRate * 100) / 100,
    discount_amount: discount,
    notes: item.variant?.trim() ? `variant: ${item.variant.trim()}` : undefined,
    ...(item.serialNumbers?.length ? { serial_numbers: item.serialNumbers } : {}),
  };
}

/** Quotations reserve nothing, so their line schema has no serial field. */
function quotationLineInput(item: OrderLine): SalesLineInput {
  const line = orderToSalesLineInput(item);
  delete line.serial_numbers;
  return line;
}

export function orderToCreatePayload(order: Order, warehouseId?: string): CreateSalesOrderInput {
  return {
    customer_id: order.customer.id,
    warehouse_id: warehouseId ?? order.warehouseId,
    order_date: order.orderDate.slice(0, 10),
    expected_date: order.orderDate.slice(0, 10),
    sales_rep: order.assignedStaff,
    notes: packSalesOrderNotes(order.notes, order.items, paymentMetaFromOrder(order)),
    payment_terms: order.paymentTerms,
    sale_stage: order.saleStage,
    invoice_scheme: order.invoiceScheme,
    shipping_status: order.shippingStatus,
    delivered_to: order.deliveredTo,
    delivery_person_id: order.deliveryPersonId,
    order_discount: Math.max(0, order.orderDiscountValue ?? 0),
    order_discount_type: order.orderDiscountType ?? "fixed",
    shipping_charge: Math.max(0, order.shippingAmount ?? 0),
    additional_expenses: (order.additionalExpenses ?? []).map((e) => ({
      title: e.title,
      amount: Math.max(0, e.amount || 0),
    })),
    lines: order.items.filter(isProductOrderLine).map(orderToSalesLineInput),
  };
}

export function orderToQuotationPayload(order: Order): CreateSalesQuotationInput {
  return {
    customer_id: order.customer.id,
    warehouse_id: order.warehouseId,
    quote_date: order.orderDate.slice(0, 10),
    sales_rep: order.assignedStaff,
    notes: packSalesOrderNotes(order.notes, order.items, paymentMetaFromOrder(order)),
    lines: order.items.filter(isProductOrderLine).map(quotationLineInput),
  };
}

export async function createSalesOrder(input: CreateSalesOrderInput): Promise<ApiSalesOrder> {
  const res = await apiFetch<{ data: ApiSalesOrder }>("/api/v1/sales/orders", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function createSalesQuotation(input: CreateSalesQuotationInput): Promise<ApiSalesQuotation> {
  const res = await apiFetch<{ data: ApiSalesQuotation }>("/api/v1/sales/quotations", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function updateSalesOrder(id: string, input: UpdateSalesOrderInput): Promise<ApiSalesOrder> {
  const res = await apiFetch<{ success: boolean; data: ApiSalesOrder }>(`/api/v1/sales/orders/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function updateSalesQuotation(
  id: string,
  input: CreateSalesQuotationInput,
): Promise<ApiSalesQuotation> {
  const res = await apiFetch<{ success: boolean; data: ApiSalesQuotation }>(
    `/api/v1/sales/quotations/${id}`,
    {
      method: "PUT",
      body: JSON.stringify(input),
    },
  );
  return res.data;
}

export async function deleteSalesOrder(id: string): Promise<void> {
  await apiFetch(`/api/v1/sales/orders/${id}`, { method: "DELETE" });
}

export async function deleteSalesQuotation(id: string): Promise<void> {
  await apiFetch(`/api/v1/sales/quotations/${id}`, { method: "DELETE" });
}

export async function issueSalesInvoice(id: string): Promise<ApiSalesOrder> {
  const res = await apiFetch<{ data: ApiSalesOrder }>(`/api/v1/sales/orders/${id}/invoice`, {
    method: "POST",
  });
  return res.data;
}

export function salesPublicInvoiceUrl(pathOrKey: string): string {
  const path = pathOrKey.startsWith("/") ? pathOrKey : `/invoice/${pathOrKey}`;
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

export async function createSalesInvoicePublicLink(
  orderId: string,
): Promise<{ public_key: string; path: string; invoice_number: string | null }> {
  const res = await apiFetch<{
    data: { public_key: string; path: string; invoice_number: string | null };
  }>(`/api/v1/sales/orders/${orderId}/public-link`, { method: "POST" });
  return res.data;
}

export async function confirmSalesOrder(id: string): Promise<ApiSalesOrder> {
  const res = await apiFetch<{ data: ApiSalesOrder }>(`/api/v1/sales/orders/${id}/confirm`, {
    method: "POST",
  });
  return res.data;
}

/** Change a website order's status: the shopper's order and this Sales order move together (the shopper sees it in
 * their account) and the Activity tab records it. */
export async function setWebsiteOrderStatus(
  id: string,
  status: string,
  message?: string,
): Promise<Order & SalesRecordMeta> {
  const res = await apiFetch<{ data: ApiSalesOrder }>(`/api/v1/sales/orders/${id}/website-status`, {
    method: "POST",
    body: JSON.stringify({ status, message: message?.trim() || null }),
  });
  invalidateApiGetCache();
  return apiSalesOrderToOrder(res.data);
}

export async function requestSalesOrderEdit(
  id: string,
  reason?: string,
): Promise<Order & SalesRecordMeta> {
  const res = await apiFetch<{ data: ApiSalesOrder }>(
    `/api/v1/sales/orders/${id}/edit-requests`,
    { method: "POST", body: JSON.stringify({ reason: reason?.trim() || null }) },
  );
  return apiSalesOrderToOrder(res.data);
}

export async function reviewSalesOrderEditRequest(
  id: string,
  requestId: string,
  decision: "approve" | "reject",
  note?: string,
): Promise<Order & SalesRecordMeta> {
  const res = await apiFetch<{ data: ApiSalesOrder }>(
    `/api/v1/sales/orders/${id}/edit-requests/${requestId}/review`,
    { method: "POST", body: JSON.stringify({ decision, note: note?.trim() || null }) },
  );
  return apiSalesOrderToOrder(res.data);
}

export async function cancelSalesOrder(id: string, reason?: string): Promise<ApiSalesOrder> {
  const qs = reason ? `?reason=${encodeURIComponent(reason)}` : "";
  const res = await apiFetch<{ data: ApiSalesOrder }>(`/api/v1/sales/orders/${id}/cancel${qs}`, {
    method: "POST",
  });
  return res.data;
}

export async function duplicateSalesOrder(id: string): Promise<ApiSalesOrder> {
  const res = await apiFetch<{ data: ApiSalesOrder }>(`/api/v1/sales/orders/${id}/duplicate`, {
    method: "POST",
  });
  return res.data;
}

export type CreatePathaoConsignmentInput = {
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  itemQuantity?: number;
  itemWeightKg?: number;
};

export type ApiPathaoConsignmentResult = {
  created: boolean;
  skipped: boolean;
  consignment_id: string;
  tracking_url: string;
  message: string;
};

export async function createSalesOrderPathaoConsignment(
  id: string,
  input: CreatePathaoConsignmentInput,
): Promise<ApiPathaoConsignmentResult> {
  const res = await apiFetch<{ data: ApiPathaoConsignmentResult }>(
    `/api/v1/sales/orders/${id}/pathao-consignment`,
    {
      method: "POST",
      body: JSON.stringify({
        recipient_name: input.recipientName,
        recipient_phone: input.recipientPhone,
        recipient_address: input.recipientAddress,
        item_quantity: input.itemQuantity,
        item_weight_kg: input.itemWeightKg,
      }),
    },
  );
  return res.data;
}

export async function duplicateSalesQuotation(id: string): Promise<ApiSalesQuotation> {
  const res = await apiFetch<{ data: ApiSalesQuotation }>(
    `/api/v1/sales/quotations/${id}/duplicate`,
    { method: "POST" },
  );
  return res.data;
}

export async function bulkDeleteSalesOrders(ids: string[]): Promise<number> {
  const res = await apiFetch<{ data: { deleted: number } }>("/api/v1/sales/orders/bulk-delete", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
  return res.data.deleted;
}

export async function bulkUpdateSalesOrderStatus(ids: string[], status: string): Promise<number> {
  const res = await apiFetch<{ data: { updated: number } }>("/api/v1/sales/orders/bulk-status", {
    method: "POST",
    body: JSON.stringify({ ids, status }),
  });
  return res.data.updated;
}

export function uiStatusToApiStatus(order: Order & Partial<SalesRecordMeta>, status: OrderStatus): string {
  if (isSalesQuotation(order)) {
    return UI_STATUS_TO_QUOTATION[status] ?? "draft";
  }
  return UI_STATUS_TO_ORDER[status] ?? "draft";
}

async function approveQuotation(id: string): Promise<void> {
  const sent = await apiFetch<{ data: ApiSalesQuotation }>(
    `/api/v1/sales/quotations/${id}/status`,
    { method: "PATCH", body: JSON.stringify({ status: "sent" }) },
  );
  if (sent.data.status === "sent") {
    await apiFetch(`/api/v1/sales/quotations/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "approved" }),
    });
  }
}

export async function persistSalesOrder(
  order: Order & Partial<SalesRecordMeta>,
  action: "save" | "confirm" | "cancel" | "duplicate" | "delete",
): Promise<Order & SalesRecordMeta> {
  const isNew =
    !order.id ||
    order.id.startsWith("ord_") ||
    order.orderNumber === "New";
  const isQuote = resolveSalesRecordKind(order, isNew) === "quotation";

  if (action === "delete") {
    if (isQuote && !isNew) {
      await deleteSalesQuotation(order.id);
    } else if (!isNew) {
      await deleteSalesOrder(order.id);
    }
    return { ...order, status: "cancelled", kind: order.kind ?? "order" };
  }

  if (action === "duplicate" && !isNew) {
    if (isQuote) {
      const row = await duplicateSalesQuotation(order.id);
      return apiSalesQuotationToOrder(row);
    }
    const row = await duplicateSalesOrder(order.id);
    return apiSalesOrderToOrder(row);
  }

  if (isNew) {
    const payload = isQuote
      ? orderToQuotationPayload(order)
      : orderToCreatePayload(order);
    const row = isQuote ? await createSalesQuotation(payload) : await createSalesOrder(payload);
    const saved = isQuote
      ? apiSalesQuotationToOrder(row as ApiSalesQuotation)
      : apiSalesOrderToOrder(row as ApiSalesOrder);
    if (action === "confirm" && !isQuote) {
      const confirmed = await confirmSalesOrder(saved.id);
      return apiSalesOrderToOrder(confirmed);
    }
    if (action === "confirm" && isQuote) {
      await approveQuotation(saved.id);
      const converted = await apiFetch<{ data: ApiSalesOrder }>(
        `/api/v1/sales/quotations/${saved.id}/convert`,
        { method: "POST" },
      );
      return apiSalesOrderToOrder(converted.data);
    }
    return saved;
  }

  const updatePayload = isQuote
    ? orderToQuotationPayload(order)
    : orderToCreatePayload(order);

  if (isQuote) {
    await updateSalesQuotation(order.id, updatePayload as CreateSalesQuotationInput);
    if (action === "confirm") {
      await approveQuotation(order.id);
      const converted = await apiFetch<{ data: ApiSalesOrder }>(
        `/api/v1/sales/quotations/${order.id}/convert`,
        { method: "POST" },
      );
      return apiSalesOrderToOrder(converted.data);
    }
    const refreshed = await fetchSalesQuotation(order.id);
    return apiSalesQuotationToOrder(refreshed);
  }

  await updateSalesOrder(order.id, updatePayload);
  if (action === "confirm") {
    const confirmed = await confirmSalesOrder(order.id);
    return apiSalesOrderToOrder(confirmed);
  }
  if (action === "cancel") {
    const cancelled = await cancelSalesOrder(order.id);
    return apiSalesOrderToOrder(cancelled);
  }
  const refreshed = await fetchSalesOrder(order.id);
  return apiSalesOrderToOrder(refreshed);
}
