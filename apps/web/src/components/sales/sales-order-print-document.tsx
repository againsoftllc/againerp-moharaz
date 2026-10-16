"use client";

import { Fragment } from "react";

import {
  LINE_DATA_COL_LABELS,
  type LineDataCol,
} from "@/components/sales/sales-order-line-table-layout";
import { getApiBaseUrl } from "@/lib/api/client";
import {
  DEFAULT_PRINT_COMPANY,
  formatPrintDate,
  formatPrintMoney,
  formatPrintQuantity,
  salesPrintTotals,
  type SalesPrintLine,
  type SalesPrintPayload,
} from "@/lib/sales/sales-print";
import { cn } from "@/lib/utils";

type Props = {
  data: SalesPrintPayload;
};

/** Money on the document: decimals only when there is a fractional part (5,500 / 3,220.5). */
function compactAmount(value: number): string {
  const n = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("en-BD", { maximumFractionDigits: 2 }).format(n);
}

function AddressLines({ address }: { address: SalesPrintPayload["invoiceAddress"] }) {
  const cityLine = [address.city, address.state, address.zip].filter(Boolean).join(" ");
  return (
    <>
      {address.street ? <p>{address.street}</p> : null}
      {address.street2 ? <p>{address.street2}</p> : null}
      {cityLine ? <p>{cityLine}</p> : null}
      {address.country ? <p>{address.country}</p> : null}
    </>
  );
}

function OrderIdBadge({ title }: { title: string }) {
  return (
    <div
      className="inline-block min-w-[130px] max-w-full bg-[#e8d5e5] px-4 py-1.5 text-center text-[13px] font-bold leading-tight tracking-tight text-[#714B67]"
      style={{
        clipPath:
          "polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%, 14px 50%)",
      }}
    >
      {title}
    </div>
  );
}

/** Variant lines of the same product grouped under one product entry — mirrors the drawer table. */
type PrintLineGroup = {
  key: string;
  name: string;
  imageUrl: string;
  totalQty: number;
  totalAmount: number;
  lines: SalesPrintLine[];
  grouped: boolean;
};

function groupPrintLines(lines: SalesPrintLine[]): PrintLineGroup[] {
  const groups = new Map<string, PrintLineGroup>();
  lines.forEach((line, idx) => {
    const key = line.name?.trim() || `line_${idx}`;
    const amount = Math.max(0, line.quantity * line.unitPrice - (line.discountAmount || 0));
    const existing = groups.get(key);
    if (existing) {
      existing.lines.push(line);
      existing.totalQty += line.quantity;
      existing.totalAmount += amount;
      if (!existing.imageUrl && line.imageUrl) existing.imageUrl = line.imageUrl;
    } else {
      groups.set(key, {
        key,
        name: line.name?.trim() || "Product",
        imageUrl: line.imageUrl || "",
        totalQty: line.quantity,
        totalAmount: amount,
        lines: [line],
        grouped: false,
      });
    }
  });
  return Array.from(groups.values()).map((g) => ({
    ...g,
    grouped: g.lines.length > 1 || g.lines.some((l) => Boolean(l.variant?.trim())),
  }));
}

function resolvePrintImageUrl(url: string): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `${getApiBaseUrl()}${url.startsWith("/") ? "" : "/"}${url}`;
}

function ProductThumb({ imageUrl, name }: { imageUrl: string; name: string }) {
  const src = resolvePrintImageUrl(imageUrl);
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      className="h-10 w-10 shrink-0 rounded border border-[#dee2e6] bg-white object-cover"
    />
  );
}

function isPrintColRight(col: LineDataCol): boolean {
  return (
    col === "quantity" ||
    col === "unitPrice" ||
    col === "discount" ||
    col === "taxes" ||
    col === "taxIncl" ||
    col === "amount" ||
    col === "leadTime"
  );
}

const PRINT_COL_WIDTH: Partial<Record<LineDataCol, string>> = {
  quantity: "52px",
  unitPrice: "64px",
  discount: "56px",
  amount: "64px",
  taxes: "48px",
  taxIncl: "64px",
  leadTime: "56px",
  variant: "72px",
};

function printColWidth(col: LineDataCol): string | undefined {
  return PRINT_COL_WIDTH[col];
}

function renderPrintLineCell(
  col: LineDataCol,
  line: SalesPrintLine,
  showDescription: boolean,
  asVariantChild = false,
): React.ReactNode {
  const untaxed = Math.max(0, line.quantity * line.unitPrice - (line.discountAmount || 0));
  const taxIncl = untaxed + line.taxAmount;

  const serials = line.serialNumbers?.length ? (
    <p className="mt-0.5 whitespace-normal break-all font-mono text-[10px] leading-snug text-[#6c757d]">
      S/N: {line.serialNumbers.join(", ")}
    </p>
  ) : null;

  switch (col) {
    case "variant":
      return line.variant || "—";
    case "product": {
      if (asVariantChild) {
        return (
          <div className="pl-3">
            <p className="whitespace-normal break-words text-[10px] leading-tight text-[#6c757d]">
              {line.variant?.trim() || "Option"}
            </p>
            {serials}
          </div>
        );
      }
      const title = line.name?.trim() || "—";
      const description = line.description?.trim() ?? "";
      const showDesc =
        showDescription &&
        description.length > 0 &&
        description.toLowerCase() !== title.toLowerCase();
      return (
        <div className="flex min-w-0 items-start gap-2.5">
          <ProductThumb imageUrl={line.imageUrl} name={title} />
          <div className="min-w-0">
            <p className="whitespace-normal break-words font-medium leading-snug text-[#212529]">
              {title}
            </p>
            {showDesc ? (
              <p className="mt-0.5 whitespace-pre-line break-words text-[11px] leading-snug text-[#6c757d]">
                {description}
              </p>
            ) : null}
            {serials}
          </div>
        </div>
      );
    }
    case "leadTime":
      return line.leadTime || "—";
    case "quantity":
      return formatPrintQuantity(line.quantity);
    case "unitPrice":
      return compactAmount(line.unitPrice);
    case "discount":
      return line.discountAmount
        ? `${compactAmount(line.discountAmount)} ৳`
        : "—";
    case "taxes":
      return line.taxRate > 0 ? `${line.taxRate.toFixed(0)}%` : "—";
    case "taxIncl":
      return `${compactAmount(taxIncl)} ৳`;
    case "amount":
      return `${compactAmount(untaxed)} ৳`;
    default:
      return "—";
  }
}

function TotalsRow({
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
        "flex items-center justify-between gap-6 border-t border-[#212529] pt-2",
        strong && "text-[18px] font-bold",
      )}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

export function SalesOrderPrintDocument({ data }: Props) {
  const company = DEFAULT_PRINT_COMPANY;
  const docTitle = `${data.documentLabel} # ${data.documentNumber}`;
  const columns = data.columns.length ? data.columns : (["product", "quantity", "unitPrice", "amount"] as LineDataCol[]);
  const logoSrc = resolvePrintImageUrl(company.logoSrc);
  const totals = salesPrintTotals(data);
  const showPaidBlock = data.paidAmount != null && (totals.paid > 0 || totals.previousDue > 0);

  return (
    <article className="sales-print-doc mx-auto max-w-[820px] bg-white px-10 py-8 text-[13px] leading-snug text-[#212529] print:max-w-none print:px-8 print:py-6">
      <header className="mb-8 flex items-start justify-between gap-8">
        <div className="flex shrink-0 flex-col items-start gap-3">
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoSrc}
              alt={company.name}
              className="h-10 w-auto max-w-[180px] object-contain object-left"
            />
          ) : (
            <p className="text-[15px] font-bold text-[#714B67]">{company.name}</p>
          )}
          <OrderIdBadge title={docTitle} />
        </div>
        <div className="min-w-0 text-right text-[12px] leading-relaxed text-[#212529]">
          <p className="text-[13px] font-semibold text-[#714B67]">{company.name}</p>
          <p>{company.street}</p>
          <p>{company.city}</p>
          <p>{company.phone}</p>
          <p>{company.email}</p>
        </div>
      </header>

      <section className="mb-6 space-y-0.5 text-[13px]">
        <p className="font-medium">{data.customerName}</p>
        <AddressLines address={data.invoiceAddress} />
        {data.customerPhone ? <p>{data.customerPhone}</p> : null}
        {data.customerEmail ? <p>{data.customerEmail}</p> : null}
      </section>

      <section className="mb-6 grid gap-8 sm:grid-cols-2">
        <div>
          <p className="text-[15px] font-bold text-[#212529]">Order Date</p>
          <p className="mt-1">{formatPrintDate(data.orderDate)}</p>
        </div>
        <div>
          <p className="text-[15px] font-bold text-[#212529]">Contact</p>
          <p className="mt-1">{data.customerContact || data.customerName}</p>
          {data.customerPhone ? <p className="mt-0.5">{data.customerPhone}</p> : null}
        </div>
      </section>

      <table className="mb-0 w-full table-fixed border-collapse text-[13px]">
        <colgroup>
          {columns.map((col) => (
            <col
              key={col}
              style={printColWidth(col) ? { width: printColWidth(col) } : undefined}
            />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b-2 border-[#212529] text-left">
            {columns.map((col) => (
              <th
                key={col}
                className={cn(
                  "py-2 font-bold",
                  isPrintColRight(col) ? "text-right" : "pr-4 text-left",
                  col === "product" && "whitespace-normal",
                )}
                style={printColWidth(col) ? { width: printColWidth(col) } : undefined}
              >
                {LINE_DATA_COL_LABELS[col]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groupPrintLines(data.lines).map((group) => {
            const cellClass = (col: LineDataCol, variantChild = false) =>
              cn(
                variantChild ? "py-0.5 text-[11px] leading-tight" : "py-2",
                "tabular-nums",
                isPrintColRight(col) ? "text-right" : "pr-4 text-left",
                col === "product" && "whitespace-normal break-words align-top",
              );

            if (!group.grouped) {
              const line = group.lines[0];
              return (
                <tr key={group.key} className="align-top">
                  {columns.map((col) => (
                    <td key={col} className={cellClass(col)}>
                      {renderPrintLineCell(col, line, data.showDescription)}
                    </td>
                  ))}
                </tr>
              );
            }

            return (
              <Fragment key={group.key}>
                <tr className="border-b border-[#e9ecef] align-top">
                  {columns.map((col) => (
                    <td key={col} className={cellClass(col)}>
                      {col === "product" ? (
                        <div className="flex min-w-0 items-start gap-2.5">
                          <ProductThumb imageUrl={group.imageUrl} name={group.name} />
                          <p className="line-clamp-2 whitespace-normal break-words text-[12px] font-medium leading-snug text-[#212529]">
                            {group.name}
                          </p>
                        </div>
                      ) : col === "quantity" ? (
                        formatPrintQuantity(group.totalQty)
                      ) : col === "amount" ? (
                        `${compactAmount(group.totalAmount)} ৳`
                      ) : null}
                    </td>
                  ))}
                </tr>
                {group.lines.map((line, idx) => (
                  <tr key={`${group.key}-${idx}`} className="align-top">
                    {columns.map((col) => (
                      <td key={col} className={cellClass(col, true)}>
                        {renderPrintLineCell(col, line, data.showDescription, true)}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      <div className="mt-2 flex justify-end">
        <div className="w-full max-w-[280px] space-y-1 text-[13px]">
          <TotalsRow label="Untaxed Amount" value={formatPrintMoney(data.untaxedAmount)} />
          {totals.orderDiscount > 0 ? (
            <TotalsRow label="Discount" value={`−${formatPrintMoney(totals.orderDiscount)}`} />
          ) : null}
          {data.taxAmount > 0 ? (
            <TotalsRow label={data.taxSummaryLabel || "Tax"} value={formatPrintMoney(data.taxAmount)} />
          ) : null}
          {totals.shipping > 0 ? (
            <TotalsRow label="Shipping" value={formatPrintMoney(totals.shipping)} />
          ) : null}
          {totals.expenses
            .filter((e) => e.amount !== 0)
            .map((e, idx) => (
              <TotalsRow key={`${idx}-${e.title}`} label={e.title} value={formatPrintMoney(e.amount)} />
            ))}
          {totals.returned > 0 ? (
            <TotalsRow label="Returned" value={`−${formatPrintMoney(totals.returned)}`} />
          ) : null}
          <TotalsRow label="Total" value={formatPrintMoney(data.total)} strong />
          {showPaidBlock ? (
            <>
              <TotalsRow label="Paid" value={formatPrintMoney(totals.paid)} />
              <TotalsRow label="Due" value={formatPrintMoney(totals.due)} />
              {totals.refundDue > 0 ? (
                <TotalsRow label="Refund due" value={formatPrintMoney(totals.refundDue)} />
              ) : null}
              {totals.previousDue > 0 ? (
                <TotalsRow label="Previous due" value={formatPrintMoney(totals.previousDue)} />
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <footer className="mt-10 text-[12px] text-[#212529]">
        <p>
          Terms &amp; Conditions:{" "}
          <span className="text-[#0d6efd]">{company.termsUrl}</span>
        </p>
      </footer>
    </article>
  );
}
