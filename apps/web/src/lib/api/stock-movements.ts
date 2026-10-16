import { apiFetch } from "@/lib/api/client";
import type { ApiStockMovement } from "@/lib/api/inventory";
import {
  type MoveHistoryReferenceTone,
  type StockMoveHistoryRow,
} from "@/lib/stock/stock-move-history";

export type StockMoveHistoryListParams = {
  limit?: number;
  offset?: number;
  item_id?: string;
  warehouse_id?: string;
  movement_type?: string;
};

export type ApiStockMovementListResponse = {
  data: ApiStockMovement[];
  meta: { count: number };
};

function inferTone(reference: string | null | undefined, movementType: string): MoveHistoryReferenceTone {
  const ref = reference ?? "";
  if (ref.startsWith("SP/")) return "scrap";
  if (ref.startsWith("WH/IN") || movementType === "in" || movementType === "opening") return "incoming";
  if (ref.startsWith("WH/OUT") || movementType === "out") return "outgoing";
  if (movementType === "adjustment" || ref.includes("Product Quantity Updated")) return "adjustment";
  return "incoming";
}

function apiToHistoryRow(row: ApiStockMovement): StockMoveHistoryRow {
  const reference = row.reference ?? row.notes ?? row.movement_type;
  const tone = inferTone(row.reference, row.movement_type);
  return {
    id: row.id,
    date: row.created_at,
    reference,
    reference_tone: tone,
    product_name: row.item_id.slice(0, 8),
    lot_serial: "",
    location_from: row.source_warehouse_id ? "WH/Stock" : "Vendors",
    location_to: row.dest_warehouse_id ? "WH/Stock" : "Inventory adjustm...",
    quantity: row.quantity,
    state: "done",
  };
}

export async function fetchStockMoveHistory(
  params?: StockMoveHistoryListParams,
): Promise<{ rows: StockMoveHistoryRow[]; count: number }> {
  const q = new URLSearchParams();
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.offset) q.set("offset", String(params.offset));
  if (params?.item_id) q.set("item_id", params.item_id);
  if (params?.warehouse_id) q.set("warehouse_id", params.warehouse_id);
  if (params?.movement_type) q.set("movement_type", params.movement_type);
  const query = q.toString();

  const res = await apiFetch<ApiStockMovementListResponse>(
    `/api/v1/inventory/movements${query ? `?${query}` : ""}`,
  );
  const mapped = res.data.map(apiToHistoryRow);
  return {
    rows: mapped,
    count: res.meta.count,
  };
}
