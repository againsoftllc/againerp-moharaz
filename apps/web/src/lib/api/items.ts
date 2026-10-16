import { apiFetch } from "@/lib/api/client";

export type ItemRecord = {
  id: string;
  company_id: string;
  sku: string;
  barcode: string | null;
  name: string;
  item_type: string;
  status: string;
  created_at: string;
  updated_at: string;
  // Service module extension (present when item_type === "service")
  description?: string | null;
  category?: string | null;
  unit_type?: string | null;
  rate?: number | null;
  show_in_client_portal?: boolean | null;
  image_url?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
};

export type ItemListResponse = {
  data: ItemRecord[];
  meta: { count: number; page: number; per_page: number };
};

export type ItemResponse = {
  data: ItemRecord;
};

export type ListItemsParams = {
  item_type?: string;
  module?: "service" | "manufacturing";
  status?: string;
  q?: string;
  page?: number;
  per_page?: number;
};

export type CreateItemInput = {
  sku: string;
  name: string;
  item_type?: string;
  status?: string;
  barcode?: string | null;
  register_module?: "service" | "manufacturing";
  description?: string | null;
  category?: string | null;
  unit_type?: string | null;
  rate?: number | null;
  show_in_client_portal?: boolean;
  image_url?: string | null;
};

export type UpdateItemInput = {
  sku?: string;
  name?: string;
  status?: string;
  barcode?: string | null;
  description?: string | null;
  category?: string | null;
  unit_type?: string | null;
  rate?: number | null;
  show_in_client_portal?: boolean;
  image_url?: string | null;
};

function toQuery(params: ListItemsParams) {
  const qs = new URLSearchParams();
  if (params.item_type) qs.set("item_type", params.item_type);
  if (params.module) qs.set("module", params.module);
  if (params.status) qs.set("status", params.status);
  if (params.q) qs.set("q", params.q);
  if (params.page) qs.set("page", String(params.page));
  if (params.per_page) qs.set("per_page", String(params.per_page));
  const query = qs.toString();
  return query ? `?${query}` : "";
}

export async function fetchItems(params: ListItemsParams = {}): Promise<ItemListResponse> {
  return apiFetch<ItemListResponse>(`/api/v1/items${toQuery(params)}`);
}

export async function createServiceItem(input: Omit<CreateItemInput, "item_type" | "register_module">): Promise<ItemRecord> {
  const res = await apiFetch<ItemResponse>("/api/v1/items", {
    method: "POST",
    body: JSON.stringify({
      item_type: "service",
      register_module: "service",
      status: "active",
      ...input,
    }),
  });
  return res.data;
}

export async function createManufacturingItem(
  input: Omit<CreateItemInput, "register_module"> & { item_type?: string },
): Promise<ItemRecord> {
  const res = await apiFetch<ItemResponse>("/api/v1/items", {
    method: "POST",
    body: JSON.stringify({
      item_type: input.item_type ?? "physical",
      register_module: "manufacturing",
      status: "active",
      ...input,
    }),
  });
  return res.data;
}

export async function createItem(input: CreateItemInput): Promise<ItemRecord> {
  const res = await apiFetch<ItemResponse>("/api/v1/items", {
    method: "POST",
    body: JSON.stringify({
      item_type: "service",
      status: "active",
      ...input,
    }),
  });
  return res.data;
}

export async function patchItem(id: string, input: UpdateItemInput): Promise<ItemRecord> {
  const res = await apiFetch<ItemResponse>(`/api/v1/items/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return res.data;
}
