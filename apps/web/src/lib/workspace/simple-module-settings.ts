/** Field lists of the simple module settings pages. Values are saved per company through
 * `/api/v1/module-settings/{module}`; every field listed here is read by the module it configures. */

export type SimpleSettingValue = boolean | string | number;

export type SimpleSettingField =
  | {
      key: string;
      type: "boolean";
      label: string;
      help: string;
      defaultValue: boolean;
    }
  | {
      key: string;
      type: "select";
      label: string;
      help: string;
      defaultValue: string;
      options: { value: string; label: string }[];
    }
  | {
      key: string;
      type: "number";
      label: string;
      help: string;
      defaultValue: number;
      min?: number;
      max?: number;
      suffix?: string;
    }
  | {
      key: string;
      type: "text";
      label: string;
      help: string;
      defaultValue: string;
    };

export type SimpleSettingsSection = {
  id: string;
  title: string;
  fields: SimpleSettingField[];
};

export type SimpleModuleSettingsDef = {
  title: string;
  subtitle: string;
  /** Shown under the subtitle: where related settings live. */
  note?: { text: string; href: string; linkLabel: string };
  sections: SimpleSettingsSection[];
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

export const SIMPLE_MODULE_SETTINGS: Record<string, SimpleModuleSettingsDef> = {
  dashboard: {
    title: "Dashboard Settings",
    subtitle: "What the home overview shows when you open the workspace.",
    sections: [
      {
        id: "widgets",
        title: "Overview",
        fields: [
          {
            key: "showKpis",
            type: "boolean",
            label: "KPI tiles",
            help: "Show sales, orders, and stock summary cards on the dashboard.",
            defaultValue: true,
          },
          {
            key: "showRecentOrders",
            type: "boolean",
            label: "Recent orders",
            help: "List the latest sales orders on the overview.",
            defaultValue: true,
          },
          {
            key: "showLowStock",
            type: "boolean",
            label: "Low-stock alerts",
            help: "Highlight products at or below reorder level.",
            defaultValue: true,
          },
          {
            key: "refreshSeconds",
            type: "number",
            label: "Auto-refresh",
            help: "How often the overview reloads live figures. 0 keeps it manual.",
            defaultValue: 60,
            min: 0,
            max: 600,
            suffix: "sec",
          },
        ],
      },
    ],
  },
  rma: {
    title: "RMA Settings",
    subtitle: "Defaults used when agents work on return claims.",
    sections: [
      {
        id: "claims",
        title: "Claims",
        fields: [
          {
            key: "defaultResolution",
            type: "select",
            label: "Default resolution",
            help: "Pre-selected in Set resolution when a claim has no resolution yet.",
            defaultValue: "paid_repair",
            options: [
              { value: "paid_repair", label: "Paid repair" },
              { value: "warranty_repair", label: "Warranty repair" },
              { value: "replace", label: "Replacement" },
              { value: "refund", label: "Refund" },
              { value: "store_credit", label: "Store credit" },
              { value: "supplier_return", label: "Return to supplier" },
            ],
          },
        ],
      },
    ],
  },
  service: {
    title: "Service Settings",
    subtitle: "Job cards, SLA, and invoicing after repair work.",
    sections: [
      {
        id: "jobs",
        title: "Jobs",
        fields: [
          {
            key: "requireTechnician",
            type: "boolean",
            label: "Require technician",
            help: "A job cannot move in progress until a technician is assigned.",
            defaultValue: true,
          },
          {
            key: "defaultSlaHours",
            type: "number",
            label: "Default SLA",
            help: "Target turnaround used on new job cards.",
            defaultValue: 48,
            min: 1,
            max: 720,
            suffix: "hours",
          },
          {
            key: "autoInvoiceOnComplete",
            type: "boolean",
            label: "Invoice on complete",
            help: "Draft a service invoice when a job is marked complete.",
            defaultValue: true,
          },
          {
            key: "notifyCustomerOnStatus",
            type: "boolean",
            label: "Status notifications",
            help: "Email or SMS the customer when job status changes.",
            defaultValue: true,
          },
        ],
      },
    ],
  },
  vendors: {
    title: "Vendors Settings",
    subtitle: "Directory, portal, and default commercial terms.",
    sections: [
      {
        id: "directory",
        title: "Directory",
        fields: [
          {
            key: "requireTaxId",
            type: "boolean",
            label: "Require tax ID",
            help: "Block activating a vendor until a tax/VAT number is saved.",
            defaultValue: false,
          },
          {
            key: "allowPortalQuotes",
            type: "boolean",
            label: "Portal quotations",
            help: "Let vendors submit quotations from the vendor portal.",
            defaultValue: true,
          },
          {
            key: "defaultPaymentTerms",
            type: "select",
            label: "Default payment terms",
            help: "Pre-filled on new vendor records.",
            defaultValue: "net30",
            options: [
              { value: "due", label: "Due on receipt" },
              { value: "net15", label: "Net 15" },
              { value: "net30", label: "Net 30" },
              { value: "net45", label: "Net 45" },
              { value: "net60", label: "Net 60" },
            ],
          },
        ],
      },
    ],
  },
  security: {
    title: "Sign-in Security",
    subtitle: "Rules for every staff account of this company. Enforced by the server at sign-in and on every request.",
    note: {
      text: "Asking one member for a new password, lifting a lock and signing someone out are on the member's drawer (Security tab).",
      href: "/workspace/users",
      linkLabel: "Open users",
    },
    sections: [
      {
        id: "lockout",
        title: "Wrong passwords",
        fields: [
          {
            key: "lockoutAttempts",
            type: "number",
            label: "Lock after",
            help: "Wrong passwords in a row before the account is locked. 0 turns the lock off.",
            defaultValue: 5,
            min: 0,
            max: 20,
            suffix: "tries",
          },
          {
            key: "lockoutMinutes",
            type: "number",
            label: "Lock for",
            help: "How long the account stays locked. An administrator can lift it sooner.",
            defaultValue: 15,
            min: 1,
            max: 1440,
            suffix: "minutes",
          },
        ],
      },
      {
        id: "passwords",
        title: "Passwords",
        fields: [
          {
            key: "passwordExpiryDays",
            type: "number",
            label: "Password expires after",
            help: "A password older than this must be changed before the member can do anything else. 0 = never expires.",
            defaultValue: 0,
            min: 0,
            max: 3650,
            suffix: "days",
          },
        ],
      },
    ],
  },
  finance: {
    title: "Finance Settings",
    subtitle: "Payment controls. Posted journals can never be edited; reverse them instead.",
    note: {
      text: "The fiscal year and accounting periods are set in Company setup.",
      href: "/workspace/setup?tab=periods",
      linkLabel: "Open periods",
    },
    sections: [
      {
        id: "payments",
        title: "Payments",
        fields: [
          {
            key: "requirePaymentAccount",
            type: "boolean",
            label: "Require payment account",
            help: "Settling a receivable or payable, or paying an expense, must name the cash or bank account. Off: the default account for the payment method is used.",
            defaultValue: false,
          },
        ],
      },
    ],
  },
  accounting: {
    title: "Accounting Settings",
    subtitle: "Ledgers, currency, and automatic posting from operations.",
    sections: [
      {
        id: "ledger",
        title: "Ledger",
        fields: [
          {
            key: "multiCurrency",
            type: "boolean",
            label: "Multi-currency",
            help: "Allow journals and invoices in more than the company currency.",
            defaultValue: false,
          },
          {
            key: "autoPostSales",
            type: "boolean",
            label: "Auto-post sales",
            help: "Post a journal entry when a sales invoice is confirmed.",
            defaultValue: true,
          },
          {
            key: "autoPostBills",
            type: "boolean",
            label: "Auto-post bills",
            help: "Post a journal entry when a supplier bill is confirmed.",
            defaultValue: true,
          },
          {
            key: "fiscalYearStartMonth",
            type: "select",
            label: "Fiscal year starts",
            help: "Accounting period start month.",
            defaultValue: "1",
            options: MONTH_OPTIONS,
          },
        ],
      },
    ],
  },
  crm: {
    title: "CRM Settings",
    subtitle: "Leads, deals, and assignment defaults.",
    sections: [
      {
        id: "pipeline",
        title: "Pipeline",
        fields: [
          {
            key: "captureWebLeads",
            type: "boolean",
            label: "Capture website leads",
            help: "Create a lead when a website form is submitted.",
            defaultValue: true,
          },
          {
            key: "requireDealOwner",
            type: "boolean",
            label: "Require deal owner",
            help: "A deal cannot be marked won until an owner is assigned.",
            defaultValue: true,
          },
          {
            key: "defaultPipeline",
            type: "select",
            label: "Default pipeline",
            help: "Used when a new deal is created.",
            defaultValue: "sales",
            options: [
              { value: "sales", label: "Sales" },
              { value: "partner", label: "Partner" },
              { value: "support", label: "Support conversion" },
            ],
          },
        ],
      },
    ],
  },
  website: {
    title: "Website Configuration",
    subtitle: "Public site behaviour, indexing, and default locale.",
    sections: [
      {
        id: "site",
        title: "Site",
        fields: [
          {
            key: "maintenanceMode",
            type: "boolean",
            label: "Maintenance mode",
            help: "Show a maintenance page on the public website.",
            defaultValue: false,
          },
          {
            key: "indexPages",
            type: "boolean",
            label: "Allow search indexing",
            help: "Let search engines index published pages.",
            defaultValue: true,
          },
          {
            key: "defaultLocale",
            type: "select",
            label: "Default locale",
            help: "Language used when a visitor has no preference.",
            defaultValue: "en",
            options: [
              { value: "en", label: "English" },
              { value: "bn", label: "Bengali" },
            ],
          },
        ],
      },
    ],
  },
  media: {
    title: "Media Settings",
    subtitle: "Library defaults for images, videos, and documents.",
    sections: [
      {
        id: "library",
        title: "Library",
        fields: [
          {
            key: "defaultType",
            type: "select",
            label: "Default library tab",
            help: "The type filter the media library opens with.",
            defaultValue: "all",
            options: [
              { value: "all", label: "All types" },
              { value: "image", label: "Images" },
              { value: "video", label: "Videos" },
              { value: "document", label: "Documents" },
            ],
          },
          {
            key: "maxUploadMb",
            type: "number",
            label: "Max upload size",
            help: "Largest single file accepted by Upload in the media library.",
            defaultValue: 25,
            min: 1,
            max: 500,
            suffix: "MB",
          },
          {
            key: "showUsedIn",
            type: "boolean",
            label: "Show used-in",
            help: "List the products and pages that reference a file in its details panel.",
            defaultValue: true,
          },
        ],
      },
    ],
  },
};

export type SimpleSettingsValues = Record<string, SimpleSettingValue>;

export function defaultSimpleModuleValues(moduleId: string): SimpleSettingsValues {
  const def = SIMPLE_MODULE_SETTINGS[moduleId];
  const values: SimpleSettingsValues = {};
  if (!def) return values;
  for (const section of def.sections) {
    for (const field of section.fields) {
      values[field.key] = field.defaultValue;
    }
  }
  return values;
}

const LEGACY_STORAGE_KEY = "againerp.module.config";

/** Values an earlier version kept in this browser, offered once so nothing is lost on the move to the server. */
export function readLegacyModuleSettings(moduleId: string): SimpleSettingsValues | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const stored = (JSON.parse(raw) as Record<string, SimpleSettingsValues>)[moduleId];
    return stored ? pickKnownValues(moduleId, stored) : null;
  } catch {
    return null;
  }
}

export function clearLegacyModuleSettings(moduleId: string) {
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return;
    const all = JSON.parse(raw) as Record<string, SimpleSettingsValues>;
    delete all[moduleId];
    if (Object.keys(all).length) window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(all));
    else window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* storage unavailable: nothing to clear */
  }
}

/** Only the fields the page still defines, so retired settings are dropped on the next save. */
export function pickKnownValues(moduleId: string, values: SimpleSettingsValues): SimpleSettingsValues {
  const defaults = defaultSimpleModuleValues(moduleId);
  const out: SimpleSettingsValues = {};
  for (const key of Object.keys(defaults)) {
    if (key in values) out[key] = values[key];
  }
  return out;
}

export function mergeModuleSettings(moduleId: string, saved: SimpleSettingsValues | null | undefined): SimpleSettingsValues {
  return { ...defaultSimpleModuleValues(moduleId), ...pickKnownValues(moduleId, saved ?? {}) };
}
