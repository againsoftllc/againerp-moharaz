import type {
  StockMove,
  StockPicking,
  StockPickingState,
  StockPickingTypeCode,
} from "@/lib/stock/stock-picking";
import {
  formatStockDatetime,
  pickingWithLabels,
} from "@/lib/stock/stock-picking";
import { apiFetch } from "@/lib/api/client";

export type ApiStockMove = {
  id: string;
  picking_id: string;
  name: string;
  product_id?: string | null;
  product_uom_qty: number | string;
  quantity: number | string;
  sequence: number;
  state: string;
  show_details?: boolean;
};

export type ApiStockPicking = {
  id: string;
  company_id: string;
  name: string;
  partner_id?: string | null;
  partner_name?: string | null;
  picking_type_id: string;
  picking_type_code: StockPickingTypeCode;
  picking_type_name: string;
  location_id?: string | null;
  location_dest_id?: string | null;
  scheduled_date: string;
  date_deadline?: string | null;
  origin?: string | null;
  state: StockPickingState;
  user_id?: string | null;
  user_name?: string | null;
  carrier_tracking_ref?: string | null;
  weight: number | string;
  priority: string;
  note?: string | null;
  move_ids: ApiStockMove[];
  scheduled_label?: string | null;
  deadline_label?: string | null;
  is_late?: boolean;
  created_at: string;
  updated_at: string;
};

export type ApiStockPickingListResponse = {
  data: ApiStockPicking[];
  meta: { count: number };
};

export type ApiStockPickingResponse = {
  data: ApiStockPicking;
};

export type StockPickingListParams = {
  picking_type_code?: StockPickingTypeCode;
  search?: string;
};

export type UpdateStockPickingInput = {
  partner_id?: string | null;
  partner_name?: string | null;
  scheduled_date?: string;
  date_deadline?: string | null;
  origin?: string | null;
  state?: StockPickingState;
  user_id?: string | null;
  user_name?: string | null;
  carrier_tracking_ref?: string | null;
  weight?: number;
  priority?: "0" | "1";
  note?: string | null;
  location_id?: string | null;
  location_dest_id?: string | null;
};

function apiMoveToMove(row: ApiStockMove): StockMove {
  return {
    id: row.id,
    picking_id: row.picking_id,
    name: row.name,
    product_id: row.product_id ?? null,
    product_uom_qty: Number(row.product_uom_qty),
    quantity: Number(row.quantity),
    sequence: row.sequence,
    state: row.state as StockMove["state"],
    show_details: row.show_details,
  };
}

export function apiPickingToPicking(row: ApiStockPicking): StockPicking {
  const base: StockPicking = {
    id: row.id,
    name: row.name,
    partner_id: row.partner_id ?? null,
    partner_name: row.partner_name ?? "",
    picking_type_id: row.picking_type_id,
    picking_type_code: row.picking_type_code,
    picking_type_name: row.picking_type_name,
    location_id: row.location_id ?? null,
    location_dest_id: row.location_dest_id ?? null,
    scheduled_date: row.scheduled_date,
    date_deadline: row.date_deadline ?? null,
    origin: row.origin ?? "",
    state: row.state,
    user_id: row.user_id ?? null,
    user_name: row.user_name ?? "",
    carrier_tracking_ref: row.carrier_tracking_ref ?? "",
    weight: Number(row.weight),
    priority: row.priority === "1" ? "1" : "0",
    note: row.note ?? "",
    move_ids: row.move_ids.map(apiMoveToMove),
    scheduled_label: row.scheduled_label ?? formatStockDatetime(row.scheduled_date),
    deadline_label: row.deadline_label ?? (row.date_deadline ? formatStockDatetime(row.date_deadline) : undefined),
    is_late: row.is_late,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  return pickingWithLabels(base);
}

export function buildStockPickingQuery(params?: StockPickingListParams): string {
  if (!params) return "";
  const q = new URLSearchParams();
  if (params.picking_type_code) q.set("picking_type_code", params.picking_type_code);
  if (params.search) q.set("search", params.search);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function pickingUpdateToApiPayload(input: UpdateStockPickingInput) {
  return {
    partner_id: input.partner_id,
    partner_name: input.partner_name,
    scheduled_date: input.scheduled_date,
    date_deadline: input.date_deadline,
    origin: input.origin,
    state: input.state,
    user_id: input.user_id,
    user_name: input.user_name,
    carrier_tracking_ref: input.carrier_tracking_ref,
    weight: input.weight,
    priority: input.priority,
    note: input.note,
    location_id: input.location_id,
    location_dest_id: input.location_dest_id,
  };
}

export async function fetchStockPickings(
  params?: StockPickingListParams,
): Promise<StockPicking[]> {
  const res = await apiFetch<ApiStockPickingListResponse>(
    `/api/v1/inventory/pickings${buildStockPickingQuery(params)}`,
  );
  return res.data.map(apiPickingToPicking);
}

export async function fetchStockPicking(id: string): Promise<StockPicking> {
  const res = await apiFetch<ApiStockPickingResponse>(`/api/v1/inventory/pickings/${id}`);
  return apiPickingToPicking(res.data);
}

export async function patchStockPicking(
  id: string,
  input: UpdateStockPickingInput,
): Promise<StockPicking> {
  const res = await apiFetch<ApiStockPickingResponse>(`/api/v1/inventory/pickings/${id}`, {
    method: "PATCH",
    body: JSON.stringify(pickingUpdateToApiPayload(input)),
  });
  return apiPickingToPicking(res.data);
}
