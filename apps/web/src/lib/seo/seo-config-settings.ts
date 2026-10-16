/** Local SEO technical config — storefront crawl/index defaults. */

export type SeoConfigValues = {
  canonicalHost: string;
  titleTemplate: string;
  defaultMetaDescription: string;
  trailingSlash: "keep" | "strip" | "add";
  indexStorefront: boolean;
  noindexFilters: boolean;
  noindexSearch: boolean;
  schemaMarkup: boolean;
  sitemapEnabled: boolean;
  includeProducts: boolean;
  includeCategories: boolean;
  includeBrands: boolean;
  includeBlog: boolean;
  includePages: boolean;
  includeImages: boolean;
  pingSearchEngines: boolean;
  robotsEnabled: boolean;
  robotsTxt: string;
  defaultSchemaType: string;
  productTitlePattern: string;
  categoryTitlePattern: string;
};

export const DEFAULT_SEO_CONFIG: SeoConfigValues = {
  canonicalHost: "https://www.example.com",
  titleTemplate: "%s | Store",
  defaultMetaDescription: "Shop electronics, accessories, and studio gear with fast delivery.",
  trailingSlash: "strip",
  indexStorefront: true,
  noindexFilters: true,
  noindexSearch: true,
  schemaMarkup: true,
  sitemapEnabled: true,
  includeProducts: true,
  includeCategories: true,
  includeBrands: true,
  includeBlog: true,
  includePages: true,
  includeImages: true,
  pingSearchEngines: false,
  robotsEnabled: true,
  robotsTxt: `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api
Disallow: /cart
Disallow: /checkout
Disallow: /account

Sitemap: https://www.example.com/sitemap.xml
`,
  defaultSchemaType: "WebPage",
  productTitlePattern: "%name% | Buy online",
  categoryTitlePattern: "%name% | Shop the collection",
};

const STORAGE_KEY = "againerp.seo.config";

export function readSeoConfig(): SeoConfigValues {
  if (typeof window === "undefined") return { ...DEFAULT_SEO_CONFIG };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SEO_CONFIG };
    return { ...DEFAULT_SEO_CONFIG, ...(JSON.parse(raw) as Partial<SeoConfigValues>) };
  } catch {
    return { ...DEFAULT_SEO_CONFIG };
  }
}

export function writeSeoConfig(values: SeoConfigValues) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
}
