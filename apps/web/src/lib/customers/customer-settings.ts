/** Customers Configuration › Settings — feature toggles for profile + module menu. */

export type CustomerSettingKey =
  | "customers.registration"
  | "customers.guest_checkout"
  | "customers.email_verify"
  | "customers.phone_verify"
  | "customers.tab_orders"
  | "customers.tab_payment"
  | "customers.tab_support"
  | "customers.tab_loyalty"
  | "customers.tab_history"
  | "customers.tab_overview"
  | "customers.field_photo"
  | "customers.field_company"
  | "customers.field_email"
  | "customers.field_phone"
  | "customers.field_additional_phone"
  | "customers.field_group"
  | "customers.field_status"
  | "customers.field_tags"
  | "customers.field_addresses"
  | "customers.opening_balance"
  | "customers.credit_limit"
  | "customers.payment_history"
  | "customers.reward_points"
  | "customers.wallet"
  | "customers.wishlist"
  | "customers.whatsapp"
  | "customers.nav_groups"
  | "customers.nav_segments"
  | "customers.nav_loyalty"
  | "customers.nav_rewards"
  | "customers.nav_wallet"
  | "customers.nav_wishlists"
  | "customers.nav_activities"
  | "customers.nav_support"
  | "customers.nav_marketing"
  | "customers.nav_reports";

export type CustomerSettingField = {
  key: CustomerSettingKey;
  label: string;
  help: string;
  defaultValue: boolean;
};

export type CustomerSettingsSection = {
  id: string;
  title: string;
  fields: CustomerSettingField[];
};

export const CUSTOMER_SETTINGS_SECTIONS: CustomerSettingsSection[] = [
  {
    id: "registration",
    title: "Registration",
    fields: [
      {
        key: "customers.registration",
        label: "Customer Registration",
        help: "Allow new customers to create an account from the storefront",
        defaultValue: true,
      },
      {
        key: "customers.guest_checkout",
        label: "Guest Checkout",
        help: "Let shoppers place orders without creating an account",
        defaultValue: true,
      },
      {
        key: "customers.email_verify",
        label: "Email Verification",
        help: "Require email verification before the customer can sign in",
        defaultValue: false,
      },
      {
        key: "customers.phone_verify",
        label: "Phone Verification",
        help: "Require phone verification for customer accounts",
        defaultValue: true,
      },
    ],
  },
  {
    id: "profile_tabs",
    title: "Customer Profile Tabs",
    fields: [
      {
        key: "customers.tab_overview",
        label: "Overview",
        help: "Show the Overview tab with KPIs and recent activity summaries",
        defaultValue: true,
      },
      {
        key: "customers.tab_orders",
        label: "Orders",
        help: "Show the Orders tab on the customer profile",
        defaultValue: true,
      },
      {
        key: "customers.tab_payment",
        label: "Payment",
        help: "Show the Payment tab (wallet, credit, payment history)",
        defaultValue: true,
      },
      {
        key: "customers.tab_support",
        label: "Support",
        help: "Show the Support / cases tab on the customer profile",
        defaultValue: false,
      },
      {
        key: "customers.tab_loyalty",
        label: "Loyalty",
        help: "Show the Loyalty tab with points history",
        defaultValue: false,
      },
      {
        key: "customers.tab_history",
        label: "History",
        help: "Show the History tab with admin and customer update timeline",
        defaultValue: false,
      },
    ],
  },
  {
    id: "profile_fields",
    title: "Profile Fields",
    fields: [
      {
        key: "customers.field_photo",
        label: "Profile Photo",
        help: "Show profile photo upload on the Profile tab",
        defaultValue: true,
      },
      {
        key: "customers.field_company",
        label: "Company",
        help: "Show company / employer field on the Profile tab",
        defaultValue: true,
      },
      {
        key: "customers.field_email",
        label: "Email",
        help: "Show email field on the Profile tab",
        defaultValue: true,
      },
      {
        key: "customers.field_phone",
        label: "Phone",
        help: "Show phone field on the Profile tab",
        defaultValue: true,
      },
      {
        key: "customers.field_additional_phone",
        label: "Additional Phone",
        help: "Allow adding an extra phone number on the Profile tab",
        defaultValue: true,
      },
      {
        key: "customers.field_group",
        label: "Customer Group",
        help: "Show customer group selector on the Profile tab",
        defaultValue: true,
      },
      {
        key: "customers.field_status",
        label: "Status",
        help: "Show status selector (Active / VIP / …) on the Profile tab",
        defaultValue: true,
      },
      {
        key: "customers.field_tags",
        label: "Tags",
        help: "Show tags field on the Profile tab",
        defaultValue: true,
      },
      {
        key: "customers.field_addresses",
        label: "Addresses",
        help: "Show address block on the Profile tab",
        defaultValue: true,
      },
    ],
  },
  {
    id: "payment_fields",
    title: "Payment Options",
    fields: [
      {
        key: "customers.opening_balance",
        label: "Opening Balance",
        help: "Show opening balance field on the Payment tab",
        defaultValue: true,
      },
      {
        key: "customers.credit_limit",
        label: "Credit Limit",
        help: "Show credit limit field on the Payment tab",
        defaultValue: true,
      },
      {
        key: "customers.payment_history",
        label: "Payment History",
        help: "Show collected payments and refunds on the Payment tab",
        defaultValue: true,
      },
      {
        key: "customers.wallet",
        label: "Wallet",
        help: "Enable wallet balance, recharge, and wallet menu",
        defaultValue: true,
      },
      {
        key: "customers.reward_points",
        label: "Reward Points",
        help: "Enable loyalty points chip and points history",
        defaultValue: true,
      },
      {
        key: "customers.whatsapp",
        label: "WhatsApp",
        help: "Enable WhatsApp number check and chat icon on the customer profile",
        defaultValue: true,
      },
    ],
  },
  {
    id: "module_menu",
    title: "Customers Menu",
    fields: [
      {
        key: "customers.nav_groups",
        label: "Customer Groups",
        help: "Show Customer Groups in the customers menu",
        defaultValue: true,
      },
      {
        key: "customers.nav_segments",
        label: "Segments",
        help: "Show Segments in the customers menu",
        defaultValue: true,
      },
      {
        key: "customers.nav_loyalty",
        label: "Loyalty Program",
        help: "Show Loyalty Program in the customers menu",
        defaultValue: false,
      },
      {
        key: "customers.nav_rewards",
        label: "Rewards",
        help: "Show Rewards in the customers menu",
        defaultValue: true,
      },
      {
        key: "customers.nav_wallet",
        label: "Wallet Menu",
        help: "Show Wallet page in the customers menu",
        defaultValue: true,
      },
      {
        key: "customers.nav_wishlists",
        label: "Wishlists",
        help: "Show Wishlists in the customers menu",
        defaultValue: true,
      },
      {
        key: "customers.wishlist",
        label: "Wishlist Feature",
        help: "Enable wishlist feature for customers",
        defaultValue: true,
      },
      {
        key: "customers.nav_activities",
        label: "Activities",
        help: "Show Activities in the customers menu",
        defaultValue: true,
      },
      {
        key: "customers.nav_support",
        label: "Support Menu",
        help: "Show Support in the customers menu",
        defaultValue: false,
      },
      {
        key: "customers.nav_marketing",
        label: "Marketing",
        help: "Show Marketing in the customers menu",
        defaultValue: true,
      },
      {
        key: "customers.nav_reports",
        label: "Reports",
        help: "Show Reports in the customers menu",
        defaultValue: true,
      },
    ],
  },
];

export type CustomerSettingsValues = Record<CustomerSettingKey, boolean>;

export function defaultCustomerSettingsValues(): CustomerSettingsValues {
  const values = {} as CustomerSettingsValues;
  for (const section of CUSTOMER_SETTINGS_SECTIONS) {
    for (const field of section.fields) {
      values[field.key] = field.defaultValue;
    }
  }
  return values;
}

export function mergeCustomerSettingsValues(
  stored: Record<string, unknown> | undefined | null,
): CustomerSettingsValues {
  const defaults = defaultCustomerSettingsValues();
  if (!stored) return defaults;
  const next = { ...defaults };
  for (const key of Object.keys(defaults) as CustomerSettingKey[]) {
    if (typeof stored[key] === "boolean") next[key] = stored[key] as boolean;
  }
  // Migrate older Notes tab toggle → History
  if (typeof stored["customers.tab_history"] !== "boolean" && typeof stored["customers.tab_notes"] === "boolean") {
    next["customers.tab_history"] = stored["customers.tab_notes"] as boolean;
  }
  return next;
}

/** Resolved feature flags used by customer UI. */
export type CustomerFeatureFlags = {
  tabOverview: boolean;
  tabOrders: boolean;
  tabPayment: boolean;
  tabSupport: boolean;
  tabLoyalty: boolean;
  tabHistory: boolean;
  fieldPhoto: boolean;
  fieldCompany: boolean;
  fieldEmail: boolean;
  fieldPhone: boolean;
  fieldAdditionalPhone: boolean;
  fieldGroup: boolean;
  fieldStatus: boolean;
  fieldTags: boolean;
  fieldAddresses: boolean;
  emailVerify: boolean;
  phoneVerify: boolean;
  openingBalance: boolean;
  creditLimit: boolean;
  paymentHistory: boolean;
  wallet: boolean;
  rewardPoints: boolean;
  wishlist: boolean;
  whatsapp: boolean;
  navGroups: boolean;
  navSegments: boolean;
  navLoyalty: boolean;
  navRewards: boolean;
  navWallet: boolean;
  navWishlists: boolean;
  navActivities: boolean;
  navSupport: boolean;
  navMarketing: boolean;
  navReports: boolean;
};

export function customerSettingsToFlags(values: CustomerSettingsValues): CustomerFeatureFlags {
  return {
    tabOverview: values["customers.tab_overview"],
    tabOrders: values["customers.tab_orders"],
    tabPayment: values["customers.tab_payment"],
    tabSupport: values["customers.tab_support"],
    tabLoyalty: values["customers.tab_loyalty"] && values["customers.reward_points"],
    tabHistory: values["customers.tab_history"],
    fieldPhoto: values["customers.field_photo"],
    fieldCompany: values["customers.field_company"],
    fieldEmail: values["customers.field_email"],
    fieldPhone: values["customers.field_phone"],
    fieldAdditionalPhone: values["customers.field_additional_phone"],
    fieldGroup: values["customers.field_group"],
    fieldStatus: values["customers.field_status"],
    fieldTags: values["customers.field_tags"],
    fieldAddresses: values["customers.field_addresses"],
    emailVerify: values["customers.email_verify"],
    phoneVerify: values["customers.phone_verify"],
    openingBalance: values["customers.opening_balance"],
    creditLimit: values["customers.credit_limit"],
    paymentHistory: values["customers.payment_history"],
    wallet: values["customers.wallet"],
    rewardPoints: values["customers.reward_points"],
    wishlist: values["customers.wishlist"],
    whatsapp: values["customers.whatsapp"],
    navGroups: values["customers.nav_groups"],
    navSegments: values["customers.nav_segments"],
    navLoyalty: values["customers.nav_loyalty"] && values["customers.reward_points"],
    navRewards: values["customers.nav_rewards"] && values["customers.reward_points"],
    navWallet: values["customers.nav_wallet"] && values["customers.wallet"],
    navWishlists: values["customers.nav_wishlists"] && values["customers.wishlist"],
    navActivities: values["customers.nav_activities"],
    navSupport: values["customers.nav_support"],
    navMarketing: values["customers.nav_marketing"],
    navReports: values["customers.nav_reports"],
  };
}
