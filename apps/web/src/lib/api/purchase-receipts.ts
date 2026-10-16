import type { GoodsReceipt, ReceiptLine, ReceiptStatus } from "@/lib/mock-data/purchase-receipts";
import { apiFetch } from "@/lib/api/client";

export type ApiPurchaseReceiptLine = {
  id: string;
  purchase_order_line_id: string;
  item_id: string;
  sku: string | null;
  name: string | null;
  quantity_received: number;
  serial_numbers?: string[];
  notes: string | null;
};

export type ApiPurchaseReceipt = {
  id: string;
  company_id: string;
  receipt_number: string;
  purchase_order_id: string;
  po_number: string | null;
  supplier_id: string;
  warehouse_id: string;
  warehouse_name: string | null;
  supplier_name?: string | null;
  status: string;
  receive_type: string | null;
  receipt_date: string;
  received_by: string | null;
  posted_by: string | null;
  posted_by_name: string;
  notes: string | null;
  posted_at: string | null;
  created_at: string;
  updated_at: string;
  lines: ApiPurchaseReceiptLine[];
};

export type ApiPurchaseReceiptListResponse = {
  data: ApiPurchaseReceipt[];
  meta: { count: number; page: number; per_page: number };
};

export type ApiPurchaseReceiptResponse = {
  data: ApiPurchaseReceipt;
};

export type CreatePurchaseReceiptInput = {
  purchase_order_id: string;
  receipt_date?: string;
  received_by?: string;
  delivery_note?: string;
  notes?: string;
  lines: {
    purchase_order_line_id: string;
    quantity_received: number;
    serial_numbers?: string[];
    notes?: string;
  }[];
};

const API_TO_UI_RECEIPT_STATUS: Record<string, ReceiptStatus> = {
  draft: "draft",
  posted: "completed",
  cancelled: "cancelled",
};

export function apiReceiptToGoodsReceipt(row: ApiPurchaseReceipt): GoodsReceipt {
  const status = API_TO_UI_RECEIPT_STATUS[row.status] ?? "draft";
  const lines: ReceiptLine[] = row.lines.map((line) => ({
    id: line.id,
    poLineId: line.purchase_order_line_id,
    itemId: line.item_id,
    sku: line.sku ?? "",
    name: line.name ?? "",
    quantityOrdered: 0,
    quantityReceived: line.quantity_received,
  }));

  return {
    id: row.id,
    number: row.receipt_number,
    purchaseOrderId: row.purchase_order_id,
    poNumber: row.po_number ?? "",
    supplierId: row.supplier_id,
    warehouse: row.warehouse_name ?? row.warehouse_id,
    receivedDate: row.receipt_date,
    receivedBy: row.received_by ?? "—",
    status,
    receiveType: row.receive_type ?? undefined,
    lines,
    notes: row.notes ?? undefined,
    postedAt: row.posted_at ?? undefined,
  };
}

export async function fetchPurchaseReceipts(params?: {
  purchase_order_id?: string;
  status?: string;
}): Promise<ApiPurchaseReceiptListResponse> {
  const qs = new URLSearchParams();
  if (params?.purchase_order_id) qs.set("purchase_order_id", params.purchase_order_id);
  if (params?.status) qs.set("status", params.status);
  const query = qs.toString();
  return apiFetch(`/api/v1/purchase/receipts${query ? `?${query}` : ""}`);
}

export async function fetchPurchaseReceipt(id: string): Promise<ApiPurchaseReceipt> {
  const res = await apiFetch<ApiPurchaseReceiptResponse>(`/api/v1/purchase/receipts/${id}`);
  return res.data;
}

export async function createPurchaseReceipt(
  input: CreatePurchaseReceiptInput,
): Promise<ApiPurchaseReceipt> {
  const res = await apiFetch<ApiPurchaseReceiptResponse>("/api/v1/purchase/receipts", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function postPurchaseReceipt(id: string): Promise<ApiPurchaseReceipt> {
  const res = await apiFetch<ApiPurchaseReceiptResponse>(`/api/v1/purchase/receipts/${id}/post`, {
    method: "POST",
  });
  return res.data;
}

export async function cancelPurchaseReceipt(id: string): Promise<ApiPurchaseReceipt> {
  const res = await apiFetch<ApiPurchaseReceiptResponse>(`/api/v1/purchase/receipts/${id}/cancel`, {
    method: "POST",
  });
  return res.data;
}

export type ApiPurchaseReceiptLineCorrection = {
  id: string;
  purchase_receipt_id: string;
  purchase_receipt_line_id: string;
  old_quantity: number;
  new_quantity: number;
  reason: string;
  corrected_by: string;
  corrected_by_name: string;
  created_at: string;
};

/** Admin-only — fixes a mistaken received quantity on an already-posted receipt.
 * Adjusts the PO line, stock, and the linked Finance payable; every call is
 * written to a permanent audit trail (see fetchPurchaseReceiptCorrections). */
export async function correctPurchaseReceiptLine(
  receiptId: string,
  lineId: string,
  input: { new_quantity: number; reason: string },
): Promise<ApiPurchaseReceipt> {
  const res = await apiFetch<ApiPurchaseReceiptResponse>(
    `/api/v1/purchase/receipts/${receiptId}/lines/${lineId}/correct`,
    { method: "POST", body: JSON.stringify(input) },
  );
  return res.data;
}

export async function fetchPurchaseReceiptCorrections(
  receiptId: string,
): Promise<ApiPurchaseReceiptLineCorrection[]> {
  const res = await apiFetch<{ data: ApiPurchaseReceiptLineCorrection[] }>(
    `/api/v1/purchase/receipts/${receiptId}/corrections`,
  );
  return res.data;
}
