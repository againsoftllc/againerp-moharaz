import { PURCHASE_ORDER_WAREHOUSES, type PurchaseOrder } from "./purchase-orders";

const SUPPLIER_NAMES: Record<string, string> = {
  sup_001: "TechPro Distributors Ltd",
  sup_002: "UrbanWear Manufacturing",
  sup_003: "GlowUp Beauty Imports",
  sup_004: "Shenzhen Electronics Co.",
  sup_005: "HomeNest Wholesale",
};

export type ReceiptStatus =
  | "draft"
  | "receiving"
  | "qc_pending"
  | "posted"
  | "completed"
  | "cancelled";

export type ReceiptLine = {
  id: string;
  poLineId: string;
  itemId?: string;
  sku: string;
  name: string;
  quantityOrdered: number;
  quantityReceived: number;
  batchLot?: string;
};

export type GoodsReceipt = {
  id: string;
  number: string;
  purchaseOrderId: string;
  poNumber: string;
  supplierId: string;
  warehouse: string;
  receivedDate: string;
  receivedBy: string;
  status: ReceiptStatus;
  receiveType?: string;
  lines: ReceiptLine[];
  notes?: string;
  postedAt?: string;
};

export const RECEIPT_STATUS_LABELS: Record<ReceiptStatus, string> = {
  draft: "Draft",
  receiving: "Receiving",
  qc_pending: "QC pending",
  posted: "Posted",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function receiptSupplierName(supplierId: string) {
  return SUPPLIER_NAMES[supplierId] ?? "Unknown vendor";
}

export function receiptLineQtyTotal(receipt: GoodsReceipt) {
  return receipt.lines.reduce((s, l) => s + l.quantityReceived, 0);
}

export const goodsReceiptsSeed: GoodsReceipt[] = [
  {
    id: "gr_1001",
    number: "GR-2026-0312",
    purchaseOrderId: "po_002",
    poNumber: "PO-2026-0141",
    supplierId: "sup_004",
    warehouse: "WH-DHK",
    receivedDate: "2026-06-14",
    receivedBy: "Warehouse Clerk",
    status: "completed",
    lines: [
      {
        id: "grl_1001_1",
        poLineId: "pol_002_1",
        sku: "SKU-0005",
        name: "Smart Watch Series 5",
        quantityOrdered: 500,
        quantityReceived: 300,
        batchLot: "LOT-2026-0412",
      },
    ],
    notes: "Partial delivery — balance expected next week.",
  },
  {
    id: "gr_1002",
    number: "GR-2026-0298",
    purchaseOrderId: "po_004",
    poNumber: "PO-2026-0138",
    supplierId: "sup_001",
    warehouse: "WH-DHK",
    receivedDate: "2026-05-28",
    receivedBy: "Rahim Uddin",
    status: "completed",
    lines: [
      {
        id: "grl_1002_1",
        poLineId: "pol_004_1",
        sku: "SKU-0006",
        name: "Bluetooth Speaker Mini",
        quantityOrdered: 80,
        quantityReceived: 80,
      },
    ],
  },
  {
    id: "gr_1003",
    number: "GR-2026-0285",
    purchaseOrderId: "po_005",
    poNumber: "PO-2026-0135",
    supplierId: "sup_002",
    warehouse: "WH-CTG",
    receivedDate: "2026-05-10",
    receivedBy: "Sadia Rahman",
    status: "completed",
    lines: [
      {
        id: "grl_1003_1",
        poLineId: "pol_005_1",
        sku: "SKU-0001",
        name: "Premium Cotton T-Shirt",
        quantityOrdered: 500,
        quantityReceived: 500,
      },
    ],
  },
  {
    id: "gr_1004",
    number: "GR-2026-0315",
    purchaseOrderId: "po_007",
    poNumber: "PO-2026-0144",
    supplierId: "sup_001",
    warehouse: "WH-SYL",
    receivedDate: "2026-06-13",
    receivedBy: "Warehouse Clerk",
    status: "posted",
    lines: [
      {
        id: "grl_1004_1",
        poLineId: "pol_007_1",
        sku: "SKU-0002",
        name: "Wireless Earbuds Pro",
        quantityOrdered: 500,
        quantityReceived: 300,
        batchLot: "LOT-2026-0520",
      },
    ],
  },
  {
    id: "gr_1005",
    number: "GR-2026-0318",
    purchaseOrderId: "po_006",
    poNumber: "PO-2026-0139",
    supplierId: "sup_004",
    warehouse: "WH-DHK",
    receivedDate: "2026-06-16",
    receivedBy: "Karim Ahmed",
    status: "receiving",
    lines: [
      {
        id: "grl_1005_1",
        poLineId: "pol_006_1",
        sku: "SKU-0014",
        name: "USB-C Hub 7-in-1",
        quantityOrdered: 200,
        quantityReceived: 120,
      },
    ],
    notes: "Count in progress at dock 3.",
  },
  {
    id: "gr_1006",
    number: "GR-2026-0319",
    purchaseOrderId: "po_001",
    poNumber: "PO-2026-0142",
    supplierId: "sup_001",
    warehouse: "WH-DHK",
    receivedDate: "2026-06-16",
    receivedBy: "Admin",
    status: "draft",
    lines: [
      {
        id: "grl_1006_1",
        poLineId: "pol_001_1",
        sku: "SKU-0002",
        name: "Wireless Earbuds Pro",
        quantityOrdered: 100,
        quantityReceived: 0,
      },
      {
        id: "grl_1006_2",
        poLineId: "pol_001_2",
        sku: "SKU-0014",
        name: "USB-C Hub 7-in-1",
        quantityOrdered: 100,
        quantityReceived: 0,
      },
    ],
  },
];

export function getGoodsReceiptById(id: string) {
  return goodsReceiptsSeed.find((r) => r.id === id);
}

export function getReceiptsByPurchaseOrder(poId: string) {
  return goodsReceiptsSeed.filter((r) => r.purchaseOrderId === poId);
}

export function buildReceiptFromPurchaseOrder(po: PurchaseOrder): GoodsReceipt {
  const stamp = Date.now();
  const id = `gr_${stamp}`;
  const openLines = po.lines.filter((l) => l.quantityReceived < l.quantityOrdered);

  return {
    id,
    number: `GR-2026-${String(stamp).slice(-4)}`,
    purchaseOrderId: po.id,
    poNumber: po.number,
    supplierId: po.supplierId,
    warehouse: po.warehouse,
    receivedDate: new Date().toISOString().slice(0, 10),
    receivedBy: "Warehouse Clerk",
    status: "draft",
    lines: (openLines.length > 0 ? openLines : po.lines).map((line, i) => ({
      id: `grl_${stamp}_${i}`,
      poLineId: line.id,
      sku: line.sku,
      name: line.name,
      quantityOrdered: line.quantityOrdered,
      quantityReceived: Math.max(0, line.quantityOrdered - line.quantityReceived),
    })),
  };
}

export { PURCHASE_ORDER_WAREHOUSES };
