import {
  DEFAULT_INVOICE_LAYOUT,
  DEFAULT_PACKING_LAYOUT,
  mergeInvoiceLayout,
  mergePackingLayout,
  type WorkspaceCompany,
} from "@/lib/api/workspace-company";
import type { InvoiceDocumentData } from "@/components/workspace/invoice-layout-preview";
import type { SalesPrintPayload } from "@/lib/sales/sales-print";
import { formatPostalAddress, type PartnerAddress } from "@/lib/sales/sales-partner-address";
import { workspaceCompanyToInvoicePreview } from "@/lib/sales/sales-invoice-print";

export type SalesPackingDocumentKind = "packing-slip" | "delivery-note";

function formatAddress(address: PartnerAddress): string {
  return formatPostalAddress(address);
}

/**
 * Packing Slip / Delivery Note — AgainPOS-style pick/ship documents: no
 * prices, quantity only. Delivery Note additionally keeps the signature
 * blocks (proof of delivery); Packing Slip suppresses them (warehouse pick
 * list). Both reuse the admin's Chalan layout config, just with the heading
 * and signature visibility overridden per document.
 */
export function attachSalesPackingPrint(
  payload: SalesPrintPayload,
  company: WorkspaceCompany,
  documentKind: SalesPackingDocumentKind,
  deliveryAddress?: PartnerAddress,
): SalesPrintPayload {
  const address = deliveryAddress?.street ? deliveryAddress : payload.invoiceAddress;
  const isDeliveryNote = documentKind === "delivery-note";
  const document: InvoiceDocumentData = {
    invoiceNumber: payload.documentNumber,
    issuedAt: payload.orderDate,
    origin: payload.documentNumber,
    shippingDate: payload.orderDate,
    customer: {
      name: payload.customerName,
      address: formatAddress(address),
      mobile: payload.customerPhone,
      email: payload.customerEmail,
    },
    lines: payload.lines.map((line) => ({
      name: line.name,
      sku: line.sku,
      description: line.description,
      qty: line.quantity,
      ordered: line.quantity,
      delivered: line.quantity,
      unitPrice: line.unitPrice,
      discount: line.discountAmount || 0,
      serialNumbers: line.serialNumbers,
    })),
  };
  const layout = mergeInvoiceLayout(company.invoice_layout ?? DEFAULT_INVOICE_LAYOUT);
  const packingLayout = mergePackingLayout(company.packing_layout ?? DEFAULT_PACKING_LAYOUT);
  const packing = {
    ...packingLayout,
    heading: isDeliveryNote ? "Delivery Note" : "Packing Slip",
    number_label: isDeliveryNote ? "Delivery Note No." : "Packing No.",
    show_customer_signature: isDeliveryNote && packingLayout.show_customer_signature,
    show_authorised_signature: isDeliveryNote && packingLayout.show_authorised_signature,
  };
  return {
    ...payload,
    documentLabel: isDeliveryNote ? "Delivery Note" : "Packing Slip",
    invoicePrint: {
      company: workspaceCompanyToInvoicePreview(company),
      layout,
      packing,
      kind: "packing",
      document,
    },
  };
}
