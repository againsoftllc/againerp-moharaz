import type { UniversalImage } from "../models/UniversalImage";
import type { UniversalProduct } from "../models/UniversalProduct";
import type { UniversalVariant } from "../models/UniversalVariant";
import { normalizePrice, normalizeUrl } from "./normalize";

export type ValidationIssueKind =
  | "required"
  | "missing"
  | "invalid_price"
  | "invalid_image"
  | "duplicate_sku"
  | "duplicate_variant";

export type ValidationIssue = {
  kind: ValidationIssueKind;
  field: string;
  message: string;
  severity: "error" | "warning";
};

export type ValidationResult = {
  valid: boolean;
  issues: ValidationIssue[];
  missingFields: string[];
  mappedFields: string[];
  ignoredFields: string[];
};

export type FieldTraceStatus = "mapped" | "missing" | "ignored";

export type FieldTrace = {
  universalField: string;
  sourcePath: string;
  status: FieldTraceStatus;
  value?: unknown;
};

const REQUIRED_PRODUCT_FIELDS: Array<keyof UniversalProduct> = [
  "id",
  "provider",
  "providerProductId",
  "title",
  "currency",
  "basePrice",
];

export function validateProduct(
  product: UniversalProduct,
  traces: FieldTrace[] = [],
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const missingFields: string[] = [];

  for (const field of REQUIRED_PRODUCT_FIELDS) {
    const value = product[field];
    if (value == null || value === "") {
      missingFields.push(field);
      issues.push({
        kind: "required",
        field,
        message: `Required field "${field}" is missing`,
        severity: "error",
      });
    }
  }

  if (product.basePrice == null || product.basePrice < 0 || Number.isNaN(product.basePrice)) {
    issues.push({
      kind: "invalid_price",
      field: "basePrice",
      message: "Invalid base price",
      severity: "error",
    });
  }

  if (product.salePrice != null && (product.salePrice < 0 || Number.isNaN(product.salePrice))) {
    issues.push({
      kind: "invalid_price",
      field: "salePrice",
      message: "Invalid sale price",
      severity: "warning",
    });
  }

  for (const [i, img] of product.images.entries()) {
    if (!normalizeUrl(img.url)) {
      issues.push({
        kind: "invalid_image",
        field: `images[${i}].url`,
        message: `Invalid image URL at position ${i}`,
        severity: "warning",
      });
    }
  }

  const skuSet = new Set<string>();
  for (const variant of product.variants) {
    if (!variant.sku) continue;
    if (skuSet.has(variant.sku)) {
      issues.push({
        kind: "duplicate_sku",
        field: "variants.sku",
        message: `Duplicate SKU: ${variant.sku}`,
        severity: "error",
      });
    }
    skuSet.add(variant.sku);
  }

  const variantKeySet = new Set<string>();
  for (const variant of product.variants) {
    const key = variant.attributes.map((a) => `${a.name}:${a.value}`).sort().join("|");
    if (!key) continue;
    if (variantKeySet.has(key)) {
      issues.push({
        kind: "duplicate_variant",
        field: "variants",
        message: `Duplicate variant combination: ${key}`,
        severity: "warning",
      });
    }
    variantKeySet.add(key);
  }

  const mappedFields = traces.filter((t) => t.status === "mapped").map((t) => t.universalField);
  const ignoredFields = traces.filter((t) => t.status === "ignored").map((t) => t.sourcePath);

  for (const trace of traces.filter((t) => t.status === "missing")) {
    if (!missingFields.includes(trace.universalField)) {
      missingFields.push(trace.universalField);
      issues.push({
        kind: "missing",
        field: trace.universalField,
        message: `Field "${trace.universalField}" could not be mapped from ${trace.sourcePath}`,
        severity: "warning",
      });
    }
  }

  const hasErrors = issues.some((i) => i.severity === "error");
  return {
    valid: !hasErrors,
    issues,
    missingFields,
    mappedFields,
    ignoredFields,
  };
}

export function validateImage(image: UniversalImage): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!normalizeUrl(image.url)) {
    issues.push({
      kind: "invalid_image",
      field: "url",
      message: "Invalid image URL",
      severity: "error",
    });
  }
  return issues;
}

export function validateVariantPrice(variant: UniversalVariant): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const price = normalizePrice(variant.price);
  if (price == null) {
    issues.push({
      kind: "invalid_price",
      field: "price",
      message: `Invalid variant price for SKU ${variant.sku}`,
      severity: "warning",
    });
  }
  return issues;
}
