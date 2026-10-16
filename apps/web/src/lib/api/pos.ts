import { apiFetch } from "@/lib/api/client";

const BASE = "/api/v1/pos";

export type PosProduct = {
  item_id: string;
  sku: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  category: string | null;
  unit_price: number;
  on_hand: number;
  available: number;
  thumbnail: string | null;
  track_serial: boolean;
  warranty: string | null;
  warranty_end: string | null;
  scanned_serial?: string | null;
  serial_status?: string | null;
};

export type PosCartLine = {
  id: string;
  item_id: string;
  line_number: number;
  sku: string;
  name: string;
  quantity: number;
  unit_price: string;
  tax_rate: string;
  tax_amount: string;
  discount_amount: string;
  line_total: string;
  serial_number: string | null;
  warranty_text: string | null;
  thumbnail: string | null;
  available: number | null;
};

export type PosCart = {
  id: string;
  session_id: string;
  warehouse_id: string;
  customer_id: string | null;
  cart_number: string;
  status: string;
  subtotal: string;
  tax_total: string;
  discount_total: string;
  order_discount: string;
  total: string;
  sales_order_id: string | null;
  held_label: string | null;
  held_at: string | null;
  completed_at: string | null;
  notes: string | null;
  lines: PosCartLine[];
};

export type PosSession = {
  id: string;
  company_id: string;
  warehouse_id: string;
  terminal_id: string | null;
  register_name: string;
  cashier_id: string | null;
  cashier_name: string | null;
  status: string;
  opening_float: string;
  closing_cash: string | null;
  expected_cash: string | null;
  cash_variance: string | null;
  total_sales: string;
  total_returns: string;
  sale_count: number;
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
  opening_note: string | null;
  closing_note: string | null;
};

export type PosTerminal = {
  id: string;
  company_id: string;
  name: string;
  code: string;
  warehouse_id: string;
  default_cash_account_id: string | null;
  payment_methods: string[];
  receipt_printer: string | null;
  barcode_scanner: string | null;
  customer_display: string | null;
  status: string;
  created_at: string;
};

export type PosReceipt = {
  id: string;
  receipt_number: string;
  sales_order_id: string;
  invoice_number: string;
  receipt_data: Record<string, unknown>;
  printed_at: string | null;
  created_at: string;
};

export type PosPaymentInput = {
  payment_method: string;
  amount: number;
  reference?: string;
  card_last4?: string;
};

export type PosOrderSummary = {
  id: string;
  cart_number: string;
  status: string;
  customer_id: string | null;
  customer_name: string;
  item_count: number;
  total: number;
  discount_total: number;
  tax_total: number;
  payment_methods: string[];
  cashier_name: string | null;
  register_name: string | null;
  sales_order_id: string | null;
  receipt_id: string | null;
  invoice_number: string | null;
  completed_at: string | null;
  held_label: string | null;
  held_at: string | null;
  created_at: string | null;
};

export type PosDashboard = {
  open_session_count: number;
  completed_sale_count: number;
  held_cart_count: number;
  today: {
    sales_total: number;
    order_count: number;
    average_order: number;
    cash_sales: number;
    card_sales: number;
    digital_sales: number;
    returns: number;
    discounts: number;
    tax_collected: number;
    payments: Record<string, number>;
  };
  current_session: {
    id: string;
    status: string;
    register_name: string;
    terminal_id: string | null;
    terminal_name: string;
    warehouse_id: string;
    cashier_name: string | null;
    opening_float: number;
    cash_sales: number;
    cash_in: number;
    cash_out: number;
    cash_refunds: number;
    expected_cash: number;
    sale_count: number;
    total_sales: number;
    opened_at: string | null;
  } | null;
  recent_orders: PosOrderSummary[];
};

export type PosReturnRow = {
  id: string;
  return_number: string;
  original_sales_order_id: string;
  status: string;
  refund_total: string;
  refund_method: string;
  reason: string | null;
  created_at: string;
};

export type PosCashMovement = {
  id: string;
  session_id: string;
  direction: string;
  amount: string;
  reason: string;
  note: string | null;
  created_by_name: string | null;
  created_at: string;
};

export type PosSaleLookup = {
  sales_order_id: string;
  order_number: string;
  invoice_number: string | null;
  cart_id: string | null;
  cart_number: string | null;
  customer_id: string | null;
  customer_name: string | null;
  total: number;
  lines: {
    sales_order_line_id: string;
    item_id: string;
    sku: string;
    name: string;
    quantity_sold: number;
    quantity_returned: number;
    quantity_remaining: number;
    unit_price: number;
    line_total: number;
    serial_number: string | null;
  }[];
};

export type PosSettings = {
  default_customer_id: string | null;
  default_warehouse_id: string | null;
  default_tax_rate: number;
  default_payment_method: string;
  receipt_size: string;
  receipt_footer: string;
  return_policy: string;
  show_warranty: boolean;
  allow_discount: boolean;
  allow_price_override: boolean;
  require_customer: boolean;
  require_opening_cash: boolean;
  require_closing_cash: boolean;
  allow_negative_stock: boolean;
  logo_url: string | null;
};

export type PosReports = {
  financial: {
    gross_sales: number;
    discounts: number;
    tax: number;
    net_sales: number;
    refunds: number;
    order_count: number;
  };
  by_cashier: Record<string, { count: number; total: number }>;
  by_terminal: Record<string, { count: number; total: number }>;
  by_customer: Record<string, { count: number; total: number }>;
  by_payment_method: Record<string, number>;
  by_product: { sku: string; name: string; qty: number; total: number }[];
  sessions: {
    id: string;
    register_name: string;
    cashier_name: string | null;
    status: string;
    opening_cash: number;
    cash_sales: number;
    cash_in: number;
    cash_out: number;
    refunds: number;
    expected_cash: number;
    actual_cash: number | null;
    difference: number | null;
  }[];
  top_products: { name: string; qty: number; total: number }[];
  slow_products: { name: string; qty: number; total: number }[];
  low_stock: { sku: string; name: string; on_hand: number }[];
};

export const POS_SESSION_STORAGE_KEY = "againerp.pos.sessionId";

export function readStoredPosSessionId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(POS_SESSION_STORAGE_KEY);
}

export function storePosSessionId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) window.localStorage.setItem(POS_SESSION_STORAGE_KEY, id);
  else window.localStorage.removeItem(POS_SESSION_STORAGE_KEY);
}

export async function fetchPosDashboard(sessionId?: string | null): Promise<PosDashboard> {
  const qs = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : "";
  const res = await apiFetch<{ data: PosDashboard }>(`${BASE}/dashboard${qs}`, { cache: "no-store" });
  return res.data;
}

export async function fetchPosReports(): Promise<PosReports> {
  const res = await apiFetch<{ data: PosReports }>(`${BASE}/reports`, { cache: "no-store" });
  return res.data;
}

export async function fetchPosSettings(): Promise<PosSettings> {
  const res = await apiFetch<{ data: PosSettings }>(`${BASE}/settings`, { cache: "no-store" });
  return res.data;
}

export async function updatePosSettings(payload: Partial<PosSettings>): Promise<PosSettings> {
  const res = await apiFetch<{ data: PosSettings }>(`${BASE}/settings`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function fetchPosPaymentMethods(): Promise<{ id: string; label: string }[]> {
  const res = await apiFetch<{ data: { id: string; label: string }[] }>(`${BASE}/payment-methods`);
  return res.data;
}

export async function fetchPosWarehouses(): Promise<{ id: string; name: string; code: string; address: string | null }[]> {
  const res = await apiFetch<{ data: { id: string; name: string; code: string; address: string | null }[] }>(
    `${BASE}/warehouses`,
  );
  return res.data;
}

export async function fetchPosTerminals(status?: string): Promise<PosTerminal[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch<PosTerminal[]>(`${BASE}/terminals${qs}`, { cache: "no-store" });
}

export async function createPosTerminal(payload: {
  name: string;
  code: string;
  warehouse_id: string;
  payment_methods?: string[];
  receipt_printer?: string;
  barcode_scanner?: string;
  customer_display?: string;
  status?: string;
}): Promise<PosTerminal> {
  return apiFetch<PosTerminal>(`${BASE}/terminals`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updatePosTerminal(
  id: string,
  payload: Partial<{
    name: string;
    warehouse_id: string;
    payment_methods: string[];
    receipt_printer: string | null;
    barcode_scanner: string | null;
    customer_display: string | null;
    status: string;
  }>,
): Promise<PosTerminal> {
  return apiFetch<PosTerminal>(`${BASE}/terminals/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function fetchPosSessions(status?: string): Promise<PosSession[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch<PosSession[]>(`${BASE}/sessions${qs}`, { cache: "no-store" });
}

export async function fetchPosSession(id: string): Promise<PosSession> {
  return apiFetch<PosSession>(`${BASE}/sessions/${id}`, { cache: "no-store" });
}

export async function openPosSession(payload: {
  warehouse_id?: string;
  terminal_id?: string;
  register_name?: string;
  opening_float: number;
  opening_note?: string;
}): Promise<PosSession> {
  return apiFetch<PosSession>(`${BASE}/sessions/open`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function closePosSession(id: string, closingCash: number, notes?: string): Promise<PosSession> {
  return apiFetch<PosSession>(`${BASE}/sessions/${id}/close`, {
    method: "POST",
    body: JSON.stringify({ closing_cash: closingCash, notes }),
  });
}

export async function searchPosProducts(q: string, warehouseId: string): Promise<PosProduct[]> {
  return apiFetch<PosProduct[]>(
    `${BASE}/products/search?q=${encodeURIComponent(q)}&warehouse_id=${encodeURIComponent(warehouseId)}`,
    { cache: "no-store" },
  );
}

export async function browsePosProducts(params: {
  warehouseId: string;
  category?: string;
  q?: string;
}): Promise<PosProduct[]> {
  const qs = new URLSearchParams({ warehouse_id: params.warehouseId });
  if (params.category && params.category !== "all") qs.set("category", params.category);
  if (params.q) qs.set("q", params.q);
  return apiFetch<PosProduct[]>(`${BASE}/products/browse?${qs.toString()}`, { cache: "no-store" });
}

export async function fetchPosCategories(): Promise<string[]> {
  const res = await apiFetch<{ data: string[] }>(`${BASE}/products/categories`);
  return res.data;
}

export async function scanPosBarcode(barcode: string, warehouseId: string): Promise<PosProduct> {
  return apiFetch<PosProduct>(
    `${BASE}/products/scan?barcode=${encodeURIComponent(barcode)}&warehouse_id=${encodeURIComponent(warehouseId)}`,
    { cache: "no-store" },
  );
}

export async function fetchPosSerials(itemId: string, warehouseId: string) {
  return apiFetch<{ id: string; serial_number: string; status: string; warehouse_id: string | null }[]>(
    `${BASE}/products/${itemId}/serials?warehouse_id=${encodeURIComponent(warehouseId)}`,
    { cache: "no-store" },
  );
}

export async function fetchActiveCart(sessionId: string): Promise<PosCart> {
  return apiFetch<PosCart>(`${BASE}/sessions/${sessionId}/cart`, { cache: "no-store" });
}

export async function fetchPosCart(cartId: string): Promise<PosCart> {
  return apiFetch<PosCart>(`${BASE}/carts/${cartId}`, { cache: "no-store" });
}

export async function setPosCustomer(cartId: string, customerId: string | null): Promise<PosCart> {
  const qs = customerId ? `?customer_id=${encodeURIComponent(customerId)}` : "";
  return apiFetch<PosCart>(`${BASE}/carts/${cartId}/customer${qs}`, { method: "PATCH" });
}

export async function setPosOrderDiscount(cartId: string, amount: number): Promise<PosCart> {
  return apiFetch<PosCart>(`${BASE}/carts/${cartId}/discount`, {
    method: "PATCH",
    body: JSON.stringify({ amount }),
  });
}

export async function addPosLine(
  cartId: string,
  payload: {
    item_id: string;
    quantity?: number;
    unit_price?: number;
    tax_rate?: number;
    discount_amount?: number;
    serial_number?: string;
  },
): Promise<PosCart> {
  return apiFetch<PosCart>(`${BASE}/carts/${cartId}/lines`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updatePosLine(
  lineId: string,
  payload: { quantity?: number; discount_amount?: number; unit_price?: number; tax_rate?: number },
): Promise<PosCart> {
  return apiFetch<PosCart>(`${BASE}/cart-lines/${lineId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function removePosLine(lineId: string): Promise<void> {
  await apiFetch<void>(`${BASE}/cart-lines/${lineId}`, { method: "DELETE" });
}

export async function clearPosCart(cartId: string): Promise<PosCart> {
  return apiFetch<PosCart>(`${BASE}/carts/${cartId}/clear`, { method: "POST" });
}

export async function holdPosCart(cartId: string, label?: string): Promise<PosCart> {
  return apiFetch<PosCart>(`${BASE}/carts/${cartId}/hold`, {
    method: "POST",
    body: JSON.stringify({ label }),
  });
}

export async function resumePosCart(cartId: string): Promise<PosCart> {
  return apiFetch<PosCart>(`${BASE}/carts/${cartId}/resume`, { method: "POST" });
}

export async function fetchHeldCarts(sessionId: string): Promise<PosCart[]> {
  return apiFetch<PosCart[]>(`${BASE}/sessions/${sessionId}/held`, { cache: "no-store" });
}

export async function fetchPosOrders(params?: {
  status?: string;
  sessionId?: string;
  q?: string;
}): Promise<PosOrderSummary[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.sessionId) qs.set("session_id", params.sessionId);
  if (params?.q) qs.set("q", params.q);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await apiFetch<{ data: PosOrderSummary[] }>(`${BASE}/orders${suffix}`, { cache: "no-store" });
  return res.data;
}

export async function completePosCart(
  cartId: string,
  payments: PosPaymentInput[],
  clientMutationId?: string,
): Promise<{ cart: PosCart; receipt: PosReceipt }> {
  return apiFetch<{ cart: PosCart; receipt: PosReceipt }>(`${BASE}/carts/${cartId}/complete`, {
    method: "POST",
    body: JSON.stringify({
      payments,
      client_mutation_id: clientMutationId,
    }),
  });
}

export async function fetchPosReceipts(): Promise<PosReceipt[]> {
  return apiFetch<PosReceipt[]>(`${BASE}/receipts`, { cache: "no-store" });
}

export async function fetchPosReceipt(id: string): Promise<PosReceipt> {
  return apiFetch<PosReceipt>(`${BASE}/receipts/${id}`, { cache: "no-store" });
}

export async function markPosReceiptPrinted(id: string): Promise<PosReceipt> {
  return apiFetch<PosReceipt>(`${BASE}/receipts/${id}/print`, { method: "POST" });
}

export async function fetchPosPayments(sessionId?: string) {
  const qs = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : "";
  const res = await apiFetch<{
    data: {
      id: string;
      cart_id: string;
      cart_number: string;
      payment_method: string;
      amount: string;
      reference: string | null;
      created_at: string | null;
    }[];
  }>(`${BASE}/payments${qs}`, { cache: "no-store" });
  return res.data;
}

export async function lookupPosSale(q: string): Promise<PosSaleLookup> {
  const res = await apiFetch<{ data: PosSaleLookup }>(`${BASE}/lookup?q=${encodeURIComponent(q)}`, {
    cache: "no-store",
  });
  return res.data;
}

export async function fetchPosReturns(sessionId?: string): Promise<PosReturnRow[]> {
  const qs = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : "";
  const res = await apiFetch<{ data: PosReturnRow[] }>(`${BASE}/returns${qs}`, { cache: "no-store" });
  return res.data;
}

export async function createPosReturn(
  sessionId: string,
  payload: {
    original_sales_order_id: string;
    lines: {
      item_id: string;
      quantity: number;
      refund_amount: number;
      sales_order_line_id?: string;
      serial_number?: string;
    }[];
    refund_method: string;
    reason?: string;
  },
): Promise<PosReturnRow> {
  return apiFetch<PosReturnRow>(`${BASE}/sessions/${sessionId}/returns`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchPosCash(sessionId?: string): Promise<PosCashMovement[]> {
  const qs = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : "";
  return apiFetch<PosCashMovement[]>(`${BASE}/cash${qs}`, { cache: "no-store" });
}

export async function addPosCashMovement(
  sessionId: string,
  payload: { direction: "in" | "out"; amount: number; reason: string; note?: string },
): Promise<PosCashMovement> {
  return apiFetch<PosCashMovement>(`${BASE}/sessions/${sessionId}/cash`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
