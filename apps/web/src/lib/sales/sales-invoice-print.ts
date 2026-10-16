import {
  DEFAULT_INVOICE_LAYOUT,
  companyTaxesEnabled,
  mergeInvoiceLayout,
  type WorkspaceCompany,
} from "@/lib/api/workspace-company";
import type {
  InvoiceDocumentData,
  InvoicePreviewCompany,
} from "@/components/workspace/invoice-layout-preview";
import type { SalesPrintPayload } from "@/lib/sales/sales-print";
import { formatPostalAddress } from "@/lib/sales/sales-partner-address";

export function workspaceCompanyToInvoicePreview(row: WorkspaceCompany): InvoicePreviewCompany {
  return {
    name: row.name ?? "",
    legal_name: row.legal_name ?? "",
    logo_url: row.logo_url ?? "",
    street: row.street ?? "",
    street2: row.street2 ?? "",
    city: row.city ?? "",
    state: row.state ?? "",
    zip_code: row.zip_code ?? "",
    country: row.country ?? "",
    phone: row.phone ?? "",
    mobile: row.mobile ?? "",
    email: row.email ?? "",
    website: row.website ?? "",
    tax_id: row.tax_id ?? "",
    invoice_footer: row.invoice_footer ?? "",
    invoice_prices_include_tax: row.invoice_prices_include_tax !== false,
    tax_enabled: row.tax_enabled !== false,
    invoice_tax_rate: Number(row.invoice_tax_rate ?? 0) || 0,
    currency_code: row.currency_code || "BDT",
  };
}

export function attachSalesInvoicePrint(
  payload: SalesPrintPayload,
  company: WorkspaceCompany,
  extras: {
    invoiceNumber?: string | null;
    issuedAt?: string | null;
    paid?: number;
    payments?: { method: string; amount: number }[];
    previousBalance?: number | null;
  },
): SalesPrintPayload {
  const invoiceNumber =
    extras.invoiceNumber?.trim() ||
    company.invoice_next_preview ||
    payload.documentNumber;
  const document: InvoiceDocumentData = {
    invoiceNumber,
    issuedAt: extras.issuedAt || payload.orderDate,
    customer: {
      name: payload.customerName,
      address: formatPostalAddress(payload.invoiceAddress),
      mobile: payload.customerPhone,
      email: payload.customerEmail,
    },
    lines: payload.lines.map((line) => ({
      name: line.name,
      sku: line.sku,
      description: line.description,
      qty: line.quantity,
      unitPrice: line.unitPrice,
      discount: line.discountAmount || 0,
      serialNumbers: line.serialNumbers,
    })),
    // Order-level amounts so the invoice totals match the drawer, not just the lines.
    orderDiscount: payload.orderDiscountAmount ?? 0,
    shipping: payload.shippingAmount ?? 0,
    additionalExpenses: payload.additionalExpenses ?? [],
    returned: payload.returnedAmount ?? 0,
    tax: payload.taxAmount,
    taxRate: payload.taxRate ?? null,
    paid: extras.paid ?? payload.paidAmount ?? 0,
    previousBalance:
      extras.previousBalance ??
      (payload.previousDueAmount && payload.previousDueAmount > 0
        ? payload.previousDueAmount
        : null),
    payments: extras.payments,
  };
  const layout = mergeInvoiceLayout(company.invoice_layout ?? DEFAULT_INVOICE_LAYOUT);
  return {
    ...payload,
    documentLabel: "Invoice",
    documentNumber: invoiceNumber,
    invoicePrint: {
      company: workspaceCompanyToInvoicePreview(company),
      layout: { ...layout, show_tax: layout.show_tax && companyTaxesEnabled(company) },
      document,
    },
  };
}
