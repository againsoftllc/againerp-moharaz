import { categoriesFlat } from "./categories";
import { computerStoreProducts } from "./storefront-computer-store";
import { productPath } from "@/lib/url-slug/paths";

/** published = live on the website · unlisted = parked off the Products list (Website → Unlisted) · draft = work left · archived = disabled */
export type ProductStatus = "draft" | "published" | "unlisted" | "archived";

export type ProductVisibility = "public" | "private" | "password";

export type StockStatusLabel = "In Stock" | "Low Stock" | "Out of Stock" | "Pre-order" | "Coming Soon";

export type Product = {
  id: string;
  itemId?: string | null;
  name: string;
  slug: string;
  sku: string;
  /** where the product was copied from (a competitor page); Product Draft's AI column reads it */
  sourceUrl?: string | null;
  /** The product's specification profile (the list shows its name) */
  attributeProfileId?: string | null;
  model?: string;
  /** Internal staff note about the product — not shown on the storefront. */
  remarks?: string | null;
  price: number;
  compareAtPrice?: number;
  /** Cost the product was bought at — captured at intake from Inventory */
  purchasePrice?: number;
  lastSellingPrice?: number;
  offerPrice?: number;
  stock: number;
  trackQuantity?: boolean;
  stockStatus: StockStatusLabel;
  status: ProductStatus;
  /** Storefront visibility — public products can appear on website when published */
  visibility?: ProductVisibility;
  category: string;
  /** All assigned category ids (multi); primary is also reflected in `category` / first id */
  categoryIds?: string[];
  brand: string;
  thumbnail: string;
  updatedAt: string;
  /** Who made the last change (the signed-in user's name at the time) */
  updatedBy?: string;
  seoTitle: string;
  description?: string;
  shortDescription?: string;
  keyFeatures?: string[];
  tags: string[];
  warranty?: string | null;
  origin?: string | null;
  productType?: "simple" | "variable" | "digital" | "combo";
  alertQuantity?: number;
  unitType?: string;
  barcode?: string | null;
  barcodeType?: string;
  notForSelling?: boolean;
  weight?: string | null;
  taxRate?: number | null;
  taxType?: string;
  locationIds?: string[];
};

const productShortDescriptions: Record<string, string> = {
  "Premium Cotton T-Shirt": "Breathable premium cotton tee with a relaxed fit — ideal for daily wear and layering.",
  "Wireless Earbuds Pro": "True wireless earbuds with hybrid ANC, low-latency mode, and all-day battery with charging case.",
  "Ceramic Coffee Mug Set": "Set of handcrafted ceramic mugs — microwave-safe glaze, comfortable handle, gift-ready packaging.",
  "Running Shoes Ultra": "Lightweight performance runners with responsive cushioning and breathable mesh upper.",
  "Smart Watch Series 5": "Health-tracking smartwatch with AMOLED display, GPS, and 7-day battery in smart mode.",
  "Linen Summer Dress": "Airy linen blend dress with a flattering cut — perfect for warm weather and casual outings.",
  "Bluetooth Speaker Mini": "Pocket-sized speaker with rich 360° sound, IPX5 splash resistance, and 12-hour playtime.",
  "Organic Face Serum": "Vitamin-rich serum for brighter, hydrated skin — dermatologist-tested, paraben-free formula.",
  "Yoga Mat Pro": "Extra-grip 6 mm mat with alignment lines — eco TPE material, includes carry strap.",
  "LED Desk Lamp": "Adjustable LED desk lamp with warm/cool modes, USB charging port, and flicker-free light.",
  "Leather Wallet": "Slim genuine-leather bifold with RFID blocking and 6 card slots plus bill compartment.",
  "Stainless Water Bottle": "Double-wall insulated bottle — keeps drinks cold 24 h / hot 12 h, BPA-free.",
  "Graphic Hoodie": "Soft fleece hoodie with premium screen print — kangaroo pocket, ribbed cuffs and hem.",
  "USB-C Hub 7-in-1": "7-port USB-C hub with 4K HDMI, SD slots, and 100 W pass-through charging for laptops.",
  "Scented Candle Pack": "Set of three soy candles in seasonal scents — 45-hour burn, cotton wicks, reusable jars.",
};

const productKeyFeatures: Record<string, string[]> = {
  "Premium Cotton T-Shirt": ["100% combed cotton", "Pre-shrunk fabric", "Reinforced neckline", "Machine washable"],
  "Wireless Earbuds Pro": ["Hybrid ANC", "Bluetooth 5.3", "32 h total battery", "IPX5 water resistant", "Low-latency gaming mode"],
  "Ceramic Coffee Mug Set": ["Set of 4 mugs", "350 ml capacity", "Microwave & dishwasher safe", "Lead-free glaze"],
  "Running Shoes Ultra": ["Responsive foam midsole", "Breathable mesh upper", "Anti-slip rubber outsole", "Reflective accents"],
  "Smart Watch Series 5": ["1.4″ AMOLED display", "Heart rate & SpO₂", "Built-in GPS", "7-day battery", "50 m water resistant"],
  "Bluetooth Speaker Mini": ["360° stereo sound", "IPX5 splash proof", "12 h playback", "Pair two for stereo"],
  "USB-C Hub 7-in-1": ["4K @ 60 Hz HDMI", "100 W PD pass-through", "SD + microSD readers", "3× USB 3.0 ports"],
  "Organic Face Serum": ["10% vitamin C complex", "Hyaluronic acid", "Paraben-free", "Suitable for all skin types"],
  "LED Desk Lamp": ["5 brightness levels", "Warm & cool colour temps", "USB-A charging port", "Memory function"],
  "Stainless Water Bottle": ["24 h cold / 12 h hot", "18/8 stainless steel", "Leak-proof lid", "750 ml capacity"],
};

function baseProductName(name: string) {
  return name.replace(/\s+v\d+$/i, "").trim();
}

function resolveShortDescription(name: string, index: number) {
  const base = baseProductName(name);
  return (
    productShortDescriptions[base] ??
    `Quality ${base.toLowerCase()} from our ${index % 2 === 0 ? "bestselling" : "curated"} catalog range.`
  );
}

function resolveKeyFeatures(name: string) {
  const base = baseProductName(name);
  return (
    productKeyFeatures[base] ?? [
      "Premium materials",
      "Quality assured",
      "Fast dispatch ready",
      "1-year warranty",
    ]
  );
}

const activeCategories = categoriesFlat.filter((c) => c.active);
const inactiveCategories = categoriesFlat.filter((c) => !c.active);
const brands = ["UrbanWear", "TechPro", "HomeNest", "GlowUp", "ActiveLife", "ReadWell"];
const statuses: ProductStatus[] = ["published", "published", "published", "draft", "archived"];

const names = [
  "Premium Cotton T-Shirt",
  "Wireless Earbuds Pro",
  "Ceramic Coffee Mug Set",
  "Running Shoes Ultra",
  "Smart Watch Series 5",
  "Linen Summer Dress",
  "Bluetooth Speaker Mini",
  "Organic Face Serum",
  "Yoga Mat Pro",
  "LED Desk Lamp",
  "Leather Wallet",
  "Stainless Water Bottle",
  "Graphic Hoodie",
  "USB-C Hub 7-in-1",
  "Scented Candle Pack",
];

function pad(n: number, len = 4) {
  return String(n).padStart(len, "0");
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveStockStatus(stock: number, index: number): StockStatusLabel {
  if (index % 17 === 0) return "Pre-order";
  if (stock === 0) return "Out of Stock";
  if (stock <= 20) return "Low Stock";
  return "In Stock";
}

export const products: Product[] = Array.from({ length: 120 }, (_, i) => {
  const base = names[i % names.length];
  const variant = Math.floor(i / names.length) + 1;
  const status = statuses[i % statuses.length];
  const price = 299 + (i % 50) * 47;
  const stock = status === "archived" ? 0 : (i * 7) % 200;
  const day = (i % 28) + 1;
  const name = variant > 1 ? `${base} v${variant}` : base;
  const stockStatus = resolveStockStatus(stock, i);
  const categoryPool =
    i % 13 === 0 && inactiveCategories.length > 0
      ? inactiveCategories
      : activeCategories;
  const visibility: ProductVisibility =
    status === "published" && i % 11 === 0 ? "private" : "public";
  return {
    id: `prod_${pad(i + 1)}`,
    name,
    slug: `${slugify(name)}-${pad(i + 1)}`,
    sku: `SKU-${pad(i + 1)}`,
    price,
    compareAtPrice: i % 3 === 0 ? price + 200 : undefined,
    offerPrice: i % 4 === 0 ? Math.max(price - 50, 99) : undefined,
    stock,
    stockStatus,
    status,
    visibility,
    category: categoryPool[i % categoryPool.length].name,
    brand: brands[i % brands.length],
    thumbnail: `https://picsum.photos/seed/${i + 1}/80/80`,
    updatedAt: `2026-06-${pad(day, 2)}T10:00:00+06:00`,
    seoTitle: `${name} | Buy Online — AgainERP`,
    tags: ["featured", "bestseller"].slice(0, i % 2 === 0 ? 2 : 1),
    description: `High-quality ${base.toLowerCase()} for everyday use. Prototype dummy data.`,
    shortDescription: resolveShortDescription(name, i),
    keyFeatures: resolveKeyFeatures(name),
  };
});

/** Admin catalog — seeded products + computer-store tech SKUs (storefront-aligned). */
export function getAdminCatalogProducts(): Product[] {
  const bySlug = new Map<string, Product>();
  for (const p of products) bySlug.set(p.slug, p);
  for (const p of computerStoreProducts) {
    if (!bySlug.has(p.slug)) bySlug.set(p.slug, p);
  }
  return [...bySlug.values()];
}

export function getAdminCatalogBrands(): string[] {
  return [...new Set(getAdminCatalogProducts().map((p) => p.brand))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export type QuickAddProductInput = {
  name: string;
  sku?: string;
  price: number;
  category?: string;
  brand?: string;
  stock?: number;
  status?: ProductStatus;
};

export function buildProductFromQuickAdd(input: QuickAddProductInput): Product {
  const stamp = Date.now();
  const id = `prod_${stamp}`;
  const sku = input.sku?.trim() || `SKU-${String(stamp).slice(-6)}`;
  const name = input.name.trim();
  const price = input.price;
  const stock = input.stock ?? 0;

  return {
    id,
    name,
    slug: slugify(name),
    sku,
    price,
    stock,
    stockStatus: stock === 0 ? "Out of Stock" : stock <= 20 ? "Low Stock" : "In Stock",
    status: input.status ?? "published",
    visibility: "public",
    category: input.category?.trim() || "Apparel",
    brand: input.brand?.trim() || "UrbanWear",
    thumbnail: `https://picsum.photos/seed/${id}/80/80`,
    updatedAt: new Date().toISOString(),
    seoTitle: `${name} | Buy Online — AgainERP`,
    tags: [],
    description: `Quick-added product: ${name}`,
    shortDescription: `New listing: ${name}. Add full description in the editor.`,
    keyFeatures: ["New arrival", "Quality checked", "Ready to publish"],
  };
}

export function getProductById(id: string) {
  return getAdminCatalogProducts().find((p) => p.id === id);
}

export function getProductBySlug(slug: string) {
  const normalized = slug.toLowerCase();
  const match = (p: { slug: string; sku: string; id: string }) =>
    p.slug.toLowerCase() === normalized ||
    p.sku.toLowerCase() === normalized ||
    p.id === slug;

  return getAdminCatalogProducts().find(match);
}

export function getProductStorefrontPath(product: Product) {
  return productPath(product.slug);
}

export function getRelatedProducts(productId: string, limit = 4) {
  const product = getProductById(productId);
  if (!product) return [];
  return products
    .filter((p) => p.id !== productId && p.status === "published" && p.category === product.category)
    .slice(0, limit);
}

export type ProductMediaType = "image" | "video";

export type ProductMedia = {
  id: string;
  type: ProductMediaType;
  url: string;
  poster?: string;
  title?: string;
  duration?: string;
  isPrimary?: boolean;
};

export type ProductVariant = {
  id: string;
  label: string;
  color: string;
  storage?: string;
  ram?: string;
  price: number;
  stock: number;
  sku: string;
  gallery: string[];
};

const SAMPLE_VIDEOS = {
  showcase:
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  unboxing:
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
  features:
    "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
} as const;

/** Rich mixed media for prod_0002 — Wireless Earbuds Pro */
const PROD_0002_MEDIA: Record<string, ProductMedia[]> = {
  v1: [
    {
      id: "p2_v1_vid1",
      type: "video",
      url: SAMPLE_VIDEOS.showcase,
      poster: "https://picsum.photos/seed/prod_0002_vid1/800/800",
      title: "360° product showcase",
      duration: "0:15",
      isPrimary: true,
    },
    {
      id: "p2_v1_img1",
      type: "image",
      url: "https://picsum.photos/seed/prod_0002_blk1/800/800",
      title: "Black — front view",
    },
    {
      id: "p2_v1_img2",
      type: "image",
      url: "https://picsum.photos/seed/prod_0002_blk2/800/800",
      title: "Black — case open",
    },
    {
      id: "p2_v1_vid2",
      type: "video",
      url: SAMPLE_VIDEOS.unboxing,
      poster: "https://picsum.photos/seed/prod_0002_vid2/800/800",
      title: "Unboxing & first impressions",
      duration: "0:15",
    },
    {
      id: "p2_v1_img3",
      type: "image",
      url: "https://picsum.photos/seed/prod_0002_blk3/800/800",
      title: "Lifestyle shot",
    },
  ],
  v2: [
    {
      id: "p2_v2_vid1",
      type: "video",
      url: SAMPLE_VIDEOS.features,
      poster: "https://picsum.photos/seed/prod_0002_slv_vid/800/800",
      title: "Active noise cancellation demo",
      duration: "0:05",
      isPrimary: true,
    },
    {
      id: "p2_v2_img1",
      type: "image",
      url: "https://picsum.photos/seed/prod_0002_slv1/800/800",
      title: "Silver — front view",
    },
    {
      id: "p2_v2_img2",
      type: "image",
      url: "https://picsum.photos/seed/prod_0002_slv2/800/800",
      title: "Silver — charging case",
    },
  ],
  v3: [
    {
      id: "p2_v3_img1",
      type: "image",
      url: "https://picsum.photos/seed/prod_0002_blu1/800/800",
      title: "Blue — front view",
      isPrimary: true,
    },
    {
      id: "p2_v3_vid1",
      type: "video",
      url: SAMPLE_VIDEOS.showcase,
      poster: "https://picsum.photos/seed/prod_0002_blu_vid/800/800",
      title: "Water resistance test",
      duration: "0:15",
    },
  ],
};

const PRODUCT_VARIANT_MEDIA: Record<string, Record<string, ProductMedia[]>> = {
  prod_0002: PROD_0002_MEDIA,
};

export const demoVariants: ProductVariant[] = [
  {
    id: "v1",
    label: "Black / 128GB / 8GB",
    color: "Black",
    storage: "128GB",
    ram: "8GB",
    price: 45999,
    stock: 42,
    sku: "PHN-BLK-128-8",
    gallery: [
      "https://picsum.photos/seed/v1a/600/600",
      "https://picsum.photos/seed/v1b/600/600",
      "https://picsum.photos/seed/v1c/600/600",
    ],
  },
  {
    id: "v2",
    label: "Silver / 256GB / 12GB",
    color: "Silver",
    storage: "256GB",
    ram: "12GB",
    price: 52999,
    stock: 18,
    sku: "PHN-SLV-256-12",
    gallery: [
      "https://picsum.photos/seed/v2a/600/600",
      "https://picsum.photos/seed/v2b/600/600",
    ],
  },
  {
    id: "v3",
    label: "Blue / 128GB / 8GB",
    color: "Blue",
    storage: "128GB",
    ram: "8GB",
    price: 45999,
    stock: 0,
    sku: "PHN-BLU-128-8",
    gallery: ["https://picsum.photos/seed/v3a/600/600"],
  },
];

export function getVariantMedia(productId: string, variantId: string): ProductMedia[] {
  const productMedia = PRODUCT_VARIANT_MEDIA[productId];
  if (productMedia?.[variantId]?.length) return productMedia[variantId];

  const variant = demoVariants.find((v) => v.id === variantId);
  if (!variant) return [];

  return variant.gallery.map((url, i) => ({
    id: `${variantId}_img_${i}`,
    type: "image" as const,
    url,
    title: `Image ${i + 1}`,
    isPrimary: i === 0,
  }));
}

export type ProductMediaWithVariant = ProductMedia & { variantId: string };

export function getAllVariantMedia(productId: string): ProductMediaWithVariant[] {
  const items: ProductMediaWithVariant[] = [];
  for (const variant of demoVariants) {
    for (const media of getVariantMedia(productId, variant.id)) {
      items.push({ ...media, variantId: variant.id });
    }
  }
  return items;
}

export function getVariantFirstMediaIndex(media: ProductMediaWithVariant[]): Record<string, number> {
  const map: Record<string, number> = {};
  media.forEach((item, index) => {
    if (map[item.variantId] === undefined) map[item.variantId] = index;
  });
  return map;
}

export type VariantSpecGroup = {
  variantId: string;
  title: string;
  specs: { label: string; value: string }[];
};

export function getDrawerVariantSpecGroups(product: Product): VariantSpecGroup[] {
  return demoVariants
    .filter((v) => v.id === "v1" || v.id === "v2")
    .map((variant) => ({
      variantId: variant.id,
      title: `${variant.color} / ${variant.storage}`,
      specs:
        product.id === "prod_0002" && variant.id === "v1"
          ? [
              { label: "Color", value: variant.color },
              { label: "Storage", value: variant.storage ?? "—" },
              { label: "RAM", value: variant.ram ?? "—" },
              { label: "SKU", value: variant.sku },
              { label: "Driver", value: "10mm dynamic" },
              { label: "ANC", value: "Hybrid active noise cancellation" },
              { label: "Battery (buds)", value: "Up to 8 hours" },
              { label: "Battery (case)", value: "32 hours total" },
            ]
          : product.id === "prod_0002" && variant.id === "v2"
            ? [
                { label: "Color", value: variant.color },
                { label: "Storage", value: variant.storage ?? "—" },
                { label: "RAM", value: variant.ram ?? "—" },
                { label: "SKU", value: variant.sku },
                { label: "Bluetooth", value: "5.3" },
                { label: "Range", value: "10 m" },
                { label: "Water resistance", value: "IPX5" },
                { label: "Battery (buds)", value: "Up to 10 hours" },
              ]
            : [
                { label: "Color", value: variant.color },
                { label: "Storage", value: variant.storage ?? "—" },
                { label: "RAM", value: variant.ram ?? "—" },
                { label: "SKU", value: variant.sku },
                { label: "Brand", value: product.brand },
                { label: "Category", value: product.category },
              ],
    }));
}
