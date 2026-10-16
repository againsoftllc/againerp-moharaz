export type FilterDisplayType =
  | "multi_select"
  | "range"
  | "boolean"
  | "color"
  | "dynamic";

export type FilterSource = "built_in" | "attribute";

export type CatalogFacetFilter = {
  id: string;
  name: string;
  paramKey: string;
  displayType: FilterDisplayType;
  source: FilterSource;
  attributeId?: string;
  attributeName: string;
  sortOrder: number;
  isActive: boolean;
  storefrontVisible: boolean;
  categoryScope: string;
  valueCount: number;
  urlExample: string;
  updatedAt: string;
  isSystem?: boolean;
};

export const FILTER_DISPLAY_LABELS: Record<FilterDisplayType, string> = {
  multi_select: "Multi-select",
  range: "Range",
  boolean: "Boolean",
  color: "Color swatch",
  dynamic: "Dynamic",
};

export const FILTER_SOURCE_LABELS: Record<FilterSource, string> = {
  built_in: "Built-in",
  attribute: "Attribute",
};

export const MOCK_FILTER_ATTRIBUTES = [
  { id: "attr_brand", name: "Brand" },
  { id: "attr_color", name: "Color" },
  { id: "attr_ram", name: "RAM" },
  { id: "attr_storage", name: "Storage" },
  { id: "attr_processor", name: "Processor" },
  { id: "attr_screen", name: "Screen Size" },
  { id: "attr_weight", name: "Weight" },
] as const;

export const catalogFiltersSeed: CatalogFacetFilter[] = [
  {
    id: "flt_brand",
    name: "Brand",
    paramKey: "brand",
    displayType: "multi_select",
    source: "attribute",
    attributeId: "attr_brand",
    attributeName: "Brand",
    sortOrder: 0,
    isActive: true,
    storefrontVisible: true,
    categoryScope: "All categories",
    valueCount: 12,
    urlExample: "?brand=apple&brand=samsung",
    updatedAt: "2026-06-12",
  },
  {
    id: "flt_price",
    name: "Price",
    paramKey: "price",
    displayType: "range",
    source: "built_in",
    attributeName: "Selling price",
    sortOrder: 1,
    isActive: true,
    storefrontVisible: true,
    categoryScope: "All categories",
    valueCount: 0,
    urlExample: "?price_min=10000&price_max=50000",
    updatedAt: "2026-06-12",
    isSystem: true,
  },
  {
    id: "flt_color",
    name: "Color",
    paramKey: "color",
    displayType: "color",
    source: "attribute",
    attributeId: "attr_color",
    attributeName: "Color",
    sortOrder: 2,
    isActive: true,
    storefrontVisible: true,
    categoryScope: "All categories",
    valueCount: 18,
    urlExample: "?color=red&color=black",
    updatedAt: "2026-06-11",
  },
  {
    id: "flt_ram",
    name: "RAM",
    paramKey: "ram",
    displayType: "dynamic",
    source: "attribute",
    attributeId: "attr_ram",
    attributeName: "RAM",
    sortOrder: 3,
    isActive: true,
    storefrontVisible: true,
    categoryScope: "Electronics",
    valueCount: 6,
    urlExample: "?ram=8gb&ram=16gb",
    updatedAt: "2026-06-11",
  },
  {
    id: "flt_storage",
    name: "Storage",
    paramKey: "storage",
    displayType: "dynamic",
    source: "attribute",
    attributeId: "attr_storage",
    attributeName: "Storage",
    sortOrder: 4,
    isActive: true,
    storefrontVisible: true,
    categoryScope: "Electronics",
    valueCount: 8,
    urlExample: "?storage=128gb&storage=256gb",
    updatedAt: "2026-06-10",
  },
  {
    id: "flt_processor",
    name: "Processor",
    paramKey: "processor",
    displayType: "dynamic",
    source: "attribute",
    attributeId: "attr_processor",
    attributeName: "Processor",
    sortOrder: 5,
    isActive: true,
    storefrontVisible: false,
    categoryScope: "Laptops",
    valueCount: 14,
    urlExample: "?processor=intel-i7",
    updatedAt: "2026-06-09",
  },
  {
    id: "flt_in_stock",
    name: "In stock only",
    paramKey: "in_stock",
    displayType: "boolean",
    source: "built_in",
    attributeName: "Stock status",
    sortOrder: 6,
    isActive: true,
    storefrontVisible: true,
    categoryScope: "All categories",
    valueCount: 0,
    urlExample: "?in_stock=true",
    updatedAt: "2026-06-09",
    isSystem: true,
  },
  {
    id: "flt_on_sale",
    name: "On sale",
    paramKey: "on_sale",
    displayType: "boolean",
    source: "built_in",
    attributeName: "Offer price",
    sortOrder: 7,
    isActive: true,
    storefrontVisible: true,
    categoryScope: "All categories",
    valueCount: 0,
    urlExample: "?on_sale=true",
    updatedAt: "2026-06-08",
  },
  {
    id: "flt_weight",
    name: "Weight",
    paramKey: "weight",
    displayType: "range",
    source: "attribute",
    attributeId: "attr_weight",
    attributeName: "Weight",
    sortOrder: 8,
    isActive: false,
    storefrontVisible: false,
    categoryScope: "Electronics",
    valueCount: 0,
    urlExample: "?weight_min=0.5&weight_max=2",
    updatedAt: "2026-06-07",
  },
  {
    id: "flt_screen",
    name: "Screen size",
    paramKey: "screen",
    displayType: "range",
    source: "attribute",
    attributeId: "attr_screen",
    attributeName: "Screen Size",
    sortOrder: 9,
    isActive: true,
    storefrontVisible: true,
    categoryScope: "Phones & Tablets",
    valueCount: 0,
    urlExample: "?screen_min=6&screen_max=6.8",
    updatedAt: "2026-06-06",
  },
];

export function ensureFilterSortOrder(items: CatalogFacetFilter[]) {
  return [...items]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item, index) => ({ ...item, sortOrder: index }));
}
