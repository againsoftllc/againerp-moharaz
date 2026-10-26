import type { InvoicePreviewCompany } from "@/components/workspace/invoice-layout-preview";
import {
  DEFAULT_PURCHASE_LAYOUT,
  inheritInvoiceBrandMedia,
  mergeInvoiceLayout,
  mergePurchaseLayout,
  type InvoiceLayout,
  type PurchaseLayout,
} from "@/lib/api/workspace-company";
import { DEFAULT_PRINT_COMPANY } from "@/lib/sales/sales-print";

export const PURCHASE_PRINT_STORAGE_KEY = "againerp:purchase-print";

export type PurchasePrintLine = {
  kind: "product" | "section" | "note" | "service";
  name: string;
  sku?: string;
  /** Serial numbers received for a serial-tracked product; the document shows them in place of the SKU. */
  serialNumbers?: string[];
  quantity: number;
  unitCost: number;
  discountLabel: string;
  taxRate: number;
  amount: number;
};

export type PurchasePrintPayload = {
  heading: string;
  documentNumber: string;
  orderDate: string;
  expectedDate: string;
  buyerName: string;
  referenceNo: string;
  paymentTerms: string;
  warehouseName: string;
  vendorName: string;
  vendorAddress: string;
  vendorPhone: string;
  vendorEmail: string;
  lines: PurchasePrintLine[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  company: InvoicePreviewCompany;
  layout?: PurchaseLayout;
  /** Wording for another kind of purchase document (a purchase return) in place of the layout's order wording. */
  labels?: { number?: string; date?: string; reference?: string; warehouse?: string };
  /** Extra "label / value" cells next to the vendor (a return's reason and status). */
  extraInfo?: { label: string; value: string }[];
  /** A note under the totals. */
  note?: string;
};

export function fallbackPurchasePrintCompany(): InvoicePreviewCompany {
  return {
    name: DEFAULT_PRINT_COMPANY.name,
    legal_name: "",
    logo_url: DEFAULT_PRINT_COMPANY.logoSrc,
    street: DEFAULT_PRINT_COMPANY.street,
    street2: "",
    city: DEFAULT_PRINT_COMPANY.city,
    state: "",
    zip_code: "",
    country: "",
    phone: DEFAULT_PRINT_COMPANY.phone,
    mobile: "",
    email: DEFAULT_PRINT_COMPANY.email,
    website: "",
    tax_id: "",
    invoice_footer: "",
    invoice_prices_include_tax: true,
    tax_enabled: true,
    invoice_tax_rate: 0,
    currency_code: "BDT",
  };
}

export function purchasePrintHeading(status?: string | null, layoutHeading?: string): string {
  if (status === "cancelled") return "Cancelled Purchase Order";
  if (status === "draft") return "Request for Quotation";
  return layoutHeading?.trim() || DEFAULT_PURCHASE_LAYOUT.heading;
}

export function samplePurchasePrintPayload(
  company: InvoicePreviewCompany,
  layout: PurchaseLayout,
  documentNumber: string,
  invoice?: InvoiceLayout | null,
): PurchasePrintPayload {
  const brand = inheritInvoiceBrandMedia(layout, invoice ?? mergeInvoiceLayout(null));
  return {
    heading: layout.heading || "Purchase Order",
    documentNumber,
    orderDate: new Date().toISOString().slice(0, 10),
    expectedDate: new Date().toISOString().slice(0, 10),
    buyerName: "Purchase Officer",
    referenceNo: "VEN-8821",
    paymentTerms: "Net 30",
    warehouseName: "DHK-HQ — Dhaka HQ",
    vendorName: "Sample Supplier",
    vendorAddress: "Kawran Bazar, Dhaka",
    vendorPhone: "+880 1711-000000",
    vendorEmail: "vendor@example.com",
    lines: [
      {
        kind: "product",
        name: "MAONO PD400X USB/XLR Dynamic Microphone",
        sku: "MIC-PD400X",
        quantity: 2,
        unitCost: 12500,
        discountLabel: "5%",
        taxRate: 0,
        amount: 23750,
      },
      {
        kind: "product",
        name: "USB-C Cable 1m",
        sku: "CB-USB",
        quantity: 4,
        unitCost: 220,
        discountLabel: "",
        taxRate: 0,
        amount: 880,
      },
    ],
    subtotal: 24630,
    discount: 1250,
    tax: 0,
    total: 24630,
    company,
    layout: mergePurchaseLayout({
      ...layout,
      logo_url: brand.logo_url,
      authorised_signature_url: brand.authorised_signature_url,
      show_logo: brand.show_logo,
      show_authorised_signature: brand.show_authorised_signature,
    }),
  };
}

export function storePurchasePrintPayload(payload: PurchasePrintPayload): string {
  if (typeof window === "undefined") return "";
  const printKey = `${PURCHASE_PRINT_STORAGE_KEY}:${Date.now()}`;
  const serialized = JSON.stringify(payload);
  localStorage.setItem(printKey, serialized);
  localStorage.setItem(PURCHASE_PRINT_STORAGE_KEY, printKey);
  try {
    sessionStorage.setItem(PURCHASE_PRINT_STORAGE_KEY, serialized);
  } catch {
    /* ignore quota / private mode */
  }
  return printKey;
}

export function readPurchasePrintPayload(printKey?: string | null): PurchasePrintPayload | null {
  if (typeof window === "undefined") return null;
  const pointerKey = printKey || localStorage.getItem(PURCHASE_PRINT_STORAGE_KEY);
  const candidates: string[] = [];
  if (pointerKey) {
    if (pointerKey.startsWith("{")) candidates.push(pointerKey);
    else {
      const blob = localStorage.getItem(pointerKey);
      if (blob) candidates.push(blob);
    }
  }
  try {
    const fromSession = sessionStorage.getItem(PURCHASE_PRINT_STORAGE_KEY);
    if (fromSession) candidates.push(fromSession);
  } catch {
    /* ignore */
  }
  for (const raw of candidates) {
    try {
      const parsed = JSON.parse(raw) as PurchasePrintPayload;
      if (parsed?.documentNumber != null && Array.isArray(parsed.lines)) return parsed;
    } catch {
      /* try next */
    }
  }
  return null;
}

export function purchasePrintPath(printKey?: string): string {
  if (!printKey) return "/purchase/print";
  return `/purchase/print?k=${encodeURIComponent(printKey)}`;
}
