import type { RmaDeliveryCopy } from "@/lib/api/rma-deliveries";
import type { WorkspaceCompany } from "@/lib/api/workspace-company";
import { formatCurrency } from "@/lib/utils";

function Line({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex gap-2 py-[3px] text-[12px]">
      <span className="w-[110px] shrink-0 font-semibold sm:w-[130px] print:w-[130px]">{label} :</span>
      <span className="min-w-0 flex-1 break-words">{value === null || value === undefined || value === "" ? "" : value}</span>
    </div>
  );
}

function formatDay(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("en-GB");
}

/**
 * Customer Delivery Copy — what the customer takes with them: the unit (and its serial), the work done, and where the charges stand.
 * Internal notes and supplier costs are never part of the payload, so they cannot end up on this paper.
 */
export function RmaDeliveryDocument({ copy, company }: { copy: RmaDeliveryCopy; company?: WorkspaceCompany | null }) {
  const address = [company?.street, company?.street2, company?.city, company?.zip_code].filter(Boolean).join(", ");
  const phone = company?.phone || company?.mobile;
  const money = (v: string) => formatCurrency(Number(v) || 0);
  return (
    <div className="bg-white p-4 text-black sm:p-8 print:p-0">
      <header className="mb-3">
        <h1 className="text-[17px] font-bold uppercase tracking-wide sm:text-[20px] print:text-[20px]">{company?.name || "Company"}</h1>
        {address ? <p className="text-[12px]">{address}</p> : null}
        {phone ? <p className="text-[12px]">Phone : {phone}</p> : null}
      </header>

      <h2 className="my-3 text-center text-[17px] font-bold underline underline-offset-4">
        Customer Delivery Copy{copy.reprint ? " (Reprint)" : ""}
      </h2>

      <div className="border border-black">
        <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 print:grid-cols-2 border-b border-black px-3 py-2">
          <div>
            <Line label="Delivery No." value={copy.delivery_no} />
            <Line label="Complain No." value={copy.rma_number} />
            <Line label="Customer Name" value={copy.customer_name} />
            <Line label="Mobile" value={copy.customer_phone} />
          </div>
          <div>
            <Line label="Date" value={formatDay(copy.delivery_date)} />
            <Line label="Type" value={copy.outcome_label} />
            <Line label="Prepared by" value={copy.printed_by} />
            <Line label="Approved by" value={copy.approved_by} />
          </div>
        </div>

        <div className="border-b border-black px-3 py-2">
          <p className="mb-1 text-[14px] font-bold underline underline-offset-2">
            {copy.product_name || copy.sku}
            {copy.sku && copy.product_name ? <span className="ml-2 text-[11px] font-normal no-underline">({copy.sku})</span> : null}
          </p>
          <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 print:grid-cols-2">
            <Line label="Serial No." value={copy.deliver_product ? copy.serial_delivered : "Not handed over"} />
            <Line label="Original Serial" value={copy.serial_changed ? copy.serial_original : null} />
            <Line label="Product Handed Over" value={copy.deliver_product ? "Yes" : "No — cash back"} />
            <Line label="Received By" value={copy.delivered_to} />
            {copy.deliver_product && copy.original_product_name && copy.original_product_name !== copy.product_name ? (
              <Line label="Replaces" value={copy.original_product_name} />
            ) : null}
            {copy.outcome === "cash_back" ? <Line label="Cash Back Paid" value={money(copy.refund_amount ?? "0")} /> : null}
          </div>
          <Line label="Problem" value={copy.problem} />
          <Line label="Work Done" value={copy.diagnosis} />
        </div>

        {copy.charges.length > 0 ? (
          <div className="border-b border-black px-3 py-2">
            <p className="mb-1 text-[12px] font-bold underline underline-offset-2">Charges</p>
            {copy.charges.map((c, i) => (
              <div key={i} className="flex justify-between gap-3 py-[2px] text-[12px]">
                <span>
                  {c.kind}
                  {c.description ? ` — ${c.description}` : ""}
                </span>
                <span className="tabular-nums">{money(c.amount)}</span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="px-3 py-2">
          <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 print:grid-cols-2">
            <Line label="Total Charges" value={money(copy.amount_total)} />
            <Line label="Invoice No." value={copy.invoice_number} />
            <Line label="Collected" value={money(copy.amount_received)} />
            <Line label="Balance Due" value={money(copy.amount_due)} />
            {copy.payment_number ? <Line label="Payment No." value={copy.payment_number} /> : null}
            {copy.payment_method ? <Line label="Paid By" value={copy.payment_method} /> : null}
          </div>
        </div>
      </div>

      <div className="mt-12 flex items-end justify-between gap-4 text-[12px] sm:mt-16">
        <div className="w-full max-w-48 border-t border-black pt-1 text-center">Customer Signature</div>
        <div className="w-full max-w-48 border-t border-black pt-1 text-center">Authorised Signature</div>
      </div>
      <p className="mt-6 text-center text-[10px] text-gray-500">
        Printed {new Date(copy.printed_at).toLocaleString("en-GB")} · {copy.reprint ? `Reprint #${copy.print_count}` : "Original"}
      </p>
    </div>
  );
}
