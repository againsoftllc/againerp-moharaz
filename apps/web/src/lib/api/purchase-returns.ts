import type { PurchaseReturn, ReturnLine, ReturnReason, ReturnStatus } from "@/lib/mock-data/purchase-returns";
import { apiFetch } from "@/lib/api/client";

export type ApiPurchaseReturnLine = {
  id: string;
  purchase_order_line_id: string;
  item_id: string;
  sku: string | null;
  name: string | null;
  quantity_returned: number;
  unit_cost: string;
  tax_rate: string;
  line_total: string;
  reason: string | null;
  notes: string | null;
  /** The serial units that went back (serial-tracked products). */
  serial_numbers?: string[];
};

export type ApiPurchaseReturn = {
  id: string;
  company_id: string;
  return_number: string;
  purchase_order_id: string;
  po_number: string | null;
  purchase_receipt_id: string | null;
  receipt_number: string | null;
  supplier_id: string;
  supplier_name: string | null;
  warehouse_id: string;
  warehouse_name: string | null;
  status: string;
  reason: string;
  return_date: string;
  requested_by: string | null;
  notes: string | null;
  subtotal: string;
  tax_amount: string;
  credit_amount: string;
  payable_id: string | null;
  approved_at: string | null;
  credited_at: string | null;
  rejected_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  lines: ApiPurchaseReturnLine[];
};

export type ApiPurchaseReturnListResponse = {
  data: ApiPurchaseReturn[];
  meta: { count: number; page: number; per_page: number };
};

export type ApiPurchaseReturnResponse = {
  data: ApiPurchaseReturn;
};

export type CreatePurchaseReturnInput = {
  purchase_order_id: string;
  purchase_receipt_id?: string;
  /** The location the goods go back from (default: the order's warehouse). */
  warehouse_id?: string;
  reason: ReturnReason;
  return_date?: string;
  requested_by?: string;
  notes?: string;
  lines: {
    purchase_order_line_id: string;
    quantity_returned: number;
    reason?: ReturnReason;
    notes?: string;
    /** One serial per returned unit, for serial-tracked products. */
    serial_numbers?: string[];
  }[];
};

const API_TO_UI_RETURN_STATUS: Record<string, ReturnStatus> = {
  requested: "requested",
  approved: "approved",
  credited: "credited",
  rejected: "rejected",
  cancelled: "cancelled",
};

export function apiReturnToPurchaseReturn(row: ApiPurchaseReturn): PurchaseReturn {
  const status = API_TO_UI_RETURN_STATUS[row.status] ?? "requested";
  const lines: ReturnLine[] = row.lines.map((line) => ({
    id: line.id,
    poLineId: line.purchase_order_line_id,
    sku: line.sku ?? "",
    name: line.name ?? "",
    quantityReturn: line.quantity_returned,
    unitPrice: parseFloat(line.unit_cost) || 0,
    reason: (line.reason as ReturnReason) ?? (row.reason as ReturnReason),
  }));

  return {
    id: row.id,
    number: row.return_number,
    purchaseOrderId: row.purchase_order_id,
    poNumber: row.po_number ?? "",
    receiptId: row.purchase_receipt_id ?? undefined,
    receiptNumber: row.receipt_number ?? undefined,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name ?? "",
    warehouse: row.warehouse_name ?? row.warehouse_id,
    requestDate: row.return_date,
    requestedBy: row.requested_by ?? "—",
    status,
    reason: row.reason as ReturnReason,
    lines,
    creditAmount: parseFloat(row.credit_amount) || 0,
    notes: row.notes ?? undefined,
  };
}

export async function fetchPurchaseReturns(params?: {
  purchase_order_id?: string;
  status?: string;
}): Promise<ApiPurchaseReturnListResponse> {
  const qs = new URLSearchParams();
  if (params?.purchase_order_id) qs.set("purchase_order_id", params.purchase_order_id);
  if (params?.status) qs.set("status", params.status);
  const query = qs.toString();
  return apiFetch(`/api/v1/purchase/returns${query ? `?${query}` : ""}`);
}

export async function fetchPurchaseReturn(id: string): Promise<ApiPurchaseReturn> {
  const res = await apiFetch<ApiPurchaseReturnResponse>(`/api/v1/purchase/returns/${id}`);
  return res.data;
}

export async function createPurchaseReturn(
  input: CreatePurchaseReturnInput,
): Promise<ApiPurchaseReturn> {
  const res = await apiFetch<ApiPurchaseReturnResponse>("/api/v1/purchase/returns", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function approvePurchaseReturn(id: string): Promise<ApiPurchaseReturn> {
  const res = await apiFetch<ApiPurchaseReturnResponse>(`/api/v1/purchase/returns/${id}/approve`, {
    method: "POST",
  });
  return res.data;
}

export async function rejectPurchaseReturn(id: string, notes?: string): Promise<ApiPurchaseReturn> {
  const res = await apiFetch<ApiPurchaseReturnResponse>(`/api/v1/purchase/returns/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ notes }),
  });
  return res.data;
}

export async function cancelPurchaseReturn(id: string): Promise<ApiPurchaseReturn> {
  const res = await apiFetch<ApiPurchaseReturnResponse>(`/api/v1/purchase/returns/${id}/cancel`, {
    method: "POST",
  });
  return res.data;
}

export async function creditPurchaseReturn(id: string): Promise<ApiPurchaseReturn> {
  const res = await apiFetch<ApiPurchaseReturnResponse>(`/api/v1/purchase/returns/${id}/credit`, {
    method: "POST",
  });
  return res.data;
}
