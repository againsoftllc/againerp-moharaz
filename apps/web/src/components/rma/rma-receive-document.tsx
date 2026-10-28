import type { RmaReceiptCopy } from "@/lib/api/rma-receipts";
import type { WorkspaceCompany } from "@/lib/api/workspace-company";

function Line({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex gap-2 py-[3px] text-[12px]">
      <span className="w-[110px] shrink-0 font-semibold sm:w-[140px] print:w-[140px]">{label} :</span>
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
 * Replacement Receive Copy — what came back from the supplier. Customer details, internal notes and costs are never part
 * of the payload, so they cannot end up on this paper.
 */
export function RmaReceiveDocument({ copy, company }: { copy: RmaReceiptCopy; company?: WorkspaceCompany | null }) {
  const address = [company?.street, company?.street2, company?.city, company?.zip_code].filter(Boolean).join(", ");
  const phone = company?.phone || company?.mobile;
  return (
    <div className="bg-white p-4 text-black sm:p-8 print:p-0">
      <header className="mb-3">
        <h1 className="text-[17px] font-bold uppercase tracking-wide sm:text-[20px] print:text-[20px]">{company?.name || "Company"}</h1>
        {address ? <p className="text-[12px]">{address}</p> : null}
        {phone ? <p className="text-[12px]">Phone : {phone}</p> : null}
      </header>

      <h2 className="my-3 text-center text-[17px] font-bold underline underline-offset-4">
        Replacement Receive Copy{copy.reprint ? " (Reprint)" : ""}
      </h2>

      <div className="border border-black">
        <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 print:grid-cols-2 border-b border-black px-3 py-2">
          <div>
            <Line label="Receipt No." value={copy.receipt_no} />
            <Line label="RMA Ref." value={copy.rma_number} />
            <Line label="Claim No." value={copy.claim_number} />
            <Line label="Status" value={copy.status_label} />
          </div>
          <div>
            <Line label="Supplier" value={copy.supplier_name} />
            <Line label="Supplier Delivery Ref." value={copy.supplier_delivery_ref} />
            <Line label="Received Date" value={formatDay(copy.received_date)} />
          </div>
        </div>

        <div className="border-b border-black px-3 py-2">
          <p className="mb-1 text-[14px] font-bold underline underline-offset-2">
            {copy.product_name || copy.sku}
            {copy.sku && copy.product_name ? <span className="ml-2 text-[11px] font-normal no-underline">({copy.sku})</span> : null}
          </p>
          <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 print:grid-cols-2">
            <Line label="Serial Sent" value={copy.serial_sent} />
            <Line label="Serial Received" value={copy.serial_received} />
            <Line label="Received" value={copy.outcome_label} />
            <Line label="Serial Changed" value={copy.serial_changed ? "Yes — the original serial is kept and linked" : "No"} />
            {copy.received_sku ? <Line label="Product Received" value={`${copy.received_product_name ?? ""} (${copy.received_sku})`} /> : null}
            {copy.outcome === "cash_back" ? <Line label="Cash Back" value={copy.refund_amount != null ? String(copy.refund_amount) : null} /> : null}
            {copy.settlement_number ? <Line label="Settlement" value={copy.settlement_number} /> : null}
          </div>
          <Line label="Reason / Note" value={copy.outcome_note} />
        </div>

        <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 print:grid-cols-2 px-3 py-2">
          <Line label="Condition" value={copy.condition_notes} />
          <Line label="Accessories Received" value={copy.accessories_received} />
          <Line label="Received Into" value={copy.received_into} />
          <Line label="Received By" value={copy.received_by} />
        </div>
      </div>

      <div className="mt-12 flex items-end justify-between gap-4 text-[12px] sm:mt-16">
        <div className="w-44 border-t border-black pt-1 text-center">
          Received by
          {copy.received_by ? <span className="block text-[11px] text-gray-600">{copy.received_by}</span> : null}
        </div>
        <div className="w-44 border-t border-black pt-1 text-center">
          Approved by
          {copy.approved_by ? <span className="block text-[11px] text-gray-600">{copy.approved_by}</span> : null}
        </div>
        <div className="w-44 border-t border-black pt-1 text-center">Supplier Delivery Person</div>
      </div>
      <p className="mt-6 text-center text-[10px] text-gray-500">
        Printed {new Date(copy.printed_at).toLocaleString("en-GB")} · {copy.reprint ? `Reprint #${copy.print_count}` : "Original"}
      </p>
    </div>
  );
}
