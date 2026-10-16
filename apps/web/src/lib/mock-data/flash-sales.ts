export type FlashSaleStatus =
  | "draft"
  | "scheduled"
  | "running"
  | "completed"
  | "cancelled";

export type FlashSaleDiscountType = "percent" | "fixed";

export type FlashSaleItem = {
  productId: string;
  productName: string;
  sku: string;
  thumbnail: string;
  originalPrice: number;
  discountType: FlashSaleDiscountType;
  discountValue: number;
  salePrice: number;
};

export type FlashSale = {
  id: string;
  name: string;
  slug: string;
  status: FlashSaleStatus;
  startsAt: string;
  endsAt: string;
  description?: string;
  showOnHomepage: boolean;
  showOnDealsPage: boolean;
  items: FlashSaleItem[];
  ordersCount: number;
  revenue: number;
  updatedAt: string;
};

export const FLASH_SALE_STATUS_LABELS: Record<FlashSaleStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  running: "Running",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function computeSalePrice(
  originalPrice: number,
  discountType: FlashSaleDiscountType,
  discountValue: number,
) {
  if (discountType === "percent") {
    return Math.max(0, Math.round(originalPrice * (1 - discountValue / 100)));
  }
  return Math.max(0, Math.round(discountValue));
}

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

export const flashSalesSeed: FlashSale[] = [
  {
    id: "fs_eid_laptops",
    name: "Eid Laptop Flash",
    slug: "eid-laptop-flash",
    status: "scheduled",
    startsAt: "2026-06-20T00:00:00",
    endsAt: "2026-06-25T23:59:00",
    description: "Limited-time laptop discounts for Eid week.",
    showOnHomepage: true,
    showOnDealsPage: true,
    items: [
      {
        productId: "prod_0005",
        productName: "Smart Watch Series 5",
        sku: "SW-005",
        thumbnail: "https://picsum.photos/seed/sw5/80/80",
        originalPrice: 12999,
        discountType: "percent",
        discountValue: 20,
        salePrice: 10399,
      },
      {
        productId: "prod_0014",
        productName: "USB-C Hub 7-in-1",
        sku: "USB-014",
        thumbnail: "https://picsum.photos/seed/usb14/80/80",
        originalPrice: 3499,
        discountType: "fixed",
        discountValue: 2799,
        salePrice: 2799,
      },
    ],
    ordersCount: 0,
    revenue: 0,
    updatedAt: "2026-06-15",
  },
  {
    id: "fs_weekend_fashion",
    name: "Weekend Fashion Drop",
    slug: "weekend-fashion",
    status: "running",
    startsAt: "2026-06-14T00:00:00",
    endsAt: "2026-06-16T23:59:00",
    description: "Apparel and accessories — up to 30% off.",
    showOnHomepage: true,
    showOnDealsPage: true,
    items: [
      {
        productId: "prod_0001",
        productName: "Premium Cotton T-Shirt",
        sku: "TSH-001",
        thumbnail: "https://picsum.photos/seed/tsh1/80/80",
        originalPrice: 899,
        discountType: "percent",
        discountValue: 15,
        salePrice: 764,
      },
      {
        productId: "prod_0006",
        productName: "Linen Summer Dress",
        sku: "DRS-006",
        thumbnail: "https://picsum.photos/seed/drs6/80/80",
        originalPrice: 2499,
        discountType: "percent",
        discountValue: 25,
        salePrice: 1874,
      },
      {
        productId: "prod_0013",
        productName: "Graphic Hoodie",
        sku: "HDI-013",
        thumbnail: "https://picsum.photos/seed/hdi13/80/80",
        originalPrice: 1899,
        discountType: "percent",
        discountValue: 20,
        salePrice: 1519,
      },
    ],
    ordersCount: 84,
    revenue: 142800,
    updatedAt: "2026-06-15",
  },
  {
    id: "fs_flash_friday",
    name: "Flash Friday — Single SKU",
    slug: "flash-friday-earbuds",
    status: "completed",
    startsAt: "2026-06-07T18:00:00",
    endsAt: "2026-06-07T23:59:00",
    description: "One hero product, 24-hour window.",
    showOnHomepage: false,
    showOnDealsPage: true,
    items: [
      {
        productId: "prod_0002",
        productName: "Wireless Earbuds Pro",
        sku: "EAR-002",
        thumbnail: "https://picsum.photos/seed/ear2/80/80",
        originalPrice: 4999,
        discountType: "percent",
        discountValue: 35,
        salePrice: 3249,
      },
    ],
    ordersCount: 126,
    revenue: 409374,
    updatedAt: "2026-06-08",
  },
];

export const flashSaleKpis = (sales: FlashSale[]) => [
  {
    label: "Running now",
    value: String(sales.filter((s) => s.status === "running").length),
    sub: "Live on storefront",
  },
  {
    label: "Scheduled",
    value: String(sales.filter((s) => s.status === "scheduled").length),
    sub: "Waiting for start time",
  },
  {
    label: "Products on offer",
    value: String(
      sales
        .filter((s) => s.status === "running" || s.status === "scheduled")
        .reduce((sum, s) => sum + s.items.length, 0),
    ),
    sub: "Across active sales",
  },
  {
    label: "Revenue (running)",
    value: formatBdt(
      sales.filter((s) => s.status === "running").reduce((sum, s) => sum + s.revenue, 0),
    ),
    sub: "This window only",
  },
];
