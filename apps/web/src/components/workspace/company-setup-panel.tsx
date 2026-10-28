"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Building2,
  CalendarCheck,
  FileText,
  Globe,
  ListOrdered,
  MapPin,
  Pencil,
  Receipt,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import * as Dialog from "@radix-ui/react-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { AgainFormField, AgainFormGroupTitle } from "@/components/again/again-form-sheet";
import { AgainFormNotebook, type AgainNotebookTab } from "@/components/again/again-form-sheet-layout";
import { AgainDrawerButton } from "@/components/again/again-drawer";
import { WorkspaceSequencesPanel } from "@/components/workspace/workspace-sequences-panel";
import { WorkspacePeriodsPanel } from "@/components/workspace/workspace-periods-panel";
import { PartnerStatButton } from "@/components/customers/partner-customer-sections";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { FilterSelect } from "@/components/shared/filter-select";
import { GRID_CHIP_CLASS } from "@/components/shared/grid-chip-badge";
import { listHrmBranchRecords, type ApiHrmBranch } from "@/lib/api/hrm-branches";
import {
  DEFAULT_INVOICE_LAYOUT,
  DEFAULT_PACKING_LAYOUT,
  DEFAULT_PAYMENT_LAYOUT,
  DEFAULT_PURCHASE_LAYOUT,
  fetchWorkspaceCompany,
  inheritInvoiceBrandMedia,
  mergeInvoiceLayout,
  mergePackingLayout,
  mergePaymentLayout,
  mergePurchaseLayout,
  updateWorkspaceCompany,
  type InvoiceLayout,
  type PackingLayout,
  type PaymentLayout,
  type PurchaseLayout,
  type WorkspaceCompany,
} from "@/lib/api/workspace-company";
import {
  createCatalogMediaBatch,
  uploadCatalogMediaFiles,
  useCatalogMedia,
} from "@/lib/api/use-catalog-media";
import { MediaLibraryModal } from "@/components/media/media-library-modal";
import { MediaPickTile } from "@/components/media/media-pick-tile";
import { CurrencyCombobox } from "@/components/localisation/currency-combobox";
import { CurrencyPickDrawer } from "@/components/localisation/currency-pick-drawer";
import {
  addCustomCurrency,
  buildCurrencyOptions,
  findCurrency,
  parseCurrencyInput,
  patchCurrency,
  removeCustomCurrency,
  renameCustomCurrency,
  type CurrencyOption,
} from "@/lib/localisation/currency-options";
import {
  DATE_FORMAT_OPTIONS,
  DECIMAL_PLACE_OPTIONS,
  NUMBER_GROUPING_OPTIONS,
  TIME_FORMAT_OPTIONS,
  companyFormatPreview,
  formatGroupedNumber,
  normalizeCompanyFormat,
} from "@/lib/localisation/company-format";
import { hydrateCompanyFormat } from "@/lib/store/company-format-store";
import { useAdminAuth } from "@/lib/store/admin-auth-store";
import { useSettingsStore } from "@/lib/store/settings-store";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { cn } from "@/lib/utils";
import { getIanaTimezones } from "@/lib/timezones";
import { WAREHOUSE_TYPE_PRESETS } from "@/lib/inventory/warehouse-constants";
import {
  createWarehouse,
  deleteWarehouse,
  listWarehouses,
  updateWarehouse,
} from "@/lib/api/inventory";
import type { Warehouse as WarehouseRow } from "@/lib/mock-data/inventory";
import {
  InvoiceLayoutPreviewDocument,
  InvoiceLayoutPreviewOverlay,
  InvoicePreviewButton,
} from "@/components/workspace/invoice-layout-preview";
import { PurchaseOrderPrintDocument } from "@/components/purchase/purchase-order-print-document";
import { samplePurchasePrintPayload } from "@/lib/purchase/purchase-print";
import { PaymentSlipPrintDocument } from "@/components/finance/payment-slip-print-document";
import { samplePaymentPrintPayload } from "@/lib/finance/payment-print";

type CompanyForm = {
  name: string;
  legal_name: string;
  email: string;
  phone: string;
  mobile: string;
  website: string;
  logo_url: string;
  street: string;
  street2: string;
  city: string;
  state: string;
  zip_code: string;
  country: string;
  tax_id: string;
  vat_number: string;
  registration_no: string;
  currency_code: string;
  language_code: string;
  timezone: string;
  date_format: string;
  time_format: string;
  decimal_places: string;
  number_grouping: string;
  fiscal_year_start_month: string;
  bank_name: string;
  bank_account: string;
  bank_branch: string;
  bank_routing: string;
  invoice_prefix: string;
  invoice_include_year: boolean;
  invoice_padding: string;
  invoice_next_sequence: string;
  invoice_due_days: string;
  invoice_payment_terms: string;
  invoice_tax_rate: string;
  invoice_prices_include_tax: boolean;
  tax_enabled: boolean;
  invoice_footer: string;
  credit_note_prefix: string;
  invoice_layout: InvoiceLayout;
  packing_layout: PackingLayout;
  purchase_layout: PurchaseLayout;
  payment_layout: PaymentLayout;
};

type WarehouseForm = {
  name: string;
  code: string;
  branchId: string;
  type: string;
  address: string;
  city: string;
  country: string;
  mobile: string;
  isActive: boolean;
  isDefault: boolean;
};

const EMPTY_COMPANY: CompanyForm = {
  name: "",
  legal_name: "",
  email: "",
  phone: "",
  mobile: "",
  website: "",
  logo_url: "",
  street: "",
  street2: "",
  city: "",
  state: "",
  zip_code: "",
  country: "Bangladesh",
  tax_id: "",
  vat_number: "",
  registration_no: "",
  currency_code: "BDT",
  language_code: "en",
  timezone: "Asia/Dhaka",
  date_format: "dd/mm/yyyy",
  time_format: "12h",
  decimal_places: "2",
  number_grouping: "indian",
  fiscal_year_start_month: "7",
  bank_name: "",
  bank_account: "",
  bank_branch: "",
  bank_routing: "",
  invoice_prefix: "",
  invoice_include_year: false,
  invoice_padding: "4",
  invoice_next_sequence: "1",
  invoice_due_days: "30",
  invoice_payment_terms: "Net 30",
  invoice_tax_rate: "0",
  invoice_prices_include_tax: true,
  tax_enabled: true,
    invoice_footer: "",
  credit_note_prefix: "CN",
  invoice_layout: DEFAULT_INVOICE_LAYOUT,
  packing_layout: DEFAULT_PACKING_LAYOUT,
  purchase_layout: DEFAULT_PURCHASE_LAYOUT,
  payment_layout: DEFAULT_PAYMENT_LAYOUT,
};

type MediaPickTarget =
  | "company_logo"
  | "invoice_logo"
  | "packing_logo"
  | "purchase_logo"
  | "payment_logo"
  | "customer_signature"
  | "authorised_signature"
  | "packing_authorised_signature"
  | "purchase_authorised_signature"
  | "payment_authorised_signature";

const MEDIA_PICK_TITLE: Record<MediaPickTarget, string> = {
  company_logo: "Company logo",
  invoice_logo: "Invoice logo",
  packing_logo: "Packing slip logo",
  purchase_logo: "Purchase order logo",
  payment_logo: "Payment slip logo",
  customer_signature: "Customer signature",
  authorised_signature: "Authorised signature",
  packing_authorised_signature: "Authorised signature",
  purchase_authorised_signature: "Authorised signature",
  payment_authorised_signature: "Authorised signature",
};

const EMPTY_WAREHOUSE: WarehouseForm = {
  name: "",
  code: "",
  branchId: "",
  type: "Main warehouse",
  address: "",
  city: "",
  country: "Bangladesh",
  mobile: "",
  isActive: true,
  isDefault: false,
};

const TIMEZONE_OPTIONS = getIanaTimezones().map((zone) => ({
  value: zone.value,
  label: zone.label,
}));

type InvoiceShowKey = {
  [K in keyof InvoiceLayout]: InvoiceLayout[K] extends boolean ? K : never;
}[keyof InvoiceLayout];

type PackingShowKey = {
  [K in keyof PackingLayout]: PackingLayout[K] extends boolean ? K : never;
}[keyof PackingLayout];

type PurchaseShowKey = {
  [K in keyof PurchaseLayout]: PurchaseLayout[K] extends boolean ? K : never;
}[keyof PurchaseLayout];

type PaymentShowKey = {
  [K in keyof PaymentLayout]: PaymentLayout[K] extends boolean ? K : never;
}[keyof PaymentLayout];

const INVOICE_SHOW_FLAGS: { key: InvoiceShowKey; label: string }[] = [
  { key: "show_company_name", label: "Company name" },
  { key: "show_legal_name", label: "Legal name" },
  { key: "show_phone", label: "Phone" },
  { key: "show_mobile", label: "Mobile" },
  { key: "show_email", label: "Email" },
  { key: "show_website", label: "Website" },
  { key: "show_bin", label: "BIN / Tax ID" },
  { key: "show_street", label: "Street" },
  { key: "show_landmark", label: "Street 2" },
  { key: "show_city", label: "City" },
  { key: "show_state", label: "State / division" },
  { key: "show_zip", label: "ZIP / post code" },
  { key: "show_country", label: "Country" },
  { key: "show_location", label: "Location" },
  { key: "show_time", label: "Time on date" },
  { key: "show_customer", label: "Customer" },
  { key: "show_sku", label: "SKU" },
  { key: "show_brand", label: "Brand" },
  { key: "show_category", label: "Category" },
  { key: "show_description", label: "Description" },
  { key: "show_warranty", label: "Warranty" },
  { key: "show_tax", label: "Tax" },
  { key: "show_payments", label: "Payments" },
  { key: "show_previous_balance", label: "Previous balance" },
];

const PACKING_SHOW_FLAGS: { key: PackingShowKey; label: string }[] = [
  { key: "show_company_name", label: "Company name" },
  { key: "show_legal_name", label: "Legal name" },
  { key: "show_phone", label: "Phone" },
  { key: "show_mobile", label: "Mobile" },
  { key: "show_email", label: "Email" },
  { key: "show_website", label: "Website" },
  { key: "show_bin", label: "BIN / Tax ID" },
  { key: "show_street", label: "Street" },
  { key: "show_landmark", label: "Street 2" },
  { key: "show_city", label: "City" },
  { key: "show_state", label: "State / division" },
  { key: "show_zip", label: "ZIP / post code" },
  { key: "show_country", label: "Country" },
  { key: "show_location", label: "Location" },
  { key: "show_order", label: "Order" },
  { key: "show_shipping_date", label: "Shipping date" },
  { key: "show_time", label: "Time on date" },
  { key: "show_customer", label: "Delivery address" },
  { key: "show_sku", label: "SKU" },
  { key: "show_brand", label: "Brand" },
  { key: "show_category", label: "Category" },
  { key: "show_description", label: "Description" },
  { key: "show_warranty", label: "Warranty" },
  { key: "show_ordered", label: "Ordered qty" },
  { key: "show_delivered", label: "Delivered qty" },
  { key: "show_serial", label: "Lot / serial" },
];

const PURCHASE_SHOW_FLAGS: { key: PurchaseShowKey; label: string }[] = [
  { key: "show_company_name", label: "Company name" },
  { key: "show_legal_name", label: "Legal name" },
  { key: "show_phone", label: "Phone" },
  { key: "show_mobile", label: "Mobile" },
  { key: "show_email", label: "Email" },
  { key: "show_website", label: "Website" },
  { key: "show_bin", label: "BIN / Tax ID" },
  { key: "show_street", label: "Street" },
  { key: "show_landmark", label: "Street 2" },
  { key: "show_city", label: "City" },
  { key: "show_state", label: "State / division" },
  { key: "show_zip", label: "ZIP / post code" },
  { key: "show_country", label: "Country" },
  { key: "show_location", label: "Location" },
  { key: "show_time", label: "Time on date" },
  { key: "show_vendor", label: "Vendor" },
  { key: "show_buyer", label: "Buyer" },
  { key: "show_reference", label: "Order reference" },
  { key: "show_expected", label: "Expected arrival" },
  { key: "show_warehouse", label: "Warehouse" },
  { key: "show_sku", label: "SKU" },
  { key: "show_discount", label: "Discount" },
  { key: "show_tax", label: "Tax" },
  { key: "show_payment_terms", label: "Payment terms" },
];

const PAYMENT_SHOW_FLAGS: { key: PaymentShowKey; label: string }[] = [
  { key: "show_company_name", label: "Company name" },
  { key: "show_legal_name", label: "Legal name" },
  { key: "show_phone", label: "Phone" },
  { key: "show_mobile", label: "Mobile" },
  { key: "show_email", label: "Email" },
  { key: "show_website", label: "Website" },
  { key: "show_bin", label: "BIN / Tax ID" },
  { key: "show_street", label: "Street" },
  { key: "show_landmark", label: "Street 2" },
  { key: "show_city", label: "City" },
  { key: "show_state", label: "State / division" },
  { key: "show_zip", label: "ZIP / post code" },
  { key: "show_country", label: "Country" },
  { key: "show_location", label: "Location" },
  { key: "show_time", label: "Time on date" },
  { key: "show_partner", label: "Received from" },
  { key: "show_method", label: "Payment method" },
  { key: "show_amount", label: "Payment amount" },
  { key: "show_memo", label: "Memo" },
  { key: "show_invoices", label: "Allocated invoices" },
];

const FY_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function previewInvoiceNumber(form: CompanyForm): string {
  const prefix = form.invoice_prefix.trim();
  const pad = Math.min(8, Math.max(1, Number(form.invoice_padding) || 4));
  const seq = String(Math.max(1, Number(form.invoice_next_sequence) || 1)).padStart(pad, "0");
  if (form.invoice_include_year) {
    const stamped = `${new Date().getFullYear()}/${seq}`;
    return prefix ? `${prefix}${stamped}` : stamped;
  }
  return `${prefix}${seq}`;
}

function previewPackingNumber(form: CompanyForm): string {
  const packing = form.packing_layout;
  const prefix = packing.prefix.trim();
  const pad = Math.min(8, Math.max(1, Number(packing.padding) || 4));
  const seq = String(Math.max(1, Number(packing.next_sequence) || 1)).padStart(pad, "0");
  if (packing.include_year) {
    const stamped = `${new Date().getFullYear()}/${seq}`;
    return prefix ? `${prefix}${stamped}` : stamped;
  }
  return `${prefix}${seq}`;
}

function previewPurchaseNumber(form: CompanyForm): string {
  const purchase = form.purchase_layout;
  const prefix = purchase.prefix.trim();
  const pad = Math.min(8, Math.max(1, Number(purchase.padding) || 4));
  const seq = String(Math.max(1, Number(purchase.next_sequence) || 1)).padStart(pad, "0");
  if (purchase.include_year) {
    const stamped = `${new Date().getFullYear()}/${seq}`;
    return prefix ? `${prefix}${stamped}` : stamped;
  }
  return `${prefix}${seq}`;
}

function previewPaymentNumber(form: CompanyForm): string {
  const payment = form.payment_layout;
  const prefix = payment.prefix.trim();
  const pad = Math.min(8, Math.max(1, Number(payment.padding) || 4));
  const seq = String(Math.max(1, Number(payment.next_sequence) || 1)).padStart(pad, "0");
  if (payment.include_year) {
    const stamped = `${new Date().getFullYear()}/${seq}`;
    return prefix ? `${prefix}${stamped}` : stamped;
  }
  return `${prefix}${seq}`;
}

function invoicePreviewCompany(form: CompanyForm) {
  return {
    name: form.name,
    legal_name: form.legal_name,
    logo_url: form.logo_url,
    street: form.street,
    street2: form.street2,
    city: form.city,
    state: form.state,
    zip_code: form.zip_code,
    country: form.country,
    phone: form.phone,
    mobile: form.mobile,
    email: form.email,
    website: form.website,
    tax_id: form.tax_id,
    invoice_footer: form.invoice_footer,
    invoice_prices_include_tax: form.invoice_prices_include_tax,
    tax_enabled: form.tax_enabled,
    invoice_tax_rate: Number(form.invoice_tax_rate) || 0,
    currency_code: form.currency_code,
  };
}

type SetupTabId =
  | "general"
  | "tax"
  | "localization"
  | "warehouses"
  | "invoice"
  | "sequences"
  | "periods";

const SETUP_TABS: { id: SetupTabId; label: string; hint: string; icon: LucideIcon }[] = [
  {
    id: "general",
    label: "General Information",
    hint: "Company identity, contact, registered office, and bank details used on invoices and orders.",
    icon: Building2,
  },
  {
    id: "tax",
    label: "Tax & Registration",
    hint: "Enable tax on invoices and bills, plus BIN / VAT numbers printed on documents.",
    icon: FileText,
  },
  {
    id: "localization",
    label: "Localization",
    hint: "Currency, timezone, date/time format, and how amounts are counted.",
    icon: Globe,
  },
  {
    id: "warehouses",
    label: "Business Locations",
    hint: "Where the business keeps and sells stock — head office store, shops, warehouses, online fulfilment.",
    icon: MapPin,
  },
  {
    id: "invoice",
    label: "Invoices",
    hint: "Invoice, packing slip (chalan), purchase order, and payment slip print layout.",
    icon: Receipt,
  },
  {
    id: "sequences",
    label: "Document Numbering",
    hint: "Prefix, digits and next number for every document the ERP numbers — orders, payments, journals, stock moves.",
    icon: ListOrdered,
  },
  {
    id: "periods",
    label: "Accounting Periods",
    hint: "Close a month to lock its dates against new postings.",
    icon: CalendarCheck,
  },
];

function textOf(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function companyToForm(row: WorkspaceCompany): CompanyForm {
  const format = normalizeCompanyFormat(row);
  return {
    name: textOf(row.name),
    legal_name: textOf(row.legal_name),
    email: textOf(row.email),
    phone: textOf(row.phone),
    mobile: textOf(row.mobile),
    website: textOf(row.website),
    logo_url: textOf(row.logo_url),
    street: textOf(row.street),
    street2: textOf(row.street2),
    city: textOf(row.city),
    state: textOf(row.state),
    zip_code: textOf(row.zip_code),
    country: textOf(row.country) || "Bangladesh",
    tax_id: textOf(row.tax_id),
    vat_number: textOf(row.vat_number),
    registration_no: textOf(row.registration_no),
    currency_code: textOf(row.currency_code) || "BDT",
    language_code: textOf(row.language_code) || "en",
    timezone: textOf(row.timezone) || "Asia/Dhaka",
    date_format: format.dateFormat,
    time_format: format.timeFormat,
    decimal_places: String(format.decimalPlaces),
    number_grouping: format.numberGrouping,
    fiscal_year_start_month: String(row.fiscal_year_start_month || 7),
    bank_name: textOf(row.bank_name),
    bank_account: textOf(row.bank_account),
    bank_branch: textOf(row.bank_branch),
    bank_routing: textOf(row.bank_routing),
    invoice_prefix: textOf(row.invoice_prefix),
    invoice_include_year: Boolean(row.invoice_include_year),
    invoice_padding: String(row.invoice_padding || 4),
    invoice_next_sequence: String(row.invoice_next_sequence || 1),
    invoice_due_days: String(row.invoice_due_days ?? 30),
    invoice_payment_terms: textOf(row.invoice_payment_terms) || "Net 30",
    invoice_tax_rate: String(row.invoice_tax_rate ?? 0),
    invoice_prices_include_tax: row.invoice_prices_include_tax !== false,
    tax_enabled: row.tax_enabled !== false,
    invoice_footer: textOf(row.invoice_footer),
    credit_note_prefix: textOf(row.credit_note_prefix) || "CN",
    invoice_layout: mergeInvoiceLayout(row.invoice_layout),
    packing_layout: mergePackingLayout(row.packing_layout),
    purchase_layout: mergePurchaseLayout(row.purchase_layout),
    payment_layout: mergePaymentLayout(row.payment_layout),
  };
}

function slugifyWarehouseCode(name: string): string {
  const slug = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "WH";
}

function warehouseToForm(row: WarehouseRow): WarehouseForm {
  return {
    name: row.name,
    code: row.code,
    branchId: row.branchId ?? "",
    type: row.type || "Main warehouse",
    address: row.address ?? "",
    city: row.city ?? "",
    country: row.country || "Bangladesh",
    mobile: row.mobile ?? "",
    isActive: row.active,
    isDefault: row.isDefault ?? false,
  };
}

/** An Odoo form row: label on the left, an underline control on the right (docs/common/formcommon.md). */
function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <AgainFormField label={label} className={cn("grid-cols-[9rem_minmax(0,1fr)]", className)}>
      {children}
    </AgainFormField>
  );
}

/** The form body of one tab: `.again-odoo-form` turns every control into an underline, and the sheet's own width picks 1 or 2 columns. */
function TabFields({ children }: { children: ReactNode }) {
  return (
    <div className="again-odoo-form @container">
      <div className="grid gap-x-10 gap-y-0 @2xl:grid-cols-2">{children}</div>
    </div>
  );
}

/** A titled group of rows. `half` sits beside another half group; a whole group spans both columns and lays its rows in two. */
function SetupBlock({
  title,
  hint,
  half,
  children,
}: {
  title: string;
  hint?: string;
  half?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn("mb-4 min-w-0", !half && "@2xl:col-span-2")}>
      <AgainFormGroupTitle>{title}</AgainFormGroupTitle>
      {hint ? <p className="mb-1 text-[11px] text-muted-foreground">{hint}</p> : null}
      <div className={cn("grid gap-x-10 gap-y-0", !half && "@2xl:grid-cols-2")}>{children}</div>
    </div>
  );
}

export function CompanySetupPanel() {
  const router = useRouter();
  const canWrite = useAdminCanWrite();
  const [company, setCompany] = useState<WorkspaceCompany | null>(null);
  const [form, setForm] = useState<CompanyForm>(EMPTY_COMPANY);
  // A location hangs off a branch in the data model; the branch is not a screen of its own, so a new location joins the active one
  const [branches, setBranches] = useState<ApiHrmBranch[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [warehouseSheetOpen, setWarehouseSheetOpen] = useState(false);
  const [editWarehouse, setEditWarehouse] = useState<WarehouseRow | null>(null);
  const [warehouseForm, setWarehouseForm] = useState<WarehouseForm>(EMPTY_WAREHOUSE);
  const [savingWarehouse, setSavingWarehouse] = useState(false);
  const [deleteWarehouseTarget, setDeleteWarehouseTarget] = useState<WarehouseRow | null>(null);
  const [logoLibraryOpen, setLogoLibraryOpen] = useState(false);
  const [mediaPickTarget, setMediaPickTarget] = useState<MediaPickTarget>("company_logo");
  const [listCurrencyOpen, setListCurrencyOpen] = useState(false);
  const [currencyOptions, setCurrencyOptions] = useState<CurrencyOption[]>([]);
  const searchParams = useSearchParams();
  // ?tab=branches was merged into Business Locations
  const requestedTab = searchParams.get("tab") === "branches" ? "warehouses" : searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<SetupTabId>(
    SETUP_TABS.some((t) => t.id === requestedTab) ? (requestedTab as SetupTabId) : "general",
  );
  const [invoicePreviewOpen, setInvoicePreviewOpen] = useState(false);
  const [docKind, setDocKind] = useState<"invoice" | "packing" | "purchase" | "payment">("invoice");
  const { items: mediaItems, refetch: refetchMedia } = useCatalogMedia();
  const activeTabMeta = SETUP_TABS.find((tab) => tab.id === activeTab) ?? SETUP_TABS[0];
  const savedSignature = company ? JSON.stringify(companyToForm(company)) : "";
  const dirty = Boolean(company) && JSON.stringify(form) !== savedSignature;
  const discardChanges = () => {
    if (company) setForm(companyToForm(company));
  };
  const notebookTabs: AgainNotebookTab<SetupTabId>[] = SETUP_TABS.map((tab) => ({
    id: tab.id,
    label: tab.label,
    badge: tab.id === "warehouses" ? warehouses.length : undefined,
    badgeTone: "neutral" as const,
  }));

  const setField = <K extends keyof CompanyForm>(key: K, value: CompanyForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const setLayout = <K extends keyof InvoiceLayout>(key: K, value: InvoiceLayout[K]) => {
    setForm((current) => ({
      ...current,
      invoice_layout: { ...current.invoice_layout, [key]: value },
    }));
  };

  const setPacking = <K extends keyof PackingLayout>(key: K, value: PackingLayout[K]) => {
    setForm((current) => ({
      ...current,
      packing_layout: { ...current.packing_layout, [key]: value },
    }));
  };

  const setPurchase = <K extends keyof PurchaseLayout>(key: K, value: PurchaseLayout[K]) => {
    setForm((current) => ({
      ...current,
      purchase_layout: { ...current.purchase_layout, [key]: value },
    }));
  };

  const setPayment = <K extends keyof PaymentLayout>(key: K, value: PaymentLayout[K]) => {
    setForm((current) => ({
      ...current,
      payment_layout: { ...current.payment_layout, [key]: value },
    }));
  };

  const openMediaPicker = (target: MediaPickTarget) => {
    setMediaPickTarget(target);
    void refetchMedia();
    setLogoLibraryOpen(true);
  };

  const applyPickedMedia = (url: string) => {
    if (mediaPickTarget === "company_logo") {
      setField("logo_url", url);
      return;
    }
    if (mediaPickTarget === "invoice_logo") {
      setForm((current) => ({
        ...current,
        invoice_layout: { ...current.invoice_layout, logo_url: url, show_logo: true },
      }));
      return;
    }
    if (mediaPickTarget === "packing_logo") {
      setForm((current) => ({
        ...current,
        packing_layout: { ...current.packing_layout, logo_url: url, show_logo: true },
      }));
      return;
    }
    if (mediaPickTarget === "purchase_logo") {
      setForm((current) => ({
        ...current,
        purchase_layout: { ...current.purchase_layout, logo_url: url, show_logo: true },
      }));
      return;
    }
    if (mediaPickTarget === "payment_logo") {
      setForm((current) => ({
        ...current,
        payment_layout: { ...current.payment_layout, logo_url: url, show_logo: true },
      }));
      return;
    }
    if (mediaPickTarget === "customer_signature") {
      setForm((current) => ({
        ...current,
        invoice_layout: {
          ...current.invoice_layout,
          customer_signature_url: url,
          show_customer_signature: true,
        },
      }));
      return;
    }
    if (mediaPickTarget === "packing_authorised_signature") {
      setForm((current) => ({
        ...current,
        packing_layout: {
          ...current.packing_layout,
          authorised_signature_url: url,
          show_authorised_signature: true,
        },
      }));
      return;
    }
    if (mediaPickTarget === "purchase_authorised_signature") {
      setForm((current) => ({
        ...current,
        purchase_layout: {
          ...current.purchase_layout,
          authorised_signature_url: url,
          show_authorised_signature: true,
        },
      }));
      return;
    }
    if (mediaPickTarget === "payment_authorised_signature") {
      setForm((current) => ({
        ...current,
        payment_layout: {
          ...current.payment_layout,
          authorised_signature_url: url,
          show_authorised_signature: true,
        },
      }));
      return;
    }
    setForm((current) => ({
      ...current,
      invoice_layout: {
        ...current.invoice_layout,
        authorised_signature_url: url,
        show_authorised_signature: true,
      },
    }));
  };

  const setWarehouseField = <K extends keyof WarehouseForm>(key: K, value: WarehouseForm[K]) => {
    setWarehouseForm((current) => ({ ...current, [key]: value }));
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const companyRow = await fetchWorkspaceCompany();
      setCompany(companyRow);
      setForm(companyToForm(companyRow));
      setCurrencyOptions(buildCurrencyOptions(companyRow.currency_code));
      setLoading(false);
      const [branchRows, warehouseRows] = await Promise.all([
        listHrmBranchRecords().catch(() => [] as ApiHrmBranch[]),
        listWarehouses().catch(() => [] as WarehouseRow[]),
      ]);
      setBranches(branchRows);
      setWarehouses(warehouseRows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load company setup");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (loading) return;
    hydrateCompanyFormat({
      date_format: form.date_format,
      time_format: form.time_format,
      decimal_places: Number(form.decimal_places),
      number_grouping: form.number_grouping,
      currency_code: form.currency_code,
      timezone: form.timezone,
      language_code: form.language_code,
      fiscal_year_start_month: Number(form.fiscal_year_start_month) || 7,
    });
  }, [
    loading,
    form.date_format,
    form.time_format,
    form.decimal_places,
    form.number_grouping,
    form.currency_code,
    form.timezone,
    form.language_code,
    form.fiscal_year_start_month,
  ]);

  const saveCompany = async () => {
    if (form.name.trim().length < 2) {
      toast.error("Company name is required");
      return;
    }
    setSaving(true);
    try {
      const saved = await updateWorkspaceCompany({
        name: form.name.trim(),
        legal_name: form.legal_name,
        email: form.email,
        phone: form.phone,
        mobile: form.mobile,
        website: form.website,
        logo_url: form.logo_url,
        street: form.street,
        street2: form.street2,
        city: form.city,
        state: form.state,
        zip_code: form.zip_code,
        country: form.country,
        tax_id: form.tax_id,
        vat_number: form.vat_number,
        registration_no: form.registration_no,
        currency_code: form.currency_code,
        language_code: form.language_code,
        timezone: form.timezone,
        date_format: form.date_format,
        time_format: form.time_format,
        decimal_places: Number(form.decimal_places) || 0,
        number_grouping: form.number_grouping,
        fiscal_year_start_month: Number(form.fiscal_year_start_month) || 7,
        bank_name: form.bank_name,
        bank_account: form.bank_account,
        bank_branch: form.bank_branch,
        bank_routing: form.bank_routing,
        invoice_prefix: form.invoice_prefix,
        invoice_include_year: form.invoice_include_year,
        invoice_padding: Number(form.invoice_padding) || 4,
        invoice_next_sequence: Number(form.invoice_next_sequence) || 1,
        invoice_due_days: Number(form.invoice_due_days) || 0,
        invoice_payment_terms: form.invoice_payment_terms,
        invoice_tax_rate: Number(form.invoice_tax_rate) || 0,
        invoice_prices_include_tax: form.invoice_prices_include_tax,
        tax_enabled: form.tax_enabled,
        invoice_footer: form.invoice_footer,
        credit_note_prefix: form.credit_note_prefix,
        invoice_layout: form.invoice_layout,
        packing_layout: form.packing_layout,
        purchase_layout: form.purchase_layout,
        payment_layout: form.payment_layout,
      });
      setCompany(saved);
      setForm(companyToForm(saved));
      useSettingsStore.getState().setValue("sales.option_taxes", Boolean(saved.tax_enabled), {
        label: "Taxes",
        reason: "Company Tax & registration",
      });
      useAdminAuth.setState((state) => ({
        user: state.user ? { ...state.user, company_name: saved.name } : state.user,
      }));
      toast.success("Company saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save company");
    } finally {
      setSaving(false);
    }
  };

  const openCreateWarehouse = () => {
    // join the branch of the default location (the head office), else the first active one
    const homeId = warehouses.find((row) => row.isDefault)?.branchId;
    const first =
      branches.find((row) => row.id === homeId) ?? branches.find((row) => row.status === "active") ?? branches[0];
    if (!first) {
      toast.error("The company has no head office yet — save the company first");
      return;
    }
    setEditWarehouse(null);
    setWarehouseForm({
      ...EMPTY_WAREHOUSE,
      branchId: first.id,
      address: form.street,
      city: form.city,
      country: form.country || "Bangladesh",
      mobile: form.phone,
      isDefault: warehouses.length === 0,
    });
    setWarehouseSheetOpen(true);
  };

  const openEditWarehouse = (row: WarehouseRow) => {
    setEditWarehouse(row);
    setWarehouseForm(warehouseToForm(row));
    setWarehouseSheetOpen(true);
  };

  const saveWarehouse = async () => {
    if (!warehouseForm.name.trim()) {
      toast.error("Location name is required");
      return;
    }
    if (!warehouseForm.branchId) {
      toast.error("The company has no head office yet — save the company first");
      return;
    }
    setSavingWarehouse(true);
    try {
      const payload = {
        name: warehouseForm.name.trim(),
        code: warehouseForm.code.trim() || slugifyWarehouseCode(warehouseForm.name),
        type: warehouseForm.type,
        branchId: warehouseForm.branchId,
        address: warehouseForm.address,
        city: warehouseForm.city,
        country: warehouseForm.country,
        mobile: warehouseForm.mobile,
        isActive: warehouseForm.isActive,
        isDefault: warehouseForm.isDefault,
      };
      if (editWarehouse) {
        await updateWarehouse(editWarehouse.id, payload);
        toast.success("Location updated");
      } else {
        const base = payload.code;
        let saved = false;
        let lastErr: unknown;
        for (let n = 1; n <= 20; n += 1) {
          try {
            await createWarehouse({
              ...payload,
              code: n === 1 ? base : `${base}-${n}`.slice(0, 50),
            });
            saved = true;
            break;
          } catch (err) {
            lastErr = err;
            const msg = err instanceof Error ? err.message : "";
            if (!/already exists/i.test(msg)) throw err;
          }
        }
        if (!saved) {
          throw lastErr instanceof Error ? lastErr : new Error("Could not save location");
        }
        toast.success("Location added");
      }
      setWarehouseSheetOpen(false);
      setWarehouses(await listWarehouses());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save location");
    } finally {
      setSavingWarehouse(false);
    }
  };

  const confirmDeleteWarehouse = async () => {
    if (!deleteWarehouseTarget) return;
    try {
      await deleteWarehouse(deleteWarehouseTarget.id);
      toast.success(`${deleteWarehouseTarget.name} deleted`);
      setDeleteWarehouseTarget(null);
      setWarehouses(await listWarehouses());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  if (loading) {
    return <ContentDataSkeleton label="Loading company setup…" />;
  }

  return (
    <>
    <div className="-m-3 flex min-h-0 w-[calc(100%+1.5rem)] max-w-none flex-1 flex-col overflow-hidden bg-background lg:-m-4 lg:w-[calc(100%+2rem)]">
      {/* control bar — Odoo: record actions on top, the form below */}
      <div className="flex min-w-0 shrink-0 items-center gap-1.5 border-b border-border bg-background py-1 pl-2 pr-2">
        <ListGridHeaderStart title="Company">
          {canWrite ? (
            <>
              <AgainDrawerButton variant="primary" disabled={saving || !dirty} aria-busy={saving} onClick={() => void saveCompany()}>
                {saving ? "Saving…" : "Save"}
              </AgainDrawerButton>
              <AgainDrawerButton disabled={saving || !dirty} onClick={discardChanges}>
                Discard
              </AgainDrawerButton>
            </>
          ) : null}
          {dirty ? <span className="ml-1 text-[11px] text-amber-700 dark:text-amber-400">Unsaved changes</span> : null}
        </ListGridHeaderStart>
        <div className="ml-auto flex items-center gap-2">
          {company ? (
            <span className="hidden text-[11px] text-muted-foreground sm:block">
              {company.status} · {company.slug}
            </span>
          ) : null}
          <AgainDrawerButton onClick={() => router.push("/dashboard")}>Continue</AgainDrawerButton>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-[#eceff3] p-3 dark:bg-muted/20 sm:p-4">
        <div className="mx-auto w-full max-w-5xl border border-border bg-card shadow-sm">
          {/* title band: the company name is the record's title, the logo sits top right, stat boxes jump to a tab */}
          <div className="again-odoo-form @container flex flex-wrap items-start gap-4 px-4 py-4 sm:px-6">
            <div className="min-w-0 flex-1 basis-72">
              <input
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                disabled={!canWrite}
                placeholder="Company name"
                aria-label="Company name"
                className="w-full min-w-0 bg-transparent py-0.5 text-[20px] font-bold leading-tight tracking-tight text-foreground outline-none"
              />
              <input
                value={form.legal_name}
                onChange={(e) => setField("legal_name", e.target.value)}
                disabled={!canWrite}
                placeholder="Legal name, as registered"
                aria-label="Legal name"
                className="mt-0.5 w-full min-w-0 bg-transparent py-0.5 text-[13px] text-muted-foreground outline-none"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                <PartnerStatButton value={warehouses.length} label="Business locations" tone="purple" onClick={() => setActiveTab("warehouses")} />
                <PartnerStatButton value={form.currency_code || "—"} label="Currency" tone="brand" onClick={() => setActiveTab("localization")} />
                <PartnerStatButton
                  value={form.tax_enabled ? `${Number(form.invoice_tax_rate) || 0}%` : "Off"}
                  label="Tax"
                  onClick={() => setActiveTab("tax")}
                />
              </div>
            </div>
            <MediaPickTile
              url={form.logo_url}
              disabled={!canWrite}
              alt="Company logo"
              onChange={(next) => setField("logo_url", next)}
              onPick={() => openMediaPicker("company_logo")}
            />
          </div>

          <AgainFormNotebook tabs={notebookTabs} active={activeTab} onChange={setActiveTab}>
            <div>
              {activeTab === "sequences" || activeTab === "periods" ? null : (
                <p className="mb-3 text-[11px] text-muted-foreground">{activeTabMeta.hint}</p>
              )}
              {activeTab === "warehouses" && canWrite ? (
                <div className="mb-2 flex justify-end">
                  <AgainDrawerButton variant="primary" onClick={openCreateWarehouse}>
                    New location
                  </AgainDrawerButton>
                </div>
              ) : null}
              {activeTab === "invoice" ? (
                <div className="mb-2 flex justify-end">
                  <InvoicePreviewButton onClick={() => setInvoicePreviewOpen(true)} />
                </div>
              ) : null}
              {activeTab === "general" ? (
                <TabFields>
                  <SetupBlock title="Address" hint="Registered office. Copied onto documents." half>
                    <Field label="Street">
                      <Input
                        value={form.street}
                        onChange={(e) => setField("street", e.target.value)}
                        disabled={!canWrite}
                        placeholder="House / road / area"
                      />
                    </Field>
                    <Field label="Street 2">
                      <Input value={form.street2} onChange={(e) => setField("street2", e.target.value)} disabled={!canWrite} />
                    </Field>
                    <Field label="City">
                      <Input value={form.city} onChange={(e) => setField("city", e.target.value)} disabled={!canWrite} />
                    </Field>
                    <Field label="State / division">
                      <Input value={form.state} onChange={(e) => setField("state", e.target.value)} disabled={!canWrite} />
                    </Field>
                    <Field label="ZIP / post code">
                      <Input value={form.zip_code} onChange={(e) => setField("zip_code", e.target.value)} disabled={!canWrite} />
                    </Field>
                    <Field label="Country">
                      <Input value={form.country} onChange={(e) => setField("country", e.target.value)} disabled={!canWrite} />
                    </Field>
                  </SetupBlock>
                  <SetupBlock title="Contact" hint="Printed on invoices and orders." half>
                    <Field label="Email">
                      <Input
                        type="email"
                        value={form.email}
                        onChange={(e) => setField("email", e.target.value)}
                        disabled={!canWrite}
                        placeholder="info@company.com"
                      />
                    </Field>
                    <Field label="Phone">
                      <Input
                        value={form.phone}
                        onChange={(e) => setField("phone", e.target.value)}
                        disabled={!canWrite}
                        placeholder="+880 1XXX-XXXXXX"
                      />
                    </Field>
                    <Field label="Mobile">
                      <Input value={form.mobile} onChange={(e) => setField("mobile", e.target.value)} disabled={!canWrite} />
                    </Field>
                    <Field label="Website">
                      <Input
                        value={form.website}
                        onChange={(e) => setField("website", e.target.value)}
                        disabled={!canWrite}
                        placeholder="https://www.company.com"
                      />
                    </Field>
                  </SetupBlock>
                  <SetupBlock title="Bank" hint="Shown on invoices and statements so customers can pay you.">
                    <Field label="Bank name">
                      <Input value={form.bank_name} onChange={(e) => setField("bank_name", e.target.value)} disabled={!canWrite} />
                    </Field>
                    <Field label="Account number">
                      <Input value={form.bank_account} onChange={(e) => setField("bank_account", e.target.value)} disabled={!canWrite} />
                    </Field>
                    <Field label="Bank branch">
                      <Input value={form.bank_branch} onChange={(e) => setField("bank_branch", e.target.value)} disabled={!canWrite} />
                    </Field>
                    <Field label="Routing no.">
                      <Input value={form.bank_routing} onChange={(e) => setField("bank_routing", e.target.value)} disabled={!canWrite} />
                    </Field>
                  </SetupBlock>
                </TabFields>
              ) : null}

              {activeTab === "tax" ? (
                <TabFields>
                  <SetupBlock title="Tax" half>
                    <Field label="Tax on documents">
                      <label className="flex min-h-[28px] items-center gap-2 text-[13px]">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 accent-[#00a09d]"
                          checked={form.tax_enabled}
                          disabled={!canWrite}
                          onChange={(e) => setField("tax_enabled", e.target.checked)}
                        />
                        Enable tax on invoices and bills
                      </label>
                    </Field>
                    <Field label="Default tax rate (%)">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        value={form.invoice_tax_rate}
                        onChange={(e) => setField("invoice_tax_rate", e.target.value)}
                        disabled={!canWrite || !form.tax_enabled}
                      />
                    </Field>
                    <Field label="Prices">
                      <label className="flex min-h-[28px] items-center gap-2 text-[13px]">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 accent-[#00a09d]"
                          checked={form.invoice_prices_include_tax}
                          disabled={!canWrite || !form.tax_enabled}
                          onChange={(e) => setField("invoice_prices_include_tax", e.target.checked)}
                        />
                        Selling prices include tax
                      </label>
                    </Field>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {form.tax_enabled
                        ? "Tax amount and rate print on invoices and vendor bills. Turn off any document’s Tax checkbox in Invoices to hide it on that form only."
                        : "Tax columns and totals stay hidden on invoices and bills until this is enabled."}
                    </p>
                  </SetupBlock>
                  <SetupBlock title="Registration" hint="Printed on documents." half>
                    <Field label="BIN / Tax ID">
                      <Input
                        value={form.tax_id}
                        onChange={(e) => setField("tax_id", e.target.value)}
                        disabled={!canWrite}
                        placeholder="001234567-0000"
                      />
                    </Field>
                    <Field label="VAT registration no.">
                      <Input value={form.vat_number} onChange={(e) => setField("vat_number", e.target.value)} disabled={!canWrite} />
                    </Field>
                    <Field label="Company registration no.">
                      <Input
                        value={form.registration_no}
                        onChange={(e) => setField("registration_no", e.target.value)}
                        disabled={!canWrite}
                        placeholder="RJSC / trade license"
                      />
                    </Field>
                  </SetupBlock>
                </TabFields>
              ) : null}

              {activeTab === "localization" ? (
                <TabFields>
                  <SetupBlock title="Currency & time" hint="What amounts and dates are counted in." half>
                    <Field label="Currency">
                      <CurrencyCombobox
                        options={currencyOptions}
                        value={form.currency_code}
                        onChange={(next) => setField("currency_code", next)}
                        onList={canWrite ? () => setListCurrencyOpen(true) : undefined}
                        disabled={!canWrite}
                        className="w-full"
                      />
                    </Field>
                    <Field label="Timezone">
                      <FilterSelect
                        value={form.timezone}
                        onChange={(next) => setField("timezone", next)}
                        options={
                          form.timezone && !TIMEZONE_OPTIONS.some((item) => item.value === form.timezone)
                            ? [{ value: form.timezone, label: form.timezone }, ...TIMEZONE_OPTIONS]
                            : TIMEZONE_OPTIONS
                        }
                        disabled={!canWrite}
                        placeholder="Select timezone"
                        searchPlaceholder="Search city or GMT…"
                        width="w-full"
                        className="h-8 w-full"
                        ariaLabel="Timezone"
                      />
                    </Field>
                    <Field label="Fiscal year starts">
                      <Select
                        value={form.fiscal_year_start_month}
                        onChange={(e) => setField("fiscal_year_start_month", e.target.value)}
                        disabled={!canWrite}
                        className="w-full"
                      >
                        {FY_MONTHS.map((label, index) => (
                          <option key={label} value={String(index + 1)}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </SetupBlock>
                  <SetupBlock title="Formats" hint="How dates, times and numbers are written." half>
                    <Field label="Date format">
                      <Select
                        value={form.date_format}
                        onChange={(e) => setField("date_format", e.target.value)}
                        disabled={!canWrite}
                        className="w-full"
                      >
                        {DATE_FORMAT_OPTIONS.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Time format">
                      <Select
                        value={form.time_format}
                        onChange={(e) => setField("time_format", e.target.value)}
                        disabled={!canWrite}
                        className="w-full"
                      >
                        {TIME_FORMAT_OPTIONS.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Decimal places">
                      <Select
                        value={form.decimal_places}
                        onChange={(e) => setField("decimal_places", e.target.value)}
                        disabled={!canWrite}
                        className="w-full"
                      >
                        {DECIMAL_PLACE_OPTIONS.map((n) => (
                          <option key={n} value={String(n)}>
                            {n === 0 ? "0 — 1000000" : `${n} — ${"0".repeat(n)} after the point`}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Number grouping">
                      <Select
                        value={form.number_grouping}
                        onChange={(e) => setField("number_grouping", e.target.value)}
                        disabled={!canWrite}
                        className="w-full"
                      >
                        {NUMBER_GROUPING_OPTIONS.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </SetupBlock>
                  <p className="border border-border bg-muted/40 px-3 py-2 text-[13px] text-foreground @2xl:col-span-2">
                    Preview:{" "}
                    {(() => {
                      const settings = normalizeCompanyFormat({
                        date_format: form.date_format,
                        time_format: form.time_format,
                        decimal_places: form.decimal_places,
                        number_grouping: form.number_grouping,
                      });
                      const preview = companyFormatPreview(settings);
                      const symbol = findCurrency(form.currency_code)?.symbol || "৳";
                      const amount = formatGroupedNumber(1_000_000, settings);
                      return `${preview.date}  ${preview.time}  ·  ${symbol}${amount}`;
                    })()}
                  </p>
                </TabFields>
              ) : null}

              {activeTab === "sequences" ? <WorkspaceSequencesPanel embedded /> : null}
              {activeTab === "periods" ? <WorkspacePeriodsPanel embedded /> : null}

              {activeTab === "warehouses" ? (
                <div className="overflow-x-auto border border-border">
                  <table className="w-full min-w-[720px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-left text-[11px] text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Location</th>
                        <th className="px-3 py-2 font-medium">Code</th>
                        <th className="px-3 py-2 font-medium">City</th>
                        <th className="px-3 py-2 font-medium">Type</th>
                        <th className="px-3 py-2 font-medium">Default</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        {canWrite ? <th className="px-3 py-2 font-medium">Actions</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {warehouses.length === 0 ? (
                        <tr>
                          <td className="px-3 py-6 text-muted-foreground" colSpan={canWrite ? 7 : 6}>
                            No business locations yet. Click New to add the first one.
                          </td>
                        </tr>
                      ) : (
                        warehouses.map((row) => (
                          <tr key={row.id} className="border-b border-border last:border-b-0">
                            <td className="px-3 py-2">
                              <p className="font-medium">{row.name}</p>
                              {row.address ? (
                                <p className="truncate text-[11px] text-muted-foreground">{row.address}</p>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{row.code}</td>
                            <td className="px-3 py-2 text-muted-foreground">{row.city || "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{row.type || "—"}</td>
                            <td className="px-3 py-2">
                              {row.isDefault ? (
                                <Badge variant="outline" className={GRID_CHIP_CLASS}>
                                  Default
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <Badge
                                variant="outline"
                                className={cn(
                                  GRID_CHIP_CLASS,
                                  row.active
                                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                    : "text-muted-foreground",
                                )}
                              >
                                {row.active ? "Active" : "Inactive"}
                              </Badge>
                            </td>
                            {canWrite ? (
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 rounded-none"
                                    aria-label={`Edit ${row.name}`}
                                    onClick={() => openEditWarehouse(row)}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 rounded-none text-destructive"
                                    aria-label={`Delete ${row.name}`}
                                    onClick={() => setDeleteWarehouseTarget(row)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </td>
                            ) : null}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {activeTab === "invoice" ? (
                <TabFields>
                  <div className="flex flex-wrap @2xl:col-span-2">
                    <button
                      type="button"
                      className={cn(
                        "h-8 border border-border px-3 text-sm",
                        docKind === "invoice"
                          ? "bg-foreground text-background"
                          : "bg-background text-foreground hover:bg-muted",
                      )}
                      onClick={() => setDocKind("invoice")}
                    >
                      Invoice
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "h-8 border border-l-0 border-border px-3 text-sm",
                        docKind === "packing"
                          ? "bg-foreground text-background"
                          : "bg-background text-foreground hover:bg-muted",
                      )}
                      onClick={() => setDocKind("packing")}
                    >
                      Packing slip
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "h-8 border border-l-0 border-border px-3 text-sm",
                        docKind === "purchase"
                          ? "bg-foreground text-background"
                          : "bg-background text-foreground hover:bg-muted",
                      )}
                      onClick={() => setDocKind("purchase")}
                    >
                      Purchase order
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "h-8 border border-l-0 border-border px-3 text-sm",
                        docKind === "payment"
                          ? "bg-foreground text-background"
                          : "bg-background text-foreground hover:bg-muted",
                      )}
                      onClick={() => setDocKind("payment")}
                    >
                      Payment slip
                    </button>
                  </div>
                  {docKind === "invoice" ? (
                    <>
                  <SetupBlock
                    title="Invoice numbers"
                    hint="Leave prefix empty for 0001, or add year for 2026/0001."
                  >
                    <Field label="Number format">
                      <Select
                        value={form.invoice_include_year ? "year" : "blank"}
                        onChange={(e) => setField("invoice_include_year", e.target.value === "year")}
                        disabled={!canWrite}
                        className="w-full"
                      >
                        <option value="blank">Number only</option>
                        <option value="year">Year / number</option>
                      </Select>
                    </Field>
                    <Field label="Prefix">
                      <Input
                        value={form.invoice_prefix}
                        onChange={(e) => setField("invoice_prefix", e.target.value.toUpperCase())}
                        disabled={!canWrite}
                        placeholder="Optional"
                      />
                    </Field>
                    <Field label="Next number">
                      <Input
                        type="number"
                        min={1}
                        value={form.invoice_next_sequence}
                        onChange={(e) => setField("invoice_next_sequence", e.target.value)}
                        disabled={!canWrite}
                      />
                    </Field>
                    <Field label="Total digits">
                      <Select
                        value={form.invoice_padding}
                        onChange={(e) => setField("invoice_padding", e.target.value)}
                        disabled={!canWrite}
                        className="w-full"
                      >
                        {["3", "4", "5", "6"].map((n) => (
                          <option key={n} value={n}>
                            {n} digits
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Next invoice">
                      <div className="border border-border bg-muted/30 px-3 py-2 font-mono text-sm">
                        {previewInvoiceNumber(form)}
                      </div>
                    </Field>
                    <Field label="Heading">
                      <Input
                        value={form.invoice_layout.heading}
                        onChange={(e) => setLayout("heading", e.target.value)}
                        disabled={!canWrite}
                        placeholder="Invoice"
                      />
                    </Field>
                  </SetupBlock>
                  <SetupBlock title="Show on invoice" hint="Turn off anything you do not want printed.">
                    <div className="grid gap-2 @2xl:col-span-2 @2xl:grid-cols-2">
                      {INVOICE_SHOW_FLAGS.map((item) => (
                        <label key={item.key} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded-none border-border"
                            checked={Boolean(form.invoice_layout[item.key])}
                            disabled={!canWrite}
                            onChange={(e) => setLayout(item.key, e.target.checked)}
                          />
                          {item.label}
                        </label>
                      ))}
                    </div>
                  </SetupBlock>
                  <SetupBlock title="Logo & signatures" hint="Empty invoice logo uses the company logo. Customer sign is a blank space on the print.">
                    <Field label="Invoice logo">
                      <MediaPickTile
                        url={form.invoice_layout.logo_url}
                        disabled={!canWrite}
                        alt="Invoice logo"
                        onChange={(next) => {
                          setForm((current) => ({
                            ...current,
                            invoice_layout: {
                              ...current.invoice_layout,
                              logo_url: next,
                              show_logo: Boolean(next) || current.invoice_layout.show_logo,
                            },
                          }));
                        }}
                        onPick={() => openMediaPicker("invoice_logo")}
                      />
                    </Field>
                    <label className="flex items-center gap-2 self-end text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded-none border-border"
                        checked={form.invoice_layout.show_logo}
                        disabled={!canWrite}
                        onChange={(e) => setLayout("show_logo", e.target.checked)}
                      />
                      Print logo on invoice
                    </label>
                    <Field label="Authorised signature / seal">
                      <MediaPickTile
                        url={form.invoice_layout.authorised_signature_url}
                        disabled={!canWrite}
                        alt="Authorised signature"
                        onChange={(next) => {
                          setForm((current) => ({
                            ...current,
                            invoice_layout: {
                              ...current.invoice_layout,
                              authorised_signature_url: next,
                              show_authorised_signature: Boolean(next) || current.invoice_layout.show_authorised_signature,
                            },
                          }));
                        }}
                        onPick={() => openMediaPicker("authorised_signature")}
                      />
                    </Field>
                    <div className="space-y-2 self-end">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded-none border-border"
                          checked={form.invoice_layout.show_authorised_signature}
                          disabled={!canWrite}
                          onChange={(e) => setLayout("show_authorised_signature", e.target.checked)}
                        />
                        Show authorised signature
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded-none border-border"
                          checked={form.invoice_layout.show_customer_signature}
                          disabled={!canWrite}
                          onChange={(e) => setLayout("show_customer_signature", e.target.checked)}
                        />
                        Show customer signature
                      </label>
                    </div>
                  </SetupBlock>
                  <SetupBlock title="Footer" hint="Notes printed under the totals.">
                    <Field label="Footer text" className="@2xl:col-span-2">
                      <Textarea
                        value={form.invoice_footer}
                        onChange={(e) => setField("invoice_footer", e.target.value)}
                        disabled={!canWrite}
                        placeholder="Thank you for your business."
                        className="min-h-[88px]"
                      />
                    </Field>
                  </SetupBlock>
                  <SetupBlock title="Preview" hint="Sample invoice using the options above.">
                    <div className="max-h-[560px] overflow-auto border border-border bg-[#ececec] p-3 @2xl:col-span-2">
                      <InvoiceLayoutPreviewDocument
                        company={invoicePreviewCompany(form)}
                        layout={form.invoice_layout}
                        invoiceNumber={previewInvoiceNumber(form)}
                      />
                    </div>
                  </SetupBlock>
                    </>
                  ) : docKind === "packing" ? (
                    <>
                  <SetupBlock
                    title="Packing slip numbers"
                    hint="Odoo delivery slip / chalan. Leave prefix empty for 0001, or CH for CH0001."
                  >
                    <Field label="Number format">
                      <Select
                        value={form.packing_layout.include_year ? "year" : "blank"}
                        onChange={(e) => setPacking("include_year", e.target.value === "year")}
                        disabled={!canWrite}
                        className="w-full"
                      >
                        <option value="blank">Number only</option>
                        <option value="year">Year / number</option>
                      </Select>
                    </Field>
                    <Field label="Prefix">
                      <Input
                        value={form.packing_layout.prefix}
                        onChange={(e) => setPacking("prefix", e.target.value.toUpperCase())}
                        disabled={!canWrite}
                        placeholder="CH"
                      />
                    </Field>
                    <Field label="Next number">
                      <Input
                        type="number"
                        min={1}
                        value={String(form.packing_layout.next_sequence)}
                        onChange={(e) => setPacking("next_sequence", Number(e.target.value) || 1)}
                        disabled={!canWrite}
                      />
                    </Field>
                    <Field label="Total digits">
                      <Select
                        value={String(form.packing_layout.padding)}
                        onChange={(e) => setPacking("padding", Number(e.target.value) || 4)}
                        disabled={!canWrite}
                        className="w-full"
                      >
                        {["3", "4", "5", "6"].map((n) => (
                          <option key={n} value={n}>
                            {n} digits
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Next packing slip">
                      <div className="border border-border bg-muted/30 px-3 py-2 font-mono text-sm">
                        {previewPackingNumber(form)}
                      </div>
                    </Field>
                    <Field label="Heading">
                      <Input
                        value={form.packing_layout.heading}
                        onChange={(e) => setPacking("heading", e.target.value)}
                        disabled={!canWrite}
                        placeholder="Chalan"
                      />
                    </Field>
                  </SetupBlock>
                  <SetupBlock title="Show on packing slip" hint="No prices — Ordered vs Delivered qty, like Odoo Delivery Slip.">
                    <div className="grid gap-2 @2xl:col-span-2 @2xl:grid-cols-2">
                      {PACKING_SHOW_FLAGS.map((item) => (
                        <label key={item.key} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded-none border-border"
                            checked={Boolean(form.packing_layout[item.key])}
                            disabled={!canWrite}
                            onChange={(e) => setPacking(item.key, e.target.checked)}
                          />
                          {item.label}
                        </label>
                      ))}
                    </div>
                  </SetupBlock>
                  <SetupBlock title="Logo & signatures" hint="Empty packing logo and seal use the invoice images. Pick a file to override.">
                    <Field label="Packing slip logo">
                      <MediaPickTile
                        url={form.packing_layout.logo_url || form.invoice_layout.logo_url}
                        disabled={!canWrite}
                        alt="Packing slip logo"
                        clearable={Boolean(form.packing_layout.logo_url)}
                        onChange={(next) => {
                          setForm((current) => ({
                            ...current,
                            packing_layout: {
                              ...current.packing_layout,
                              logo_url: next,
                              show_logo: Boolean(next) || current.packing_layout.show_logo,
                            },
                          }));
                        }}
                        onPick={() => openMediaPicker("packing_logo")}
                      />
                    </Field>
                    <label className="flex items-center gap-2 self-end text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded-none border-border"
                        checked={inheritInvoiceBrandMedia(form.packing_layout, form.invoice_layout).show_logo}
                        disabled={!canWrite}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setForm((current) => ({
                            ...current,
                            packing_layout: {
                              ...current.packing_layout,
                              show_logo: checked,
                              logo_url: checked
                                ? current.packing_layout.logo_url
                                : current.packing_layout.logo_url.trim() || current.invoice_layout.logo_url,
                            },
                          }));
                        }}
                      />
                      Print logo on packing slip
                    </label>
                    <Field label="Authorised signature / seal">
                      <MediaPickTile
                        url={
                          form.packing_layout.authorised_signature_url ||
                          form.invoice_layout.authorised_signature_url
                        }
                        disabled={!canWrite}
                        alt="Authorised signature"
                        clearable={Boolean(form.packing_layout.authorised_signature_url)}
                        onChange={(next) => {
                          setForm((current) => ({
                            ...current,
                            packing_layout: {
                              ...current.packing_layout,
                              authorised_signature_url: next,
                              show_authorised_signature:
                                Boolean(next) || current.packing_layout.show_authorised_signature,
                            },
                          }));
                        }}
                        onPick={() => openMediaPicker("packing_authorised_signature")}
                      />
                    </Field>
                    <div className="space-y-2 self-end">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded-none border-border"
                          checked={
                            inheritInvoiceBrandMedia(form.packing_layout, form.invoice_layout)
                              .show_authorised_signature
                          }
                          disabled={!canWrite}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setForm((current) => ({
                              ...current,
                              packing_layout: {
                                ...current.packing_layout,
                                show_authorised_signature: checked,
                                authorised_signature_url: checked
                                  ? current.packing_layout.authorised_signature_url
                                  : current.packing_layout.authorised_signature_url.trim() ||
                                    current.invoice_layout.authorised_signature_url,
                              },
                            }));
                          }}
                        />
                        Show authorised signature
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded-none border-border"
                          checked={form.packing_layout.show_customer_signature}
                          disabled={!canWrite}
                          onChange={(e) => setPacking("show_customer_signature", e.target.checked)}
                        />
                        Show customer signature
                      </label>
                    </div>
                  </SetupBlock>
                  <SetupBlock title="Footer" hint="Notes printed under the lines.">
                    <Field label="Footer text" className="@2xl:col-span-2">
                      <Textarea
                        value={form.packing_layout.footer}
                        onChange={(e) => setPacking("footer", e.target.value)}
                        disabled={!canWrite}
                        placeholder="Received in good condition."
                        className="min-h-[88px]"
                      />
                    </Field>
                  </SetupBlock>
                  <SetupBlock title="Preview" hint="Sample packing slip — quantities only, no prices.">
                    <div className="max-h-[560px] overflow-auto border border-border bg-[#ececec] p-3 @2xl:col-span-2">
                      <InvoiceLayoutPreviewDocument
                        company={invoicePreviewCompany(form)}
                        layout={form.invoice_layout}
                        packing={form.packing_layout}
                        kind="packing"
                        invoiceNumber={previewPackingNumber(form)}
                      />
                    </div>
                  </SetupBlock>
                    </>
                  ) : docKind === "purchase" ? (
                    <>
                  <SetupBlock
                    title="Purchase order numbers"
                    hint="Odoo purchase order / RFQ. Leave prefix empty for 0001, or PO for PO0001."
                  >
                    <Field label="Number format">
                      <Select
                        value={form.purchase_layout.include_year ? "year" : "blank"}
                        onChange={(e) => setPurchase("include_year", e.target.value === "year")}
                        disabled={!canWrite}
                        className="w-full"
                      >
                        <option value="blank">Number only</option>
                        <option value="year">Year / number</option>
                      </Select>
                    </Field>
                    <Field label="Prefix">
                      <Input
                        value={form.purchase_layout.prefix}
                        onChange={(e) => setPurchase("prefix", e.target.value.toUpperCase())}
                        disabled={!canWrite}
                        placeholder="PO"
                      />
                    </Field>
                    <Field label="Next number">
                      <Input
                        type="number"
                        min={1}
                        value={String(form.purchase_layout.next_sequence)}
                        onChange={(e) => setPurchase("next_sequence", Number(e.target.value) || 1)}
                        disabled={!canWrite}
                      />
                    </Field>
                    <Field label="Total digits">
                      <Select
                        value={String(form.purchase_layout.padding)}
                        onChange={(e) => setPurchase("padding", Number(e.target.value) || 4)}
                        disabled={!canWrite}
                        className="w-full"
                      >
                        {["3", "4", "5", "6"].map((n) => (
                          <option key={n} value={n}>
                            {n} digits
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Next purchase order">
                      <div className="border border-border bg-muted/30 px-3 py-2 font-mono text-sm">
                        {previewPurchaseNumber(form)}
                      </div>
                    </Field>
                    <Field label="Heading">
                      <Input
                        value={form.purchase_layout.heading}
                        onChange={(e) => setPurchase("heading", e.target.value)}
                        disabled={!canWrite}
                        placeholder="Purchase Order"
                      />
                    </Field>
                  </SetupBlock>
                  <SetupBlock title="Show on purchase order" hint="Odoo PO — vendor, costs, and payment terms. Turn off anything you do not want printed.">
                    <div className="grid gap-2 @2xl:col-span-2 @2xl:grid-cols-2">
                      {PURCHASE_SHOW_FLAGS.map((item) => (
                        <label key={item.key} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded-none border-border"
                            checked={Boolean(form.purchase_layout[item.key])}
                            disabled={!canWrite}
                            onChange={(e) => setPurchase(item.key, e.target.checked)}
                          />
                          {item.label}
                        </label>
                      ))}
                    </div>
                  </SetupBlock>
                  <SetupBlock title="Logo & signatures" hint="Empty purchase logo and seal use the invoice images. Pick a file to override.">
                    <Field label="Purchase order logo">
                      <MediaPickTile
                        url={form.purchase_layout.logo_url || form.invoice_layout.logo_url}
                        disabled={!canWrite}
                        alt="Purchase order logo"
                        clearable={Boolean(form.purchase_layout.logo_url)}
                        onChange={(next) => {
                          setForm((current) => ({
                            ...current,
                            purchase_layout: {
                              ...current.purchase_layout,
                              logo_url: next,
                              show_logo: Boolean(next) || current.purchase_layout.show_logo,
                            },
                          }));
                        }}
                        onPick={() => openMediaPicker("purchase_logo")}
                      />
                    </Field>
                    <label className="flex items-center gap-2 self-end text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded-none border-border"
                        checked={inheritInvoiceBrandMedia(form.purchase_layout, form.invoice_layout).show_logo}
                        disabled={!canWrite}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setForm((current) => ({
                            ...current,
                            purchase_layout: {
                              ...current.purchase_layout,
                              show_logo: checked,
                              logo_url: checked
                                ? current.purchase_layout.logo_url
                                : current.purchase_layout.logo_url.trim() || current.invoice_layout.logo_url,
                            },
                          }));
                        }}
                      />
                      Print logo on purchase order
                    </label>
                    <Field label="Authorised signature / seal">
                      <MediaPickTile
                        url={
                          form.purchase_layout.authorised_signature_url ||
                          form.invoice_layout.authorised_signature_url
                        }
                        disabled={!canWrite}
                        alt="Authorised signature"
                        clearable={Boolean(form.purchase_layout.authorised_signature_url)}
                        onChange={(next) => {
                          setForm((current) => ({
                            ...current,
                            purchase_layout: {
                              ...current.purchase_layout,
                              authorised_signature_url: next,
                              show_authorised_signature:
                                Boolean(next) || current.purchase_layout.show_authorised_signature,
                            },
                          }));
                        }}
                        onPick={() => openMediaPicker("purchase_authorised_signature")}
                      />
                    </Field>
                    <div className="space-y-2 self-end">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded-none border-border"
                          checked={
                            inheritInvoiceBrandMedia(form.purchase_layout, form.invoice_layout)
                              .show_authorised_signature
                          }
                          disabled={!canWrite}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setForm((current) => ({
                              ...current,
                              purchase_layout: {
                                ...current.purchase_layout,
                                show_authorised_signature: checked,
                                authorised_signature_url: checked
                                  ? current.purchase_layout.authorised_signature_url
                                  : current.purchase_layout.authorised_signature_url.trim() ||
                                    current.invoice_layout.authorised_signature_url,
                              },
                            }));
                          }}
                        />
                        Show authorised signature
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded-none border-border"
                          checked={form.purchase_layout.show_customer_signature}
                          disabled={!canWrite}
                          onChange={(e) => setPurchase("show_customer_signature", e.target.checked)}
                        />
                        Show received-by signature
                      </label>
                    </div>
                  </SetupBlock>
                  <SetupBlock title="Footer" hint="Notes printed under the totals.">
                    <Field label="Footer text" className="@2xl:col-span-2">
                      <Textarea
                        value={form.purchase_layout.footer}
                        onChange={(e) => setPurchase("footer", e.target.value)}
                        disabled={!canWrite}
                        placeholder="Please confirm this order and advise delivery date."
                        className="min-h-[88px]"
                      />
                    </Field>
                  </SetupBlock>
                  <SetupBlock title="Preview" hint="Sample purchase order using the options above.">
                    <div className="max-h-[560px] overflow-auto border border-border bg-[#ececec] p-3 @2xl:col-span-2">
                      <PurchaseOrderPrintDocument
                        data={samplePurchasePrintPayload(
                          invoicePreviewCompany(form),
                          form.purchase_layout,
                          previewPurchaseNumber(form),
                          form.invoice_layout,
                        )}
                      />
                    </div>
                  </SetupBlock>
                    </>
                  ) : (
                    <>
                  <SetupBlock
                    title="Payment slip numbers"
                    hint="Odoo payment receipt / money receipt. Leave prefix empty for 0001, or PAY for PAY0001."
                  >
                    <Field label="Number format">
                      <Select
                        value={form.payment_layout.include_year ? "year" : "blank"}
                        onChange={(e) => setPayment("include_year", e.target.value === "year")}
                        disabled={!canWrite}
                        className="w-full"
                      >
                        <option value="blank">Number only</option>
                        <option value="year">Year / number</option>
                      </Select>
                    </Field>
                    <Field label="Prefix">
                      <Input
                        value={form.payment_layout.prefix}
                        onChange={(e) => setPayment("prefix", e.target.value.toUpperCase())}
                        disabled={!canWrite}
                        placeholder="PAY"
                      />
                    </Field>
                    <Field label="Next number">
                      <Input
                        type="number"
                        min={1}
                        value={String(form.payment_layout.next_sequence)}
                        onChange={(e) => setPayment("next_sequence", Number(e.target.value) || 1)}
                        disabled={!canWrite}
                      />
                    </Field>
                    <Field label="Total digits">
                      <Select
                        value={String(form.payment_layout.padding)}
                        onChange={(e) => setPayment("padding", Number(e.target.value) || 4)}
                        disabled={!canWrite}
                        className="w-full"
                      >
                        {["3", "4", "5", "6"].map((n) => (
                          <option key={n} value={n}>
                            {n} digits
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Next payment slip">
                      <div className="border border-border bg-muted/30 px-3 py-2 font-mono text-sm">
                        {previewPaymentNumber(form)}
                      </div>
                    </Field>
                    <Field label="Heading">
                      <Input
                        value={form.payment_layout.heading}
                        onChange={(e) => setPayment("heading", e.target.value)}
                        disabled={!canWrite}
                        placeholder="Payment Slip"
                      />
                    </Field>
                  </SetupBlock>
                  <SetupBlock title="Show on payment slip" hint="Odoo payment receipt — date, partner, method, amount, and allocated invoices.">
                    <div className="grid gap-2 @2xl:col-span-2 @2xl:grid-cols-2">
                      {PAYMENT_SHOW_FLAGS.map((item) => (
                        <label key={item.key} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded-none border-border"
                            checked={Boolean(form.payment_layout[item.key])}
                            disabled={!canWrite}
                            onChange={(e) => setPayment(item.key, e.target.checked)}
                          />
                          {item.label}
                        </label>
                      ))}
                    </div>
                  </SetupBlock>
                  <SetupBlock title="Logo & signatures" hint="Empty payment logo and seal use the invoice images. Pick a file to override.">
                    <Field label="Payment slip logo">
                      <MediaPickTile
                        url={form.payment_layout.logo_url || form.invoice_layout.logo_url}
                        disabled={!canWrite}
                        alt="Payment slip logo"
                        clearable={Boolean(form.payment_layout.logo_url)}
                        onChange={(next) => {
                          setForm((current) => ({
                            ...current,
                            payment_layout: {
                              ...current.payment_layout,
                              logo_url: next,
                              show_logo: Boolean(next) || current.payment_layout.show_logo,
                            },
                          }));
                        }}
                        onPick={() => openMediaPicker("payment_logo")}
                      />
                    </Field>
                    <label className="flex items-center gap-2 self-end text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded-none border-border"
                        checked={inheritInvoiceBrandMedia(form.payment_layout, form.invoice_layout).show_logo}
                        disabled={!canWrite}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setForm((current) => ({
                            ...current,
                            payment_layout: {
                              ...current.payment_layout,
                              show_logo: checked,
                              logo_url: checked
                                ? current.payment_layout.logo_url
                                : current.payment_layout.logo_url.trim() || current.invoice_layout.logo_url,
                            },
                          }));
                        }}
                      />
                      Print logo on payment slip
                    </label>
                    <Field label="Authorised signature / seal">
                      <MediaPickTile
                        url={
                          form.payment_layout.authorised_signature_url ||
                          form.invoice_layout.authorised_signature_url
                        }
                        disabled={!canWrite}
                        alt="Authorised signature"
                        clearable={Boolean(form.payment_layout.authorised_signature_url)}
                        onChange={(next) => {
                          setForm((current) => ({
                            ...current,
                            payment_layout: {
                              ...current.payment_layout,
                              authorised_signature_url: next,
                              show_authorised_signature:
                                Boolean(next) || current.payment_layout.show_authorised_signature,
                            },
                          }));
                        }}
                        onPick={() => openMediaPicker("payment_authorised_signature")}
                      />
                    </Field>
                    <div className="space-y-2 self-end">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded-none border-border"
                          checked={
                            inheritInvoiceBrandMedia(form.payment_layout, form.invoice_layout)
                              .show_authorised_signature
                          }
                          disabled={!canWrite}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setForm((current) => ({
                              ...current,
                              payment_layout: {
                                ...current.payment_layout,
                                show_authorised_signature: checked,
                                authorised_signature_url: checked
                                  ? current.payment_layout.authorised_signature_url
                                  : current.payment_layout.authorised_signature_url.trim() ||
                                    current.invoice_layout.authorised_signature_url,
                              },
                            }));
                          }}
                        />
                        Show authorised signature
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded-none border-border"
                          checked={form.payment_layout.show_customer_signature}
                          disabled={!canWrite}
                          onChange={(e) => setPayment("show_customer_signature", e.target.checked)}
                        />
                        Show received-by signature
                      </label>
                    </div>
                  </SetupBlock>
                  <SetupBlock title="Footer" hint="Notes printed under the slip.">
                    <Field label="Footer text" className="@2xl:col-span-2">
                      <Textarea
                        value={form.payment_layout.footer}
                        onChange={(e) => setPayment("footer", e.target.value)}
                        disabled={!canWrite}
                        placeholder="Received with thanks."
                        className="min-h-[88px]"
                      />
                    </Field>
                  </SetupBlock>
                  <SetupBlock title="Preview" hint="Sample payment slip using the options above.">
                    <div className="max-h-[560px] overflow-auto border border-border bg-[#ececec] p-3 @2xl:col-span-2">
                      <PaymentSlipPrintDocument
                        data={samplePaymentPrintPayload(
                          invoicePreviewCompany(form),
                          form.payment_layout,
                          previewPaymentNumber(form),
                          form.invoice_layout,
                        )}
                      />
                    </div>
                  </SetupBlock>
                    </>
                  )}
                </TabFields>
              ) : null}
            </div>
          </AgainFormNotebook>
        </div>
      </div>

      <Sheet open={warehouseSheetOpen} onOpenChange={setWarehouseSheetOpen}>
        <SheetContent
          side="right"
          title={editWarehouse ? "Edit location" : "New location"}
          resizable
          closeButton="inside"
          className="w-[360px] min-w-[160px] max-w-[720px] gap-0 rounded-none p-0"
        >
          <div className="flex items-center gap-2 border-b border-border px-3 py-2 pr-10">
            <Button
              size="sm"
              className="h-7 rounded-none"
              disabled={savingWarehouse}
              onClick={() => void saveWarehouse()}
            >
              {savingWarehouse ? "Saving…" : "Save"}
            </Button>
            <h2 className="text-sm font-semibold">{editWarehouse ? "Edit location" : "New location"}</h2>
          </div>
          <div className="again-odoo-form @container overflow-y-auto p-3">
            <Field label="Location name">
              <Input
                value={warehouseForm.name}
                onChange={(e) => setWarehouseField("name", e.target.value)}
                placeholder="Dhaka Showroom"
              />
            </Field>
            <Field label="Short code">
              <Input
                value={warehouseForm.code}
                onChange={(e) => setWarehouseField("code", e.target.value.toUpperCase())}
                placeholder="WH"
              />
            </Field>
            <Field label="Type">
              <Select
                value={warehouseForm.type}
                onChange={(e) => setWarehouseField("type", e.target.value)}
                className="w-full"
              >
                {(warehouseForm.type && !WAREHOUSE_TYPE_PRESETS.includes(warehouseForm.type)
                  ? [warehouseForm.type, ...WAREHOUSE_TYPE_PRESETS]
                  : WAREHOUSE_TYPE_PRESETS
                ).map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Address">
              <Input
                value={warehouseForm.address}
                onChange={(e) => setWarehouseField("address", e.target.value)}
              />
            </Field>
            <div>
              <Field label="City">
                <Input
                  value={warehouseForm.city}
                  onChange={(e) => setWarehouseField("city", e.target.value)}
                />
              </Field>
              <Field label="Country">
                <Input
                  value={warehouseForm.country}
                  onChange={(e) => setWarehouseField("country", e.target.value)}
                />
              </Field>
              <Field label="Phone">
                <Input
                  value={warehouseForm.mobile}
                  onChange={(e) => setWarehouseField("mobile", e.target.value)}
                />
              </Field>
            </div>
            <Field label="Status">
              <Select
                value={warehouseForm.isActive ? "active" : "inactive"}
                onChange={(e) => setWarehouseField("isActive", e.target.value !== "inactive")}
                className="w-full"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded-none border-border"
                checked={warehouseForm.isDefault}
                onChange={(e) => setWarehouseField("isDefault", e.target.checked)}
              />
              Default location
            </label>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog.Root
        open={!!deleteWarehouseTarget}
        onOpenChange={(open) => !open && setDeleteWarehouseTarget(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(400px,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-none border border-border bg-background p-6 shadow-xl">
            <Dialog.Title className="text-base font-semibold">Delete location?</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              {`"${deleteWarehouseTarget?.name}" will be removed. The last location cannot be deleted, and its stock must be moved first.`}
            </Dialog.Description>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-none"
                onClick={() => setDeleteWarehouseTarget(null)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="rounded-none"
                onClick={() => void confirmDeleteWarehouse()}
              >
                Delete
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
    <CurrencyPickDrawer
      open={listCurrencyOpen}
      onOpenChange={setListCurrencyOpen}
      currencies={currencyOptions}
      selectedCode={form.currency_code}
      onSelect={(code) => setField("currency_code", code)}
      onCreate={(name) => {
        const parsed = parseCurrencyInput(name);
        if (!parsed) return;
        addCustomCurrency(name);
        setField("currency_code", parsed.code);
        setCurrencyOptions(buildCurrencyOptions(parsed.code));
        toast.success("Currency added");
      }}
      onRename={(code, name) => {
        renameCustomCurrency(code, name);
        setCurrencyOptions(buildCurrencyOptions(form.currency_code));
      }}
      onDelete={(code) => {
        const remaining = removeCustomCurrency(code);
        const fallback = form.currency_code === code ? (remaining[0]?.code ?? "BDT") : form.currency_code;
        if (form.currency_code === code) setField("currency_code", fallback);
        setCurrencyOptions(buildCurrencyOptions(fallback));
        toast.success("Currency removed");
      }}
      onSetSymbol={(code, symbol) => {
        patchCurrency(code, { symbol });
        setCurrencyOptions(buildCurrencyOptions(form.currency_code));
      }}
      onSetPosition={(code, position) => {
        patchCurrency(code, { position });
        setCurrencyOptions(buildCurrencyOptions(form.currency_code));
      }}
    />
    <MediaLibraryModal
      open={logoLibraryOpen}
      onOpenChange={(open) => {
        setLogoLibraryOpen(open);
        if (open) void refetchMedia();
      }}
      items={mediaItems}
      mode="single"
      title={MEDIA_PICK_TITLE[mediaPickTarget]}
      accept={["image"]}
      onSelect={(items) => {
        const next = items.find((item) => item.type === "image")?.url;
        if (next) applyPickedMedia(next);
      }}
      onUploadFiles={async (files) => {
        const uploaded = await uploadCatalogMediaFiles(files);
        await refetchMedia();
        return uploaded;
      }}
      onImportItems={async (items) => {
        const saved = await createCatalogMediaBatch(items);
        await refetchMedia();
        return saved;
      }}
    />
    {invoicePreviewOpen ? (
      <InvoiceLayoutPreviewOverlay
        company={invoicePreviewCompany(form)}
        layout={form.invoice_layout}
        packing={form.packing_layout}
        purchase={form.purchase_layout}
        payment={form.payment_layout}
        kind={docKind}
        invoiceNumber={
          docKind === "packing"
            ? previewPackingNumber(form)
            : docKind === "purchase"
              ? previewPurchaseNumber(form)
              : docKind === "payment"
                ? previewPaymentNumber(form)
                : previewInvoiceNumber(form)
        }
        onClose={() => setInvoicePreviewOpen(false)}
      />
    ) : null}
    </>
  );
}
