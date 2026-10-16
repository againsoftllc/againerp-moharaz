import { getStorefrontBaseUrl } from "@/lib/website/live-edit";
import type { WebsiteManagedPage } from "@/lib/website/pages/types";

/** @deprecated Admin shell — Home Live Edit opens the storefront editor instead. */
export const HOME_LIVE_EDIT = "/website/live-edit/home";
export const CATEGORY_LIVE_EDIT = "/website/live-edit/category";
export const CONTENT_LIVE_EDIT = "/website/live-edit/content";

/** Working homepage Live Edit (storefront :3010) — same as website login flow. */
export function storefrontHomepageLiveEditUrl(): string {
  const base = getStorefrontBaseUrl().replace(/\/$/, "") || "http://localhost:3010";
  // Prefer /home directly — middleware sends unauthenticated users to login with next=.
  return `${base}/website/live-edit/home`;
}

export function isHomePage(page: WebsiteManagedPage) {
  return page.flags.isHome || page.url === "/" || page.slug === "" || page.slug === "home";
}

export function isCategoryPage(page: WebsiteManagedPage) {
  return page.pageType === "category";
}

/** Footer / legal / marketing pages with CMS body_html (not home). */
export function isContentPage(page: WebsiteManagedPage) {
  if (isHomePage(page) || isCategoryPage(page)) return false;
  if (page.flags.isSystem) return false;
  return (
    page.pageType === "website" ||
    page.pageType === "custom" ||
    page.pageType === "landing" ||
    page.pageType === "blog"
  );
}

export function supportsLiveEdit(page: WebsiteManagedPage) {
  // Storefront Live Edit is homepage-only (the working editor).
  return isHomePage(page);
}

/** Map CMS page URL to storefront path for Open storefront. */
export function storefrontPathForPage(page: WebsiteManagedPage): string {
  let path = page.url?.startsWith("/") ? page.url : `/${page.url || page.slug || ""}`;
  if (path.startsWith("/category/")) {
    const slug = path.slice("/category/".length).split("/")[0];
    path = slug ? `/${slug}` : "/laptops";
  }
  if (!path || path === "/") return isCategoryPage(page) ? "/laptops" : "/";
  return path;
}

/**
 * Live Edit entry URL.
 * Home → storefront Live Edit (login + editor). Same product as opening
 * http://localhost:3010/website/live-edit directly.
 */
export function liveEditAdminUrl(page: WebsiteManagedPage): string | null {
  if (isHomePage(page)) return storefrontHomepageLiveEditUrl();
  return null;
}

export function storefrontUrlForPage(page: WebsiteManagedPage): string {
  const base = getStorefrontBaseUrl();
  const path = storefrontPathForPage(page);
  if (!base) return path;
  return `${base.replace(/\/$/, "")}${path}`;
}

export function canDeletePage(page: WebsiteManagedPage) {
  return !page.flags.deleteDisabled && !page.flags.isHome && !page.flags.isSystem;
}

export function slugifyPageName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
