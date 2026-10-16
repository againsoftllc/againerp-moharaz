import type { ConfiguratorFieldType } from "@/lib/attributes/field-types";

export type ConfiguratorFieldOption = {
  id: string;
  label: string;
  value: string;
  sortOrder: number;
};

export type ConfiguratorAttributeField = {
  id: string;
  profileId: string;
  name: string;
  code: string;
  fieldType: ConfiguratorFieldType;
  sortOrder: number;
  isRequired: boolean;
  isFilterable: boolean;
  isComparable: boolean;
  active: boolean;
  unit?: string;
  helpText?: string;
  validation?: {
    min?: number;
    max?: number;
    maxLength?: number;
  };
  options?: ConfiguratorFieldOption[];
};

export type ConfiguratorAttributeProfile = {
  id: string;
  name: string;
  code: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  description?: string;
  sortOrder: number;
  active: boolean;
  productCount: number;
  updatedAt: string;
};

export const configuratorAttributeProfilesSeed: ConfiguratorAttributeProfile[] = [
  {
    id: "cap_cpu",
    name: "CPU",
    code: "cpu",
    categoryId: "cc_cpu",
    categoryName: "CPU",
    categorySlug: "cpu",
    description: "Processor component attributes for PC/server builders.",
    sortOrder: 0,
    active: true,
    productCount: 42,
    updatedAt: "2026-06-15",
  },
  {
    id: "cap_mobo",
    name: "Motherboard",
    code: "motherboard",
    categoryId: "cc_mobo",
    categoryName: "Motherboard",
    categorySlug: "motherboard",
    description: "Mainboard compatibility attributes.",
    sortOrder: 1,
    active: true,
    productCount: 28,
    updatedAt: "2026-06-15",
  },
  {
    id: "cap_ram",
    name: "RAM",
    code: "ram",
    categoryId: "cc_ram",
    categoryName: "RAM",
    categorySlug: "ram",
    description: "Memory module attributes.",
    sortOrder: 2,
    active: true,
    productCount: 56,
    updatedAt: "2026-06-15",
  },
  {
    id: "cap_gpu",
    name: "Graphics Card",
    code: "gpu",
    categoryId: "cc_gpu",
    categoryName: "GPU",
    categorySlug: "gpu",
    sortOrder: 3,
    active: true,
    productCount: 19,
    updatedAt: "2026-06-14",
  },
  {
    id: "cap_camera",
    name: "CCTV Camera",
    code: "cctv_camera",
    categoryId: "cc_cctv_cam",
    categoryName: "Camera",
    categorySlug: "cctv-camera",
    description: "CCTV builder — not PC-specific.",
    sortOrder: 4,
    active: true,
    productCount: 12,
    updatedAt: "2026-06-14",
  },
];

const opt = (id: string, label: string, value: string, sortOrder: number): ConfiguratorFieldOption => ({
  id,
  label,
  value,
  sortOrder,
});

export const configuratorAttributeFieldsSeed: ConfiguratorAttributeField[] = [
  // CPU
  {
    id: "caf_socket",
    profileId: "cap_cpu",
    name: "Socket",
    code: "socket",
    fieldType: "dropdown",
    sortOrder: 0,
    isRequired: true,
    isFilterable: true,
    isComparable: true,
    active: true,
    options: [
      opt("opt_lga1700", "LGA 1700", "lga_1700", 0),
      opt("opt_am5", "AM5", "am5", 1),
      opt("opt_am4", "AM4", "am4", 2),
    ],
  },
  {
    id: "caf_gen",
    profileId: "cap_cpu",
    name: "Generation",
    code: "generation",
    fieldType: "dropdown",
    sortOrder: 1,
    isRequired: true,
    isFilterable: true,
    isComparable: true,
    active: true,
    options: [
      opt("opt_g14", "14th Gen", "14th", 0),
      opt("opt_g13", "13th Gen", "13th", 1),
      opt("opt_ryzen7", "Ryzen 7000", "ryzen_7000", 2),
    ],
  },
  {
    id: "caf_cores",
    profileId: "cap_cpu",
    name: "Core Count",
    code: "core_count",
    fieldType: "number",
    sortOrder: 2,
    isRequired: true,
    isFilterable: true,
    isComparable: true,
    active: true,
    validation: { min: 1, max: 128 },
  },
  {
    id: "caf_threads",
    profileId: "cap_cpu",
    name: "Thread Count",
    code: "thread_count",
    fieldType: "number",
    sortOrder: 3,
    isRequired: false,
    isFilterable: false,
    isComparable: true,
    active: true,
    validation: { min: 1, max: 256 },
  },
  {
    id: "caf_tdp",
    profileId: "cap_cpu",
    name: "TDP",
    code: "tdp",
    fieldType: "number",
    sortOrder: 4,
    isRequired: true,
    isFilterable: true,
    isComparable: true,
    active: true,
    unit: "W",
    validation: { min: 15, max: 350 },
  },
  // Motherboard
  {
    id: "caf_mobo_socket",
    profileId: "cap_mobo",
    name: "Socket",
    code: "socket",
    fieldType: "dropdown",
    sortOrder: 0,
    isRequired: true,
    isFilterable: true,
    isComparable: true,
    active: true,
    options: [
      opt("opt_lga1700", "LGA 1700", "lga_1700", 0),
      opt("opt_am5", "AM5", "am5", 1),
      opt("opt_am4", "AM4", "am4", 2),
    ],
  },
  {
    id: "caf_chipset",
    profileId: "cap_mobo",
    name: "Chipset",
    code: "chipset",
    fieldType: "dropdown",
    sortOrder: 1,
    isRequired: true,
    isFilterable: true,
    isComparable: true,
    active: true,
    options: [
      opt("opt_z790", "Intel Z790", "z790", 0),
      opt("opt_b650", "AMD B650", "b650", 1),
      opt("opt_x670", "AMD X670", "x670", 2),
    ],
  },
  {
    id: "caf_ram_type",
    profileId: "cap_mobo",
    name: "RAM Type",
    code: "ram_type",
    fieldType: "dropdown",
    sortOrder: 2,
    isRequired: true,
    isFilterable: true,
    isComparable: true,
    active: true,
    options: [
      opt("opt_ddr5", "DDR5", "ddr5", 0),
      opt("opt_ddr4", "DDR4", "ddr4", 1),
    ],
  },
  // RAM
  {
    id: "caf_ram_type_ram",
    profileId: "cap_ram",
    name: "Type",
    code: "type",
    fieldType: "dropdown",
    sortOrder: 0,
    isRequired: true,
    isFilterable: true,
    isComparable: true,
    active: true,
    options: [
      opt("opt_ddr5", "DDR5", "ddr5", 0),
      opt("opt_ddr4", "DDR4", "ddr4", 1),
    ],
  },
  {
    id: "caf_speed",
    profileId: "cap_ram",
    name: "Speed",
    code: "speed",
    fieldType: "number",
    sortOrder: 1,
    isRequired: true,
    isFilterable: true,
    isComparable: true,
    active: true,
    unit: "MHz",
    validation: { min: 1600, max: 8400 },
  },
  {
    id: "caf_capacity",
    profileId: "cap_ram",
    name: "Capacity",
    code: "capacity",
    fieldType: "number",
    sortOrder: 2,
    isRequired: true,
    isFilterable: true,
    isComparable: true,
    active: true,
    unit: "GB",
    validation: { min: 4, max: 192 },
  },
  {
    id: "caf_ecc",
    profileId: "cap_ram",
    name: "ECC",
    code: "ecc",
    fieldType: "boolean",
    sortOrder: 3,
    isRequired: false,
    isFilterable: true,
    isComparable: false,
    active: true,
  },
];

export function countConfiguratorProfileFields(
  profileId: string,
  fields: ConfiguratorAttributeField[],
): number {
  return fields.filter((f) => f.profileId === profileId && f.active).length;
}

export function slugifyConfiguratorCode(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function ensureFieldSortOrder(fields: ConfiguratorAttributeField[]): ConfiguratorAttributeField[] {
  return [...fields]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((f, i) => ({ ...f, sortOrder: i }));
}

export function ensureProfileSortOrder(
  profiles: ConfiguratorAttributeProfile[],
): ConfiguratorAttributeProfile[] {
  return [...profiles]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((p, i) => ({ ...p, sortOrder: i }));
}
