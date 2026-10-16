export type SpecialOfferStatus =
  | "draft"
  | "scheduled"
  | "running"
  | "completed"
  | "cancelled";

export type SpecialOfferType = "bogo" | "bundle" | "gift_with_purchase" | "tiered";

export type OfferProductRef = {
  productId: string;
  productName: string;
  sku: string;
  thumbnail: string;
  price: number;
};

export type BogoConfig = {
  buyProduct: OfferProductRef;
  buyQuantity: number;
  getProduct: OfferProductRef;
  getQuantity: number;
  /** 100 = completely free */
  getDiscountPercent: number;
};

export type BundleItem = OfferProductRef & { quantity: number };

export type BundleConfig = {
  items: BundleItem[];
  pricingMode: "fixed" | "percent_off";
  bundlePrice?: number;
  discountPercent?: number;
};

export type GiftConfig = {
  qualifyingProducts: OfferProductRef[];
  minCartAmount?: number;
  giftProduct: OfferProductRef;
  giftQuantity: number;
};

export type TieredTier = { minQuantity: number; discountPercent: number };

export type TieredConfig = {
  targetProduct?: OfferProductRef;
  targetCategory?: string;
  tiers: TieredTier[];
};

export type SpecialOffer = {
  id: string;
  name: string;
  code: string;
  slug: string;
  offerType: SpecialOfferType;
  status: SpecialOfferStatus;
  startsAt: string;
  endsAt: string;
  description?: string;
  showOnPdp: boolean;
  showOnCart: boolean;
  showBadge: boolean;
  stackable: boolean;
  priority: number;
  bogo?: BogoConfig;
  bundle?: BundleConfig;
  gift?: GiftConfig;
  tiered?: TieredConfig;
  ordersCount: number;
  revenue: number;
  updatedAt: string;
};

export const SPECIAL_OFFER_STATUS_LABELS: Record<SpecialOfferStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  running: "Running",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const SPECIAL_OFFER_TYPE_LABELS: Record<SpecialOfferType, string> = {
  bogo: "BOGO",
  bundle: "Bundle",
  gift_with_purchase: "Gift with purchase",
  tiered: "Tiered discount",
};

export const SPECIAL_OFFER_TYPE_DESCRIPTIONS: Record<SpecialOfferType, string> = {
  bogo: "Buy X of product A, get Y of product B free or discounted",
  bundle: "Sell multiple SKUs together at a fixed or discounted bundle price",
  gift_with_purchase: "Free gift when customer buys qualifying products",
  tiered: "Buy more, save more — quantity-based discount tiers",
};

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

export function describeOffer(offer: SpecialOffer): string {
  if (offer.offerType === "bogo" && offer.bogo) {
    const { bogo } = offer;
    const free =
      bogo.getDiscountPercent >= 100
        ? "free"
        : `${bogo.getDiscountPercent}% off`;
    return `Buy ${bogo.buyQuantity}× ${bogo.buyProduct.productName} → get ${bogo.getQuantity}× ${bogo.getProduct.productName} ${free}`;
  }
  if (offer.offerType === "bundle" && offer.bundle) {
    const total = offer.bundle.items.reduce((s, i) => s + i.price * i.quantity, 0);
    if (offer.bundle.pricingMode === "fixed" && offer.bundle.bundlePrice != null) {
      return `${offer.bundle.items.length} items bundle for ${formatBdt(offer.bundle.bundlePrice)} (was ${formatBdt(total)})`;
    }
    return `${offer.bundle.items.length} items — ${offer.bundle.discountPercent ?? 0}% off bundle`;
  }
  if (offer.offerType === "gift_with_purchase" && offer.gift) {
    const min = offer.gift.minCartAmount
      ? ` (min ${formatBdt(offer.gift.minCartAmount)})`
      : "";
    return `Buy qualifying item → free ${offer.gift.giftProduct.productName}${min}`;
  }
  if (offer.offerType === "tiered" && offer.tiered) {
    const target =
      offer.tiered.targetProduct?.productName ?? offer.tiered.targetCategory ?? "items";
    const top = offer.tiered.tiers[offer.tiered.tiers.length - 1];
    return `${target}: buy ${top?.minQuantity}+ → ${top?.discountPercent}% off`;
  }
  return offer.description ?? "Special offer";
}

export function bundleComputedPrice(bundle: BundleConfig): number {
  const sum = bundle.items.reduce((s, i) => s + i.price * i.quantity, 0);
  if (bundle.pricingMode === "fixed" && bundle.bundlePrice != null) {
    return bundle.bundlePrice;
  }
  const pct = bundle.discountPercent ?? 0;
  return Math.round(sum * (1 - pct / 100));
}

export const specialOffersSeed: SpecialOffer[] = [
  {
    id: "so_bogo_tshirt",
    name: "T-Shirt BOGO Weekend",
    code: "BOGO-TSH",
    slug: "tshirt-bogo-weekend",
    offerType: "bogo",
    status: "running",
    startsAt: "2026-06-14T00:00:00",
    endsAt: "2026-06-20T23:59:00",
    description: "Buy one premium tee, get a second free.",
    showOnPdp: true,
    showOnCart: true,
    showBadge: true,
    stackable: false,
    priority: 10,
    bogo: {
      buyProduct: {
        productId: "prod_0001",
        productName: "Premium Cotton T-Shirt",
        sku: "TSH-001",
        thumbnail: "https://picsum.photos/seed/tsh1/80/80",
        price: 899,
      },
      buyQuantity: 1,
      getProduct: {
        productId: "prod_0001",
        productName: "Premium Cotton T-Shirt",
        sku: "TSH-001",
        thumbnail: "https://picsum.photos/seed/tsh1/80/80",
        price: 899,
      },
      getQuantity: 1,
      getDiscountPercent: 100,
    },
    ordersCount: 56,
    revenue: 50344,
    updatedAt: "2026-06-15",
  },
  {
    id: "so_bundle_tech",
    name: "Work From Home Kit",
    code: "WFH-KIT",
    slug: "wfh-tech-bundle",
    offerType: "bundle",
    status: "scheduled",
    startsAt: "2026-06-18T00:00:00",
    endsAt: "2026-07-18T23:59:00",
    description: "Earbuds + USB hub + smart watch at bundle price.",
    showOnPdp: true,
    showOnCart: true,
    showBadge: true,
    stackable: false,
    priority: 5,
    bundle: {
      items: [
        {
          productId: "prod_0002",
          productName: "Wireless Earbuds Pro",
          sku: "EAR-002",
          thumbnail: "https://picsum.photos/seed/ear2/80/80",
          price: 4999,
          quantity: 1,
        },
        {
          productId: "prod_0014",
          productName: "USB-C Hub 7-in-1",
          sku: "USB-014",
          thumbnail: "https://picsum.photos/seed/usb14/80/80",
          price: 3499,
          quantity: 1,
        },
        {
          productId: "prod_0005",
          productName: "Smart Watch Series 5",
          sku: "SW-005",
          thumbnail: "https://picsum.photos/seed/sw5/80/80",
          price: 12999,
          quantity: 1,
        },
      ],
      pricingMode: "fixed",
      bundlePrice: 18999,
    },
    ordersCount: 0,
    revenue: 0,
    updatedAt: "2026-06-15",
  },
  {
    id: "so_gift_laptop",
    name: "Laptop + Free Mouse",
    code: "GIFT-MOUSE",
    slug: "laptop-free-mouse",
    offerType: "gift_with_purchase",
    status: "running",
    startsAt: "2026-06-01T00:00:00",
    endsAt: "2026-06-30T23:59:00",
    description: "Purchase qualifying electronics, receive wireless mouse free.",
    showOnPdp: true,
    showOnCart: true,
    showBadge: true,
    stackable: true,
    priority: 8,
    gift: {
      qualifyingProducts: [
        {
          productId: "prod_0005",
          productName: "Smart Watch Series 5",
          sku: "SW-005",
          thumbnail: "https://picsum.photos/seed/sw5/80/80",
          price: 12999,
        },
        {
          productId: "prod_0014",
          productName: "USB-C Hub 7-in-1",
          sku: "USB-014",
          thumbnail: "https://picsum.photos/seed/usb14/80/80",
          price: 3499,
        },
      ],
      minCartAmount: 5000,
      giftProduct: {
        productId: "prod_0002",
        productName: "Wireless Earbuds Pro",
        sku: "EAR-002",
        thumbnail: "https://picsum.photos/seed/ear2/80/80",
        price: 4999,
      },
      giftQuantity: 1,
    },
    ordersCount: 34,
    revenue: 287660,
    updatedAt: "2026-06-14",
  },
  {
    id: "so_tiered_hoodie",
    name: "Hoodie Bulk Savings",
    code: "HOODIE3",
    slug: "hoodie-tiered",
    offerType: "tiered",
    status: "completed",
    startsAt: "2026-05-01T00:00:00",
    endsAt: "2026-05-31T23:59:00",
    description: "Buy more hoodies, save more.",
    showOnPdp: true,
    showOnCart: false,
    showBadge: true,
    stackable: false,
    priority: 3,
    tiered: {
      targetProduct: {
        productId: "prod_0013",
        productName: "Graphic Hoodie",
        sku: "HDI-013",
        thumbnail: "https://picsum.photos/seed/hdi13/80/80",
        price: 1899,
      },
      tiers: [
        { minQuantity: 2, discountPercent: 10 },
        { minQuantity: 3, discountPercent: 15 },
        { minQuantity: 5, discountPercent: 25 },
      ],
    },
    ordersCount: 89,
    revenue: 156211,
    updatedAt: "2026-06-01",
  },
];

export const specialOfferKpis = (offers: SpecialOffer[]) => [
  {
    label: "Active offers",
    value: String(offers.filter((o) => o.status === "running").length),
    sub: "Applied at cart & PDP",
  },
  {
    label: "Scheduled",
    value: String(offers.filter((o) => o.status === "scheduled").length),
    sub: "Waiting for start date",
  },
  {
    label: "BOGO & bundles",
    value: String(
      offers.filter(
        (o) =>
          (o.status === "running" || o.status === "scheduled") &&
          (o.offerType === "bogo" || o.offerType === "bundle"),
      ).length,
    ),
    sub: "Complex deal types",
  },
  {
    label: "Revenue (active)",
    value: formatBdt(
      offers.filter((o) => o.status === "running").reduce((s, o) => s + o.revenue, 0),
    ),
    sub: "Attributed orders",
  },
];
