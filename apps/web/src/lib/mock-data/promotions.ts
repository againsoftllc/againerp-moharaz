export type PromotionStatus =
  | "draft"
  | "scheduled"
  | "running"
  | "completed"
  | "cancelled";

export type PromotionRuleType =
  | "cart_subtotal"
  | "product_in_cart"
  | "customer_group"
  | "category";

export type PromotionActionType =
  | "percent_off_cart"
  | "fixed_off_cart"
  | "percent_off_item"
  | "free_item"
  | "free_shipping";

export type StackingMode = "best_deal" | "stackable" | "exclusive";

export type PromotionRule = {
  type: PromotionRuleType;
  minSubtotal?: number;
  productId?: string;
  productName?: string;
  sku?: string;
  minQuantity?: number;
  customerGroup?: string;
  category?: string;
};

export type PromotionAction = {
  type: PromotionActionType;
  value?: number;
  productId?: string;
  productName?: string;
  sku?: string;
  maxDiscount?: number;
};

export type Promotion = {
  id: string;
  name: string;
  slug: string;
  status: PromotionStatus;
  startsAt: string;
  endsAt: string;
  description?: string;
  rules: PromotionRule[];
  actions: PromotionAction[];
  priority: number;
  stackingMode: StackingMode;
  autoApply: boolean;
  showOnCart: boolean;
  showAnnouncement: boolean;
  ordersCount: number;
  revenue: number;
  updatedAt: string;
};

export const PROMOTION_STATUS_LABELS: Record<PromotionStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  running: "Running",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const PROMOTION_RULE_LABELS: Record<PromotionRuleType, string> = {
  cart_subtotal: "Cart subtotal",
  product_in_cart: "Product in cart",
  customer_group: "Customer group",
  category: "Category",
};

export const PROMOTION_RULE_DESCRIPTIONS: Record<PromotionRuleType, string> = {
  cart_subtotal: "Cart total meets minimum spend threshold",
  product_in_cart: "Specific product (and optional qty) is in the cart",
  customer_group: "Customer belongs to a segment (VIP, wholesale, etc.)",
  category: "Cart contains items from a category",
};

export const PROMOTION_ACTION_LABELS: Record<PromotionActionType, string> = {
  percent_off_cart: "% off entire cart",
  fixed_off_cart: "Fixed amount off cart",
  percent_off_item: "% off matching items",
  free_item: "Free product",
  free_shipping: "Free shipping",
};

export const PROMOTION_ACTION_DESCRIPTIONS: Record<PromotionActionType, string> = {
  percent_off_cart: "Percentage discount applied to cart subtotal",
  fixed_off_cart: "Flat amount deducted from cart total",
  percent_off_item: "Percentage off items matching rule category/product",
  free_item: "Add a free SKU when conditions are met",
  free_shipping: "Waive shipping fee at checkout",
};

export const STACKING_MODE_LABELS: Record<StackingMode, string> = {
  best_deal: "Best deal only",
  stackable: "Stackable with others",
  exclusive: "Exclusive (blocks others)",
};

export const CUSTOMER_GROUPS = ["VIP", "Wholesale", "Retail", "New customers"] as const;

export function formatBdt(amount: number) {
  return `৳${amount.toLocaleString("en-BD")}`;
}

export function formatScheduleRange(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const fmt = (d: Date) =>
    d.toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  return `${fmt(start)} → ${fmt(end)}`;
}

function describeRule(rule: PromotionRule): string {
  switch (rule.type) {
    case "cart_subtotal":
      return `Spend ${formatBdt(rule.minSubtotal ?? 0)}+`;
    case "product_in_cart":
      return rule.minQuantity && rule.minQuantity > 1
        ? `${rule.minQuantity}× ${rule.productName ?? "product"} in cart`
        : `${rule.productName ?? "Product"} in cart`;
    case "customer_group":
      return `${rule.customerGroup ?? "Group"} customers`;
    case "category":
      return `${rule.category ?? "Category"} items in cart`;
    default:
      return "Condition";
  }
}

function describeAction(action: PromotionAction): string {
  switch (action.type) {
    case "percent_off_cart":
      return `${action.value ?? 0}% off cart`;
    case "fixed_off_cart":
      return `${formatBdt(action.value ?? 0)} off cart`;
    case "percent_off_item":
      return `${action.value ?? 0}% off matching items`;
    case "free_item":
      return `Free ${action.productName ?? "item"}`;
    case "free_shipping":
      return "Free shipping";
    default:
      return "Discount";
  }
}

export function describePromotion(promotion: Promotion): string {
  const when = promotion.rules.map(describeRule).join(" + ");
  const then = promotion.actions.map(describeAction).join(" + ");
  return when ? `When ${when} → ${then}` : then;
}

export const promotionsSeed: Promotion[] = [
  {
    id: "promo_free_ship_3k",
    name: "Free Shipping Weekend",
    slug: "free-shipping-weekend",
    status: "running",
    startsAt: "2026-06-14T00:00:00",
    endsAt: "2026-06-16T23:59:00",
    description: "Auto-applied free shipping on orders over ৳3,000.",
    rules: [{ type: "cart_subtotal", minSubtotal: 3000 }],
    actions: [{ type: "free_shipping" }],
    priority: 10,
    stackingMode: "stackable",
    autoApply: true,
    showOnCart: true,
    showAnnouncement: true,
    ordersCount: 312,
    revenue: 0,
    updatedAt: "2026-06-15",
  },
  {
    id: "promo_vip_cart",
    name: "VIP Member — 10% Off",
    slug: "vip-10-off",
    status: "running",
    startsAt: "2026-06-01T00:00:00",
    endsAt: "2026-06-30T23:59:00",
    description: "Loyalty segment discount — evaluated at checkout.",
    rules: [{ type: "customer_group", customerGroup: "VIP" }],
    actions: [{ type: "percent_off_cart", value: 10, maxDiscount: 2000 }],
    priority: 20,
    stackingMode: "best_deal",
    autoApply: true,
    showOnCart: true,
    showAnnouncement: false,
    ordersCount: 48,
    revenue: 86400,
    updatedAt: "2026-06-15",
  },
  {
    id: "promo_electronics",
    name: "Electronics Week — 15% Off Items",
    slug: "electronics-week",
    status: "scheduled",
    startsAt: "2026-06-20T00:00:00",
    endsAt: "2026-06-27T23:59:00",
    description: "Category-wide item discount when electronics are in the cart.",
    rules: [{ type: "category", category: "Electronics" }],
    actions: [{ type: "percent_off_item", value: 15 }],
    priority: 15,
    stackingMode: "stackable",
    autoApply: true,
    showOnCart: true,
    showAnnouncement: true,
    ordersCount: 0,
    revenue: 0,
    updatedAt: "2026-06-15",
  },
  {
    id: "promo_tshirt_bonus",
    name: "T-Shirt Cart Bonus",
    slug: "tshirt-cart-bonus",
    status: "completed",
    startsAt: "2026-06-01T00:00:00",
    endsAt: "2026-06-10T23:59:00",
    description: "Extra 5% off entire cart when a T-shirt is purchased.",
    rules: [
      {
        type: "product_in_cart",
        productId: "prod_0001",
        productName: "Premium Cotton T-Shirt",
        sku: "TSH-001",
        minQuantity: 1,
      },
    ],
    actions: [{ type: "percent_off_cart", value: 5 }],
    priority: 5,
    stackingMode: "stackable",
    autoApply: true,
    showOnCart: false,
    showAnnouncement: false,
    ordersCount: 67,
    revenue: 28900,
    updatedAt: "2026-06-10",
  },
  {
    id: "promo_wholesale_ship",
    name: "Wholesale — Free Sample",
    slug: "wholesale-free-sample",
    status: "draft",
    startsAt: "2026-07-01T00:00:00",
    endsAt: "2026-07-31T23:59:00",
    description: "Wholesale buyers get a free mug when cart exceeds ৳8,000.",
    rules: [
      { type: "customer_group", customerGroup: "Wholesale" },
      { type: "cart_subtotal", minSubtotal: 8000 },
    ],
    actions: [
      {
        type: "free_item",
        productId: "prod_0003",
        productName: "Ceramic Coffee Mug Set",
        sku: "MUG-003",
      },
    ],
    priority: 8,
    stackingMode: "exclusive",
    autoApply: true,
    showOnCart: true,
    showAnnouncement: false,
    ordersCount: 0,
    revenue: 0,
    updatedAt: "2026-06-15",
  },
];

export const promotionKpis = (promotions: Promotion[]) => [
  {
    label: "Active rules",
    value: String(promotions.filter((p) => p.status === "running").length),
    sub: "Auto-evaluated at checkout",
  },
  {
    label: "Scheduled",
    value: String(promotions.filter((p) => p.status === "scheduled").length),
    sub: "Waiting for start time",
  },
  {
    label: "Auto-apply",
    value: String(promotions.filter((p) => p.autoApply && p.status !== "draft").length),
    sub: "No coupon code needed",
  },
  {
    label: "Revenue impact",
    value: formatBdt(promotions.reduce((sum, p) => sum + p.revenue, 0)),
    sub: "Attributed orders (prototype)",
  },
];
