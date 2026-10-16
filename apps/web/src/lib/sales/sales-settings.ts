/** Sales Configuration › Settings — feature toggles for order drawer + module menu. */

export type SalesSettingKey =
  | "sales.tab_shipping"
  | "sales.tab_payment"
  | "sales.tab_others"
  | "sales.tab_history"
  | "sales.action_confirm"
  | "sales.action_preview"
  | "sales.action_print"
  | "sales.action_new"
  | "sales.option_discounts"
  | "sales.option_taxes"
  | "sales.option_shipping_charge"
  | "sales.option_register_payment"
  | "sales.option_line_sections"
  | "sales.option_customer_reference"
  | "sales.option_campaign"
  | "sales.option_tracking_source"
  | "sales.nav_quotations"
  | "sales.nav_dropship"
  | "sales.nav_sales_teams"
  | "sales.nav_to_invoice"
  | "sales.nav_products"
  | "sales.nav_reporting"
  | "sales.nav_delivery_methods"
  | "sales.nav_payment_methods"
  | "sales.nav_activities"
  | "sales.nav_config_extra";

export type SalesSettingField = {
  key: SalesSettingKey;
  label: string;
  help: string;
  defaultValue: boolean;
};

export type SalesSettingsSection = {
  id: string;
  title: string;
  fields: SalesSettingField[];
};

export const SALES_SETTINGS_SECTIONS: SalesSettingsSection[] = [
  {
    id: "order_tabs",
    title: "Order Drawer Tabs",
    fields: [
      {
        key: "sales.tab_shipping",
        label: "Shipping",
        help: "Show the Shipping tab (delivery address and shipping line)",
        defaultValue: true,
      },
      {
        key: "sales.tab_payment",
        label: "Payment",
        help: "Show the Payment tab (register payment and payment history)",
        defaultValue: true,
      },
      {
        key: "sales.tab_others",
        label: "Others",
        help: "Show the Others tab (customer reference, campaign, source)",
        defaultValue: true,
      },
      {
        key: "sales.tab_history",
        label: "History",
        help: "Show the History tab with order timeline and activity",
        defaultValue: true,
      },
    ],
  },
  {
    id: "order_actions",
    title: "Order Actions",
    fields: [
      {
        key: "sales.action_confirm",
        label: "Confirm",
        help: "Show Confirm on quotations to convert them into sales orders",
        defaultValue: true,
      },
      {
        key: "sales.action_preview",
        label: "Preview",
        help: "Show Preview to open the printable order document",
        defaultValue: true,
      },
      {
        key: "sales.action_print",
        label: "Print",
        help: "Show Print to open the browser print dialog",
        defaultValue: true,
      },
      {
        key: "sales.action_new",
        label: "New",
        help: "Show New to start another quotation from the open drawer",
        defaultValue: true,
      },
    ],
  },
  {
    id: "order_options",
    title: "Order Options",
    fields: [
      {
        key: "sales.option_discounts",
        label: "Discounts",
        help: "Allow order-level discounts in the totals panel",
        defaultValue: true,
      },
      {
        key: "sales.option_taxes",
        label: "Taxes",
        help: "Allow tax columns and Add taxes on the order",
        defaultValue: false,
      },
      {
        key: "sales.option_shipping_charge",
        label: "Shipping Charge",
        help: "Allow Add shipping / shipping amount on the order totals",
        defaultValue: true,
      },
      {
        key: "sales.option_register_payment",
        label: "Register Payment",
        help: "Show the register-payment form on the Payment tab",
        defaultValue: true,
      },
      {
        key: "sales.option_line_sections",
        label: "Sections & Notes",
        help: "Allow adding section and note rows on order lines",
        defaultValue: true,
      },
      {
        key: "sales.option_customer_reference",
        label: "Customer Reference",
        help: "Show customer reference on the Others tab",
        defaultValue: true,
      },
      {
        key: "sales.option_campaign",
        label: "Campaign",
        help: "Show marketing campaign field on the Others tab",
        defaultValue: true,
      },
      {
        key: "sales.option_tracking_source",
        label: "Source",
        help: "Show marketing source field on the Others tab",
        defaultValue: true,
      },
    ],
  },
  {
    id: "module_menu",
    title: "Sales Menu",
    fields: [
      {
        key: "sales.nav_quotations",
        label: "Quotations",
        help: "Show Quotations under the Orders menu",
        defaultValue: true,
      },
      {
        key: "sales.nav_dropship",
        label: "1688 Dropship",
        help: "Show 1688 Dropship under the Orders menu",
        defaultValue: true,
      },
      {
        key: "sales.nav_sales_teams",
        label: "Sales Teams",
        help: "Show Sales Teams under Orders and Configuration",
        defaultValue: true,
      },
      {
        key: "sales.nav_to_invoice",
        label: "To Invoice",
        help: "Show the To Invoice menu",
        defaultValue: true,
      },
      {
        key: "sales.nav_products",
        label: "Products Menu",
        help: "Show the Products menu in Sales",
        defaultValue: true,
      },
      {
        key: "sales.nav_reporting",
        label: "Reporting",
        help: "Show the Reporting menu in Sales",
        defaultValue: true,
      },
      {
        key: "sales.nav_delivery_methods",
        label: "Delivery Methods",
        help: "Show Delivery Methods under Configuration",
        defaultValue: true,
      },
      {
        key: "sales.nav_payment_methods",
        label: "Payment Methods",
        help: "Show payment providers / methods under Configuration",
        defaultValue: true,
      },
      {
        key: "sales.nav_activities",
        label: "Activities",
        help: "Show Activities and Activity Plans under Configuration",
        defaultValue: true,
      },
      {
        key: "sales.nav_config_extra",
        label: "Extra Config Pages",
        help: "Show Tags, Headers/Footers, Combo Choices, Categories, and Product Tags",
        defaultValue: true,
      },
    ],
  },
];

export type SalesSettingsValues = Record<SalesSettingKey, boolean>;

export function defaultSalesSettingsValues(): SalesSettingsValues {
  const values = {} as SalesSettingsValues;
  for (const section of SALES_SETTINGS_SECTIONS) {
    for (const field of section.fields) {
      values[field.key] = field.defaultValue;
    }
  }
  return values;
}

function readLegacySalesTaxes(): boolean | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem("againerp:sales-settings");
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.group_sale_taxes === "boolean") return parsed.group_sale_taxes;
  } catch {
    /* ignore */
  }
  return undefined;
}

export function mergeSalesSettingsValues(
  stored: Record<string, unknown> | undefined | null,
): SalesSettingsValues {
  const defaults = defaultSalesSettingsValues();
  if (!stored) return defaults;
  const next = { ...defaults };
  for (const key of Object.keys(defaults) as SalesSettingKey[]) {
    if (typeof stored[key] === "boolean") next[key] = stored[key] as boolean;
  }
  if (typeof stored["sales.option_taxes"] !== "boolean") {
    const legacyTaxes = readLegacySalesTaxes();
    if (legacyTaxes !== undefined) next["sales.option_taxes"] = legacyTaxes;
  }
  return next;
}

/** Resolved feature flags used by sales UI. */
export type SalesFeatureFlags = {
  tabShipping: boolean;
  tabPayment: boolean;
  tabOthers: boolean;
  tabHistory: boolean;
  actionConfirm: boolean;
  actionPreview: boolean;
  actionPrint: boolean;
  actionNew: boolean;
  optionDiscounts: boolean;
  optionTaxes: boolean;
  optionShippingCharge: boolean;
  optionRegisterPayment: boolean;
  optionLineSections: boolean;
  optionCustomerReference: boolean;
  optionCampaign: boolean;
  optionTrackingSource: boolean;
  navQuotations: boolean;
  navDropship: boolean;
  navSalesTeams: boolean;
  navToInvoice: boolean;
  navProducts: boolean;
  navReporting: boolean;
  navDeliveryMethods: boolean;
  navPaymentMethods: boolean;
  navActivities: boolean;
  navConfigExtra: boolean;
};

export function salesSettingsToFlags(values: SalesSettingsValues): SalesFeatureFlags {
  return {
    tabShipping: values["sales.tab_shipping"],
    tabPayment: values["sales.tab_payment"],
    tabOthers: values["sales.tab_others"],
    tabHistory: values["sales.tab_history"],
    actionConfirm: values["sales.action_confirm"],
    actionPreview: values["sales.action_preview"],
    actionPrint: values["sales.action_print"],
    actionNew: values["sales.action_new"],
    optionDiscounts: values["sales.option_discounts"],
    optionTaxes: values["sales.option_taxes"],
    optionShippingCharge: values["sales.option_shipping_charge"],
    optionRegisterPayment: values["sales.option_register_payment"] && values["sales.tab_payment"],
    optionLineSections: values["sales.option_line_sections"],
    optionCustomerReference: values["sales.option_customer_reference"],
    optionCampaign: values["sales.option_campaign"],
    optionTrackingSource: values["sales.option_tracking_source"],
    navQuotations: values["sales.nav_quotations"],
    navDropship: values["sales.nav_dropship"],
    navSalesTeams: values["sales.nav_sales_teams"],
    navToInvoice: values["sales.nav_to_invoice"],
    navProducts: values["sales.nav_products"],
    navReporting: values["sales.nav_reporting"],
    navDeliveryMethods: values["sales.nav_delivery_methods"],
    navPaymentMethods: values["sales.nav_payment_methods"],
    navActivities: values["sales.nav_activities"],
    navConfigExtra: values["sales.nav_config_extra"],
  };
}
