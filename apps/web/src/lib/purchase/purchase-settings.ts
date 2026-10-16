/** Purchase Configuration › Settings — operations, receiving, bills, RFQ. */

export type PurchaseSettings = {
  defaultWarehouseId: string;
  defaultPaymentTerms: string;
  billDueDays: number;
  requireConfirmBeforeReceive: boolean;
  allowOverReceive: boolean;
  rfqRequired: boolean;
  autoDraftReceipt: boolean;
  requireQcOnReceipt: boolean;
  threeWayMatch: boolean;
  matchTolerancePct: number;
  autoPostMatchedBills: boolean;
  blockPayOnException: boolean;
  minQuotesToAward: number;
  autoCloseRfqOnAward: boolean;
};

export const DEFAULT_PURCHASE_SETTINGS: PurchaseSettings = {
  defaultWarehouseId: "",
  defaultPaymentTerms: "net30",
  billDueDays: 30,
  requireConfirmBeforeReceive: true,
  allowOverReceive: false,
  rfqRequired: false,
  autoDraftReceipt: false,
  requireQcOnReceipt: false,
  threeWayMatch: true,
  matchTolerancePct: 2,
  autoPostMatchedBills: false,
  blockPayOnException: true,
  minQuotesToAward: 1,
  autoCloseRfqOnAward: true,
};

export const PURCHASE_PAYMENT_TERM_OPTIONS = [
  { value: "due", label: "Due on receipt" },
  { value: "net7", label: "Net 7" },
  { value: "net15", label: "Net 15" },
  { value: "net30", label: "Net 30" },
  { value: "net45", label: "Net 45" },
  { value: "net60", label: "Net 60" },
] as const;

export type PurchaseSettingKey = keyof PurchaseSettings;

export type PurchaseSettingField =
  | {
      key: PurchaseSettingKey;
      type: "boolean";
      label: string;
      help: string;
    }
  | {
      key: PurchaseSettingKey;
      type: "select";
      label: string;
      help: string;
      options: { value: string; label: string }[];
    }
  | {
      key: PurchaseSettingKey;
      type: "warehouse";
      label: string;
      help: string;
    }
  | {
      key: PurchaseSettingKey;
      type: "number";
      label: string;
      help: string;
      min?: number;
      max?: number;
      suffix?: string;
    };

export type PurchaseSettingsSection = {
  id: string;
  title: string;
  fields: PurchaseSettingField[];
};

export const PURCHASE_SETTINGS_SECTIONS: PurchaseSettingsSection[] = [
  {
    id: "operations",
    title: "Operations",
    fields: [
      {
        key: "defaultWarehouseId",
        type: "warehouse",
        label: "Default warehouse",
        help: "Used when creating a PO from RFQ award, reorder, or a new order with no location picked.",
      },
      {
        key: "defaultPaymentTerms",
        type: "select",
        label: "Default payment terms",
        help: "Pre-filled on new purchase orders. Suppliers can still override per order.",
        options: [...PURCHASE_PAYMENT_TERM_OPTIONS],
      },
      {
        key: "billDueDays",
        type: "number",
        label: "Bill due days",
        help: "Days after bill date used when creating a supplier bill from a PO.",
        min: 0,
        max: 180,
        suffix: "days",
      },
    ],
  },
  {
    id: "orders",
    title: "Purchase Orders",
    fields: [
      {
        key: "requireConfirmBeforeReceive",
        type: "boolean",
        label: "Confirm before receive",
        help: "Goods receipts stay blocked until the purchase order is confirmed.",
      },
      {
        key: "allowOverReceive",
        type: "boolean",
        label: "Allow over-receive",
        help: "Let GRN quantities exceed the ordered qty. New POs inherit this flag.",
      },
      {
        key: "rfqRequired",
        type: "boolean",
        label: "RFQ before PO",
        help: "Prefer awarding a quotation before raising a purchase order.",
      },
    ],
  },
  {
    id: "receiving",
    title: "Receiving",
    fields: [
      {
        key: "autoDraftReceipt",
        type: "boolean",
        label: "Draft receipt on confirm",
        help: "Create a draft goods receipt when a PO is confirmed.",
      },
      {
        key: "requireQcOnReceipt",
        type: "boolean",
        label: "QC on receipt",
        help: "Hold posted stock until quality check is recorded on the GRN.",
      },
    ],
  },
  {
    id: "bills",
    title: "Bills & Matching",
    fields: [
      {
        key: "threeWayMatch",
        type: "boolean",
        label: "Three-way match",
        help: "Compare PO qty, received qty, and billed qty before posting to AP.",
      },
      {
        key: "matchTolerancePct",
        type: "number",
        label: "Match tolerance",
        help: "Price variance allowed before a bill is marked as an exception.",
        min: 0,
        max: 25,
        suffix: "%",
      },
      {
        key: "autoPostMatchedBills",
        type: "boolean",
        label: "Auto-post matched bills",
        help: "When three-way match passes, post the bill to Finance payables.",
      },
      {
        key: "blockPayOnException",
        type: "boolean",
        label: "Block pay on exception",
        help: "Do not allow AP payment while the bill match status is exception.",
      },
    ],
  },
  {
    id: "rfq",
    title: "RFQ & Quotations",
    fields: [
      {
        key: "minQuotesToAward",
        type: "number",
        label: "Minimum quotes to award",
        help: "Suggested minimum supplier quotes before awarding an RFQ to a PO.",
        min: 1,
        max: 10,
      },
      {
        key: "autoCloseRfqOnAward",
        type: "boolean",
        label: "Close RFQ on award",
        help: "Mark the RFQ closed when a quotation is awarded and a PO is created.",
      },
    ],
  },
];

export function mergePurchaseSettings(partial?: Partial<PurchaseSettings> | null): PurchaseSettings {
  return { ...DEFAULT_PURCHASE_SETTINGS, ...(partial ?? {}) };
}

const SETTINGS_KEY = "againerp.purchase.settings";

export function readPurchaseSettings(): PurchaseSettings {
  if (typeof window === "undefined") return { ...DEFAULT_PURCHASE_SETTINGS };
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_PURCHASE_SETTINGS };
    return mergePurchaseSettings(JSON.parse(raw) as Partial<PurchaseSettings>);
  } catch {
    return { ...DEFAULT_PURCHASE_SETTINGS };
  }
}

export function writePurchaseSettings(next: PurchaseSettings) {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(mergePurchaseSettings(next)));
}
