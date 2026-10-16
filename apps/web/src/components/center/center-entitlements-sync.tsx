"use client";

import { useCenterEntitlementsSync } from "@/lib/center/use-center-entitlements-sync";

/** Mount inside admin shell — syncs Center module entitlements into the sidebar store. */
export function CenterEntitlementsSync() {
  useCenterEntitlementsSync();
  return null;
}
