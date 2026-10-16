import type { FilterDisplayType } from "@/lib/mock-data/catalog-filters";

export type AttributeFieldType =
  | "text"
  | "textarea"
  | "number"
  | "dropdown"
  | "multi_select"
  | "checkbox"
  | "radio"
  | "date"
  | "color"
  | "image"
  | "url"
  | "file"
  | "boolean";

export type AttributeSpec = {
  id: string;
  groupId: string;
  name: string;
  code: string;
  fieldType: AttributeFieldType;
  sortOrder: number;
  isRequired: boolean;
  isFilterable: boolean;
  isComparable: boolean;
  isSearchable: boolean;
  isVisible: boolean;
  active: boolean;
  /** Storefront filter widget: multi_select | range | boolean | color | dynamic */
  filterDisplayType?: FilterDisplayType;
  storefrontFilterVisible?: boolean;
  unit?: string;
  helpText?: string;
  predefinedValues?: string[];
};

export type AttributeGroup = {
  id: string;
  profileId: string;
  name: string;
  code: string;
  sortOrder: number;
  active: boolean;
  description?: string;
};

export type AttributeProfile = {
  id: string;
  name: string;
  code: string;
  description?: string;
  sortOrder: number;
  active: boolean;
  productCount: number;
  iconUrl?: string;
  imageUrl?: string;
  categoryLabels: string[];
  updatedAt: string;
};

export const FIELD_TYPE_LABELS: Record<AttributeFieldType, string> = {
  text: "Text",
  textarea: "Textarea",
  number: "Number",
  dropdown: "Dropdown",
  multi_select: "Multi select",
  checkbox: "Checkbox",
  radio: "Radio",
  date: "Date",
  color: "Color",
  image: "Image",
  url: "URL",
  file: "File",
  boolean: "Boolean",
};

const profiles: AttributeProfile[] = [
  {
    id: "prof_laptop",
    name: "Laptop",
    code: "laptop",
    description: "Notebook and laptop specification template.",
    sortOrder: 0,
    active: true,
    productCount: 86,
    iconUrl: "https://picsum.photos/seed/prof-laptop/64/64",
    categoryLabels: ["Computers", "Laptops"],
    updatedAt: "2026-06-10",
  },
  {
    id: "prof_mobile",
    name: "Mobile Phone",
    code: "mobile_phone",
    description: "Smartphone specification template.",
    sortOrder: 1,
    active: true,
    productCount: 124,
    iconUrl: "https://picsum.photos/seed/prof-mobile/64/64",
    categoryLabels: ["Electronics", "Phones"],
    updatedAt: "2026-06-09",
  },
  {
    id: "prof_monitor",
    name: "Monitor",
    code: "monitor",
    sortOrder: 2,
    active: true,
    productCount: 34,
    categoryLabels: ["Computers", "Monitors"],
    updatedAt: "2026-06-08",
  },
  {
    id: "prof_camera",
    name: "Camera",
    code: "camera",
    sortOrder: 3,
    active: true,
    productCount: 28,
    categoryLabels: ["Electronics", "Cameras"],
    updatedAt: "2026-06-07",
  },
  {
    id: "prof_fashion",
    name: "Fashion Apparel",
    code: "fashion_apparel",
    sortOrder: 4,
    active: true,
    productCount: 210,
    categoryLabels: ["Apparel"],
    updatedAt: "2026-06-06",
  },
  {
    id: "prof_tv",
    name: "Television",
    code: "television",
    sortOrder: 5,
    active: false,
    productCount: 12,
    categoryLabels: ["Electronics", "TVs"],
    updatedAt: "2026-06-05",
  },
];

const groups: AttributeGroup[] = [
  { id: "grp_proc", profileId: "prof_laptop", name: "Processor", code: "processor", sortOrder: 0, active: true, description: "CPU and chipset specs" },
  { id: "grp_disp", profileId: "prof_laptop", name: "Display", code: "display", sortOrder: 1, active: true },
  { id: "grp_mem", profileId: "prof_laptop", name: "Memory", code: "memory", sortOrder: 2, active: true },
  { id: "grp_stor", profileId: "prof_laptop", name: "Storage", code: "storage", sortOrder: 3, active: true },
  { id: "grp_m_proc", profileId: "prof_mobile", name: "Processor", code: "processor", sortOrder: 0, active: true },
  { id: "grp_m_disp", profileId: "prof_mobile", name: "Display", code: "display", sortOrder: 1, active: true },
  { id: "grp_m_cam", profileId: "prof_mobile", name: "Camera", code: "camera", sortOrder: 2, active: true },
];

const attributes: AttributeSpec[] = [
  { id: "attr_proc_brand", groupId: "grp_proc", name: "Processor Brand", code: "processor_brand", fieldType: "dropdown", sortOrder: 0, isRequired: true, isFilterable: true, isComparable: true, isSearchable: true, isVisible: true, active: true, predefinedValues: ["Intel", "AMD", "Apple", "Qualcomm", "MediaTek"] },
  { id: "attr_proc_model", groupId: "grp_proc", name: "Processor Model", code: "processor_model", fieldType: "text", sortOrder: 1, isRequired: true, isFilterable: false, isComparable: true, isSearchable: true, isVisible: true, active: true },
  { id: "attr_proc_gen", groupId: "grp_proc", name: "Generation", code: "generation", fieldType: "dropdown", sortOrder: 2, isRequired: false, isFilterable: true, isComparable: true, isSearchable: false, isVisible: true, active: true, predefinedValues: ["10th Gen", "11th Gen", "12th Gen", "13th Gen", "14th Gen"] },
  { id: "attr_proc_freq", groupId: "grp_proc", name: "Processor Frequency", code: "processor_frequency", fieldType: "dropdown", sortOrder: 3, isRequired: false, isFilterable: true, isComparable: true, isSearchable: false, isVisible: true, active: true, unit: "GHz", predefinedValues: ["Up to 2.0 GHz", "2.0–3.0 GHz", "3.0–4.0 GHz", "4.0+ GHz"] },
  { id: "attr_proc_core", groupId: "grp_proc", name: "Processor Core", code: "processor_core", fieldType: "dropdown", sortOrder: 4, isRequired: false, isFilterable: true, isComparable: true, isSearchable: false, isVisible: true, active: true, predefinedValues: ["2", "4", "6", "8", "10", "12", "16"] },
  { id: "attr_proc_thread", groupId: "grp_proc", name: "Processor Thread", code: "processor_thread", fieldType: "number", sortOrder: 5, isRequired: false, isFilterable: false, isComparable: true, isSearchable: false, isVisible: true, active: true },
  { id: "attr_cpu_cache", groupId: "grp_proc", name: "CPU Cache", code: "cpu_cache", fieldType: "text", sortOrder: 6, isRequired: false, isFilterable: false, isComparable: true, isSearchable: false, isVisible: true, active: true, unit: "MB" },
  { id: "attr_chipset", groupId: "grp_proc", name: "Chipset", code: "chipset", fieldType: "text", sortOrder: 7, isRequired: false, isFilterable: false, isComparable: true, isSearchable: false, isVisible: true, active: true },
  { id: "attr_disp_size", groupId: "grp_disp", name: "Display Size", code: "display_size", fieldType: "dropdown", sortOrder: 0, isRequired: true, isFilterable: true, isComparable: true, isSearchable: false, isVisible: true, active: true, unit: "inch", predefinedValues: ["13\"", "13.3\"", "14\"", "15.6\"", "16\"", "17.3\""] },
  { id: "attr_disp_type", groupId: "grp_disp", name: "Display Type", code: "display_type", fieldType: "dropdown", sortOrder: 1, isRequired: false, isFilterable: true, isComparable: true, isSearchable: false, isVisible: true, active: true, predefinedValues: ["IPS", "OLED", "AMOLED", "TN", "VA", "Mini-LED"] },
  { id: "attr_resolution", groupId: "grp_disp", name: "Resolution", code: "resolution", fieldType: "dropdown", sortOrder: 2, isRequired: false, isFilterable: true, isComparable: true, isSearchable: false, isVisible: true, active: true, predefinedValues: ["1366x768 (HD)", "1920x1080 (FHD)", "2560x1440 (QHD)", "2560x1600", "3840x2160 (4K)"] },
  { id: "attr_refresh", groupId: "grp_disp", name: "Refresh Rate", code: "refresh_rate", fieldType: "dropdown", sortOrder: 3, isRequired: false, isFilterable: true, isComparable: true, isSearchable: false, isVisible: true, active: true, unit: "Hz", predefinedValues: ["60 Hz", "90 Hz", "120 Hz", "144 Hz", "165 Hz", "240 Hz"] },
  { id: "attr_ram", groupId: "grp_mem", name: "RAM", code: "ram", fieldType: "dropdown", sortOrder: 0, isRequired: true, isFilterable: true, isComparable: true, isSearchable: true, isVisible: true, active: true, unit: "GB", predefinedValues: ["4 GB", "8 GB", "16 GB", "32 GB", "64 GB"] },
  { id: "attr_ram_type", groupId: "grp_mem", name: "RAM Type", code: "ram_type", fieldType: "dropdown", sortOrder: 1, isRequired: false, isFilterable: true, isComparable: true, isSearchable: false, isVisible: true, active: true, predefinedValues: ["DDR4", "DDR5", "LPDDR4X", "LPDDR5", "LPDDR5X"] },
  { id: "attr_storage", groupId: "grp_stor", name: "Storage Capacity", code: "storage_capacity", fieldType: "dropdown", sortOrder: 0, isRequired: true, isFilterable: true, isComparable: true, isSearchable: true, isVisible: true, active: true, unit: "GB", predefinedValues: ["128 GB", "256 GB", "512 GB", "1 TB", "2 TB"] },
  { id: "attr_storage_type", groupId: "grp_stor", name: "Storage Type", code: "storage_type", fieldType: "dropdown", sortOrder: 1, isRequired: false, isFilterable: true, isComparable: true, isSearchable: false, isVisible: true, active: true, predefinedValues: ["SSD", "HDD", "NVMe SSD", "PCIe SSD", "eMMC"] },
  { id: "attr_m_chip", groupId: "grp_m_proc", name: "Chipset", code: "chipset", fieldType: "dropdown", sortOrder: 0, isRequired: true, isFilterable: true, isComparable: true, isSearchable: true, isVisible: true, active: true, predefinedValues: ["Snapdragon 8 Gen 3", "Snapdragon 8 Gen 2", "Dimensity 9300", "Apple A17 Pro", "Exynos 2400", "Google Tensor G3"] },
  { id: "attr_m_screen", groupId: "grp_m_disp", name: "Screen Size", code: "screen_size", fieldType: "dropdown", sortOrder: 0, isRequired: true, isFilterable: true, isComparable: true, isSearchable: false, isVisible: true, active: true, unit: "inch", predefinedValues: ["5.5\"", "6.1\"", "6.4\"", "6.7\"", "6.9\""] },
  { id: "attr_m_main_cam", groupId: "grp_m_cam", name: "Main Camera", code: "main_camera", fieldType: "text", sortOrder: 0, isRequired: false, isFilterable: false, isComparable: true, isSearchable: false, isVisible: true, active: true, unit: "MP" },
];

export function ensureSortOrder<T extends { sortOrder: number }>(items: T[]): T[] {
  return [...items]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item, i) => ({ ...item, sortOrder: i }));
}

export const attributeProfilesSeed = ensureSortOrder(profiles);
export const attributeGroupsSeed = ensureSortOrder(groups);
export const attributeSpecsSeed = ensureSortOrder(attributes);

export function countProfileStats(profileId: string, grps: AttributeGroup[], attrs: AttributeSpec[]) {
  const profileGroups = grps.filter((g) => g.profileId === profileId);
  const groupIds = new Set(profileGroups.map((g) => g.id));
  return {
    groupCount: profileGroups.length,
    attributeCount: attrs.filter((a) => groupIds.has(a.groupId)).length,
  };
}

export function slugifyAttributeCode(name: string) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || "attribute"
  );
}

export type BulkAttributeRow = {
  key: string;
  id?: string;
  name: string;
  filterable: boolean;
  filterDisplayType: FilterDisplayType;
  storefrontFilterVisible: boolean;
  predefinedValues: string[];
};

export type BulkAttributeGroupRow = {
  key: string;
  id?: string;
  name: string;
  attributes: BulkAttributeRow[];
};

export type BulkAttributeFormState = {
  profileName: string;
  groups: BulkAttributeGroupRow[];
};

export function profileToBulkForm(
  profile: AttributeProfile,
  grps: AttributeGroup[],
  attrs: AttributeSpec[],
): BulkAttributeFormState {
  const profileGroups = ensureSortOrder(grps.filter((g) => g.profileId === profile.id));

  return {
    profileName: profile.name,
    groups: profileGroups.map((group) => ({
      key: group.id,
      id: group.id,
      name: group.name,
      attributes: ensureSortOrder(attrs.filter((a) => a.groupId === group.id)).map((attr) => ({
        key: attr.id,
        id: attr.id,
        name: attr.name,
        filterable: attr.isFilterable,
        filterDisplayType: attr.filterDisplayType ?? "multi_select",
        storefrontFilterVisible: attr.storefrontFilterVisible ?? true,
        predefinedValues: attr.predefinedValues ?? [],
      })),
    })),
  };
}

export function createEmptyBulkGroup(): BulkAttributeGroupRow {
  return { key: `grp_new_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: "", attributes: [] };
}

export function createEmptyBulkAttribute(): BulkAttributeRow {
  return {
    key: `attr_new_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: "",
    filterable: false,
    filterDisplayType: "multi_select",
    storefrontFilterVisible: true,
    predefinedValues: [],
  };
}
