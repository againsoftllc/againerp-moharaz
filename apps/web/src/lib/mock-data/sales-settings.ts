/** Sales app settings — mock defaults aligned with sale_management settings layout. */

export type SalesSettingKey =
  | "group_product_variant"
  | "group_product_variant_grid"
  | "group_uom"
  | "group_product_pricelist"
  | "product_pricelist_setting"
  | "group_discount_per_so_line"
  | "group_sale_taxes"
  | "group_sale_order_template"
  | "portal_confirmation_sign"
  | "portal_confirmation_pay"
  | "group_sale_order_dates"
  | "group_warning_sale"
  | "automatic_invoice"
  | "group_proforma_sales"
  | "default_invoice_policy"
  | "group_stock_packaging"
  | "module_delivery"
  | "module_delivery_shiprocket"
  | "group_sale_delivery_address"
  | "quotation_validity_days"
  | "group_auto_done_setting"
  | "group_sale_margin"
  | "module_sale_loyalty"
  | "module_sale_product_configurator"
  | "module_sale_amazon"
  | "module_sale_pdf_quote_builder";

export type SalesSettingField =
  | {
      key: SalesSettingKey;
      type: "boolean";
      label: string;
      help: string;
      defaultValue: boolean;
      /** Show teal info icon next to label (tooltip = help). */
      infoTip?: boolean;
      /** Teal action link under help (e.g. → Headers/Footers). */
      actionLink?: { label: string; href?: string };
      /** Primary action button under help (e.g. Configure Methods). */
      actionButton?: { label: string; href?: string };
    }
  | {
      key: SalesSettingKey;
      type: "select";
      label: string;
      help: string;
      defaultValue: string;
      options: { value: string; label: string }[];
      /** Show only when parent boolean is on */
      visibleWhen?: SalesSettingKey;
      infoTip?: boolean;
      /** Render as radio list (Again selection widget) instead of dropdown. */
      asRadio?: boolean;
    }
  | {
      key: SalesSettingKey;
      type: "number";
      label: string;
      help: string;
      defaultValue: number;
      visibleWhen?: SalesSettingKey;
    }
  | {
      key: SalesSettingKey;
      type: "inline_number";
      label: string;
      help: string;
      defaultValue: number;
      suffix: string;
      infoTip?: boolean;
    };

export type SalesSettingsSection = {
  id: string;
  title: string;
  fields: SalesSettingField[];
};

export const SALES_SETTINGS_SECTIONS: SalesSettingsSection[] = [
  {
    id: "product_catalog",
    title: "Product Catalog",
    fields: [
      {
        key: "group_product_variant",
        type: "boolean",
        label: "Variants",
        help: "Sell variants of a product using attributes (size, color, etc.)",
        defaultValue: false,
        infoTip: true,
      },
      {
        key: "group_product_variant_grid",
        type: "boolean",
        label: "Variant Grid Entry",
        help: "Add several variants to an order from a grid",
        defaultValue: false,
      },
      {
        key: "group_uom",
        type: "boolean",
        label: "Units of Measure & Packagings",
        help: "Sell and purchase products in different units of measure or packagings",
        defaultValue: false,
      },
      {
        key: "module_sale_product_configurator",
        type: "boolean",
        label: "Product Configurator",
        help: "Sell products that can be configured (options, accessories)",
        defaultValue: false,
      },
    ],
  },
  {
    id: "pricing",
    title: "Pricing",
    fields: [
      {
        key: "group_product_pricelist",
        type: "boolean",
        label: "Pricelists",
        help: "Set multiple prices per product, automated discounts, etc.",
        defaultValue: true,
      },
      {
        key: "product_pricelist_setting",
        type: "select",
        label: "Pricelist method",
        help: "How pricelists are applied on sales orders",
        defaultValue: "advanced",
        asRadio: true,
        infoTip: true,
        options: [
          { value: "basic", label: "Multiple prices per product" },
          { value: "advanced", label: "Advanced price rules (discounts, formulas)" },
        ],
        visibleWhen: "group_product_pricelist",
      },
      {
        key: "group_discount_per_so_line",
        type: "boolean",
        label: "Discounts",
        help: "Grant discounts on sales order lines",
        defaultValue: true,
      },
      {
        key: "group_sale_taxes",
        type: "boolean",
        label: "Taxes",
        help: "Show taxes on sales orders. Tax rates and rules will be managed from Accounting / Tax settings.",
        defaultValue: false,
        infoTip: true,
      },
      {
        key: "group_sale_margin",
        type: "boolean",
        label: "Margins",
        help: "Show margins on orders",
        defaultValue: false,
      },
      {
        key: "module_sale_loyalty",
        type: "boolean",
        label: "Coupons & Loyalty",
        help: "Manage promotions, coupons, loyalty cards, gift cards & eWallet",
        defaultValue: false,
      },
    ],
  },
  {
    id: "quotations_orders",
    title: "Quotations & Orders",
    fields: [
      {
        key: "quotation_validity_days",
        type: "inline_number",
        label: "Default Quotation Validity",
        help: "Default period during which the quote is valid and can still be accepted by the customer. The default can be changed per order or template.",
        defaultValue: 30,
        suffix: "days",
      },
      {
        key: "module_sale_pdf_quote_builder",
        type: "boolean",
        label: "PDF Quote builder",
        help: "Make your quote attractive by adding header pages, product descriptions and footer pages to your quote.",
        defaultValue: true,
        actionLink: { label: "Headers/Footers", href: "/sales/settings" },
      },
      {
        key: "group_auto_done_setting",
        type: "boolean",
        label: "Lock Confirmed Sales",
        help: "No longer edit orders once confirmed",
        defaultValue: false,
      },
      {
        key: "group_sale_order_template",
        type: "boolean",
        label: "Quotation Templates",
        help: "Create prepared quotation templates for recurring orders",
        defaultValue: true,
      },
      {
        key: "portal_confirmation_sign",
        type: "boolean",
        label: "Online Signature",
        help: "Request customers to sign quotations online",
        defaultValue: true,
      },
      {
        key: "portal_confirmation_pay",
        type: "boolean",
        label: "Online Payment",
        help: "Request an online payment on quotations to confirm orders",
        defaultValue: false,
      },
      {
        key: "group_sale_order_dates",
        type: "boolean",
        label: "Delivery Date",
        help: "Show delivery date on quotations and sales orders",
        defaultValue: true,
      },
      {
        key: "group_warning_sale",
        type: "boolean",
        label: "Sale Warnings",
        help: "Get warnings when selling specific products or to specific customers",
        defaultValue: false,
      },
    ],
  },
  {
    id: "shipping",
    title: "Shipping",
    fields: [
      {
        key: "module_delivery",
        type: "boolean",
        label: "Configure Delivery Methods",
        help: "Configure delivery methods or work with delivery providers using existing integrations.",
        defaultValue: true,
        infoTip: true,
        actionButton: { label: "Configure Methods" },
        actionLink: { label: "Find a Delivery Provider" },
      },
      {
        key: "group_sale_delivery_address",
        type: "boolean",
        label: "Customer Addresses",
        help: "Allow different invoice and delivery addresses on orders",
        defaultValue: true,
      },
      {
        key: "group_stock_packaging",
        type: "boolean",
        label: "Product Packagings",
        help: "Sell products by packagings (e.g. pack of 6)",
        defaultValue: false,
      },
    ],
  },
  {
    id: "invoicing",
    title: "Invoicing",
    fields: [
      {
        key: "default_invoice_policy",
        type: "select",
        label: "Invoicing Policy",
        help: "Quantities to invoice from sales orders",
        defaultValue: "order",
        asRadio: true,
        infoTip: true,
        options: [
          { value: "order", label: "Invoice what is ordered" },
          { value: "delivery", label: "Invoice what is delivered" },
        ],
      },
      {
        key: "automatic_invoice",
        type: "boolean",
        label: "Automatic Invoice",
        help: "Generate invoices automatically when an online payment is confirmed",
        defaultValue: false,
      },
      {
        key: "group_proforma_sales",
        type: "boolean",
        label: "Pro-Forma Invoice",
        help: "Allows you to send pro-forma invoices to customers",
        defaultValue: false,
      },
    ],
  },
  {
    id: "connectors",
    title: "Connectors",
    fields: [
      {
        key: "module_sale_amazon",
        type: "boolean",
        label: "Amazon Connector",
        help: "Import Amazon orders and sync deliveries",
        defaultValue: false,
      },
    ],
  },
];

export type SalesSettingsValues = Record<string, boolean | string | number>;

const SALES_SETTINGS_STORAGE_KEY = "againerp:sales-settings";

export function defaultSalesSettingsValues(): SalesSettingsValues {
  const values: SalesSettingsValues = {};
  for (const section of SALES_SETTINGS_SECTIONS) {
    for (const field of section.fields) {
      values[field.key] = field.defaultValue;
    }
  }
  return values;
}

export function loadSalesSettingsValues(): SalesSettingsValues {
  const defaults = defaultSalesSettingsValues();
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(SALES_SETTINGS_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as SalesSettingsValues;
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

export function saveSalesSettingsValues(values: SalesSettingsValues): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SALES_SETTINGS_STORAGE_KEY, JSON.stringify(values));
}

export function isSalesTaxesEnabled(values?: SalesSettingsValues): boolean {
  if (values) return Boolean(values.group_sale_taxes);
  if (typeof window === "undefined") return false;
  try {
    // Prefer shared settings store (Sales Settings › Taxes).
    const rawStore = window.localStorage.getItem("again-settings-v1");
    if (rawStore) {
      const parsed = JSON.parse(rawStore) as { state?: { values?: Record<string, unknown> } };
      const flag = parsed.state?.values?.["sales.option_taxes"];
      if (typeof flag === "boolean") return flag;
    }
  } catch {
    /* fall through */
  }
  const v = loadSalesSettingsValues();
  return Boolean(v.group_sale_taxes);
}
