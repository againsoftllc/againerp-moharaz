/** Dropshipping app settings — mock defaults aligned with sale_management settings layout. */

export type DropshippingCurrencyRate = {
  id: string;
  code: string;
  name: string;
  /** 1 unit of this currency = rateToBdt BDT */
  rateToBdt: number;
  active: boolean;
};

/** Presets available when adding a currency row. */
export const DROPSHIPPING_CURRENCY_PRESETS: Omit<DropshippingCurrencyRate, "id" | "active">[] = [
  { code: "CNY", name: "Chinese Yuan", rateToBdt: 18 },
  { code: "USD", name: "US Dollar", rateToBdt: 125 },
  { code: "EUR", name: "Euro", rateToBdt: 135 },
  { code: "GBP", name: "British Pound", rateToBdt: 160 },
  { code: "JPY", name: "Japanese Yen", rateToBdt: 0.85 },
  { code: "INR", name: "Indian Rupee", rateToBdt: 1.5 },
  { code: "HKD", name: "Hong Kong Dollar", rateToBdt: 16 },
  { code: "SGD", name: "Singapore Dollar", rateToBdt: 93 },
];

export function defaultDropshippingCurrencies(): DropshippingCurrencyRate[] {
  return [
    { id: "cny", code: "CNY", name: "Chinese Yuan", rateToBdt: 18, active: true },
    { id: "usd", code: "USD", name: "US Dollar", rateToBdt: 125, active: true },
  ];
}

export type DropshippingSettingKey =
  | "group_dropship_pricing"
  | "dropship_markup_percent"
  | "dropship_profit_bdt"
  | "dropship_server_charge_bdt"
  | "group_import_defaults"
  | "import_auto_publish"
  | "import_sync_images"
  | "import_default_status"
  | "group_product_variant"
  | "group_attributes"
  | "group_storefront_stock"
  | "group_storefront_seller"
  | "module_elim_connector"
  | "module_amazon_connector";

export type DropshippingSettingField =
  | {
      key: DropshippingSettingKey;
      type: "boolean";
      label: string;
      help: string;
      defaultValue: boolean;
      infoTip?: boolean;
      actionLink?: { label: string; href?: string };
      actionButton?: { label: string; href?: string };
      visibleWhen?: DropshippingSettingKey;
    }
  | {
      key: DropshippingSettingKey;
      type: "select";
      label: string;
      help: string;
      defaultValue: string;
      options: { value: string; label: string }[];
      visibleWhen?: DropshippingSettingKey;
      infoTip?: boolean;
      asRadio?: boolean;
    }
  | {
      key: DropshippingSettingKey;
      type: "number";
      label: string;
      help: string;
      defaultValue: number;
      visibleWhen?: DropshippingSettingKey;
      infoTip?: boolean;
    }
  | {
      key: DropshippingSettingKey;
      type: "inline_number";
      label: string;
      help: string;
      defaultValue: number;
      suffix: string;
      infoTip?: boolean;
      visibleWhen?: DropshippingSettingKey;
    };

export type DropshippingSettingsSection = {
  id: string;
  title: string;
  fields: DropshippingSettingField[];
};

export const DROPSHIPPING_SETTINGS_SECTIONS: DropshippingSettingsSection[] = [
  {
    id: "pricing",
    title: "Pricing",
    fields: [
      {
        key: "group_dropship_pricing",
        type: "boolean",
        label: "Dropship pricing formula",
        help: "Sell = (cost × rate) × (1 + markup%) + profit + server fee. Used for China and Amazon imports.",
        defaultValue: true,
        infoTip: true,
      },
      {
        key: "dropship_markup_percent",
        type: "inline_number",
        label: "Markup",
        help: "Percent added on converted cost before flat fees.",
        defaultValue: 30,
        suffix: "%",
        visibleWhen: "group_dropship_pricing",
      },
      {
        key: "dropship_profit_bdt",
        type: "number",
        label: "Profit (BDT)",
        help: "Optional flat profit added after markup.",
        defaultValue: 0,
        visibleWhen: "group_dropship_pricing",
      },
      {
        key: "dropship_server_charge_bdt",
        type: "number",
        label: "Server charge (BDT)",
        help: "Optional flat server / service fee added after markup.",
        defaultValue: 0,
        visibleWhen: "group_dropship_pricing",
      },
    ],
  },
  {
    id: "import",
    title: "Import defaults",
    fields: [
      {
        key: "group_import_defaults",
        type: "boolean",
        label: "Import presets",
        help: "Default behavior when importing products from AgainAPI or Amazon.",
        defaultValue: true,
      },
      {
        key: "import_auto_publish",
        type: "boolean",
        label: "Auto-publish after import",
        help: "Make imported products immediately visible on the storefront.",
        defaultValue: false,
        visibleWhen: "group_import_defaults",
      },
      {
        key: "import_sync_images",
        type: "boolean",
        label: "Sync product images",
        help: "Download and store source gallery images during import.",
        defaultValue: true,
        visibleWhen: "group_import_defaults",
      },
      {
        key: "import_default_status",
        type: "select",
        label: "Default product status",
        help: "Status applied to newly imported dropship products",
        defaultValue: "draft",
        asRadio: true,
        infoTip: true,
        options: [
          { value: "draft", label: "Draft — review before publishing" },
          { value: "active", label: "Active — ready for storefront" },
        ],
        visibleWhen: "group_import_defaults",
      },
    ],
  },
  {
    id: "product_catalog",
    title: "Product Catalog",
    fields: [
      {
        key: "group_product_variant",
        type: "boolean",
        label: "Variants",
        help: "Import and sell variants using attributes (size, color, etc.)",
        defaultValue: true,
        infoTip: true,
      },
      {
        key: "group_attributes",
        type: "boolean",
        label: "Attribute profiles",
        help: "Use dropshipping attribute profiles for filters and product sheets",
        defaultValue: true,
        actionLink: { label: "Configure Attributes", href: "/dropshipping/attributes" },
      },
    ],
  },
  {
    id: "storefront",
    title: "Storefront",
    fields: [
      {
        key: "group_storefront_stock",
        type: "boolean",
        label: "Show stock on product page",
        help: "Display available quantity from the source seller on the storefront",
        defaultValue: true,
      },
      {
        key: "group_storefront_seller",
        type: "boolean",
        label: "Show seller information",
        help: "Display supplier / shop details on dropship product pages",
        defaultValue: true,
      },
    ],
  },
  {
    id: "connectors",
    title: "Connectors",
    fields: [
      {
        key: "module_elim_connector",
        type: "boolean",
        label: "AgainDropAPI (Dropshipping)",
        help: "Connect AgainDrop API for 1688 / Taobao dropshipping imports",
        defaultValue: true,
        infoTip: true,
        actionButton: { label: "Configure", href: "/workspace/plugins/again-drop-api" },
        actionLink: { label: "Plugin settings", href: "/plugins/again-drop-api" },
      },
      {
        key: "module_amazon_connector",
        type: "boolean",
        label: "Amazon Connector",
        help: "Import Amazon catalog products and map pricing with USD → BDT",
        defaultValue: true,
        actionButton: { label: "Open Amazon Import" },
      },
    ],
  },
];

export type DropshippingSettingsValues = Record<string, boolean | string | number>;

export function defaultDropshippingSettingsValues(): DropshippingSettingsValues {
  const values: DropshippingSettingsValues = {};
  for (const section of DROPSHIPPING_SETTINGS_SECTIONS) {
    for (const field of section.fields) {
      values[field.key] = field.defaultValue;
    }
  }
  return values;
}
