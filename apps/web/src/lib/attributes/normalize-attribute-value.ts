/**
 * Normalized attribute value storage — mirrors catalog_product_spec_values pattern.
 * One row per field; type-specific columns populated.
 */

import type { ConfiguratorFieldType } from "@/lib/attributes/field-types";
import type { ConfiguratorAttributeField, ConfiguratorFieldOption } from "@/lib/mock-data/configurator-attributes";

export type NormalizedAttributeValue = {
  fieldId: string;
  fieldCode: string;
  fieldType: ConfiguratorFieldType;
  textValue: string | null;
  numberValue: number | null;
  booleanValue: boolean | null;
  optionIds: string[] | null;
};

export type RawAttributeInput = {
  fieldId: string;
  value?: string | number | boolean | string[] | null;
  optionIds?: string[];
};

export function emptyNormalizedValue(
  field: Pick<ConfiguratorAttributeField, "id" | "code" | "fieldType">,
): NormalizedAttributeValue {
  return {
    fieldId: field.id,
    fieldCode: field.code,
    fieldType: field.fieldType,
    textValue: null,
    numberValue: null,
    booleanValue: null,
    optionIds: null,
  };
}

export function normalizeAttributeValue(
  field: ConfiguratorAttributeField,
  raw: RawAttributeInput,
): NormalizedAttributeValue {
  const base = emptyNormalizedValue(field);
  const v = raw.value;

  switch (field.fieldType) {
    case "text":
      return {
        ...base,
        textValue: v == null || v === "" ? null : String(v),
      };
    case "number": {
      const n = typeof v === "number" ? v : v != null && v !== "" ? Number(v) : null;
      return {
        ...base,
        numberValue: n != null && !Number.isNaN(n) ? n : null,
      };
    }
    case "boolean":
      return {
        ...base,
        booleanValue: v === true || v === "true" || v === 1 || v === "1",
      };
    case "dropdown": {
      const optionId =
        raw.optionIds?.[0] ??
        (typeof v === "string" ? resolveOptionId(field.options, v) : null);
      return {
        ...base,
        optionIds: optionId ? [optionId] : null,
        textValue: optionId ? resolveOptionLabel(field.options, optionId) : null,
      };
    }
    case "multi_select": {
      const ids =
        raw.optionIds ??
        (Array.isArray(v)
          ? v.map((x) => resolveOptionId(field.options, String(x))).filter(Boolean)
          : typeof v === "string"
            ? v.split(",").map((x) => resolveOptionId(field.options, x.trim())).filter(Boolean)
            : []);
      const unique = [...new Set(ids)] as string[];
      return {
        ...base,
        optionIds: unique.length ? unique : null,
        textValue: unique.length
          ? unique.map((id) => resolveOptionLabel(field.options, id)).join(", ")
          : null,
      };
    }
    default:
      return base;
  }
}

function resolveOptionId(
  options: ConfiguratorFieldOption[] | undefined,
  valueOrId: string,
): string | null {
  if (!options?.length) return valueOrId || null;
  const byId = options.find((o) => o.id === valueOrId);
  if (byId) return byId.id;
  const byValue = options.find((o) => o.value === valueOrId);
  return byValue?.id ?? null;
}

function resolveOptionLabel(
  options: ConfiguratorFieldOption[] | undefined,
  optionId: string,
): string {
  return options?.find((o) => o.id === optionId)?.label ?? optionId;
}

export function denormalizeForDisplay(row: NormalizedAttributeValue): string {
  if (row.textValue) return row.textValue;
  if (row.numberValue != null) return String(row.numberValue);
  if (row.booleanValue != null) return row.booleanValue ? "Yes" : "No";
  if (row.optionIds?.length) return row.optionIds.join(", ");
  return "—";
}
