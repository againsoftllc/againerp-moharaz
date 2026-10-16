import { apiFetch } from "@/lib/api/client";

export type TransferStatus =
  | "draft"
  | "in_transit"
  | "partial_received"
  | "completed"
  | "cancelled";

export type ApiStockTransferSerial = {
  id: string;
  serial_id: string;
  serial_number: string;
  status: string;
  shipped_at: string | null;
  received_at: string | null;
};

export type ApiStockTransferLine = {
  id: string;
  item_id: string;
  sku: string;
  name: string;
  tracking_type: "none" | "serial" | "batch" | string;
  quantity: number;
  shipped_qty: number;
  received_qty: number;
  remaining_qty: number;
  available_qty: number | null;
  notes: string | null;
  serials: ApiStockTransferSerial[];
};

export type ApiStockTransferEvent = {
  id: string;
  action: string;
  performed_by: string | null;
  performed_by_name: string | null;
  details: string | null;
  created_at: string;
};

export type ApiStockTransfer = {
  id: string;
  company_id: string;
  transfer_number: string;
  from_warehouse_id: string;
  from_warehouse_name: string | null;
  to_warehouse_id: string;
  to_warehouse_name: string | null;
  transfer_date: string;
  reference_number: string | null;
  status: TransferStatus | string;
  requested_by: string | null;
  requested_by_name: string | null;
  shipped_by: string | null;
  received_by: string | null;
  notes: string | null;
  shipped_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  item_count: number;
  lines: ApiStockTransferLine[];
  events: ApiStockTransferEvent[];
};

export type CreateStockTransferInput = {
  from_warehouse_id: string;
  to_warehouse_id: string;
  transfer_date?: string;
  reference_number?: string;
  notes?: string;
  lines: {
    item_id: string;
    quantity: number;
    serial_ids?: string[];
    notes?: string;
  }[];
};

export type ReceiveStockTransferInput = {
  lines: {
    line_id: string;
    quantity: number;
    serial_ids?: string[];
  }[];
};

type ListResponse = { data: ApiStockTransfer[]; meta: { count: number; page: number; per_page: number } };
type ItemResponse = { data: ApiStockTransfer };

export async function fetchStockTransfers(params?: {
  status?: string;
  from_warehouse_id?: string;
  to_warehouse_id?: string;
}): Promise<ListResponse> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.from_warehouse_id) qs.set("from_warehouse_id", params.from_warehouse_id);
  if (params?.to_warehouse_id) qs.set("to_warehouse_id", params.to_warehouse_id);
  qs.set("per_page", "200");
  const query = qs.toString();
  return apiFetch(`/api/v1/inventory/stock-transfers${query ? `?${query}` : ""}`);
}

export async function fetchStockTransfer(id: string): Promise<ApiStockTransfer> {
  const res = await apiFetch<ItemResponse>(`/api/v1/inventory/stock-transfers/${id}`);
  return res.data;
}

export async function createStockTransfer(input: CreateStockTransferInput): Promise<ApiStockTransfer> {
  const res = await apiFetch<ItemResponse>("/api/v1/inventory/stock-transfers", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function shipStockTransfer(id: string): Promise<ApiStockTransfer> {
  const res = await apiFetch<ItemResponse>(`/api/v1/inventory/stock-transfers/${id}/ship`, {
    method: "POST",
  });
  return res.data;
}

export async function receiveStockTransfer(
  id: string,
  input: ReceiveStockTransferInput,
): Promise<ApiStockTransfer> {
  const res = await apiFetch<ItemResponse>(`/api/v1/inventory/stock-transfers/${id}/receive`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function cancelStockTransfer(id: string): Promise<ApiStockTransfer> {
  const res = await apiFetch<ItemResponse>(`/api/v1/inventory/stock-transfers/${id}/cancel`, {
    method: "POST",
  });
  return res.data;
}

export function transferLabel(status: string) {
  if (status === "in_transit") return "In Transit";
  if (status === "partial_received") return "Partially Received";
  if (status === "completed") return "Completed";
  if (status === "cancelled") return "Cancelled";
  if (status === "draft") return "Draft";
  return status;
}

export function transferTone(status: string) {
  if (status === "completed") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  if (status === "in_transit") return "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400";
  if (status === "partial_received") return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400";
  if (status === "cancelled") return "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400";
  return "border-muted-foreground/30 bg-muted text-muted-foreground";
}
