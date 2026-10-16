/** Catalog app settings — mock defaults (sales settings layout, catalog-focused). */

export type CatalogSettingKey =
  | "group_product_variant"
  | "group_product_variant_grid"
  | "group_uom"
  | "group_product_attributes"
  | "module_product_configurator"
  | "group_multi_barcode"
  | "group_product_media_gallery"
  | "default_product_status"
  | "require_brand"
  | "require_category"
  | "auto_generate_sku"
  | "sku_prefix"
  | "group_seo_defaults"
  | "meta_title_template"
  | "canonical_domain"
  | "group_schema_org"
  | "slug_strategy"
  | "group_reviews_enabled"
  | "reviews_auto_approve"
  | "reviews_verified_purchase_only"
  | "group_qa_enabled"
  | "qa_public_visibility"
  | "storefront_show_out_of_stock"
  | "storefront_hide_zero_price"
  | "default_sort_order"
  | "products_per_page"
  | "group_channel_catalog"
  | "group_channel_dropshipping"
  | "sync_media_on_import";

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
    id: "product_catalog",
    title: "Product Catalog",
    fields: [
      {
        key: "group_product_variant",
        type: "boolean",
        label: "Variants",
        help: "Sell variants of a product using attributes (size, color, etc.)",
        defaultValue: true,
        infoTip: true,
        actionLink: { label: "Manage variants", href: "/website/variants" },
      },
      {
        key: "group_product_variant_grid",
        type: "boolean",
        label: "Variant Grid Entry",
        help: "Create several variants from an attribute grid",
        defaultValue: true,
        visibleWhen: "group_product_variant",
      },
      {
        key: "group_uom",
        type: "boolean",
        label: "Units of Measure & Packagings",
        help: "Manage products in different units of measure or packagings",
        defaultValue: false,
      },
      {
        key: "group_product_attributes",
        type: "boolean",
        label: "Attributes",
        help: "Use filterable product attributes (material, storage, etc.)",
        defaultValue: true,
        actionLink: { label: "Attributes", href: "/website/attributes" },
      },
      {
        key: "module_product_configurator",
        type: "boolean",
        label: "Product Configurator",
        help: "Configure complex products with options and accessories",
        defaultValue: false,
        actionLink: { label: "Builder profiles", href: "/website/product-configurator/profiles" },
      },
    ],
  },
  {
    id: "product_data",
    title: "Product Data",
    fields: [
      {
        key: "auto_generate_sku",
        type: "boolean",
        label: "Auto-generate SKU",
        help: "Create a SKU automatically when a product is created without one",
        defaultValue: true,
      },
      {
        key: "sku_prefix",
        type: "text",
        label: "SKU prefix",
        help: "Prefix applied to auto-generated SKUs",
        defaultValue: "SKU-",
        visibleWhen: "auto_generate_sku",
        placeholder: "SKU-",
      },
      {
        key: "group_multi_barcode",
        type: "boolean",
        label: "Multiple barcodes",
        help: "Allow more than one barcode per product or variant",
        defaultValue: false,
      },
      {
        key: "group_product_media_gallery",
        type: "boolean",
        label: "Media gallery",
        help: "Attach multiple images and videos to products",
        defaultValue: true,
      },
      {
        key: "require_brand",
        type: "boolean",
        label: "Require brand",
        help: "Brand must be set before a product can be published",
        defaultValue: false,
        actionLink: { label: "Brands", href: "/website/brands" },
      },
      {
        key: "require_category",
        type: "boolean",
        label: "Require category",
        help: "At least one category is required before publishing",
        defaultValue: true,
        actionLink: { label: "Categories", href: "/website/categories" },
      },
      {
        key: "default_product_status",
        type: "select",
        label: "Default product status",
        help: "Status applied to newly created products",
        defaultValue: "draft",
        asRadio: true,
        infoTip: true,
        options: [
          { value: "draft", label: "Draft (not visible on storefront)" },
          { value: "active", label: "Active (publish immediately)" },
        ],
      },
    ],
  },
  {
    id: "seo_storefront",
    title: "SEO & Storefront",
    fields: [
      {
        key: "group_seo_defaults",
        type: "boolean",
        label: "SEO defaults",
        help: "Apply meta title/description templates when product SEO fields are empty",
        defaultValue: true,
      },
      {
        key: "meta_title_template",
        type: "text",
        label: "Meta title template",
        help: "Placeholders: {name}, {brand}, {sku}",
        defaultValue: "{name} | Again Store",
        visibleWhen: "group_seo_defaults",
        placeholder: "{name} | Again Store",
      },
      {
        key: "canonical_domain",
        type: "text",
        label: "Canonical domain",
        help: "Base URL used for canonical product and category links",
        defaultValue: "https://shop.example.com",
        placeholder: "https://shop.example.com",
      },
      {
        key: "group_schema_org",
        type: "boolean",
        label: "Product schema (JSON-LD)",
        help: "Emit schema.org Product markup for SEO and rich results",
        defaultValue: true,
      },
      {
        key: "slug_strategy",
        type: "select",
        label: "URL slug strategy",
        help: "How storefront URLs are built for products",
        defaultValue: "name",
        asRadio: true,
        infoTip: true,
        options: [
          { value: "name", label: "Product name" },
          { value: "sku", label: "SKU" },
          { value: "name_sku", label: "Name + SKU" },
        ],
      },
      {
        key: "default_sort_order",
        type: "select",
        label: "Default category sort",
        help: "Default sort on category listing pages",
        defaultValue: "featured",
        options: [
          { value: "featured", label: "Featured" },
          { value: "newest", label: "Newest" },
          { value: "price_asc", label: "Price: low to high" },
          { value: "price_desc", label: "Price: high to low" },
          { value: "name", label: "Name A–Z" },
        ],
      },
      {
        key: "products_per_page",
        type: "inline_number",
        label: "Products per page",
        help: "Default page size for catalog listing pages",
        defaultValue: 24,
        suffix: "products",
      },
      {
        key: "storefront_show_out_of_stock",
        type: "boolean",
        label: "Show out-of-stock products",
        help: "Keep out-of-stock products visible on the storefront",
        defaultValue: true,
      },
      {
        key: "storefront_hide_zero_price",
        type: "boolean",
        label: "Hide zero-price products",
        help: "Hide products with price 0 from public listings",
        defaultValue: false,
      },
    ],
  },
  {
    id: "reviews_qa",
    title: "Reviews & Q&A",
    fields: [
      {
        key: "group_reviews_enabled",
        type: "boolean",
        label: "Product reviews",
        help: "Allow customers to leave product reviews and ratings",
        defaultValue: true,
        actionLink: { label: "Reviews", href: "/website/reviews" },
      },
      {
        key: "reviews_auto_approve",
        type: "boolean",
        label: "Auto-approve reviews",
        help: "Publish new reviews without manual moderation",
        defaultValue: false,
        visibleWhen: "group_reviews_enabled",
      },
      {
        key: "reviews_verified_purchase_only",
        type: "boolean",
        label: "Verified purchase only",
        help: "Only customers with a completed order can submit a review",
        defaultValue: false,
        visibleWhen: "group_reviews_enabled",
      },
      {
        key: "group_qa_enabled",
        type: "boolean",
        label: "Product Q&A",
        help: "Allow customers to ask questions on product pages",
        defaultValue: true,
        actionLink: { label: "Q&A", href: "/website/qa" },
      },
      {
        key: "qa_public_visibility",
        type: "select",
        label: "Q&A visibility",
        help: "Who can see unanswered questions on the storefront",
        defaultValue: "answered_only",
        asRadio: true,
        visibleWhen: "group_qa_enabled",
        options: [
          { value: "answered_only", label: "Answered questions only" },
          { value: "all", label: "All questions (including pending)" },
        ],
      },
    ],
  },
  {
    id: "channels",
    title: "Channels & Sync",
    fields: [
      {
        key: "group_channel_catalog",
        type: "boolean",
        label: "Catalog channel",
        help: "Publish products to the main catalog / storefront channel",
        defaultValue: true,
      },
      {
        key: "group_channel_dropshipping",
        type: "boolean",
        label: "Dropshipping channel",
        help: "Share selected catalog products with the dropshipping module",
        defaultValue: true,
      },
      {
        key: "sync_media_on_import",
        type: "boolean",
        label: "Sync media on import",
        help: "Download and attach remote images when importing products",
        defaultValue: true,
        infoTip: true,
        actionButton: { label: "Import products" },
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
