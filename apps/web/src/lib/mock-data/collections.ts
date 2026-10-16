export type CollectionType =
  | "featured"
  | "new_arrivals"
  | "best_sellers"
  | "trending"
  | "custom"
  | "dynamic"
  | "rules";

export type CollectionStatus = "draft" | "active" | "inactive" | "archived";

export type ProductCollection = {
  id: string;
  name: string;
  slug: string;
  type: CollectionType;
  status: CollectionStatus;
  sortOrder: number;
  productCount: number;
  ruleSummary: string;
  heroImageUrl?: string;
  description?: string;
  metaTitle?: string;
  metaDescription?: string;
  scheduleStart?: string;
  scheduleEnd?: string;
  updatedAt: string;
  isSystem?: boolean;
};

export const COLLECTION_TYPE_LABELS: Record<CollectionType, string> = {
  featured: "Featured",
  new_arrivals: "New Arrivals",
  best_sellers: "Best Sellers",
  trending: "Trending",
  custom: "Custom (manual)",
  dynamic: "Dynamic",
  rules: "Rules-based",
};

export const collectionsSeed: ProductCollection[] = [
  {
    id: "col_featured",
    name: "Featured Products",
    slug: "featured",
    type: "featured",
    status: "active",
    sortOrder: 0,
    productCount: 24,
    ruleSummary: "is_featured = true",
    heroImageUrl: "https://picsum.photos/seed/col-featured/120/80",
    description: "Homepage hero and campaign slots.",
    updatedAt: "2026-06-12",
    isSystem: true,
  },
  {
    id: "col_new",
    name: "New Arrivals",
    slug: "new-arrivals",
    type: "new_arrivals",
    status: "active",
    sortOrder: 1,
    productCount: 36,
    ruleSummary: "created_at > NOW() - 30 days",
    heroImageUrl: "https://picsum.photos/seed/col-new/120/80",
    updatedAt: "2026-06-11",
    isSystem: true,
  },
  {
    id: "col_bestsellers",
    name: "Best Sellers",
    slug: "best-sellers",
    type: "best_sellers",
    status: "active",
    sortOrder: 2,
    productCount: 48,
    ruleSummary: "Sales rank from analytics (top 50)",
    heroImageUrl: "https://picsum.photos/seed/col-best/120/80",
    updatedAt: "2026-06-11",
    isSystem: true,
  },
  {
    id: "col_trending",
    name: "Trending Now",
    slug: "trending",
    type: "trending",
    status: "active",
    sortOrder: 3,
    productCount: 20,
    ruleSummary: "View velocity · last 7 days",
    heroImageUrl: "https://picsum.photos/seed/col-trend/120/80",
    updatedAt: "2026-06-10",
    isSystem: true,
  },
  {
    id: "col_summer",
    name: "Summer Sale 2026",
    slug: "summer-sale-2026",
    type: "custom",
    status: "active",
    sortOrder: 4,
    productCount: 18,
    ruleSummary: "Manual product pick list (18 SKUs)",
    heroImageUrl: "https://picsum.photos/seed/col-summer/120/80",
    description: "Seasonal merchandising set for June–August.",
    scheduleStart: "2026-06-01",
    scheduleEnd: "2026-08-31",
    updatedAt: "2026-06-09",
  },
  {
    id: "col_electronics",
    name: "Electronics Under ৳5,000",
    slug: "electronics-under-5k",
    type: "rules",
    status: "active",
    sortOrder: 5,
    productCount: 32,
    ruleSummary: "category = Electronics AND price < 5000",
    heroImageUrl: "https://picsum.photos/seed/col-elec/120/80",
    updatedAt: "2026-06-08",
  },
  {
    id: "col_urban",
    name: "UrbanWear Picks",
    slug: "urbanwear-picks",
    type: "rules",
    status: "active",
    sortOrder: 6,
    productCount: 14,
    ruleSummary: "brand = UrbanWear AND status = published",
    heroImageUrl: "https://picsum.photos/seed/col-urban/120/80",
    updatedAt: "2026-06-07",
  },
  {
    id: "col_gifts",
    name: "Gift Guide",
    slug: "gift-guide",
    type: "custom",
    status: "draft",
    sortOrder: 7,
    productCount: 0,
    ruleSummary: "Manual product pick list (empty)",
    heroImageUrl: "https://picsum.photos/seed/col-gift/120/80",
    updatedAt: "2026-06-06",
  },
  {
    id: "col_clearance",
    name: "Clearance",
    slug: "clearance",
    type: "dynamic",
    status: "inactive",
    sortOrder: 8,
    productCount: 56,
    ruleSummary: "stock < 10 OR compare_at_price > price",
    heroImageUrl: "https://picsum.photos/seed/col-clear/120/80",
    updatedAt: "2026-06-05",
  },
  {
    id: "col_ramadan",
    name: "Ramadan Collection 2025",
    slug: "ramadan-2025",
    type: "custom",
    status: "archived",
    sortOrder: 9,
    productCount: 22,
    ruleSummary: "Manual product pick list (archived)",
    updatedAt: "2025-04-10",
  },
];

export function ensureCollectionSortOrder(items: ProductCollection[]) {
  return [...items]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item, index) => ({ ...item, sortOrder: index }));
}
