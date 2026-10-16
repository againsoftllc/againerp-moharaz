import type { StockItem, StockStatus, Warehouse } from "@/lib/mock-data/inventory";
import { apiFetch } from "@/lib/api/client";

export type ApiWarehouse = {
  id: string;
  company_id: string;
  branch_id?: string | null;
  branch_name?: string | null;
  code: string;
  name: string;
  type: string;
  address: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  country?: string | null;
  mobile?: string | null;
  alternate_contact?: string | null;
  email?: string | null;
  website?: string | null;
  invoice_layout?: string | null;
  payment_option?: string | null;
  locations_count: number;
  is_active: boolean;
  is_default?: boolean;
  sort_order: number;
  total_units: number;
  created_at: string;
  updated_at: string;
};

export type ApiWarehouseListResponse = {
  data: ApiWarehouse[];
  meta: { count: number };
};

export type ApiWarehouseResponse = {
  data: ApiWarehouse;
};

export type ApiStockLevel = {
  id: string;
  company_id: string;
  warehouse_id: string;
  warehouse_name: string;
  variant_id: string;
  product_id: string;
  item_id?: string | null;
  sku: string;
  name: string;
  on_hand: number;
  reserved: number;
  available: number;
  incoming: number;
  projected?: number;
  tracking_type?: "none" | "serial" | "batch" | string;
  min_qty: number;
  max_qty: number;
  reorder_level: number;
  unit_cost: string;
  /** Server-computed on_hand × unit_cost. */
  stock_value?: string;
  warehouse_code?: string | null;
  status: string;
  thumbnail: string | null;
  created_at: string;
  updated_at: string;
};

export type ApiStockMovement = {
  id: string;
  item_id: string;
  sku?: string | null;
  name?: string | null;
  thumbnail?: string | null;
  warehouse_id: string;
  warehouse_name?: string | null;
  movement_type: string;
  quantity: number;
  qty_before: number;
  qty_after: number;
  source_warehouse_id?: string | null;
  dest_warehouse_id?: string | null;
  reference?: string | null;
  notes?: string | null;
  created_at: string;
};

export type ApiInventoryDashboardAlert = {
  sku: string;
  product: string;
  stock: number;
  threshold: number;
  status: string;
};

export type ApiInventoryDashboard = {
  total_skus: number;
  total_units: number;
  total_value: string;
  low_stock_count: number;
  out_of_stock_count: number;
  warehouse_count: number;
  movement_count_7d: number;
  alerts?: ApiInventoryDashboardAlert[];
};

export type ApiStockListResponse = {
  data: ApiStockLevel[];
  meta: {
    count: number;
    total_units: number;
    total_value: string;
  };
};

export type ApiStockResponse = {
  data: ApiStockLevel;
};

export type StockListParams = {
  search?: string;
  warehouse?: string;
  warehouse_id?: string;
  product_id?: string;
  item_id?: string;
  status?: string;
  limit?: number;
};

export function apiWarehouseToWarehouse(row: ApiWarehouse): Warehouse {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    branchId: row.branch_id ?? null,
    branchName: row.branch_name ?? "",
    address: row.address ?? "",
    city: row.city ?? "",
    state: row.state ?? "",
    zipCode: row.zip_code ?? "",
    country: row.country ?? "",
    mobile: row.mobile ?? "",
    alternateContact: row.alternate_contact ?? "",
    email: row.email ?? "",
    website: row.website ?? "",
    invoiceLayout: row.invoice_layout ?? "",
    paymentOption: row.payment_option ?? "",
    locations: row.locations_count,
    totalUnits: row.total_units,
    active: row.is_active,
    isDefault: row.is_default ?? false,
    sortOrder: row.sort_order,
  };
}

export function apiStockToStockItem(row: ApiStockLevel): StockItem {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    warehouse: row.warehouse_name,
    onHand: row.on_hand,
    reserved: row.reserved,
    available: row.available,
    incoming: row.incoming,
    projected: row.projected ?? row.available + row.incoming,
    minQty: row.min_qty,
    maxQty: row.max_qty,
    status: row.status as StockStatus,
    unitCost: Number(row.unit_cost),
    updatedAt: row.updated_at.slice(0, 10),
    thumbnail: row.thumbnail ?? undefined,
    warehouseId: row.warehouse_id,
    warehouseCode: row.warehouse_code ?? undefined,
    productId: row.product_id,
    itemId: row.item_id ?? null,
    reorderLevel: row.reorder_level,
    stockValue: Number(row.stock_value ?? Number(row.unit_cost) * row.on_hand),
  };
}

export function buildStockQuery(params?: StockListParams): string {
  if (!params) return "";
  const q = new URLSearchParams();
  if (params.search) q.set("search", params.search);
  if (params.warehouse) q.set("warehouse", params.warehouse);
  if (params.warehouse_id) q.set("warehouse_id", params.warehouse_id);
  if (params.product_id) q.set("product_id", params.product_id);
  if (params.item_id) q.set("item_id", params.item_id);
  if (params.status) q.set("status", params.status);
  if (params.limit) q.set("limit", String(params.limit));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export type UpdateStockLevelInput = {
  minQty?: number;
  maxQty?: number;
  reorderLevel?: number;
  unitCost?: number;
};

export function stockUpdateToApiPayload(input: UpdateStockLevelInput) {
  return {
    min_qty: input.minQty,
    max_qty: input.maxQty,
    reorder_level: input.reorderLevel,
    unit_cost: input.unitCost,
  };
}

/** Load stock levels for a warehouse or product from the Inventory module API. */
export async function fetchStockLevels(params?: StockListParams): Promise<ApiStockLevel[]> {
  const res = await apiFetch<ApiStockListResponse>(`/api/v1/inventory/stock${buildStockQuery(params)}`);
  return res.data;
}

/** Load stock levels for a catalog product from the Inventory module API. */
export async function fetchProductStockLevels(productId: string): Promise<ApiStockLevel[]> {
  const res = await apiFetch<ApiStockListResponse>(
    `/api/v1/inventory/stock${buildStockQuery({ product_id: productId })}`,
  );
  return res.data;
}

/** Load stock levels by Universal Item id. */
export async function fetchItemStockLevels(itemId: string): Promise<ApiStockLevel[]> {
  const res = await apiFetch<ApiStockListResponse>(
    `/api/v1/inventory/stock${buildStockQuery({ item_id: itemId })}`,
  );
  return res.data;
}

export async function fetchInventoryDashboard(): Promise<ApiInventoryDashboard> {
  const res = await apiFetch<{ data: ApiInventoryDashboard }>("/api/v1/inventory/dashboard");
  return res.data;
}

export type StockAdjustInput = {
  movementType: "in" | "out" | "transfer" | "adjustment";
  quantity: number;
  destWarehouseId?: string;
  reference?: string;
  notes?: string;
};

/** Retired. One-shot /stock/{id}/adjust returns 410. Use document APIs instead. */
export async function adjustStockLevel(
  _id: string,
  _input: StockAdjustInput,
): Promise<ApiStockLevel> {
  throw new Error(
    "One-shot stock adjust is retired. Use Stock Adjustments, Stock Transfers, or Stock Counts.",
  );
}

export type WarehouseInput = {
  code: string;
  name: string;
  type: string;
  branchId?: string | null;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  mobile?: string;
  alternateContact?: string;
  email?: string;
  website?: string;
  invoiceLayout?: string;
  paymentOption?: string;
  locationsCount?: number;
  isActive?: boolean;
  isDefault?: boolean;
  sortOrder?: number;
};

function blankToNull(value?: string) {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed || null;
}

function warehousePayload(input: Partial<WarehouseInput>) {
  const body: Record<string, unknown> = {};
  if (input.code !== undefined) body.code = input.code;
  if (input.name !== undefined) body.name = input.name;
  if (input.type !== undefined) body.type = input.type;
  if (input.branchId !== undefined) body.branch_id = input.branchId || null;
  if (input.address !== undefined) body.address = blankToNull(input.address);
  if (input.city !== undefined) body.city = blankToNull(input.city);
  if (input.state !== undefined) body.state = blankToNull(input.state);
  if (input.zipCode !== undefined) body.zip_code = blankToNull(input.zipCode);
  if (input.country !== undefined) body.country = blankToNull(input.country);
  if (input.mobile !== undefined) body.mobile = blankToNull(input.mobile);
  if (input.alternateContact !== undefined) {
    body.alternate_contact = blankToNull(input.alternateContact);
  }
  if (input.email !== undefined) body.email = blankToNull(input.email);
  if (input.website !== undefined) body.website = blankToNull(input.website);
  if (input.invoiceLayout !== undefined) body.invoice_layout = blankToNull(input.invoiceLayout);
  if (input.paymentOption !== undefined) body.payment_option = blankToNull(input.paymentOption);
  if (input.locationsCount !== undefined) body.locations_count = input.locationsCount;
  if (input.isActive !== undefined) body.is_active = input.isActive;
  if (input.isDefault !== undefined) body.is_default = input.isDefault;
  if (input.sortOrder !== undefined) body.sort_order = input.sortOrder;
  return body;
}

export async function listWarehouses(): Promise<Warehouse[]> {
  const res = await apiFetch<ApiWarehouseListResponse>("/api/v1/inventory/warehouses");
  return (res.data ?? []).map(apiWarehouseToWarehouse);
}

export async function createWarehouse(input: WarehouseInput): Promise<Warehouse> {
  const res = await apiFetch<ApiWarehouseResponse>("/api/v1/inventory/warehouses", {
    method: "POST",
    body: JSON.stringify(warehousePayload(input)),
  });
  return apiWarehouseToWarehouse(res.data);
}

export async function updateWarehouse(
  id: string,
  input: Partial<WarehouseInput>,
): Promise<Warehouse> {
  const res = await apiFetch<ApiWarehouseResponse>(`/api/v1/inventory/warehouses/${id}`, {
    method: "PATCH",
    body: JSON.stringify(warehousePayload(input)),
  });
  return apiWarehouseToWarehouse(res.data);
}

export async function deleteWarehouse(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/inventory/warehouses/${id}`, { method: "DELETE" });
}

export async function fetchStockMovements(params?: {
  item_id?: string;
  warehouse_id?: string;
  movement_type?: string;
  limit?: number;
}): Promise<ApiStockMovement[]> {
  const q = new URLSearchParams();
  if (params?.item_id) q.set("item_id", params.item_id);
  if (params?.warehouse_id) q.set("warehouse_id", params.warehouse_id);
  if (params?.movement_type) q.set("movement_type", params.movement_type);
  if (params?.limit) q.set("limit", String(params.limit));
  const query = q.toString();
  const res = await apiFetch<{ data: ApiStockMovement[] }>(
    `/api/v1/inventory/movements${query ? `?${query}` : ""}`,
  );
  return res.data;
}

export type ApiLocation = {
  id: string;
  company_id: string;
  warehouse_id: string;
  code: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ApiLocationListResponse = {
  data: ApiLocation[];
  meta: { count: number };
};

export type ApiLocationResponse = {
  data: ApiLocation;
};

export type LocationInput = {
  warehouseId: string;
  code: string;
  name: string;
  isActive?: boolean;
  sortOrder?: number;
  notes?: string;
};

function locationPayload(input: Partial<LocationInput>) {
  return {
    warehouse_id: input.warehouseId,
    code: input.code,
    name: input.name,
    is_active: input.isActive,
    sort_order: input.sortOrder,
    notes: input.notes || null,
  };
}

export async function fetchLocations(params?: {
  warehouse_id?: string;
  is_active?: boolean;
  q?: string;
}): Promise<ApiLocation[]> {
  const q = new URLSearchParams();
  if (params?.warehouse_id) q.set("warehouse_id", params.warehouse_id);
  if (params?.is_active !== undefined) q.set("is_active", String(params.is_active));
  if (params?.q) q.set("q", params.q);
  const query = q.toString();
  const res = await apiFetch<ApiLocationListResponse>(
    `/api/v1/inventory/locations${query ? `?${query}` : ""}`,
  );
  return res.data;
}

export async function createLocation(input: LocationInput): Promise<ApiLocation> {
  const res = await apiFetch<ApiLocationResponse>("/api/v1/inventory/locations", {
    method: "POST",
    body: JSON.stringify(locationPayload(input)),
  });
  return res.data;
}

export async function updateLocation(
  id: string,
  input: Partial<LocationInput>,
): Promise<ApiLocation> {
  const res = await apiFetch<ApiLocationResponse>(`/api/v1/inventory/locations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(locationPayload(input)),
  });
  return res.data;
}

export async function deleteLocation(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/inventory/locations/${id}`, { method: "DELETE" });
}

export type ApiStockCountLine = {
  id: string;
  item_id: string;
  sku: string;
  name: string;
  expected_qty: number;
  counted_qty: number | null;
  variance: number | null;
  tracking_type?: string;
  expected_serials?: string[];
  counted_serials?: string[];
  unit_cost: string | null;
  notes: string | null;
};

export type ApiStockCount = {
  id: string;
  company_id: string;
  count_number: string;
  warehouse_id: string;
  warehouse_name: string | null;
  status: "draft" | "completed" | "cancelled";
  count_date: string;
  counted_by: string | null;
  notes: string | null;
  posted_at: string | null;
  posted_by: string | null;
  line_count: number;
  variance_count: number;
  lines: ApiStockCountLine[];
  created_at: string;
  updated_at: string;
};

export type ApiStockCountListResponse = {
  data: ApiStockCount[];
  meta: { count: number };
};

export type ApiStockCountResponse = {
  data: ApiStockCount;
};

export async function fetchStockCounts(params?: {
  warehouse_id?: string;
  status?: string;
}): Promise<ApiStockCount[]> {
  const q = new URLSearchParams();
  if (params?.warehouse_id) q.set("warehouse_id", params.warehouse_id);
  if (params?.status) q.set("status", params.status);
  const query = q.toString();
  const res = await apiFetch<ApiStockCountListResponse>(
    `/api/v1/inventory/stock-counts${query ? `?${query}` : ""}`,
  );
  return res.data;
}

export async function fetchStockCount(id: string): Promise<ApiStockCount> {
  const res = await apiFetch<ApiStockCountResponse>(`/api/v1/inventory/stock-counts/${id}`);
  return res.data;
}

export async function createStockCount(input: { warehouseId: string; notes?: string }): Promise<ApiStockCount> {
  const res = await apiFetch<ApiStockCountResponse>("/api/v1/inventory/stock-counts", {
    method: "POST",
    body: JSON.stringify({ warehouse_id: input.warehouseId, notes: input.notes || null }),
  });
  return res.data;
}

export async function updateStockCountLine(
  countId: string,
  lineId: string,
  countedQty: number | null,
  countedSerials?: string[],
): Promise<ApiStockCount> {
  const res = await apiFetch<ApiStockCountResponse>(
    `/api/v1/inventory/stock-counts/${countId}/lines/${lineId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        counted_qty: countedQty,
        counted_serials: countedSerials,
      }),
    },
  );
  return res.data;
}

export async function postStockCount(id: string): Promise<ApiStockCount> {
  const res = await apiFetch<ApiStockCountResponse>(`/api/v1/inventory/stock-counts/${id}/post`, {
    method: "POST",
  });
  return res.data;
}

export async function cancelStockCount(id: string): Promise<ApiStockCount> {
  const res = await apiFetch<ApiStockCountResponse>(`/api/v1/inventory/stock-counts/${id}/cancel`, {
    method: "POST",
  });
  return res.data;
}

export async function deleteStockCount(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/inventory/stock-counts/${id}`, { method: "DELETE" });
}

export type ApiReorderSuggestion = {
  item_id: string;
  sku: string;
  name: string;
  warehouse_id: string;
  warehouse_name: string | null;
  on_hand: number;
  reserved: number;
  available: number;
  reorder_level: number;
  max_qty: number;
  suggested_qty: number;
  preferred_supplier_id: string | null;
  preferred_supplier_name: string | null;
};

export async function fetchReorderSuggestions(warehouseId?: string): Promise<ApiReorderSuggestion[]> {
  const q = new URLSearchParams();
  if (warehouseId) q.set("warehouse_id", warehouseId);
  const query = q.toString();
  const res = await apiFetch<{ data: ApiReorderSuggestion[] }>(
    `/api/v1/inventory/reports/reorder-suggestions${query ? `?${query}` : ""}`,
  );
  return res.data;
}

export type ApiOnHandLine = {
  id: string;
  sku: string;
  name: string;
  warehouse_id: string;
  warehouse_name: string | null;
  on_hand: number;
  reserved: number;
  available: number;
  incoming: number;
  unit_cost: string;
  stock_value: string;
  status: string;
};

export type ApiOnHandReport = {
  data: ApiOnHandLine[];
  meta: {
    count: number;
    total_units: number;
    total_value: string;
    reserved_units: number;
    available_units: number;
    low_stock_count: number;
    out_of_stock_count: number;
  };
};

export type ApiValuationLine = {
  id: string;
  sku: string;
  name: string;
  warehouse_id: string;
  warehouse_name: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  on_hand: number;
  unit_cost: string;
  stock_value: string;
  sale_price: string;
  sales_value: string;
  profit: string;
};

export type ApiValuationGroup = {
  warehouse_id: string;
  warehouse_name: string | null;
  sku_count: number;
  units: number;
  value: string;
  sales_value: string;
  profit: string;
};

export type ApiValuationSupplierGroup = {
  id: string;
  supplier_id: string | null;
  supplier_name: string | null;
  sku_count: number;
  units: number;
  value: string;
  sales_value: string;
  profit: string;
};

export type ApiValuationReport = {
  data: ApiValuationLine[];
  groups: ApiValuationGroup[];
  by_supplier: ApiValuationSupplierGroup[];
  meta: {
    count: number;
    total_units: number;
    total_value: string;
    total_sales_value: string;
    total_profit: string;
    warehouse_count: number;
    supplier_count: number;
    missing_price_count: number;
    unassigned_supplier_count: number;
  };
};

export type ApiSupplierValuationReport = {
  data: ApiValuationSupplierGroup[];
  meta: ApiValuationReport["meta"];
};

export type ApiMovementSummaryLine = {
  id: string;
  moved_on: string | null;
  movement_type: string;
  movement_label: string;
  effect: string;
  sku: string | null;
  name: string | null;
  warehouse_name: string | null;
  quantity: number;
  qty_before: number;
  qty_after: number;
  reference: string | null;
  created_at: string;
};

export type ApiMovementTypeBucket = {
  movement_type: string;
  movement_label: string;
  count: number;
  qty_in: number;
  qty_out: number;
};

export type ApiMovementSummaryReport = {
  data: ApiMovementSummaryLine[];
  by_type: ApiMovementTypeBucket[];
  meta: {
    count: number;
    total: number;
    qty_in: number;
    qty_out: number;
    date_from: string | null;
    date_to: string | null;
  };
};

function reportQuery(params: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) q.set(key, value);
  }
  const query = q.toString();
  return query ? `?${query}` : "";
}

export async function fetchOnHandReport(params: {
  warehouseId?: string;
  status?: string;
  search?: string;
}): Promise<ApiOnHandReport> {
  return apiFetch<ApiOnHandReport>(
    `/api/v1/inventory/reports/on-hand${reportQuery({
      warehouse_id: params.warehouseId,
      status: params.status,
      search: params.search,
    })}`,
  );
}

export async function fetchValuationReport(params: {
  warehouseId?: string;
  search?: string;
}): Promise<ApiValuationReport> {
  return apiFetch<ApiValuationReport>(
    `/api/v1/inventory/reports/valuation${reportQuery({
      warehouse_id: params.warehouseId,
      search: params.search,
    })}`,
  );
}

export async function fetchSupplierValuationReport(params: {
  warehouseId?: string;
}): Promise<ApiSupplierValuationReport> {
  return apiFetch<ApiSupplierValuationReport>(
    `/api/v1/inventory/reports/by-supplier${reportQuery({
      warehouse_id: params.warehouseId,
    })}`,
  );
}

export type ApiProductReport = {
  item: {
    item_id: string;
    product_id: string | null;
    name: string;
    sku: string;
    supplier_id: string | null;
    supplier_name: string | null;
    cost_price: string | number;
    sale_price: string | number;
    track_quantity: boolean;
  };
  stock: {
    on_hand: number;
    reserved: number;
    available: number;
    cost_value: string | number;
    sale_value: string | number;
    warehouses: { warehouse_id: string; warehouse_name: string | null; on_hand: number; reserved: number }[];
  };
  totals: {
    purchased_qty: number;
    purchased_value: string | number;
    purchase_return_qty: number;
    delivered_qty: number;
    adjustment_in_qty: number;
    adjustment_out_qty: number;
    other_in_qty: number;
    other_out_qty: number;
    sold_qty: number;
    sales_revenue: string | number;
    customer_return_qty: number;
    customer_return_value: string | number;
    net_sold_qty: number;
    net_revenue: string | number;
    cogs: string | number;
    profit: string | number;
    margin_pct: string | number | null;
  };
  by_type: ApiMovementTypeBucket[];
  movements: ApiMovementSummaryLine[];
  meta: {
    date_from: string | null;
    date_to: string | null;
    movement_count: number;
    movement_total: number;
  };
};

export async function fetchProductReport(params: {
  itemId: string;
  warehouseId?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<ApiProductReport> {
  return apiFetch<ApiProductReport>(
    `/api/v1/inventory/reports/product${reportQuery({
      item_id: params.itemId,
      warehouse_id: params.warehouseId,
      date_from: params.dateFrom,
      date_to: params.dateTo,
    })}`,
  );
}

export type ApiProductReportRow = {
  item_id: string;
  product_id: string | null;
  name: string;
  sku: string;
  category: string | null;
  brand: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  cost_price: string | number;
  sale_price: string | number;
  on_hand: number;
  reserved: number;
  available: number;
  stock_value: string | number;
  purchased_qty: number;
  purchased_value: string | number;
  sold_qty: number;
  sales_revenue: string | number;
  return_qty: number;
  return_value: string | number;
  net_sold_qty: number;
  net_revenue: string | number;
  cogs: string | number;
  profit: string | number;
  margin_pct: string | number | null;
};

export type ApiProductReportList = {
  data: ApiProductReportRow[];
  meta: {
    total: number;
    page: number;
    per_page: number;
    sum_stock_value: string | number;
    sum_sold_qty: number;
    sum_sales_revenue: string | number;
    sum_profit: string | number;
  };
};

/** The product report as a datatable — every product, one row each, lifetime figures. */
export async function fetchProductReportList(params: {
  search?: string;
  categoryId?: string;
  warehouseId?: string;
  sortBy?: "name" | "sku";
  sortDir?: "asc" | "desc";
  page?: number;
  perPage?: number;
}): Promise<ApiProductReportList> {
  return apiFetch<ApiProductReportList>(
    `/api/v1/inventory/reports/products${reportQuery({
      search: params.search,
      category_id: params.categoryId,
      warehouse_id: params.warehouseId,
      sort_by: params.sortBy,
      sort_dir: params.sortDir,
      page: params.page != null ? String(params.page) : undefined,
      per_page: params.perPage != null ? String(params.perPage) : undefined,
    })}`,
  );
}

export type ApiProductOption = { itemId: string; name: string; sku: string; stock: number };

/** Lightweight product lookup for report pickers (catalog products that have an item). */
export async function searchProductsForReport(query: string): Promise<ApiProductOption[]> {
  type Row = { item_id: string | null; name: string; sku: string; stock: number };
  const q = query.trim().toLowerCase();
  const load = async (search?: string) => {
    const res = await apiFetch<{ data: Row[] }>(
      `/api/v1/catalog/products${reportQuery({ search, per_page: "200", channel: "catalog" })}`,
    );
    return (res.data ?? []).filter((p) => !!p.item_id);
  };
  // The catalog's own search is name-oriented (a SKU like "MH-700" can miss), so
  // always narrow client-side by name or SKU too, and fall back to the plain list.
  const matches = (rows: Row[]) =>
    q ? rows.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)) : rows;
  let rows = matches(await load(q || undefined));
  if (q && rows.length === 0) rows = matches(await load());
  return rows
    .slice(0, 200)
    .map((p) => ({ itemId: p.item_id as string, name: p.name, sku: p.sku, stock: p.stock }));
}

export async function fetchMovementSummaryReport(params: {
  warehouseId?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<ApiMovementSummaryReport> {
  return apiFetch<ApiMovementSummaryReport>(
    `/api/v1/inventory/reports/movements${reportQuery({
      warehouse_id: params.warehouseId,
      date_from: params.dateFrom,
      date_to: params.dateTo,
    })}`,
  );
}

export type ApiProfitLossReport = {
  date_from: string | null;
  date_to: string | null;
  warehouse_id: string | null;
  opening_stock_by_purchase_price: string;
  opening_stock_by_sale_price: string;
  closing_stock_by_purchase_price: string;
  closing_stock_by_sale_price: string;
  total_purchase: string;
  total_stock_adjustment: string;
  total_expense: string;
  total_purchase_shipping_charge: string;
  purchase_additional_expenses: string;
  total_transfer_shipping_charge: string;
  total_sell_discount: string;
  total_customer_reward: string;
  total_sell_return: string;
  total_sales: string;
  total_sell_shipping_charge: string;
  sell_additional_expenses: string;
  total_stock_recovered: string;
  total_purchase_return: string;
  total_purchase_discount: string;
  total_sell_round_off: string;
  cogs: string;
  gross_profit: string;
  net_profit: string;
};

export async function fetchProfitLossReport(params: {
  warehouseId?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<ApiProfitLossReport> {
  return apiFetch<ApiProfitLossReport>(
    `/api/v1/inventory/reports/profit-loss${reportQuery({
      warehouse_id: params.warehouseId,
      date_from: params.dateFrom,
      date_to: params.dateTo,
    })}`,
  );
}

export type ProfitBreakdownGroup =
  | "product"
  | "category"
  | "brand"
  | "location"
  | "invoice"
  | "customer"
  | "day"
  | "date"
  | "staff";

export type ApiProfitBreakdownRow = {
  key: string;
  label: string;
  qty: number;
  revenue: string;
  cost: string;
  gross_profit: string;
};

export type ApiProfitBreakdownReport = {
  data: ApiProfitBreakdownRow[];
  meta: {
    count: number;
    total: number;
    page: number;
    per_page: number;
    total_gross_profit: string;
  };
};

export async function fetchProfitBreakdownReport(params: {
  groupBy: ProfitBreakdownGroup;
  warehouseId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  perPage?: number;
}): Promise<ApiProfitBreakdownReport> {
  return apiFetch<ApiProfitBreakdownReport>(
    `/api/v1/inventory/reports/profit-loss/breakdown${reportQuery({
      group_by: params.groupBy,
      warehouse_id: params.warehouseId,
      date_from: params.dateFrom,
      date_to: params.dateTo,
      search: params.search,
      page: params.page != null ? String(params.page) : undefined,
      per_page: params.perPage != null ? String(params.perPage) : undefined,
    })}`,
  );
}

export type ApiSerialReportLine = {
  id: string;
  serial_number: string;
  sku: string;
  name: string;
  status: string;
  warehouse_id: string | null;
  warehouse_name: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  source_type: string;
  received_on: string | null;
  sold_on: string | null;
  customer_name: string;
  order_number: string | null;
  warranty_expires_on: string | null;
  warranty_status: "active" | "expiring" | "expired" | "unknown" | string;
  days_to_warranty: number | null;
  days_in_stock: number | null;
  days_since_sold: number | null;
  rma_id: string | null;
  has_open_rma: boolean;
};

export type ApiSerialReport = {
  data: ApiSerialReportLine[];
  meta: {
    count: number;
    in_stock: number;
    in_transit: number;
    sold: number;
    in_service: number;
    replaced: number;
    scrapped: number;
    lost: number;
    damaged: number;
    warranty_expiring_count: number;
    warranty_expired_count: number;
    aging_90_count: number;
    open_rma_count: number;
    no_warranty_count: number;
  };
  errors?: string[];
};

export async function fetchSerialsReport(params?: {
  warehouseId?: string;
  status?: string;
}): Promise<ApiSerialReport> {
  return apiFetch<ApiSerialReport>(
    `/api/v1/inventory/reports/serials${reportQuery({
      warehouse_id: params?.warehouseId,
      status: params?.status,
    })}`,
  );
}

/** Inventory landing dashboard: stock right now + stock in / out over one period (GET /inventory/dashboard/period). */
export type InventoryPeriodTotals = {
  movement_count: number;
  units_in: number;
  units_out: number;
  value_in: number | string;
  value_out: number | string;
  by_type: Record<string, { count: number; units_in: number; units_out: number }>;
};

export type InventoryDashboardPeriod = {
  date_from: string | null;
  date_to: string | null;
  snapshot: {
    total_skus: number;
    total_units: number;
    total_value: number | string;
    low_stock_count: number;
    out_of_stock_count: number;
    warehouse_count: number;
  };
  availability: Record<string, number>;
  attention: {
    reorder_suggestions: number;
    open_purchase_orders: number;
    transfers_in_transit: number;
    stock_counts_open: number;
    adjustments_draft: number;
  };
  by_warehouse: { warehouse: string; skus: number; units: number; value: number | string }[];
  low_stock: { item_id: string | null; sku: string; name: string; on_hand: number; reorder_level: number; status: string; warehouse: string }[];
  current: InventoryPeriodTotals;
  previous: InventoryPeriodTotals | null;
  series: { date: string; label: string; units_in: number; units_out: number }[];
  by_month: boolean;
  top_moved: { item_id: string; sku: string; name: string; units_in: number; units_out: number }[];
  recent_movements: {
    id: string;
    date: string | null;
    movement_type: string;
    item_id: string | null;
    sku: string;
    name: string;
    change: number;
    warehouse: string;
    reference: string | null;
  }[];
};

export async function fetchInventoryDashboardPeriod(dateFrom?: string, dateTo?: string): Promise<InventoryDashboardPeriod> {
  const params = new URLSearchParams();
  if (dateFrom) params.set("date_from", dateFrom);
  if (dateTo) params.set("date_to", dateTo);
  const q = params.toString();
  const res = await apiFetch<{ data: InventoryDashboardPeriod }>(`/api/v1/inventory/dashboard/period${q ? `?${q}` : ""}`);
  return res.data;
}
