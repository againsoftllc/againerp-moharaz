/** Admin / back-office URL prefixes (this app is admin-only). */
export const ADMIN_PATH_PREFIXES = [
  "/",
  "/login",
  "/home",
  "/dashboard",
  "/sales",
  "/dropshipping",
  "/hrm",
  "/blog",
  "/customers",
  "/settings",
  "/website",
  "/workspace",
  "/system",
  "/notifications",
  "/media",
  "/plugins",
] as const;

export function isAdminPath(pathname: string): boolean {
  if (!pathname) return false;
  return ADMIN_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Resolve pathname on client when Next router has not hydrated yet. */
export function resolvePathname(pathname: string | null | undefined): string {
  if (pathname) return pathname;
  if (typeof window !== "undefined") return window.location.pathname;
  return "/";
}

/** Legacy helper — this app no longer serves a public storefront. */
export function isStorefrontPath(_pathname: string | null | undefined): boolean {
  return false;
}
