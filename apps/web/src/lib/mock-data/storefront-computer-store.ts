import type { Product } from "./products";
import { categoryPath } from "@/lib/url-slug/paths";

type ComputerBlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  author: string;
  date: string;
  readMinutes: number;
  image: string;
  body: string[];
};

type HomeProduct = {
  id: string;
  slug: string;
  name: string;
  price: number;
  compareAtPrice?: number;
  image: string;
  brand: string;
  rating: number;
  reviewCount: number;
  badge?: "new" | "sale" | "bestseller" | "ai-pick";
};

type HomeCategory = {
  id: string;
  slug: string;
  name: string;
  image: string;
  productCount: number;
};

type HomeBrand = { id: string; name: string; slug: string; logo: string };

type HomeReview = {
  id: string;
  author: string;
  rating: number;
  title: string;
  body: string;
  productName: string;
  verified: boolean;
};

export type ComputerHeroSlide = {
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  cta: string;
  href: string;
  image: string;
  theme: "light" | "dark";
};

const UNSPLASH_BASE = "https://images.unsplash.com";

function u(id: string, w = 600, h = 600) {
  return `${UNSPLASH_BASE}/${id}?w=${w}&h=${h}&fit=crop&q=85&auto=format`;
}

const CATEGORY_IMAGES = {
  laptop:     "photo-1496181133206-80ce9b88a853",
  gaming:     "photo-1593305841991-05c297ba4575",
  gpu:        "photo-1591489378430-ef2f4c626b35",
  phone:      "photo-1510557880182-3d4d3cba35a5",
  headphones: "photo-1546435770-a3e426bf472b",
  chip:       "photo-1618384887929-16ec33fab9ef",
  monitor:    "photo-1527443224154-c4a3942d3acf",
  keyboard:   "photo-1587829741301-dc798b83add3",
  mouse:      "photo-1527864550417-7fd91fc51a46",
  ssd:        "photo-1597872200969-2b65d56bd16b",
  ram:        "photo-1551184451-76e7e3d4e7db",
  router:     "photo-1606904825846-647eb07f5be2",
  gamingpc:   "photo-1587202372634-32705e3bf49c",
  macbook:    "photo-1517336714731-489689fd1ca8",
} as const;

export function csUnsplash(key: keyof typeof CATEGORY_IMAGES, w = 600, h = 600) {
  return u(CATEGORY_IMAGES[key], w, h);
}

export function csPlaceholder(label: string, w = 600, h = 600) {
  const text = encodeURIComponent(
    label.replace(/[^\w\s+.-]/g, "").trim().slice(0, 24) || "TechPoint",
  );
  return `https://placehold.co/${w}x${h}/0f172a/e2e8f0/png?text=${text}`;
}

const PRODUCT_IMAGES: Record<string, string> = {
  "asus-tuf-gaming-f15":       u("photo-1603481588273-2f908a9a7a1b"),
  "dell-inspiron-15-3530":     u("photo-1588872657578-7efd1f1555ed"),
  "hp-pavilion-15-eg":         u("photo-1525547719571-a2d4ac8945e2"),
  "lenovo-ideapad-slim-5":     u("photo-1541807084-5c52b6b3adef"),
  "msi-katana-15":             u("photo-1555680202-c86f0e12f086"),
  "asus-rog-strix-g16":        u("photo-1593305841991-05c297ba4575"),
  "acer-aspire-5":             u("photo-1496181133206-80ce9b88a853"),
  "macbook-air-m2":            u("photo-1517336714731-489689fd1ca8"),
  "rtx-4060-ti":               u("photo-1591489378430-ef2f4c626b35"),
  "ryzen-7-7800x3d":           u("photo-1618384887929-16ec33fab9ef"),
  "samsung-980-pro-1tb":       u("photo-1597872200969-2b65d56bd16b"),
  "corsair-vengeance-16gb":    u("photo-1551184451-76e7e3d4e7db"),
  "logitech-g502":             u("photo-1527864550417-7fd91fc51a46"),
  "razer-blackwidow-v3":       u("photo-1587829741301-dc798b83add3"),
  "lg-27up850-4k":             u("photo-1527443224154-c4a3942d3acf"),
  "sony-wh-1000xm5":           u("photo-1546435770-a3e426bf472b"),
  "iphone-15-pro":             u("photo-1510557880182-3d4d3cba35a5"),
  "samsung-galaxy-s24":        u("photo-1574944985070-8f3ebc6b79d2"),
  "asus-zenbook-14-oled":      u("photo-1593642632559-0c6d3fc62b89"),
  "gigabyte-b550-aorus":       u("photo-1518770660439-4636190af475"),
  "cooler-master-hyper-212":   u("photo-1624705002806-5d72df19c3ad"),
  "tp-link-archer-ax55":       u("photo-1606904825846-647eb07f5be2"),
  "jbl-tune-770nc":            u("photo-1505740420928-5e560c06d30e"),
  "custom-gaming-pc-rtx4070":  u("photo-1587202372634-32705e3bf49c"),
};

function categoryImage(name: string, key: keyof typeof CATEGORY_IMAGES, w = 400, h = 400) {
  return u(CATEGORY_IMAGES[key], w, h);
}

function productImage(name: string, category: string, w = 600, h = 600, slug = ""): string {
  if (slug && PRODUCT_IMAGES[slug]) return PRODUCT_IMAGES[slug];
  const cat = category.toLowerCase();
  if (cat.includes("gaming pc"))         return u(CATEGORY_IMAGES.gamingpc, w, h);
  if (cat.includes("gaming laptop"))     return u(CATEGORY_IMAGES.gaming, w, h);
  if (cat.includes("laptop"))            return u(CATEGORY_IMAGES.laptop, w, h);
  if (cat.includes("phone"))             return u(CATEGORY_IMAGES.phone, w, h);
  if (cat.includes("monitor"))           return u(CATEGORY_IMAGES.monitor, w, h);
  if (cat.includes("component"))         return u(CATEGORY_IMAGES.gpu, w, h);
  if (cat.includes("network"))           return u(CATEGORY_IMAGES.router, w, h);
  if (cat.includes("accessor")) {
    const n = name.toLowerCase();
    if (n.includes("mouse"))      return u(CATEGORY_IMAGES.mouse, w, h);
    if (n.includes("keyboard"))   return u(CATEGORY_IMAGES.keyboard, w, h);
    return u(CATEGORY_IMAGES.headphones, w, h);
  }
  if (name.toLowerCase().includes("ryzen") || name.toLowerCase().includes("intel")) {
    return u(CATEGORY_IMAGES.chip, w, h);
  }
  return csPlaceholder(name.split(" ").slice(0, 3).join(" "), w, h);
}

function product(
  id: string,
  slug: string,
  name: string,
  brand: string,
  category: string,
  price: number,
  compareAtPrice?: number,
): Product {
  return {
    id,
    name,
    slug,
    sku: id.toUpperCase().replace("_", "-"),
    price,
    compareAtPrice,
    stock: 18,
    stockStatus: "In Stock",
    status: "published",
    visibility: "public",
    category,
    brand,
    thumbnail: productImage(name, category, 600, 600, slug),
    updatedAt: "2026-06-18T10:00:00+06:00",
    seoTitle: `${name} | Buy Online — TechPoint`,
    description: `${name} — genuine product with official warranty. Available at TechPoint Computer.`,
    shortDescription: `Popular ${category.toLowerCase()} from ${brand}. Fast delivery across Bangladesh.`,
    keyFeatures: ["Official warranty", "Genuine product", "Cash on delivery", "EMI available"],
    tags: ["featured", "computer"],
  };
}

export const computerStoreProducts: Product[] = [
  product("cs_001", "asus-tuf-gaming-f15", "ASUS TUF Gaming F15", "ASUS", "Laptops", 89900, 94900),
  product("cs_002", "dell-inspiron-15-3530", "Dell Inspiron 15 3530", "Dell", "Laptops", 72900, 77900),
  product("cs_003", "hp-pavilion-15-eg", "HP Pavilion 15-eg", "HP", "Laptops", 68900),
  product("cs_004", "lenovo-ideapad-slim-5", "Lenovo IdeaPad Slim 5", "Lenovo", "Laptops", 75900, 79900),
  product("cs_005", "msi-katana-15", "MSI Katana 15 B13", "MSI", "Gaming Laptop", 112900, 119900),
  product("cs_006", "asus-rog-strix-g16", "ASUS ROG Strix G16", "ASUS", "Gaming Laptop", 164900),
  product("cs_007", "acer-aspire-5", "Acer Aspire 5 A515", "Acer", "Laptops", 54900),
  product("cs_008", "macbook-air-m2", "Apple MacBook Air M2", "Apple", "Laptops", 134900, 139900),
  product("cs_009", "rtx-4060-ti", "MSI RTX 4060 Ti 8GB", "MSI", "Components", 42900, 45900),
  product("cs_010", "ryzen-7-7800x3d", "AMD Ryzen 7 7800X3D", "AMD", "Components", 39900),
  product("cs_011", "samsung-980-pro-1tb", "Samsung 980 PRO 1TB NVMe", "Samsung", "Components", 12400, 13900),
  product("cs_012", "corsair-vengeance-16gb", "Corsair Vengeance 16GB DDR5", "Corsair", "Components", 6200),
  product("cs_013", "logitech-g502", "Logitech G502 Hero Mouse", "Logitech", "Accessories", 4500),
  product("cs_014", "razer-blackwidow-v3", "Razer BlackWidow V3", "Razer", "Accessories", 8900, 9900),
  product("cs_015", "lg-27up850-4k", "LG 27UP850 4K Monitor", "LG", "Monitors", 48900),
  product("cs_016", "sony-wh-1000xm5", "Sony WH-1000XM5", "Sony", "Accessories", 28900, 31900),
  product("cs_017", "iphone-15-pro", "Apple iPhone 15 Pro", "Apple", "Phones", 142900),
  product("cs_018", "samsung-galaxy-s24", "Samsung Galaxy S24", "Samsung", "Phones", 89900, 94900),
  product("cs_019", "asus-zenbook-14-oled", "ASUS ZenBook 14 OLED", "ASUS", "Laptops", 118900),
  product("cs_020", "gigabyte-b550-aorus", "Gigabyte B550 AORUS Elite", "Gigabyte", "Components", 14200),
  product("cs_021", "cooler-master-hyper-212", "Cooler Master Hyper 212", "Cooler Master", "Components", 3200),
  product("cs_022", "tp-link-archer-ax55", "TP-Link Archer AX55 Router", "TP-Link", "Networking", 7200),
  product("cs_023", "jbl-tune-770nc", "JBL Tune 770NC", "JBL", "Accessories", 8900),
  product("cs_024", "custom-gaming-pc-rtx4070", "Custom Gaming PC RTX 4070", "TechPoint", "Gaming PC", 189900, 199900),
];

function toHomeProduct(p: Product, i: number, badge?: HomeProduct["badge"]): HomeProduct {
  const badges: HomeProduct["badge"][] = ["bestseller", "sale", "new", undefined];
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    price: p.price,
    compareAtPrice: p.compareAtPrice,
    image: p.thumbnail,
    brand: p.brand,
    rating: 4.2 + (i % 8) * 0.1,
    reviewCount: 24 + (i % 120),
    badge: badge ?? badges[i % badges.length],
  };
}

export const computerHeroSlides: ComputerHeroSlide[] = [
  {
    id: "ch1",
    eyebrow: "🔥 Limited-time offer · Up to 12 months EMI",
    title: "Build your dream gaming PC",
    subtitle: "Custom assembly · Genuine parts · Free stress-test & cable management",
    cta: "Start PC Builder",
    href: "/builder/pc-builder",
    image: u("photo-1542751371-adc38448a05e", 1600, 800),
    theme: "dark",
  },
  {
    id: "ch2",
    eyebrow: "🎓 Laptop Festival · Student discounts available",
    title: "Premium laptops from ৳54,900",
    subtitle: "ASUS · Dell · HP · Lenovo · Apple — official warranty on every device",
    cta: "Shop Laptops",
    href: categoryPath("laptops"),
    image: u("photo-1593642632559-0c6d3fc62b89", 1600, 800),
    theme: "dark",
  },
  {
    id: "ch3",
    eyebrow: "⚡ Weekly restock · RTX 40-series in stock",
    title: "GPUs, SSDs & RAM at best prices",
    subtitle: "NVMe Gen4 · DDR5 kits · Free tech support with every component",
    cta: "Browse Components",
    href: categoryPath("electronics"),
    image: u("photo-1591489378430-ef2f4c626b35", 1600, 800),
    theme: "dark",
  },
];

export const computerCategories: HomeCategory[] = [
  { id: "cc_lap", slug: "laptops", name: "Laptops", image: categoryImage("Laptops", "laptop"), productCount: 86 },
  { id: "cc_game", slug: "gaming-laptop", name: "Gaming Laptops", image: categoryImage("Gaming", "gaming"), productCount: 42 },
  { id: "cc_phone", slug: "phones", name: "Smartphones", image: categoryImage("Phones", "phone"), productCount: 64 },
  { id: "cc_mon", slug: "electronics", name: "Monitors", image: csPlaceholder("4K Monitor", 400, 400), productCount: 38 },
  { id: "cc_comp", slug: "electronics", name: "PC Components", image: categoryImage("Components", "gpu"), productCount: 156 },
  { id: "cc_hp", slug: "hp-laptop", name: "HP Laptops", image: categoryImage("HP", "laptop"), productCount: 24 },
];

export const computerFeaturedProducts = computerStoreProducts.slice(0, 6).map((p, i) => toHomeProduct(p, i));
export const computerBestSellers = computerStoreProducts.slice(6, 12).map((p, i) => toHomeProduct(p, i));
export const computerNewArrivals = computerStoreProducts.slice(12, 18).map((p, i) => toHomeProduct(p, i));
export const computerAiPicks = computerStoreProducts.slice(18, 24).map((p, i) =>
  toHomeProduct(p, i, "ai-pick"),
);

/** Flash-deals strip on homepage — always uses computer catalog with sale pricing */
export function getComputerHomepageDeals(limit = 6): HomeProduct[] {
  return computerStoreProducts.slice(0, limit).map((p, i) => ({
    ...toHomeProduct(p, i, "sale"),
    compareAtPrice: p.compareAtPrice ?? Math.round(p.price * 1.12),
  }));
}

export const computerBrands: HomeBrand[] = [
  { id: "cb1", name: "ASUS", slug: "techpro", logo: "https://placehold.co/120x40/1e293b/ffffff?text=ASUS&font=montserrat" },
  { id: "cb2", name: "Dell", slug: "techpro", logo: "https://placehold.co/120x40/1e293b/ffffff?text=Dell&font=montserrat" },
  { id: "cb3", name: "HP", slug: "techpro", logo: "https://placehold.co/120x40/1e293b/ffffff?text=HP&font=montserrat" },
  { id: "cb4", name: "Lenovo", slug: "techpro", logo: "https://placehold.co/120x40/1e293b/ffffff?text=Lenovo&font=montserrat" },
  { id: "cb5", name: "MSI", slug: "techpro", logo: "https://placehold.co/120x40/1e293b/ffffff?text=MSI&font=montserrat" },
  { id: "cb6", name: "Gigabyte", slug: "techpro", logo: "https://placehold.co/120x40/1e293b/ffffff?text=Gigabyte&font=montserrat" },
];

export const computerReviews: HomeReview[] = [
  {
    id: "cr1",
    author: "Rahim K.",
    rating: 5,
    title: "Perfect gaming laptop",
    body: "MSI Katana delivery was next day. Runs Cyberpunk smoothly. TechPoint assembled and tested before shipping.",
    productName: "MSI Katana 15 B13",
    verified: true,
  },
  {
    id: "cr2",
    author: "Sadia M.",
    rating: 5,
    title: "Genuine SSD, fair price",
    body: "Samsung 980 PRO verified with official warranty card. Better price than other Dhaka shops.",
    productName: "Samsung 980 PRO 1TB NVMe",
    verified: true,
  },
  {
    id: "cr3",
    author: "Tanvir A.",
    rating: 5,
    title: "Custom PC exceeded expectations",
    body: "Built RTX 4070 rig through PC Builder. Cable management was clean and they stress-tested for 2 hours.",
    productName: "Custom Gaming PC RTX 4070",
    verified: true,
  },
];

export const computerBlogPosts: ComputerBlogPost[] = [
  {
    id: "cblog1",
    slug: "rtx-4060-vs-4060-ti-bangladesh",
    title: "RTX 4060 vs 4060 Ti — which GPU for 1080p gaming in BD?",
    excerpt: "Frame rates, power draw, and value comparison for Bangladesh builds in 2026.",
    category: "tech",
    author: "TechPoint Team",
    date: "Jun 12, 2026",
    readMinutes: 6,
    image: csUnsplash("gpu", 800, 500),
    body: [
      "Both cards target 1080p gaming, but the 4060 Ti adds headroom for ray tracing and future titles.",
      "In Bangladesh, power efficiency matters — pair with a quality 550 W PSU from a known brand.",
      "Check TechPoint stock weekly; MSI and Gigabyte models often bundle with game codes.",
    ],
  },
  {
    id: "cblog2",
    slug: "best-laptops-for-students-2026",
    title: "Best laptops for students under ৳80,000",
    excerpt: "Battery life, weight, and performance picks for university and college buyers.",
    category: "guides",
    author: "TechPoint Team",
    date: "Jun 8, 2026",
    readMinutes: 8,
    image: csUnsplash("laptop", 800, 500),
    body: [
      "Prioritize SSD storage and at least 8 GB RAM for everyday classes and browsing.",
      "Battery life above 8 hours helps on campus — ultrabooks beat heavy gaming models here.",
      "TechPoint offers student ID discounts on select ASUS and Lenovo models each semester.",
    ],
  },
  {
    id: "cblog3",
    slug: "pc-builder-guide-first-desktop",
    title: "First gaming PC? Use our step-by-step builder",
    excerpt: "CPU, GPU, PSU, and compatibility tips before you checkout a custom build.",
    category: "guides",
    author: "TechPoint Team",
    date: "Jun 5, 2026",
    readMinutes: 5,
    image: csUnsplash("gaming", 800, 500),
    body: [
      "Start with CPU + GPU budget, then pick a compatible motherboard and PSU wattage.",
      "Our PC Builder checks socket, RAM type, and case clearance before you add to cart.",
      "Optional assembly includes cable management, BIOS update, and a 2-hour stress test.",
    ],
  },
];

export const computerStoreConfig = {
  name: "TechPoint",
  tagline: "Computer, laptop & component store — genuine products, expert support",
  currency: "BDT",
  cartCount: 0,
};
