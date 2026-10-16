import { apiFetch } from "@/lib/api/client";

export type AttributeAlias = {
  id: string;
  field_code: string;
  raw_pattern: string;
  normalized_value: string;
  /** How many catalog products currently carry this raw value. */
  product_count?: number;
};

export type ProductOverride = {
  id: string;
  product_id: string;
  product_name?: string | null;
  field_code: string;
  value: string;
  /** The field's catalog name and type, and the value the product itself carries ("" = empty). */
  field_name?: string | null;
  field_type?: string | null;
  product_value?: string;
};

export type ChipsetLookupRow = {
  id: string;
  chipset: string;
  socket: string;
  supported_generations: string;
  bios_update_generations: string;
};

export type CategoryProductOverride = {
  id: string;
  category_id: string;
  category_name?: string | null;
  product_id: string;
  product_name?: string | null;
  /** "ignore" only dismisses a product from the Overview issue list. */
  action: "include" | "exclude" | "ignore";
};

const base = "/api/v1/configurator";

export const listAttributeAliases = () => apiFetch<AttributeAlias[]>(`${base}/attribute-aliases`);
export const createAttributeAlias = (payload: Omit<AttributeAlias, "id" | "product_count">) =>
  apiFetch<AttributeAlias>(`${base}/attribute-aliases`, { method: "POST", body: JSON.stringify(payload) });
export const deleteAttributeAlias = (id: string) =>
  apiFetch<void>(`${base}/attribute-aliases/${id}`, { method: "DELETE" });

export const listProductOverrides = () => apiFetch<ProductOverride[]>(`${base}/product-overrides`);
type ProductOverrideWrite = { product_id: string; field_code: string; value: string };
export const createProductOverride = (payload: ProductOverrideWrite) =>
  apiFetch<ProductOverride>(`${base}/product-overrides`, { method: "POST", body: JSON.stringify(payload) });
export const updateProductOverride = (id: string, payload: ProductOverrideWrite) =>
  apiFetch<ProductOverride>(`${base}/product-overrides/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
export const deleteProductOverride = (id: string) =>
  apiFetch<void>(`${base}/product-overrides/${id}`, { method: "DELETE" });

export const listChipsetLookup = () => apiFetch<ChipsetLookupRow[]>(`${base}/chipset-lookup`);
export const createChipsetLookup = (payload: Omit<ChipsetLookupRow, "id">) =>
  apiFetch<ChipsetLookupRow>(`${base}/chipset-lookup`, { method: "POST", body: JSON.stringify(payload) });
export const updateChipsetLookup = (id: string, payload: Omit<ChipsetLookupRow, "id">) =>
  apiFetch<ChipsetLookupRow>(`${base}/chipset-lookup/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
export const deleteChipsetLookup = (id: string) =>
  apiFetch<void>(`${base}/chipset-lookup/${id}`, { method: "DELETE" });

export const listCategoryOverrides = () => apiFetch<CategoryProductOverride[]>(`${base}/category-overrides`);
export const createCategoryOverride = (payload: Omit<CategoryProductOverride, "id" | "category_name" | "product_name">) =>
  apiFetch<CategoryProductOverride>(`${base}/category-overrides`, { method: "POST", body: JSON.stringify(payload) });
export const deleteCategoryOverride = (id: string) =>
  apiFetch<void>(`${base}/category-overrides/${id}`, { method: "DELETE" });

/** Real values the catalog carries, for the Lookup & Alias dropdowns. */
export type LookupOptions = {
  chipsets: string[];
  /** Values of the attribute feeding each field (Field Sources), nothing else. */
  sockets: string[];
  generations: string[];
  /** The chipsets products actually carry (drives the "missing from the table" banner). */
  chipsets_in_use?: string[];
  /** Chipsets / sockets / generations the lookup table and starter list know, whether or not a product carries them yet. */
  known_chipsets: string[];
  known_sockets: string[];
  known_generations: string[];
  alias_fields: { code: string; name: string }[];
  field_values: Record<string, string[]>;
};
export const getLookupOptions = () => apiFetch<{ data: LookupOptions }>(`${base}/lookup-options`).then((r) => r.data);

export type OverrideProductInfo = {
  product: { id: string; name: string };
  fields: { code: string; name: string; field_type?: string | null; source?: string | null; stored_value: string }[];
};
/** Spec fields that apply to one product, with what the product itself carries for each. */
export const getOverrideProductInfo = (productId: string) =>
  apiFetch<{ data: OverrideProductInfo }>(`${base}/override-product-info?product_id=${encodeURIComponent(productId)}`).then((r) => r.data);
/** Name search across published products (for the product pickers). */
export const searchPickableProducts = (q: string) =>
  apiFetch<{ data: { id: string; name: string }[] }>(`${base}/categories/pickable-products?q=${encodeURIComponent(q)}`).then((r) => r.data);

/** One built-in builder field and the attribute that currently feeds it (Field Sources). */
export type FieldSource = {
  key: string;
  label: string;
  component: string;
  group: "lookup" | "engine";
  hint: string;
  types: string[];
  default_code: string;
  default_profile_code: string;
  mode: "default" | "custom" | "missing";
  attribute: { id: string; code: string; name: string; field_type: string; profile_id: string | null; profile_name: string } | null;
  /** Products that carry a value under that attribute, out of the products of its profile. */
  coverage: { filled: number; total: number };
};
export const listFieldSources = () => apiFetch<{ data: FieldSource[] }>(`${base}/field-sources`).then((r) => r.data);
/** attributeId null puts the field back on its default attribute. */
export const updateFieldSource = (key: string, attributeId: string | null) =>
  apiFetch<{ data: FieldSource }>(`${base}/field-sources/${encodeURIComponent(key)}`, {
    method: "PUT",
    body: JSON.stringify({ attribute_id: attributeId }),
  }).then((r) => r.data);

/** Add a value to the attribute that feeds this field (its predefined list). Returns the spelling stored. */
export const addFieldSourceValue = (key: string, value: string) =>
  apiFetch<{ data: { value: string; values: string[] } }>(`${base}/field-sources/${key}/values`, {
    method: "POST",
    body: JSON.stringify({ value }),
  }).then((r) => r.data);
