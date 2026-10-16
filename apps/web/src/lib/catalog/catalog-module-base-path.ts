"use client";

import { usePathname } from "next/navigation";

/** Admin UI base for the main Catalog module (now merged into Website). */
export const CATALOG_MODULE_BASE = "/website";

/** Admin UI base for the standalone Dropshipping module. */
export const DROPSHIPPING_MODULE_BASE = "/dropshipping";

/** Resolve Catalog vs Dropshipping UI base from the current pathname. */
export function resolveCatalogModuleBasePath(pathname: string | null | undefined): string {
  if (
    pathname === DROPSHIPPING_MODULE_BASE ||
    pathname?.startsWith(`${DROPSHIPPING_MODULE_BASE}/`)
  ) {
    return DROPSHIPPING_MODULE_BASE;
  }
  return CATALOG_MODULE_BASE;
}

export function useCatalogModuleBasePath(): string {
  return resolveCatalogModuleBasePath(usePathname());
}
