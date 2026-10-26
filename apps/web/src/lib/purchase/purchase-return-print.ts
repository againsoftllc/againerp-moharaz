import { apiFetch } from "@/lib/api/client";
import { apiSupplierToSupplierDetail, type ApiSupplierResponse } from "@/lib/api/commerce-suppliers";
import { fetchPurchaseReturn, type ApiPurchaseReturn } from "@/lib/api/purchase-returns";
import {
  companyTaxesEnabled,
  fetchWorkspaceCompany,
  inheritInvoiceBrandMedia,
  mergeInvoiceLayout,
  mergePurchaseLayout,
} from "@/lib/api/workspace-company";
import {
  RETURN_REASON_LABELS,
  RETURN_STATUS_LABELS,
  type ReturnReason,
  type ReturnStatus,
} from "@/lib/mock-data/purchase-returns";
import {
  fallbackPurchasePrintCompany,
  purchasePrintPath,
  storePurchasePrintPayload,
  type PurchasePrintPayload,
} from "@/lib/purchase/purchase-print";
import { workspaceCompanyToInvoicePreview } from "@/lib/sales/sales-invoice-print";

const money = (value: string | number | null | undefined) => {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? 0));
  return Number.isFinite(n) ? n : 0;
};

/** The print document of one purchase return: what went back, from which location, and the credit it earned. */
async function buildReturnPrintPayload(ret: ApiPurchaseReturn): Promise<PurchasePrintPayload> {
  let company = fallbackPurchasePrintCompany();
  let layout = mergePurchaseLayout(null);
  try {
    const row = await fetchWorkspaceCompany();
    company = workspaceCompanyToInvoicePreview(row);
    const invoiceLayout = mergeInvoiceLayout(row.invoice_layout);
    const ownPurchase = mergePurchaseLayout(row.purchase_layout);
    const brand = inheritInvoiceBrandMedia(ownPurchase, invoiceLayout);
    layout = {
      ...ownPurchase,
      logo_url: brand.logo_url,
      authorised_signature_url: brand.authorised_signature_url,
      show_logo: brand.show_logo,
      show_authorised_signature: brand.show_authorised_signature,
      show_tax: ownPurchase.show_tax && companyTaxesEnabled(row),
    };
  } catch {
    /* keep the letterhead fallback */
  }

  let vendorAddress = "";
  let vendorPhone = "";
  let vendorEmail = "";
  try {
    const res = await apiFetch<ApiSupplierResponse>(`/api/v1/commerce/suppliers/${ret.supplier_id}`);
    const supplier = apiSupplierToSupplierDetail(res.data);
    const first = supplier.addresses?.[0];
    vendorAddress =
      [first?.line1, first?.city, first?.country].filter(Boolean).join(", ") || supplier.country || "";
    vendorPhone = supplier.phone ?? "";
    vendorEmail = supplier.email ?? "";
  } catch {
    /* the document still names the supplier */
  }

  const status = RETURN_STATUS_LABELS[ret.status as ReturnStatus] ?? ret.status;
  return {
    heading: "Purchase Return",
    documentNumber: ret.return_number,
    orderDate: String(ret.return_date ?? "").slice(0, 10),
    expectedDate: "",
    buyerName: "",
    referenceNo: ret.po_number ?? "",
    paymentTerms: "",
    warehouseName: ret.warehouse_name ?? "",
    vendorName: ret.supplier_name ?? "Supplier",
    vendorAddress,
    vendorPhone,
    vendorEmail,
    lines: ret.lines.map((line) => ({
      kind: "product" as const,
      name: line.name || line.sku || "Product",
      sku: line.sku ?? undefined,
      // a serial product prints the units that went back where the SKU would be
      serialNumbers: line.serial_numbers?.length ? line.serial_numbers : undefined,
      quantity: line.quantity_returned,
      unitCost: money(line.unit_cost),
      discountLabel: "",
      taxRate: money(line.tax_rate),
      amount: money(line.line_total),
    })),
    subtotal: money(ret.subtotal),
    discount: 0,
    tax: money(ret.tax_amount),
    total: money(ret.credit_amount),
    company,
    layout: mergePurchaseLayout({
      ...layout,
      show_vendor: true,
      show_reference: true,
      show_warehouse: true,
      show_expected: false,
      show_buyer: false,
      show_discount: false,
      show_payment_terms: false,
      total_label: "Credit total",
      customer_signature_label: "Supplier Signature",
    }),
    labels: { number: "Return No.", date: "Return Date", reference: "Purchase Order", warehouse: "Returned from" },
    extraInfo: [
      { label: "Reason", value: RETURN_REASON_LABELS[ret.reason as ReturnReason] ?? ret.reason },
      { label: "Status", value: status },
    ],
    note: ret.notes ?? undefined,
  };
}

/**
 * Opens the print page of one purchase return. The tab is opened straight away (while the click still counts), then pointed at
 * the document once it is built, so a pop-up blocker does not swallow it. Throws when the return cannot be loaded.
 */
export async function printPurchaseReturn(returnId: string): Promise<void> {
  const tab = typeof window !== "undefined" ? window.open("about:blank", "_blank") : null;
  try {
    const payload = await buildReturnPrintPayload(await fetchPurchaseReturn(returnId));
    const url = purchasePrintPath(storePurchasePrintPayload(payload));
    if (tab) tab.location.href = url;
    else window.open(url, "_blank");
  } catch (err) {
    tab?.close();
    throw err;
  }
}
