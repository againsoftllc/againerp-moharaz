export type StockStatus = "in_stock" | "low_stock" | "out_of_stock" | "overstock";

export type TransferStatus = "draft" | "in_transit" | "received" | "cancelled";

export type AdjustmentStatus = "pending" | "approved" | "rejected";

export const INVENTORY_TABS = [
  "dashboard",
  "stock",
  "warehouses",
  "transfers",
  "adjustments",
  "reservations",
] as const;

export type InventoryTab = (typeof INVENTORY_TABS)[number];

export const INVENTORY_TAB_LABELS: Record<InventoryTab, string> = {
  dashboard: "Dashboard",
  stock: "Stock",
  warehouses: "Warehouses",
  transfers: "Transfers",
  adjustments: "Adjustments",
  reservations: "Reservations",
};

export const inventoryKpis = [
  { label: "Total SKUs", value: "486", sub: "Across 3 warehouses" },
  { label: "Total units", value: "24,820", sub: "+1.2% vs last week", up: true },
  { label: "Stock value", value: "৳18.4M", sub: "FIFO valuation" },
  { label: "Low stock items", value: 14, sub: "Below min threshold", alert: true },
];

export const stockMovementChart = [
  { day: "Mon", inbound: 420, outbound: 380 },
  { day: "Tue", inbound: 310, outbound: 290 },
  { day: "Wed", inbound: 580, outbound: 410 },
  { day: "Thu", inbound: 240, outbound: 520 },
  { day: "Fri", inbound: 390, outbound: 460 },
  { day: "Sat", inbound: 180, outbound: 220 },
  { day: "Sun", inbound: 120, outbound: 95 },
];

export const warehouseDistribution = [
  { name: "Dhaka HQ", units: 14200 },
  { name: "Chittagong", units: 6800 },
  { name: "Online FC", units: 3820 },
];

export type StockItem = {
  id: string;
  sku: string;
  name: string;
  warehouse: string;
  onHand: number;
  reserved: number;
  available: number;
  incoming: number;
  projected?: number;
  minQty: number;
  maxQty: number;
  status: StockStatus;
  unitCost: number;
  updatedAt: string;
  thumbnail?: string;
  /** Optional — present on API-backed rows, absent on the seeds below. */
  warehouseId?: string;
  warehouseCode?: string;
  productId?: string;
  itemId?: string | null;
  reorderLevel?: number;
  stockValue?: number;
};

export const stockItemsSeed: StockItem[] = [
  {
    id: "inv_001",
    sku: "SKU-0002",
    name: "Wireless Earbuds Pro",
    warehouse: "Dhaka HQ",
    onHand: 8,
    reserved: 3,
    available: 5,
    incoming: 50,
    minQty: 15,
    maxQty: 200,
    status: "low_stock",
    unitCost: 2100,
    updatedAt: "2026-06-15",
    thumbnail: "https://picsum.photos/seed/inv-earbuds/48/48",
  },
  {
    id: "inv_002",
    sku: "SKU-0005",
    name: "Smart Watch Series 5",
    warehouse: "Dhaka HQ",
    onHand: 3,
    reserved: 1,
    available: 2,
    incoming: 0,
    minQty: 10,
    maxQty: 80,
    status: "low_stock",
    unitCost: 8900,
    updatedAt: "2026-06-15",
    thumbnail: "https://picsum.photos/seed/inv-watch/48/48",
  },
  {
    id: "inv_003",
    sku: "SKU-0014",
    name: "USB-C Hub 7-in-1",
    warehouse: "Online FC",
    onHand: 0,
    reserved: 0,
    available: 0,
    incoming: 24,
    minQty: 5,
    maxQty: 60,
    status: "out_of_stock",
    unitCost: 1200,
    updatedAt: "2026-06-14",
    thumbnail: "https://picsum.photos/seed/inv-hub/48/48",
  },
  {
    id: "inv_004",
    sku: "SKU-0001",
    name: "Premium Cotton T-Shirt",
    warehouse: "Dhaka HQ",
    onHand: 186,
    reserved: 12,
    available: 174,
    incoming: 0,
    minQty: 30,
    maxQty: 300,
    status: "in_stock",
    unitCost: 450,
    updatedAt: "2026-06-15",
    thumbnail: "https://picsum.photos/seed/inv-tee/48/48",
  },
  {
    id: "inv_005",
    sku: "SKU-0007",
    name: "Bluetooth Speaker Mini",
    warehouse: "Chittagong",
    onHand: 420,
    reserved: 8,
    available: 412,
    incoming: 0,
    minQty: 20,
    maxQty: 150,
    status: "overstock",
    unitCost: 1800,
    updatedAt: "2026-06-13",
    thumbnail: "https://picsum.photos/seed/inv-speaker/48/48",
  },
  {
    id: "inv_006",
    sku: "SKU-0004",
    name: "Running Shoes Ultra",
    warehouse: "Dhaka HQ",
    onHand: 42,
    reserved: 6,
    available: 36,
    incoming: 30,
    minQty: 15,
    maxQty: 100,
    status: "in_stock",
    unitCost: 3200,
    updatedAt: "2026-06-12",
    thumbnail: "https://picsum.photos/seed/inv-shoes/48/48",
  },
  {
    id: "inv_007",
    sku: "SKU-0010",
    name: "LED Desk Lamp",
    warehouse: "Online FC",
    onHand: 28,
    reserved: 2,
    available: 26,
    incoming: 0,
    minQty: 10,
    maxQty: 80,
    status: "in_stock",
    unitCost: 980,
    updatedAt: "2026-06-11",
    thumbnail: "https://picsum.photos/seed/inv-lamp/48/48",
  },
  {
    id: "inv_008",
    sku: "SKU-0008",
    name: "Organic Face Serum",
    warehouse: "Chittagong",
    onHand: 6,
    reserved: 0,
    available: 6,
    incoming: 40,
    minQty: 12,
    maxQty: 90,
    status: "low_stock",
    unitCost: 1100,
    updatedAt: "2026-06-15",
    thumbnail: "https://picsum.photos/seed/inv-serum/48/48",
  },
];

/** Raw materials for manufacturing integration (merged into inventory store). */
export const rawMaterialStockSeed: StockItem[] = [
  {
    id: "inv_rm_001",
    sku: "RM-EAR-HOUSING",
    name: "Earbud housing set (L/R)",
    warehouse: "Dhaka HQ",
    onHand: 820,
    reserved: 320,
    available: 500,
    incoming: 0,
    minQty: 200,
    maxQty: 2000,
    status: "in_stock",
    unitCost: 80,
    updatedAt: "2026-06-15",
  },
  {
    id: "inv_rm_002",
    sku: "RM-PCB-AUDIO",
    name: "Audio PCB + BT module",
    warehouse: "Dhaka HQ",
    onHand: 640,
    reserved: 320,
    available: 320,
    incoming: 100,
    minQty: 150,
    maxQty: 1500,
    status: "in_stock",
    unitCost: 120,
    updatedAt: "2026-06-15",
  },
  {
    id: "inv_rm_003",
    sku: "RM-CASE-USB",
    name: "Charge case shell + lid",
    warehouse: "Dhaka HQ",
    onHand: 380,
    reserved: 160,
    available: 220,
    incoming: 0,
    minQty: 80,
    maxQty: 800,
    status: "in_stock",
    unitCost: 150,
    updatedAt: "2026-06-15",
  },
  {
    id: "inv_rm_004",
    sku: "RM-USB-CABLE",
    name: "USB-C charge cable (0.5m)",
    warehouse: "Dhaka HQ",
    onHand: 450,
    reserved: 160,
    available: 290,
    incoming: 0,
    minQty: 100,
    maxQty: 1000,
    status: "in_stock",
    unitCost: 45,
    updatedAt: "2026-06-15",
  },
  {
    id: "inv_rm_005",
    sku: "RM-EAR-TIPS",
    name: "Silicone ear tips (S/M/L)",
    warehouse: "Dhaka HQ",
    onHand: 1200,
    reserved: 480,
    available: 720,
    incoming: 0,
    minQty: 300,
    maxQty: 3000,
    status: "in_stock",
    unitCost: 15,
    updatedAt: "2026-06-15",
  },
  {
    id: "inv_rm_006",
    sku: "RM-COTTON",
    name: "Premium cotton fabric roll",
    warehouse: "Chittagong",
    onHand: 2400,
    reserved: 0,
    available: 2400,
    incoming: 500,
    minQty: 500,
    maxQty: 5000,
    status: "in_stock",
    unitCost: 95,
    updatedAt: "2026-06-14",
  },
  {
    id: "inv_rm_007",
    sku: "RM-THREAD",
    name: "Polyester thread spool",
    warehouse: "Chittagong",
    onHand: 180,
    reserved: 0,
    available: 180,
    incoming: 0,
    minQty: 40,
    maxQty: 400,
    status: "in_stock",
    unitCost: 12,
    updatedAt: "2026-06-14",
  },
  {
    id: "inv_rm_008",
    sku: "RM-LABEL",
    name: "Woven brand label",
    warehouse: "Chittagong",
    onHand: 5200,
    reserved: 0,
    available: 5200,
    incoming: 0,
    minQty: 500,
    maxQty: 10000,
    status: "in_stock",
    unitCost: 8,
    updatedAt: "2026-06-14",
  },
];

export type StockMovementType = "stock_in" | "stock_out" | "reserve" | "unreserve";

export type StockMovementReferenceType =
  | "work_order"
  | "purchase_receipt"
  | "adjustment"
  | "transfer";

export type StockMovement = {
  id: string;
  type: StockMovementType;
  sku: string;
  productName: string;
  warehouse: string;
  quantity: number;
  unitCost?: number;
  totalValue?: number;
  referenceType: StockMovementReferenceType;
  referenceId: string;
  referenceLabel: string;
  event: string;
  postedAt: string;
};

/** Manufacturing WH codes → inventory warehouse names. */
export const MANUFACTURING_WAREHOUSE_MAP: Record<string, string> = {
  "WH-DHK": "Dhaka HQ",
  "WH-CTG": "Chittagong",
  "WH-SYL": "Online FC",
};

export function mapManufacturingWarehouse(mfgCode: string): string {
  return MANUFACTURING_WAREHOUSE_MAP[mfgCode] ?? mfgCode;
}

export type Warehouse = {
  id: string;
  code: string;
  name: string;
  type: string;
  branchId?: string | null;
  branchName?: string;
  address: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  mobile?: string;
  alternateContact?: string;
  email?: string;
  website?: string;
  invoiceLayout?: string;
  paymentOption?: string;
  locations: number;
  totalUnits: number;
  active: boolean;
  /** Optional — present on API-backed rows, absent on the seeds below. */
  isDefault?: boolean;
  sortOrder?: number;
};

export const warehousesSeed: Warehouse[] = [
  {
    id: "wh_dhaka",
    code: "DHK-HQ",
    name: "Dhaka HQ",
    type: "Main warehouse",
    address: "Gulshan-2, Dhaka",
    locations: 24,
    totalUnits: 14200,
    active: true,
  },
  {
    id: "wh_ctg",
    code: "CTG-01",
    name: "Chittagong",
    type: "Regional",
    address: "Agrabad, Chittagong",
    locations: 12,
    totalUnits: 6800,
    active: true,
  },
  {
    id: "wh_fc",
    code: "ONL-FC",
    name: "Online Fulfillment Center",
    type: "Ecommerce FC",
    address: "Savar EPZ",
    locations: 18,
    totalUnits: 3820,
    active: true,
  },
];

export type StockTransfer = {
  id: string;
  from: string;
  to: string;
  items: number;
  units: number;
  status: TransferStatus;
  createdAt: string;
};

export const transfersSeed: StockTransfer[] = [
  {
    id: "TRF-1042",
    from: "Dhaka HQ",
    to: "Online FC",
    items: 3,
    units: 120,
    status: "in_transit",
    createdAt: "2026-06-14",
  },
  {
    id: "TRF-1041",
    from: "Chittagong",
    to: "Dhaka HQ",
    items: 5,
    units: 240,
    status: "in_transit",
    createdAt: "2026-06-13",
  },
  {
    id: "TRF-1040",
    from: "Dhaka HQ",
    to: "Chittagong",
    items: 2,
    units: 80,
    status: "draft",
    createdAt: "2026-06-15",
  },
  {
    id: "TRF-1039",
    from: "Online FC",
    to: "Dhaka HQ",
    items: 1,
    units: 24,
    status: "received",
    createdAt: "2026-06-12",
  },
];

export type StockAdjustment = {
  id: string;
  warehouse: string;
  sku: string;
  product: string;
  qtyChange: number;
  reason: string;
  status: AdjustmentStatus;
  requestedAt: string;
};

export const adjustmentsSeed: StockAdjustment[] = [
  {
    id: "ADJ-088",
    warehouse: "Dhaka HQ",
    sku: "SKU-0014",
    product: "USB-C Hub 7-in-1",
    qtyChange: -2,
    reason: "Cycle count variance",
    status: "pending",
    requestedAt: "2026-06-15 09:30",
  },
  {
    id: "ADJ-087",
    warehouse: "Online FC",
    sku: "SKU-0002",
    product: "Wireless Earbuds Pro",
    qtyChange: 50,
    reason: "Purchase receipt correction",
    status: "approved",
    requestedAt: "2026-06-14 14:20",
  },
  {
    id: "ADJ-086",
    warehouse: "Chittagong",
    sku: "SKU-0007",
    product: "Bluetooth Speaker Mini",
    qtyChange: -5,
    reason: "Damaged in transit",
    status: "pending",
    requestedAt: "2026-06-14 11:00",
  },
];

export type StockReservation = {
  id: string;
  orderId: string;
  sku: string;
  product: string;
  warehouse: string;
  qty: number;
  expiresAt: string;
};

export const reservationsSeed: StockReservation[] = [
  {
    id: "res_001",
    orderId: "ORD-01042",
    sku: "SKU-0002",
    product: "Wireless Earbuds Pro",
    warehouse: "Dhaka HQ",
    qty: 2,
    expiresAt: "2026-06-16 18:00",
  },
  {
    id: "res_002",
    orderId: "ORD-01041",
    sku: "SKU-0005",
    product: "Smart Watch Series 5",
    warehouse: "Dhaka HQ",
    qty: 1,
    expiresAt: "2026-06-16 12:00",
  },
  {
    id: "res_003",
    orderId: "ORD-01040",
    sku: "SKU-0001",
    product: "Premium Cotton T-Shirt",
    warehouse: "Dhaka HQ",
    qty: 3,
    expiresAt: "2026-06-17 09:00",
  },
  {
    id: "res_004",
    orderId: "ORD-01038",
    sku: "SKU-0004",
    product: "Running Shoes Ultra",
    warehouse: "Dhaka HQ",
    qty: 1,
    expiresAt: "2026-06-15 20:00",
  },
];

export const lowStockAlerts = stockItemsSeed.filter(
  (s) => s.status === "low_stock" || s.status === "out_of_stock",
);

export const expiringBatches = [
  { lot: "LOT-2026-041", product: "Organic Face Serum", expiry: "2026-07-15", qty: 24 },
  { lot: "LOT-2026-038", product: "Scented Candle Pack", expiry: "2026-08-01", qty: 48 },
];

export const aiForecastHighlights = [
  { title: "Reorder suggested", body: "Wireless Earbuds Pro — PO draft for 50 units ready" },
  { title: "Slow mover", body: "Bluetooth Speaker Mini overstock at Chittagong (+180% vs max)" },
  { title: "Incoming stock", body: "USB-C Hub 24 units arriving Jun 17 from supplier" },
];

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  in_stock: "In stock",
  low_stock: "Low stock",
  out_of_stock: "Out of stock",
  overstock: "Overstock",
};

export function formatBdt(amount: number) {
  return `৳${amount.toLocaleString("en-BD")}`;
}

// ─── Extended Stock Items (more products) ─────────────────────────────────────

export const extendedStockSeed: StockItem[] = [
  ...stockItemsSeed,
  {
    id: "inv_009",
    sku: "SKU-0015",
    name: "Yoga Mat Pro",
    warehouse: "Dhaka HQ",
    onHand: 55,
    reserved: 3,
    available: 52,
    incoming: 0,
    minQty: 20,
    maxQty: 120,
    status: "in_stock",
    unitCost: 890,
    updatedAt: "2026-06-14",
    thumbnail: "https://picsum.photos/seed/inv-yoga/48/48",
  },
  {
    id: "inv_010",
    sku: "SKU-0016",
    name: "Stainless Steel Bottle",
    warehouse: "Chittagong",
    onHand: 9,
    reserved: 2,
    available: 7,
    incoming: 60,
    minQty: 25,
    maxQty: 200,
    status: "low_stock",
    unitCost: 650,
    updatedAt: "2026-06-15",
    thumbnail: "https://picsum.photos/seed/inv-bottle/48/48",
  },
  {
    id: "inv_011",
    sku: "SKU-0017",
    name: "Mechanical Keyboard",
    warehouse: "Online FC",
    onHand: 22,
    reserved: 4,
    available: 18,
    incoming: 0,
    minQty: 10,
    maxQty: 60,
    status: "in_stock",
    unitCost: 3800,
    updatedAt: "2026-06-13",
    thumbnail: "https://picsum.photos/seed/inv-kb/48/48",
  },
  {
    id: "inv_012",
    sku: "SKU-0018",
    name: "Portable Power Bank 20000",
    warehouse: "Dhaka HQ",
    onHand: 0,
    reserved: 0,
    available: 0,
    incoming: 30,
    minQty: 10,
    maxQty: 80,
    status: "out_of_stock",
    unitCost: 2200,
    updatedAt: "2026-06-15",
    thumbnail: "https://picsum.photos/seed/inv-pb/48/48",
  },
  {
    id: "inv_013",
    sku: "SKU-0019",
    name: "Wireless Mouse",
    warehouse: "Dhaka HQ",
    onHand: 38,
    reserved: 5,
    available: 33,
    incoming: 20,
    minQty: 15,
    maxQty: 100,
    status: "in_stock",
    unitCost: 1100,
    updatedAt: "2026-06-12",
    thumbnail: "https://picsum.photos/seed/inv-mouse/48/48",
  },
  {
    id: "inv_014",
    sku: "SKU-0020",
    name: "Scented Candle Pack (3)",
    warehouse: "Chittagong",
    onHand: 14,
    reserved: 0,
    available: 14,
    incoming: 0,
    minQty: 20,
    maxQty: 150,
    status: "low_stock",
    unitCost: 780,
    updatedAt: "2026-06-14",
    thumbnail: "https://picsum.photos/seed/inv-candle/48/48",
  },
  {
    id: "inv_015",
    sku: "SKU-0021",
    name: "Gaming Headset",
    warehouse: "Online FC",
    onHand: 7,
    reserved: 2,
    available: 5,
    incoming: 15,
    minQty: 10,
    maxQty: 50,
    status: "low_stock",
    unitCost: 4500,
    updatedAt: "2026-06-15",
    thumbnail: "https://picsum.photos/seed/inv-headset/48/48",
  },
  {
    id: "inv_016",
    sku: "SKU-0022",
    name: "Leather Wallet",
    warehouse: "Dhaka HQ",
    onHand: 320,
    reserved: 10,
    available: 310,
    incoming: 0,
    minQty: 30,
    maxQty: 200,
    status: "overstock",
    unitCost: 1200,
    updatedAt: "2026-06-11",
    thumbnail: "https://picsum.photos/seed/inv-wallet/48/48",
  },
];

// ─── Purchase Orders ───────────────────────────────────────────────────────────

export type PurchaseOrderStatus = "draft" | "sent" | "confirmed" | "partial" | "received" | "cancelled";

export type PurchaseOrderItem = {
  sku: string;
  name: string;
  ordered: number;
  received: number;
  unitCost: number;
};

export type PurchaseOrder = {
  id: string;
  supplier: string;
  status: PurchaseOrderStatus;
  warehouse: string;
  items: PurchaseOrderItem[];
  totalValue: number;
  expectedDate: string;
  createdAt: string;
  notes?: string;
};

export const purchaseOrdersSeed: PurchaseOrder[] = [
  {
    id: "PO-2026-041",
    supplier: "Shenzhen TechParts Co.",
    status: "confirmed",
    warehouse: "Dhaka HQ",
    items: [
      { sku: "SKU-0002", name: "Wireless Earbuds Pro", ordered: 50, received: 0, unitCost: 2100 },
      { sku: "SKU-0021", name: "Gaming Headset", ordered: 15, received: 0, unitCost: 4500 },
    ],
    totalValue: 172500,
    expectedDate: "2026-06-20",
    createdAt: "2026-06-10",
    notes: "Urgent restock — low stock items",
  },
  {
    id: "PO-2026-040",
    supplier: "Fabric House BD",
    status: "received",
    warehouse: "Chittagong",
    items: [
      { sku: "RM-COTTON", name: "Premium cotton fabric roll", ordered: 500, received: 500, unitCost: 95 },
      { sku: "RM-THREAD", name: "Polyester thread spool", ordered: 200, received: 200, unitCost: 12 },
    ],
    totalValue: 49900,
    expectedDate: "2026-06-12",
    createdAt: "2026-06-05",
  },
  {
    id: "PO-2026-039",
    supplier: "GlobalTech Imports",
    status: "partial",
    warehouse: "Online FC",
    items: [
      { sku: "SKU-0014", name: "USB-C Hub 7-in-1", ordered: 24, received: 12, unitCost: 1200 },
      { sku: "SKU-0018", name: "Portable Power Bank 20000", ordered: 30, received: 0, unitCost: 2200 },
    ],
    totalValue: 94800,
    expectedDate: "2026-06-18",
    createdAt: "2026-06-03",
    notes: "Hub partial delivery — remaining on 2026-06-20",
  },
  {
    id: "PO-2026-038",
    supplier: "Beauty Essentials Ltd",
    status: "sent",
    warehouse: "Chittagong",
    items: [
      { sku: "SKU-0008", name: "Organic Face Serum", ordered: 40, received: 0, unitCost: 1100 },
      { sku: "SKU-0020", name: "Scented Candle Pack (3)", ordered: 80, received: 0, unitCost: 780 },
    ],
    totalValue: 106400,
    expectedDate: "2026-06-25",
    createdAt: "2026-06-08",
  },
  {
    id: "PO-2026-037",
    supplier: "Shenzhen TechParts Co.",
    status: "draft",
    warehouse: "Dhaka HQ",
    items: [
      { sku: "SKU-0005", name: "Smart Watch Series 5", ordered: 20, received: 0, unitCost: 8900 },
    ],
    totalValue: 178000,
    expectedDate: "2026-06-28",
    createdAt: "2026-06-15",
    notes: "Auto-generated from reorder rule",
  },
  {
    id: "PO-2026-036",
    supplier: "Summit Sports BD",
    status: "received",
    warehouse: "Dhaka HQ",
    items: [
      { sku: "SKU-0004", name: "Running Shoes Ultra", ordered: 30, received: 30, unitCost: 3200 },
      { sku: "SKU-0015", name: "Yoga Mat Pro", ordered: 30, received: 30, unitCost: 890 },
    ],
    totalValue: 122700,
    expectedDate: "2026-06-10",
    createdAt: "2026-05-30",
  },
  {
    id: "PO-2026-035",
    supplier: "Tech Accessories Ltd",
    status: "confirmed",
    warehouse: "Chittagong",
    items: [
      { sku: "SKU-0016", name: "Stainless Steel Bottle", ordered: 60, received: 0, unitCost: 650 },
      { sku: "SKU-0019", name: "Wireless Mouse", ordered: 20, received: 0, unitCost: 1100 },
    ],
    totalValue: 61000,
    expectedDate: "2026-06-22",
    createdAt: "2026-06-11",
  },
  {
    id: "PO-2026-034",
    supplier: "Shenzhen TechParts Co.",
    status: "cancelled",
    warehouse: "Online FC",
    items: [
      { sku: "SKU-0017", name: "Mechanical Keyboard", ordered: 20, received: 0, unitCost: 3800 },
    ],
    totalValue: 76000,
    expectedDate: "2026-06-05",
    createdAt: "2026-05-20",
    notes: "Cancelled — supplier out of stock",
  },
];

export const PO_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  confirmed: "Confirmed",
  partial: "Partial",
  received: "Received",
  cancelled: "Cancelled",
};

// ─── Batch / Lot / Expiry ─────────────────────────────────────────────────────

export type BatchStatus = "active" | "quarantine" | "expired" | "consumed";

export type BatchRecord = {
  id: string;
  lot: string;
  sku: string;
  product: string;
  warehouse: string;
  location?: string;
  quantity: number;
  consumed: number;
  available: number;
  manufacturedDate?: string;
  expiryDate: string;
  status: BatchStatus;
  supplierId?: string;
  poRef?: string;
  daysToExpiry: number;
};

export const batchesSeed: BatchRecord[] = [
  {
    id: "bat_001",
    lot: "LOT-2026-041",
    sku: "SKU-0008",
    product: "Organic Face Serum",
    warehouse: "Chittagong",
    location: "Z-B-12",
    quantity: 40,
    consumed: 16,
    available: 24,
    manufacturedDate: "2026-01-15",
    expiryDate: "2026-07-15",
    status: "active",
    poRef: "PO-2026-028",
    daysToExpiry: 25,
  },
  {
    id: "bat_002",
    lot: "LOT-2026-038",
    sku: "SKU-0020",
    product: "Scented Candle Pack (3)",
    warehouse: "Chittagong",
    location: "Z-A-05",
    quantity: 80,
    consumed: 32,
    available: 48,
    manufacturedDate: "2026-02-01",
    expiryDate: "2026-08-01",
    status: "active",
    poRef: "PO-2026-026",
    daysToExpiry: 42,
  },
  {
    id: "bat_003",
    lot: "LOT-2026-035",
    sku: "SKU-0008",
    product: "Organic Face Serum",
    warehouse: "Chittagong",
    location: "Z-B-11",
    quantity: 40,
    consumed: 40,
    available: 0,
    manufacturedDate: "2025-12-10",
    expiryDate: "2026-06-10",
    status: "expired",
    poRef: "PO-2026-022",
    daysToExpiry: -10,
  },
  {
    id: "bat_004",
    lot: "LOT-2026-044",
    sku: "SKU-0015",
    product: "Yoga Mat Pro",
    warehouse: "Dhaka HQ",
    location: "Z-C-03",
    quantity: 30,
    consumed: 0,
    available: 30,
    manufacturedDate: "2026-04-20",
    expiryDate: "2028-04-20",
    status: "active",
    poRef: "PO-2026-036",
    daysToExpiry: 670,
  },
  {
    id: "bat_005",
    lot: "LOT-2026-043",
    sku: "SKU-0016",
    product: "Stainless Steel Bottle",
    warehouse: "Chittagong",
    location: "Z-A-09",
    quantity: 60,
    consumed: 51,
    available: 9,
    expiryDate: "2029-01-01",
    status: "active",
    daysToExpiry: 924,
  },
  {
    id: "bat_006",
    lot: "LOT-2026-042",
    sku: "SKU-0004",
    product: "Running Shoes Ultra",
    warehouse: "Dhaka HQ",
    location: "Z-D-08",
    quantity: 30,
    consumed: 0,
    available: 30,
    expiryDate: "2028-06-10",
    status: "active",
    poRef: "PO-2026-036",
    daysToExpiry: 720,
  },
  {
    id: "bat_007",
    lot: "LOT-2026-039",
    sku: "SKU-0001",
    product: "Premium Cotton T-Shirt",
    warehouse: "Dhaka HQ",
    location: "Z-A-02",
    quantity: 200,
    consumed: 26,
    available: 174,
    expiryDate: "2030-01-01",
    status: "active",
    daysToExpiry: 1291,
  },
  {
    id: "bat_008",
    lot: "LOT-2026-047",
    sku: "SKU-0008",
    product: "Organic Face Serum",
    warehouse: "Chittagong",
    location: "Z-B-13",
    quantity: 40,
    consumed: 0,
    available: 40,
    manufacturedDate: "2026-06-01",
    expiryDate: "2026-12-01",
    status: "active",
    poRef: "PO-2026-038",
    daysToExpiry: 164,
  },
  {
    id: "bat_009",
    lot: "LOT-2026-030",
    sku: "SKU-0007",
    product: "Bluetooth Speaker Mini",
    warehouse: "Chittagong",
    location: "Z-C-11",
    quantity: 200,
    consumed: 0,
    available: 200,
    expiryDate: "2029-06-01",
    status: "active",
    daysToExpiry: 1077,
  },
  {
    id: "bat_010",
    lot: "LOT-2026-048",
    sku: "SKU-0021",
    product: "Gaming Headset",
    warehouse: "Online FC",
    location: "Z-B-04",
    quantity: 10,
    consumed: 3,
    available: 7,
    expiryDate: "2028-09-15",
    status: "active",
    daysToExpiry: 817,
  },
  {
    id: "bat_011",
    lot: "LOT-2026-029",
    sku: "SKU-0020",
    product: "Scented Candle Pack (3)",
    warehouse: "Chittagong",
    location: "Z-A-04",
    quantity: 80,
    consumed: 80,
    available: 0,
    manufacturedDate: "2025-12-01",
    expiryDate: "2026-06-05",
    status: "expired",
    daysToExpiry: -15,
  },
  {
    id: "bat_012",
    lot: "LOT-2026-046",
    sku: "SKU-0010",
    product: "LED Desk Lamp",
    warehouse: "Online FC",
    location: "Z-A-07",
    quantity: 28,
    consumed: 0,
    available: 28,
    expiryDate: "2031-01-01",
    status: "active",
    daysToExpiry: 1656,
  },
  {
    id: "bat_013",
    lot: "LOT-2026-033",
    sku: "SKU-0008",
    product: "Organic Face Serum",
    warehouse: "Dhaka HQ",
    location: "Z-B-01",
    quantity: 20,
    consumed: 20,
    available: 0,
    expiryDate: "2026-06-18",
    status: "quarantine",
    daysToExpiry: -2,
  },
  {
    id: "bat_014",
    lot: "LOT-2026-045",
    sku: "SKU-0019",
    product: "Wireless Mouse",
    warehouse: "Dhaka HQ",
    location: "Z-D-02",
    quantity: 20,
    consumed: 0,
    available: 20,
    expiryDate: "2030-06-01",
    status: "active",
    daysToExpiry: 1442,
  },
  {
    id: "bat_015",
    lot: "LOT-2026-050",
    sku: "SKU-0017",
    product: "Mechanical Keyboard",
    warehouse: "Online FC",
    location: "Z-C-02",
    quantity: 22,
    consumed: 0,
    available: 22,
    expiryDate: "2030-01-01",
    status: "active",
    daysToExpiry: 1291,
  },
];

// ─── Cycle Count ───────────────────────────────────────────────────────────────

export type CycleCountStatus = "scheduled" | "in_progress" | "pending_review" | "closed";

export type CycleCountLine = {
  sku: string;
  product: string;
  location: string;
  systemQty: number;
  countedQty: number | null;
  variance: number | null;
};

export type CycleCountSession = {
  id: string;
  warehouse: string;
  zone?: string;
  status: CycleCountStatus;
  scheduledDate: string;
  completedDate?: string;
  lines: CycleCountLine[];
  countedBy?: string;
  approvedBy?: string;
};

export const cycleCountsSeed: CycleCountSession[] = [
  {
    id: "CC-2026-012",
    warehouse: "Dhaka HQ",
    zone: "Zone A",
    status: "pending_review",
    scheduledDate: "2026-06-14",
    completedDate: "2026-06-14",
    countedBy: "Rahim",
    lines: [
      { sku: "SKU-0001", product: "Premium Cotton T-Shirt", location: "Z-A-02", systemQty: 190, countedQty: 186, variance: -4 },
      { sku: "SKU-0002", product: "Wireless Earbuds Pro", location: "Z-A-05", systemQty: 10, countedQty: 8, variance: -2 },
      { sku: "SKU-0004", product: "Running Shoes Ultra", location: "Z-A-09", systemQty: 42, countedQty: 42, variance: 0 },
    ],
  },
  {
    id: "CC-2026-011",
    warehouse: "Chittagong",
    zone: "Zone B",
    status: "closed",
    scheduledDate: "2026-06-10",
    completedDate: "2026-06-10",
    countedBy: "Karim",
    approvedBy: "Manager",
    lines: [
      { sku: "SKU-0007", product: "Bluetooth Speaker Mini", location: "Z-B-03", systemQty: 425, countedQty: 420, variance: -5 },
      { sku: "SKU-0008", product: "Organic Face Serum", location: "Z-B-01", systemQty: 8, countedQty: 6, variance: -2 },
    ],
  },
  {
    id: "CC-2026-010",
    warehouse: "Online FC",
    status: "in_progress",
    scheduledDate: "2026-06-15",
    countedBy: "Nasrin",
    lines: [
      { sku: "SKU-0010", product: "LED Desk Lamp", location: "Z-A-07", systemQty: 28, countedQty: 28, variance: 0 },
      { sku: "SKU-0014", product: "USB-C Hub 7-in-1", location: "Z-A-01", systemQty: 0, countedQty: null, variance: null },
      { sku: "SKU-0021", product: "Gaming Headset", location: "Z-B-04", systemQty: 7, countedQty: null, variance: null },
    ],
  },
  {
    id: "CC-2026-009",
    warehouse: "Dhaka HQ",
    zone: "Zone D",
    status: "scheduled",
    scheduledDate: "2026-06-20",
    lines: [
      { sku: "SKU-0005", product: "Smart Watch Series 5", location: "Z-D-01", systemQty: 3, countedQty: null, variance: null },
      { sku: "SKU-0019", product: "Wireless Mouse", location: "Z-D-02", systemQty: 38, countedQty: null, variance: null },
      { sku: "SKU-0022", product: "Leather Wallet", location: "Z-D-04", systemQty: 320, countedQty: null, variance: null },
    ],
  },
  {
    id: "CC-2026-008",
    warehouse: "Chittagong",
    zone: "Zone A",
    status: "closed",
    scheduledDate: "2026-06-05",
    completedDate: "2026-06-06",
    countedBy: "Reza",
    approvedBy: "Manager",
    lines: [
      { sku: "SKU-0016", product: "Stainless Steel Bottle", location: "Z-A-09", systemQty: 12, countedQty: 9, variance: -3 },
      { sku: "SKU-0020", product: "Scented Candle Pack (3)", location: "Z-A-04", systemQty: 16, countedQty: 14, variance: -2 },
    ],
  },
];

export const CYCLE_COUNT_STATUS_LABELS: Record<CycleCountStatus, string> = {
  scheduled: "Scheduled",
  in_progress: "In Progress",
  pending_review: "Pending Review",
  closed: "Closed",
};

// ─── Stock Alert Rules ─────────────────────────────────────────────────────────

export type AlertRuleAction = "notify" | "auto_po" | "notify_and_po";

export type StockAlertRule = {
  id: string;
  sku: string;
  product: string;
  warehouse: string;
  currentQty: number;
  minQty: number;
  reorderQty: number;
  status: StockStatus;
  lastTriggered?: string;
  action: AlertRuleAction;
  preferredSupplier?: string;
};

export const alertRulesSeed: StockAlertRule[] = [
  {
    id: "rule_001",
    sku: "SKU-0002",
    product: "Wireless Earbuds Pro",
    warehouse: "Dhaka HQ",
    currentQty: 8,
    minQty: 15,
    reorderQty: 50,
    status: "low_stock",
    lastTriggered: "2026-06-15",
    action: "auto_po",
    preferredSupplier: "Shenzhen TechParts Co.",
  },
  {
    id: "rule_002",
    sku: "SKU-0005",
    product: "Smart Watch Series 5",
    warehouse: "Dhaka HQ",
    currentQty: 3,
    minQty: 10,
    reorderQty: 20,
    status: "low_stock",
    lastTriggered: "2026-06-15",
    action: "auto_po",
    preferredSupplier: "Shenzhen TechParts Co.",
  },
  {
    id: "rule_003",
    sku: "SKU-0014",
    product: "USB-C Hub 7-in-1",
    warehouse: "Online FC",
    currentQty: 0,
    minQty: 5,
    reorderQty: 24,
    status: "out_of_stock",
    lastTriggered: "2026-06-14",
    action: "notify_and_po",
    preferredSupplier: "GlobalTech Imports",
  },
  {
    id: "rule_004",
    sku: "SKU-0008",
    product: "Organic Face Serum",
    warehouse: "Chittagong",
    currentQty: 6,
    minQty: 12,
    reorderQty: 40,
    status: "low_stock",
    lastTriggered: "2026-06-15",
    action: "notify",
    preferredSupplier: "Beauty Essentials Ltd",
  },
  {
    id: "rule_005",
    sku: "SKU-0016",
    product: "Stainless Steel Bottle",
    warehouse: "Chittagong",
    currentQty: 9,
    minQty: 25,
    reorderQty: 60,
    status: "low_stock",
    lastTriggered: "2026-06-13",
    action: "notify",
    preferredSupplier: "Tech Accessories Ltd",
  },
  {
    id: "rule_006",
    sku: "SKU-0018",
    product: "Portable Power Bank 20000",
    warehouse: "Dhaka HQ",
    currentQty: 0,
    minQty: 10,
    reorderQty: 30,
    status: "out_of_stock",
    lastTriggered: "2026-06-15",
    action: "auto_po",
    preferredSupplier: "GlobalTech Imports",
  },
  {
    id: "rule_007",
    sku: "SKU-0021",
    product: "Gaming Headset",
    warehouse: "Online FC",
    currentQty: 7,
    minQty: 10,
    reorderQty: 15,
    status: "low_stock",
    lastTriggered: "2026-06-14",
    action: "notify_and_po",
    preferredSupplier: "Shenzhen TechParts Co.",
  },
  {
    id: "rule_008",
    sku: "SKU-0020",
    product: "Scented Candle Pack (3)",
    warehouse: "Chittagong",
    currentQty: 14,
    minQty: 20,
    reorderQty: 80,
    status: "low_stock",
    lastTriggered: "2026-06-12",
    action: "notify",
    preferredSupplier: "Beauty Essentials Ltd",
  },
];

// ─── Warehouse Zones ───────────────────────────────────────────────────────────

export type ZoneType = "receiving" | "storage" | "picking" | "packing" | "dispatch" | "quarantine";

export type WarehouseZone = {
  id: string;
  warehouseId: string;
  warehouseName: string;
  zoneCode: string;
  name: string;
  type: ZoneType;
  totalBins: number;
  occupiedBins: number;
  totalCapacity: number;
  usedCapacity: number;
  active: boolean;
};

export const warehouseZonesSeed: WarehouseZone[] = [
  { id: "z_dhk_a", warehouseId: "wh_dhaka", warehouseName: "Dhaka HQ", zoneCode: "Z-A", name: "Zone A — Apparel", type: "storage", totalBins: 40, occupiedBins: 32, totalCapacity: 5000, usedCapacity: 3800, active: true },
  { id: "z_dhk_b", warehouseId: "wh_dhaka", warehouseName: "Dhaka HQ", zoneCode: "Z-B", name: "Zone B — Electronics", type: "storage", totalBins: 30, occupiedBins: 14, totalCapacity: 3000, usedCapacity: 980, active: true },
  { id: "z_dhk_c", warehouseId: "wh_dhaka", warehouseName: "Dhaka HQ", zoneCode: "Z-C", name: "Zone C — Sports", type: "storage", totalBins: 20, occupiedBins: 12, totalCapacity: 2000, usedCapacity: 1400, active: true },
  { id: "z_dhk_d", warehouseId: "wh_dhaka", warehouseName: "Dhaka HQ", zoneCode: "Z-D", name: "Zone D — Accessories", type: "storage", totalBins: 24, occupiedBins: 18, totalCapacity: 2400, usedCapacity: 1800, active: true },
  { id: "z_dhk_r", warehouseId: "wh_dhaka", warehouseName: "Dhaka HQ", zoneCode: "Z-R", name: "Receiving Dock", type: "receiving", totalBins: 8, occupiedBins: 3, totalCapacity: 800, usedCapacity: 260, active: true },
  { id: "z_dhk_p", warehouseId: "wh_dhaka", warehouseName: "Dhaka HQ", zoneCode: "Z-P", name: "Packing Area", type: "packing", totalBins: 6, occupiedBins: 4, totalCapacity: 600, usedCapacity: 380, active: true },
  { id: "z_ctg_a", warehouseId: "wh_ctg", warehouseName: "Chittagong", zoneCode: "Z-A", name: "Zone A — General", type: "storage", totalBins: 28, occupiedBins: 20, totalCapacity: 3500, usedCapacity: 2600, active: true },
  { id: "z_ctg_b", warehouseId: "wh_ctg", warehouseName: "Chittagong", zoneCode: "Z-B", name: "Zone B — Perishables", type: "storage", totalBins: 16, occupiedBins: 8, totalCapacity: 1200, usedCapacity: 520, active: true },
  { id: "z_ctg_c", warehouseId: "wh_ctg", warehouseName: "Chittagong", zoneCode: "Z-C", name: "Zone C — Bulk", type: "storage", totalBins: 10, occupiedBins: 7, totalCapacity: 2000, usedCapacity: 1480, active: true },
  { id: "z_ctg_q", warehouseId: "wh_ctg", warehouseName: "Chittagong", zoneCode: "Z-Q", name: "Quarantine", type: "quarantine", totalBins: 4, occupiedBins: 1, totalCapacity: 400, usedCapacity: 120, active: true },
  { id: "z_fc_a", warehouseId: "wh_fc", warehouseName: "Online FC", zoneCode: "Z-A", name: "Zone A — Shelf", type: "picking", totalBins: 20, occupiedBins: 14, totalCapacity: 2000, usedCapacity: 1280, active: true },
  { id: "z_fc_b", warehouseId: "wh_fc", warehouseName: "Online FC", zoneCode: "Z-B", name: "Zone B — Pick & Pack", type: "picking", totalBins: 16, occupiedBins: 8, totalCapacity: 1200, usedCapacity: 680, active: true },
  { id: "z_fc_c", warehouseId: "wh_fc", warehouseName: "Online FC", zoneCode: "Z-C", name: "Zone C — Dispatch", type: "dispatch", totalBins: 8, occupiedBins: 3, totalCapacity: 600, usedCapacity: 240, active: true },
];

// ─── Extended Transfers ────────────────────────────────────────────────────────

export const extendedTransfersSeed: StockTransfer[] = [
  ...transfersSeed,
  {
    id: "TRF-1038",
    from: "Dhaka HQ",
    to: "Online FC",
    items: 4,
    units: 80,
    status: "received",
    createdAt: "2026-06-10",
  },
  {
    id: "TRF-1037",
    from: "Chittagong",
    to: "Online FC",
    items: 2,
    units: 60,
    status: "received",
    createdAt: "2026-06-08",
  },
  {
    id: "TRF-1036",
    from: "Dhaka HQ",
    to: "Chittagong",
    items: 3,
    units: 150,
    status: "cancelled",
    createdAt: "2026-06-05",
  },
  {
    id: "TRF-1035",
    from: "Online FC",
    to: "Chittagong",
    items: 1,
    units: 10,
    status: "received",
    createdAt: "2026-06-03",
  },
];

// ─── Extended Adjustments ─────────────────────────────────────────────────────

export const extendedAdjustmentsSeed: StockAdjustment[] = [
  ...adjustmentsSeed,
  {
    id: "ADJ-085",
    warehouse: "Dhaka HQ",
    sku: "SKU-0001",
    product: "Premium Cotton T-Shirt",
    qtyChange: -4,
    reason: "Cycle count variance",
    status: "approved",
    requestedAt: "2026-06-14 10:00",
  },
  {
    id: "ADJ-084",
    warehouse: "Chittagong",
    sku: "SKU-0007",
    product: "Bluetooth Speaker Mini",
    qtyChange: -5,
    reason: "Damaged — cycle count",
    status: "approved",
    requestedAt: "2026-06-10 15:30",
  },
  {
    id: "ADJ-083",
    warehouse: "Chittagong",
    sku: "SKU-0008",
    product: "Organic Face Serum",
    qtyChange: -2,
    reason: "Cycle count variance",
    status: "approved",
    requestedAt: "2026-06-10 16:00",
  },
  {
    id: "ADJ-082",
    warehouse: "Online FC",
    sku: "SKU-0021",
    product: "Gaming Headset",
    qtyChange: -1,
    reason: "Returned damaged — unsellable",
    status: "approved",
    requestedAt: "2026-06-08 09:00",
  },
  {
    id: "ADJ-081",
    warehouse: "Chittagong",
    sku: "SKU-0016",
    product: "Stainless Steel Bottle",
    qtyChange: -3,
    reason: "Cycle count variance",
    status: "approved",
    requestedAt: "2026-06-05 14:00",
  },
  {
    id: "ADJ-080",
    warehouse: "Dhaka HQ",
    sku: "SKU-0005",
    product: "Smart Watch Series 5",
    qtyChange: -1,
    reason: "Customer return — damaged",
    status: "rejected",
    requestedAt: "2026-06-03 11:30",
  },
];

// ─── Inventory Dashboard KPIs (extended) ────────────────────────────────────

export const inventoryDashboardKpis = {
  totalSkus: 486,
  totalUnits: 24820,
  stockValue: 18400000,
  lowStockItems: 8,
  outOfStockItems: 2,
  inTransitTransfers: 2,
  pendingAdjustments: 2,
  expiringIn30d: 2,
  openPOs: 4,
  cycleCountsDue: 1,
};

export const inventoryMovementChart = [
  { day: "Mon", inbound: 420, outbound: 380, transfers: 60 },
  { day: "Tue", inbound: 310, outbound: 290, transfers: 40 },
  { day: "Wed", inbound: 580, outbound: 410, transfers: 80 },
  { day: "Thu", inbound: 240, outbound: 520, transfers: 30 },
  { day: "Fri", inbound: 390, outbound: 460, transfers: 55 },
  { day: "Sat", inbound: 180, outbound: 220, transfers: 20 },
  { day: "Sun", inbound: 120, outbound: 95, transfers: 10 },
];

/** Incoming stock pickings — Inventory › Operations › Receipts (Again list view). */
export type StockReceiptStatus = "ready" | "done" | "draft" | "waiting" | "cancelled";

export type StockReceiptLine = {
  id: string;
  product: string;
  demand: number;
  quantity: number;
  showDetails?: boolean;
};

export type StockReceipt = {
  id: string;
  reference: string;
  contact: string;
  responsible: string;
  scheduledDate: string;
  scheduledLabel: string;
  deadline?: string;
  deadlineLabel?: string;
  isLate?: boolean;
  sourceDocument: string;
  trackingReference: string;
  carrier: string;
  destination: string;
  weight: number;
  status: StockReceiptStatus;
  operationType: string;
  lines: StockReceiptLine[];
  note?: string;
  starred?: boolean;
};

export const STOCK_RECEIPT_STATUS_LABELS: Record<StockReceiptStatus, string> = {
  ready: "Ready",
  done: "Done",
  draft: "Draft",
  waiting: "Waiting",
  cancelled: "Cancelled",
};

export function createBlankStockReceipt(): StockReceipt {
  const now = new Date();
  return {
    id: `rec_${Date.now()}`,
    reference: "New",
    contact: "",
    responsible: "",
    scheduledDate: now.toISOString(),
    scheduledLabel: formatStockReceiptDatetime(now.toISOString()),
    isLate: true,
    sourceDocument: "",
    trackingReference: "",
    carrier: "",
    destination: "WH/Stock",
    weight: 0,
    status: "draft",
    operationType: "againsoft: Receipts",
    lines: [],
    note: "",
    starred: false,
  };
}

export function formatStockReceiptDatetime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export const stockReceiptsSeed: StockReceipt[] = [
  {
    id: "rec_001",
    reference: "WH/IN/00001",
    contact: "Riyad",
    responsible: "",
    scheduledDate: "2026-07-04T05:56:00",
    scheduledLabel: "Jul 4, 11:56 AM",
    deadline: "2026-07-04T05:56:00",
    deadlineLabel: "Jul 4, 11:56 AM",
    isLate: true,
    sourceDocument: "P00001",
    trackingReference: "",
    carrier: "",
    destination: "WH/Stock",
    weight: 2,
    status: "ready",
    operationType: "againsoft: Receipts",
    lines: [
      { id: "rec_001_l1", product: "Testing Product 1", demand: 1, quantity: 1 },
      { id: "rec_001_l2", product: "Testing Product 2", demand: 5, quantity: 5, showDetails: true },
    ],
  },
  {
    id: "rec_002",
    reference: "WH/IN/00002",
    contact: "againsoft, Mossiur Rahman Riyad",
    responsible: "",
    scheduledDate: "2026-06-28T14:00:00",
    scheduledLabel: "7 days ago",
    sourceDocument: "P00012",
    trackingReference: "",
    carrier: "",
    destination: "WH/Stock",
    weight: 0,
    status: "done",
    operationType: "againsoft: Receipts",
    lines: [],
  },
  {
    id: "rec_003",
    reference: "WH/IN/00003",
    contact: "Riyad",
    responsible: "",
    scheduledDate: "2026-07-04T09:00:00",
    scheduledLabel: "2 days ago",
    isLate: true,
    sourceDocument: "",
    trackingReference: "",
    carrier: "",
    destination: "WH/Stock",
    weight: 0,
    status: "ready",
    operationType: "againsoft: Receipts",
    lines: [],
  },
];

/** Outgoing stock pickings — Inventory › Operations › Deliveries (same shape as receipts). */
export type StockDelivery = StockReceipt;
export type StockDeliveryLine = StockReceiptLine;
export type StockDeliveryStatus = StockReceiptStatus;
export const STOCK_DELIVERY_STATUS_LABELS = STOCK_RECEIPT_STATUS_LABELS;

export function createBlankStockDelivery(): StockDelivery {
  const blank = createBlankStockReceipt();
  return {
    ...blank,
    id: `del_${Date.now()}`,
    operationType: "againsoft: Delivery Orders",
    destination: "Customers",
  };
}

export const stockDeliveriesSeed: StockDelivery[] = [
  {
    id: "del_001",
    reference: "WH/OUT/00001",
    contact: "Riyad",
    responsible: "",
    scheduledDate: "2026-07-04T05:56:00",
    scheduledLabel: "Jul 4, 11:56 AM",
    deadline: "2026-07-04T05:56:00",
    deadlineLabel: "Jul 4, 11:56 AM",
    isLate: true,
    sourceDocument: "S00001",
    trackingReference: "",
    carrier: "",
    destination: "Customers",
    weight: 2,
    status: "ready",
    operationType: "againsoft: Delivery Orders",
    lines: [
      { id: "del_001_l1", product: "Testing Product 1", demand: 1, quantity: 1 },
      { id: "del_001_l2", product: "Testing Product 2", demand: 5, quantity: 5, showDetails: true },
    ],
  },
  {
    id: "del_002",
    reference: "WH/OUT/00002",
    contact: "againsoft, Mossiur Rahman Riyad",
    responsible: "",
    scheduledDate: "2026-06-28T14:00:00",
    scheduledLabel: "7 days ago",
    sourceDocument: "S00012",
    trackingReference: "",
    carrier: "",
    destination: "Customers",
    weight: 0,
    status: "done",
    operationType: "againsoft: Delivery Orders",
    lines: [],
  },
  {
    id: "del_003",
    reference: "WH/OUT/00003",
    contact: "Riyad",
    responsible: "",
    scheduledDate: "2026-07-04T09:00:00",
    scheduledLabel: "2 days ago",
    isLate: true,
    sourceDocument: "",
    trackingReference: "",
    carrier: "",
    destination: "Customers",
    weight: 0,
    status: "ready",
    operationType: "againsoft: Delivery Orders",
    lines: [],
  },
];
