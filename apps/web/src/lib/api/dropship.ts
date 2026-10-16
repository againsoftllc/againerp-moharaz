import { apiFetch } from "@/lib/api/client";

export type DropshipLine = {
  product_id: string;
  sku: string;
  name: string;
  quantity: number;
  unit_price_bdt: number;
  elim_id?: string | null;
  platform?: string | null;
  supplier_link?: string | null;
  cost_cny?: number | null;
  cost_bdt?: number | null;
  profit_bdt?: number | null;
  server_charge_bdt?: number | null;
  exchange_rate?: number | null;
};

export type DropshipOrder = {
  order_id: string;
  order_number: string;
  customer_name: string;
  status: string;
  grand_total: number;
  supplier_order_status: string;
  supplier_order_id?: string | null;
  supplier_notes?: string | null;
  has_dropship_items: boolean;
  lines: DropshipLine[];
};

export async function fetchDropshipOrders() {
  return apiFetch<{ count: number; data: DropshipOrder[] }>("/api/v1/commerce/dropship/orders");
}

export async function updateDropshipOrder(
  orderId: string,
  payload: {
    supplier_order_status?: string;
    supplier_order_id?: string;
    supplier_notes?: string;
  },
) {
  return apiFetch<DropshipOrder>(`/api/v1/commerce/dropship/orders/${orderId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
