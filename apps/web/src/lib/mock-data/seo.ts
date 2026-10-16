export type SeoIssueSeverity = "high" | "medium" | "low";

export type SeoEntityType = "product" | "category" | "brand" | "page";

export const SEO_TABS = [
  "dashboard",
  "meta",
  "redirects",
  "audit",
  "sitemap",
  "keywords",
] as const;

export type SeoTab = (typeof SEO_TABS)[number];

export const SEO_TAB_LABELS: Record<SeoTab, string> = {
  dashboard: "Dashboard",
  meta: "Meta Manager",
  redirects: "Redirects",
  audit: "SEO Audit",
  sitemap: "Sitemap",
  keywords: "Keywords",
};

export const seoHealthScore = 78;

export const seoKpis = [
  { label: "Indexed URLs", value: "4,286", sub: "+42 this week" },
  { label: "Open issues", value: 47, sub: "12 high severity", alert: true },
  { label: "Active redirects", value: 128, sub: "3 chains detected" },
  { label: "Tracked keywords", value: 36, sub: "Avg position 14.2" },
];

export const issueBreakdown = [
  { type: "Missing meta title", count: 12, severity: "high" as SeoIssueSeverity },
  { type: "Missing meta description", count: 18, severity: "medium" as SeoIssueSeverity },
  { type: "Duplicate title", count: 5, severity: "high" as SeoIssueSeverity },
  { type: "Missing alt text", count: 8, severity: "medium" as SeoIssueSeverity },
  { type: "Missing schema", count: 4, severity: "low" as SeoIssueSeverity },
];

export const organicTrafficChart = [
  { week: "W1", clicks: 4200, impressions: 68000 },
  { week: "W2", clicks: 4500, impressions: 71000 },
  { week: "W3", clicks: 4100, impressions: 69500 },
  { week: "W4", clicks: 4800, impressions: 74000 },
];

export type SchemaType = "WebPage" | "Article" | "Product" | "Category" | "LocalBusiness" | "BreadcrumbList";

export type SeoMetaRecord = {
  id: string;
  entityType: SeoEntityType;
  title: string;
  url: string;
  metaTitle: string;
  metaDescription: string;
  ogImage: string;
  canonicalUrl: string;
  indexable: boolean;
  schemaType: SchemaType;
  score: number;
  issues: string[];
};

export const SCHEMA_TYPES: SchemaType[] = ["WebPage", "Article", "Product", "Category", "LocalBusiness", "BreadcrumbList"];

export const metaRecordsSeed: SeoMetaRecord[] = [
  {
    id: "meta_001",
    entityType: "product",
    title: "Wireless Earbuds Pro",
    url: "/electronics/wireless-earbuds-pro",
    metaTitle: "Wireless Earbuds Pro — UrbanWear",
    metaDescription: "Premium wireless earbuds with ANC and 32-hour battery life. Shop now with free delivery.",
    ogImage: "https://picsum.photos/seed/earbuds/1200/630",
    canonicalUrl: "",
    indexable: true,
    schemaType: "Product",
    score: 92,
    issues: [],
  },
  {
    id: "meta_002",
    entityType: "product",
    title: "Smart Watch Series 5",
    url: "/electronics/smart-watch-series-5",
    metaTitle: "",
    metaDescription: "Smart watch with health tracking.",
    ogImage: "",
    canonicalUrl: "",
    indexable: true,
    schemaType: "Product",
    score: 48,
    issues: ["Missing meta title", "Description too short", "Missing OG image"],
  },
  {
    id: "meta_003",
    entityType: "category",
    title: "Electronics",
    url: "/electronics",
    metaTitle: "Electronics — Shop Online | UrbanWear",
    metaDescription: "",
    ogImage: "https://picsum.photos/seed/electronics/1200/630",
    canonicalUrl: "",
    indexable: true,
    schemaType: "Category",
    score: 62,
    issues: ["Missing meta description"],
  },
  {
    id: "meta_004",
    entityType: "product",
    title: "Premium Cotton T-Shirt",
    url: "/apparel/premium-cotton-t-shirt",
    metaTitle: "Premium Cotton T-Shirt | UrbanWear",
    metaDescription: "Premium Cotton T-Shirt | UrbanWear",
    ogImage: "",
    canonicalUrl: "",
    indexable: true,
    schemaType: "Product",
    score: 55,
    issues: ["Duplicate description pattern", "Missing OG image"],
  },
  {
    id: "meta_005",
    entityType: "brand",
    title: "UrbanWear",
    url: "/brands/urbanwear",
    metaTitle: "UrbanWear — Shop Fashion Online",
    metaDescription: "Discover UrbanWear's latest collection of premium apparel and accessories.",
    ogImage: "https://picsum.photos/seed/urbanwear/1200/630",
    canonicalUrl: "",
    indexable: true,
    schemaType: "WebPage",
    score: 88,
    issues: [],
  },
  {
    id: "meta_006",
    entityType: "page",
    title: "About Us",
    url: "/about",
    metaTitle: "About UrbanWear",
    metaDescription: "Learn about our story and mission.",
    ogImage: "",
    canonicalUrl: "",
    indexable: true,
    schemaType: "WebPage",
    score: 40,
    issues: ["Description too short", "Missing OG image"],
  },
  {
    id: "meta_007",
    entityType: "product",
    title: "Running Shoes Ultra",
    url: "/footwear/running-shoes-ultra",
    metaTitle: "Running Shoes Ultra — High Performance | UrbanWear",
    metaDescription: "Lightweight running shoes with responsive cushioning for everyday training.",
    ogImage: "https://picsum.photos/seed/shoes/1200/630",
    canonicalUrl: "",
    indexable: true,
    schemaType: "Product",
    score: 95,
    issues: [],
  },
  {
    id: "meta_008",
    entityType: "category",
    title: "Apparel",
    url: "/apparel",
    metaTitle: "",
    metaDescription: "",
    ogImage: "",
    canonicalUrl: "",
    indexable: false,
    schemaType: "Category",
    score: 12,
    issues: ["Missing meta title", "Missing meta description", "Missing OG image", "No-index set"],
  },
  {
    id: "meta_009",
    entityType: "page",
    title: "Contact",
    url: "/contact",
    metaTitle: "Contact UrbanWear — Get in Touch",
    metaDescription: "Reach our support team via email, phone or live chat. We're here to help 24/7.",
    ogImage: "https://picsum.photos/seed/contact/1200/630",
    canonicalUrl: "",
    indexable: true,
    schemaType: "LocalBusiness",
    score: 91,
    issues: [],
  },
  {
    id: "meta_010",
    entityType: "product",
    title: "Ceramic Coffee Mug Set",
    url: "/kitchen/ceramic-coffee-mug-set",
    metaTitle: "Ceramic Coffee Mug Set — Set of 4 | UrbanWear",
    metaDescription: "",
    ogImage: "https://picsum.photos/seed/mugs/1200/630",
    canonicalUrl: "",
    indexable: true,
    schemaType: "Product",
    score: 68,
    issues: ["Missing meta description"],
  },
  {
    id: "meta_011",
    entityType: "brand",
    title: "GlowUp Beauty",
    url: "/brands/glowup-beauty",
    metaTitle: "GlowUp Beauty — Skincare & Cosmetics",
    metaDescription: "Shop GlowUp Beauty's award-winning skincare, makeup and wellness products.",
    ogImage: "https://picsum.photos/seed/glowup/1200/630",
    canonicalUrl: "",
    indexable: true,
    schemaType: "WebPage",
    score: 85,
    issues: [],
  },
  {
    id: "meta_012",
    entityType: "page",
    title: "Privacy Policy",
    url: "/privacy",
    metaTitle: "Privacy Policy | UrbanWear",
    metaDescription: "Read our privacy policy to understand how we collect and use your data.",
    ogImage: "",
    canonicalUrl: "",
    indexable: false,
    schemaType: "WebPage",
    score: 58,
    issues: ["Missing OG image"],
  },
  {
    id: "meta_013",
    entityType: "product",
    title: "USB-C Hub 7-in-1",
    url: "/electronics/usb-c-hub-7in1",
    metaTitle: "USB-C Hub 7-in-1 — Multiport Adapter | UrbanWear",
    metaDescription: "Expand your laptop with 7 ports: HDMI, USB 3.0 ×3, SD/microSD, PD charging. Works with MacBook & Windows.",
    ogImage: "https://picsum.photos/seed/usbhub/1200/630",
    canonicalUrl: "",
    indexable: true,
    schemaType: "Product",
    score: 90,
    issues: [],
  },
  {
    id: "meta_014",
    entityType: "product",
    title: "Mechanical Keyboard TKL",
    url: "/electronics/mechanical-keyboard-tkl",
    metaTitle: "",
    metaDescription: "",
    ogImage: "",
    canonicalUrl: "",
    indexable: true,
    schemaType: "Product",
    score: 10,
    issues: ["Missing meta title", "Missing meta description", "Missing OG image"],
  },
  {
    id: "meta_015",
    entityType: "product",
    title: "Bamboo Cutting Board Set",
    url: "/kitchen/bamboo-cutting-board-set",
    metaTitle: "Bamboo Cutting Board Set of 3 | UrbanWear",
    metaDescription: "Eco-friendly bamboo cutting boards in 3 sizes. Antibacterial, dishwasher-safe, and durable.",
    ogImage: "https://picsum.photos/seed/bamboo/1200/630",
    canonicalUrl: "",
    indexable: true,
    schemaType: "Product",
    score: 87,
    issues: [],
  },
  {
    id: "meta_016",
    entityType: "category",
    title: "Footwear",
    url: "/footwear",
    metaTitle: "Footwear — Shop Shoes Online | UrbanWear",
    metaDescription: "Browse men's and women's footwear: sneakers, sandals, boots and more. Free delivery over ৳999.",
    ogImage: "https://picsum.photos/seed/footwear/1200/630",
    canonicalUrl: "",
    indexable: true,
    schemaType: "Category",
    score: 94,
    issues: [],
  },
  {
    id: "meta_017",
    entityType: "product",
    title: "Stainless Steel Water Bottle 1L",
    url: "/kitchen/stainless-steel-water-bottle-1l",
    metaTitle: "1L Stainless Steel Water Bottle | UrbanWear",
    metaDescription: "",
    ogImage: "https://picsum.photos/seed/bottle/1200/630",
    canonicalUrl: "",
    indexable: true,
    schemaType: "Product",
    score: 65,
    issues: ["Missing meta description"],
  },
  {
    id: "meta_018",
    entityType: "brand",
    title: "TechNova",
    url: "/brands/technova",
    metaTitle: "TechNova — Smart Home & Electronics",
    metaDescription: "TechNova brings cutting-edge smart home devices, audio, and accessories to Bangladesh.",
    ogImage: "https://picsum.photos/seed/technova/1200/630",
    canonicalUrl: "",
    indexable: true,
    schemaType: "WebPage",
    score: 82,
    issues: [],
  },
  {
    id: "meta_019",
    entityType: "product",
    title: "Yoga Mat Non-Slip 6mm",
    url: "/sports/yoga-mat-non-slip-6mm",
    metaTitle: "Non-Slip Yoga Mat 6mm | UrbanWear",
    metaDescription: "Extra-thick 6mm yoga mat with alignment lines. Non-slip surface, sweat-resistant, includes carry strap.",
    ogImage: "",
    canonicalUrl: "",
    indexable: true,
    schemaType: "Product",
    score: 72,
    issues: ["Missing OG image"],
  },
  {
    id: "meta_020",
    entityType: "category",
    title: "Kitchen",
    url: "/kitchen",
    metaTitle: "",
    metaDescription: "Shop kitchen essentials, cookware, and dining accessories at UrbanWear.",
    ogImage: "",
    canonicalUrl: "",
    indexable: true,
    schemaType: "Category",
    score: 43,
    issues: ["Missing meta title", "Missing OG image"],
  },
  {
    id: "meta_021",
    entityType: "product",
    title: "Denim Jacket Classic Fit",
    url: "/apparel/denim-jacket-classic-fit",
    metaTitle: "Classic Fit Denim Jacket | UrbanWear",
    metaDescription: "Timeless denim jacket in classic fit. Available in light, mid and dark wash. Sizes XS–3XL.",
    ogImage: "https://picsum.photos/seed/denim/1200/630",
    canonicalUrl: "",
    indexable: true,
    schemaType: "Product",
    score: 89,
    issues: [],
  },
  {
    id: "meta_022",
    entityType: "product",
    title: "Portable Bluetooth Speaker IPX7",
    url: "/electronics/portable-bluetooth-speaker-ipx7",
    metaTitle: "Portable Bluetooth Speaker IPX7 | UrbanWear",
    metaDescription: "Waterproof IPX7 Bluetooth speaker with 360° sound, 20-hour battery, and built-in mic.",
    ogImage: "https://picsum.photos/seed/speaker/1200/630",
    canonicalUrl: "",
    indexable: true,
    schemaType: "Product",
    score: 93,
    issues: [],
  },
  {
    id: "meta_023",
    entityType: "page",
    title: "Terms & Conditions",
    url: "/terms",
    metaTitle: "Terms & Conditions | UrbanWear",
    metaDescription: "Read UrbanWear's terms and conditions before placing an order.",
    ogImage: "",
    canonicalUrl: "",
    indexable: false,
    schemaType: "WebPage",
    score: 55,
    issues: ["Missing OG image"],
  },
  {
    id: "meta_024",
    entityType: "brand",
    title: "ActiveLife",
    url: "/brands/activelife",
    metaTitle: "",
    metaDescription: "",
    ogImage: "",
    canonicalUrl: "",
    indexable: true,
    schemaType: "WebPage",
    score: 8,
    issues: ["Missing meta title", "Missing meta description", "Missing OG image"],
  },
  {
    id: "meta_025",
    entityType: "product",
    title: "Linen Summer Dress",
    url: "/apparel/linen-summer-dress",
    metaTitle: "Linen Summer Dress | UrbanWear",
    metaDescription: "Linen Summer Dress | UrbanWear",
    ogImage: "https://picsum.photos/seed/linen/1200/630",
    canonicalUrl: "",
    indexable: true,
    schemaType: "Product",
    score: 52,
    issues: ["Duplicate description pattern — matches meta title"],
  },
  {
    id: "meta_026",
    entityType: "product",
    title: "Air Purifier HEPA H13",
    url: "/home/air-purifier-hepa-h13",
    metaTitle: "HEPA H13 Air Purifier — Covers 50m² | UrbanWear",
    metaDescription: "True HEPA H13 air purifier removes 99.97% of particles. Covers up to 50m², ultra-quiet, auto mode.",
    ogImage: "https://picsum.photos/seed/airpurifier/1200/630",
    canonicalUrl: "",
    indexable: true,
    schemaType: "Product",
    score: 96,
    issues: [],
  },
  {
    id: "meta_027",
    entityType: "category",
    title: "Sports & Fitness",
    url: "/sports",
    metaTitle: "Sports & Fitness Equipment | UrbanWear",
    metaDescription: "",
    ogImage: "https://picsum.photos/seed/sports/1200/630",
    canonicalUrl: "",
    indexable: true,
    schemaType: "Category",
    score: 60,
    issues: ["Missing meta description"],
  },
  {
    id: "meta_028",
    entityType: "product",
    title: "Leather Wallet Slim RFID",
    url: "/accessories/leather-wallet-slim-rfid",
    metaTitle: "Slim RFID Leather Wallet | UrbanWear",
    metaDescription: "Genuine leather slim wallet with RFID blocking. Holds 8 cards, fits in front pocket.",
    ogImage: "https://picsum.photos/seed/wallet/1200/630",
    canonicalUrl: "",
    indexable: true,
    schemaType: "Product",
    score: 84,
    issues: [],
  },
  {
    id: "meta_029",
    entityType: "page",
    title: "FAQ",
    url: "/faq",
    metaTitle: "Frequently Asked Questions | UrbanWear",
    metaDescription: "Find answers about shipping, returns, payments, and product questions at UrbanWear.",
    ogImage: "",
    canonicalUrl: "",
    indexable: true,
    schemaType: "WebPage",
    score: 70,
    issues: ["Missing OG image"],
  },
  {
    id: "meta_030",
    entityType: "product",
    title: "4K Webcam 60fps Autofocus",
    url: "/electronics/4k-webcam-60fps-autofocus",
    metaTitle: "",
    metaDescription: "4K webcam with 60fps, AI autofocus, built-in ring light and dual noise-cancelling mics.",
    ogImage: "https://picsum.photos/seed/webcam/1200/630",
    canonicalUrl: "",
    indexable: true,
    schemaType: "Product",
    score: 67,
    issues: ["Missing meta title"],
  },
  {
    id: "meta_031",
    entityType: "category",
    title: "Home & Living",
    url: "/home",
    metaTitle: "Home & Living — Decor & Furniture | UrbanWear",
    metaDescription: "Shop home decor, furniture, lighting, and living essentials. Free delivery on orders over ৳1,499.",
    ogImage: "https://picsum.photos/seed/homeliving/1200/630",
    canonicalUrl: "",
    indexable: true,
    schemaType: "Category",
    score: 91,
    issues: [],
  },
  {
    id: "meta_032",
    entityType: "product",
    title: "Resistance Bands Set (5-pack)",
    url: "/sports/resistance-bands-set-5pack",
    metaTitle: "5-Pack Resistance Bands Set | UrbanWear",
    metaDescription: "Set of 5 resistance bands from light to extra-heavy. Perfect for home workouts, physical therapy, and stretching.",
    ogImage: "https://picsum.photos/seed/bands/1200/630",
    canonicalUrl: "",
    indexable: true,
    schemaType: "Product",
    score: 88,
    issues: [],
  },
  {
    id: "meta_033",
    entityType: "brand",
    title: "PureHome",
    url: "/brands/purehome",
    metaTitle: "PureHome — Organic Home & Living",
    metaDescription: "PureHome crafts eco-friendly, organic home essentials — from bedding to kitchenware.",
    ogImage: "https://picsum.photos/seed/purehome/1200/630",
    canonicalUrl: "",
    indexable: true,
    schemaType: "WebPage",
    score: 79,
    issues: [],
  },
  {
    id: "meta_034",
    entityType: "product",
    title: "Smart LED Strip Lights 5m",
    url: "/home/smart-led-strip-lights-5m",
    metaTitle: "Smart LED Strip Lights 5m — RGB WiFi | UrbanWear",
    metaDescription: "",
    ogImage: "https://picsum.photos/seed/ledstrip/1200/630",
    canonicalUrl: "",
    indexable: true,
    schemaType: "Product",
    score: 63,
    issues: ["Missing meta description"],
  },
  {
    id: "meta_035",
    entityType: "product",
    title: "Noise Cancelling Headphones",
    url: "/electronics/noise-cancelling-headphones",
    metaTitle: "Noise Cancelling Headphones — 40hr Battery | UrbanWear",
    metaDescription: "Over-ear noise cancelling headphones with 40-hour playback, Hi-Res audio and foldable design.",
    ogImage: "https://picsum.photos/seed/headphones/1200/630",
    canonicalUrl: "",
    indexable: true,
    schemaType: "Product",
    score: 97,
    issues: [],
  },
  {
    id: "meta_036",
    entityType: "page",
    title: "Return Policy",
    url: "/returns",
    metaTitle: "Return & Refund Policy | UrbanWear",
    metaDescription: "30-day hassle-free returns on all orders. Learn how to initiate a return or exchange.",
    ogImage: "",
    canonicalUrl: "",
    indexable: true,
    schemaType: "WebPage",
    score: 74,
    issues: ["Missing OG image"],
  },
];

export type SeoRedirect = {
  id: string;
  fromPath: string;
  toPath: string;
  type: "301" | "302" | "410";
  hitCount: number;
  source: string;
  updatedAt: string;
};

export const redirectsSeed: SeoRedirect[] = [
  {
    id: "red_001",
    fromPath: "/shop/earbuds-old",
    toPath: "/electronics/wireless-earbuds-pro",
    type: "301",
    hitCount: 842,
    source: "Slug change",
    updatedAt: "2026-06-10",
  },
  {
    id: "red_002",
    fromPath: "/category/phones",
    toPath: "/electronics/phones",
    type: "301",
    hitCount: 1204,
    source: "Category merge",
    updatedAt: "2026-06-05",
  },
  {
    id: "red_003",
    fromPath: "/summer-sale-2025",
    toPath: "/collections/summer-sale-2026",
    type: "302",
    hitCount: 96,
    source: "Campaign redirect",
    updatedAt: "2026-06-01",
  },
  {
    id: "red_004",
    fromPath: "/discontinued-product-x",
    toPath: "/electronics",
    type: "301",
    hitCount: 38,
    source: "Manual",
    updatedAt: "2026-05-28",
  },
];

export type AuditCategory = "meta" | "content" | "technical" | "links" | "performance" | "mobile";
export type AuditIssueStatus = "open" | "fixed" | "ignored";

export type SeoAuditIssue = {
  id: string;
  type: string;
  category: AuditCategory;
  severity: SeoIssueSeverity;
  url: string;
  entity: string;
  suggestion: string;
  status: AuditIssueStatus;
  affectedCount?: number;
};

export const AUDIT_CATEGORY_LABELS: Record<AuditCategory, string> = {
  meta:        "Meta Tags",
  content:     "Content",
  technical:   "Technical",
  links:       "Links",
  performance: "Performance",
  mobile:      "Mobile",
};

export const AUDIT_CATEGORY_SCORES: Record<AuditCategory, number> = {
  meta:        62,
  content:     74,
  technical:   81,
  links:       68,
  performance: 58,
  mobile:      88,
};

export const auditCrawlInfo = {
  lastCrawl:    "2026-06-20 04:00",
  pagesCrawled: 286,
  duration:     "2m 14s",
  nextCrawl:    "2026-06-21 04:00",
  healthScore:  72,
};

export const auditIssuesSeed: SeoAuditIssue[] = [
  { id: "iss_001", category: "meta",        type: "missing_meta_title",       severity: "high",   status: "open",    url: "/electronics/smart-watch-series-5",         entity: "Smart Watch Series 5",        suggestion: "Add meta title: 'Smart Watch Series 5 — UrbanWear'", affectedCount: 1 },
  { id: "iss_002", category: "meta",        type: "missing_meta_title",       severity: "high",   status: "open",    url: "/electronics/mechanical-keyboard-tkl",       entity: "Mechanical Keyboard TKL",     suggestion: "Add meta title: 'Mechanical Keyboard TKL | UrbanWear'", affectedCount: 1 },
  { id: "iss_003", category: "meta",        type: "missing_meta_title",       severity: "high",   status: "open",    url: "/apparel",                                   entity: "Apparel category",            suggestion: "Add meta title for the Apparel category page", affectedCount: 1 },
  { id: "iss_004", category: "meta",        type: "missing_meta_title",       severity: "high",   status: "open",    url: "/brands/activelife",                         entity: "ActiveLife brand",            suggestion: "Add meta title: 'ActiveLife — Sports & Fitness | UrbanWear'", affectedCount: 1 },
  { id: "iss_005", category: "meta",        type: "missing_meta_description", severity: "medium", status: "open",    url: "/electronics",                               entity: "Electronics category",        suggestion: "Write 150–160 char description with primary keyword 'electronics Bangladesh'", affectedCount: 1 },
  { id: "iss_006", category: "meta",        type: "missing_meta_description", severity: "medium", status: "open",    url: "/kitchen/ceramic-coffee-mug-set",            entity: "Ceramic Coffee Mug Set",      suggestion: "Add product description highlighting 'set of 4, microwave-safe'", affectedCount: 1 },
  { id: "iss_007", category: "meta",        type: "missing_meta_description", severity: "medium", status: "open",    url: "/home/smart-led-strip-lights-5m",            entity: "Smart LED Strip Lights 5m",   suggestion: "Add 150-char description with keywords 'RGB, WiFi, Alexa compatible'", affectedCount: 1 },
  { id: "iss_008", category: "meta",        type: "missing_meta_description", severity: "medium", status: "open",    url: "/sports",                                    entity: "Sports & Fitness category",   suggestion: "Write category description mentioning yoga, running, gym equipment", affectedCount: 1 },
  { id: "iss_009", category: "meta",        type: "duplicate_title",          severity: "high",   status: "open",    url: "/apparel/linen-summer-dress",                entity: "Linen Summer Dress",          suggestion: "Title duplicates meta description — make title unique and descriptive", affectedCount: 1 },
  { id: "iss_010", category: "meta",        type: "title_too_long",           severity: "medium", status: "open",    url: "/electronics/noise-cancelling-headphones",   entity: "Noise Cancelling Headphones", suggestion: "Title is 58 chars — trim to keep under 60 chars to avoid truncation", affectedCount: 1 },
  { id: "iss_011", category: "meta",        type: "missing_og_image",         severity: "medium", status: "open",    url: "/electronics/smart-watch-series-5",          entity: "Smart Watch Series 5",        suggestion: "Add 1200×630px OG image for social sharing", affectedCount: 1 },
  { id: "iss_012", category: "meta",        type: "missing_og_image",         severity: "medium", status: "open",    url: "/apparel/premium-cotton-t-shirt",            entity: "Premium Cotton T-Shirt",      suggestion: "Add product image as OG image (1200×630px recommended)", affectedCount: 1 },
  { id: "iss_013", category: "meta",        type: "missing_og_image",         severity: "medium", status: "open",    url: "/sports/yoga-mat-non-slip-6mm",              entity: "Yoga Mat Non-Slip 6mm",       suggestion: "Add OG image for better social sharing CTR", affectedCount: 1 },
  { id: "iss_014", category: "meta",        type: "missing_og_image",         severity: "low",    status: "open",    url: "/about",                                     entity: "About Us page",               suggestion: "Add branded banner image as OG image", affectedCount: 1 },
  { id: "iss_015", category: "meta",        type: "missing_schema",           severity: "medium", status: "open",    url: "/electronics/4k-webcam-60fps-autofocus",     entity: "4K Webcam 60fps",             suggestion: "Add Product JSON-LD schema with price, availability, and ratings", affectedCount: 1 },
  { id: "iss_016", category: "meta",        type: "missing_schema",           severity: "low",    status: "open",    url: "/about",                                     entity: "About Us page",               suggestion: "Add Organization schema with address and contact details", affectedCount: 1 },
  { id: "iss_017", category: "content",     type: "thin_content",             severity: "high",   status: "open",    url: "/about",                                     entity: "About Us page",               suggestion: "Page has only 120 words — expand to 300+ words for better ranking", affectedCount: 1 },
  { id: "iss_018", category: "content",     type: "thin_content",             severity: "high",   status: "open",    url: "/contact",                                   entity: "Contact page",                suggestion: "Page has only 85 words — add store hours, address map, and FAQ section", affectedCount: 1 },
  { id: "iss_019", category: "content",     type: "missing_h1",               severity: "high",   status: "open",    url: "/brands/activelife",                         entity: "ActiveLife brand page",       suggestion: "Page is missing an H1 heading — add brand name as H1", affectedCount: 1 },
  { id: "iss_020", category: "content",     type: "duplicate_content",        severity: "high",   status: "open",    url: "/apparel/premium-cotton-t-shirt",            entity: "Premium Cotton T-Shirt",      suggestion: "Product description duplicates another product — write unique copy", affectedCount: 3 },
  { id: "iss_021", category: "content",     type: "missing_alt_text",         severity: "medium", status: "open",    url: "/electronics/usb-c-hub-7in1",               entity: "USB-C Hub 7-in-1",            suggestion: "2 gallery images missing alt text — describe each image", affectedCount: 2 },
  { id: "iss_022", category: "content",     type: "missing_alt_text",         severity: "medium", status: "open",    url: "/apparel/denim-jacket-classic-fit",          entity: "Denim Jacket Classic Fit",    suggestion: "4 product images have empty alt attributes", affectedCount: 4 },
  { id: "iss_023", category: "content",     type: "missing_alt_text",         severity: "medium", status: "open",    url: "/sports/resistance-bands-set-5pack",         entity: "Resistance Bands Set",        suggestion: "3 images missing descriptive alt text", affectedCount: 3 },
  { id: "iss_024", category: "content",     type: "keyword_stuffing",         severity: "medium", status: "open",    url: "/electronics/noise-cancelling-headphones",   entity: "Noise Cancelling Headphones", suggestion: "Keyword 'headphones' repeated 12 times — reduce density to under 3%", affectedCount: 1 },
  { id: "iss_025", category: "content",     type: "short_description",        severity: "low",    status: "open",    url: "/electronics/smart-watch-series-5",          entity: "Smart Watch Series 5",        suggestion: "Meta description is 42 chars — expand to 120–160 chars", affectedCount: 1 },
  { id: "iss_026", category: "technical",   type: "broken_link",              severity: "high",   status: "open",    url: "/blog/old-post-link",                        entity: "Blog: Summer trends",         suggestion: "Internal link to /collections/summer-sale-2026 returns 404 — update or remove", affectedCount: 1 },
  { id: "iss_027", category: "technical",   type: "broken_link",              severity: "high",   status: "open",    url: "/electronics",                               entity: "Electronics category",        suggestion: "Footer link to /brands/discontinued-brand returns 404", affectedCount: 1 },
  { id: "iss_028", category: "technical",   type: "redirect_chain",           severity: "medium", status: "open",    url: "/shop/earbuds-old",                          entity: "Earbuds Old (redirect)",      suggestion: "3-hop redirect chain detected — consolidate to single 301", affectedCount: 1 },
  { id: "iss_029", category: "technical",   type: "mixed_content",            severity: "high",   status: "fixed",   url: "/home/smart-led-strip-lights-5m",            entity: "Smart LED Strip Lights",      suggestion: "HTTP image resource on HTTPS page — update to HTTPS", affectedCount: 1 },
  { id: "iss_030", category: "technical",   type: "missing_canonical",        severity: "medium", status: "open",    url: "/apparel/premium-cotton-t-shirt",            entity: "Premium Cotton T-Shirt",      suggestion: "Faceted URL (?color=blue) indexed without canonical — add self-referencing canonical", affectedCount: 8 },
  { id: "iss_031", category: "technical",   type: "noindex_in_sitemap",       severity: "medium", status: "open",    url: "/apparel",                                   entity: "Apparel category",            suggestion: "No-index page found in sitemap — remove from sitemap or change to indexable", affectedCount: 1 },
  { id: "iss_032", category: "technical",   type: "sitemap_missing",          severity: "low",    status: "fixed",   url: "/sitemap-pages.xml",                         entity: "CMS Pages sitemap",           suggestion: "Sitemap is stale (14 days) — trigger regeneration", affectedCount: 1 },
  { id: "iss_033", category: "technical",   type: "robots_blocked",           severity: "medium", status: "ignored", url: "/admin",                                     entity: "Admin panel",                 suggestion: "Disallow in robots.txt is correct for admin — ignore this warning", affectedCount: 1 },
  { id: "iss_034", category: "links",       type: "broken_external_link",     severity: "medium", status: "open",    url: "/about",                                     entity: "About Us page",               suggestion: "External link to supplier site returns 503 — check or remove link", affectedCount: 1 },
  { id: "iss_035", category: "links",       type: "orphan_page",              severity: "medium", status: "open",    url: "/brands/activelife",                         entity: "ActiveLife brand page",       suggestion: "No internal links point to this page — add links from category and homepage", affectedCount: 1 },
  { id: "iss_036", category: "links",       type: "orphan_page",              severity: "medium", status: "open",    url: "/kitchen/bamboo-cutting-board-set",          entity: "Bamboo Cutting Board Set",    suggestion: "Only 1 internal link — add from Kitchen category and related products", affectedCount: 1 },
  { id: "iss_037", category: "links",       type: "too_many_links",           severity: "low",    status: "open",    url: "/electronics",                               entity: "Electronics category",        suggestion: "Page has 142 links — reduce to under 100 for crawl efficiency", affectedCount: 1 },
  { id: "iss_038", category: "links",       type: "generic_anchor_text",      severity: "low",    status: "open",    url: "/home",                                      entity: "Home & Living",               suggestion: "14 links use 'click here' or 'read more' — use descriptive anchor text", affectedCount: 14 },
  { id: "iss_039", category: "performance", type: "slow_lcp",                 severity: "high",   status: "open",    url: "/electronics/noise-cancelling-headphones",   entity: "Noise Cancelling Headphones", suggestion: "LCP is 4.2s (poor) — compress hero image and enable lazy loading", affectedCount: 1 },
  { id: "iss_040", category: "performance", type: "slow_lcp",                 severity: "high",   status: "open",    url: "/footwear",                                  entity: "Footwear category",           suggestion: "LCP is 3.8s — defer non-critical CSS and preload hero image", affectedCount: 1 },
  { id: "iss_041", category: "performance", type: "large_images",             severity: "medium", status: "open",    url: "/electronics/portable-bluetooth-speaker-ipx7",entity: "Bluetooth Speaker",          suggestion: "3 images over 500KB — convert to WebP and compress", affectedCount: 3 },
  { id: "iss_042", category: "performance", type: "large_images",             severity: "medium", status: "open",    url: "/apparel/denim-jacket-classic-fit",          entity: "Denim Jacket",                suggestion: "Hero image is 1.2MB — compress to under 200KB", affectedCount: 1 },
  { id: "iss_043", category: "performance", type: "render_blocking",          severity: "medium", status: "open",    url: "/",                                          entity: "Homepage",                    suggestion: "2 render-blocking scripts detected — defer or async load", affectedCount: 2 },
  { id: "iss_044", category: "performance", type: "no_cache_headers",         severity: "low",    status: "fixed",   url: "/",                                          entity: "Homepage",                    suggestion: "Static assets missing cache-control headers — set max-age=31536000", affectedCount: 6 },
  { id: "iss_045", category: "performance", type: "cls_shift",                severity: "medium", status: "open",    url: "/electronics",                               entity: "Electronics category",        suggestion: "CLS score is 0.18 (needs improvement) — add width/height to image tags", affectedCount: 1 },
  { id: "iss_046", category: "mobile",      type: "tap_target_small",         severity: "medium", status: "fixed",   url: "/cart",                                      entity: "Cart page",                   suggestion: "Checkout button is 32×28px — minimum tap target is 48×48px", affectedCount: 1 },
  { id: "iss_047", category: "mobile",      type: "viewport_not_set",         severity: "high",   status: "fixed",   url: "/brands/activelife",                         entity: "ActiveLife brand page",       suggestion: "Missing viewport meta tag — add <meta name='viewport' content='width=device-width'>", affectedCount: 1 },
  { id: "iss_048", category: "mobile",      type: "font_too_small",           severity: "low",    status: "open",    url: "/privacy",                                   entity: "Privacy Policy page",         suggestion: "Body text is 11px on mobile — minimum recommended is 16px", affectedCount: 1 },
  { id: "iss_049", category: "mobile",      type: "horizontal_scroll",        severity: "low",    status: "ignored", url: "/terms",                                     entity: "Terms & Conditions",          suggestion: "Overflow-x detected on mobile — check table or pre element widths", affectedCount: 1 },
  { id: "iss_050", category: "content",     type: "missing_alt_text",         severity: "medium", status: "fixed",   url: "/home/air-purifier-hepa-h13",                entity: "Air Purifier HEPA H13",       suggestion: "Hero image alt text was empty — fixed", affectedCount: 1 },
];

export type SeoSitemap = {
  id: string;
  name: string;
  path: string;
  urlCount: number;
  lastGenerated: string;
  status: "fresh" | "stale" | "generating";
};

export const sitemapsSeed: SeoSitemap[] = [
  {
    id: "sm_index",
    name: "Sitemap index",
    path: "/sitemap.xml",
    urlCount: 4,
    lastGenerated: "2026-06-15 02:00",
    status: "fresh",
  },
  {
    id: "sm_products",
    name: "Products",
    path: "/sitemap-products.xml",
    urlCount: 2840,
    lastGenerated: "2026-06-15 02:00",
    status: "fresh",
  },
  {
    id: "sm_categories",
    name: "Categories",
    path: "/sitemap-categories.xml",
    urlCount: 186,
    lastGenerated: "2026-06-15 02:00",
    status: "fresh",
  },
  {
    id: "sm_pages",
    name: "CMS Pages",
    path: "/sitemap-pages.xml",
    urlCount: 42,
    lastGenerated: "2026-06-14 02:00",
    status: "stale",
  },
];

export type KeywordTag = "brand" | "product" | "category" | "informational" | "local";
export type KeywordStatus = "tracking" | "paused" | "lost";

export type SeoKeyword = {
  id: string;
  keyword: string;
  targetUrl: string;
  targetTitle: string;
  position: number;
  prevPosition: number;
  change: number;
  volume: number;
  difficulty: number;
  ctr: number;
  clicks30d: number;
  impressions30d: number;
  status: KeywordStatus;
  tag: KeywordTag;
  updatedAt: string;
};

export const KEYWORD_TAG_LABELS: Record<KeywordTag, string> = {
  brand:         "Brand",
  product:       "Product",
  category:      "Category",
  informational: "Informational",
  local:         "Local",
};

export const keywordsSeed: SeoKeyword[] = [
  { id: "kw_001", keyword: "wireless earbuds bangladesh",          targetUrl: "/electronics/wireless-earbuds-pro",          targetTitle: "Wireless Earbuds Pro",           position: 8,  prevPosition: 10, change: 2,  volume: 2400, difficulty: 42, ctr: 3.8, clicks30d: 286,  impressions30d: 7520,  status: "tracking", tag: "product",       updatedAt: "2026-06-20" },
  { id: "kw_002", keyword: "cotton t shirt online bd",             targetUrl: "/apparel/premium-cotton-t-shirt",            targetTitle: "Premium Cotton T-Shirt",         position: 14, prevPosition: 13, change: -1, volume: 1800, difficulty: 38, ctr: 2.1, clicks30d: 118,  impressions30d: 5620,  status: "tracking", tag: "product",       updatedAt: "2026-06-20" },
  { id: "kw_003", keyword: "urbanwear fashion",                    targetUrl: "/brands/urbanwear",                          targetTitle: "UrbanWear",                      position: 3,  prevPosition: 3,  change: 0,  volume: 920,  difficulty: 25, ctr: 8.4, clicks30d: 231,  impressions30d: 2750,  status: "tracking", tag: "brand",         updatedAt: "2026-06-20" },
  { id: "kw_004", keyword: "smart watch price bangladesh",         targetUrl: "/electronics/smart-watch-series-5",          targetTitle: "Smart Watch Series 5",           position: 22, prevPosition: 26, change: 4,  volume: 3100, difficulty: 61, ctr: 1.2, clicks30d: 93,   impressions30d: 7750,  status: "tracking", tag: "product",       updatedAt: "2026-06-20" },
  { id: "kw_005", keyword: "electronics shop dhaka",               targetUrl: "/electronics",                               targetTitle: "Electronics",                    position: 11, prevPosition: 10, change: -1, volume: 4200, difficulty: 55, ctr: 2.9, clicks30d: 364,  impressions30d: 12540, status: "tracking", tag: "local",         updatedAt: "2026-06-20" },
  { id: "kw_006", keyword: "running shoes online bd",              targetUrl: "/footwear/running-shoes-ultra",              targetTitle: "Running Shoes Ultra",            position: 5,  prevPosition: 8,  change: 3,  volume: 2900, difficulty: 48, ctr: 5.6, clicks30d: 487,  impressions30d: 8700,  status: "tracking", tag: "product",       updatedAt: "2026-06-20" },
  { id: "kw_007", keyword: "noise cancelling headphones bd",       targetUrl: "/electronics/noise-cancelling-headphones",   targetTitle: "Noise Cancelling Headphones",    position: 4,  prevPosition: 6,  change: 2,  volume: 1650, difficulty: 52, ctr: 6.2, clicks30d: 306,  impressions30d: 4930,  status: "tracking", tag: "product",       updatedAt: "2026-06-20" },
  { id: "kw_008", keyword: "bluetooth speaker waterproof",         targetUrl: "/electronics/portable-bluetooth-speaker-ipx7", targetTitle: "Bluetooth Speaker IPX7",       position: 7,  prevPosition: 7,  change: 0,  volume: 2200, difficulty: 59, ctr: 4.1, clicks30d: 269,  impressions30d: 6560,  status: "tracking", tag: "product",       updatedAt: "2026-06-20" },
  { id: "kw_009", keyword: "yoga mat buy online bangladesh",       targetUrl: "/sports/yoga-mat-non-slip-6mm",              targetTitle: "Yoga Mat Non-Slip 6mm",          position: 9,  prevPosition: 12, change: 3,  volume: 1100, difficulty: 34, ctr: 3.4, clicks30d: 112,  impressions30d: 3300,  status: "tracking", tag: "product",       updatedAt: "2026-06-20" },
  { id: "kw_010", keyword: "air purifier hepa bangladesh",         targetUrl: "/home/air-purifier-hepa-h13",                targetTitle: "Air Purifier HEPA H13",          position: 2,  prevPosition: 4,  change: 2,  volume: 880,  difficulty: 41, ctr: 9.1, clicks30d: 240,  impressions30d: 2640,  status: "tracking", tag: "product",       updatedAt: "2026-06-20" },
  { id: "kw_011", keyword: "usb c hub multiport adapter",          targetUrl: "/electronics/usb-c-hub-7in1",                targetTitle: "USB-C Hub 7-in-1",               position: 6,  prevPosition: 5,  change: -1, volume: 1450, difficulty: 47, ctr: 4.8, clicks30d: 208,  impressions30d: 4350,  status: "tracking", tag: "product",       updatedAt: "2026-06-20" },
  { id: "kw_012", keyword: "leather wallet rfid blocking",         targetUrl: "/accessories/leather-wallet-slim-rfid",      targetTitle: "Leather Wallet Slim RFID",       position: 12, prevPosition: 15, change: 3,  volume: 960,  difficulty: 38, ctr: 2.7, clicks30d: 78,   impressions30d: 2880,  status: "tracking", tag: "product",       updatedAt: "2026-06-20" },
  { id: "kw_013", keyword: "bamboo cutting board set",             targetUrl: "/kitchen/bamboo-cutting-board-set",          targetTitle: "Bamboo Cutting Board Set",        position: 18, prevPosition: 21, change: 3,  volume: 720,  difficulty: 31, ctr: 1.9, clicks30d: 41,   impressions30d: 2160,  status: "tracking", tag: "product",       updatedAt: "2026-06-20" },
  { id: "kw_014", keyword: "online shopping dhaka bangladesh",     targetUrl: "/",                                          targetTitle: "UrbanWear Home",                 position: 16, prevPosition: 14, change: -2, volume: 8900, difficulty: 74, ctr: 1.4, clicks30d: 374,  impressions30d: 26700, status: "tracking", tag: "local",         updatedAt: "2026-06-20" },
  { id: "kw_015", keyword: "denim jacket women online",            targetUrl: "/apparel/denim-jacket-classic-fit",          targetTitle: "Denim Jacket Classic Fit",        position: 19, prevPosition: 22, change: 3,  volume: 1340, difficulty: 44, ctr: 1.6, clicks30d: 64,   impressions30d: 4020,  status: "tracking", tag: "product",       updatedAt: "2026-06-20" },
  { id: "kw_016", keyword: "glowup beauty skincare bd",            targetUrl: "/brands/glowup-beauty",                     targetTitle: "GlowUp Beauty",                  position: 4,  prevPosition: 5,  change: 1,  volume: 1100, difficulty: 28, ctr: 7.2, clicks30d: 237,  impressions30d: 3300,  status: "tracking", tag: "brand",         updatedAt: "2026-06-20" },
  { id: "kw_017", keyword: "technova smart home bangladesh",       targetUrl: "/brands/technova",                          targetTitle: "TechNova",                       position: 6,  prevPosition: 8,  change: 2,  volume: 640,  difficulty: 22, ctr: 5.8, clicks30d: 111,  impressions30d: 1920,  status: "tracking", tag: "brand",         updatedAt: "2026-06-20" },
  { id: "kw_018", keyword: "4k webcam for laptop bangladesh",      targetUrl: "/electronics/4k-webcam-60fps-autofocus",    targetTitle: "4K Webcam 60fps Autofocus",       position: 13, prevPosition: 11, change: -2, volume: 1780, difficulty: 56, ctr: 2.3, clicks30d: 123,  impressions30d: 5340,  status: "tracking", tag: "product",       updatedAt: "2026-06-20" },
  { id: "kw_019", keyword: "resistance bands workout set bd",      targetUrl: "/sports/resistance-bands-set-5pack",         targetTitle: "Resistance Bands Set",           position: 10, prevPosition: 14, change: 4,  volume: 840,  difficulty: 29, ctr: 3.2, clicks30d: 80,   impressions30d: 2520,  status: "tracking", tag: "product",       updatedAt: "2026-06-20" },
  { id: "kw_020", keyword: "led strip lights smart home bd",       targetUrl: "/home/smart-led-strip-lights-5m",           targetTitle: "Smart LED Strip Lights 5m",       position: 15, prevPosition: 18, change: 3,  volume: 2100, difficulty: 45, ctr: 2.0, clicks30d: 126,  impressions30d: 6300,  status: "tracking", tag: "product",       updatedAt: "2026-06-20" },
  { id: "kw_021", keyword: "water bottle stainless steel buy bd",  targetUrl: "/kitchen/stainless-steel-water-bottle-1l",  targetTitle: "Water Bottle 1L",                position: 21, prevPosition: 20, change: -1, volume: 990,  difficulty: 33, ctr: 1.5, clicks30d: 44,   impressions30d: 2970,  status: "tracking", tag: "product",       updatedAt: "2026-06-20" },
  { id: "kw_022", keyword: "how to choose running shoes",          targetUrl: "/footwear",                                 targetTitle: "Footwear",                       position: 17, prevPosition: 19, change: 2,  volume: 3400, difficulty: 52, ctr: 1.8, clicks30d: 184,  impressions30d: 10200, status: "tracking", tag: "informational", updatedAt: "2026-06-20" },
  { id: "kw_023", keyword: "best yoga mat for beginners",          targetUrl: "/sports/yoga-mat-non-slip-6mm",             targetTitle: "Yoga Mat Non-Slip 6mm",          position: 11, prevPosition: 16, change: 5,  volume: 4600, difficulty: 58, ctr: 2.6, clicks30d: 359,  impressions30d: 13800, status: "tracking", tag: "informational", updatedAt: "2026-06-20" },
  { id: "kw_024", keyword: "home decor shop online dhaka",         targetUrl: "/home",                                     targetTitle: "Home & Living",                  position: 13, prevPosition: 12, change: -1, volume: 3200, difficulty: 62, ctr: 2.2, clicks30d: 211,  impressions30d: 9600,  status: "tracking", tag: "local",         updatedAt: "2026-06-20" },
  { id: "kw_025", keyword: "wireless charging pad fast charge",    targetUrl: "/electronics/wireless-charging-pad-15w",    targetTitle: "Wireless Charging Pad 15W",       position: 9,  prevPosition: 13, change: 4,  volume: 1560, difficulty: 49, ctr: 3.5, clicks30d: 164,  impressions30d: 4680,  status: "tracking", tag: "product",       updatedAt: "2026-06-20" },
  { id: "kw_026", keyword: "kitchen essentials online bd",         targetUrl: "/kitchen",                                  targetTitle: "Kitchen",                        position: 24, prevPosition: 27, change: 3,  volume: 2800, difficulty: 67, ctr: 1.1, clicks30d: 92,   impressions30d: 8400,  status: "tracking", tag: "category",      updatedAt: "2026-06-20" },
  { id: "kw_027", keyword: "sports equipment fitness store dhaka", targetUrl: "/sports",                                   targetTitle: "Sports & Fitness",               position: 8,  prevPosition: 9,  change: 1,  volume: 5100, difficulty: 58, ctr: 3.9, clicks30d: 596,  impressions30d: 15300, status: "tracking", tag: "local",         updatedAt: "2026-06-20" },
  { id: "kw_028", keyword: "ceramic coffee mug set gift",          targetUrl: "/kitchen/ceramic-coffee-mug-set",           targetTitle: "Ceramic Coffee Mug Set",          position: 16, prevPosition: 18, change: 2,  volume: 620,  difficulty: 27, ctr: 2.3, clicks30d: 43,   impressions30d: 1860,  status: "tracking", tag: "product",       updatedAt: "2026-06-20" },
  { id: "kw_029", keyword: "clothing brand bangladesh affordable", targetUrl: "/brands/urbanwear",                         targetTitle: "UrbanWear",                      position: 5,  prevPosition: 7,  change: 2,  volume: 6200, difficulty: 68, ctr: 4.7, clicks30d: 872,  impressions30d: 18600, status: "tracking", tag: "brand",         updatedAt: "2026-06-20" },
  { id: "kw_030", keyword: "anc earbuds review bangladesh",        targetUrl: "/electronics/wireless-earbuds-pro",         targetTitle: "Wireless Earbuds Pro",           position: 3,  prevPosition: 5,  change: 2,  volume: 1200, difficulty: 36, ctr: 8.2, clicks30d: 295,  impressions30d: 3600,  status: "tracking", tag: "informational", updatedAt: "2026-06-20" },
  { id: "kw_031", keyword: "linen summer dress women bd",          targetUrl: "/apparel/linen-summer-dress",               targetTitle: "Linen Summer Dress",             position: 28, prevPosition: 31, change: 3,  volume: 1900, difficulty: 44, ctr: 0.9, clicks30d: 51,   impressions30d: 5700,  status: "tracking", tag: "product",       updatedAt: "2026-06-20" },
  { id: "kw_032", keyword: "cotton jogger pants men online",       targetUrl: "/apparel/cotton-jogger-pants",              targetTitle: "Cotton Jogger Pants",            position: 33, prevPosition: 28, change: -5, volume: 1400, difficulty: 40, ctr: 0.7, clicks30d: 29,   impressions30d: 4200,  status: "tracking", tag: "product",       updatedAt: "2026-06-20" },
  { id: "kw_033", keyword: "rfid blocking wallet importance",      targetUrl: "/accessories/leather-wallet-slim-rfid",     targetTitle: "Leather Wallet Slim RFID",       position: 7,  prevPosition: 9,  change: 2,  volume: 2700, difficulty: 43, ctr: 4.4, clicks30d: 356,  impressions30d: 8100,  status: "tracking", tag: "informational", updatedAt: "2026-06-20" },
  { id: "kw_034", keyword: "purehome organic bedding bd",          targetUrl: "/brands/purehome",                         targetTitle: "PureHome",                       position: 11, prevPosition: 10, change: -1, volume: 430,  difficulty: 19, ctr: 3.1, clicks30d: 40,   impressions30d: 1290,  status: "tracking", tag: "brand",         updatedAt: "2026-06-20" },
  { id: "kw_035", keyword: "mechanical keyboard tkl price bd",     targetUrl: "/electronics/mechanical-keyboard-tkl",      targetTitle: "Mechanical Keyboard TKL",        position: 42, prevPosition: 38, change: -4, volume: 2100, difficulty: 66, ctr: 0.5, clicks30d: 31,   impressions30d: 6300,  status: "tracking", tag: "product",       updatedAt: "2026-06-20" },
  { id: "kw_036", keyword: "activelife sports bd",                 targetUrl: "/brands/activelife",                        targetTitle: "ActiveLife",                     position: 54, prevPosition: 49, change: -5, volume: 380,  difficulty: 21, ctr: 0.2, clicks30d: 3,    impressions30d: 1140,  status: "lost",     tag: "brand",         updatedAt: "2026-06-20" },
];

export const aiSeoSuggestions = [
  {
    title: "Bulk meta fix",
    body: "12 products missing meta title — AI can generate from product name + brand template",
  },
  {
    title: "Schema gap",
    body: "4 published products lack Product JSON-LD — run schema wizard",
  },
  {
    title: "Redirect opportunity",
    body: "404 spike on /shop/earbuds-old — redirect already exists, purge CDN cache",
  },
];

export const SEVERITY_LABELS: Record<SeoIssueSeverity, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const ENTITY_TYPE_LABELS: Record<SeoEntityType, string> = {
  product: "Product",
  category: "Category",
  brand: "Brand",
  page: "Page",
};

/* ─── URL Manager ──────────────────────────────────────────────────────────── */

export type UrlStatus = "active" | "redirect" | "noindex" | "draft";

export const URL_STATUS_LABELS: Record<UrlStatus, string> = {
  active:   "Active",
  redirect: "Redirect",
  noindex:  "No-index",
  draft:    "Draft",
};

export type UrlRecord = {
  id: string;
  entityType: SeoEntityType;
  title: string;
  slug: string;
  canonicalUrl: string;
  status: UrlStatus;
  indexable: boolean;
  redirectTo: string;
  updatedAt: string;
  views30d: number;
};

export const urlRecordsSeed: UrlRecord[] = [
  { id: "url_001", entityType: "product",  title: "Wireless Earbuds Pro",           slug: "/electronics/wireless-earbuds-pro",        canonicalUrl: "",                                     status: "active",   indexable: true,  redirectTo: "", updatedAt: "2026-06-18", views30d: 4820 },
  { id: "url_002", entityType: "product",  title: "Smart Watch Series 5",           slug: "/electronics/smart-watch-series-5",        canonicalUrl: "",                                     status: "active",   indexable: true,  redirectTo: "", updatedAt: "2026-06-17", views30d: 3210 },
  { id: "url_003", entityType: "category", title: "Electronics",                    slug: "/electronics",                             canonicalUrl: "",                                     status: "active",   indexable: true,  redirectTo: "", updatedAt: "2026-06-15", views30d: 9840 },
  { id: "url_004", entityType: "product",  title: "Premium Cotton T-Shirt",         slug: "/apparel/premium-cotton-t-shirt",          canonicalUrl: "",                                     status: "active",   indexable: true,  redirectTo: "", updatedAt: "2026-06-14", views30d: 2140 },
  { id: "url_005", entityType: "brand",    title: "UrbanWear",                      slug: "/brands/urbanwear",                        canonicalUrl: "",                                     status: "active",   indexable: true,  redirectTo: "", updatedAt: "2026-06-12", views30d: 1870 },
  { id: "url_006", entityType: "page",     title: "About Us",                       slug: "/about",                                   canonicalUrl: "",                                     status: "active",   indexable: true,  redirectTo: "", updatedAt: "2026-06-10", views30d: 640  },
  { id: "url_007", entityType: "product",  title: "Running Shoes Ultra",            slug: "/footwear/running-shoes-ultra",            canonicalUrl: "",                                     status: "active",   indexable: true,  redirectTo: "", updatedAt: "2026-06-18", views30d: 5530 },
  { id: "url_008", entityType: "category", title: "Apparel",                        slug: "/apparel",                                 canonicalUrl: "",                                     status: "noindex",  indexable: false, redirectTo: "", updatedAt: "2026-06-08", views30d: 320  },
  { id: "url_009", entityType: "page",     title: "Contact",                        slug: "/contact",                                 canonicalUrl: "",                                     status: "active",   indexable: true,  redirectTo: "", updatedAt: "2026-06-11", views30d: 920  },
  { id: "url_010", entityType: "product",  title: "Ceramic Coffee Mug Set",         slug: "/kitchen/ceramic-coffee-mug-set",          canonicalUrl: "",                                     status: "active",   indexable: true,  redirectTo: "", updatedAt: "2026-06-16", views30d: 1240 },
  { id: "url_011", entityType: "brand",    title: "GlowUp Beauty",                  slug: "/brands/glowup-beauty",                    canonicalUrl: "",                                     status: "active",   indexable: true,  redirectTo: "", updatedAt: "2026-06-14", views30d: 2980 },
  { id: "url_012", entityType: "page",     title: "Privacy Policy",                 slug: "/privacy",                                 canonicalUrl: "",                                     status: "noindex",  indexable: false, redirectTo: "", updatedAt: "2026-05-30", views30d: 180  },
  { id: "url_013", entityType: "product",  title: "USB-C Hub 7-in-1",               slug: "/electronics/usb-c-hub-7in1",              canonicalUrl: "",                                     status: "active",   indexable: true,  redirectTo: "", updatedAt: "2026-06-17", views30d: 3110 },
  { id: "url_014", entityType: "product",  title: "Mechanical Keyboard TKL",        slug: "/electronics/mechanical-keyboard-tkl",     canonicalUrl: "",                                     status: "draft",    indexable: false, redirectTo: "", updatedAt: "2026-06-19", views30d: 0    },
  { id: "url_015", entityType: "product",  title: "Bamboo Cutting Board Set",       slug: "/kitchen/bamboo-cutting-board-set",        canonicalUrl: "",                                     status: "active",   indexable: true,  redirectTo: "", updatedAt: "2026-06-13", views30d: 870  },
  { id: "url_016", entityType: "category", title: "Footwear",                       slug: "/footwear",                                canonicalUrl: "",                                     status: "active",   indexable: true,  redirectTo: "", updatedAt: "2026-06-15", views30d: 7200 },
  { id: "url_017", entityType: "product",  title: "Stainless Steel Water Bottle 1L",slug: "/kitchen/stainless-steel-water-bottle-1l", canonicalUrl: "",                                     status: "active",   indexable: true,  redirectTo: "", updatedAt: "2026-06-12", views30d: 1540 },
  { id: "url_018", entityType: "brand",    title: "TechNova",                       slug: "/brands/technova",                         canonicalUrl: "",                                     status: "active",   indexable: true,  redirectTo: "", updatedAt: "2026-06-10", views30d: 760  },
  { id: "url_019", entityType: "product",  title: "Yoga Mat Non-Slip 6mm",          slug: "/sports/yoga-mat-non-slip-6mm",            canonicalUrl: "",                                     status: "active",   indexable: true,  redirectTo: "", updatedAt: "2026-06-16", views30d: 2340 },
  { id: "url_020", entityType: "category", title: "Kitchen",                        slug: "/kitchen",                                 canonicalUrl: "",                                     status: "active",   indexable: true,  redirectTo: "", updatedAt: "2026-06-14", views30d: 4560 },
  { id: "url_021", entityType: "product",  title: "Denim Jacket Classic Fit",       slug: "/apparel/denim-jacket-classic-fit",        canonicalUrl: "",                                     status: "active",   indexable: true,  redirectTo: "", updatedAt: "2026-06-18", views30d: 1890 },
  { id: "url_022", entityType: "product",  title: "Portable Bluetooth Speaker IPX7",slug: "/electronics/portable-bluetooth-speaker-ipx7", canonicalUrl: "",                                 status: "active",   indexable: true,  redirectTo: "", updatedAt: "2026-06-17", views30d: 4100 },
  { id: "url_023", entityType: "page",     title: "Terms & Conditions",             slug: "/terms",                                   canonicalUrl: "",                                     status: "noindex",  indexable: false, redirectTo: "", updatedAt: "2026-05-28", views30d: 210  },
  { id: "url_024", entityType: "brand",    title: "ActiveLife",                     slug: "/brands/activelife",                       canonicalUrl: "",                                     status: "draft",    indexable: false, redirectTo: "", updatedAt: "2026-06-19", views30d: 0    },
  { id: "url_025", entityType: "product",  title: "Linen Summer Dress",             slug: "/apparel/linen-summer-dress",              canonicalUrl: "",                                     status: "active",   indexable: true,  redirectTo: "", updatedAt: "2026-06-15", views30d: 2670 },
  { id: "url_026", entityType: "product",  title: "Air Purifier HEPA H13",          slug: "/home/air-purifier-hepa-h13",              canonicalUrl: "",                                     status: "active",   indexable: true,  redirectTo: "", updatedAt: "2026-06-16", views30d: 3880 },
  { id: "url_027", entityType: "category", title: "Sports & Fitness",               slug: "/sports",                                  canonicalUrl: "",                                     status: "active",   indexable: true,  redirectTo: "", updatedAt: "2026-06-13", views30d: 5430 },
  { id: "url_028", entityType: "product",  title: "Leather Wallet Slim RFID",       slug: "/accessories/leather-wallet-slim-rfid",    canonicalUrl: "",                                     status: "active",   indexable: true,  redirectTo: "", updatedAt: "2026-06-17", views30d: 1760 },
  { id: "url_029", entityType: "page",     title: "FAQ",                            slug: "/faq",                                     canonicalUrl: "",                                     status: "active",   indexable: true,  redirectTo: "", updatedAt: "2026-06-11", views30d: 1130 },
  { id: "url_030", entityType: "product",  title: "4K Webcam 60fps Autofocus",      slug: "/electronics/4k-webcam-60fps-autofocus",   canonicalUrl: "",                                     status: "active",   indexable: true,  redirectTo: "", updatedAt: "2026-06-15", views30d: 2230 },
  { id: "url_031", entityType: "category", title: "Home & Living",                  slug: "/home",                                    canonicalUrl: "",                                     status: "active",   indexable: true,  redirectTo: "", updatedAt: "2026-06-14", views30d: 6120 },
  { id: "url_032", entityType: "product",  title: "Resistance Bands Set (5-pack)",  slug: "/sports/resistance-bands-set-5pack",       canonicalUrl: "",                                     status: "active",   indexable: true,  redirectTo: "", updatedAt: "2026-06-13", views30d: 1420 },
  { id: "url_033", entityType: "brand",    title: "PureHome",                       slug: "/brands/purehome",                         canonicalUrl: "",                                     status: "active",   indexable: true,  redirectTo: "", updatedAt: "2026-06-12", views30d: 640  },
  { id: "url_034", entityType: "product",  title: "Smart LED Strip Lights 5m",      slug: "/home/smart-led-strip-lights-5m",          canonicalUrl: "",                                     status: "active",   indexable: true,  redirectTo: "", updatedAt: "2026-06-18", views30d: 2890 },
  { id: "url_035", entityType: "product",  title: "Noise Cancelling Headphones",    slug: "/electronics/noise-cancelling-headphones", canonicalUrl: "",                                     status: "active",   indexable: true,  redirectTo: "", updatedAt: "2026-06-17", views30d: 5710 },
  { id: "url_036", entityType: "page",     title: "Return Policy",                  slug: "/returns",                                 canonicalUrl: "",                                     status: "active",   indexable: true,  redirectTo: "", updatedAt: "2026-06-10", views30d: 890  },
  { id: "url_037", entityType: "product",  title: "Wireless Charging Pad 15W",      slug: "/electronics/wireless-charging-pad-15w",   canonicalUrl: "",                                     status: "active",   indexable: true,  redirectTo: "", updatedAt: "2026-06-18", views30d: 3340 },
  { id: "url_038", entityType: "product",  title: "Earbuds Old",                    slug: "/shop/earbuds-old",                        canonicalUrl: "",                                     status: "redirect",  indexable: false, redirectTo: "/electronics/wireless-earbuds-pro", updatedAt: "2026-06-10", views30d: 842 },
  { id: "url_039", entityType: "category", title: "Phones (old)",                   slug: "/category/phones",                         canonicalUrl: "",                                     status: "redirect",  indexable: false, redirectTo: "/electronics/phones",                updatedAt: "2026-06-05", views30d: 1204 },
  { id: "url_040", entityType: "page",     title: "Summer Sale 2025",               slug: "/summer-sale-2025",                        canonicalUrl: "",                                     status: "redirect",  indexable: false, redirectTo: "/collections/summer-sale-2026",      updatedAt: "2026-06-01", views30d: 96   },
  { id: "url_041", entityType: "product",  title: "Discontinued Product X",         slug: "/discontinued-product-x",                  canonicalUrl: "",                                     status: "redirect",  indexable: false, redirectTo: "/electronics",                       updatedAt: "2026-05-28", views30d: 38   },
  { id: "url_042", entityType: "product",  title: "Cotton Jogger Pants",            slug: "/apparel/cotton-jogger-pants",             canonicalUrl: "",                                     status: "active",   indexable: true,  redirectTo: "", updatedAt: "2026-06-16", views30d: 1630 },
];

/* ─── Backlinks ────────────────────────────────────────────────────────────── */

export type BacklinkType = "dofollow" | "nofollow" | "ugc" | "sponsored";
export type AnchorType   = "branded" | "exact" | "partial" | "generic" | "naked" | "image";

export const domainOverview = {
  domain:            "urbanwear.com",
  domainAuthority:   38,
  domainRating:      41,
  pageRank:          4,
  spamScore:         3,
  totalBacklinks:    2840,
  referringDomains:  186,
  dofollowLinks:     2140,
  nofollowLinks:     700,
  newLinks30d:       42,
  lostLinks30d:      18,
  organicTraffic:    28400,
  lastUpdated:       "2026-06-20",
};

export const competitorComparison = [
  { domain: "urbanwear.com",    da: 38, dr: 41, backlinks: 2840, referringDomains: 186,  traffic: 28400,  highlight: true  },
  { domain: "dhakafashion.com", da: 44, dr: 47, backlinks: 4120, referringDomains: 298,  traffic: 41200,  highlight: false },
  { domain: "shopbd.com",       da: 52, dr: 55, backlinks: 8640, referringDomains: 572,  traffic: 96000,  highlight: false },
  { domain: "fashionbd.net",    da: 31, dr: 34, backlinks: 1240, referringDomains: 98,   traffic: 14800,  highlight: false },
  { domain: "trendzbd.com",     da: 27, dr: 29, backlinks: 840,  referringDomains: 64,   traffic: 8600,   highlight: false },
];

export const anchorDistribution = [
  { type: "branded"  as AnchorType, label: "Branded",   count: 1120, pct: 39, color: "bg-blue-500"    },
  { type: "naked"    as AnchorType, label: "Naked URL",  count: 682,  pct: 24, color: "bg-slate-400"   },
  { type: "generic"  as AnchorType, label: "Generic",    count: 512,  pct: 18, color: "bg-violet-400"  },
  { type: "partial"  as AnchorType, label: "Partial",    count: 341,  pct: 12, color: "bg-amber-400"   },
  { type: "exact"    as AnchorType, label: "Exact match",count: 142,  pct: 5,  color: "bg-emerald-500" },
  { type: "image"    as AnchorType, label: "Image",      count: 43,   pct: 2,  color: "bg-rose-400"    },
];

export type ReferringDomain = {
  id: string;
  domain: string;
  da: number;
  dr: number;
  backlinks: number;
  dofollowLinks: number;
  firstSeen: string;
  lastSeen: string;
  type: BacklinkType;
  category: string;
  lost: boolean;
};

export const referringDomainsSeed: ReferringDomain[] = [
  { id: "rd_001", domain: "prothomalo.com",      da: 68, dr: 72, backlinks: 14, dofollowLinks: 14, firstSeen: "2025-03-12", lastSeen: "2026-06-18", type: "dofollow",  category: "News",       lost: false },
  { id: "rd_002", domain: "techshohor.com",      da: 52, dr: 49, backlinks: 8,  dofollowLinks: 8,  firstSeen: "2025-06-04", lastSeen: "2026-06-15", type: "dofollow",  category: "Tech Blog",  lost: false },
  { id: "rd_003", domain: "bdnews24.com",        da: 71, dr: 74, backlinks: 6,  dofollowLinks: 0,  firstSeen: "2025-08-20", lastSeen: "2026-06-10", type: "nofollow",  category: "News",       lost: false },
  { id: "rd_004", domain: "fashionforward.blog", da: 34, dr: 31, backlinks: 22, dofollowLinks: 22, firstSeen: "2025-01-08", lastSeen: "2026-06-19", type: "dofollow",  category: "Fashion",    lost: false },
  { id: "rd_005", domain: "bangladeshbrand.net", da: 41, dr: 38, backlinks: 11, dofollowLinks: 11, firstSeen: "2025-04-17", lastSeen: "2026-06-17", type: "dofollow",  category: "Business",   lost: false },
  { id: "rd_006", domain: "youtube.com",         da: 100,dr: 100,backlinks: 3,  dofollowLinks: 0,  firstSeen: "2025-09-01", lastSeen: "2026-06-12", type: "ugc",       category: "Video",      lost: false },
  { id: "rd_007", domain: "pinterest.com",       da: 94, dr: 96, backlinks: 18, dofollowLinks: 0,  firstSeen: "2025-02-14", lastSeen: "2026-06-20", type: "nofollow",  category: "Social",     lost: false },
  { id: "rd_008", domain: "reddit.com",          da: 91, dr: 93, backlinks: 7,  dofollowLinks: 0,  firstSeen: "2025-10-30", lastSeen: "2026-05-28", type: "ugc",       category: "Community",  lost: false },
  { id: "rd_009", domain: "ecommercetips.bd",    da: 28, dr: 25, backlinks: 34, dofollowLinks: 34, firstSeen: "2024-11-22", lastSeen: "2026-06-18", type: "dofollow",  category: "Blog",       lost: false },
  { id: "rd_010", domain: "dhakacoupon.com",     da: 31, dr: 28, backlinks: 9,  dofollowLinks: 9,  firstSeen: "2025-05-09", lastSeen: "2026-06-14", type: "dofollow",  category: "Coupons",    lost: false },
  { id: "rd_011", domain: "lifestylemag.com.bd", da: 45, dr: 42, backlinks: 16, dofollowLinks: 16, firstSeen: "2025-07-03", lastSeen: "2026-06-16", type: "dofollow",  category: "Lifestyle",  lost: false },
  { id: "rd_012", domain: "reviewsbd.net",       da: 22, dr: 19, backlinks: 41, dofollowLinks: 41, firstSeen: "2024-09-15", lastSeen: "2026-06-19", type: "dofollow",  category: "Reviews",    lost: false },
  { id: "rd_013", domain: "facebook.com",        da: 100,dr: 100,backlinks: 124,dofollowLinks: 0,  firstSeen: "2024-08-01", lastSeen: "2026-06-20", type: "nofollow",  category: "Social",     lost: false },
  { id: "rd_014", domain: "instagram.com",       da: 93, dr: 95, backlinks: 87, dofollowLinks: 0,  firstSeen: "2024-08-01", lastSeen: "2026-06-20", type: "nofollow",  category: "Social",     lost: false },
  { id: "rd_015", domain: "techmag.com.bd",      da: 38, dr: 35, backlinks: 12, dofollowLinks: 12, firstSeen: "2025-12-11", lastSeen: "2026-06-13", type: "dofollow",  category: "Tech Blog",  lost: false },
  { id: "rd_016", domain: "sportsbangla.net",    da: 29, dr: 26, backlinks: 19, dofollowLinks: 19, firstSeen: "2025-03-28", lastSeen: "2026-06-17", type: "dofollow",  category: "Sports",     lost: false },
  { id: "rd_017", domain: "giftideasbd.com",     da: 18, dr: 15, backlinks: 5,  dofollowLinks: 5,  firstSeen: "2025-11-14", lastSeen: "2026-04-30", type: "dofollow",  category: "Gifts",      lost: true  },
  { id: "rd_018", domain: "localguide.dhaka",    da: 24, dr: 21, backlinks: 3,  dofollowLinks: 3,  firstSeen: "2025-08-07", lastSeen: "2026-03-15", type: "dofollow",  category: "Local",      lost: true  },
  { id: "rd_019", domain: "couponmama.bd",       da: 20, dr: 17, backlinks: 7,  dofollowLinks: 7,  firstSeen: "2025-06-20", lastSeen: "2026-02-28", type: "dofollow",  category: "Coupons",    lost: true  },
  { id: "rd_020", domain: "homegarden.com.bd",   da: 33, dr: 30, backlinks: 9,  dofollowLinks: 9,  firstSeen: "2025-01-30", lastSeen: "2026-06-19", type: "dofollow",  category: "Home",       lost: false },
  { id: "rd_021", domain: "fitnessblog.bd",      da: 26, dr: 23, backlinks: 14, dofollowLinks: 14, firstSeen: "2025-09-18", lastSeen: "2026-06-15", type: "dofollow",  category: "Fitness",    lost: false },
  { id: "rd_022", domain: "twitter.com",         da: 95, dr: 97, backlinks: 31, dofollowLinks: 0,  firstSeen: "2024-10-01", lastSeen: "2026-06-18", type: "nofollow",  category: "Social",     lost: false },
  { id: "rd_023", domain: "pressreleasehub.bd",  da: 36, dr: 33, backlinks: 6,  dofollowLinks: 6,  firstSeen: "2025-04-02", lastSeen: "2026-06-11", type: "dofollow",  category: "PR",         lost: false },
  { id: "rd_024", domain: "shopguide.com.bd",    da: 19, dr: 16, backlinks: 28, dofollowLinks: 28, firstSeen: "2024-12-05", lastSeen: "2026-06-16", type: "dofollow",  category: "Shopping",   lost: false },
  { id: "rd_025", domain: "skincaretips.bd",     da: 23, dr: 20, backlinks: 11, dofollowLinks: 11, firstSeen: "2025-07-22", lastSeen: "2026-06-14", type: "dofollow",  category: "Beauty",     lost: false },
];

export type BacklinkRecord = {
  id: string;
  sourceUrl: string;
  sourceDomain: string;
  sourceDa: number;
  targetUrl: string;
  anchorText: string;
  anchorType: AnchorType;
  type: BacklinkType;
  firstSeen: string;
  lastSeen: string;
  lost: boolean;
};

export const backlinksSeed: BacklinkRecord[] = [
  { id: "bl_001", sourceUrl: "https://prothomalo.com/lifestyle/fashion-bd-2026",         sourceDomain: "prothomalo.com",      sourceDa: 68, targetUrl: "/",                                  anchorText: "UrbanWear",                       anchorType: "branded", type: "dofollow", firstSeen: "2025-03-12", lastSeen: "2026-06-18", lost: false },
  { id: "bl_002", sourceUrl: "https://techshohor.com/best-earbuds-bangladesh",           sourceDomain: "techshohor.com",      sourceDa: 52, targetUrl: "/electronics/wireless-earbuds-pro",  anchorText: "Wireless Earbuds Pro",            anchorType: "partial", type: "dofollow", firstSeen: "2025-06-04", lastSeen: "2026-06-15", lost: false },
  { id: "bl_003", sourceUrl: "https://fashionforward.blog/bd-fashion-shops-2026",        sourceDomain: "fashionforward.blog", sourceDa: 34, targetUrl: "/",                                  anchorText: "urbanwear.com",                   anchorType: "naked",   type: "dofollow", firstSeen: "2025-01-08", lastSeen: "2026-06-19", lost: false },
  { id: "bl_004", sourceUrl: "https://ecommercetips.bd/top-clothing-stores",             sourceDomain: "ecommercetips.bd",    sourceDa: 28, targetUrl: "/brands/urbanwear",                  anchorText: "UrbanWear Fashion",               anchorType: "branded", type: "dofollow", firstSeen: "2024-11-22", lastSeen: "2026-06-18", lost: false },
  { id: "bl_005", sourceUrl: "https://reviewsbd.net/running-shoes-review-2026",          sourceDomain: "reviewsbd.net",       sourceDa: 22, targetUrl: "/footwear/running-shoes-ultra",      anchorText: "Running Shoes Ultra review",      anchorType: "exact",   type: "dofollow", firstSeen: "2026-01-14", lastSeen: "2026-06-19", lost: false },
  { id: "bl_006", sourceUrl: "https://lifestylemag.com.bd/home-appliances-bd",          sourceDomain: "lifestylemag.com.bd", sourceDa: 45, targetUrl: "/home/air-purifier-hepa-h13",        anchorText: "best air purifier Bangladesh",    anchorType: "exact",   type: "dofollow", firstSeen: "2025-07-03", lastSeen: "2026-06-16", lost: false },
  { id: "bl_007", sourceUrl: "https://bdnews24.com/business/ecommerce-growth-2026",      sourceDomain: "bdnews24.com",        sourceDa: 71, targetUrl: "/",                                  anchorText: "UrbanWear",                       anchorType: "branded", type: "nofollow", firstSeen: "2025-08-20", lastSeen: "2026-06-10", lost: false },
  { id: "bl_008", sourceUrl: "https://bangladeshbrand.net/top-brands-2026",              sourceDomain: "bangladeshbrand.net", sourceDa: 41, targetUrl: "/brands/urbanwear",                  anchorText: "click here",                      anchorType: "generic", type: "dofollow", firstSeen: "2025-04-17", lastSeen: "2026-06-17", lost: false },
  { id: "bl_009", sourceUrl: "https://sportsbangla.net/yoga-equipment-guide",            sourceDomain: "sportsbangla.net",    sourceDa: 29, targetUrl: "/sports/yoga-mat-non-slip-6mm",      anchorText: "Non-Slip Yoga Mat",               anchorType: "partial", type: "dofollow", firstSeen: "2025-03-28", lastSeen: "2026-06-17", lost: false },
  { id: "bl_010", sourceUrl: "https://dhakacoupon.com/urbanwear-discount-code",          sourceDomain: "dhakacoupon.com",     sourceDa: 31, targetUrl: "/",                                  anchorText: "https://urbanwear.com",           anchorType: "naked",   type: "dofollow", firstSeen: "2025-05-09", lastSeen: "2026-06-14", lost: false },
  { id: "bl_011", sourceUrl: "https://reviewsbd.net/noise-cancelling-headphones-bd",     sourceDomain: "reviewsbd.net",       sourceDa: 22, targetUrl: "/electronics/noise-cancelling-headphones", anchorText: "Noise Cancelling Headphones", anchorType: "exact", type: "dofollow", firstSeen: "2025-10-11", lastSeen: "2026-06-19", lost: false },
  { id: "bl_012", sourceUrl: "https://techmag.com.bd/best-webcam-2026",                 sourceDomain: "techmag.com.bd",      sourceDa: 38, targetUrl: "/electronics/4k-webcam-60fps-autofocus", anchorText: "shop now",                    anchorType: "generic", type: "dofollow", firstSeen: "2025-12-11", lastSeen: "2026-06-13", lost: false },
  { id: "bl_013", sourceUrl: "https://fitnessblog.bd/resistance-bands-workout",          sourceDomain: "fitnessblog.bd",      sourceDa: 26, targetUrl: "/sports/resistance-bands-set-5pack", anchorText: "resistance bands set BD",        anchorType: "partial", type: "dofollow", firstSeen: "2025-09-18", lastSeen: "2026-06-15", lost: false },
  { id: "bl_014", sourceUrl: "https://skincaretips.bd/glowup-beauty-products",          sourceDomain: "skincaretips.bd",     sourceDa: 23, targetUrl: "/brands/glowup-beauty",              anchorText: "GlowUp Beauty",                   anchorType: "branded", type: "dofollow", firstSeen: "2025-07-22", lastSeen: "2026-06-14", lost: false },
  { id: "bl_015", sourceUrl: "https://shopguide.com.bd/kitchen-products-online",         sourceDomain: "shopguide.com.bd",    sourceDa: 19, targetUrl: "/kitchen",                           anchorText: "kitchen accessories online",      anchorType: "partial", type: "dofollow", firstSeen: "2024-12-05", lastSeen: "2026-06-16", lost: false },
  { id: "bl_016", sourceUrl: "https://pressreleasehub.bd/urbanwear-expands-2026",       sourceDomain: "pressreleasehub.bd",  sourceDa: 36, targetUrl: "/",                                  anchorText: "UrbanWear",                       anchorType: "branded", type: "dofollow", firstSeen: "2025-04-02", lastSeen: "2026-06-11", lost: false },
  { id: "bl_017", sourceUrl: "https://homegarden.com.bd/best-air-purifiers",             sourceDomain: "homegarden.com.bd",   sourceDa: 33, targetUrl: "/home/air-purifier-hepa-h13",        anchorText: "UrbanWear Air Purifier",          anchorType: "branded", type: "dofollow", firstSeen: "2025-01-30", lastSeen: "2026-06-19", lost: false },
  { id: "bl_018", sourceUrl: "https://giftideasbd.com/best-gift-ideas-bd",              sourceDomain: "giftideasbd.com",     sourceDa: 18, targetUrl: "/kitchen/ceramic-coffee-mug-set",    anchorText: "ceramic mug set gift",            anchorType: "partial", type: "dofollow", firstSeen: "2025-11-14", lastSeen: "2026-04-30", lost: true  },
  { id: "bl_019", sourceUrl: "https://localguide.dhaka/fashion-shopping",               sourceDomain: "localguide.dhaka",    sourceDa: 24, targetUrl: "/",                                  anchorText: "UrbanWear store",                 anchorType: "branded", type: "dofollow", firstSeen: "2025-08-07", lastSeen: "2026-03-15", lost: true  },
  { id: "bl_020", sourceUrl: "https://couponmama.bd/discount-codes-june-2026",          sourceDomain: "couponmama.bd",       sourceDa: 20, targetUrl: "/",                                  anchorText: "urbanwear.com",                   anchorType: "naked",   type: "dofollow", firstSeen: "2025-06-20", lastSeen: "2026-02-28", lost: true  },
];

/* ─── Redirects ────────────────────────────────────────────────────────────── */

export type RedirectType   = "301" | "302" | "307" | "308" | "410";
export type RedirectStatus = "active" | "draft" | "disabled";

export type RedirectRule = {
  id: string;
  from: string;
  to: string;
  type: RedirectType;
  status: RedirectStatus;
  hits30d: number;
  createdAt: string;
  updatedAt: string;
  note?: string;
};

export const redirectRulesSeed: RedirectRule[] = [
  { id: "rdr_001", from: "/old-home",                          to: "/",                                      type: "301", status: "active",   hits30d: 3204, createdAt: "2024-08-01", updatedAt: "2025-01-10", note: "Homepage redesign migration" },
  { id: "rdr_002", from: "/products",                          to: "/catalog",                               type: "301", status: "active",   hits30d: 1840, createdAt: "2024-08-01", updatedAt: "2025-01-10" },
  { id: "rdr_003", from: "/shop",                              to: "/catalog",                               type: "301", status: "active",   hits30d: 926,  createdAt: "2024-08-01", updatedAt: "2025-01-10" },
  { id: "rdr_004", from: "/men",                               to: "/catalog?gender=men",                    type: "301", status: "active",   hits30d: 712,  createdAt: "2024-09-15", updatedAt: "2025-02-20" },
  { id: "rdr_005", from: "/women",                             to: "/catalog?gender=women",                  type: "301", status: "active",   hits30d: 684,  createdAt: "2024-09-15", updatedAt: "2025-02-20" },
  { id: "rdr_006", from: "/sale",                              to: "/catalog?tag=sale",                      type: "302", status: "active",   hits30d: 1122, createdAt: "2025-03-01", updatedAt: "2026-06-01", note: "Seasonal sale — 302 intentional" },
  { id: "rdr_007", from: "/summer-sale",                       to: "/catalog?tag=sale",                      type: "302", status: "active",   hits30d: 540,  createdAt: "2025-06-01", updatedAt: "2026-06-01" },
  { id: "rdr_008", from: "/about-us",                          to: "/about",                                 type: "301", status: "active",   hits30d: 391,  createdAt: "2024-10-12", updatedAt: "2024-10-12" },
  { id: "rdr_009", from: "/contact-us",                        to: "/contact",                               type: "301", status: "active",   hits30d: 280,  createdAt: "2024-10-12", updatedAt: "2024-10-12" },
  { id: "rdr_010", from: "/apparel/summer-tees",               to: "/apparel/t-shirts",                      type: "301", status: "active",   hits30d: 488,  createdAt: "2025-04-01", updatedAt: "2025-04-01" },
  { id: "rdr_011", from: "/apparel/winter-jackets",            to: "/apparel/jackets",                       type: "301", status: "active",   hits30d: 205,  createdAt: "2024-11-01", updatedAt: "2024-11-01" },
  { id: "rdr_012", from: "/electronics/phones",                to: "/electronics/smartphones",               type: "301", status: "active",   hits30d: 318,  createdAt: "2025-01-15", updatedAt: "2025-01-15" },
  { id: "rdr_013", from: "/blog/post-1",                       to: "/blog/how-to-style-casual-wear",         type: "301", status: "active",   hits30d: 144,  createdAt: "2025-02-08", updatedAt: "2025-02-08" },
  { id: "rdr_014", from: "/brand/nike",                        to: "/brands/nike",                           type: "301", status: "active",   hits30d: 92,   createdAt: "2025-03-22", updatedAt: "2025-03-22" },
  { id: "rdr_015", from: "/brand/adidas",                      to: "/brands/adidas",                         type: "301", status: "active",   hits30d: 87,   createdAt: "2025-03-22", updatedAt: "2025-03-22" },
  { id: "rdr_016", from: "/promo/flash",                       to: "/catalog?tag=flash-sale",                type: "302", status: "disabled", hits30d: 0,    createdAt: "2025-05-10", updatedAt: "2026-05-15", note: "Flash sale ended" },
  { id: "rdr_017", from: "/promo/winter2025",                  to: "/catalog?tag=winter",                    type: "302", status: "disabled", hits30d: 0,    createdAt: "2024-12-01", updatedAt: "2025-01-10", note: "Winter promo expired" },
  { id: "rdr_018", from: "/deleted-product-xyz",               to: "",                                       type: "410", status: "active",   hits30d: 23,   createdAt: "2025-06-01", updatedAt: "2025-06-01", note: "Product discontinued — return 410 Gone" },
  { id: "rdr_019", from: "/old-category/accessories",          to: "/accessories",                           type: "301", status: "draft",    hits30d: 0,    createdAt: "2026-06-18", updatedAt: "2026-06-18", note: "Pending review before activation" },
  { id: "rdr_020", from: "/footwear/old-sneakers",             to: "/footwear/sneakers",                     type: "301", status: "active",   hits30d: 176,  createdAt: "2025-07-01", updatedAt: "2025-07-01" },
  { id: "rdr_021", from: "/home-page",                         to: "/",                                      type: "301", status: "active",   hits30d: 58,   createdAt: "2024-08-05", updatedAt: "2024-08-05" },
  { id: "rdr_022", from: "/apparel/tshirt",                    to: "/apparel/t-shirts",                      type: "301", status: "active",   hits30d: 312,  createdAt: "2025-01-20", updatedAt: "2025-01-20" },
  { id: "rdr_023", from: "/kitchen/mugs",                      to: "/kitchen/ceramic-coffee-mug-set",        type: "301", status: "active",   hits30d: 94,   createdAt: "2025-09-11", updatedAt: "2025-09-11" },
  { id: "rdr_024", from: "/sports/yoga",                       to: "/sports/yoga-mat-non-slip-6mm",          type: "301", status: "active",   hits30d: 131,  createdAt: "2025-05-14", updatedAt: "2025-05-14" },
  { id: "rdr_025", from: "/staging-test-page",                 to: "/",                                      type: "302", status: "disabled", hits30d: 0,    createdAt: "2025-11-02", updatedAt: "2026-01-10", note: "Leftover staging redirect" },
];

/* ─── Schema ───────────────────────────────────────────────────────────────── */

export type SchemaMarkupType = "Product" | "BreadcrumbList" | "Organization" | "WebSite" | "FAQPage" | "Article" | "LocalBusiness" | "Review" | "CollectionPage";
export type SchemaStatus = "active" | "draft" | "error" | "warning";

export type SchemaRecord = {
  id: string;
  name: string;
  type: SchemaMarkupType;
  scope: "global" | "page" | "template";
  appliedTo: string;
  status: SchemaStatus;
  validationErrors: number;
  validationWarnings: number;
  lastValidated: string;
  updatedAt: string;
};

/* ─── Sitemap ──────────────────────────────────────────────────────────────── */

export type SitemapChangefreq = "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
export type SitemapFileStatus = "ok" | "warning" | "error";

export type SitemapFile = {
  id: string;
  name: string;
  path: string;
  urlCount: number;
  lastGenerated: string;
  fileSize: string;
  status: SitemapFileStatus;
  statusNote?: string;
  includesImages: boolean;
};

export type SitemapUrl = {
  id: string;
  loc: string;
  lastmod: string;
  changefreq: SitemapChangefreq;
  priority: number;
  sitemapFile: string;
  hasImage: boolean;
  indexable: boolean;
};

export const sitemapIndex: { lastGenerated: string; totalUrls: number; totalFiles: number; submitStatus: "submitted" | "pending" | "error"; lastSubmitted: string } = {
  lastGenerated: "2026-06-20 06:00",
  totalUrls:     1842,
  totalFiles:    6,
  submitStatus:  "submitted",
  lastSubmitted: "2026-06-20 06:05",
};

export const sitemapFilesSeed: SitemapFile[] = [
  { id: "sm_001", name: "Main Sitemap",      path: "/sitemap.xml",           urlCount: 48,   lastGenerated: "2026-06-20 06:00", fileSize: "12 KB", status: "ok",      includesImages: false },
  { id: "sm_002", name: "Products",          path: "/sitemap-products.xml",  urlCount: 1186, lastGenerated: "2026-06-20 06:01", fileSize: "284 KB", status: "ok",     includesImages: true  },
  { id: "sm_003", name: "Categories",        path: "/sitemap-categories.xml",urlCount: 84,   lastGenerated: "2026-06-20 06:01", fileSize: "22 KB", status: "ok",      includesImages: false },
  { id: "sm_004", name: "Blog / Articles",   path: "/sitemap-blog.xml",      urlCount: 142,  lastGenerated: "2026-06-20 06:02", fileSize: "36 KB", status: "warning", statusNote: "18 articles missing lastmod date", includesImages: true },
  { id: "sm_005", name: "Brand Pages",       path: "/sitemap-brands.xml",    urlCount: 62,   lastGenerated: "2026-06-20 06:02", fileSize: "14 KB", status: "ok",      includesImages: false },
  { id: "sm_006", name: "Static Pages",      path: "/sitemap-pages.xml",     urlCount: 320,  lastGenerated: "2026-06-19 06:00", fileSize: "9 KB",  status: "error",   statusNote: "4 URLs return 404 — remove or fix", includesImages: false },
];

export const sitemapUrlsSeed: SitemapUrl[] = [
  { id: "su_001", loc: "/",                                     lastmod: "2026-06-20", changefreq: "daily",   priority: 1.0,  sitemapFile: "sm_001", hasImage: false, indexable: true },
  { id: "su_002", loc: "/catalog",                              lastmod: "2026-06-19", changefreq: "daily",   priority: 0.9,  sitemapFile: "sm_001", hasImage: false, indexable: true },
  { id: "su_003", loc: "/about",                                lastmod: "2026-04-10", changefreq: "monthly", priority: 0.6,  sitemapFile: "sm_001", hasImage: false, indexable: true },
  { id: "su_004", loc: "/contact",                              lastmod: "2026-03-01", changefreq: "monthly", priority: 0.5,  sitemapFile: "sm_001", hasImage: false, indexable: true },
  { id: "su_005", loc: "/help/shipping",                        lastmod: "2026-05-14", changefreq: "monthly", priority: 0.6,  sitemapFile: "sm_001", hasImage: false, indexable: true },
  { id: "su_006", loc: "/help/returns",                         lastmod: "2026-05-14", changefreq: "monthly", priority: 0.6,  sitemapFile: "sm_001", hasImage: false, indexable: true },
  { id: "su_007", loc: "/electronics/smart-watch-series-5",     lastmod: "2026-06-18", changefreq: "weekly",  priority: 0.8,  sitemapFile: "sm_002", hasImage: true,  indexable: true },
  { id: "su_008", loc: "/electronics/wireless-earbuds-pro",     lastmod: "2026-06-17", changefreq: "weekly",  priority: 0.8,  sitemapFile: "sm_002", hasImage: true,  indexable: true },
  { id: "su_009", loc: "/apparel/premium-cotton-t-shirt",       lastmod: "2026-06-15", changefreq: "weekly",  priority: 0.7,  sitemapFile: "sm_002", hasImage: true,  indexable: true },
  { id: "su_010", loc: "/apparel/slim-fit-chino-pants",         lastmod: "2026-06-14", changefreq: "weekly",  priority: 0.7,  sitemapFile: "sm_002", hasImage: true,  indexable: true },
  { id: "su_011", loc: "/footwear/running-shoes-ultra",         lastmod: "2026-06-16", changefreq: "weekly",  priority: 0.8,  sitemapFile: "sm_002", hasImage: true,  indexable: true },
  { id: "su_012", loc: "/electronics",                          lastmod: "2026-06-20", changefreq: "daily",   priority: 0.85, sitemapFile: "sm_003", hasImage: false, indexable: true },
  { id: "su_013", loc: "/apparel",                              lastmod: "2026-06-18", changefreq: "daily",   priority: 0.85, sitemapFile: "sm_003", hasImage: false, indexable: true },
  { id: "su_014", loc: "/footwear",                             lastmod: "2026-06-15", changefreq: "daily",   priority: 0.8,  sitemapFile: "sm_003", hasImage: false, indexable: true },
  { id: "su_015", loc: "/sports",                               lastmod: "2026-06-10", changefreq: "daily",   priority: 0.75, sitemapFile: "sm_003", hasImage: false, indexable: true },
  { id: "su_016", loc: "/blog/how-to-style-casual-wear",        lastmod: "2026-06-12", changefreq: "monthly", priority: 0.6,  sitemapFile: "sm_004", hasImage: true,  indexable: true },
  { id: "su_017", loc: "/blog/top-10-running-shoes-2026",       lastmod: "2026-05-28", changefreq: "monthly", priority: 0.6,  sitemapFile: "sm_004", hasImage: true,  indexable: true },
  { id: "su_018", loc: "/blog/smart-home-gadgets-guide",        lastmod: "2026-04-15", changefreq: "monthly", priority: 0.55, sitemapFile: "sm_004", hasImage: false, indexable: true },
  { id: "su_019", loc: "/brands/nike",                          lastmod: "2026-06-01", changefreq: "weekly",  priority: 0.7,  sitemapFile: "sm_005", hasImage: false, indexable: true },
  { id: "su_020", loc: "/brands/adidas",                        lastmod: "2026-06-01", changefreq: "weekly",  priority: 0.7,  sitemapFile: "sm_005", hasImage: false, indexable: true },
];

export const schemaSeed: SchemaRecord[] = [
  { id: "sch_001", name: "Organization",        type: "Organization",    scope: "global",   appliedTo: "All pages",               status: "active",  validationErrors: 0, validationWarnings: 0, lastValidated: "2026-06-20", updatedAt: "2026-05-01" },
  { id: "sch_002", name: "WebSite + Sitelinks", type: "WebSite",         scope: "global",   appliedTo: "Homepage",                status: "active",  validationErrors: 0, validationWarnings: 1, lastValidated: "2026-06-20", updatedAt: "2026-04-14" },
  { id: "sch_003", name: "Product Schema",       type: "Product",         scope: "template", appliedTo: "All product pages (486)", status: "active",  validationErrors: 0, validationWarnings: 3, lastValidated: "2026-06-20", updatedAt: "2026-06-15" },
  { id: "sch_004", name: "Breadcrumbs",          type: "BreadcrumbList",  scope: "template", appliedTo: "All pages",               status: "active",  validationErrors: 0, validationWarnings: 0, lastValidated: "2026-06-20", updatedAt: "2026-03-10" },
  { id: "sch_005", name: "FAQ — Shipping",       type: "FAQPage",         scope: "page",     appliedTo: "/help/shipping",          status: "active",  validationErrors: 0, validationWarnings: 0, lastValidated: "2026-06-19", updatedAt: "2026-02-28" },
  { id: "sch_006", name: "FAQ — Returns",        type: "FAQPage",         scope: "page",     appliedTo: "/help/returns",           status: "warning", validationErrors: 0, validationWarnings: 2, lastValidated: "2026-06-19", updatedAt: "2026-02-28" },
  { id: "sch_007", name: "Blog Article",         type: "Article",         scope: "template", appliedTo: "All blog posts (42)",     status: "error",   validationErrors: 1, validationWarnings: 0, lastValidated: "2026-06-18", updatedAt: "2026-06-10" },
  { id: "sch_008", name: "Local Business",       type: "LocalBusiness",   scope: "page",     appliedTo: "/contact",                status: "active",  validationErrors: 0, validationWarnings: 0, lastValidated: "2026-06-20", updatedAt: "2026-01-15" },
  { id: "sch_009", name: "Product Reviews",      type: "Review",          scope: "template", appliedTo: "Product pages with reviews", status: "active", validationErrors: 0, validationWarnings: 1, lastValidated: "2026-06-20", updatedAt: "2026-05-22" },
  { id: "sch_010", name: "Category Page",        type: "CollectionPage",  scope: "template", appliedTo: "All category pages (28)", status: "draft",   validationErrors: 0, validationWarnings: 0, lastValidated: "Never",      updatedAt: "2026-06-18" },
];

/* ─── Search Console ────────────────────────────────────────────────────────── */

export type GscDevice   = "DESKTOP" | "MOBILE" | "TABLET";
export type GscSearchType = "web" | "image" | "video" | "news";

export const gscConnection = {
  connected:       true,
  account:         "againsoftware@gmail.com",
  property:        "https://urbanwear.com/",
  propertyType:    "URL_PREFIX" as const,
  verifiedAt:      "2025-03-14",
  lastFetchedAt:   "2026-06-20 08:30",
  dataFreshness:   "~2 days lag",
};

export const gscSummary = {
  clicks:          28_400,
  impressions:     412_000,
  ctr:             6.89,
  avgPosition:     13.2,
  clicksDelta:     +12.4,
  impressionsDelta: +8.1,
  ctrDelta:        +0.3,
  positionDelta:   -1.8,
  dateRange:       "Last 28 days",
};

export type GscChartPoint = { date: string; clicks: number; impressions: number };

export const gscChart: GscChartPoint[] = [
  { date: "May 24", clicks: 820,  impressions: 13200 },
  { date: "May 25", clicks: 904,  impressions: 14100 },
  { date: "May 26", clicks: 780,  impressions: 12800 },
  { date: "May 27", clicks: 650,  impressions: 10900 },
  { date: "May 28", clicks: 590,  impressions: 9800  },
  { date: "May 29", clicks: 960,  impressions: 14800 },
  { date: "May 30", clicks: 1040, impressions: 15600 },
  { date: "May 31", clicks: 1120, impressions: 16200 },
  { date: "Jun 01", clicks: 980,  impressions: 15100 },
  { date: "Jun 02", clicks: 870,  impressions: 13700 },
  { date: "Jun 03", clicks: 820,  impressions: 12900 },
  { date: "Jun 04", clicks: 760,  impressions: 11800 },
  { date: "Jun 05", clicks: 1180, impressions: 17400 },
  { date: "Jun 06", clicks: 1260, impressions: 18200 },
  { date: "Jun 07", clicks: 1340, impressions: 19100 },
  { date: "Jun 08", clicks: 1090, impressions: 16400 },
  { date: "Jun 09", clicks: 950,  impressions: 14600 },
  { date: "Jun 10", clicks: 880,  impressions: 13500 },
  { date: "Jun 11", clicks: 820,  impressions: 12700 },
  { date: "Jun 12", clicks: 1400, impressions: 20100 },
  { date: "Jun 13", clicks: 1520, impressions: 21400 },
  { date: "Jun 14", clicks: 1380, impressions: 19800 },
  { date: "Jun 15", clicks: 1210, impressions: 17600 },
  { date: "Jun 16", clicks: 1080, impressions: 16100 },
  { date: "Jun 17", clicks: 970,  impressions: 14900 },
  { date: "Jun 18", clicks: 900,  impressions: 13800 },
  { date: "Jun 19", clicks: 1560, impressions: 22200 },
  { date: "Jun 20", clicks: 310,  impressions: 4800  },
];

export type GscQuery = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  clicksDelta: number;
  positionDelta: number;
};

export const gscQueriesSeed: GscQuery[] = [
  { query: "buy smartwatch online bangladesh",     clicks: 1840, impressions: 22400, ctr: 8.2,  position: 2.1,  clicksDelta: +18,  positionDelta: -0.4 },
  { query: "wireless earbuds price in bd",         clicks: 1520, impressions: 19800, ctr: 7.7,  position: 2.8,  clicksDelta: +12,  positionDelta: -0.2 },
  { query: "urbanwear",                            clicks: 1380, impressions: 8200,  ctr: 16.8, position: 1.2,  clicksDelta: +8,   positionDelta:  0.0 },
  { query: "running shoes online bd",              clicks: 1140, impressions: 18600, ctr: 6.1,  position: 4.2,  clicksDelta: +24,  positionDelta: -1.1 },
  { query: "cotton t-shirt men bangladesh",        clicks: 980,  impressions: 16400, ctr: 6.0,  position: 3.6,  clicksDelta: +6,   positionDelta: -0.3 },
  { query: "online clothing store dhaka",          clicks: 860,  impressions: 21200, ctr: 4.1,  position: 6.8,  clicksDelta: -4,   positionDelta: +1.2 },
  { query: "noise cancelling headphones bd price", clicks: 740,  impressions: 12800, ctr: 5.8,  position: 3.9,  clicksDelta: +30,  positionDelta: -2.4 },
  { query: "air purifier bangladesh",              clicks: 620,  impressions: 9400,  ctr: 6.6,  position: 4.1,  clicksDelta: +14,  positionDelta: -0.8 },
  { query: "yoga mat buy online bd",               clicks: 540,  impressions: 8200,  ctr: 6.6,  position: 3.2,  clicksDelta: +9,   positionDelta: -0.5 },
  { query: "slim fit chino pants bangladesh",      clicks: 480,  impressions: 7600,  ctr: 6.3,  position: 4.8,  clicksDelta: +2,   positionDelta: +0.1 },
  { query: "4k webcam price bd",                   clicks: 420,  impressions: 6200,  ctr: 6.8,  position: 3.4,  clicksDelta: +42,  positionDelta: -3.2 },
  { query: "resistance bands gym bd",              clicks: 380,  impressions: 6800,  ctr: 5.6,  position: 5.2,  clicksDelta: +18,  positionDelta: -0.9 },
  { query: "ceramic mug set bd",                   clicks: 320,  impressions: 5400,  ctr: 5.9,  position: 4.6,  clicksDelta: +7,   positionDelta: -0.4 },
  { query: "smart home gadgets bangladesh",        clicks: 280,  impressions: 8800,  ctr: 3.2,  position: 9.4,  clicksDelta: -10,  positionDelta: +2.1 },
  { query: "fashion brands online bangladesh",     clicks: 260,  impressions: 11200, ctr: 2.3,  position: 11.8, clicksDelta: -6,   positionDelta: +1.4 },
  { query: "buy jackets online dhaka",             clicks: 240,  impressions: 5800,  ctr: 4.1,  position: 6.2,  clicksDelta: +12,  positionDelta: -0.6 },
  { query: "best ecommerce site bangladesh",       clicks: 220,  impressions: 9400,  ctr: 2.3,  position: 14.2, clicksDelta: +4,   positionDelta: -0.2 },
  { query: "women fashion online bd",              clicks: 200,  impressions: 12600, ctr: 1.6,  position: 18.4, clicksDelta: -8,   positionDelta: +3.6 },
  { query: "urbanwear discount code",              clicks: 184,  impressions: 2800,  ctr: 6.6,  position: 2.4,  clicksDelta: +22,  positionDelta: -0.1 },
  { query: "sports equipment online bd",           clicks: 170,  impressions: 7200,  ctr: 2.4,  position: 12.8, clicksDelta: +14,  positionDelta: -1.2 },
  { query: "premium clothing bd",                  clicks: 154,  impressions: 6400,  ctr: 2.4,  position: 13.6, clicksDelta: -2,   positionDelta: +0.8 },
  { query: "buy earbuds bangladesh",               clicks: 142,  impressions: 4200,  ctr: 3.4,  position: 7.8,  clicksDelta: +18,  positionDelta: -1.4 },
  { query: "home appliances online bd",            clicks: 128,  impressions: 5600,  ctr: 2.3,  position: 16.2, clicksDelta: -14,  positionDelta: +4.2 },
  { query: "glowup beauty products bd",            clicks: 114,  impressions: 2400,  ctr: 4.8,  position: 6.4,  clicksDelta: +28,  positionDelta: -2.8 },
  { query: "men fashion bangladesh 2026",          clicks: 102,  impressions: 8800,  ctr: 1.2,  position: 22.4, clicksDelta: +6,   positionDelta: -0.4 },
];

export type GscPage = {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  clicksDelta: number;
};

export const gscPagesSeed: GscPage[] = [
  { page: "/",                                    clicks: 4200,  impressions: 38400, ctr: 10.9, position: 1.8,  clicksDelta: +8   },
  { page: "/electronics/smart-watch-series-5",    clicks: 2840,  impressions: 28200, ctr: 10.1, position: 2.4,  clicksDelta: +22  },
  { page: "/electronics/wireless-earbuds-pro",    clicks: 2120,  impressions: 24800, ctr: 8.5,  position: 3.1,  clicksDelta: +14  },
  { page: "/catalog",                             clicks: 1860,  impressions: 32400, ctr: 5.7,  position: 5.2,  clicksDelta: +4   },
  { page: "/footwear/running-shoes-ultra",        clicks: 1640,  impressions: 22100, ctr: 7.4,  position: 3.8,  clicksDelta: +28  },
  { page: "/electronics/noise-cancelling-headphones", clicks: 1280, impressions: 18400, ctr: 7.0, position: 4.2, clicksDelta: +36 },
  { page: "/apparel/premium-cotton-t-shirt",      clicks: 1140,  impressions: 18200, ctr: 6.3,  position: 4.4,  clicksDelta: +6   },
  { page: "/home/air-purifier-hepa-h13",          clicks: 920,   impressions: 14100, ctr: 6.5,  position: 4.6,  clicksDelta: +16  },
  { page: "/sports/yoga-mat-non-slip-6mm",        clicks: 780,   impressions: 12400, ctr: 6.3,  position: 4.1,  clicksDelta: +10  },
  { page: "/electronics/4k-webcam-60fps-autofocus", clicks: 680, impressions: 9800,  ctr: 6.9,  position: 3.6,  clicksDelta: +48  },
  { page: "/sports/resistance-bands-set-5pack",   clicks: 560,   impressions: 9200,  ctr: 6.1,  position: 5.4,  clicksDelta: +18  },
  { page: "/apparel/slim-fit-chino-pants",        clicks: 520,   impressions: 8800,  ctr: 5.9,  position: 5.1,  clicksDelta: +4   },
  { page: "/brands/glowup-beauty",                clicks: 440,   impressions: 6400,  ctr: 6.9,  position: 5.8,  clicksDelta: +32  },
  { page: "/kitchen/ceramic-coffee-mug-set",      clicks: 380,   impressions: 6200,  ctr: 6.1,  position: 5.2,  clicksDelta: +8   },
  { page: "/apparel/jackets",                     clicks: 320,   impressions: 7800,  ctr: 4.1,  position: 8.4,  clicksDelta: -6   },
  { page: "/blog/how-to-style-casual-wear",       clicks: 280,   impressions: 8400,  ctr: 3.3,  position: 11.2, clicksDelta: +12  },
  { page: "/blog/top-10-running-shoes-2026",      clicks: 240,   impressions: 7200,  ctr: 3.3,  position: 12.4, clicksDelta: +18  },
  { page: "/electronics",                         clicks: 220,   impressions: 9800,  ctr: 2.2,  position: 14.8, clicksDelta: -12  },
  { page: "/about",                               clicks: 180,   impressions: 4200,  ctr: 4.3,  position: 6.8,  clicksDelta: +2   },
  { page: "/contact",                             clicks: 140,   impressions: 3800,  ctr: 3.7,  position: 7.2,  clicksDelta: +4   },
];

export type GscIndexStatus = {
  totalIndexed: number;
  notIndexed: number;
  crawledNotIndexed: number;
  discoveredNotCrawled: number;
  errors: number;
  lastCrawled: string;
};

export const gscIndexStatus: GscIndexStatus = {
  totalIndexed:        1640,
  notIndexed:          202,
  crawledNotIndexed:   84,
  discoveredNotCrawled: 64,
  errors:              54,
  lastCrawled:         "2026-06-20",
};

export type GscCountryRow = { country: string; code: string; clicks: number; impressions: number; ctr: number; position: number };

export const gscCountriesSeed: GscCountryRow[] = [
  { country: "Bangladesh", code: "BD", clicks: 22800, impressions: 318000, ctr: 7.2, position: 11.4 },
  { country: "India",      code: "IN", clicks: 2840,  impressions: 48200,  ctr: 5.9, position: 14.2 },
  { country: "USA",        code: "US", clicks: 1120,  impressions: 22400,  ctr: 5.0, position: 16.8 },
  { country: "UK",         code: "GB", clicks: 620,   impressions: 10800,  ctr: 5.7, position: 15.6 },
  { country: "Pakistan",   code: "PK", clicks: 480,   impressions: 8400,   ctr: 5.7, position: 13.4 },
  { country: "UAE",        code: "AE", clicks: 320,   impressions: 4800,   ctr: 6.7, position: 12.8 },
  { country: "Canada",     code: "CA", clicks: 220,   impressions: 3600,   ctr: 6.1, position: 17.2 },
];

export type GscDeviceRow = { device: GscDevice; clicks: number; impressions: number; ctr: number; position: number };

export const gscDevicesSeed: GscDeviceRow[] = [
  { device: "MOBILE",  clicks: 17040, impressions: 246000, ctr: 6.9, position: 14.1 },
  { device: "DESKTOP", clicks: 9660,  impressions: 140000, ctr: 6.9, position: 11.8 },
  { device: "TABLET",  clicks: 1700,  impressions: 26000,  ctr: 6.5, position: 13.6 },
];
