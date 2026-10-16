/**
 * Shared attribute field types — aligned with catalog SPECIFICATIONS_ARCHITECTURE.
 * Configurator uses the subset required for component compatibility.
 */

import type { AttributeFieldType } from "@/lib/mock-data/attribute-profiles";

/** Configurator-supported field types (requirement #4) */
export const CONFIGURATOR_FIELD_TYPES = [
  "text",
  "dropdown",
  "multi_select",
  "number",
  "boolean",
] as const;

export type ConfiguratorFieldType = (typeof CONFIGURATOR_FIELD_TYPES)[number];

export const CONFIGURATOR_FIELD_TYPE_LABELS: Record<ConfiguratorFieldType, string> = {
  text: "Text",
  dropdown: "Dropdown",
  multi_select: "Multi select",
  number: "Number",
  boolean: "Boolean",
};

/** Map catalog AttributeFieldType → configurator subset where applicable */
export function toConfiguratorFieldType(
  catalogType: AttributeFieldType,
): ConfiguratorFieldType {
  if (catalogType === "checkbox") return "boolean";
  if (CONFIGURATOR_FIELD_TYPES.includes(catalogType as ConfiguratorFieldType)) {
    return catalogType as ConfiguratorFieldType;
  }
  return "text";
}

export function fieldTypeUsesOptions(type: ConfiguratorFieldType): boolean {
  return type === "dropdown" || type === "multi_select";
}

export function fieldTypeUsesNumberValidation(type: ConfiguratorFieldType): boolean {
  return type === "number";
}
