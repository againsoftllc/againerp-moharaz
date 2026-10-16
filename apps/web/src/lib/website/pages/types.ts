/** Website page domain — layout containers for future builder integration. */

export type WebsitePageType =
  | "website"
  | "landing"
  | "category"
  | "brand"
  | "product_listing"
  | "blog"
  | "system"
  | "custom";

export type WebsitePageStatus =
  | "draft"
  | "published"
  | "scheduled"
  | "review"
  | "archived";

export type WebsitePageLayout =
  | "default"
  | "landing"
  | "blank"
  | "sidebar"
  | "fullscreen"
  | "custom";

export type WebsitePageVisibility =
  | "public"
  | "private"
  | "password"
  | "logged_in"
  | "customer_group";

export type WebsitePageLanguage = "en" | "bn" | "ar";

export type WebsiteSeoStatus = "complete" | "partial" | "missing";

export type WebsitePageVersionSource = "manual" | "ai" | "publish" | "restore";

export type WebsitePageFilterKey =
  | "all"
  | "website"
  | "ecommerce"
  | "landing"
  | "system"
  | "blog"
  | "published"
  | "draft"
  | "review"
  | "scheduled"
  | "archived";

export type WebsiteSchemaType =
  | "WebPage"
  | "AboutPage"
  | "ContactPage"
  | "CollectionPage"
  | "Product"
  | "Article"
  | "FAQPage"
  | "None";

/** SEO metadata — managed in Page Information Editor, not Builder. */
export interface WebsitePageSeo {
  metaTitle: string;
  metaDescription: string;
  keywords: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string | null;
  canonicalUrl: string | null;
  indexable: boolean;
  schemaType: WebsiteSchemaType;
}

/** Advanced technical settings for the page container. */
export interface WebsitePageAdvanced {
  cssClass: string;
  bodyClass: string;
  cacheEnabled: boolean;
  lazyLoad: boolean;
  searchIndex: boolean;
}

/** Access control — separate from visual builder. */
export interface WebsitePageAccess {
  owner: string;
  editors: string[];
  viewAccess: string;
  publishPermission: string;
}

/** Analytics snapshot for the sidebar. */
export interface WebsitePageStats {
  views: number;
  clicks: number;
  conversion: number;
  seoScore: number;
  performanceScore: number;
}

export interface WebsitePageVersion {
  id: string;
  version: number;
  label: string;
  status: WebsitePageStatus;
  createdAt: string;
  author: string;
  source: WebsitePageVersionSource;
}

export interface WebsitePageFlags {
  isHome: boolean;
  isSystem: boolean;
  isLocked: boolean;
  slugLocked: boolean;
  deleteDisabled: boolean;
}

/**
 * Dynamic layout container.
 * Builder later edits layout sections/widgets only.
 * Publishing, SEO, permissions, and advanced settings live here.
 */
export interface WebsiteManagedPage {
  id: string;
  name: string;
  slug: string;
  url: string;
  pageType: WebsitePageType;
  layout: WebsitePageLayout;
  template: string;
  language: WebsitePageLanguage;
  description: string;
  visibility: WebsitePageVisibility;
  status: WebsitePageStatus;
  updatedBy: string;
  lastUpdated: string;
  creator: string;
  createdAt: string;
  publishedAt: string | null;
  scheduledAt: string | null;
  expiresAt: string | null;
  currentVersion: number;
  seo: WebsitePageSeo;
  seoStatus: WebsiteSeoStatus;
  advanced: WebsitePageAdvanced;
  access: WebsitePageAccess;
  stats: WebsitePageStats;
  permissions: string[];
  versions: WebsitePageVersion[];
  flags: WebsitePageFlags;
  /** CMS HTML body for content pages (About, Terms, etc.). */
  bodyHtml: string;
}

export interface WebsitePageFilterState {
  search: string;
  category: WebsitePageFilterKey;
  language: WebsitePageLanguage | "all";
  author: string | "all";
}

export interface NewWebsitePageInput {
  name: string;
  slug: string;
  pageType: WebsitePageType;
  description: string;
  language: WebsitePageLanguage;
  layout: WebsitePageLayout;
  template: string;
  visibility: WebsitePageVisibility;
  status: WebsitePageStatus;
  scheduledAt: string | null;
  seo: Pick<WebsitePageSeo, "metaTitle" | "metaDescription" | "ogImage" | "canonicalUrl" | "indexable">;
}

export const WEBSITE_PAGE_TYPE_LABELS: Record<WebsitePageType, string> = {
  website: "Website Page",
  landing: "Landing Page",
  category: "Category Page",
  brand: "Brand Page",
  product_listing: "Product Listing",
  blog: "Blog Page",
  system: "System Page",
  custom: "Custom Page",
};

export const WEBSITE_PAGE_STATUS_LABELS: Record<WebsitePageStatus, string> = {
  draft: "Draft",
  published: "Published",
  scheduled: "Scheduled",
  review: "In Review",
  archived: "Archived",
};

export const WEBSITE_PAGE_LAYOUT_LABELS: Record<WebsitePageLayout, string> = {
  default: "Default",
  landing: "Landing",
  blank: "Blank",
  sidebar: "Sidebar",
  fullscreen: "Fullscreen",
  custom: "Custom",
};

export const WEBSITE_PAGE_LANGUAGE_LABELS: Record<WebsitePageLanguage, string> = {
  en: "English",
  bn: "Bengali",
  ar: "Arabic",
};

export const WEBSITE_PAGE_VISIBILITY_LABELS: Record<WebsitePageVisibility, string> = {
  public: "Public",
  private: "Private",
  password: "Password protected",
  logged_in: "Logged In Users",
  customer_group: "Customer Group",
};

export const WEBSITE_SCHEMA_TYPE_LABELS: Record<WebsiteSchemaType, string> = {
  WebPage: "WebPage",
  AboutPage: "AboutPage",
  ContactPage: "ContactPage",
  CollectionPage: "CollectionPage",
  Product: "Product",
  Article: "Article",
  FAQPage: "FAQPage",
  None: "None",
};

export const WEBSITE_PAGE_FILTER_OPTIONS: { key: WebsitePageFilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "website", label: "Website" },
  { key: "ecommerce", label: "Ecommerce" },
  { key: "landing", label: "Landing Page" },
  { key: "system", label: "System Page" },
  { key: "blog", label: "Blog" },
  { key: "published", label: "Published" },
  { key: "draft", label: "Draft" },
  { key: "review", label: "In Review" },
  { key: "scheduled", label: "Scheduled" },
  { key: "archived", label: "Archived" },
];

export const WEBSITE_PAGE_LAYOUT_OPTIONS: WebsitePageLayout[] = [
  "default",
  "landing",
  "blank",
  "sidebar",
  "fullscreen",
  "custom",
];

export const WEBSITE_PAGE_TEMPLATE_OPTIONS = [
  "Default",
  "Homepage",
  "Landing Hero",
  "Category Grid",
  "Product Detail",
  "Blog Article",
  "Checkout Flow",
  "Auth",
  "Error",
] as const;

export const WEBSITE_PAGE_AUTHORS = ["Admin", "Rahim", "Sadia", "Karim", "AI Assistant"] as const;

export const WEBSITE_PAGE_STATUS_PUBLISH_OPTIONS: WebsitePageStatus[] = [
  "draft",
  "published",
  "scheduled",
  "archived",
];

export const WEBSITE_PAGE_VISIBILITY_OPTIONS: WebsitePageVisibility[] = [
  "public",
  "private",
  "logged_in",
  "customer_group",
];

export const WEBSITE_SCHEMA_TYPE_OPTIONS: WebsiteSchemaType[] = [
  "WebPage",
  "AboutPage",
  "ContactPage",
  "CollectionPage",
  "Product",
  "Article",
  "FAQPage",
  "None",
];

export const ECOMMERCE_PAGE_TYPES: WebsitePageType[] = [
  "category",
  "brand",
  "product_listing",
];

export const WEBSITE_PAGE_TYPES_CREATABLE: WebsitePageType[] = [
  "website",
  "landing",
  "category",
  "brand",
  "product_listing",
  "blog",
  "custom",
];

export function defaultPageAdvanced(): WebsitePageAdvanced {
  return {
    cssClass: "",
    bodyClass: "",
    cacheEnabled: true,
    lazyLoad: true,
    searchIndex: true,
  };
}

export function defaultPageAccess(owner = "Admin"): WebsitePageAccess {
  return {
    owner,
    editors: [owner],
    viewAccess: "Public",
    publishPermission: "Editors",
  };
}

export function defaultPageStats(partial?: Partial<WebsitePageStats>): WebsitePageStats {
  return {
    views: 0,
    clicks: 0,
    conversion: 0,
    seoScore: 0,
    performanceScore: 0,
    ...partial,
  };
}

export function enrichPageSeo(
  partial: Partial<WebsitePageSeo> & Pick<WebsitePageSeo, "metaTitle" | "metaDescription">,
): WebsitePageSeo {
  return {
    keywords: "",
    ogTitle: partial.metaTitle,
    ogDescription: partial.metaDescription,
    ogImage: null,
    canonicalUrl: null,
    indexable: true,
    schemaType: "WebPage",
    ...partial,
  };
}
