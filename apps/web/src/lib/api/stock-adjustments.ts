import { apiFetch } from "@/lib/api/client";

export type AdjustmentStatus = "draft" | "applied" | "cancelled";
export type AdjustmentType = "increase" | "decrease" | "mixed";

export const ADJUSTMENT_REASONS: { value: string; label: string }[] = [
  { value: "physical_count", label: "Physical Stock Count" },
  { value: "damaged", label: "Damaged" },
  { value: "lost", label: "Lost" },
  { value: "found", label: "Found" },
  { value: "expired", label: "Expired" },
  { value: "broken", label: "Broken" },
  { value: "data_correction", label: "Data Correction" },
  { value: "opening_stock", label: "Opening Stock" },
  { value: "migration", label: "Migration" },
  { value: "other", label: "Other" },
];

export type ApiStockAdjustmentSerial = {
  id: string;
  serial_id: string | null;
  serial_number: string;
  action: string;
  status: string | null;
};

export type ApiStockAdjustmentLine = {
  id: string;
  item_id: string;
  sku: string;
  name: string;
  tracking_type: "none" | "serial" | "batch" | string;
  system_qty: number;
  physical_qty: number;
  adjustment_qty: number;
  reason: string | null;
  notes: string | null;
  serials: ApiStockAdjustmentSerial[];
};

export type ApiStockAdjustmentEvent = {
  id: string;
  action: string;
  performed_by: string | null;
  performed_by_name: string | null;
  details: string | null;
  created_at: string;
};

export type ApiStockAdjustment = {
  id: string;
  company_id: string;
  adjustment_number: string;
  warehouse_id: string;
  warehouse_name: string | null;
  adjustment_date: string;
  adjustment_type: AdjustmentType | string;
  reason: string;
  reason_label: string;
  reason_details: string | null;
  reference_number: string | null;
  status: AdjustmentStatus | string;
  created_by: string | null;
  created_by_name: string | null;
  applied_by: string | null;
  applied_by_name: string | null;
  notes: string | null;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
  item_count: number;
  lines: ApiStockAdjustmentLine[];
  events: ApiStockAdjustmentEvent[];
};

export type CreateStockAdjustmentInput = {
  warehouse_id: string;
  adjustment_date?: string;
  reason: string;
  reason_details?: string;
  reference_number?: string;
  notes?: string;
  lines: {
    item_id: string;
    physical_qty: number;
    reason?: string;
    notes?: string;
    keep_serial_ids?: string[];
    add_serial_numbers?: string[];
  }[];
};

type ListResponse = { data: ApiStockAdjustment[]; meta: { count: number; page: number; per_page: number } };
type ItemResponse = { data: ApiStockAdjustment };

export async function fetchStockAdjustments(params?: {
  status?: string;
  warehouse_id?: string;
  reason?: string;
  adjustment_type?: string;
}): Promise<ListResponse> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.warehouse_id) qs.set("warehouse_id", params.warehouse_id);
  if (params?.reason) qs.set("reason", params.reason);
  if (params?.adjustment_type) qs.set("adjustment_type", params.adjustment_type);
  qs.set("per_page", "200");
  return apiFetch(`/api/v1/inventory/stock-adjustments?${qs.toString()}`);
}

export async function fetchStockAdjustment(id: string): Promise<ApiStockAdjustment> {
  const res = await apiFetch<ItemResponse>(`/api/v1/inventory/stock-adjustments/${id}`);
  return res.data;
}

export async function createStockAdjustment(input: CreateStockAdjustmentInput): Promise<ApiStockAdjustment> {
  const res = await apiFetch<ItemResponse>("/api/v1/inventory/stock-adjustments", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function applyStockAdjustment(id: string): Promise<ApiStockAdjustment> {
  const res = await apiFetch<ItemResponse>(`/api/v1/inventory/stock-adjustments/${id}/apply`, {
    method: "POST",
  });
  return res.data;
}

export async function cancelStockAdjustment(id: string): Promise<ApiStockAdjustment> {
  const res = await apiFetch<ItemResponse>(`/api/v1/inventory/stock-adjustments/${id}/cancel`, {
    method: "POST",
  });
  return res.data;
}

export function adjustmentLabel(status: string) {
  if (status === "applied") return "Applied";
  if (status === "cancelled") return "Cancelled";
  if (status === "draft") return "Draft";
  return status;
}

export function adjustmentTone(status: string) {
  if (status === "applied") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  if (status === "cancelled") return "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400";
  return "border-muted-foreground/30 bg-muted text-muted-foreground";
}

export function adjustmentTypeLabel(type: string) {
  if (type === "increase") return "Increase";
  if (type === "decrease") return "Decrease";
  if (type === "mixed") return "Mixed";
  return type;
}

export function formatDiff(value: number) {
  if (value > 0) return `+${value}`;
  return String(value);
}
