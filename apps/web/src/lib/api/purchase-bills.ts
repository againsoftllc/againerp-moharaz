import { apiFetch } from "@/lib/api/client";
import type { BillStatus, MatchStatus, VendorBill, VendorBillLine } from "@/lib/mock-data/purchase-bills";

const BASE = "/api/v1/purchase/bills";

export type ApiPurchaseBillLine = {
  id: string;
  purchase_order_line_id: string;
  sku: string;
  name: string;
  quantity_po: number;
  quantity_receipt: number;
  quantity_bill: number;
  unit_price_po: string;
  unit_price_bill: string;
  line_total: string;
};

export type ApiPurchaseBill = {
  id: string;
  company_id: string;
  bill_number: string;
  vendor_invoice_number: string | null;
  purchase_order_id: string;
  po_number: string | null;
  purchase_receipt_id: string | null;
  receipt_number: string | null;
  supplier_id: string;
  supplier_name: string | null;
  bill_date: string;
  due_date: string | null;
  status: BillStatus;
  match_status: MatchStatus;
  subtotal: string;
  total: string;
  payable_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_by_name: string;
  approved_by: string | null;
  approved_at: string | null;
  posted_by: string | null;
  posted_at: string | null;
  created_at: string;
  updated_at: string;
  lines: ApiPurchaseBillLine[];
};

function toVendorBillLine(l: ApiPurchaseBillLine): VendorBillLine {
  return {
    id: l.id,
    poLineId: l.purchase_order_line_id,
    sku: l.sku,
    name: l.name,
    quantityPo: l.quantity_po,
    quantityReceipt: l.quantity_receipt,
    quantityBill: l.quantity_bill,
    unitPricePo: Number(l.unit_price_po),
    unitPriceBill: Number(l.unit_price_bill),
  };
}

export function toVendorBill(b: ApiPurchaseBill): VendorBill {
  return {
    id: b.id,
    number: b.bill_number,
    vendorInvoiceNumber: b.vendor_invoice_number ?? "",
    purchaseOrderId: b.purchase_order_id,
    poNumber: b.po_number ?? "",
    receiptId: b.purchase_receipt_id ?? undefined,
    receiptNumber: b.receipt_number ?? undefined,
    supplierId: b.supplier_id,
    billDate: b.bill_date,
    dueDate: b.due_date ?? "",
    status: b.status,
    matchStatus: b.match_status,
    lines: b.lines.map(toVendorBillLine),
    total: Number(b.total),
    notes: b.notes ?? undefined,
  };
}

export async function fetchPurchaseBills(params?: { status?: string; supplier_id?: string; purchase_order_id?: string }) {
  const q = new URLSearchParams();
  if (params?.status && params.status !== "all") q.set("status", params.status);
  if (params?.supplier_id) q.set("supplier_id", params.supplier_id);
  if (params?.purchase_order_id) q.set("purchase_order_id", params.purchase_order_id);
  const s = q.toString();
  return apiFetch<{ data: ApiPurchaseBill[]; meta: { count: number; page: number; per_page: number } }>(
    `${BASE}${s ? `?${s}` : ""}`,
  );
}

export async function createPurchaseBill(input: {
  purchase_order_id: string;
  vendor_invoice_number?: string;
  bill_date: string;
  due_date?: string;
  notes?: string;
}) {
  return apiFetch<{ data: ApiPurchaseBill }>(BASE, { method: "POST", body: JSON.stringify(input) });
}

export async function matchPurchaseBill(id: string) {
  return apiFetch<{ data: ApiPurchaseBill }>(`${BASE}/${id}/match`, { method: "POST" });
}

export async function approvePurchaseBill(id: string) {
  return apiFetch<{ data: ApiPurchaseBill }>(`${BASE}/${id}/approve`, { method: "POST" });
}

export async function postPurchaseBill(id: string) {
  return apiFetch<{ data: ApiPurchaseBill; matched_existing_payable: boolean }>(`${BASE}/${id}/post`, {
    method: "POST",
  });
}

export async function deletePurchaseBill(id: string) {
  await apiFetch<void>(`${BASE}/${id}`, { method: "DELETE" });
}
