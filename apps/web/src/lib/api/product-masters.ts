import { apiFetch } from "@/lib/api/client";

export type ApiUnitType = { code: string; name: string; fraction_length: number; is_default: boolean; in_use: boolean };

export type ApiProductRelation = {
  related_product_id: string;
  kind: "related" | "spare";
  note: string | null;
  sku?: string | null;
  name?: string | null;
  price?: string | null;
};

/** Unit type master on the server (INV-08: these used to live in each browser). */
export async function fetchUnitTypes() {
  const res = await apiFetch<{ data: ApiUnitType[] }>("/api/v1/inventory/unit-types");
  return res.data;
}

export async function saveUnitTypes(units: Pick<ApiUnitType, "code" | "name" | "fraction_length" | "is_default">[]) {
  const res = await apiFetch<{ data: ApiUnitType[] }>("/api/v1/inventory/unit-types", {
    method: "PUT",
    body: JSON.stringify({ units }),
  });
  return res.data;
}

export async function fetchWarehouseTypes() {
  const res = await apiFetch<{ data: string[] }>("/api/v1/inventory/warehouse-types");
  return res.data;
}

export async function saveWarehouseTypes(names: string[]) {
  const res = await apiFetch<{ data: string[] }>("/api/v1/inventory/warehouse-types", {
    method: "PUT",
    body: JSON.stringify({ names }),
  });
  return res.data;
}

export async function fetchProductRelations(productId: string) {
  const res = await apiFetch<{ data: ApiProductRelation[] }>(`/api/v1/catalog/products/${encodeURIComponent(productId)}/relations`);
  return res.data;
}

export async function saveProductRelations(productId: string, relations: Pick<ApiProductRelation, "related_product_id" | "kind" | "note">[]) {
  const res = await apiFetch<{ data: ApiProductRelation[] }>(`/api/v1/catalog/products/${encodeURIComponent(productId)}/relations`, {
    method: "PUT",
    body: JSON.stringify({ relations }),
  });
  return res.data;
}
