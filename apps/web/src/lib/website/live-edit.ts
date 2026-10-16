import { getPrimaryConnectedBaseUrl } from "@/lib/store/connected-websites-store";
import { publicMediaUrl } from "@/lib/media/public-media-url";

/** Cached primary site URLs (filled by hydrateStorefrontUrlsFromSite / boot hydrator). */
let cachedSiteLocalUrl = "";
let cachedSitePreviewUrl = "";
let cachedSiteProductionUrl = "";

/** @deprecated Prefer hydrateStorefrontUrlsFromSite */
export function hydrateStorefrontBaseFromSites(localUrl: string | null | undefined) {
  hydrateStorefrontUrlsFromSite({ storefront_url_local: localUrl ?? "" });
}

export function hydrateStorefrontUrlsFromSite(site: {
  storefront_url_local?: string | null;
  storefront_url_preview?: string | null;
  storefront_url_production?: string | null;
  primary_domain?: string | null;
}) {
  cachedSiteLocalUrl = sanitizeStorefrontBase(site.storefront_url_local);
  cachedSitePreviewUrl = sanitizeStorefrontBase(site.storefront_url_preview);
  cachedSiteProductionUrl =
    sanitizeStorefrontBase(site.storefront_url_production) ||
    sanitizeStorefrontBase(
      site.primary_domain ? `https://${String(site.primary_domain).replace(/^https?:\/\//i, "")}` : "",
    );
}

/** Public “Open website” — production → preview → local. */
export function getStorefrontPublicUrl(): string {
  return (
    sanitizeStorefrontBase(cachedSiteProductionUrl) ||
    sanitizeStorefrontBase(cachedSitePreviewUrl) ||
    sanitizeStorefrontBase(cachedSiteLocalUrl) ||
    sanitizeStorefrontBase(process.env.NEXT_PUBLIC_STOREFRONT_URL) ||
    DEFAULT_STOREFRONT_BASE_URL
  );
}

/** Local TechPickly storefront (Docker :3010). Prefer localhost to match ERP :3210. */
export const DEFAULT_STOREFRONT_BASE_URL = "http://localhost:3010";

function isAdminSelfOrigin(url: string): boolean {
  try {
    const origin = new URL(url).origin;
    if (typeof window !== "undefined" && window.location?.origin === origin) {
      return true;
    }
    // Admin web defaults — never use these as the Live Edit iframe target.
    const host = new URL(url).host.toLowerCase();
    return (
      host === "localhost:3210" ||
      host === "127.0.0.1:3210" ||
      host === "0.0.0.0:3210"
    );
  } catch {
    return false;
  }
}

function sanitizeStorefrontBase(url: string | null | undefined): string {
  const trimmed = (url || "").trim().replace(/\/$/, "");
  if (!trimmed) return "";
  if (!/^https?:\/\//i.test(trimmed)) return "";
  if (isAdminSelfOrigin(trimmed)) return "";
  return trimmed;
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "[::1]";
}

/** Same port on localhost ↔ 127.0.0.1 so Live Edit postMessage still matches. */
export function isEquivalentStorefrontOrigin(origin: string, expected: string): boolean {
  if (origin === expected) return true;
  try {
    const a = new URL(origin);
    const b = new URL(expected);
    if (a.protocol !== b.protocol) return false;
    if (a.port !== b.port) return false;
    return isLoopbackHost(a.hostname) && isLoopbackHost(b.hostname);
  } catch {
    return false;
  }
}

/** Loopback alternate (localhost ↔ 127.0.0.1) for the same URL. */
export function loopbackAlternateOrigin(urlOrOrigin: string): string | null {
  try {
    const u = new URL(urlOrOrigin);
    if (!isLoopbackHost(u.hostname)) return null;
    u.hostname = u.hostname === "localhost" ? "127.0.0.1" : "localhost";
    return u.origin;
  } catch {
    return null;
  }
}

function isLocalAdminHost(): boolean {
  if (typeof window === "undefined") return false;
  return isLoopbackHost(window.location.hostname);
}

/**
 * External storefront origin for Website Live Edit iframe.
 * Local admin: loopback / site local → env → :3010 (so production Vercel does not break postMessage).
 * Deployed admin: site production → preview → connected → env → default.
 * Never returns the admin origin (that would embed the ERP dashboard).
 */
export function getStorefrontBaseUrl(): string {
  const configured = sanitizeStorefrontBase(process.env.NEXT_PUBLIC_STOREFRONT_URL);
  const connected = sanitizeStorefrontBase(getPrimaryConnectedBaseUrl());
  const siteLocal = sanitizeStorefrontBase(cachedSiteLocalUrl);
  const sitePreview = sanitizeStorefrontBase(cachedSitePreviewUrl);
  const siteProduction = sanitizeStorefrontBase(cachedSiteProductionUrl);

  if (isLocalAdminHost()) {
    if (connected) {
      try {
        if (isLoopbackHost(new URL(connected).hostname)) return connected;
      } catch {
        /* ignore */
      }
    }
    if (siteLocal) {
      try {
        if (isLoopbackHost(new URL(siteLocal).hostname)) return siteLocal;
      } catch {
        /* ignore */
      }
    }
    if (configured) return configured;
    if (siteLocal) return siteLocal;
    return DEFAULT_STOREFRONT_BASE_URL;
  }

  if (siteProduction) return siteProduction;
  if (sitePreview) return sitePreview;
  if (connected) return connected;
  if (configured) return configured;
  if (siteLocal) return siteLocal;
  return DEFAULT_STOREFRONT_BASE_URL;
}

/** Public product page on the storefront (slug route). */
export function storefrontProductUrl(slug: string): string {
  const base = getStorefrontBaseUrl();
  const path = slug.startsWith("/") ? slug : `/${slug}`;
  return `${base}${path}`;
}

/**
 * Preview URL for brand assets in admin (Sites Image, etc.).
 * `/uploads/...` → admin proxy; `/images/...` → storefront origin (not on ERP :3210).
 */
export function resolveBrandAssetPreviewUrl(url: string | null | undefined): string {
  const trimmed = (url || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) {
    return publicMediaUrl(trimmed) || trimmed;
  }
  if (trimmed.startsWith("/uploads/")) {
    return publicMediaUrl(trimmed);
  }
  if (trimmed.startsWith("/")) {
    const base = getStorefrontBaseUrl().replace(/\/$/, "") || DEFAULT_STOREFRONT_BASE_URL;
    return `${base}${trimmed}`;
  }
  return trimmed;
}

export function storefrontLiveEditUrl(path = "/"): string {
  const base = getStorefrontBaseUrl().replace(/\/$/, "") || DEFAULT_STOREFRONT_BASE_URL;
  // Homepage Live Edit is the dedicated editor — not `/?liveEdit=1`.
  if (!path || path === "/") {
    return `${base}/website/live-edit/home`;
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  try {
    const url = new URL(normalizedPath, `${base}/`);
    return url.toString();
  } catch {
    return `${DEFAULT_STOREFRONT_BASE_URL}/website/live-edit/home`;
  }
}

export const LIVE_EDIT_MSG = {
  select: "live-edit:select",
  reload: "homepage:reload",
  ready: "live-edit:ready",
  highlight: "live-edit:highlight",
  preview: "homepage:preview",
  openShop: "live-edit:open-shop",
  layoutAction: "layout:action",
  layoutAddRequest: "layout:add-request",
  /** Admin → iframe: browse like live site (no edit chrome). */
  lock: "live-edit:lock",
  categoryPreview: "category-page:preview",
  categoryReload: "category-page:reload",
  contentPreview: "content-page:preview",
  contentReload: "content-page:reload",
} as const;

export type LiveEditSelectMessage = {
  type: typeof LIVE_EDIT_MSG.select;
  sectionId: string;
};

export type LiveEditReloadMessage = {
  type: typeof LIVE_EDIT_MSG.reload;
};

export type LiveEditLayoutActionMessage = {
  type: typeof LIVE_EDIT_MSG.layoutAction;
  action: string;
  instanceId: string;
  sectionType?: string;
  insertType?: string;
};

export function isLiveEditSelectMessage(data: unknown): data is LiveEditSelectMessage {
  if (!data || typeof data !== "object") return false;
  const msg = data as Record<string, unknown>;
  return msg.type === LIVE_EDIT_MSG.select && typeof msg.sectionId === "string";
}

export function isLiveEditLayoutActionMessage(data: unknown): data is LiveEditLayoutActionMessage {
  if (!data || typeof data !== "object") return false;
  const msg = data as Record<string, unknown>;
  return (
    msg.type === LIVE_EDIT_MSG.layoutAction &&
    typeof msg.action === "string" &&
    typeof msg.instanceId === "string"
  );
}
