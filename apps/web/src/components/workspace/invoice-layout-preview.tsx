"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  amountWithSymbol,
  findCurrency,
  type CurrencyOption,
} from "@/lib/localisation/currency-options";
import { publicMediaUrl } from "@/lib/media/public-media-url";
import { formatPrintDate } from "@/lib/sales/sales-print";
import type { InvoiceLayout, PackingLayout, PaymentLayout, PurchaseLayout } from "@/lib/api/workspace-company";
import { inheritInvoiceBrandMedia } from "@/lib/api/workspace-company";
import { companyTaxRatePct, companyTaxesEnabled } from "@/lib/api/workspace-company";
import { DEFAULT_INVOICE_LAYOUT } from "@/lib/api/workspace-company";
import { PurchaseOrderPrintDocument } from "@/components/purchase/purchase-order-print-document";
import { samplePurchasePrintPayload } from "@/lib/purchase/purchase-print";
import { PaymentSlipPrintDocument } from "@/components/finance/payment-slip-print-document";
import { samplePaymentPrintPayload } from "@/lib/finance/payment-print";
import { cn, formatTime } from "@/lib/utils";

export type InvoicePreviewCompany = {
  name: string;
  legal_name: string;
  logo_url: string;
  street: string;
  street2: string;
  city: string;
  state: string;
  zip_code: string;
  country: string;
  phone: string;
  mobile: string;
  email: string;
  website: string;
  tax_id: string;
  invoice_footer: string;
  invoice_prices_include_tax: boolean;
  tax_enabled?: boolean;
  invoice_tax_rate?: number;
  currency_code: string;
};

export type InvoiceDocumentLine = {
  name: string;
  sku?: string;
  brand?: string;
  category?: string;
  description?: string;
  warranty?: string;
  serial?: string;
  /** Sold units' serial numbers (invoice); `serial` above is the packing-slip lot field. */
  serialNumbers?: string[];
  qty: number;
  ordered?: number;
  delivered?: number;
  unitPrice: number;
  discount: number;
};

export type InvoiceDocumentCustomer = {
  name: string;
  address?: string;
  mobile?: string;
  email?: string;
};

export type InvoiceDocumentPayment = {
  method: string;
  amount: number;
};

export type InvoiceDocumentData = {
  invoiceNumber: string;
  issuedAt?: string;
  origin?: string;
  shippingDate?: string;
  customer: InvoiceDocumentCustomer;
  lines: InvoiceDocumentLine[];
  /** Order-level discount on top of the per-line discounts already netted into each line. */
  orderDiscount?: number;
  shipping?: number;
  additionalExpenses?: { title: string; amount: number }[];
  /** Credited returns netted off the total. */
  returned?: number;
  /** Tax actually charged on the document. When set it replaces the company-rate estimate. */
  tax?: number;
  /** Single rate shared by the taxed lines, for the label; null when mixed. */
  taxRate?: number | null;
  paid?: number;
  previousBalance?: number | null;
  payments?: InvoiceDocumentPayment[];
};

type Props = {
  company: InvoicePreviewCompany;
  layout: InvoiceLayout;
  packing?: PackingLayout;
  purchase?: PurchaseLayout;
  payment?: PaymentLayout;
  kind?: "invoice" | "packing" | "purchase" | "payment";
  invoiceNumber?: string;
  document?: InvoiceDocumentData;
};

const SAMPLE_CUSTOMER = {
  name: "Sample Customer",
  mobile: "+880 1711-000000",
  email: "customer@example.com",
};

const SAMPLE_LINES = [
  {
    name: "Cotton T-Shirt",
    sku: "TS-001",
    brand: "Again",
    category: "Apparel",
    description: "Round neck, size M",
    qty: 2,
    unitPrice: 850,
    discount: 0,
  },
  {
    name: "USB-C Cable 1m",
    sku: "CB-USB",
    brand: "Generic",
    category: "Accessories",
    description: "Fast charge, 60W",
    qty: 1,
    unitPrice: 220,
    discount: 0,
  },
];

const SAMPLE_PAID = 1000;
const SAMPLE_PREVIOUS = 250;
const SAMPLE_ORDER_DISCOUNT = 50;

function money(value: number, currency: CurrencyOption): string {
  return amountWithSymbol(value, currency);
}

/** Quantities on the document: "3", "1.5", "2.25" — no forced ".00". */
function compactQty(value: number): string {
  const n = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("en-BD", { maximumFractionDigits: 2 }).format(n);
}

function productCell(line: InvoiceDocumentLine, layout: InvoiceLayout): string {
  const bits = [line.name];
  // a serial product shows its serial numbers (the S/N line under the name) instead of the SKU
  if (layout.show_sku && line.sku && !line.serialNumbers?.length) bits.push(line.sku);
  if (layout.show_brand && line.brand) bits.push(line.brand);
  if (layout.show_category && line.category) bits.push(line.category);
  return bits.join(" · ");
}

function packingToInvoiceLayout(packing: PackingLayout, invoice: InvoiceLayout): InvoiceLayout {
  const brand = inheritInvoiceBrandMedia(packing, invoice);
  return {
    ...DEFAULT_INVOICE_LAYOUT,
    heading: packing.heading,
    number_label: packing.number_label,
    date_label: packing.date_label,
    product_label: packing.product_label,
    show_time: packing.show_time,
    show_sku: packing.show_sku,
    show_brand: packing.show_brand,
    show_category: packing.show_category,
    show_description: packing.show_description,
    show_logo: brand.show_logo,
    show_business_name: packing.show_business_name,
    show_company_name: packing.show_company_name,
    show_legal_name: packing.show_legal_name,
    show_location: packing.show_location,
    show_street: packing.show_street,
    show_landmark: packing.show_landmark,
    show_city: packing.show_city,
    show_state: packing.show_state,
    show_zip: packing.show_zip,
    show_country: packing.show_country,
    show_phone: packing.show_phone,
    show_mobile: packing.show_mobile,
    show_email: packing.show_email,
    show_website: packing.show_website,
    show_bin: packing.show_bin,
    show_customer: packing.show_customer,
    show_warranty: packing.show_warranty,
    show_customer_signature: packing.show_customer_signature,
    show_authorised_signature: brand.show_authorised_signature,
    customer_signature_label: packing.customer_signature_label,
    authorised_signature_label: packing.authorised_signature_label,
    logo_url: brand.logo_url,
    customer_signature_url: packing.customer_signature_url,
    authorised_signature_url: brand.authorised_signature_url,
  };
}

function sampleDocument(invoiceNumber: string, packing?: boolean): InvoiceDocumentData {
  return {
    invoiceNumber,
    origin: "SO-1001",
    shippingDate: new Date().toISOString(),
    customer: SAMPLE_CUSTOMER,
    lines: SAMPLE_LINES.map((line, idx) => ({
      ...line,
      ordered: line.qty,
      delivered: line.qty,
      serial: idx === 0 ? "SN-4418" : undefined,
    })),
    orderDiscount: packing ? 0 : SAMPLE_ORDER_DISCOUNT,
    paid: packing ? 0 : SAMPLE_PAID,
    previousBalance: packing ? null : SAMPLE_PREVIOUS,
    payments: packing ? [] : [{ method: "Cash", amount: SAMPLE_PAID }],
  };
}

function formatInvoiceWhen(showTime: boolean, issuedAt?: string): string {
  const now = issuedAt ? new Date(issuedAt.length > 10 ? issuedAt : `${issuedAt}T12:00:00`) : new Date();
  const date = formatPrintDate(now.toISOString());
  if (!showTime) return date;
  const time = formatTime(now);
  return `${date} ${time}`;
}

/** Same-origin /uploads URLs — query so a prior 404 does not stick in the img cache. */
function invoiceMediaSrc(url: string): string {
  const src = publicMediaUrl(url);
  if (!src) return "";
  if (src.startsWith("/") && !src.includes("?")) return `${src}?v=3`;
  return src;
}

function footerNoteLines(raw: string): string[] {
  return raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function InvoiceLayoutPreviewDocument({
  company,
  layout,
  packing,
  kind = "invoice",
  invoiceNumber,
  document,
}: Props) {
  const isPacking = kind === "packing";
  const view = isPacking && packing ? packingToInvoiceLayout(packing, layout) : layout;
  const currency =
    findCurrency(company.currency_code) ??
    ({ code: company.currency_code || "BDT", name: company.currency_code || "BDT", symbol: "৳", position: "before" } satisfies CurrencyOption);
  const slim = view.design === "slim" || view.design === "compact";
  const elegant = view.design === "elegant";
  const doc = document ?? sampleDocument(invoiceNumber || "0001", isPacking);
  const lines = doc.lines.map((line) => {
    const gross = line.qty * line.unitPrice;
    const subtotal = Math.max(0, gross - line.discount);
    return { ...line, subtotal };
  });
  const subtotal = lines.reduce((sum, line) => sum + line.subtotal, 0);
  // Line discounts are already inside each line's subtotal; the Discount row
  // carries the order-level one so Subtotal − Discount + … adds up to Total.
  const discount = Math.max(0, doc.orderDiscount ?? 0);
  const shipping = Math.max(0, doc.shipping ?? 0);
  const expenses = (doc.additionalExpenses ?? []).filter((e) => (e.amount || 0) !== 0);
  const expensesTotal = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const returned = Math.max(0, doc.returned ?? 0);
  const taxOn = companyTaxesEnabled(company) && view.show_tax;
  // A real document carries its own tax; the sample estimates from the company rate.
  const hasDocTax = doc.tax != null;
  const taxRate = hasDocTax ? Math.max(0, doc.taxRate ?? 0) : companyTaxRatePct(company);
  const tax = hasDocTax
    ? Math.max(0, doc.tax ?? 0)
    : !taxOn || company.invoice_prices_include_tax || taxRate <= 0
      ? 0
      : Math.round(subtotal * (taxRate / 100));
  const showTaxRow = hasDocTax ? taxOn && tax > 0 : taxOn;
  const taxLabel = `${view.tax_label || "Tax"}${hasDocTax && taxRate > 0 ? ` (${taxRate}%)` : ""}`;
  const total = Math.max(0, subtotal - discount + tax + shipping + expensesTotal - returned);
  const paid = Math.max(0, doc.paid ?? 0);
  const due = Math.max(0, total - paid);
  const refundDue = Math.max(0, paid - total);
  const payments = doc.payments?.length
    ? doc.payments
    : paid > 0
      ? [{ method: "Payment", amount: paid }]
      : [];
  const previousBalance = doc.previousBalance ?? null;
  const customer = doc.customer;
  const logoSrc = view.show_logo
    ? invoiceMediaSrc(view.logo_url || company.logo_url)
    : "";
  const customerSignSrc = invoiceMediaSrc(view.customer_signature_url || "");
  const authorisedSignSrc = invoiceMediaSrc(view.authorised_signature_url || "");
  const locationName = company.city.trim() || "Head Office";
  const companyName = company.name.trim();
  const legalName = company.legal_name.trim();
  const showCompanyName = Boolean(view.show_company_name || (!view.show_legal_name && view.show_business_name));
  const showLegalName = Boolean(view.show_legal_name);
  const addressBits = [
    view.show_street !== false ? company.street.trim() : "",
    view.show_landmark ? company.street2.trim() : "",
    [
      view.show_city ? company.city.trim() : "",
      view.show_state ? company.state.trim() : "",
      view.show_zip ? company.zip_code.trim() : "",
    ]
      .filter(Boolean)
      .join(" "),
    view.show_country ? company.country.trim() : "",
  ].filter(Boolean);
  const phone = company.phone.trim();
  const mobile = company.mobile.trim();
  const website = (company.website || "").trim();
  const footerNotes = footerNoteLines((isPacking ? packing?.footer : company.invoice_footer) || "");
  const showCustomerSign = view.show_customer_signature !== false;
  const showAuthorisedSign = view.show_authorised_signature !== false;
  const heading = view.heading || (isPacking ? "Chalan" : "Invoice");
  const docDate = isPacking ? doc.shippingDate || doc.issuedAt : doc.issuedAt;

  return (
    <article
      className={cn(
        "invoice-print-doc mx-auto max-w-[820px] bg-white text-[#212529] shadow-sm",
        slim ? "px-6 py-5 text-[12px]" : elegant ? "px-12 py-10 text-[13px]" : "px-10 py-8 text-[13px]",
        "leading-snug print:max-w-none print:px-8 print:py-6 print:shadow-none",
      )}
    >
      <header className="mb-6 flex items-start justify-between gap-8 border-b-2 border-[#00a09d] pb-5">
        <div className="min-w-0">
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoSrc}
              alt={companyName || legalName || "Company"}
              className="mb-2 h-9 w-auto max-w-[180px] object-contain object-left"
            />
          ) : null}
          {showCompanyName && companyName ? (
            <p className="text-[15px] font-bold text-[#00a09d]">{companyName}</p>
          ) : null}
          {showLegalName && legalName ? (
            <p
              className={cn(
                "font-semibold",
                showCompanyName ? "text-[12px]" : "text-[15px] text-[#00a09d]",
              )}
            >
              {legalName}
            </p>
          ) : null}
          {view.show_location ? (
            <p
              className={cn(
                "font-semibold",
                showCompanyName || showLegalName ? "text-[12px]" : "text-[15px] text-[#00a09d]",
              )}
            >
              {locationName}
            </p>
          ) : null}
          {addressBits.map((line) => (
            <p key={line} className="text-[11px] text-[#495057]">
              {line}
            </p>
          ))}
          {view.show_phone && phone ? <p className="text-[11px] text-[#495057]">{phone}</p> : null}
          {view.show_mobile && mobile ? <p className="text-[11px] text-[#495057]">{mobile}</p> : null}
          {view.show_email && company.email.trim() ? (
            <p className="text-[11px] text-[#495057]">{company.email.trim()}</p>
          ) : null}
          {view.show_website && website ? (
            <p className="text-[11px] text-[#495057]">{website}</p>
          ) : null}
          {view.show_bin && company.tax_id.trim() ? (
            <p className="text-[11px] text-[#495057]">BIN {company.tax_id.trim()}</p>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#00a09d]">
            {heading}
          </p>
          <p className="mt-1 text-[18px] font-bold leading-none">{heading}</p>
          <p className="mt-2 text-[11px] text-[#495057]">
            {view.number_label || (isPacking ? "Chalan No." : "Invoice No.")} {doc.invoiceNumber}
          </p>
          {isPacking && packing?.show_shipping_date === false ? null : (
            <p className="text-[11px] text-[#495057]">
              {view.date_label || (isPacking ? "Shipping Date" : "Date")}{" "}
              {formatInvoiceWhen(view.show_time, docDate)}
            </p>
          )}
        </div>
      </header>

      {isPacking && packing && (packing.show_order !== false || packing.show_shipping_date !== false) && doc.origin ? (
        <div className="mb-5 grid grid-cols-2 gap-4 text-[12px] sm:grid-cols-3">
          {packing.show_order !== false && doc.origin ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6c757d]">
                {packing.order_label || "Order"}
              </p>
              <p className="mt-0.5 font-medium">{doc.origin}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {view.show_customer ? (
        <section className="mb-5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6c757d]">
            {isPacking ? "Delivery Address" : view.customer_label || "Customer"}
          </p>
          <p className="mt-0.5 text-[15px] font-bold">{customer.name}</p>
          {view.show_mobile && customer.mobile ? <p className="text-[11px] text-[#495057]">{customer.mobile}</p> : null}
          {customer.address ? <p className="text-[11px] text-[#495057]">{customer.address}</p> : null}
          {view.show_email && customer.email ? <p className="text-[11px] text-[#495057]">{customer.email}</p> : null}
        </section>
      ) : null}

      <table className="mb-0 w-full border-collapse text-[12px]">
        <thead>
          <tr className="bg-[#e8f4f3] text-left">
            <th className="border-b-2 border-[#00a09d] px-2 py-1.5 font-semibold">
              {view.product_label || "Product"}
            </th>
            {isPacking ? (
              <>
                {packing?.show_ordered !== false ? (
                  <th className="border-b-2 border-[#00a09d] px-2 py-1.5 text-right font-semibold">
                    {packing?.ordered_label || "Ordered"}
                  </th>
                ) : null}
                {packing?.show_delivered !== false ? (
                  <th className="border-b-2 border-[#00a09d] px-2 py-1.5 text-right font-semibold">
                    {packing?.delivered_label || "Delivered"}
                  </th>
                ) : null}
              </>
            ) : (
              <>
                <th className="border-b-2 border-[#00a09d] px-2 py-1.5 text-right font-semibold">
                  {view.qty_label || "Quantity"}
                </th>
                <th className="border-b-2 border-[#00a09d] px-2 py-1.5 text-right font-semibold">
                  {view.unit_price_label || "Unit Price"}
                </th>
                <th className="border-b-2 border-[#00a09d] px-2 py-1.5 text-right font-semibold">
                  {view.line_subtotal_label || "Subtotal"}
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {lines.map((line, idx) => (
            <tr key={`${line.sku || line.name}-${idx}`} className="align-top">
              <td className="border-b border-[#e9ecef] px-2 py-2">
                <p className="font-medium">{productCell(line, view)}</p>
                {view.show_description && line.description ? (
                  <p className="mt-0.5 text-[11px] text-[#6c757d]">{line.description}</p>
                ) : null}
                {view.show_warranty && line.warranty ? (
                  <p className="mt-0.5 text-[10px] text-[#6c757d]">Warranty: {line.warranty}</p>
                ) : null}
                {line.serialNumbers?.length ? (
                  <p className="mt-0.5 whitespace-normal break-all font-mono text-[10px] text-[#6c757d]">
                    S/N: {line.serialNumbers.join(", ")}
                  </p>
                ) : null}
                {isPacking && packing?.show_serial && line.serial ? (
                  <p className="mt-0.5 text-[10px] text-[#6c757d]">Lot/Serial: {line.serial}</p>
                ) : null}
              </td>
              {isPacking ? (
                <>
                  {packing?.show_ordered !== false ? (
                    <td className="border-b border-[#e9ecef] px-2 py-2 text-right tabular-nums">
                      {compactQty(line.ordered ?? line.qty)}
                    </td>
                  ) : null}
                  {packing?.show_delivered !== false ? (
                    <td className="border-b border-[#e9ecef] px-2 py-2 text-right tabular-nums">
                      {compactQty(line.delivered ?? line.qty)}
                    </td>
                  ) : null}
                </>
              ) : (
                <>
                  <td className="border-b border-[#e9ecef] px-2 py-2 text-right tabular-nums">{compactQty(line.qty)}</td>
                  <td className="border-b border-[#e9ecef] px-2 py-2 text-right tabular-nums">
                    {money(line.unitPrice, currency)}
                  </td>
                  <td className="border-b border-[#e9ecef] px-2 py-2 text-right tabular-nums">
                    {money(line.subtotal, currency)}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {isPacking ? null : (
      <div className="mt-3 grid items-start gap-6 sm:grid-cols-[1fr_280px]">
        <div className="min-w-0 space-y-3">
          {view.show_payments && payments.length ? (
            <section>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#6c757d]">Payments</p>
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="bg-[#e8f4f3] text-left">
                    <th className="border-b border-[#00a09d] px-2 py-1 font-semibold">Method</th>
                    <th className="border-b border-[#00a09d] px-2 py-1 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((row) => (
                    <tr key={`${row.method}-${row.amount}`}>
                      <td className="px-2 py-1">{row.method}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{money(row.amount, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}
          {view.show_previous_balance && previousBalance != null ? (
            <p className="text-[11px] text-[#495057]">Previous balance: {money(previousBalance, currency)}</p>
          ) : null}
        </div>
        <div className="w-full space-y-1 text-[12px]">
          <TotalRow label={view.subtotal_label || "Subtotal"} value={money(subtotal, currency)} />
          <TotalRow label={view.discount_label || "Discount"} value={money(discount, currency)} />
          {showTaxRow ? (
            <TotalRow
              label={taxLabel}
              value={
                !hasDocTax && company.invoice_prices_include_tax && tax === 0
                  ? taxRate > 0
                    ? `Included (${taxRate}%)`
                    : "Included"
                  : money(tax, currency)
              }
            />
          ) : null}
          {shipping > 0 ? <TotalRow label="Shipping" value={money(shipping, currency)} /> : null}
          {expenses.map((e, idx) => (
            <TotalRow
              key={`${idx}-${e.title}`}
              label={e.title || "Additional expense"}
              value={money(e.amount || 0, currency)}
            />
          ))}
          {returned > 0 ? <TotalRow label="Returned" value={`−${money(returned, currency)}`} /> : null}
          <TotalRow label={view.total_label || "Total"} value={money(total, currency)} strong />
          {view.show_payments ? (
            <TotalRow label={view.paid_label || "Total Paid"} value={money(paid, currency)} />
          ) : null}
          <TotalRow label={view.due_label || "Total Due"} value={money(due, currency)} strong />
          {refundDue > 0 ? <TotalRow label="Refund Due" value={money(refundDue, currency)} /> : null}
        </div>
      </div>
      )}

      {showCustomerSign || showAuthorisedSign || footerNotes.length ? (
        <footer className="mt-10">
          {showCustomerSign || showAuthorisedSign ? (
            <div className="grid grid-cols-2 items-start gap-8 text-[12px] text-[#212529]">
              {showCustomerSign ? (
                <SignatureBlock
                  label={view.customer_signature_label || "Customer Signature"}
                  imageUrl={customerSignSrc}
                />
              ) : (
                <div />
              )}
              {showAuthorisedSign ? (
                <SignatureBlock
                  label={view.authorised_signature_label || "Authorised Signature"}
                  imageUrl={authorisedSignSrc}
                  align="right"
                />
              ) : (
                <div />
              )}
            </div>
          ) : null}
          {footerNotes.length ? (
            <div
              className={cn(
                "space-y-1 text-center text-[11px] text-[#495057]",
                showCustomerSign || showAuthorisedSign
                  ? "mt-8 border-t border-[#dee2e6] pt-3"
                  : "mt-2",
              )}
            >
              {footerNotes.map((line, idx) => (
                <p key={`${idx}-${line}`}>{line}</p>
              ))}
            </div>
          ) : null}
        </footer>
      ) : null}
    </article>
  );
}

function SignatureBlock({
  label,
  imageUrl,
  align,
}: {
  label: string;
  imageUrl: string;
  align?: "left" | "right";
}) {
  return (
    <div className={cn("min-w-0", align === "right" && "text-right")}>
      <div
        className={cn(
          "mb-2 flex min-h-[88px] items-end",
          align === "right" ? "justify-end" : "justify-start",
        )}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={label}
            className="h-16 w-auto max-w-[160px] object-contain"
          />
        ) : null}
      </div>
      <p className="font-semibold">{label}</p>
    </div>
  );
}

function TotalRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-6 border-t border-[#212529] pt-1.5",
        strong && "text-[15px] font-bold",
      )}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

export function InvoiceLayoutPreviewOverlay({
  company,
  layout,
  packing,
  purchase,
  payment,
  kind = "invoice",
  invoiceNumber,
  onClose,
}: Props & { onClose: () => void }) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    const frame = window.requestAnimationFrame(() => setReady(true));
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return createPortal(
    <div
      data-invoice-print-overlay
      className="fixed inset-0 z-[250] flex flex-col bg-[#ececec] dark:bg-background"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="print-hide flex shrink-0 items-center justify-between border-b border-border bg-background px-4 py-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-none"
          onClick={() => onCloseRef.current()}
        >
          <X className="mr-2 h-4 w-4" />
          Close
        </Button>
        <p className="hidden text-xs text-muted-foreground sm:block">
          Sample{" "}
          {kind === "packing"
            ? "packing slip"
            : kind === "purchase"
              ? "purchase order"
              : kind === "payment"
                ? "payment slip"
                : "invoice"}{" "}
          — labels and show options from this setup
        </p>
        <Button
          type="button"
          size="sm"
          className="rounded-none"
          disabled={!ready}
          onClick={() => window.print()}
        >
          <Printer className="mr-2 h-4 w-4" />
          Print / PDF
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 print:overflow-visible print:p-0 sm:p-6">
        <div id="invoice-print-area" className="mx-auto max-w-[820px]">
          {ready ? (
            kind === "purchase" && purchase ? (
              <div id="purchase-print-area">
                <PurchaseOrderPrintDocument
                  data={samplePurchasePrintPayload(company, purchase, invoiceNumber || "PO0001", layout)}
                />
              </div>
            ) : kind === "payment" && payment ? (
              <div id="payment-print-area">
                <PaymentSlipPrintDocument
                  data={samplePaymentPrintPayload(company, payment, invoiceNumber || "PAY0001", layout)}
                />
              </div>
            ) : (
              <InvoiceLayoutPreviewDocument
                company={company}
                layout={layout}
                packing={packing}
                kind={kind === "packing" ? "packing" : "invoice"}
                invoiceNumber={invoiceNumber}
              />
            )
          ) : (
            <div className="bg-white px-10 py-16 text-center text-sm text-[#6c757d]">
              Preparing{" "}
              {kind === "packing"
                ? "packing slip"
                : kind === "purchase"
                  ? "purchase order"
                  : kind === "payment"
                    ? "payment slip"
                    : "invoice"}
              …
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function InvoicePreviewButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" size="sm" variant="outline" className="h-7 rounded-none" onClick={onClick}>
      <Eye className="mr-1.5 h-3.5 w-3.5" />
      Preview
    </Button>
  );
}
