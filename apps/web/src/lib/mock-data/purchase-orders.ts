const SUPPLIER_NAMES: Record<string, string> = {
  sup_001: "TechPro Distributors Ltd",
  sup_002: "UrbanWear Manufacturing",
  sup_003: "GlowUp Beauty Imports",
  sup_004: "Shenzhen Electronics Co.",
  sup_005: "HomeNest Wholesale",
};

function supplierName(id: string) {
  return SUPPLIER_NAMES[id] ?? "Unknown vendor";
}

export type PurchaseOrderStatus =
  | "draft"
  | "confirmed"
  | "partial_received"
  | "completed"
  | "cancelled"
  | "pending_approval"
  | "approved"
  | "ordered"
  | "partially_received"
  | "received"
  | "closed"
  | "rejected";

export type PurchaseOrderLine = {
  id: string;
  productId: string;
  itemId?: string;
  sku: string;
  name: string;
  quantityOrdered: number;
  quantityReceived: number;
  quantityBilled: number;
  quantityReturned: number;
  unitPrice: number;
  taxRate?: number;
  discountAmount?: number;
};

export type PurchaseOrder = {
  id: string;
  number: string;
  supplierId: string;
  supplierName?: string;
  warehouseId?: string;
  orderDate: string;
  expectedDate: string;
  warehouse: string;
  buyer: string;
  total: number;
  status: PurchaseOrderStatus;
  paymentStatus?: "not_billed" | "unpaid" | "partial" | "paid";
  paymentDue?: number;
  createdByName?: string;
  lines: PurchaseOrderLine[];
  receiptIds: string[];
  billIds: string[];
  returnIds: string[];
  notes?: string;
  allowOverReceive?: boolean;
};

/** Slim row for supplier tabs / legacy tables */
export type PurchaseOrderSummary = {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  status: "draft" | "sent" | "partial" | "received" | "cancelled";
  items: number;
  total: number;
  expectedAt: string;
  createdAt: string;
};

export const PURCHASE_ORDER_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  draft: "Draft",
  confirmed: "Confirmed",
  partial_received: "Partial Receive",
  completed: "Completed",
  cancelled: "Cancelled",
  pending_approval: "Pending approval",
  approved: "Approved",
  ordered: "Ordered",
  partially_received: "Partially received",
  received: "Received",
  closed: "Closed",
  rejected: "Rejected",
};

export const PURCHASE_ORDER_WAREHOUSES = ["WH-DHK", "WH-CTG", "WH-SYL"];

const BUYERS = ["Rahim Uddin", "Sadia Rahman", "Karim Ahmed", "Admin", "Manager"];

export function formatPurchaseOrderVendor(po: PurchaseOrder) {
  return supplierName(po.supplierId);
}

export function purchaseOrderReceivedPct(po: PurchaseOrder) {
  const ordered = po.lines.reduce((s, l) => s + l.quantityOrdered, 0);
  const received = po.lines.reduce((s, l) => s + l.quantityReceived, 0);
  if (ordered === 0) return 0;
  return Math.round((received / ordered) * 100);
}

export function toLegacyPoStatus(
  status: PurchaseOrderStatus,
): PurchaseOrderSummary["status"] {
  switch (status) {
    case "ordered":
    case "approved":
      return "sent";
    case "partially_received":
      return "partial";
    case "received":
    case "closed":
      return "received";
    case "cancelled":
    case "rejected":
      return "cancelled";
    default:
      return "draft";
  }
}

export function toPurchaseOrderSummary(po: PurchaseOrder): PurchaseOrderSummary {
  return {
    id: po.id,
    poNumber: po.number,
    supplierId: po.supplierId,
    supplierName: formatPurchaseOrderVendor(po),
    status: toLegacyPoStatus(po.status),
    items: po.lines.length,
    total: po.total,
    expectedAt: po.expectedDate,
    createdAt: po.orderDate,
  };
}

export const purchaseOrdersSeed: PurchaseOrder[] = [
  {
    id: "po_001",
    number: "PO-2026-0142",
    supplierId: "sup_001",
    orderDate: "2026-06-14",
    expectedDate: "2026-06-20",
    warehouse: "WH-DHK",
    buyer: "Rahim Uddin",
    total: 840000,
    status: "ordered",
    lines: [
      {
        id: "pol_001_1",
        productId: "prod_0002",
        sku: "SKU-0002",
        name: "Wireless Earbuds Pro",
        quantityOrdered: 100,
        quantityReceived: 0,
        quantityBilled: 0,
        quantityReturned: 0,
        unitPrice: 4200,
      },
      {
        id: "pol_001_2",
        productId: "prod_0014",
        sku: "SKU-0014",
        name: "USB-C Hub 7-in-1",
        quantityOrdered: 100,
        quantityReceived: 0,
        quantityBilled: 0,
        quantityReturned: 0,
        unitPrice: 4200,
      },
    ],
    receiptIds: ["gr_1006"],
    billIds: [],
    returnIds: [],
    notes: "Electronics restock — contract CTR-2026-004 pricing.",
  },
  {
    id: "po_002",
    number: "PO-2026-0141",
    supplierId: "sup_004",
    orderDate: "2026-06-10",
    expectedDate: "2026-07-05",
    warehouse: "WH-DHK",
    buyer: "Karim Ahmed",
    total: 1250000,
    status: "partially_received",
    lines: [
      {
        id: "pol_002_1",
        productId: "prod_0005",
        sku: "SKU-0005",
        name: "Smart Watch Series 5",
        quantityOrdered: 500,
        quantityReceived: 300,
        quantityBilled: 300,
        quantityReturned: 20,
        unitPrice: 2500,
      },
    ],
    receiptIds: ["gr_1001"],
    billIds: ["bill_1001"],
    returnIds: ["pr_1003", "pr_1006"],
  },
  {
    id: "po_003",
    number: "PO-2026-0140",
    supplierId: "sup_003",
    orderDate: "2026-06-15",
    expectedDate: "2026-06-25",
    warehouse: "WH-CTG",
    buyer: "Sadia Rahman",
    total: 186000,
    status: "pending_approval",
    lines: [
      {
        id: "pol_003_1",
        productId: "prod_0008",
        sku: "SKU-0008",
        name: "Organic Face Serum",
        quantityOrdered: 120,
        quantityReceived: 0,
        quantityBilled: 0,
        quantityReturned: 0,
        unitPrice: 1550,
      },
    ],
    receiptIds: [],
    billIds: [],
    returnIds: [],
  },
  {
    id: "po_004",
    number: "PO-2026-0138",
    supplierId: "sup_001",
    orderDate: "2026-05-15",
    expectedDate: "2026-05-28",
    warehouse: "WH-DHK",
    buyer: "Manager",
    total: 620000,
    status: "received",
    lines: [
      {
        id: "pol_004_1",
        productId: "prod_0006",
        sku: "SKU-0006",
        name: "Bluetooth Speaker Mini",
        quantityOrdered: 80,
        quantityReceived: 80,
        quantityBilled: 80,
        quantityReturned: 5,
        unitPrice: 7750,
      },
    ],
    receiptIds: ["gr_1002"],
    billIds: ["bill_1002"],
    returnIds: ["pr_1001", "pr_1005"],
  },
  {
    id: "po_005",
    number: "PO-2026-0135",
    supplierId: "sup_002",
    orderDate: "2026-04-28",
    expectedDate: "2026-05-10",
    warehouse: "WH-CTG",
    buyer: "Sadia Rahman",
    total: 445000,
    status: "closed",
    lines: [
      {
        id: "pol_005_1",
        productId: "prod_0001",
        sku: "SKU-0001",
        name: "Premium Cotton T-Shirt",
        quantityOrdered: 500,
        quantityReceived: 500,
        quantityBilled: 500,
        quantityReturned: 12,
        unitPrice: 890,
      },
    ],
    receiptIds: ["gr_1003"],
    billIds: ["bill_1003"],
    returnIds: ["pr_1002"],
  },
  {
    id: "po_006",
    number: "PO-2026-0139",
    supplierId: "sup_004",
    orderDate: "2026-06-08",
    expectedDate: "2026-06-30",
    warehouse: "WH-DHK",
    buyer: "Karim Ahmed",
    total: 980000,
    status: "ordered",
    lines: [
      {
        id: "pol_006_1",
        productId: "prod_0014",
        sku: "SKU-0014",
        name: "USB-C Hub 7-in-1",
        quantityOrdered: 200,
        quantityReceived: 0,
        quantityBilled: 0,
        quantityReturned: 0,
        unitPrice: 4900,
      },
    ],
    receiptIds: ["gr_1005"],
    billIds: ["bill_1005"],
    returnIds: [],
  },
  {
    id: "po_007",
    number: "PO-2026-0144",
    supplierId: "sup_001",
    orderDate: "2026-06-12",
    expectedDate: "2026-06-18",
    warehouse: "WH-SYL",
    buyer: "Rahim Uddin",
    total: 19500,
    status: "partially_received",
    lines: [
      {
        id: "pol_007_1",
        productId: "prod_0002",
        sku: "SKU-0002",
        name: "Wireless Earbuds Pro",
        quantityOrdered: 500,
        quantityReceived: 300,
        quantityBilled: 300,
        quantityReturned: 0,
        unitPrice: 39,
      },
    ],
    receiptIds: ["gr_1004"],
    billIds: ["bill_1004"],
    returnIds: ["pr_1004"],
    notes: "RFQ award converted — Global Parts pricing matched.",
  },
  {
    id: "po_008",
    number: "PO-2026-0145",
    supplierId: "sup_002",
    orderDate: "2026-06-16",
    expectedDate: "2026-06-28",
    warehouse: "WH-DHK",
    buyer: "Admin",
    total: 67200,
    status: "draft",
    lines: [
      {
        id: "pol_008_1",
        productId: "prod_0004",
        sku: "SKU-0004",
        name: "Running Shoes Ultra",
        quantityOrdered: 48,
        quantityReceived: 0,
        quantityBilled: 0,
        quantityReturned: 0,
        unitPrice: 1400,
      },
    ],
    receiptIds: [],
    billIds: [],
    returnIds: [],
    notes: "Awaiting buyer review before submit.",
  },
];

export function getPurchaseOrderById(id: string) {
  return purchaseOrdersSeed.find((po) => po.id === id);
}

export function getPurchaseOrdersBySupplier(supplierId: string) {
  return purchaseOrdersSeed.filter((po) => po.supplierId === supplierId);
}

export function buildPurchaseOrderDraft(input: {
  supplierId: string;
  warehouse: string;
  expectedDate: string;
  buyer?: string;
  notes?: string;
  lines: Omit<PurchaseOrderLine, "id" | "quantityReceived" | "quantityBilled" | "quantityReturned">[];
}): PurchaseOrder {
  const stamp = Date.now();
  const id = `po_${stamp}`;
  const lines: PurchaseOrderLine[] = input.lines.map((line, i) => ({
    ...line,
    id: `pol_${stamp}_${i}`,
    quantityReceived: 0,
    quantityBilled: 0,
    quantityReturned: 0,
  }));
  const total = lines.reduce((s, l) => s + l.quantityOrdered * l.unitPrice, 0);

  return {
    id,
    number: `PO-2026-${String(stamp).slice(-4)}`,
    supplierId: input.supplierId,
    orderDate: new Date().toISOString().slice(0, 10),
    expectedDate: input.expectedDate,
    warehouse: input.warehouse,
    buyer: input.buyer ?? BUYERS[0],
    total,
    status: "draft",
    lines,
    receiptIds: [],
    billIds: [],
    returnIds: [],
    notes: input.notes,
  };
}
