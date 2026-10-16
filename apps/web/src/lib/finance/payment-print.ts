import type { InvoicePreviewCompany } from "@/components/workspace/invoice-layout-preview";
import {
  DEFAULT_PAYMENT_LAYOUT,
  inheritInvoiceBrandMedia,
  mergeInvoiceLayout,
  mergePaymentLayout,
  type InvoiceLayout,
  type PaymentLayout,
} from "@/lib/api/workspace-company";
import { DEFAULT_PRINT_COMPANY } from "@/lib/sales/sales-print";

export type PaymentPrintInvoice = {
  date: string;
  number: string;
  reference: string;
  amount: number;
  due: number;
};

export type PaymentPrintPayload = {
  heading: string;
  documentNumber: string;
  paymentDate: string;
  partnerName: string;
  partnerAddress: string;
  method: string;
  memo: string;
  amount: number;
  invoices: PaymentPrintInvoice[];
  company: InvoicePreviewCompany;
  layout?: PaymentLayout;
};

export function fallbackPaymentPrintCompany(): InvoicePreviewCompany {
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

export function samplePaymentPrintPayload(
  company: InvoicePreviewCompany,
  layout: PaymentLayout,
  documentNumber: string,
  invoice?: InvoiceLayout | null,
): PaymentPrintPayload {
  const brand = inheritInvoiceBrandMedia(layout, invoice ?? mergeInvoiceLayout(null));
  return {
    heading: layout.heading || "Payment Slip",
    documentNumber,
    paymentDate: new Date().toISOString().slice(0, 10),
    partnerName: "Sample Customer",
    partnerAddress: "Gulshan 2, Dhaka",
    method: "Bank Transfer",
    memo: "INV-1008, INV-1012",
    amount: 18500,
    invoices: [
      {
        date: new Date().toISOString().slice(0, 10),
        number: "INV-1008",
        reference: "SO-1001",
        amount: 12000,
        due: 0,
      },
      {
        date: new Date().toISOString().slice(0, 10),
        number: "INV-1012",
        reference: "SO-1004",
        amount: 8500,
        due: 2000,
      },
    ],
    company,
    layout: mergePaymentLayout({
      ...layout,
      logo_url: brand.logo_url,
      authorised_signature_url: brand.authorised_signature_url,
      show_logo: brand.show_logo,
      show_authorised_signature: brand.show_authorised_signature,
    }),
  };
}

export { DEFAULT_PAYMENT_LAYOUT };
