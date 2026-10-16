import { apiFetch } from "@/lib/api/client";
import type {
  SalesReturn,
  SalesReturnLine,
  SalesReturnReason,
  SalesReturnStatus,
} from "@/lib/sales/sales-returns";

export type ApiSalesReturnLine = {
  id: string;
  sales_order_line_id: string;
  item_id: string;
  sku: string | null;
  name: string | null;
  quantity_returned: number;
  unit_price: string;
  discount_amount: string;
  tax_rate: string;
  line_total: string;
  reason: string | null;
  notes: string | null;
  serial_numbers?: string[];
};

export type ApiSalesReturn = {
  id: string;
  company_id: string;
  return_number: string;
  sales_order_id: string;
  order_number: string | null;
  invoice_number: string | null;
  customer_id: string;
  customer_name: string | null;
  warehouse_id: string;
  warehouse_name: string | null;
  status: string;
  reason: string;
  return_date: string;
  requested_by: string | null;
  notes: string | null;
  subtotal: string;
  discount_amount: string;
  tax_amount: string;
  credit_amount: string;
  receivable_id: string | null;
  confirmed_at: string | null;
  credited_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  lines: ApiSalesReturnLine[];
};

export type ApiSalesReturnListResponse = {
  data: ApiSalesReturn[];
  meta: { count: number; page: number; per_page: number };
};

export type ApiSalesReturnResponse = {
  data: ApiSalesReturn;
};

export type CreateSalesReturnInput = {
  sales_order_id: string;
  reason: SalesReturnReason;
  return_date?: string;
  requested_by?: string;
  notes?: string;
  discount_amount?: number;
  /** Confirm + credit immediately (stock back, credit note posted). */
  auto_credit?: boolean;
  lines: {
    sales_order_line_id: string;
    quantity_returned: number;
    discount_amount?: number;
    reason?: SalesReturnReason;
    notes?: string;
    /** Which units come back on a partial return of a serial-tracked line; omitted = all. */
    serial_numbers?: string[];
  }[];
};

const STATUS: Record<string, SalesReturnStatus> = {
  draft: "draft",
  confirmed: "confirmed",
  credited: "credited",
  cancelled: "cancelled",
};

export function apiReturnToSalesReturn(row: ApiSalesReturn): SalesReturn {
  const status = STATUS[row.status] ?? "draft";
  const lines: SalesReturnLine[] = row.lines.map((line) => ({
    id: line.id,
    soLineId: line.sales_order_line_id,
    sku: line.sku ?? "",
    name: line.name ?? "",
    quantityReturn: line.quantity_returned,
    unitPrice: parseFloat(line.unit_price) || 0,
    reason: (line.reason as SalesReturnReason) ?? (row.reason as SalesReturnReason),
  }));

  return {
    id: row.id,
    number: row.return_number,
    salesOrderId: row.sales_order_id,
    orderNumber: row.order_number ?? "",
    invoiceNumber: row.invoice_number ?? undefined,
    customerId: row.customer_id,
    customerName: row.customer_name ?? "",
    warehouse: row.warehouse_name ?? row.warehouse_id,
    returnDate: row.return_date,
    requestedBy: row.requested_by ?? "—",
    status,
    reason: row.reason as SalesReturnReason,
    lines,
    creditAmount: parseFloat(row.credit_amount) || 0,
    notes: row.notes ?? undefined,
  };
}

export async function fetchSalesReturns(params?: {
  sales_order_id?: string;
  status?: string;
}): Promise<ApiSalesReturnListResponse> {
  const qs = new URLSearchParams();
  if (params?.sales_order_id) qs.set("sales_order_id", params.sales_order_id);
  if (params?.status) qs.set("status", params.status);
  const query = qs.toString();
  return apiFetch(`/api/v1/sales/returns${query ? `?${query}` : ""}`);
}

export async function fetchSalesReturn(id: string): Promise<ApiSalesReturn> {
  const res = await apiFetch<ApiSalesReturnResponse>(`/api/v1/sales/returns/${id}`);
  return res.data;
}

export async function createSalesReturn(input: CreateSalesReturnInput): Promise<ApiSalesReturn> {
  const res = await apiFetch<ApiSalesReturnResponse>("/api/v1/sales/returns", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function confirmSalesReturn(id: string): Promise<ApiSalesReturn> {
  const res = await apiFetch<ApiSalesReturnResponse>(`/api/v1/sales/returns/${id}/confirm`, {
    method: "POST",
  });
  return res.data;
}

export async function cancelSalesReturn(id: string): Promise<ApiSalesReturn> {
  const res = await apiFetch<ApiSalesReturnResponse>(`/api/v1/sales/returns/${id}/cancel`, {
    method: "POST",
  });
  return res.data;
}

export async function creditSalesReturn(id: string): Promise<ApiSalesReturn> {
  const res = await apiFetch<ApiSalesReturnResponse>(`/api/v1/sales/returns/${id}/credit`, {
    method: "POST",
  });
  return res.data;
}
