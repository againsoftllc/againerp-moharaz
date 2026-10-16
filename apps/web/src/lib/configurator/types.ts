/** Product Configurator admin entity types */

export const CONFIGURATOR_PROFILE_TYPES = [
  "pc_builder",
  "laptop_builder",
  "cctv_builder",
  "networking_builder",
  "server_builder",
  "solar_builder",
  "custom",
] as const;

export type ConfiguratorProfileType = (typeof CONFIGURATOR_PROFILE_TYPES)[number];

export const CONFIGURATOR_STATUSES = ["active", "draft", "archived"] as const;
export type ConfiguratorStatus = (typeof CONFIGURATOR_STATUSES)[number];

export type ConfiguratorProfile = {
  id: string;
  name: string;
  slug: string;
  profileType: ConfiguratorProfileType;
  description?: string;
  isDefault: boolean;
  status: ConfiguratorStatus;
  categoryCount: number;
  ruleCount: number;
  templateCount: number;
  buildCount: number;
  updatedAt: string;
  createdAt: string;
};

export type SlotCondition = { f: string; op: "has" | "eq" | "neq" | "in"; v?: string };
export type SlotKind = "product" | "service" | "toggle";
export type SlotSort = "popular" | "low" | "high";

export type ConfiguratorCategory = {
  id: string;
  profileId: string;
  profileName: string;
  name: string;
  slug: string;
  description?: string;
  sortOrder: number;
  isRequired: boolean;
  selectionMode: "single" | "multiple";
  catalogCategorySlug?: string;
  /** Attribute profile whose products fill the slot; wins over the catalog category. */
  attributeProfileId?: string | null;
  productCount: number;
  status: ConfiguratorStatus;
  updatedAt: string;
  tabId?: string | null;
  kind: SlotKind;
  icon: string;
  conditions: SlotCondition[];
  specs: string[];
  /** Customer-side pick limits (how many of this part a build can hold). */
  minSelect?: number;
  maxSelect?: number;
  defaultSort?: SlotSort;
};

export type BuildComponentPick = {
  categoryId: string;
  categoryName: string;
  productId?: string;
  productName?: string;
  quantity: number;
};

export type ConfiguratorTemplate = {
  id: string;
  profileId: string;
  profileName: string;
  name: string;
  slug: string;
  description?: string;
  components: BuildComponentPick[];
  isFeatured: boolean;
  status: ConfiguratorStatus;
  useCount: number;
  updatedAt: string;
};

export type SavedBuild = {
  id: string;
  profileId: string;
  profileName: string;
  name: string;
  buildCode: string;
  customerName?: string;
  userName?: string;
  components: BuildComponentPick[];
  totalPrice: number;
  compatibilityStatus: "compatible" | "warning" | "incompatible";
  status: "draft" | "saved" | "ordered" | "abandoned";
  updatedAt: string;
  createdAt: string;
};

export type ConfiguratorAnalyticsKpi = {
  label: string;
  value: string | number;
  sub: string;
  trend?: "up" | "down" | "flat";
};

export const PROFILE_TYPE_LABELS: Record<ConfiguratorProfileType, string> = {
  pc_builder: "PC Builder",
  laptop_builder: "Laptop Builder",
  cctv_builder: "CCTV Builder",
  networking_builder: "Networking",
  server_builder: "Server",
  solar_builder: "Solar",
  custom: "Custom",
};

export const STATUS_LABELS: Record<ConfiguratorStatus, string> = {
  active: "Active",
  draft: "Draft",
  archived: "Archived",
};

export function slugifyConfigurator(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
