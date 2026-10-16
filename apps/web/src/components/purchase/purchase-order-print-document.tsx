"use client";

import type { InvoicePreviewCompany } from "@/components/workspace/invoice-layout-preview";
import {
  amountWithSymbol,
  findCurrency,
  type CurrencyOption,
} from "@/lib/localisation/currency-options";
import { publicMediaUrl } from "@/lib/media/public-media-url";
import {
  DEFAULT_PURCHASE_LAYOUT,
  companyTaxesEnabled,
  mergePurchaseLayout,
  type PurchaseLayout,
} from "@/lib/api/workspace-company";
import type { PurchasePrintPayload } from "@/lib/purchase/purchase-print";
import { formatPrintDate } from "@/lib/sales/sales-print";
import { cn, formatTime } from "@/lib/utils";

type Props = {
  data: PurchasePrintPayload;
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
  layout: PurchaseLayout;
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

function InfoCell({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6c757d]">{label}</p>
      <p className="mt-0.5 font-medium">{value}</p>
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

export function PurchaseOrderPrintDocument({ data }: Props) {
  const layout = mergePurchaseLayout(data.layout ?? DEFAULT_PURCHASE_LAYOUT);
  const taxOn = companyTaxesEnabled(data.company) && layout.show_tax;
  const currency =
    findCurrency(data.company.currency_code) ??
    ({
      code: data.company.currency_code || "BDT",
      name: data.company.currency_code || "BDT",
      symbol: "৳",
      position: "before",
    } satisfies CurrencyOption);
  const showTaxCol =
    taxOn &&
    data.lines.some((line) => line.kind !== "section" && line.kind !== "note" && line.taxRate > 0);
  const heading = data.heading || layout.heading || "Purchase Order";
  const showDiscountCol = layout.show_discount;
  const colSpan = 3 + (showDiscountCol ? 1 : 0) + (showTaxCol ? 1 : 0) + 1;
  const footerNotes = footerNoteLines(layout.footer || "");
  const showCustomerSign = layout.show_customer_signature !== false;
  const showAuthorisedSign = layout.show_authorised_signature !== false;
  const customerSignSrc = mediaSrc(layout.customer_signature_url || "");
  const authorisedSignSrc = mediaSrc(layout.authorised_signature_url || "");

  return (
    <article
      className={cn(
        "purchase-print-doc mx-auto max-w-[820px] bg-white px-10 py-8 text-[13px] leading-snug text-[#212529] shadow-sm",
        "print:max-w-none print:px-8 print:py-6 print:shadow-none",
      )}
    >
      <header className="mb-6 flex items-start justify-between gap-8 border-b-2 border-[#00a09d] pb-5">
        <CompanyLetterhead company={data.company} layout={layout} />
        <div className="shrink-0 text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#00a09d]">{heading}</p>
          <p className="mt-1 text-[18px] font-bold leading-none">{heading}</p>
          <p className="mt-2 text-[11px] text-[#495057]">
            {layout.number_label || "PO No."} {data.documentNumber}
          </p>
          {data.orderDate ? (
            <p className="text-[11px] text-[#495057]">
              {layout.date_label || "Order Date"} {formatPrintDate(data.orderDate)}
              {layout.show_time
                ? ` ${formatTime(`${data.orderDate}T12:00:00`)}`
                : ""}
            </p>
          ) : null}
        </div>
      </header>

      <div className="mb-5 grid grid-cols-2 gap-6">
        {layout.show_vendor ? (
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6c757d]">
              {layout.vendor_label || "Vendor"}
            </p>
            <p className="mt-0.5 text-[15px] font-bold">{data.vendorName || "Supplier"}</p>
            {data.vendorAddress ? <p className="text-[11px] text-[#495057]">{data.vendorAddress}</p> : null}
            {layout.show_phone && data.vendorPhone ? (
              <p className="text-[11px] text-[#495057]">{data.vendorPhone}</p>
            ) : null}
            {layout.show_email && data.vendorEmail ? (
              <p className="text-[11px] text-[#495057]">{data.vendorEmail}</p>
            ) : null}
          </section>
        ) : (
          <div />
        )}
        <div className="grid grid-cols-2 gap-3 text-[12px]">
          {layout.show_buyer ? <InfoCell label={layout.buyer_label || "Buyer"} value={data.buyerName} /> : null}
          {layout.show_reference ? (
            <InfoCell label={layout.reference_label || "Your Order Reference"} value={data.referenceNo} />
          ) : null}
          {layout.show_expected ? (
            <InfoCell
              label={layout.expected_label || "Expected Arrival"}
              value={data.expectedDate ? formatPrintDate(data.expectedDate) : ""}
            />
          ) : null}
          {layout.show_warehouse ? (
            <InfoCell label={layout.warehouse_label || "Warehouse"} value={data.warehouseName} />
          ) : null}
        </div>
      </div>

      <table className="mb-0 w-full border-collapse text-[12px]">
        <thead>
          <tr className="bg-[#e8f4f3] text-left">
            <th className="border-b-2 border-[#00a09d] px-2 py-1.5 font-semibold">
              {layout.product_label || "Description"}
            </th>
            <th className="border-b-2 border-[#00a09d] px-2 py-1.5 text-right font-semibold">
              {layout.qty_label || "Qty"}
            </th>
            <th className="border-b-2 border-[#00a09d] px-2 py-1.5 text-right font-semibold">
              {layout.unit_cost_label || "Unit Cost"}
            </th>
            {showDiscountCol ? (
              <th className="border-b-2 border-[#00a09d] px-2 py-1.5 text-right font-semibold">
                {layout.discount_label || "Disc."}
              </th>
            ) : null}
            {showTaxCol ? (
              <th className="border-b-2 border-[#00a09d] px-2 py-1.5 text-right font-semibold">
                {layout.tax_label || "Taxes"}
              </th>
            ) : null}
            <th className="border-b-2 border-[#00a09d] px-2 py-1.5 text-right font-semibold">
              {layout.amount_label || "Amount"}
            </th>
          </tr>
        </thead>
        <tbody>
          {data.lines.map((line, idx) => {
            if (line.kind === "section" || line.kind === "note") {
              return (
                <tr key={`${line.kind}-${idx}`}>
                  <td
                    colSpan={colSpan}
                    className={cn(
                      "border-b border-[#e9ecef] px-2 py-2",
                      line.kind === "section" ? "font-semibold" : "italic text-[#6c757d]",
                    )}
                  >
                    {line.name}
                  </td>
                </tr>
              );
            }
            return (
              <tr key={`${line.sku || line.name}-${idx}`} className="align-top">
                <td className="border-b border-[#e9ecef] px-2 py-2">
                  <p className="font-medium">{line.name}</p>
                  {layout.show_sku && line.sku ? (
                    <p className="mt-0.5 text-[11px] text-[#6c757d]">{line.sku}</p>
                  ) : null}
                </td>
                <td className="border-b border-[#e9ecef] px-2 py-2 text-right tabular-nums">
                  {line.quantity.toFixed(2)}
                </td>
                <td className="border-b border-[#e9ecef] px-2 py-2 text-right tabular-nums">
                  {money(line.unitCost, currency)}
                </td>
                {showDiscountCol ? (
                  <td className="border-b border-[#e9ecef] px-2 py-2 text-right tabular-nums">
                    {line.discountLabel || "—"}
                  </td>
                ) : null}
                {showTaxCol ? (
                  <td className="border-b border-[#e9ecef] px-2 py-2 text-right tabular-nums">
                    {line.taxRate > 0 ? `${line.taxRate.toFixed(0)}%` : "—"}
                  </td>
                ) : null}
                <td className="border-b border-[#e9ecef] px-2 py-2 text-right tabular-nums">
                  {money(line.amount, currency)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-3 ml-auto w-full max-w-[280px] space-y-1 text-[12px]">
        <div className="flex items-center justify-between gap-6 border-t border-[#212529] pt-1.5">
          <span>{layout.subtotal_label || "Subtotal"}</span>
          <span className="tabular-nums">{money(data.subtotal, currency)}</span>
        </div>
        {layout.show_discount && data.discount > 0 ? (
          <div className="flex items-center justify-between gap-6 border-t border-[#212529] pt-1.5">
            <span>{layout.discount_label || "Discount"}</span>
            <span className="tabular-nums">{money(data.discount, currency)}</span>
          </div>
        ) : null}
        {taxOn && data.tax > 0 ? (
          <div className="flex items-center justify-between gap-6 border-t border-[#212529] pt-1.5">
            <span>{layout.tax_label || "Tax"}</span>
            <span className="tabular-nums">{money(data.tax, currency)}</span>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-6 border-t border-[#212529] pt-1.5 text-[15px] font-bold">
          <span>{layout.total_label || "Total"}</span>
          <span className="tabular-nums">{money(data.total, currency)}</span>
        </div>
      </div>

      {layout.show_payment_terms && data.paymentTerms ? (
        <p className="mt-6 text-[12px]">
          <span className="font-semibold">Payment Terms: </span>
          {data.paymentTerms}
        </p>
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
