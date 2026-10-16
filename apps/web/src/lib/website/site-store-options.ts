/** OpenCart-style site options stored in workspace_sites.options_json */

export type SiteStoreOptions = {
  template: string;
  default_layout: string;
  country: string;
  region: string;
  entry_region: string;
  language: string;
  admin_language: string;
  auto_update_currency: boolean;
  length_class: string;
  weight_class: string;
  category_product_count: boolean;
  catalog_items_per_page: string;
  list_description_limit: string;
  admin_items_per_page: string;
  allow_reviews: boolean;
  allow_guest_reviews: boolean;
  new_review_alert_mail: boolean;
  voucher_min: string;
  voucher_max: string;
  display_prices_with_tax: boolean;
  use_store_tax_address: string;
  use_customer_tax_address: string;
  customers_online: boolean;
  otp_verification: boolean;
  default_customer_group: string;
  login_display_prices: boolean;
  max_login_attempts: string;
  account_terms: string;
  new_account_alert_mail: boolean;
  invoice_prefix: string;
  api_user: string;
  display_weight_on_cart: boolean;
  guest_checkout: boolean;
  checkout_terms: string;
  order_status: string;
  order_print_status: string;
  processing_order_statuses: string[];
  complete_order_statuses: string[];
  new_order_alert_message: boolean;
  display_stock: boolean;
  show_out_of_stock_warning: boolean;
  stock_checkout: boolean;
  affiliate_requires_approval: boolean;
  automatic_commission: boolean;
  affiliate_commission: string;
  affiliate_terms: string;
  new_affiliate_alert_mail: boolean;
  return_terms: string;
  return_status: string;
  watermark_text: string;
  ftp_host: string;
  ftp_port: string;
  ftp_user: string;
  ftp_password: string;
  ftp_root: string;
  smtp_host: string;
  smtp_port: string;
  smtp_user: string;
  smtp_password: string;
  sms_gateway: string;
  sms_api_key: string;
  maintenance_mode: boolean;
  seo_urls: boolean;
  compression: boolean;
  /** Branding / chrome the storefront reads at runtime, per site. */
  storefront: StorefrontSiteOptions;
};

export type StorefrontHeaderAction = {
  id: string;
  label: string;
  href: string;
  enabled: boolean;
};

export type StorefrontMembership = {
  name: string;
  image: string;
};

/**
 * Blank values mean "keep the storefront's own default", so an empty form
 * never wipes out working branding.
 */
export type StorefrontSiteOptions = {
  emails: {
    support: string;
    sales: string;
    payments: string;
    delivery: string;
    returns: string;
  };
  header: {
    logo_alt: string;
    search_placeholder: string;
    actions: StorefrontHeaderAction[];
  };
  footer: {
    support_hours: string;
    payment_image: string;
    memberships: StorefrontMembership[];
  };
  social: {
    facebook: string;
    instagram: string;
    youtube: string;
  };
  theme: {
    primary_color: string;
    secondary_color: string;
    header_background: string;
    footer_background: string;
    font_family: string;
  };
  meta: {
    title_template: string;
    description: string;
    notice_text: string;
  };
};

export const STOREFRONT_HEADER_ACTIONS: { id: string; label: string }[] = [
  { id: "offers", label: "Offers" },
  { id: "happyHour", label: "Happy Hour" },
  { id: "pcBuilderMobile", label: "PC Builder (mobile)" },
  { id: "compare", label: "Compare" },
  { id: "account", label: "Account" },
  { id: "pcBuilderCta", label: "PC Builder (desktop CTA)" },
];

export const DEFAULT_STOREFRONT_OPTIONS: StorefrontSiteOptions = {
  emails: { support: "", sales: "", payments: "", delivery: "", returns: "" },
  header: {
    logo_alt: "",
    search_placeholder: "",
    actions: STOREFRONT_HEADER_ACTIONS.map(({ id }) => ({
      id,
      label: "",
      href: "",
      enabled: true,
    })),
  },
  footer: { support_hours: "", payment_image: "", memberships: [] },
  social: { facebook: "", instagram: "", youtube: "" },
  theme: {
    primary_color: "",
    secondary_color: "",
    header_background: "",
    footer_background: "",
    font_family: "",
  },
  meta: { title_template: "", description: "", notice_text: "" },
};

export function mergeStorefrontOptions(
  raw?: Partial<StorefrontSiteOptions> | null,
): StorefrontSiteOptions {
  const byId = new Map((raw?.header?.actions ?? []).map((a) => [a.id, a]));
  return {
    emails: { ...DEFAULT_STOREFRONT_OPTIONS.emails, ...(raw?.emails || {}) },
    header: {
      logo_alt: raw?.header?.logo_alt || "",
      search_placeholder: raw?.header?.search_placeholder || "",
      actions: STOREFRONT_HEADER_ACTIONS.map(({ id }) => {
        const cur = byId.get(id);
        return {
          id,
          label: cur?.label || "",
          href: cur?.href || "",
          enabled: cur?.enabled !== false,
        };
      }),
    },
    footer: {
      support_hours: raw?.footer?.support_hours || "",
      payment_image: raw?.footer?.payment_image || "",
      memberships: (raw?.footer?.memberships ?? []).map((m) => ({
        name: m?.name || "",
        image: m?.image || "",
      })),
    },
    social: { ...DEFAULT_STOREFRONT_OPTIONS.social, ...(raw?.social || {}) },
    theme: { ...DEFAULT_STOREFRONT_OPTIONS.theme, ...(raw?.theme || {}) },
    meta: { ...DEFAULT_STOREFRONT_OPTIONS.meta, ...(raw?.meta || {}) },
  };
}

export const NONE_OPTION = "--- None ---";

export const DEFAULT_SITE_OPTIONS: SiteStoreOptions = {
  template: "default",
  default_layout: "common/home",
  country: "Bangladesh",
  region: "Dhaka Division",
  entry_region: "dropdown",
  language: "English",
  admin_language: "English",
  auto_update_currency: true,
  length_class: "Centimeter",
  weight_class: "Kilogram",
  category_product_count: true,
  catalog_items_per_page: "16",
  list_description_limit: "100",
  admin_items_per_page: "100",
  allow_reviews: true,
  allow_guest_reviews: false,
  new_review_alert_mail: true,
  voucher_min: "1",
  voucher_max: "1000",
  display_prices_with_tax: true,
  use_store_tax_address: "Shipping Address",
  use_customer_tax_address: "Shipping Address",
  customers_online: true,
  otp_verification: true,
  default_customer_group: "Default",
  login_display_prices: false,
  max_login_attempts: "5",
  account_terms: NONE_OPTION,
  new_account_alert_mail: true,
  invoice_prefix: "AGC-",
  api_user: "",
  display_weight_on_cart: false,
  guest_checkout: true,
  checkout_terms: NONE_OPTION,
  order_status: "Pending",
  order_print_status: "Pending",
  processing_order_statuses: ["Processing", "Processed"],
  complete_order_statuses: ["Complete", "Shipped"],
  new_order_alert_message: true,
  display_stock: true,
  show_out_of_stock_warning: true,
  stock_checkout: false,
  affiliate_requires_approval: true,
  automatic_commission: false,
  affiliate_commission: "5",
  affiliate_terms: NONE_OPTION,
  new_affiliate_alert_mail: true,
  return_terms: NONE_OPTION,
  return_status: "Pending",
  watermark_text: "",
  ftp_host: "",
  ftp_port: "21",
  ftp_user: "",
  ftp_password: "",
  ftp_root: "",
  smtp_host: "",
  smtp_port: "587",
  smtp_user: "",
  smtp_password: "",
  sms_gateway: "BulkSMS BD",
  sms_api_key: "",
  maintenance_mode: false,
  seo_urls: true,
  compression: true,
  storefront: DEFAULT_STOREFRONT_OPTIONS,
};

export function mergeSiteOptions(raw?: Partial<SiteStoreOptions> | null): SiteStoreOptions {
  // A missing or null key must fall back to its default; spreading it straight
  // in would blank the field and make the control render unset.
  const provided = Object.fromEntries(
    Object.entries(raw || {}).filter(([, value]) => value !== undefined && value !== null),
  ) as Partial<SiteStoreOptions>;

  return {
    ...DEFAULT_SITE_OPTIONS,
    ...provided,
    storefront: mergeStorefrontOptions(raw?.storefront),
  };
}
