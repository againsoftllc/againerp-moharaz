import type { PurchaseOrder } from "./purchase-orders";

const SUPPLIER_NAMES: Record<string, string> = {
  sup_001: "TechPro Distributors Ltd",
  sup_002: "UrbanWear Manufacturing",
  sup_003: "GlowUp Beauty Imports",
  sup_004: "Shenzhen Electronics Co.",
  sup_005: "HomeNest Wholesale",
};

export type BillStatus =
  | "draft"
  | "unmatched"
  | "matched"
  | "exception"
  | "approved"
  | "posted"
  | "paid"
  | "cancelled";

export type MatchStatus = "unmatched" | "partial_match" | "matched" | "exception";

export type VendorBillLine = {
  id: string;
  poLineId: string;
  sku: string;
  name: string;
  quantityPo: number;
  quantityReceipt: number;
  quantityBill: number;
  unitPricePo: number;
  unitPriceBill: number;
};

export type VendorBill = {
  id: string;
  number: string;
  vendorInvoiceNumber: string;
  purchaseOrderId: string;
  poNumber: string;
  receiptId?: string;
  receiptNumber?: string;
  supplierId: string;
  billDate: string;
  dueDate: string;
  status: BillStatus;
  matchStatus: MatchStatus;
  lines: VendorBillLine[];
  total: number;
  notes?: string;
};

export const BILL_STATUS_LABELS: Record<BillStatus, string> = {
  draft: "Draft",
  unmatched: "Unmatched",
  matched: "Matched",
  exception: "Exception",
  approved: "Approved",
  posted: "Posted",
  paid: "Paid",
  cancelled: "Cancelled",
};

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  unmatched: "Unmatched",
  partial_match: "Partial match",
  matched: "Matched",
  exception: "Exception",
};

const MATCH_TOLERANCE_PCT = 2;

export function billSupplierName(supplierId: string) {
  return SUPPLIER_NAMES[supplierId] ?? "Unknown vendor";
}

export function billLineTotal(line: VendorBillLine) {
  return line.quantityBill * line.unitPriceBill;
}

export function billTotal(bill: VendorBill) {
  return bill.lines.reduce((s, l) => s + billLineTotal(l), 0);
}

export function lineVariancePct(line: VendorBillLine) {
  if (line.unitPricePo === 0) return 0;
  return Math.abs(((line.unitPriceBill - line.unitPricePo) / line.unitPricePo) * 100);
}

export function lineQtyVariance(line: VendorBillLine) {
  return line.quantityBill - line.quantityReceipt;
}

export function evaluateBillMatch(bill: VendorBill): {
  matchStatus: MatchStatus;
  status: BillStatus;
  variances: { lineId: string; pricePct: number; qtyDelta: number }[];
} {
  const variances = bill.lines.map((line) => ({
    lineId: line.id,
    pricePct: lineVariancePct(line),
    qtyDelta: lineQtyVariance(line),
  }));

  const hasQtyIssue = bill.lines.some(
    (l) => l.quantityBill !== l.quantityReceipt || l.quantityBill !== l.quantityPo,
  );
  const hasPriceIssue = bill.lines.some((l) => lineVariancePct(l) > MATCH_TOLERANCE_PCT);

  if (hasPriceIssue || hasQtyIssue) {
    const severe = bill.lines.some(
      (l) => lineVariancePct(l) > 5 || Math.abs(lineQtyVariance(l)) > 0,
    );
    return {
      matchStatus: severe ? "exception" : "partial_match",
      status: severe ? "exception" : "unmatched",
      variances,
    };
  }

  return { matchStatus: "matched", status: "matched", variances };
}

export const vendorBillsSeed: VendorBill[] = [
  {
    id: "bill_1001",
    number: "BILL-2026-0088",
    vendorInvoiceNumber: "INV-8842",
    purchaseOrderId: "po_002",
    poNumber: "PO-2026-0141",
    receiptId: "gr_1001",
    receiptNumber: "GR-2026-0312",
    supplierId: "sup_004",
    billDate: "2026-06-15",
    dueDate: "2026-07-15",
    status: "paid",
    matchStatus: "matched",
    lines: [
      {
        id: "bl_1001_1",
        poLineId: "pol_002_1",
        sku: "SKU-0005",
        name: "Smart Watch Series 5",
        quantityPo: 500,
        quantityReceipt: 300,
        quantityBill: 300,
        unitPricePo: 2500,
        unitPriceBill: 2500,
      },
    ],
    total: 750000,
    notes: "Three-way match clean — paid via AP.",
  },
  {
    id: "bill_1002",
    number: "BILL-2026-0082",
    vendorInvoiceNumber: "TQ-9901",
    purchaseOrderId: "po_004",
    poNumber: "PO-2026-0138",
    receiptId: "gr_1002",
    receiptNumber: "GR-2026-0298",
    supplierId: "sup_001",
    billDate: "2026-05-29",
    dueDate: "2026-06-28",
    status: "posted",
    matchStatus: "matched",
    lines: [
      {
        id: "bl_1002_1",
        poLineId: "pol_004_1",
        sku: "SKU-0006",
        name: "Bluetooth Speaker Mini",
        quantityPo: 80,
        quantityReceipt: 80,
        quantityBill: 80,
        unitPricePo: 7750,
        unitPriceBill: 7750,
      },
    ],
    total: 620000,
  },
  {
    id: "bill_1003",
    number: "BILL-2026-0075",
    vendorInvoiceNumber: "UW-INV-441",
    purchaseOrderId: "po_005",
    poNumber: "PO-2026-0135",
    receiptId: "gr_1003",
    receiptNumber: "GR-2026-0285",
    supplierId: "sup_002",
    billDate: "2026-05-11",
    dueDate: "2026-06-25",
    status: "paid",
    matchStatus: "matched",
    lines: [
      {
        id: "bl_1003_1",
        poLineId: "pol_005_1",
        sku: "SKU-0001",
        name: "Premium Cotton T-Shirt",
        quantityPo: 500,
        quantityReceipt: 500,
        quantityBill: 500,
        unitPricePo: 890,
        unitPriceBill: 890,
      },
    ],
    total: 445000,
  },
  {
    id: "bill_1004",
    number: "BILL-2026-0091",
    vendorInvoiceNumber: "TP-INV-2201",
    purchaseOrderId: "po_007",
    poNumber: "PO-2026-0144",
    receiptId: "gr_1004",
    receiptNumber: "GR-2026-0315",
    supplierId: "sup_001",
    billDate: "2026-06-14",
    dueDate: "2026-07-14",
    status: "exception",
    matchStatus: "exception",
    lines: [
      {
        id: "bl_1004_1",
        poLineId: "pol_007_1",
        sku: "SKU-0002",
        name: "Wireless Earbuds Pro",
        quantityPo: 500,
        quantityReceipt: 300,
        quantityBill: 300,
        unitPricePo: 39,
        unitPriceBill: 42,
      },
    ],
    total: 12600,
    notes: "Bill price 7.7% above PO — finance approval required.",
  },
  {
    id: "bill_1005",
    number: "BILL-2026-0094",
    vendorInvoiceNumber: "",
    purchaseOrderId: "po_006",
    poNumber: "PO-2026-0139",
    supplierId: "sup_004",
    billDate: "2026-06-16",
    dueDate: "2026-07-16",
    status: "draft",
    matchStatus: "unmatched",
    lines: [
      {
        id: "bl_1005_1",
        poLineId: "pol_006_1",
        sku: "SKU-0014",
        name: "USB-C Hub 7-in-1",
        quantityPo: 200,
        quantityReceipt: 0,
        quantityBill: 120,
        unitPricePo: 4900,
        unitPriceBill: 4900,
      },
    ],
    total: 588000,
  },
];

export function getVendorBillById(id: string) {
  return vendorBillsSeed.find((b) => b.id === id);
}

export function buildBillFromPurchaseOrder(
  po: PurchaseOrder,
  receiptId?: string,
  receiptNumber?: string,
): VendorBill {
  const stamp = Date.now();
  const id = `bill_${stamp}`;
  const lines: VendorBillLine[] = po.lines
    .filter((l) => l.quantityReceived > 0)
    .map((line, i) => ({
      id: `bl_${stamp}_${i}`,
      poLineId: line.id,
      sku: line.sku,
      name: line.name,
      quantityPo: line.quantityOrdered,
      quantityReceipt: line.quantityReceived,
      quantityBill: line.quantityReceived,
      unitPricePo: line.unitPrice,
      unitPriceBill: line.unitPrice,
    }));

  const bill: VendorBill = {
    id,
    number: `BILL-2026-${String(stamp).slice(-4)}`,
    vendorInvoiceNumber: "",
    purchaseOrderId: po.id,
    poNumber: po.number,
    receiptId,
    receiptNumber,
    supplierId: po.supplierId,
    billDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    status: "draft",
    matchStatus: "unmatched",
    lines: lines.length > 0 ? lines : po.lines.map((line, i) => ({
      id: `bl_${stamp}_${i}`,
      poLineId: line.id,
      sku: line.sku,
      name: line.name,
      quantityPo: line.quantityOrdered,
      quantityReceipt: line.quantityReceived,
      quantityBill: 0,
      unitPricePo: line.unitPrice,
      unitPriceBill: line.unitPrice,
    })),
    total: 0,
  };
  bill.total = billTotal(bill);
  return bill;
}
