import { demoVariants, products, type Product, type ProductVariant } from "./products";

export type VariantDimensionValue = {
  value: string;
  imageId?: string;
  imageUrl?: string;
  /** Values scoped to this specific attribute value only, e.g. the sizes Red actually comes in (tree/parent-child, not a flat cartesian layer). */
  subValues?: string[];
};

export type VariantDimension = {
  id: string;
  name: string;
  values: VariantDimensionValue[];
  /** Label for each value's nested subValues, e.g. "Size" under "Color". Only meaningful when a value has subValues set. */
  subName?: string;
};

export type VariantMatrixRow = {
  id: string;
  label: string;
  dimensions: Record<string, string>;
  sku: string;
  price: number;
  purchasePrice: number;
  stock: number;
  barcode?: string;
  isDefault?: boolean;
  imageId?: string;
  imageUrl?: string;
  /** "draft" = disabled/paused combo (kept, not deleted); "published" = sellable. */
  status?: "draft" | "published";
};

export type CatalogVariantRow = {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  variantLabel: string;
  variantSku: string;
  price: number;
  stock: number;
  status: Product["status"];
  category: string;
  isDefault?: boolean;
};

export const VARIANT_DIMENSION_PRESETS: Record<string, VariantDimension[]> = {
  Apparel: [
    { id: "color", name: "Color", values: [{ value: "Black" }, { value: "White" }] },
    { id: "size", name: "Size", values: [{ value: "S" }, { value: "M" }, { value: "L" }] },
  ],
  Electronics: [
    {
      id: "color",
      name: "Color",
      values: [{ value: "Black" }, { value: "Silver" }, { value: "Blue" }],
    },
    { id: "storage", name: "Storage", values: [{ value: "128GB" }, { value: "256GB" }] },
  ],
  default: [
    { id: "option", name: "Option", values: [{ value: "Standard" }, { value: "Premium" }] },
  ],
};

export function cloneDimensions(preset: VariantDimension[]): VariantDimension[] {
  return preset.map((d) => ({
    ...d,
    values: d.values.map((v) => ({ ...v, subValues: v.subValues ? [...v.subValues] : undefined })),
  }));
}

/**
 * Expand one dimension into its row-level contributions. A value with subValues
 * (e.g. Red -> 20, 21, 22) produces one entry per sub-value; a value without
 * subValues produces a single entry for itself (e.g. White with no sizes).
 */
export function expandDimension(dim: VariantDimension): Record<string, string>[] {
  const combos: Record<string, string>[] = [];
  for (const value of dim.values) {
    if (!value.value.trim()) continue;
    const subs = dim.subName?.trim() ? (value.subValues ?? []).map((s) => s.trim()).filter(Boolean) : [];
    if (subs.length > 0) {
      for (const sub of subs) combos.push({ [dim.name]: value.value, [dim.subName as string]: sub });
    } else {
      combos.push({ [dim.name]: value.value });
    }
  }
  return combos;
}

export function cartesianProduct(dimensions: VariantDimension[]): Record<string, string>[] {
  const active = dimensions.filter((d) => d.name.trim() && d.values.some((v) => v.value.trim()));
  if (active.length === 0) return [];

  return active.reduce<Record<string, string>[]>(
    (acc, dim) => {
      const dimCombos = expandDimension(dim);
      const next: Record<string, string>[] = [];
      for (const row of acc) {
        for (const combo of dimCombos) {
          next.push({ ...row, ...combo });
        }
      }
      return next;
    },
    [{}],
  );
}

/**
 * Group generated rows by their "parent" value combination (ignoring nested
 * subName keys), so the UI can render a tree: a parent header for a value
 * with several sub-value children (e.g. Red -> 20/21/22), or a flat single
 * row when a value has no children (e.g. White).
 */
export type VariantRowGroup = {
  key: string;
  label: string;
  imageId?: string;
  imageUrl?: string;
  rows: VariantMatrixRow[];
};

export function groupMatrixRows(
  dimensions: VariantDimension[],
  rows: VariantMatrixRow[],
): VariantRowGroup[] {
  const parentNames = dimensions.filter((d) => d.name.trim()).map((d) => d.name);
  const groups = new Map<string, VariantRowGroup>();

  for (const row of rows) {
    const parentValues = parentNames.map((name) => row.dimensions[name]).filter(Boolean);
    const key = parentValues.length ? parentValues.join(" / ") : row.label;
    let group = groups.get(key);
    if (!group) {
      const inherited = inheritedRowImage(dimensions, row.dimensions);
      group = { key, label: key, imageId: inherited?.imageId, imageUrl: inherited?.imageUrl, rows: [] };
      groups.set(key, group);
    }
    group.rows.push(row);
  }

  return Array.from(groups.values());
}

export function buildVariantLabel(dimensions: Record<string, string>): string {
  return Object.values(dimensions).join(" / ");
}

/** Stable key for matching a combo across regenerations, independent of key order. */
export function buildComboKey(dimensions: Record<string, string>): string {
  return Object.keys(dimensions)
    .sort()
    .map((k) => `${k}=${dimensions[k]}`)
    .join("|");
}

/** Find the image for a dimension value, e.g. the Color swatch image for "Black". */
export function findDimensionValueImage(
  dimensions: VariantDimension[],
  dimensionName: string,
  value: string,
): { imageId?: string; imageUrl?: string } | undefined {
  const dim = dimensions.find((d) => d.name === dimensionName);
  const found = dim?.values.find((v) => v.value === value);
  if (!found || (!found.imageId && !found.imageUrl)) return undefined;
  return { imageId: found.imageId, imageUrl: found.imageUrl };
}

/** Inherited image for a combo — from the first dimension's matching value (Alibaba/1688 convention). */
export function inheritedRowImage(
  dimensions: VariantDimension[],
  rowDimensions: Record<string, string>,
): { imageId?: string; imageUrl?: string } | undefined {
  const primary = dimensions[0];
  if (!primary) return undefined;
  const value = rowDimensions[primary.name];
  if (!value) return undefined;
  return findDimensionValueImage(dimensions, primary.name, value);
}

export function slugifySkuPart(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 12);
}

/**
 * Regenerate the variant matrix from the current attribute definitions while
 * preserving sku/price/stock/image/status for combos that already existed —
 * so editing attributes doesn't wipe out already-priced rows.
 */
export function mergeGeneratedRows(
  existingRows: VariantMatrixRow[],
  dimensions: VariantDimension[],
  baseSku: string,
  basePrice: number,
  basePurchasePrice: number = 0,
): { rows: VariantMatrixRow[]; added: number; removed: number; kept: number } {
  const combos = cartesianProduct(dimensions);
  const prefix = (baseSku || "SKU").toUpperCase();
  const existingByKey = new Map(existingRows.map((r) => [buildComboKey(r.dimensions), r]));
  const matchedKeys = new Set<string>();

  let added = 0;
  let kept = 0;

  const rows = combos.map((combo, index) => {
    const key = buildComboKey(combo);
    const existing = existingByKey.get(key);
    if (existing) {
      matchedKeys.add(key);
      kept += 1;
      return { ...existing, label: buildVariantLabel(combo), dimensions: combo };
    }

    added += 1;
    const parts = Object.values(combo).map(slugifySkuPart).filter(Boolean);
    const inherited = inheritedRowImage(dimensions, combo);
    return {
      id: `new_${Date.now()}_${index}`,
      label: buildVariantLabel(combo),
      dimensions: combo,
      sku: parts.length ? `${prefix}-${parts.join("-")}` : `${prefix}-${index + 1}`,
      price: basePrice,
      purchasePrice: basePurchasePrice,
      stock: 0,
      isDefault: existingRows.length === 0 && index === 0,
      status: "published" as const,
      imageId: inherited?.imageId,
      imageUrl: inherited?.imageUrl,
    };
  });

  const removed = existingRows.filter((r) => !matchedKeys.has(buildComboKey(r.dimensions))).length;

  if (rows.length > 0 && !rows.some((r) => r.isDefault)) {
    rows[0] = { ...rows[0], isDefault: true };
  }

  return { rows, added, removed, kept };
}

export function variantToMatrixRow(variant: ProductVariant): VariantMatrixRow {
  const dimensions: Record<string, string> = { Color: variant.color };
  if (variant.storage) dimensions.Storage = variant.storage;
  if (variant.ram) dimensions.RAM = variant.ram;

  return {
    id: variant.id,
    label: variant.label,
    dimensions,
    sku: variant.sku,
    price: variant.price,
    purchasePrice: 0,
    stock: variant.stock,
    isDefault: variant.id === demoVariants[0]?.id,
  };
}

export function getPresetDimensions(category?: string): VariantDimension[] {
  const key = category && category in VARIANT_DIMENSION_PRESETS ? category : "default";
  return cloneDimensions(VARIANT_DIMENSION_PRESETS[key]);
}

/** Global sellable SKU list — variable children + simple products as single row */
export function getAllCatalogVariants(): CatalogVariantRow[] {
  const rows: CatalogVariantRow[] = [];

  for (const product of products) {
    if (product.category === "Electronics" && product.id === "prod_0002") {
      for (const variant of demoVariants) {
        rows.push({
          id: `${product.id}_${variant.id}`,
          productId: product.id,
          productName: product.name,
          productSku: product.sku,
          variantLabel: variant.label,
          variantSku: variant.sku,
          price: variant.price,
          stock: variant.stock,
          status: product.status,
          category: product.category,
          isDefault: variant.id === demoVariants[0]?.id,
        });
      }
      continue;
    }

    rows.push({
      id: `${product.id}_simple`,
      productId: product.id,
      productName: product.name,
      productSku: product.sku,
      variantLabel: "Default",
      variantSku: product.sku,
      price: product.price,
      stock: product.stock,
      status: product.status,
      category: product.category,
      isDefault: true,
    });
  }

  return rows;
}
