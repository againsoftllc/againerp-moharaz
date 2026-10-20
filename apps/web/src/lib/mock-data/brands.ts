export type BrandStatus = "draft" | "published" | "unlisted" | "archived";

export function brandStatusOf(b: { status?: BrandStatus; active: boolean }): BrandStatus {
  return b.status ?? (b.active ? "published" : "unlisted");
}

export type Brand = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  productCount: number;
  active: boolean;
  updatedAt: string;
  /** same words as a product: published = live · unlisted = parked · draft = work left · archived = disabled */
  status?: BrandStatus;
  /** who last changed it (shown in the Updated By column) */
  updatedBy?: string;
  /** Catalog vs Dropshipping (frontstore) — mirrors product channel */
  channel?: "catalog" | "dropshipping";
  description?: string;
  websiteUrl?: string;
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
  logoUrl?: string;
  bannerUrl?: string;
  logoMediaId?: string;
  bannerMediaId?: string;
};

const seed: Brand[] = [
  {
    id: "brand_urbanwear",
    name: "UrbanWear",
    slug: "urbanwear",
    sortOrder: 0,
    productCount: 42,
    active: true,
    updatedAt: "2026-06-10",
    description: "<p>Premium urban fashion and everyday apparel.</p>",
    websiteUrl: "https://urbanwear.example.com",
    metaTitle: "UrbanWear — Shop Fashion Online",
    metaDescription: "Discover UrbanWear's latest collection.",
    metaKeywords: "fashion, apparel, urbanwear",
    logoUrl: "https://picsum.photos/seed/brand-urban/64/64",
    bannerUrl: "https://picsum.photos/seed/banner-urban/800/200",
  },
  {
    id: "brand_techpro",
    name: "TechPro",
    slug: "techpro",
    sortOrder: 1,
    productCount: 38,
    active: true,
    updatedAt: "2026-06-09",
    description: "<p>Electronics and gadgets for modern life.</p>",
    websiteUrl: "https://techpro.example.com",
    logoUrl: "https://picsum.photos/seed/brand-tech/64/64",
  },
  {
    id: "brand_homenest",
    name: "HomeNest",
    slug: "homenest",
    sortOrder: 2,
    productCount: 24,
    active: true,
    updatedAt: "2026-06-08",
    description: "<p>Home and living essentials.</p>",
    logoUrl: "https://picsum.photos/seed/brand-home/64/64",
  },
  {
    id: "brand_glowup",
    name: "GlowUp",
    slug: "glowup",
    sortOrder: 3,
    productCount: 19,
    active: true,
    updatedAt: "2026-06-07",
    description: "<p>Beauty and personal care products.</p>",
    logoUrl: "https://picsum.photos/seed/brand-glow/64/64",
  },
  {
    id: "brand_activelife",
    name: "ActiveLife",
    slug: "activelife",
    sortOrder: 4,
    productCount: 31,
    active: true,
    updatedAt: "2026-06-06",
    description: "<p>Sports and active lifestyle gear.</p>",
    logoUrl: "https://picsum.photos/seed/brand-active/64/64",
  },
  {
    id: "brand_readwell",
    name: "ReadWell",
    slug: "readwell",
    sortOrder: 5,
    productCount: 15,
    active: false,
    updatedAt: "2026-06-05",
    description: "<p>Books and stationery.</p>",
    logoUrl: "https://picsum.photos/seed/brand-read/64/64",
  },
  {
    id: "brand_naturepure",
    name: "NaturePure",
    slug: "naturepure",
    sortOrder: 6,
    productCount: 12,
    active: true,
    updatedAt: "2026-06-04",
    description: "<p>Organic and natural products.</p>",
    logoUrl: "https://picsum.photos/seed/brand-nature/64/64",
  },
  {
    id: "brand_kidjoy",
    name: "KidJoy",
    slug: "kidjoy",
    sortOrder: 7,
    productCount: 8,
    active: true,
    updatedAt: "2026-06-03",
    logoUrl: "https://picsum.photos/seed/brand-kid/64/64",
  },
];

export function ensureBrandSortOrder(items: Brand[]): Brand[] {
  return [...items]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((b, i) => ({ ...b, sortOrder: i }));
}

export const brandsSeed = ensureBrandSortOrder(seed);

export function getBrandById(id: string) {
  return brandsSeed.find((b) => b.id === id);
}

export function getBrandBySlug(slug: string) {
  return brandsSeed.find((b) => b.slug === slug.toLowerCase());
}
