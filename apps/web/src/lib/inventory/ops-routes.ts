/** Inventory Operations sub-nav routes */
export const INVENTORY_OPS_ROUTES: Record<string, string> = {
  receipts: "/inventory/receipts",
  deliveries: "/inventory/deliveries",
  physical_inventory: "/inventory/physical-inventory",
  scrap: "/inventory/scraps",
  replenishment: "/inventory/replenishment",
};

export function inventoryOpsHref(subId: string): string | undefined {
  return INVENTORY_OPS_ROUTES[subId];
}
