export type OrderStatus =
  | "draft"
  | "pending"
  | "confirmed"
  | "processing"
  | "packed"
  | "shipped"
  | "delivered"
  | "completed"
  | "cancelled"
  | "returned"
  | "refunded"
  | "failed";

export type PaymentStatus = "unpaid" | "partial" | "paid" | "refunded" | "failed";
export type ShipmentStatus = "unfulfilled" | "partial" | "shipped" | "delivered" | "returned";

export type OrderLine = {
  id: string;
  productId: string;
  name: string;
  sku: string;
  imageUrl?: string;
  quantity: number;
  /** How many units of this line have actually shipped — the real cap on a sales return. */
  quantityDelivered?: number;
  /** Already returned against this line (backend-tracked). */
  quantityReturned?: number;
  unitPrice: number;
  discount: number;
  tax: number;
  lineTotal: number;
  variant?: string;
  /** Units sold on this line by serial number (serial-tracked products only). */
  serialNumbers?: string[];
  /** Section header or free-text note row (not a catalog product). */
  displayType?: "product" | "section" | "note";
};

export type OrderAiInsights = {
  orderSummary: string;
  customerSummary: string;
  riskLevel: "low" | "medium" | "high";
  riskScore: number;
  riskReasons: string[];
  deliveryPrediction: { success: number; delayRisk: string; returnRisk: string };
  upsellSuggestions: { name: string; reason: string }[];
  retentionProbability: number;
};

export type OrderComment = {
  id: string;
  author: string;
  authorInitials: string;
  body: string;
  isInternal: boolean;
  at: string;
};

export type OrderAttachment = {
  id: string;
  name: string;
  type: "invoice" | "payment" | "delivery" | "other";
  size: string;
};

export type PaymentTimelineEvent = {
  id: string;
  label: string;
  amount: number;
  status: "completed" | "pending" | "failed";
  at: string;
  method?: string;
  accountName?: string;
  /** Finance payment-account id — lets the API post the payment to the right account. */
  accountId?: string;
  /** "refund" = money paid back out to the customer (e.g. for a sales return). */
  kind?: "payment" | "refund";
};
export type TimelineEvent = {
  id: string;
  type: string;
  title: string;
  description?: string;
  actor: string;
  actorInitials?: string;
  at: string;
};

export type OrderActivity = {
  id: string;
  type: string;
  title: string;
  assignee?: string;
  dueDate?: string;
  status: "open" | "done";
};

export type Order = {
  id: string;
  orderNumber: string;
  orderDate: string;
  /** Fulfilling warehouse — optional, defaults server-side when unset. */
  warehouseId?: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  shipmentStatus: ShipmentStatus;
  source: string;
  branch: string;
  assignedStaff?: string;
  priority: "normal" | "high" | "urgent";
  tags: string[];
  customer: {
    id: string;
    name: string;
    phone: string;
    email: string;
    group?: string;
    lifetimeValue: number;
    orderCount: number;
    riskScore: number;
  };
  billing: {
    address: string;
    city: string;
    region: string;
    country: string;
    /** Website orders: the postal code the shopper gave (blank = none). Unset = the form's placeholder. */
    zip?: string;
  };
  shipping: {
    address: string;
    city: string;
    region: string;
    country: string;
    zip?: string;
  };
  payment: {
    method: string;
    transactionId?: string;
    paidAmount: number;
    dueAmount: number;
    refundAmount: number;
  };
  shipment: {
    courier?: string;
    trackingNumber?: string;
    trackingUrl?: string;
    shippingCost: number;
    shippedAt?: string;
    deliveredAt?: string;
  };
  items: OrderLine[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  shippingAmount: number;
  grandTotal: number;
  notes?: string;
  timeline: TimelineEvent[];
  activities: OrderActivity[];
  comments: OrderComment[];
  attachments: OrderAttachment[];
  paymentTimeline: PaymentTimelineEvent[];
  followers: string[];
  aiRisk: "low" | "medium" | "high";
  aiSummary?: string;
  aiInsights: OrderAiInsights;
  availableTransitions?: OrderStatus[];
  /** AgainPOS-style "Pay term" — a plain "<n> days"/"<n> months" string. */
  paymentTerms?: string;
  /** AgainPOS-style document stage — separate from the fulfillment `status` above. */
  saleStage?: "final" | "draft" | "quotation" | "proforma";
  /** Which numbering series this order's invoice number should use once issued. */
  invoiceScheme?: "standard" | "quotation" | "proforma";
  shippingStatus?: "ordered" | "packed" | "shipped" | "delivered" | "cancelled";
  deliveredTo?: string;
  deliveryPersonId?: string;
  deliveryPersonName?: string;
  /** Set once a real courier consignment (e.g. Pathao) has been booked for this order. */
  courier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  /** Latest open staff request to edit this order after it left draft. */
  editRequest?: OrderEditRequest;
  /** Total of non-cancelled returns (credit notes) against this order. */
  returnedTotal?: number;
  /** Website (storefront) orders: the customer-facing order this one mirrors, its status (what the shopper's account
   * shows) and the statuses it may be moved to. Unset for orders entered by hand. */
  websiteOrderId?: string;
  websiteStatus?: string;
  websiteNextStatuses?: string[];
  /** Header-level discount as entered in the drawer (null = none). */
  orderDiscountValue?: number | null;
  orderDiscountType?: "fixed" | "percent";
  /** "Add Additional Expense" rows from the drawer's totals box. */
  additionalExpenses?: { id?: string; title: string; amount: number }[];
};

export type OrderEditRequest = {
  id: string;
  status: "pending" | "approved" | "rejected" | "consumed";
  reason?: string;
  requestedBy: string;
  requestedByName?: string;
  requestedAt: string;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  reviewNote?: string;
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: "Draft",
  pending: "Pending",
  confirmed: "Confirmed",
  processing: "Processing",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
  returned: "Returned",
  refunded: "Refunded",
  failed: "Failed",
};

export const SALE_STAGE_LABELS: Record<NonNullable<Order["saleStage"]>, string> = {
  final: "Final",
  draft: "Draft",
  quotation: "Quotation",
  proforma: "Proforma",
};

export const INVOICE_SCHEME_LABELS: Record<NonNullable<Order["invoiceScheme"]>, string> = {
  standard: "Standard",
  quotation: "Quotation series",
  proforma: "Proforma series",
};

export const SHIPPING_STATUS_LABELS: Record<NonNullable<Order["shippingStatus"]>, string> = {
  ordered: "Ordered",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const img = (n: number) => `https://picsum.photos/seed/ord${n}/80/80`;

const emptyAddress = { address: "", city: "", region: "", country: "" };

/** Fill gaps in persisted or manually created orders so detail views never crash. */
export function normalizeOrder(order: Order): Order {
  const risk = order.aiRisk ?? "medium";
  const score = order.customer?.riskScore ?? 45;
  return {
    ...order,
    tags: order.tags ?? [],
    priority: order.priority ?? "normal",
    customer: {
      id: order.customer?.id ?? "guest",
      name: order.customer?.name ?? "Guest",
      phone: order.customer?.phone ?? "",
      email: order.customer?.email ?? "",
      group: order.customer?.group ?? "retail",
      lifetimeValue: order.customer?.lifetimeValue ?? 0,
      orderCount: order.customer?.orderCount ?? 0,
      riskScore: order.customer?.riskScore ?? score,
    },
    billing: { ...emptyAddress, ...order.billing },
    shipping: { ...emptyAddress, ...order.shipping },
    payment: {
      method: order.payment?.method ?? "COD",
      paidAmount: order.payment?.paidAmount ?? 0,
      dueAmount: order.payment?.dueAmount ?? order.grandTotal ?? 0,
      refundAmount: order.payment?.refundAmount ?? 0,
      transactionId: order.payment?.transactionId,
    },
    shipment: {
      shippingCost: order.shipment?.shippingCost ?? order.shippingAmount ?? 0,
      courier: order.shipment?.courier,
      trackingNumber: order.shipment?.trackingNumber,
      trackingUrl: order.shipment?.trackingUrl,
      shippedAt: order.shipment?.shippedAt,
      deliveredAt: order.shipment?.deliveredAt,
    },
    items: (order.items ?? []).map((item, idx) => ({
      id: item.id ?? `li_${idx}`,
      productId: item.productId ?? "",
      name: item.name ?? "Item",
      sku: item.sku ?? "—",
      imageUrl: item.imageUrl,
      quantity: item.quantity ?? 1,
      unitPrice: item.unitPrice ?? 0,
      discount: item.discount ?? 0,
      tax: item.tax ?? 0,
      lineTotal: item.lineTotal ?? item.quantity * item.unitPrice - (item.discount ?? 0) + (item.tax ?? 0),
      variant: item.variant,
      // Optional line facts must survive normalisation: section/note rows, delivery
      // and return counters, and the serial units captured on the line.
      displayType: item.displayType,
      quantityDelivered: item.quantityDelivered,
      quantityReturned: item.quantityReturned,
      serialNumbers: item.serialNumbers?.length ? [...item.serialNumbers] : undefined,
    })),
    timeline: order.timeline ?? [],
    activities: order.activities ?? [],
    comments: order.comments ?? [],
    attachments: order.attachments ?? [],
    paymentTimeline: order.paymentTimeline ?? [],
    followers: order.followers ?? [],
    aiRisk: risk,
    aiInsights: order.aiInsights ?? defaultAiInsights(risk, score),
    availableTransitions: order.availableTransitions ?? [],
  };
}

export function defaultAiInsights(risk: "low" | "medium" | "high", score: number): OrderAiInsights {
  return {
    orderSummary: risk === "low"
      ? "Standard ecommerce order with verified payment and repeat customer."
      : risk === "medium"
        ? "COD order — confirm address and phone before fulfillment."
        : "High-value return case — review refund history and fraud signals.",
    customerSummary: "Active buyer with consistent purchase pattern in apparel category.",
    riskLevel: risk,
    riskScore: score,
    riskReasons:
      risk === "low"
        ? ["Verified payment", "Repeat customer", "Normal order value"]
        : risk === "medium"
          ? ["COD payment", "New delivery address", "Moderate order value"]
          : ["Multiple returns", "Unusual location", "High refund rate"],
    deliveryPrediction: {
      success: risk === "low" ? 94 : risk === "medium" ? 78 : 62,
      delayRisk: risk === "low" ? "Low" : risk === "medium" ? "Medium" : "High",
      returnRisk: risk === "low" ? "2%" : risk === "medium" ? "8%" : "24%",
    },
    upsellSuggestions: [
      { name: "TechPro Earbud Case", reason: "Often bought with accessories" },
      { name: "Extended Warranty", reason: "Electronics category match" },
    ],
    retentionProbability: risk === "low" ? 87 : risk === "medium" ? 64 : 41,
  };
}

function mkOrder(partial: Partial<Order> & Pick<Order, "id" | "orderNumber" | "status">): Order {
  const subtotal = partial.subtotal ?? 12500;
  const discount = partial.discountAmount ?? 500;
  const tax = partial.taxAmount ?? 625;
  const shipping = partial.shippingAmount ?? 120;
  const grand = subtotal - discount + tax + shipping;
  const order: Order = {
    orderDate: "2026-06-10T14:32:00",
    paymentStatus: "paid",
    shipmentStatus: "shipped",
    source: "Web Store",
    branch: "Dhaka HQ",
    assignedStaff: "Karim Ahmed",
    priority: "normal",
    tags: [],
    customer: {
      id: "c1",
      name: "Rahim Uddin",
      phone: "+880 1712-345678",
      email: "rahim@example.com",
      group: "Retail",
      lifetimeValue: 84200,
      orderCount: 12,
      riskScore: 12,
    },
    billing: {
      address: "12 Mirpur Road",
      city: "Dhaka",
      region: "Dhaka",
      country: "Bangladesh",
    },
    shipping: {
      address: "12 Mirpur Road",
      city: "Dhaka",
      region: "Dhaka",
      country: "Bangladesh",
    },
    payment: {
      method: "bKash",
      transactionId: "BKX92837465",
      paidAmount: grand,
      dueAmount: 0,
      refundAmount: 0,
    },
    shipment: {
      courier: "Pathao",
      trackingNumber: "PTH-8827364",
      trackingUrl: "https://pathao.com/track/8827364",
      shippingCost: shipping,
      shippedAt: "2026-06-11T09:00:00",
    },
    items: [
      {
        id: "li1",
        productId: "p1",
        name: "UrbanWear Classic Tee",
        sku: "UW-TEE-001",
        imageUrl: img(1),
        quantity: 2,
        unitPrice: 1200,
        discount: 200,
        tax: 120,
        lineTotal: 2320,
        variant: "Size L · Navy",
      },
    ],
    subtotal,
    discountAmount: discount,
    taxAmount: tax,
    shippingAmount: shipping,
    grandTotal: grand,
    timeline: [
      { id: "t1", type: "created", title: "Order placed", actor: "System", actorInitials: "SY", at: "2026-06-10T14:32:00" },
      { id: "t2", type: "payment", title: "Payment captured", description: "bKash BKX92837465", actor: "System", actorInitials: "SY", at: "2026-06-10T14:33:00" },
      { id: "t3", type: "status", title: "Order confirmed", actor: "Karim Ahmed", actorInitials: "KA", at: "2026-06-10T15:00:00" },
      { id: "t4", type: "shipment", title: "Fulfillment started", description: "Pathao PTH-8827364", actor: "Warehouse", actorInitials: "WH", at: "2026-06-11T09:00:00" },
      { id: "t5", type: "note", title: "Internal note added", description: "Customer requested evening delivery", actor: "Sadia Rahman", actorInitials: "SR", at: "2026-06-11T10:15:00" },
    ],
    activities: [
      { id: "a1", type: "call", title: "Call customer for address confirm", assignee: "Sadia", dueDate: "2026-06-10", status: "done" },
      { id: "a2", type: "task", title: "Pack items for dispatch", assignee: "Warehouse", dueDate: "2026-06-11", status: "done" },
    ],
    comments: [
      { id: "c1", author: "Karim Ahmed", authorInitials: "KA", body: "Customer confirmed delivery slot 6–9 PM.", isInternal: true, at: "2026-06-10T15:05:00" },
    ],
    attachments: [
      { id: "f1", name: "Invoice-ORD-1001.pdf", type: "invoice", size: "124 KB" },
      { id: "f2", name: "payment-screenshot.png", type: "payment", size: "89 KB" },
    ],
    paymentTimeline: [
      { id: "p1", label: "Payment authorized", amount: grand, status: "completed", at: "2026-06-10T14:33:00" },
    ],
    followers: ["Karim Ahmed", "Sadia Rahman"],
    aiRisk: "low" as const,
    aiSummary: "Standard retail order. Repeat customer, low return history. Delivery on track.",
    aiInsights: defaultAiInsights("low", 12),
    ...partial,
  };
  const merged = { ...order, ...partial };
  const risk = merged.aiRisk ?? "low";
  const score = merged.customer?.riskScore ?? 12;
  return {
    ...merged,
    aiInsights: partial.aiInsights ?? defaultAiInsights(risk, score),
  };
}

export const ordersSeed: Order[] = [
  mkOrder({ id: "ord_1001", orderNumber: "ORD-1001", status: "shipped", tags: ["VIP"] }),
  mkOrder({
    id: "ord_1002",
    orderNumber: "ORD-1002",
    status: "pending",
    paymentStatus: "unpaid",
    shipmentStatus: "unfulfilled",
    orderDate: "2026-06-12T10:15:00",
    customer: { id: "c2", name: "Fatima Khan", phone: "+880 1812-998877", email: "fatima@example.com", group: "Retail", lifetimeValue: 12400, orderCount: 2, riskScore: 45 },
    payment: { method: "COD", paidAmount: 0, dueAmount: 12745, refundAmount: 0 },
    shipment: { shippingCost: 120 },
    priority: "high",
    aiRisk: "medium",
    aiSummary: "COD order — verify address before confirm.",
  }),
  mkOrder({
    id: "ord_1003",
    orderNumber: "ORD-1003",
    status: "processing",
    shipmentStatus: "partial",
    branch: "Chittagong",
    assignedStaff: "Nusrat Jahan",
    items: [
      { id: "li2", productId: "p2", name: "TechPro Wireless Earbuds", sku: "TP-BUD-220", imageUrl: img(2), quantity: 1, unitPrice: 4500, discount: 0, tax: 225, lineTotal: 4725 },
      { id: "li3", productId: "p3", name: "TechPro USB-C Hub", sku: "TP-HUB-11", imageUrl: img(3), quantity: 1, unitPrice: 2800, discount: 200, tax: 130, lineTotal: 2730 },
    ],
    subtotal: 7300,
    grandTotal: 8175,
    tags: ["B2B"],
  }),
  mkOrder({ id: "ord_1004", orderNumber: "ORD-1004", status: "delivered", shipmentStatus: "delivered", shipment: { courier: "RedX", trackingNumber: "RDX-99102", shippingCost: 100, shippedAt: "2026-06-08T11:00:00", deliveredAt: "2026-06-09T16:30:00" } }),
  mkOrder({ id: "ord_1005", orderNumber: "ORD-1005", status: "completed", paymentStatus: "paid", shipmentStatus: "delivered" }),
  mkOrder({
    id: "ord_1006",
    orderNumber: "ORD-1006",
    status: "draft",
    paymentStatus: "unpaid",
    shipmentStatus: "unfulfilled",
    source: "Phone",
    assignedStaff: "Karim Ahmed",
  }),
  mkOrder({
    id: "ord_1007",
    orderNumber: "ORD-1007",
    status: "confirmed",
    tags: ["Express"],
    assignedStaff: "Karim Ahmed",
  }),
  mkOrder({
    id: "ord_1008",
    orderNumber: "ORD-1008",
    status: "packed",
    shipmentStatus: "partial",
    assignedStaff: "Karim Ahmed",
  }),
  mkOrder({
    id: "ord_1013",
    orderNumber: "ORD-1013",
    status: "confirmed",
    paymentStatus: "paid",
    shipmentStatus: "unfulfilled",
    orderDate: "2026-07-02T09:30:00",
    customer: {
      id: "c3",
      name: "Rahim Traders",
      phone: "+880 1711-223344",
      email: "orders@rahimtraders.bd",
      group: "Wholesale",
      lifetimeValue: 89000,
      orderCount: 14,
      riskScore: 8,
    },
    assignedStaff: "Nusrat Jahan",
    branch: "Dhaka HQ",
    source: "Website",
    tags: ["B2B"],
  }),
  mkOrder({
    id: "ord_1014",
    orderNumber: "ORD-1014",
    status: "processing",
    paymentStatus: "paid",
    shipmentStatus: "partial",
    orderDate: "2026-07-03T14:00:00",
    assignedStaff: "Karim Ahmed",
    branch: "Chittagong",
  }),
  mkOrder({ id: "ord_1009", orderNumber: "ORD-1009", status: "returned", paymentStatus: "refunded", shipmentStatus: "returned", aiRisk: "high", priority: "urgent" }),
  mkOrder({ id: "ord_1010", orderNumber: "ORD-1010", status: "refunded", paymentStatus: "refunded" }),
  mkOrder({ id: "ord_1011", orderNumber: "ORD-1011", status: "cancelled", paymentStatus: "failed", shipmentStatus: "unfulfilled" }),
  mkOrder({ id: "ord_1012", orderNumber: "ORD-1012", status: "failed", paymentStatus: "failed" }),
];

export function countOrdersByStatus(orders: Order[]) {
  const counts: Record<string, number> = { all: orders.length };
  for (const o of orders) {
    counts[o.status] = (counts[o.status] ?? 0) + 1;
  }
  return counts;
}

export const ordersDashboardChartData = [
  { day: "Mon", orders: 38, revenue: 820000 },
  { day: "Tue", orders: 42, revenue: 910000 },
  { day: "Wed", orders: 35, revenue: 760000 },
  { day: "Thu", orders: 51, revenue: 1120000 },
  { day: "Fri", orders: 47, revenue: 984000 },
  { day: "Sat", orders: 62, revenue: 1380000 },
  { day: "Sun", orders: 44, revenue: 890000 },
];

export const ordersStatusPipeline = [
  { status: "pending", label: "Pending", count: 23, color: "#f59e0b" },
  { status: "processing", label: "Processing", count: 18, color: "#6366f1" },
  { status: "shipped", label: "Shipped", count: 31, color: "#0ea5e9" },
  { status: "delivered", label: "Delivered", count: 12, color: "#10b981" },
];

export const ordersDashboardKpis = {
  totalOrders: 1284,
  todayOrders: 47,
  pending: 23,
  processing: 18,
  shipped: 31,
  delivered: 12,
  revenue: 2847500,
  aov: 22745,
  returnRate: 2.4,
  refundRate: 1.1,
};
