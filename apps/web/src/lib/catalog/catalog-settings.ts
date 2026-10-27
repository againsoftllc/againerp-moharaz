/** Website → Settings (catalog): saved per company through `/api/v1/module-settings/catalog`. Every field here is
 * enforced — SKU rules and publish rules by the product API, reviews / Q&A by the storefront API, the default status
 * by the product form. Defaults match the behaviour from before the page saved anything. */

export type CatalogSettingKey =
  | "auto_generate_sku"
  | "sku_prefix"
  | "require_brand"
  | "require_category"
  | "default_product_status"
  | "reviews_auto_approve"
  | "group_qa_enabled"
  | "qa_public_visibility";

export type CatalogSettingField =
  | {
      key: CatalogSettingKey;
      type: "boolean";
      label: string;
      help: string;
      defaultValue: boolean;
      visibleWhen?: CatalogSettingKey;
      infoTip?: boolean;
      actionLink?: { label: string; href?: string };
      actionButton?: { label: string; href?: string };
    }
  | {
      key: CatalogSettingKey;
      type: "select";
      label: string;
      help: string;
      defaultValue: string;
      options: { value: string; label: string }[];
      visibleWhen?: CatalogSettingKey;
      infoTip?: boolean;
      asRadio?: boolean;
    }
  | {
      key: CatalogSettingKey;
      type: "number";
      label: string;
      help: string;
      defaultValue: number;
      visibleWhen?: CatalogSettingKey;
    }
  | {
      key: CatalogSettingKey;
      type: "inline_number";
      label: string;
      help: string;
      defaultValue: number;
      suffix: string;
      infoTip?: boolean;
    }
  | {
      key: CatalogSettingKey;
      type: "text";
      label: string;
      help: string;
      defaultValue: string;
      visibleWhen?: CatalogSettingKey;
      placeholder?: string;
    };

export type CatalogSettingsSection = {
  id: string;
  title: string;
  fields: CatalogSettingField[];
};

export const CATALOG_SETTINGS_SECTIONS: CatalogSettingsSection[] = [
  {
    id: "product_data",
    title: "Products",
    fields: [
      {
        key: "auto_generate_sku",
        type: "boolean",
        label: "Auto-generate SKU",
        help: "Give a product saved without a SKU the next serial SKU. Off: a SKU must be entered.",
        defaultValue: true,
      },
      {
        key: "sku_prefix",
        type: "text",
        label: "SKU prefix",
        help: "Start of generated SKUs (letters, digits, - _ . /), followed by a 6-digit serial",
        defaultValue: "SKU-",
        visibleWhen: "auto_generate_sku",
        placeholder: "SKU-",
      },
      {
        key: "require_brand",
        type: "boolean",
        label: "Require brand",
        help: "A product can't be published without a brand",
        defaultValue: false,
        actionLink: { label: "Brands", href: "/website/brands" },
      },
      {
        key: "require_category",
        type: "boolean",
        label: "Require category",
        help: "A product can't be published without a category",
        defaultValue: false,
        actionLink: { label: "Categories", href: "/website/categories" },
      },
      {
        key: "default_product_status",
        type: "select",
        label: "Default product status",
        help: "Status a new product starts with in the product form",
        defaultValue: "draft",
        asRadio: true,
        options: [
          { value: "draft", label: "Draft (not visible on storefront)" },
          { value: "published", label: "Published (visible immediately)" },
        ],
      },
    ],
  },
  {
    id: "reviews_qa",
    title: "Reviews & Q&A",
    fields: [
      {
        key: "reviews_auto_approve",
        type: "boolean",
        label: "Auto-approve reviews",
        help: "Show new shopper reviews on the product page without moderation",
        defaultValue: false,
        actionLink: { label: "Reviews", href: "/website/reviews" },
      },
      {
        key: "group_qa_enabled",
        type: "boolean",
        label: "Product Q&A",
        help: "Shoppers can ask questions on product pages",
        defaultValue: true,
        actionLink: { label: "Q&A", href: "/website/qa" },
      },
      {
        key: "qa_public_visibility",
        type: "select",
        label: "Q&A visibility",
        help: "Which questions the product page shows",
        defaultValue: "answered_only",
        asRadio: true,
        visibleWhen: "group_qa_enabled",
        options: [
          { value: "answered_only", label: "Answered questions only" },
          { value: "all", label: "All questions (including unanswered)" },
        ],
      },
    ],
  },
];

export type CatalogSettingsValues = Record<string, boolean | string | number>;

export function defaultCatalogSettingsValues(): CatalogSettingsValues {
  const values: CatalogSettingsValues = {};
  for (const section of CATALOG_SETTINGS_SECTIONS) {
    for (const field of section.fields) {
      values[field.key] = field.defaultValue;
    }
  }
  return values;
}

/** Only keys the page still defines, so retired settings are dropped on the next save. */
export function mergeCatalogSettings(saved: Record<string, unknown> | null | undefined): CatalogSettingsValues {
  const values = defaultCatalogSettingsValues();
  for (const key of Object.keys(values)) {
    const v = saved?.[key];
    if (typeof v === "boolean" || typeof v === "string" || typeof v === "number") values[key] = v;
  }
  return values;
}
