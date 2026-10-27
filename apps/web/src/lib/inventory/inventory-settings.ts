/** Inventory → Settings → Product Settings: which fields the Add Product drawer shows. Saved per company through
 * `/api/v1/module-settings/inventory`; stock policies (negative stock, warranty start) have their own endpoint. */

export type InventorySettingKey =
  | "product_field_barcode_type"
  | "product_field_business_locations"
  | "product_field_manage_stock"
  | "product_field_alert_quantity"
  | "product_field_unit_type"
  | "product_field_tracking"
  | "product_field_category"
  | "product_field_brand"
  | "product_field_warranty"
  | "product_field_origin"
  | "product_field_cost_price"
  | "product_field_last_selling_price"
  | "product_field_weight"
  | "product_field_applicable_tax"
  | "product_field_tax_type"
  | "product_field_not_for_selling"
  | "product_field_short_description"
  | "product_field_media"
  | "product_field_variants"
  | "product_field_digital_files"
  | "product_field_supplier_mapping"
  | "product_field_opening_stock";

type InventoryFieldBase = {
  infoTip?: boolean;
  visibleWhen?: InventorySettingKey;
  /** Single grid column (default for standalone selects). */
  halfColumn?: boolean;
};

export type InventorySettingField =
  | (InventoryFieldBase & {
      key: InventorySettingKey;
      type: "boolean";
      label: string;
      help: string;
      defaultValue: boolean;
      actionLink?: { label: string; href?: string };
      actionButton?: { label: string; href?: string };
      helpLink?: { label: string; url: string };
      subFields?: InventorySettingField[];
      subGroupLabel?: string;
    })
  | (InventoryFieldBase & {
      key: InventorySettingKey;
      type: "select";
      label: string;
      help: string;
      defaultValue: string;
      options: { value: string; label: string }[];
      asRadio?: boolean;
    })
  | (InventoryFieldBase & {
      key: InventorySettingKey;
      type: "number";
      label: string;
      help: string;
      defaultValue: number;
    })
  | (InventoryFieldBase & {
      key: InventorySettingKey;
      type: "inline_number";
      label: string;
      help: string;
      defaultValue: number;
      suffix: string;
    })
  | (InventoryFieldBase & {
      key: InventorySettingKey;
      type: "inline_date";
      label: string;
      help: string;
      defaultDay: number;
      defaultMonth: string;
      monthOptions: { value: string; label: string }[];
    });

export type InventorySettingsSection = {
  id: string;
  title: string;
  fields: InventorySettingField[];
};


export const INVENTORY_SETTINGS_SECTIONS: InventorySettingsSection[] = [
  {
    id: "products",
    title: "Product Settings",
    fields: [
      {
        key: "product_field_barcode_type",
        type: "boolean",
        label: "Barcode Type",
        help: "Show the barcode type dropdown (C128, EAN-13, etc.) on the Add Product form.",
        defaultValue: true,
      },
      {
        key: "product_field_business_locations",
        type: "boolean",
        label: "Business Locations",
        help: "Show the multi-warehouse picker for which locations sell this product.",
        defaultValue: true,
      },
      {
        key: "product_field_manage_stock",
        type: "boolean",
        label: "Manage Stock",
        help: "Show the Manage Stock toggle that gates Alert Quantity.",
        defaultValue: true,
      },
      {
        key: "product_field_alert_quantity",
        type: "boolean",
        label: "Alert Quantity",
        help: "Show the low-stock alert quantity field.",
        defaultValue: true,
      },
      {
        key: "product_field_unit_type",
        type: "boolean",
        label: "Unit Type",
        help: "Show the unit-of-measure field.",
        defaultValue: true,
      },
      {
        key: "product_field_tracking",
        type: "boolean",
        label: "Tracking",
        help: "Show the serial/batch tracking selector.",
        defaultValue: true,
      },
      {
        key: "product_field_category",
        type: "boolean",
        label: "Category",
        help: "Show the category picker.",
        defaultValue: true,
      },
      {
        key: "product_field_brand",
        type: "boolean",
        label: "Brand",
        help: "Show the brand picker.",
        defaultValue: true,
      },
      {
        key: "product_field_warranty",
        type: "boolean",
        label: "Warranty",
        help: "Show the warranty field.",
        defaultValue: true,
      },
      {
        key: "product_field_origin",
        type: "boolean",
        label: "Origin",
        help: "Show the country-of-origin field.",
        defaultValue: true,
      },
      {
        key: "product_field_cost_price",
        type: "boolean",
        label: "Cost Price",
        help: "Show the purchase/cost price field.",
        defaultValue: true,
      },
      {
        key: "product_field_last_selling_price",
        type: "boolean",
        label: "Last Selling Price",
        help: "Show the last selling price field.",
        defaultValue: true,
      },
      {
        key: "product_field_weight",
        type: "boolean",
        label: "Weight",
        help: "Show the weight field.",
        defaultValue: true,
      },
      {
        key: "product_field_applicable_tax",
        type: "boolean",
        label: "Applicable Tax",
        help: "Show the default tax-rate percentage field.",
        defaultValue: true,
      },
      {
        key: "product_field_tax_type",
        type: "boolean",
        label: "Selling Price Tax Type",
        help: "Show the Inclusive/Exclusive tax-type dropdown.",
        defaultValue: true,
      },
      {
        key: "product_field_not_for_selling",
        type: "boolean",
        label: "Not For Selling",
        help: "Show the Not For Selling checkbox.",
        defaultValue: true,
      },
      {
        key: "product_field_short_description",
        type: "boolean",
        label: "Short Description",
        help: "Show the short description field.",
        defaultValue: true,
      },
      {
        key: "product_field_media",
        type: "boolean",
        label: "Media",
        help: "Show the product images/media picker.",
        defaultValue: true,
      },
      {
        key: "product_field_variants",
        type: "boolean",
        label: "Variants",
        help: "Show the variant matrix for variable products.",
        defaultValue: true,
      },
      {
        key: "product_field_digital_files",
        type: "boolean",
        label: "Digital Files",
        help: "Show the digital-file uploader for digital products.",
        defaultValue: true,
      },
      {
        key: "product_field_supplier_mapping",
        type: "boolean",
        label: "Supplier Mapping",
        help: "Show the supplier-link section.",
        defaultValue: true,
      },
      {
        key: "product_field_opening_stock",
        type: "boolean",
        label: "Opening Stock",
        help: "Show the opening-stock popover.",
        defaultValue: true,
      },
    ],
  },
];

export type InventorySettingsValues = Record<string, boolean | string | number>;

function collectDefaults(fields: InventorySettingField[], values: InventorySettingsValues) {
  for (const field of fields) {
    if (field.type === "inline_date") {
      values.annual_inventory_day = field.defaultDay;
      values.annual_inventory_month = field.defaultMonth;
      continue;
    }
    values[field.key] = field.defaultValue;
    if (field.type === "boolean" && field.subFields) {
      collectDefaults(field.subFields, values);
    }
  }
}

export function defaultInventorySettingsValues(): InventorySettingsValues {
  const values: InventorySettingsValues = {};
  for (const section of INVENTORY_SETTINGS_SECTIONS) {
    collectDefaults(section.fields, values);
  }
  return values;
}

export function mergeInventorySettings(
  partial?: Partial<InventorySettingsValues> | null,
): InventorySettingsValues {
  return { ...defaultInventorySettingsValues(), ...pickInventorySettings(partial) };
}

const LEGACY_SETTINGS_KEY = "againerp.inventory.settings";

/** Product-field choices an earlier version kept in this browser, offered once on the move to the server. */
export function readLegacyInventorySettings(): InventorySettingsValues | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LEGACY_SETTINGS_KEY);
    if (!raw) return null;
    return pickInventorySettings(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    return null;
  }
}

export function clearLegacyInventorySettings() {
  try {
    window.localStorage.removeItem(LEGACY_SETTINGS_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Only keys this page still defines, so retired settings are dropped on the next save. */
export function pickInventorySettings(values: Record<string, unknown> | null | undefined): InventorySettingsValues {
  const defaults = defaultInventorySettingsValues();
  const out: InventorySettingsValues = {};
  for (const key of Object.keys(defaults)) {
    const value = values?.[key];
    if (typeof value === "boolean" || typeof value === "string" || typeof value === "number") out[key] = value;
  }
  return out;
}
