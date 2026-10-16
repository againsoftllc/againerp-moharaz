import { apiFetch } from "@/lib/api/client";

/** Where a sold unit's warranty countdown starts. */
export type WarrantyStartBasis = "sale" | "stock_in";

export type InventorySettings = {
  /** When on, out-of-stock items can be sold and stock goes below zero. */
  allow_negative_stock: boolean;
  /** "sale" (default): from the day the unit is sold. "stock_in": from the day it was received. */
  warranty_start_basis: WarrantyStartBasis;
};

const BASE = "/api/v1/inventory/settings";

export async function fetchInventorySettings(): Promise<InventorySettings> {
  const res = await apiFetch<{ data: InventorySettings }>(BASE, { cache: "no-store" });
  return res.data;
}

export async function updateInventorySettings(
  payload: Partial<InventorySettings>,
): Promise<InventorySettings> {
  const res = await apiFetch<{ data: InventorySettings }>(BASE, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return res.data;
}
