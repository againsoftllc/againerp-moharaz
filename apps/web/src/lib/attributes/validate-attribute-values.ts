/**
 * Configurator attribute validation layer.
 * Validates raw or normalized values against field definitions.
 */

import type { ConfiguratorFieldType } from "@/lib/attributes/field-types";
import {
  normalizeAttributeValue,
  type NormalizedAttributeValue,
  type RawAttributeInput,
} from "@/lib/attributes/normalize-attribute-value";
import type { ConfiguratorAttributeField } from "@/lib/mock-data/configurator-attributes";

export type ValidationIssue = {
  fieldId: string;
  fieldCode: string;
  fieldName: string;
  message: string;
  severity: "error" | "warning";
};

export type ValidationResult = {
  valid: boolean;
  issues: ValidationIssue[];
  normalized: NormalizedAttributeValue[];
};

function isEmpty(field: ConfiguratorAttributeField, raw: RawAttributeInput | undefined): boolean {
  if (!raw) return true;
  const v = raw.value;
  if (v === null || v === undefined || v === "") return true;
  if (Array.isArray(v) && v.length === 0) return true;
  if (raw.optionIds && raw.optionIds.length === 0) return true;
  return false;
}

function validateFieldValue(
  field: ConfiguratorAttributeField,
  raw: RawAttributeInput | undefined,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (field.isRequired && isEmpty(field, raw)) {
    issues.push({
      fieldId: field.id,
      fieldCode: field.code,
      fieldName: field.name,
      message: `${field.name} is required`,
      severity: "error",
    });
    return issues;
  }

  if (!raw || isEmpty(field, raw)) return issues;

  const normalized = normalizeAttributeValue(field, raw);

  switch (field.fieldType as ConfiguratorFieldType) {
    case "number": {
      if (normalized.numberValue == null) {
        issues.push({
          fieldId: field.id,
          fieldCode: field.code,
          fieldName: field.name,
          message: `${field.name} must be a valid number`,
          severity: "error",
        });
        break;
      }
      const { min, max } = field.validation ?? {};
      if (min != null && normalized.numberValue < min) {
        issues.push({
          fieldId: field.id,
          fieldCode: field.code,
          fieldName: field.name,
          message: `${field.name} must be at least ${min}${field.unit ? ` ${field.unit}` : ""}`,
          severity: "error",
        });
      }
      if (max != null && normalized.numberValue > max) {
        issues.push({
          fieldId: field.id,
          fieldCode: field.code,
          fieldName: field.name,
          message: `${field.name} must be at most ${max}${field.unit ? ` ${field.unit}` : ""}`,
          severity: "error",
        });
      }
      break;
    }
    case "dropdown":
    case "multi_select": {
      if (!field.options?.length) {
        issues.push({
          fieldId: field.id,
          fieldCode: field.code,
          fieldName: field.name,
          message: `${field.name} has no options configured`,
          severity: "warning",
        });
        break;
      }
      const ids = normalized.optionIds ?? [];
      const validIds = new Set(field.options.map((o) => o.id));
      for (const id of ids) {
        if (!validIds.has(id)) {
          issues.push({
            fieldId: field.id,
            fieldCode: field.code,
            fieldName: field.name,
            message: `Invalid option for ${field.name}`,
            severity: "error",
          });
        }
      }
      if (field.fieldType === "dropdown" && ids.length > 1) {
        issues.push({
          fieldId: field.id,
          fieldCode: field.code,
          fieldName: field.name,
          message: `${field.name} allows only one selection`,
          severity: "error",
        });
      }
      break;
    }
    case "text": {
      if (normalized.textValue && field.validation?.maxLength) {
        if (normalized.textValue.length > field.validation.maxLength) {
          issues.push({
            fieldId: field.id,
            fieldCode: field.code,
            fieldName: field.name,
            message: `${field.name} exceeds max length ${field.validation.maxLength}`,
            severity: "error",
          });
        }
      }
      break;
    }
    default:
      break;
  }

  return issues;
}

export function validateProfileValues(
  fields: ConfiguratorAttributeField[],
  inputs: RawAttributeInput[],
): ValidationResult {
  const inputMap = new Map(inputs.map((i) => [i.fieldId, i]));
  const activeFields = fields.filter((f) => f.active).sort((a, b) => a.sortOrder - b.sortOrder);

  const issues: ValidationIssue[] = [];
  const normalized: NormalizedAttributeValue[] = [];

  for (const field of activeFields) {
    const raw = inputMap.get(field.id);
    issues.push(...validateFieldValue(field, raw));
    if (raw && !isEmpty(field, raw)) {
      normalized.push(normalizeAttributeValue(field, raw));
    }
  }

  const errors = issues.filter((i) => i.severity === "error");
  return {
    valid: errors.length === 0,
    issues,
    normalized,
  };
}

/** Compare two component attribute sets for compatibility (e.g. socket match) */
export function compareAttributeValues(
  fieldCode: string,
  left: NormalizedAttributeValue[],
  right: NormalizedAttributeValue[],
  mode: "equals" | "contains" = "equals",
): boolean {
  const l = left.find((v) => v.fieldCode === fieldCode);
  const r = right.find((v) => v.fieldCode === fieldCode);
  if (!l || !r) return false;

  const lVal = l.optionIds?.[0] ?? l.textValue ?? String(l.numberValue ?? l.booleanValue ?? "");
  const rVal = r.optionIds?.[0] ?? r.textValue ?? String(r.numberValue ?? r.booleanValue ?? "");

  if (mode === "equals") return lVal === rVal;
  return String(lVal).includes(String(rVal)) || String(rVal).includes(String(lVal));
}
