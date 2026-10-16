/** API Explorer catalog — provider-agnostic executable endpoints. */

export type ExplorerFieldType =
  | "text"
  | "number"
  | "checkbox"
  | "select"
  | "file"
  | "textarea";

export type ExplorerFieldDef = {
  key: string;
  label: string;
  type: ExplorerFieldType;
  required?: boolean;
  defaultValue?: string | number | boolean;
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
  hint?: string;
};

export type ExplorerCategoryId =
  | "authentication"
  | "products"
  | "categories"
  | "brands"
  | "images"
  | "utilities";

export type ExplorerEndpointId =
  | "auth.testConnection"
  | "auth.health"
  | "products.search"
  | "products.get"
  | "products.searchByImage"
  | "categories.list"
  | "brands.list"
  | "currencies.list"
  | "images.upload"
  | "utilities.ping";

export type ExplorerEndpointDef = {
  id: ExplorerEndpointId;
  category: ExplorerCategoryId;
  name: string;
  description: string;
  method: "GET" | "POST";
  /** Logical path shown in UI (not always literal HTTP). */
  path: string;
  fields: ExplorerFieldDef[];
};

export type ExplorerCategoryDef = {
  id: ExplorerCategoryId;
  label: string;
};

export const EXPLORER_CATEGORIES: ExplorerCategoryDef[] = [
  { id: "authentication", label: "Authentication" },
  { id: "products", label: "Products" },
  { id: "categories", label: "Categories" },
  { id: "brands", label: "Brands" },
  { id: "images", label: "Images" },
  { id: "utilities", label: "Utilities" },
];

export const EXPLORER_ENDPOINTS: ExplorerEndpointDef[] = [
  {
    id: "auth.testConnection",
    category: "authentication",
    name: "Test Connection",
    description: "Verify credentials and measure latency",
    method: "POST",
    path: "/provider/testConnection",
    fields: [],
  },
  {
    id: "auth.health",
    category: "authentication",
    name: "Health",
    description: "Cached or live health snapshot",
    method: "GET",
    path: "/provider/health",
    fields: [],
  },
  {
    id: "products.search",
    category: "products",
    name: "Search Products",
    description: "Keyword product search",
    method: "POST",
    path: "/provider/searchProducts",
    fields: [
      { key: "q", label: "Keyword", type: "text", required: true, placeholder: "phone case" },
      { key: "page", label: "Page", type: "number", defaultValue: 1 },
      { key: "size", label: "Size", type: "number", defaultValue: 20 },
      {
        key: "sort",
        label: "Sort",
        type: "select",
        defaultValue: "",
        options: [
          { label: "Default", value: "" },
          { label: "Price ↑", value: "PRICE_ASC" },
          { label: "Price ↓", value: "PRICE_DESC" },
          { label: "Sales ↓", value: "SALE_QTY_DESC" },
        ],
      },
      { key: "minPrice", label: "Min Price", type: "number" },
      { key: "maxPrice", label: "Max Price", type: "number" },
      {
        key: "platform",
        label: "Platform",
        type: "select",
        defaultValue: "taobao",
        options: [
          { label: "Taobao", value: "taobao" },
          { label: "1688", value: "alibaba" },
        ],
      },
      {
        key: "lang",
        label: "Language",
        type: "select",
        defaultValue: "en",
        options: [
          { label: "English", value: "en" },
          { label: "Vietnamese", value: "vi" },
          { label: "Chinese", value: "zh" },
        ],
      },
    ],
  },
  {
    id: "products.get",
    category: "products",
    name: "Get Product",
    description: "Fetch full product detail by ID",
    method: "POST",
    path: "/provider/getProduct",
    fields: [
      { key: "id", label: "Product ID", type: "text", required: true, placeholder: "683802263680" },
      {
        key: "platform",
        label: "Platform",
        type: "select",
        defaultValue: "taobao",
        options: [
          { label: "Taobao", value: "taobao" },
          { label: "1688", value: "alibaba" },
        ],
      },
      {
        key: "lang",
        label: "Language",
        type: "select",
        defaultValue: "en",
        options: [
          { label: "English", value: "en" },
          { label: "Vietnamese", value: "vi" },
          { label: "Chinese", value: "zh" },
        ],
      },
    ],
  },
  {
    id: "products.searchByImage",
    category: "products",
    name: "Search By Image",
    description: "Find products from image URL, ID, or upload",
    method: "POST",
    path: "/provider/searchByImage",
    fields: [
      { key: "imgUrl", label: "Image URL", type: "text", placeholder: "https://img.alicdn.com/..." },
      { key: "imgId", label: "Image ID", type: "text" },
      { key: "file", label: "Upload File", type: "file" },
      { key: "page", label: "Page", type: "number", defaultValue: 1 },
      { key: "size", label: "Size", type: "number", defaultValue: 20 },
      {
        key: "platform",
        label: "Platform",
        type: "select",
        defaultValue: "taobao",
        options: [
          { label: "Taobao", value: "taobao" },
          { label: "1688", value: "alibaba" },
        ],
      },
    ],
  },
  {
    id: "categories.list",
    category: "categories",
    name: "List Categories",
    description: "Browse provider categories",
    method: "GET",
    path: "/provider/getCategories",
    fields: [
      {
        key: "platform",
        label: "Platform",
        type: "select",
        defaultValue: "taobao",
        options: [
          { label: "Taobao", value: "taobao" },
          { label: "1688", value: "alibaba" },
        ],
      },
      { key: "parentId", label: "Parent ID", type: "text" },
    ],
  },
  {
    id: "brands.list",
    category: "brands",
    name: "List Brands",
    description: "Browse brands when supported",
    method: "GET",
    path: "/provider/getBrands",
    fields: [],
  },
  {
    id: "currencies.list",
    category: "utilities",
    name: "List Currencies",
    description: "Supported currency codes",
    method: "GET",
    path: "/provider/getCurrencies",
    fields: [],
  },
  {
    id: "images.upload",
    category: "images",
    name: "Upload Image",
    description: "Upload image for later image search (Elim)",
    method: "POST",
    path: "/provider/uploadImage",
    fields: [{ key: "file", label: "Image File", type: "file", required: true }],
  },
  {
    id: "utilities.ping",
    category: "utilities",
    name: "Ping Active Provider",
    description: "Alias of testConnection for the active provider",
    method: "POST",
    path: "/provider/ping",
    fields: [],
  },
];

export function getEndpoint(id: ExplorerEndpointId): ExplorerEndpointDef | undefined {
  return EXPLORER_ENDPOINTS.find((e) => e.id === id);
}

export function endpointsByCategory(category: ExplorerCategoryId): ExplorerEndpointDef[] {
  return EXPLORER_ENDPOINTS.filter((e) => e.category === category);
}

export function defaultFieldValues(endpoint: ExplorerEndpointDef): Record<string, string | number | boolean | File | null> {
  const values: Record<string, string | number | boolean | File | null> = {};
  for (const field of endpoint.fields) {
    if (field.type === "file") values[field.key] = null;
    else if (field.defaultValue !== undefined) values[field.key] = field.defaultValue;
    else if (field.type === "checkbox") values[field.key] = false;
    else if (field.type === "number") values[field.key] = "";
    else values[field.key] = "";
  }
  return values;
}
