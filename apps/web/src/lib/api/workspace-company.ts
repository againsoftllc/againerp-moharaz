import { apiFetch } from "@/lib/api/client";
import { hydrateCompanyFormat } from "@/lib/store/company-format-store";

export type InvoiceLayout = {
  name: string;
  design: string;
  heading: string;
  number_label: string;
  date_label: string;
  customer_label: string;
  product_label: string;
  qty_label: string;
  unit_price_label: string;
  line_subtotal_label: string;
  subtotal_label: string;
  discount_label: string;
  tax_label: string;
  total_label: string;
  due_label: string;
  paid_label: string;
  show_time: boolean;
  show_sku: boolean;
  show_brand: boolean;
  show_category: boolean;
  show_description: boolean;
  show_logo: boolean;
  show_business_name: boolean;
  show_company_name: boolean;
  show_legal_name: boolean;
  show_location: boolean;
  show_street: boolean;
  show_landmark: boolean;
  show_city: boolean;
  show_state: boolean;
  show_zip: boolean;
  show_country: boolean;
  show_phone: boolean;
  show_mobile: boolean;
  show_email: boolean;
  show_website: boolean;
  show_bin: boolean;
  show_tax: boolean;
  show_payments: boolean;
  show_customer: boolean;
  show_previous_balance: boolean;
  show_warranty: boolean;
  show_customer_signature: boolean;
  show_authorised_signature: boolean;
  customer_signature_label: string;
  authorised_signature_label: string;
  logo_url: string;
  customer_signature_url: string;
  authorised_signature_url: string;
};

export const DEFAULT_INVOICE_LAYOUT: InvoiceLayout = {
  name: "Default",
  design: "classic",
  heading: "Invoice",
  number_label: "Invoice No.",
  date_label: "Date",
  customer_label: "Customer",
  product_label: "Product",
  qty_label: "Quantity",
  unit_price_label: "Unit Price",
  line_subtotal_label: "Subtotal",
  subtotal_label: "Subtotal",
  discount_label: "Discount",
  tax_label: "Tax",
  total_label: "Total",
  due_label: "Total Due",
  paid_label: "Total Paid",
  show_time: true,
  show_sku: false,
  show_brand: false,
  show_category: true,
  show_description: true,
  show_logo: false,
  show_business_name: false,
  show_company_name: false,
  show_legal_name: false,
  show_location: true,
  show_street: true,
  show_landmark: true,
  show_city: true,
  show_state: true,
  show_zip: true,
  show_country: true,
  show_phone: true,
  show_mobile: true,
  show_email: false,
  show_website: false,
  show_bin: true,
  show_tax: true,
  show_payments: true,
  show_customer: true,
  show_previous_balance: true,
  show_warranty: true,
  show_customer_signature: true,
  show_authorised_signature: true,
  customer_signature_label: "Customer Signature",
  authorised_signature_label: "Authorised Signature",
  logo_url: "",
  customer_signature_url: "",
  authorised_signature_url: "",
};

export function mergeInvoiceLayout(raw: unknown): InvoiceLayout {
  const out: InvoiceLayout = { ...DEFAULT_INVOICE_LAYOUT };
  if (!raw || typeof raw !== "object") return out;
  const data = raw as Record<string, unknown>;
  (Object.keys(DEFAULT_INVOICE_LAYOUT) as (keyof InvoiceLayout)[]).forEach((key) => {
    if (!(key in data) || data[key] == null) return;
    const fallback = DEFAULT_INVOICE_LAYOUT[key];
    if (typeof fallback === "boolean") {
      out[key] = Boolean(data[key]) as InvoiceLayout[typeof key];
    } else {
      out[key] = String(data[key]) as InvoiceLayout[typeof key];
    }
  });
  if (!("show_company_name" in data) && "show_business_name" in data) {
    out.show_company_name = Boolean(data.show_business_name);
  }
  return out;
}

export type PackingLayout = {
  heading: string;
  number_label: string;
  date_label: string;
  order_label: string;
  product_label: string;
  ordered_label: string;
  delivered_label: string;
  prefix: string;
  include_year: boolean;
  padding: number;
  next_sequence: number;
  footer: string;
  show_time: boolean;
  show_sku: boolean;
  show_brand: boolean;
  show_category: boolean;
  show_description: boolean;
  show_logo: boolean;
  show_business_name: boolean;
  show_company_name: boolean;
  show_legal_name: boolean;
  show_location: boolean;
  show_street: boolean;
  show_landmark: boolean;
  show_city: boolean;
  show_state: boolean;
  show_zip: boolean;
  show_country: boolean;
  show_phone: boolean;
  show_mobile: boolean;
  show_email: boolean;
  show_website: boolean;
  show_bin: boolean;
  show_customer: boolean;
  show_warranty: boolean;
  show_order: boolean;
  show_shipping_date: boolean;
  show_ordered: boolean;
  show_delivered: boolean;
  show_serial: boolean;
  show_customer_signature: boolean;
  show_authorised_signature: boolean;
  customer_signature_label: string;
  authorised_signature_label: string;
  logo_url: string;
  customer_signature_url: string;
  authorised_signature_url: string;
};

export const DEFAULT_PACKING_LAYOUT: PackingLayout = {
  heading: "Chalan",
  number_label: "Chalan No.",
  date_label: "Shipping Date",
  order_label: "Order",
  product_label: "Product",
  ordered_label: "Ordered",
  delivered_label: "Delivered",
  prefix: "CH",
  include_year: false,
  padding: 4,
  next_sequence: 1,
  footer: "",
  show_time: false,
  show_sku: true,
  show_brand: false,
  show_category: false,
  show_description: false,
  show_logo: true,
  show_business_name: false,
  show_company_name: false,
  show_legal_name: false,
  show_location: true,
  show_street: true,
  show_landmark: true,
  show_city: true,
  show_state: true,
  show_zip: true,
  show_country: true,
  show_phone: true,
  show_mobile: true,
  show_email: false,
  show_website: false,
  show_bin: true,
  show_customer: true,
  show_warranty: false,
  show_order: true,
  show_shipping_date: true,
  show_ordered: true,
  show_delivered: true,
  show_serial: false,
  show_customer_signature: true,
  show_authorised_signature: true,
  customer_signature_label: "Customer Signature",
  authorised_signature_label: "Authorised Signature",
  logo_url: "",
  customer_signature_url: "",
  authorised_signature_url: "",
};

export function mergePackingLayout(raw: unknown): PackingLayout {
  const out: PackingLayout = { ...DEFAULT_PACKING_LAYOUT };
  if (!raw || typeof raw !== "object") return out;
  const data = raw as Record<string, unknown>;
  (Object.keys(DEFAULT_PACKING_LAYOUT) as (keyof PackingLayout)[]).forEach((key) => {
    if (!(key in data) || data[key] == null) return;
    const fallback = DEFAULT_PACKING_LAYOUT[key];
    if (typeof fallback === "boolean") {
      out[key] = Boolean(data[key]) as PackingLayout[typeof key];
    } else if (typeof fallback === "number") {
      const n = Number(data[key]);
      out[key] = (Number.isFinite(n) ? n : fallback) as PackingLayout[typeof key];
    } else {
      out[key] = String(data[key]) as PackingLayout[typeof key];
    }
  });
  if (!out.logo_url.trim() && !out.show_logo) out.show_logo = true;
  return out;
}

export type PurchaseLayout = {
  heading: string;
  number_label: string;
  date_label: string;
  vendor_label: string;
  buyer_label: string;
  reference_label: string;
  expected_label: string;
  warehouse_label: string;
  product_label: string;
  qty_label: string;
  unit_cost_label: string;
  discount_label: string;
  tax_label: string;
  amount_label: string;
  subtotal_label: string;
  total_label: string;
  prefix: string;
  include_year: boolean;
  padding: number;
  next_sequence: number;
  footer: string;
  show_time: boolean;
  show_sku: boolean;
  show_logo: boolean;
  show_business_name: boolean;
  show_company_name: boolean;
  show_legal_name: boolean;
  show_location: boolean;
  show_street: boolean;
  show_landmark: boolean;
  show_city: boolean;
  show_state: boolean;
  show_zip: boolean;
  show_country: boolean;
  show_phone: boolean;
  show_mobile: boolean;
  show_email: boolean;
  show_website: boolean;
  show_bin: boolean;
  show_vendor: boolean;
  show_buyer: boolean;
  show_reference: boolean;
  show_expected: boolean;
  show_warehouse: boolean;
  show_discount: boolean;
  show_tax: boolean;
  show_payment_terms: boolean;
  show_customer_signature: boolean;
  show_authorised_signature: boolean;
  customer_signature_label: string;
  authorised_signature_label: string;
  logo_url: string;
  customer_signature_url: string;
  authorised_signature_url: string;
};

export const DEFAULT_PURCHASE_LAYOUT: PurchaseLayout = {
  heading: "Purchase Order",
  number_label: "PO No.",
  date_label: "Order Date",
  vendor_label: "Vendor",
  buyer_label: "Buyer",
  reference_label: "Your Order Reference",
  expected_label: "Expected Arrival",
  warehouse_label: "Warehouse",
  product_label: "Description",
  qty_label: "Qty",
  unit_cost_label: "Unit Cost",
  discount_label: "Disc.",
  tax_label: "Taxes",
  amount_label: "Amount",
  subtotal_label: "Subtotal",
  total_label: "Total",
  prefix: "PO",
  include_year: false,
  padding: 4,
  next_sequence: 1,
  footer: "",
  show_time: false,
  show_sku: true,
  show_logo: true,
  show_business_name: false,
  show_company_name: true,
  show_legal_name: false,
  show_location: true,
  show_street: true,
  show_landmark: true,
  show_city: true,
  show_state: true,
  show_zip: true,
  show_country: true,
  show_phone: true,
  show_mobile: true,
  show_email: false,
  show_website: false,
  show_bin: true,
  show_vendor: true,
  show_buyer: true,
  show_reference: true,
  show_expected: true,
  show_warehouse: true,
  show_discount: true,
  show_tax: true,
  show_payment_terms: true,
  show_customer_signature: true,
  show_authorised_signature: true,
  customer_signature_label: "Customer Signature",
  authorised_signature_label: "Authorised Signature",
  logo_url: "",
  customer_signature_url: "",
  authorised_signature_url: "",
};

export function mergePurchaseLayout(raw: unknown): PurchaseLayout {
  const out: PurchaseLayout = { ...DEFAULT_PURCHASE_LAYOUT };
  if (!raw || typeof raw !== "object") return out;
  const data = raw as Record<string, unknown>;
  (Object.keys(DEFAULT_PURCHASE_LAYOUT) as (keyof PurchaseLayout)[]).forEach((key) => {
    if (!(key in data) || data[key] == null) return;
    const fallback = DEFAULT_PURCHASE_LAYOUT[key];
    if (typeof fallback === "boolean") {
      out[key] = Boolean(data[key]) as PurchaseLayout[typeof key];
    } else if (typeof fallback === "number") {
      const n = Number(data[key]);
      out[key] = (Number.isFinite(n) ? n : fallback) as PurchaseLayout[typeof key];
    } else {
      out[key] = String(data[key]) as PurchaseLayout[typeof key];
    }
  });
  if (!out.logo_url.trim() && !out.show_logo) out.show_logo = true;
  return out;
}

export type PaymentLayout = {
  heading: string;
  number_label: string;
  date_label: string;
  partner_label: string;
  method_label: string;
  amount_label: string;
  memo_label: string;
  invoice_date_label: string;
  invoice_number_label: string;
  reference_label: string;
  invoice_amount_label: string;
  due_label: string;
  prefix: string;
  include_year: boolean;
  padding: number;
  next_sequence: number;
  footer: string;
  show_time: boolean;
  show_logo: boolean;
  show_business_name: boolean;
  show_company_name: boolean;
  show_legal_name: boolean;
  show_location: boolean;
  show_street: boolean;
  show_landmark: boolean;
  show_city: boolean;
  show_state: boolean;
  show_zip: boolean;
  show_country: boolean;
  show_phone: boolean;
  show_mobile: boolean;
  show_email: boolean;
  show_website: boolean;
  show_bin: boolean;
  show_partner: boolean;
  show_method: boolean;
  show_amount: boolean;
  show_memo: boolean;
  show_invoices: boolean;
  show_customer_signature: boolean;
  show_authorised_signature: boolean;
  customer_signature_label: string;
  authorised_signature_label: string;
  logo_url: string;
  customer_signature_url: string;
  authorised_signature_url: string;
};

export const DEFAULT_PAYMENT_LAYOUT: PaymentLayout = {
  heading: "Payment Slip",
  number_label: "Slip No.",
  date_label: "Payment Date",
  partner_label: "Received from",
  method_label: "Payment Method",
  amount_label: "Payment Amount",
  memo_label: "Memo",
  invoice_date_label: "Invoice Date",
  invoice_number_label: "Invoice Number",
  reference_label: "Reference",
  invoice_amount_label: "Amount",
  due_label: "Due Amount",
  prefix: "PAY",
  include_year: false,
  padding: 4,
  next_sequence: 1,
  footer: "",
  show_time: false,
  show_logo: true,
  show_business_name: false,
  show_company_name: true,
  show_legal_name: false,
  show_location: true,
  show_street: true,
  show_landmark: true,
  show_city: true,
  show_state: true,
  show_zip: true,
  show_country: true,
  show_phone: true,
  show_mobile: true,
  show_email: false,
  show_website: false,
  show_bin: true,
  show_partner: true,
  show_method: true,
  show_amount: true,
  show_memo: true,
  show_invoices: true,
  show_customer_signature: true,
  show_authorised_signature: true,
  customer_signature_label: "Customer Signature",
  authorised_signature_label: "Authorised Signature",
  logo_url: "",
  customer_signature_url: "",
  authorised_signature_url: "",
};

export function mergePaymentLayout(raw: unknown): PaymentLayout {
  const out: PaymentLayout = { ...DEFAULT_PAYMENT_LAYOUT };
  if (!raw || typeof raw !== "object") return out;
  const data = raw as Record<string, unknown>;
  (Object.keys(DEFAULT_PAYMENT_LAYOUT) as (keyof PaymentLayout)[]).forEach((key) => {
    if (!(key in data) || data[key] == null) return;
    const fallback = DEFAULT_PAYMENT_LAYOUT[key];
    if (typeof fallback === "boolean") {
      out[key] = Boolean(data[key]) as PaymentLayout[typeof key];
    } else if (typeof fallback === "number") {
      const n = Number(data[key]);
      out[key] = (Number.isFinite(n) ? n : fallback) as PaymentLayout[typeof key];
    } else {
      out[key] = String(data[key]) as PaymentLayout[typeof key];
    }
  });
  if (!out.logo_url.trim() && !out.show_logo) out.show_logo = true;
  return out;
}

export type InvoiceBrandMedia = {
  logo_url: string;
  authorised_signature_url: string;
  show_logo: boolean;
  show_authorised_signature: boolean;
};

/** Packing / PO / payment slip use invoice logo + seal until the admin sets a document-specific image. */
export function inheritInvoiceBrandMedia(
  own: InvoiceBrandMedia,
  invoice: InvoiceBrandMedia,
): InvoiceBrandMedia {
  const ownLogo = own.logo_url.trim();
  const ownSign = own.authorised_signature_url.trim();
  const invoiceLogo = invoice.logo_url.trim();
  const invoiceSign = invoice.authorised_signature_url.trim();
  return {
    logo_url: ownLogo || invoiceLogo,
    authorised_signature_url: ownSign || invoiceSign,
    show_logo: ownLogo ? own.show_logo : own.show_logo || Boolean(invoiceLogo),
    show_authorised_signature: ownSign
      ? own.show_authorised_signature
      : own.show_authorised_signature || Boolean(invoiceSign),
  };
}

export type WorkspaceCompany = {
  id: string;
  name: string;
  slug: string;
  status: string;
  branch_count: number;
  legal_name: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  website: string | null;
  logo_url: string | null;
  street: string | null;
  street2: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  country: string | null;
  tax_id: string | null;
  vat_number: string | null;
  registration_no: string | null;
  currency_code: string | null;
  language_code: string | null;
  timezone: string | null;
  date_format: string | null;
  time_format: string | null;
  decimal_places: number | null;
  number_grouping: string | null;
  fiscal_year_start_month: number | null;
  bank_name: string | null;
  bank_account: string | null;
  bank_branch: string | null;
  bank_routing: string | null;
  invoice_prefix: string | null;
  invoice_include_year: boolean | null;
  invoice_padding: number | null;
  invoice_next_sequence: number | null;
  invoice_due_days: number | null;
  invoice_payment_terms: string | null;
  invoice_tax_rate: number | string | null;
  invoice_prices_include_tax: boolean | null;
  tax_enabled?: boolean | null;
  invoice_footer: string | null;
  credit_note_prefix: string | null;
  invoice_layout?: InvoiceLayout | null;
  packing_layout?: PackingLayout | null;
  purchase_layout?: PurchaseLayout | null;
  payment_layout?: PaymentLayout | null;
  invoice_next_preview?: string | null;
  packing_next_preview?: string | null;
  purchase_next_preview?: string | null;
  payment_next_preview?: string | null;
};

export type WorkspaceCompanyWrite = {
  name: string;
  legal_name?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  website?: string;
  logo_url?: string;
  street?: string;
  street2?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  country?: string;
  tax_id?: string;
  vat_number?: string;
  registration_no?: string;
  currency_code?: string;
  language_code?: string;
  timezone?: string;
  date_format?: string;
  time_format?: string;
  decimal_places?: number;
  number_grouping?: string;
  fiscal_year_start_month?: number | null;
  bank_name?: string;
  bank_account?: string;
  bank_branch?: string;
  bank_routing?: string;
  invoice_prefix?: string;
  invoice_include_year?: boolean;
  invoice_padding?: number;
  invoice_next_sequence?: number;
  invoice_due_days?: number;
  invoice_payment_terms?: string;
  invoice_tax_rate?: number;
  invoice_prices_include_tax?: boolean;
  tax_enabled?: boolean;
  invoice_footer?: string;
  credit_note_prefix?: string;
  invoice_layout?: InvoiceLayout;
  packing_layout?: PackingLayout;
  purchase_layout?: PurchaseLayout;
  payment_layout?: PaymentLayout;
};

export async function fetchWorkspaceCompany(): Promise<WorkspaceCompany> {
  const res = await apiFetch<{ data: WorkspaceCompany }>("/api/v1/workspace/company", {
    cache: "no-store",
  });
  hydrateCompanyFormat(res.data);
  return res.data;
}

export async function updateWorkspaceCompany(
  payload: WorkspaceCompanyWrite,
): Promise<WorkspaceCompany> {
  const res = await apiFetch<{ data: WorkspaceCompany }>("/api/v1/workspace/company", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  hydrateCompanyFormat(res.data);
  return res.data;
}

/** Company Tax & registration toggle. Missing/null means tax is on (invoice default). */
export function companyTaxesEnabled(row?: { tax_enabled?: boolean | null } | null): boolean {
  return row == null ? true : row.tax_enabled !== false;
}

export function companyTaxRatePct(
  row?: { invoice_tax_rate?: number | string | null } | null,
): number {
  const n = Number(row?.invoice_tax_rate ?? 0);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}
