/** Local module configuration — used by modules that do not yet have a dedicated settings store. */

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
    subtitle: "Return claims, restock, and replacement rules.",
    sections: [
      {
        id: "claims",
        title: "Claims",
        fields: [
          {
            key: "requirePhotos",
            type: "boolean",
            label: "Require photos",
            help: "Ask for product photos before a claim can be submitted.",
            defaultValue: true,
          },
          {
            key: "autoApproveUnder",
            type: "number",
            label: "Auto-approve under",
            help: "Automatically approve claims at or below this amount. 0 disables auto-approve.",
            defaultValue: 0,
            min: 0,
            suffix: "amount",
          },
          {
            key: "restockOnReceive",
            type: "boolean",
            label: "Restock on receive",
            help: "Put received units back into sellable stock after QC pass.",
            defaultValue: false,
          },
          {
            key: "defaultResolution",
            type: "select",
            label: "Default resolution",
            help: "Pre-filled when an agent opens a new claim.",
            defaultValue: "replace",
            options: [
              { value: "replace", label: "Replacement" },
              { value: "refund", label: "Refund" },
              { value: "repair", label: "Repair" },
              { value: "credit", label: "Store credit" },
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
  finance: {
    title: "Finance Settings",
    subtitle: "Journals, payments, and posting controls.",
    sections: [
      {
        id: "posting",
        title: "Posting",
        fields: [
          {
            key: "lockPostedJournal",
            type: "boolean",
            label: "Lock posted journals",
            help: "Posted entries cannot be edited — reverse them instead.",
            defaultValue: true,
          },
          {
            key: "requirePaymentAccount",
            type: "boolean",
            label: "Require payment account",
            help: "Every payment must pick a cash or bank account.",
            defaultValue: true,
          },
          {
            key: "fiscalYearStartMonth",
            type: "select",
            label: "Fiscal year starts",
            help: "Used on P&L and other period reports.",
            defaultValue: "1",
            options: MONTH_OPTIONS,
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
            help: "Opened first when you enter Media.",
            defaultValue: "image",
            options: [
              { value: "image", label: "Images" },
              { value: "video", label: "Videos" },
              { value: "document", label: "Documents" },
            ],
          },
          {
            key: "maxUploadMb",
            type: "number",
            label: "Max upload size",
            help: "Largest file accepted in the media library.",
            defaultValue: 25,
            min: 1,
            max: 500,
            suffix: "MB",
          },
          {
            key: "showUsedIn",
            type: "boolean",
            label: "Show used-in",
            help: "List products and pages that reference each file.",
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

const STORAGE_KEY = "againerp.module.config";

function readAll(): Record<string, SimpleSettingsValues> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, SimpleSettingsValues>;
  } catch {
    return {};
  }
}

export function readSimpleModuleSettings(moduleId: string): SimpleSettingsValues {
  const stored = readAll()[moduleId];
  return { ...defaultSimpleModuleValues(moduleId), ...(stored ?? {}) };
}

export function writeSimpleModuleSettings(moduleId: string, values: SimpleSettingsValues) {
  const all = readAll();
  all[moduleId] = { ...defaultSimpleModuleValues(moduleId), ...values };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}
