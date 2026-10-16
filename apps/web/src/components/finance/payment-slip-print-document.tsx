"use client";

import type { InvoicePreviewCompany } from "@/components/workspace/invoice-layout-preview";
import {
  amountWithSymbol,
  findCurrency,
  type CurrencyOption,
} from "@/lib/localisation/currency-options";
import { publicMediaUrl } from "@/lib/media/public-media-url";
import {
  DEFAULT_PAYMENT_LAYOUT,
  mergePaymentLayout,
  type PaymentLayout,
} from "@/lib/api/workspace-company";
import type { PaymentPrintPayload } from "@/lib/finance/payment-print";
import { formatPrintDate } from "@/lib/sales/sales-print";
import { cn, formatTime } from "@/lib/utils";

type Props = {
  data: PaymentPrintPayload;
};

function money(value: number, currency: CurrencyOption): string {
  return amountWithSymbol(value, currency);
}

function mediaSrc(url: string): string {
  const src = publicMediaUrl(url);
  if (!src) return "";
  if (src.startsWith("/") && !src.includes("?")) return `${src}?v=1`;
  return src;
}

function footerNoteLines(raw: string): string[] {
  return raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function CompanyLetterhead({
  company,
  layout,
}: {
  company: InvoicePreviewCompany;
  layout: PaymentLayout;
}) {
  const logoSrc = layout.show_logo ? mediaSrc(layout.logo_url || company.logo_url) : "";
  const name = company.name.trim();
  const legal = company.legal_name.trim();
  const showCompany = Boolean(layout.show_company_name || layout.show_business_name);
  const showLegal = Boolean(layout.show_legal_name);
  const locationName = company.city.trim() || "Head Office";
  const addressBits = [
    layout.show_street !== false ? company.street.trim() : "",
    layout.show_landmark ? company.street2.trim() : "",
    [layout.show_city ? company.city.trim() : "", layout.show_state ? company.state.trim() : "", layout.show_zip ? company.zip_code.trim() : ""]
      .filter(Boolean)
      .join(" "),
    layout.show_country ? company.country.trim() : "",
  ].filter(Boolean);
  return (
    <div className="min-w-0">
      {logoSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoSrc}
          alt={name || legal || "Company"}
          className="mb-2 h-9 w-auto max-w-[180px] object-contain object-left"
        />
      ) : null}
      {showCompany && name ? <p className="text-[15px] font-bold text-[#00a09d]">{name}</p> : null}
      {showLegal && legal ? (
        <p className={cn("font-semibold", showCompany ? "text-[12px]" : "text-[15px] text-[#00a09d]")}>{legal}</p>
      ) : null}
      {layout.show_location ? (
        <p className={cn("font-semibold", showCompany || showLegal ? "text-[12px]" : "text-[15px] text-[#00a09d]")}>
          {locationName}
        </p>
      ) : null}
      {addressBits.map((line) => (
        <p key={line} className="text-[11px] text-[#495057]">
          {line}
        </p>
      ))}
      {layout.show_phone && company.phone.trim() ? (
        <p className="text-[11px] text-[#495057]">{company.phone.trim()}</p>
      ) : null}
      {layout.show_mobile && company.mobile.trim() ? (
        <p className="text-[11px] text-[#495057]">{company.mobile.trim()}</p>
      ) : null}
      {layout.show_email && company.email.trim() ? (
        <p className="text-[11px] text-[#495057]">{company.email.trim()}</p>
      ) : null}
      {layout.show_website && company.website.trim() ? (
        <p className="text-[11px] text-[#495057]">{company.website.trim()}</p>
      ) : null}
      {layout.show_bin && company.tax_id.trim() ? (
        <p className="text-[11px] text-[#495057]">BIN {company.tax_id.trim()}</p>
      ) : null}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null;
  return (
    <div className="flex gap-2">
      <span className="shrink-0 text-[#6c757d]">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
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
      <div className={cn("mb-2 flex min-h-[88px] items-end", align === "right" ? "justify-end" : "justify-start")}>
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={label} className="h-16 w-auto max-w-[160px] object-contain" />
        ) : null}
      </div>
      <p className="font-semibold">{label}</p>
    </div>
  );
}

export function PaymentSlipPrintDocument({ data }: Props) {
  const layout = mergePaymentLayout(data.layout ?? DEFAULT_PAYMENT_LAYOUT);
  const currency =
    findCurrency(data.company.currency_code) ??
    ({
      code: data.company.currency_code || "BDT",
      name: data.company.currency_code || "BDT",
      symbol: "৳",
      position: "before",
    } satisfies CurrencyOption);
  const heading = data.heading || layout.heading || "Payment Slip";
  const footerNotes = footerNoteLines(layout.footer || "");
  const showCustomerSign = layout.show_customer_signature !== false;
  const showAuthorisedSign = layout.show_authorised_signature !== false;
  const customerSignSrc = mediaSrc(layout.customer_signature_url || "");
  const authorisedSignSrc = mediaSrc(layout.authorised_signature_url || "");
  const dateValue = data.paymentDate
    ? `${formatPrintDate(data.paymentDate)}${
        layout.show_time
          ? ` ${formatTime(`${data.paymentDate}T12:00:00`)}`
          : ""
      }`
    : "";

  return (
    <article
      className={cn(
        "payment-print-doc mx-auto max-w-[820px] bg-white px-10 py-8 text-[13px] leading-snug text-[#212529] shadow-sm",
        "print:max-w-none print:px-8 print:py-6 print:shadow-none",
      )}
    >
      <header className="mb-6 flex items-start justify-between gap-8 border-b-2 border-[#00a09d] pb-5">
        <CompanyLetterhead company={data.company} layout={layout} />
        <div className="shrink-0 text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#00a09d]">{heading}</p>
          <p className="mt-1 text-[18px] font-bold leading-none">{heading}</p>
          <p className="mt-2 text-[11px] text-[#495057]">
            {layout.number_label || "Slip No."} {data.documentNumber}
          </p>
        </div>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-x-8 gap-y-2 text-[12px]">
        {dateValue ? <MetaRow label={layout.date_label || "Payment Date"} value={dateValue} /> : null}
        {layout.show_partner ? (
          <MetaRow
            label={layout.partner_label || "Received from"}
            value={[data.partnerName, data.partnerAddress].filter(Boolean).join(" — ")}
          />
        ) : null}
        {layout.show_method ? <MetaRow label={layout.method_label || "Payment Method"} value={data.method} /> : null}
        {layout.show_amount ? (
          <MetaRow label={layout.amount_label || "Payment Amount"} value={money(data.amount, currency)} />
        ) : null}
        {layout.show_memo ? <MetaRow label={layout.memo_label || "Memo"} value={data.memo} /> : null}
      </div>

      {layout.show_invoices && data.invoices.length ? (
        <table className="mb-0 w-full border-collapse text-[12px]">
          <thead>
            <tr className="bg-[#e8f4f3] text-left">
              <th className="border-b-2 border-[#00a09d] px-2 py-1.5 font-semibold">
                {layout.invoice_date_label || "Invoice Date"}
              </th>
              <th className="border-b-2 border-[#00a09d] px-2 py-1.5 font-semibold">
                {layout.invoice_number_label || "Invoice Number"}
              </th>
              <th className="border-b-2 border-[#00a09d] px-2 py-1.5 font-semibold">
                {layout.reference_label || "Reference"}
              </th>
              <th className="border-b-2 border-[#00a09d] px-2 py-1.5 text-right font-semibold">
                {layout.invoice_amount_label || "Amount"}
              </th>
              <th className="border-b-2 border-[#00a09d] px-2 py-1.5 text-right font-semibold">
                {layout.due_label || "Due Amount"}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.invoices.map((row) => (
              <tr key={row.number} className="align-top">
                <td className="border-b border-[#e9ecef] px-2 py-2">{formatPrintDate(row.date)}</td>
                <td className="border-b border-[#e9ecef] px-2 py-2 font-medium">{row.number}</td>
                <td className="border-b border-[#e9ecef] px-2 py-2 text-[#495057]">{row.reference || "—"}</td>
                <td className="border-b border-[#e9ecef] px-2 py-2 text-right tabular-nums">
                  {money(row.amount, currency)}
                </td>
                <td className="border-b border-[#e9ecef] px-2 py-2 text-right tabular-nums font-semibold">
                  {money(row.due, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {showCustomerSign || showAuthorisedSign || footerNotes.length ? (
        <footer className="mt-10">
          {showCustomerSign || showAuthorisedSign ? (
            <div className="grid grid-cols-2 items-start gap-8 text-[12px] text-[#212529]">
              {showCustomerSign ? (
                <SignatureBlock
                  label={layout.customer_signature_label || "Customer Signature"}
                  imageUrl={customerSignSrc}
                />
              ) : (
                <div />
              )}
              {showAuthorisedSign ? (
                <SignatureBlock
                  label={layout.authorised_signature_label || "Authorised Signature"}
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
                showCustomerSign || showAuthorisedSign ? "mt-8 border-t border-[#dee2e6] pt-3" : "mt-2",
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
