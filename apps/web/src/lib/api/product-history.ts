import { apiFetch } from "@/lib/api/client";
import { fetchItemStockLevels, type ApiStockLevel } from "@/lib/api/inventory";

/**
 * Product Drawer history endpoints — all keyed by the Universal Item id
 * (`Product.itemId`), not the catalog product id, because sales/purchase/stock
 * lines reference the item.
 *
 * Paging: the API is 1-based (`page=1` is the first page) like the rest of
 * `/api/v1`; callers pass the grid's 0-based page and `pagedQuery` converts.
 */

export type PagedParams = {
  /** 0-based grid page. */
  page?: number;
  perPage?: number;
};

export type DateRangeParams = {
  dateFrom?: string;
  dateTo?: string;
};

export type ProductHistoryMeta = {
  total: number;
  page: number;
  per_page: number;
};

export type SelectOption = { value: string; label: string };

function pagedQuery(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

function pageParams(params: PagedParams & DateRangeParams) {
  return {
    page: (params.page ?? 0) + 1,
    per_page: params.perPage,
    date_from: params.dateFrom,
    date_to: params.dateTo,
  };
}

const BASE = "/api/v1/inventory/products";

// ---------------------------------------------------------------- Sales

export type ProductSalesLine = {
  id: string;
  date: string;
  order_id: string | null;
  order_number: string | null;
  invoice_number: string | null;
  customer_id: string | null;
  customer_name: string | null;
  quantity: number;
  unit_price: string | number;
  line_total: string | number;
  status: string | null;
};

export type ProductSalesMeta = ProductHistoryMeta & {
  sum_qty: number;
  sum_total: string | number;
};

export async function fetchProductSales(
  itemId: string,
  params: PagedParams & DateRangeParams & { customerId?: string } = {},
): Promise<{ data: ProductSalesLine[]; meta: ProductSalesMeta }> {
  return apiFetch(
    `${BASE}/${itemId}/sales${pagedQuery({ ...pageParams(params), customer_id: params.customerId })}`,
  );
}

// ------------------------------------------------------------ Purchases

export type ProductPurchaseLine = {
  id: string;
  date: string;
  po_id: string | null;
  po_number: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  quantity_ordered: number;
  quantity_received: number;
  unit_cost: string | number;
  line_total: string | number;
  status: string | null;
};

export type ProductPurchaseMeta = ProductHistoryMeta & {
  /** Lowest, highest and average (total spent / total quantity) unit cost over the period; null with no purchases. */
  min_cost?: string | number | null;
  max_cost?: string | number | null;
  avg_cost?: string | number | null;
  sum_qty: number;
  sum_total: string | number;
};

export async function fetchProductPurchases(
  itemId: string,
  params: PagedParams & DateRangeParams = {},
): Promise<{ data: ProductPurchaseLine[]; meta: ProductPurchaseMeta }> {
  return apiFetch(`${BASE}/${itemId}/purchases${pagedQuery(pageParams(params))}`);
}

// --------------------------------------------------------------- Ledger

export type ProductLedgerLine = {
  id: string;
  date: string;
  reference: string | null;
  movement_type: string;
  movement_label: string;
  direction: "in" | "out" | string;
  qty_in: number;
  qty_out: number;
  balance: number;
  warehouse_id: string | null;
  warehouse_name: string | null;
  source_type: string | null;
  source_id: string | null;
  party_name: string | null;
  notes: string | null;
};

export type ProductLedgerMeta = ProductHistoryMeta & {
  opening_balance: number;
  closing_balance: number;
  movement_types: SelectOption[];
};

export async function fetchProductLedger(
  itemId: string,
  params: PagedParams & DateRangeParams & { movementType?: string; warehouseId?: string } = {},
): Promise<{ data: ProductLedgerLine[]; meta: ProductLedgerMeta }> {
  return apiFetch(
    `${BASE}/${itemId}/ledger${pagedQuery({
      ...pageParams(params),
      movement_type: params.movementType && params.movementType !== "all" ? params.movementType : undefined,
      warehouse_id: params.warehouseId,
    })}`,
  );
}

// ------------------------------------------------------- Warranty / RMA

export type ProductRmaLine = {
  id: string;
  rma_number: string | null;
  serial_number: string | null;
  customer_name: string | null;
  order_number: string | null;
  warranty_status: string | null;
  warranty_expires_on: string | null;
  status: string | null;
  resolution_type: string | null;
  created_at: string;
};

export async function fetchProductRma(
  itemId: string,
  params: PagedParams = {},
): Promise<{ data: ProductRmaLine[]; meta: ProductHistoryMeta }> {
  return apiFetch(`${BASE}/${itemId}/rma${pagedQuery(pageParams(params))}`);
}

// -------------------------------------------------------- Price history

export type ProductPriceHistoryLine = {
  id: string;
  date: string;
  price_type: string;
  price_label: string;
  old_price: string | number | null;
  new_price: string | number | null;
  changed_by_name: string | null;
};

export type ProductPriceHistoryMeta = ProductHistoryMeta & {
  price_types: SelectOption[];
};

export async function fetchProductPriceHistory(
  itemId: string,
  params: PagedParams = {},
): Promise<{ data: ProductPriceHistoryLine[]; meta: ProductPriceHistoryMeta }> {
  return apiFetch(`${BASE}/${itemId}/price-history${pagedQuery(pageParams(params))}`);
}

// ---------------------------------------------------------------- Stock

/** Per-warehouse stock rows for the drawer's Stock tab (`/inventory/stock?item_id=`). */
export async function fetchProductStockLevels(itemId: string): Promise<ApiStockLevel[]> {
  return fetchItemStockLevels(itemId);
}
