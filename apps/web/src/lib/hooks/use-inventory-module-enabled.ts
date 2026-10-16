"use client";

import { useSettingsStore } from "@/lib/store/settings-store";

export const INVENTORY_MODULE_SETTING_KEY = "platform.features.inventory";

/** Inventory module toggle from Feature Manager settings. Defaults to enabled. */
export function useInventoryModuleEnabled(): boolean {
  const value = useSettingsStore((s) => s.values[INVENTORY_MODULE_SETTING_KEY]);
  return value !== false;
}
