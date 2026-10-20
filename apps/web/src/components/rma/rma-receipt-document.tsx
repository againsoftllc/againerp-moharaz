import type { RmaReceipt } from "@/lib/api/rma";
import type { WorkspaceCompany } from "@/lib/api/workspace-company";

function Line({ label, value, wide }: { label: string; value?: string | number | null; wide?: boolean }) {
  return (
    <div className={`flex gap-2 py-[3px] text-[12px] ${wide ? "col-span-2" : ""}`}>
      <span className="w-[110px] shrink-0 font-semibold sm:w-[116px] print:w-[116px]">{label} :</span>
      <span className="min-w-0 flex-1 break-words">{value === null || value === undefined || value === "" ? "" : value}</span>
    </div>
  );
}

function formatDay(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB");
}

/**
 * Complaint Receive Slip — the customer's copy. It carries only what the customer is entitled to see:
 * internal notes, costs and charge lines are never part of the payload.
 */
export function RmaReceiptDocument({ receipt, company }: { receipt: RmaReceipt; company?: WorkspaceCompany | null }) {
  const address = [company?.street, company?.street2, company?.city, company?.zip_code].filter(Boolean).join(", ");
  const phone = company?.phone || company?.mobile;
  const charge = Number(receipt.charge_estimate || 0);
  return (
    <div className="bg-white p-4 text-black sm:p-8 print:p-0">
      <header className="mb-3">
        <h1 className="text-[17px] font-bold uppercase tracking-wide sm:text-[20px] print:text-[20px]">{company?.name || "Company"}</h1>
        {address ? <p className="text-[12px]">{address}</p> : null}
        {phone ? <p className="text-[12px]">Phone : {phone}</p> : null}
      </header>

      <h2 className="my-3 text-center text-[17px] font-bold underline underline-offset-4">
        Complaint Receive Slip{receipt.reprint ? " (Reprint)" : ""}
      </h2>

      <div className="border border-black">
        <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 print:grid-cols-2 border-b border-black px-3 py-2">
          <div>
            <Line label="Complain No." value={receipt.rma_number} />
            <Line label="Customer Name" value={receipt.customer_name} />
            <Line label="Mobile" value={receipt.customer_phone} />
            {receipt.customer_email ? <Line label="Email" value={receipt.customer_email} /> : null}
          </div>
          <div>
            <Line label="Ref No" value={receipt.receipt_no} />
            <Line label="Date" value={formatDay(receipt.complaint_date)} />
            <Line label="Prepared by" value={receipt.printed_by} />
            <Line label="Approve by" value={receipt.approved_by} />
          </div>
        </div>

        <div className="px-3 py-2">
          <p className="mb-1 text-[14px] font-bold underline underline-offset-2">
            {receipt.product_name || receipt.sku}
            {receipt.sku && receipt.product_name ? <span className="ml-2 text-[11px] font-normal no-underline">({receipt.sku})</span> : null}
          </p>
          <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 print:grid-cols-2">
            <Line label="Under Warranty" value={receipt.warranty_status === "unknown" ? "Unverified" : receipt.under_warranty ? "Yes" : "No"} />
            <Line label="Rec. Serial No." value={receipt.serial_number} />
            <Line label="Sales Invoice No." value={receipt.sales_invoice_no} />
            <Line label="Previous Job Ref." value={receipt.prior_job_ref} />
            <Line label="Sales Date" value={formatDay(receipt.sales_date)} />
            <Line label="Sold Serial" value={receipt.serial_number} />
            <Line label="Problem" value={receipt.problem} />
            <Line label="No. of Time" value={receipt.times_before} />
            <Line label="Narration" value={receipt.narration} />
            <Line label="Engineer" value={receipt.engineer} />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 border-t border-black px-3 py-2 text-[12px]">
          <span>
            <b>Delivery Date :</b> {formatDay(receipt.delivery_date)}
          </span>
          <span>
            <b>Amount Charges</b> {charge.toFixed(2)}
          </span>
        </div>
      </div>

      <div className="mt-12 flex items-end justify-between gap-4 text-[12px] sm:mt-16">
        <div className="w-full max-w-48 border-t border-black pt-1 text-center">Customer Signature</div>
        <div className="w-full max-w-48 border-t border-black pt-1 text-center">Authorised Signature</div>
      </div>
      <p className="mt-6 text-center text-[10px] text-gray-500">
        Printed {new Date(receipt.printed_at).toLocaleString("en-GB")} · {receipt.reprint ? `Reprint #${receipt.print_count}` : "Original"}
      </p>
    </div>
  );
}
