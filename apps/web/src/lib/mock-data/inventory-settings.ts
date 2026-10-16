/** Inventory app settings — stock module layout (Again settings form). */

export type InventorySettingKey =
  | "group_stock_packaging"
  | "module_stock_picking_batch"
  | "group_stock_partner_specific"
  | "stock_picking_policy"
  | "module_quality_control"
  | "annual_inventory_day"
  | "annual_inventory_month"
  | "group_stock_reception_report"
  | "module_stock_barcode"
  | "barcode_nomenclature_id"
  | "module_stock_barcode_barcodelookup"
  | "group_stock_sign_delivery"
  | "group_warning_stock"
  | "group_stock_multi_locations"
  | "group_stock_adv_location"
  | "group_stock_storage_categories"
  | "group_tracking_owner"
  | "group_production_lot"
  | "group_expiry_date"
  | "group_lot_on_delivery_slip"
  | "group_stock_lot_print_gs1"
  | "module_stock_dropshipping"
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

const MONTH_OPTIONS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

export const INVENTORY_SETTINGS_SECTIONS: InventorySettingsSection[] = [
  {
    id: "operations",
    title: "Operations",
    fields: [
      {
        key: "group_stock_packaging",
        type: "boolean",
        label: "Packages",
        help: "Put your products in packs (e.g. parcels, boxes) and track them",
        defaultValue: false,
      },
      {
        key: "module_stock_picking_batch",
        type: "boolean",
        label: "Batch, Wave & Cluster Transfers",
        help: "Optimize your transfers by grouping operations together and assigning jobs to workers",
        defaultValue: false,
        infoTip: true,
      },
      {
        key: "group_stock_partner_specific",
        type: "boolean",
        label: "Partner-Specific Instructions",
        help: "Display instructions tailored to the customer or vendor on stock operations.",
        defaultValue: false,
      },
      {
        key: "stock_picking_policy",
        type: "select",
        label: "Shipping Policy",
        help: "When to start shipping",
        defaultValue: "direct",
        halfColumn: true,
        asRadio: true,
        options: [
          { value: "direct", label: "As soon as possible, with partial delivery" },
          { value: "one", label: "When all products are ready" },
        ],
      },
      {
        key: "module_quality_control",
        type: "boolean",
        label: "Quality",
        help: "Add quality checks to your transfer operations",
        defaultValue: false,
        infoTip: true,
      },
      {
        key: "annual_inventory_day",
        type: "inline_date",
        label: "Annual Inventory Date",
        help: "By default, next physical inventory will be scheduled at this date",
        defaultDay: 31,
        defaultMonth: "12",
        monthOptions: MONTH_OPTIONS,
        halfColumn: true,
      },
      {
        key: "group_stock_reception_report",
        type: "boolean",
        label: "Reception Report",
        help: "View and allocate received quantities",
        defaultValue: true,
      },
    ],
  },
  {
    id: "barcode",
    title: "Barcode",
    fields: [
      {
        key: "module_stock_barcode",
        type: "boolean",
        label: "Barcode Scanner",
        help: "Process operations faster with barcodes",
        defaultValue: true,
        infoTip: true,
        subGroupLabel: "Barcode",
        subFields: [
          {
            key: "barcode_nomenclature_id",
            type: "select",
            label: "Default Nomenclature",
            help: "",
            defaultValue: "default",
            options: [
              { value: "default", label: "Default Nomenclature" },
              { value: "gs1", label: "Default GS1 Nomenclature" },
            ],
          },
        ],
      },
      {
        key: "module_stock_barcode_barcodelookup",
        type: "boolean",
        label: "Stock Barcode Database",
        help: "Create products easily by scanning using barcodelookup.com in barcode.",
        defaultValue: false,
        infoTip: true,
        helpLink: { label: "barcodelookup.com", url: "https://www.barcodelookup.com" },
      },
    ],
  },
  {
    id: "warehouse",
    title: "Warehouse",
    fields: [
      {
        key: "group_stock_multi_locations",
        type: "boolean",
        label: "Storage Locations",
        help: "Track product location in your warehouse (e.g. bins, racks) and trigger automated operations",
        defaultValue: true,
      },
      {
        key: "group_stock_adv_location",
        type: "boolean",
        label: "Multi-Step Routes",
        help: "Use your own routes and rules for product moves",
        defaultValue: false,
        visibleWhen: "group_stock_multi_locations",
      },
      {
        key: "group_stock_storage_categories",
        type: "boolean",
        label: "Storage Categories",
        help: "Define storage categories with capacity limits",
        defaultValue: false,
        visibleWhen: "group_stock_multi_locations",
      },
      {
        key: "group_tracking_owner",
        type: "boolean",
        label: "Consignment",
        help: "Track products that are owned by another company",
        defaultValue: false,
      },
      {
        key: "group_stock_sign_delivery",
        type: "boolean",
        label: "Signature",
        help: "Require a signature on your delivery orders",
        defaultValue: false,
      },
      {
        key: "group_warning_stock",
        type: "boolean",
        label: "Warnings",
        help: "Get warnings when purchasing or selling specific products",
        defaultValue: false,
      },
    ],
  },
  {
    id: "traceability",
    title: "Traceability",
    fields: [
      {
        key: "group_production_lot",
        type: "boolean",
        label: "Lots & Serial Numbers",
        help: "Get a full traceability from vendors to customers",
        defaultValue: false,
      },
      {
        key: "group_expiry_date",
        type: "boolean",
        label: "Expiration Dates",
        help: "Set expiration dates on lots and serial numbers",
        defaultValue: false,
        visibleWhen: "group_production_lot",
      },
      {
        key: "group_lot_on_delivery_slip",
        type: "boolean",
        label: "Display Lots & Serial Numbers on Delivery Slips",
        help: "Show lot or serial numbers on delivery documents",
        defaultValue: false,
        visibleWhen: "group_production_lot",
      },
      {
        key: "group_stock_lot_print_gs1",
        type: "boolean",
        label: "Print GS1 Barcodes for Lots & Serial Numbers",
        help: "Use GS1 nomenclature on lot and serial number labels",
        defaultValue: false,
        visibleWhen: "group_production_lot",
      },
    ],
  },
  {
    id: "shipping",
    title: "Shipping",
    fields: [
      {
        key: "module_stock_dropshipping",
        type: "boolean",
        label: "Dropshipping",
        help: "Request your vendors to deliver to your customers",
        defaultValue: false,
      },
    ],
  },
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
  return { ...defaultInventorySettingsValues(), ...(partial ?? {}) };
}

const SETTINGS_KEY = "againerp.inventory.settings";

export function readInventorySettings(): InventorySettingsValues {
  if (typeof window === "undefined") return defaultInventorySettingsValues();
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultInventorySettingsValues();
    return mergeInventorySettings(JSON.parse(raw) as Partial<InventorySettingsValues>);
  } catch {
    return defaultInventorySettingsValues();
  }
}

export function writeInventorySettings(next: InventorySettingsValues) {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(mergeInventorySettings(next)));
}
