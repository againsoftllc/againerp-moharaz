import { apiFetch } from "@/lib/api/client";

export type ScanProductHit = {
  item_id: string | null;
  sku: string;
  name: string;
  barcode: string | null;
  serial_number: string | null;
  serial_status: string | null;
  match: "serial" | "barcode" | "sku" | string;
};

export async function scanProductCode(code: string): Promise<ScanProductHit | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;
  try {
    const res = await apiFetch<{ data: ScanProductHit | null }>(
      `/api/v1/inventory/serials/scan?code=${encodeURIComponent(trimmed)}`,
    );
    return res.data ?? null;
  } catch {
    return null;
  }
}

export function findItemByScan<T extends { sku: string; name?: string }>(
  items: T[],
  hit: ScanProductHit,
): T | undefined {
  const sku = hit.sku.trim().toLowerCase();
  const barcode = (hit.barcode ?? "").trim().toLowerCase();
  return items.find((item) => {
    const row = item as T & { id?: string; itemId?: string; item_id?: string; barcode?: string | null };
    if (hit.item_id && (row.itemId === hit.item_id || row.item_id === hit.item_id || row.id === hit.item_id)) {
      return true;
    }
    if (sku && item.sku.trim().toLowerCase() === sku) return true;
    if (barcode && (row.barcode ?? "").trim().toLowerCase() === barcode) return true;
    return false;
  });
}
