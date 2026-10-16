import type {
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseOrderStatus,
} from "@/lib/mock-data/purchase-orders";
import { apiFetch } from "@/lib/api/client";

export type ApiPurchaseOrderLine = {
  id: string;
  item_id: string;
  supplier_id: string;
  line_number: number;
  sku: string;
  name: string;
  quantity_ordered: number;
  quantity_received: number;
  quantity_remaining?: number;
  quantity_returned?: number;
  tracking_type?: "none" | "serial" | "batch";
  unit_cost: string;
  tax_rate: string;
  tax_amount: string;
  discount_amount: string;
  line_total: string;
  notes: string | null;
};

export type ApiPurchaseOrder = {
  id: string;
  company_id: string;
  po_number: string;
  supplier_id: string;
  supplier_name: string | null;
  warehouse_id: string;
  warehouse_name: string | null;
  status: string;
  order_date: string;
  expected_date: string | null;
  buyer_name: string | null;
  notes: string | null;
  subtotal: string;
  tax_total: string;
  discount_total: string;
  total: string;
  allow_over_receive: boolean;
  payment_status: string | null;
  payment_due: string;
  created_by: string | null;
  created_by_name: string;
  confirmed_by: string | null;
  confirmed_by_name: string | null;
  confirmed_at: string | null;
  cancelled_by: string | null;
  cancelled_by_name: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  lines: ApiPurchaseOrderLine[];
};

export type ApiPurchaseOrderListResponse = {
  data: ApiPurchaseOrder[];
  meta: { count: number; page: number; per_page: number };
};

export type ApiPurchaseOrderResponse = {
  data: ApiPurchaseOrder;
};

export type ApiPurchaseStatusHistory = {
  id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string | null;
  notes: string | null;
  created_at: string;
};

export type ApiPurchaseDashboard = {
  open_po_count: number;
  pending_receive_count: number;
  completed_count: number;
  spend_total: string;
  status_breakdown: Record<string, number>;
  recent_orders: ApiPurchaseOrder[];
};

export type PurchaseOrderListParams = {
  status?: string;
  supplier_id?: string;
  page?: number;
  per_page?: number;
};

export type CreatePurchaseOrderLineInput = {
  item_id?: string;
  sku?: string;
  quantity_ordered: number;
  unit_cost: number;
  tax_rate?: number;
  discount_amount?: number;
  notes?: string;
};

export type CreatePurchaseOrderInput = {
  supplier_id: string;
  warehouse_id: string;
  order_date?: string;
  expected_date?: string;
  buyer_name?: string;
  notes?: string;
  allow_over_receive?: boolean;
  lines: CreatePurchaseOrderLineInput[];
};

const API_TO_UI_STATUS: Record<string, PurchaseOrderStatus> = {
  draft: "draft",
  confirmed: "confirmed",
  partial_received: "partial_received",
  completed: "completed",
  cancelled: "cancelled",
};

export function apiPurchaseOrderToPurchaseOrder(row: ApiPurchaseOrder): PurchaseOrder {
  const status = API_TO_UI_STATUS[row.status] ?? "draft";
  const lines: PurchaseOrderLine[] = row.lines.map((line) => ({
    id: line.id,
    productId: line.item_id,
    itemId: line.item_id,
    sku: line.sku,
    name: line.name,
    quantityOrdered: line.quantity_ordered,
    quantityReceived: line.quantity_received,
    quantityBilled: 0,
    quantityReturned: line.quantity_returned ?? 0,
    unitPrice: parseFloat(line.unit_cost) || 0,
    taxRate: parseFloat(line.tax_rate) || 0,
    discountAmount: parseFloat(line.discount_amount) || 0,
  }));

  return {
    id: row.id,
    number: row.po_number,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name ?? undefined,
    warehouseId: row.warehouse_id,
    orderDate: row.order_date,
    expectedDate: row.expected_date ?? row.order_date,
    warehouse: row.warehouse_name ?? row.warehouse_id,
    buyer: row.buyer_name ?? "—",
    total: parseFloat(row.total) || 0,
    status,
    paymentStatus: (row.payment_status as PurchaseOrder["paymentStatus"]) ?? "not_billed",
    paymentDue: parseFloat(row.payment_due) || 0,
    createdByName: row.created_by_name,
    lines,
    receiptIds: [],
    billIds: [],
    returnIds: [],
    notes: row.notes ?? undefined,
    allowOverReceive: row.allow_over_receive,
  };
}

export function buildPurchaseOrderQuery(params?: PurchaseOrderListParams): string {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.supplier_id) qs.set("supplier_id", params.supplier_id);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.per_page) qs.set("per_page", String(params.per_page));
  const query = qs.toString();
  return query ? `?${query}` : "";
}

export async function fetchPurchaseOrders(
  params?: PurchaseOrderListParams,
): Promise<ApiPurchaseOrderListResponse> {
  return apiFetch(`/api/v1/purchase/orders${buildPurchaseOrderQuery(params)}`);
}

export async function fetchPurchaseOrder(id: string): Promise<ApiPurchaseOrder> {
  const res = await apiFetch<ApiPurchaseOrderResponse>(`/api/v1/purchase/orders/${id}`);
  return res.data;
}

export async function createPurchaseOrder(
  input: CreatePurchaseOrderInput,
): Promise<ApiPurchaseOrder> {
  const res = await apiFetch<ApiPurchaseOrderResponse>("/api/v1/purchase/orders", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function updatePurchaseOrder(
  id: string,
  input: CreatePurchaseOrderInput,
): Promise<ApiPurchaseOrder> {
  const res = await apiFetch<ApiPurchaseOrderResponse>(`/api/v1/purchase/orders/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function updatePurchaseOrderStatus(
  id: string,
  status: string,
): Promise<ApiPurchaseOrder> {
  const res = await apiFetch<ApiPurchaseOrderResponse>(`/api/v1/purchase/orders/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  return res.data;
}

export async function confirmPurchaseOrder(id: string): Promise<ApiPurchaseOrder> {
  const res = await apiFetch<ApiPurchaseOrderResponse>(`/api/v1/purchase/orders/${id}/confirm`, {
    method: "POST",
  });
  return res.data;
}

export async function cancelPurchaseOrder(id: string): Promise<ApiPurchaseOrder> {
  const res = await apiFetch<ApiPurchaseOrderResponse>(`/api/v1/purchase/orders/${id}/cancel`, {
    method: "POST",
  });
  return res.data;
}

export async function deletePurchaseOrder(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/purchase/orders/${id}`, { method: "DELETE" });
}

export async function bulkDeletePurchaseOrders(
  ids: string[],
): Promise<{ deleted: number; skipped: string[] }> {
  const res = await apiFetch<{ data: { deleted: number; skipped: string[] } }>(
    "/api/v1/purchase/orders/bulk-delete",
    { method: "POST", body: JSON.stringify({ ids }) },
  );
  return res.data;
}

export async function fetchPurchaseOrderHistory(id: string): Promise<ApiPurchaseStatusHistory[]> {
  const res = await apiFetch<{ data: ApiPurchaseStatusHistory[] }>(
    `/api/v1/purchase/orders/${id}/history`,
  );
  return res.data;
}

export async function fetchPurchaseDashboard(): Promise<ApiPurchaseDashboard> {
  const res = await apiFetch<{ data: ApiPurchaseDashboard }>("/api/v1/purchase/dashboard");
  return res.data;
}

export type ApiPurchasePriceLine = {
  id: string;
  sku: string;
  name: string;
  supplier_id: string | null;
  supplier_name: string | null;
  on_hand: number;
  stock_cost: string;
  default_purchase_price: string | null;
  last_purchase_price: string | null;
  avg_purchase_price: string | null;
  min_purchase_price: string | null;
  max_purchase_price: string | null;
  last_purchase_date: string | null;
  last_po_number: string | null;
  days_since_last: number | null;
  po_count: number;
  qty_purchased: number;
  total_spend: string;
  vs_avg: string | null;
  vs_default: string | null;
};

export type ApiPurchasePriceReport = {
  data: ApiPurchasePriceLine[];
  meta: {
    count: number;
    sku_count: number;
    total_on_hand: number;
    total_spend: string;
    last_above_avg_count: number;
    last_below_avg_count: number;
    last_above_default_count: number;
    last_below_default_count: number;
    missing_default_count: number;
    never_purchased_count: number;
    stale_90d_count: number;
  };
  errors?: string[];
};

export async function fetchPurchasePriceReport(params?: {
  supplierId?: string;
}): Promise<ApiPurchasePriceReport> {
  const q = new URLSearchParams();
  if (params?.supplierId) q.set("supplier_id", params.supplierId);
  const query = q.toString();
  return apiFetch<ApiPurchasePriceReport>(
    `/api/v1/purchase/reports/prices${query ? `?${query}` : ""}`,
  );
}

export function purchaseOrderReceivedPct(order: PurchaseOrder): number {
  const ordered = order.lines.reduce((s, l) => s + l.quantityOrdered, 0);
  const received = order.lines.reduce((s, l) => s + l.quantityReceived, 0);
  if (ordered <= 0) return 0;
  return Math.round((received / ordered) * 100);
}

export function formatPurchaseOrderVendor(order: PurchaseOrder): string {
  return order.supplierName ?? order.supplierId;
}

export function isPurchaseOrderReceivable(status: PurchaseOrderStatus): boolean {
  return status === "confirmed" || status === "partial_received";
}

export type SupplierStockReportRow = {
  itemId: string;
  sku: string;
  name: string;
  purchasedQty: number;
  totalSold: number;
  totalTransferred: number;
  returnedQty: number;
  currentStock: number;
  stockValue: number;
};

export async function fetchSupplierStockReport(supplierId: string): Promise<SupplierStockReportRow[]> {
  const res = await apiFetch<{
    data: {
      item_id: string;
      sku: string;
      name: string;
      purchased_qty: number;
      total_sold: number;
      total_transferred: number;
      returned_qty: number;
      current_stock: number;
      // FastAPI serialises Pydantic Decimal fields as JSON strings, not numbers.
      stock_value: string | number;
    }[];
  }>(`/api/v1/purchase/orders/supplier-stock-report?supplier_id=${encodeURIComponent(supplierId)}`);
  return res.data.map((row) => ({
    itemId: row.item_id,
    sku: row.sku,
    name: row.name,
    purchasedQty: row.purchased_qty,
    totalSold: row.total_sold,
    totalTransferred: row.total_transferred,
    returnedQty: row.returned_qty,
    currentStock: row.current_stock,
    stockValue: Number(row.stock_value) || 0,
  }));
}
