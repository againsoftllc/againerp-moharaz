import {
  purchaseOrdersSeed as purchaseOrdersFullSeed,
  toPurchaseOrderSummary,
  type PurchaseOrderSummary,
} from "./purchase-orders";
import { purchaseRfqSeed, toRfqRecord } from "./purchase-rfq";

export type SupplierStatus = "active" | "blocked" | "preferred";

export type PoStatus = "draft" | "sent" | "partial" | "received" | "cancelled";

export type RfqStatus = "draft" | "sent" | "review" | "awarded" | "closed";

export const SUPPLIER_TABS = [
  "suppliers",
  "purchase-orders",
  "rfq",
  "quotations",
  "receipts",
  "bills",
  "returns",
  "stock-feed",
  "summary",
] as const;

export type SupplierTab = (typeof SUPPLIER_TABS)[number];

export const SUPPLIER_TAB_LABELS: Record<SupplierTab, string> = {
  suppliers: "Vendor directory",
  "purchase-orders": "Purchase Orders",
  rfq: "RFQ",
  quotations: "Quotations",
  receipts: "Goods Receipts",
  bills: "Vendor Bills",
  returns: "Returns",
  "stock-feed": "Stock Feed",
  summary: "Summary",
};

export const supplierKpis = [
  { label: "Active suppliers", value: "24", sub: "3 preferred" },
  { label: "Open POs", value: 8, sub: "৳2.4M committed", alert: true },
  { label: "Pending RFQs", value: 2, sub: "Awaiting quotes" },
  { label: "Spend YTD", value: "৳18.6M", sub: "+14% vs last year", up: true },
];

export const spendChart = [
  { month: "Jan", spend: 1200000 },
  { month: "Feb", spend: 980000 },
  { month: "Mar", spend: 1450000 },
  { month: "Apr", spend: 1320000 },
  { month: "May", spend: 1680000 },
  { month: "Jun", spend: 1540000 },
];

export type Supplier = {
  id: string;
  vendorCode: string;
  name: string;
  email: string;
  phone: string;
  paymentTerms: string;
  leadTimeDays: number;
  rating: number;
  openPos: number;
  spendYtd: number;
  status: SupplierStatus;
  country: string;
  updatedAt: string;
  taxId?: string;
  website?: string;
  currency?: string;
  openingBalance?: number;
  creditLimit?: number;
  paymentSchedule?: string;
  minOrderValue?: number;
  incoterms?: string;
  buyerName?: string;
  partyId?: string;
  roles?: string[];
  linkedCustomerId?: string;
  linkedCustomerName?: string;
  linkedVendorId?: string;
  linkedVendorName?: string;
  /** Primary contact person's name, if the supplier has one on file. */
  contactPerson?: string;
};

export type SupplierContactPerson = {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  isPrimary: boolean;
};

export type SupplierAddress = {
  id: string;
  label: string;
  type: "billing" | "shipping" | "warehouse";
  line1: string;
  city: string;
  country: string;
};

export type VendorContract = {
  id: string;
  contractNumber: string;
  title: string;
  validFrom: string;
  validTo: string;
  status: "active" | "expired" | "draft";
  value: number;
};

export type SupplierDetail = Supplier & {
  contacts: SupplierContactPerson[];
  addresses: SupplierAddress[];
  contracts: VendorContract[];
  bills: VendorBill[];
  performance: VendorPerformance;
  timeline: SupplierTimelineEntry[];
  totalPos: number;
  rfqCount: number;
  receiptCount: number;
  hasStockFeed: boolean;
  notes?: string;
};

export type VendorBill = {
  id: string;
  billNumber: string;
  amount: number;
  status: "draft" | "matched" | "paid" | "overdue";
  dueAt: string;
};

export type VendorPerformance = {
  onTimeDeliveryPct: number;
  qualityRejectRatePct: number;
  priceVariancePct: number;
  avgLeadTimeDays: number;
};

export type SupplierTimelineEntry = {
  id: string;
  type: "po" | "rfq" | "receipt" | "note" | "rating";
  title: string;
  description: string;
  at: string;
};

/** Same core order as Customer/Vendor (Overview, Profile, Terms, Orders, Ledger, Expense); Catalog is supplier-specific. */
export const SUPPLIER_DETAIL_TABS = [
  "overview",
  "general",
  "terms",
  "purchase-orders",
  "ledger",
  "expense",
  "catalog",
] as const;

export type SupplierDetailTab = (typeof SUPPLIER_DETAIL_TABS)[number];

export const SUPPLIER_DETAIL_TAB_LABELS: Record<SupplierDetailTab, string> = {
  overview: "Overview",
  general: "Profile",
  terms: "Terms",
  catalog: "Catalog",
  ledger: "Ledger",
  expense: "Expense",
  "purchase-orders": "Orders",
};

export const suppliersSeed: Supplier[] = [
  {
    id: "sup_001",
    vendorCode: "VND-TECH",
    name: "TechPro Distributors Ltd",
    email: "orders@techpro.bd",
    phone: "+880 1711-000001",
    paymentTerms: "Net 30",
    leadTimeDays: 7,
    rating: 4.6,
    openPos: 2,
    spendYtd: 4200000,
    status: "preferred",
    country: "Bangladesh",
    updatedAt: "2026-06-15",
    taxId: "BIN-123456789",
    website: "https://techpro.bd",
    currency: "BDT",
    minOrderValue: 50000,
    incoterms: "FOB Dhaka",
    buyerName: "Rahim Uddin",
  },
  {
    id: "sup_002",
    vendorCode: "VND-FASH",
    name: "UrbanWear Manufacturing",
    email: "supply@urbanwear.com",
    phone: "+880 1711-000002",
    paymentTerms: "Net 45",
    leadTimeDays: 14,
    rating: 4.2,
    openPos: 1,
    spendYtd: 3100000,
    status: "active",
    country: "Bangladesh",
    updatedAt: "2026-06-14",
    taxId: "BIN-987654321",
    website: "https://urbanwear.com",
    currency: "BDT",
    minOrderValue: 25000,
    incoterms: "EXW",
    buyerName: "Sadia Khan",
  },
  {
    id: "sup_003",
    vendorCode: "VND-GLOW",
    name: "GlowUp Beauty Imports",
    email: "procurement@glowup.bd",
    phone: "+880 1711-000003",
    paymentTerms: "Net 30",
    leadTimeDays: 10,
    rating: 4.0,
    openPos: 1,
    spendYtd: 1860000,
    status: "active",
    country: "Bangladesh",
    updatedAt: "2026-06-13",
    taxId: "BIN-456789123",
    currency: "BDT",
    minOrderValue: 15000,
    incoterms: "CIF Chittagong",
    buyerName: "Rahim Uddin",
  },
  {
    id: "sup_004",
    vendorCode: "VND-CN-ELC",
    name: "Shenzhen Electronics Co.",
    email: "export@szelec.cn",
    phone: "+86 755-0000",
    paymentTerms: "50% advance",
    leadTimeDays: 28,
    rating: 3.8,
    openPos: 3,
    spendYtd: 5400000,
    status: "preferred",
    country: "China",
    updatedAt: "2026-06-12",
    taxId: "91440300MA5XXXX",
    website: "https://szelec.cn",
    currency: "USD",
    minOrderValue: 5000,
    incoterms: "FOB Shenzhen",
    buyerName: "Karim Ahmed",
  },
  {
    id: "sup_005",
    vendorCode: "VND-HOME",
    name: "HomeNest Wholesale",
    email: "b2b@homenest.bd",
    phone: "+880 1711-000005",
    paymentTerms: "COD",
    leadTimeDays: 5,
    rating: 3.2,
    openPos: 0,
    spendYtd: 420000,
    status: "blocked",
    country: "Bangladesh",
    updatedAt: "2026-06-01",
    currency: "BDT",
    minOrderValue: 10000,
    incoterms: "DAP",
    buyerName: "Sadia Khan",
  },
];

export type PurchaseOrder = PurchaseOrderSummary;

export const purchaseOrdersSeed: PurchaseOrder[] = purchaseOrdersFullSeed.map(toPurchaseOrderSummary);

export type { RfqRecord } from "./purchase-rfq";

export const rfqSeed = purchaseRfqSeed.map(toRfqRecord);

export type SupplierStockFeed = {
  id: string;
  supplierName: string;
  feedType: string;
  lastSync: string;
  itemsSynced: number;
  status: "ok" | "stale" | "error";
};

export const stockFeedsSeed: SupplierStockFeed[] = [
  {
    id: "feed_001",
    supplierName: "TechPro Distributors Ltd",
    feedType: "API · hourly",
    lastSync: "2026-06-15 10:00",
    itemsSynced: 420,
    status: "ok",
  },
  {
    id: "feed_002",
    supplierName: "Shenzhen Electronics Co.",
    feedType: "CSV · daily",
    lastSync: "2026-06-14 02:00",
    itemsSynced: 186,
    status: "stale",
  },
];

export function formatBdt(amount: number) {
  return `৳${amount.toLocaleString("en-BD")}`;
}

export const PO_STATUS_LABELS: Record<PoStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  partial: "Partial",
  received: "Received",
  cancelled: "Cancelled",
};

export const RFQ_STATUS_LABELS: Record<RfqStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  review: "Under review",
  awarded: "Awarded",
  closed: "Closed",
};

export function tabFromPath(pathname: string): SupplierTab {
  if (pathname === "/suppliers" || pathname.startsWith("/suppliers/all")) return "suppliers";
  if (pathname.startsWith("/purchase/orders") || pathname.startsWith("/suppliers/purchase-orders"))
    return "purchase-orders";
  if (pathname.startsWith("/purchase/rfq") || pathname.startsWith("/suppliers/rfq")) return "rfq";
  if (pathname.startsWith("/purchase/quotations") || pathname.startsWith("/suppliers/quotations"))
    return "quotations";
  if (pathname.startsWith("/purchase/receipts") || pathname.startsWith("/suppliers/receipts")) return "receipts";
  if (pathname.startsWith("/purchase/bills") || pathname.startsWith("/suppliers/bills")) return "bills";
  if (pathname.startsWith("/purchase/returns") || pathname.startsWith("/suppliers/returns")) return "returns";
  if (pathname.startsWith("/suppliers/summary") || pathname.startsWith("/purchase/reports")) return "summary";
  if (pathname.startsWith("/suppliers/stock-feed")) return "stock-feed";
  return "summary";
}

export function pathFromTab(tab: SupplierTab): string {
  if (tab === "summary") return "/purchase/reports";
  if (tab === "suppliers") return "/suppliers";
  if (tab === "purchase-orders") return "/purchase/orders";
  if (tab === "rfq") return "/purchase/rfq";
  if (tab === "quotations") return "/purchase/quotations";
  if (tab === "receipts") return "/purchase/receipts";
  if (tab === "bills") return "/purchase/bills";
  if (tab === "returns") return "/purchase/returns";
  return `/purchase/${tab}`;
}

const supplierDetailExtras: Record<
  string,
  Omit<SupplierDetail, keyof Supplier | "totalPos" | "openPos" | "rfqCount" | "receiptCount" | "hasStockFeed">
> = {
  sup_001: {
    contacts: [
      {
        id: "c1",
        name: "Nasir Hossain",
        role: "Sales Manager",
        email: "nasir@techpro.bd",
        phone: "+880 1711-100001",
        isPrimary: true,
      },
      {
        id: "c2",
        name: "Farhana Akter",
        role: "Accounts",
        email: "accounts@techpro.bd",
        phone: "+880 1711-100002",
        isPrimary: false,
      },
    ],
    addresses: [
      {
        id: "a1",
        label: "Head office",
        type: "billing",
        line1: "12 Tejgaon Industrial Area",
        city: "Dhaka",
        country: "Bangladesh",
      },
      {
        id: "a2",
        label: "Warehouse",
        type: "warehouse",
        line1: "Plot 45, Tongi EPZ",
        city: "Gazipur",
        country: "Bangladesh",
      },
    ],
    contracts: [
      {
        id: "ct1",
        contractNumber: "CTR-2026-004",
        title: "Electronics annual supply",
        validFrom: "2026-01-01",
        validTo: "2026-12-31",
        status: "active",
        value: 6000000,
      },
    ],
    bills: [
      {
        id: "b1",
        billNumber: "VB-2026-089",
        amount: 620000,
        status: "paid",
        dueAt: "2026-06-10",
      },
      {
        id: "b2",
        billNumber: "VB-2026-102",
        amount: 420000,
        status: "matched",
        dueAt: "2026-07-05",
      },
    ],
    performance: {
      onTimeDeliveryPct: 94,
      qualityRejectRatePct: 1.2,
      priceVariancePct: -2.1,
      avgLeadTimeDays: 6,
    },
    timeline: [
      {
        id: "t1",
        type: "po",
        title: "PO-2026-0142 sent",
        description: "5 line items · ৳840,000",
        at: "2026-06-14T10:30:00",
      },
      {
        id: "t2",
        type: "receipt",
        title: "Goods received — PO-2026-0138",
        description: "8 items received at Main Warehouse",
        at: "2026-05-28T14:00:00",
      },
      {
        id: "t3",
        type: "rating",
        title: "Performance rating updated",
        description: "On-time delivery score 94%",
        at: "2026-06-01T09:00:00",
      },
    ],
  },
  sup_002: {
    contacts: [
      {
        id: "c1",
        name: "Imran Chowdhury",
        role: "Production Head",
        email: "imran@urbanwear.com",
        phone: "+880 1711-200001",
        isPrimary: true,
      },
    ],
    addresses: [
      {
        id: "a1",
        label: "Factory",
        type: "shipping",
        line1: "Ashulia Industrial Park",
        city: "Savar",
        country: "Bangladesh",
      },
    ],
    contracts: [],
    bills: [
      {
        id: "b1",
        billNumber: "VB-2026-076",
        amount: 445000,
        status: "paid",
        dueAt: "2026-05-20",
      },
    ],
    performance: {
      onTimeDeliveryPct: 88,
      qualityRejectRatePct: 3.5,
      priceVariancePct: 1.8,
      avgLeadTimeDays: 13,
    },
    timeline: [
      {
        id: "t1",
        type: "po",
        title: "PO-2026-0135 received",
        description: "6 line items fully received",
        at: "2026-05-10T11:00:00",
      },
    ],
  },
  sup_003: {
    contacts: [
      {
        id: "c1",
        name: "Mehjabin Islam",
        role: "Procurement",
        email: "mehjabin@glowup.bd",
        phone: "+880 1711-300001",
        isPrimary: true,
      },
    ],
    addresses: [
      {
        id: "a1",
        label: "Office",
        type: "billing",
        line1: "Banani, Road 11",
        city: "Dhaka",
        country: "Bangladesh",
      },
    ],
    contracts: [],
    bills: [],
    performance: {
      onTimeDeliveryPct: 91,
      qualityRejectRatePct: 2.0,
      priceVariancePct: 0.5,
      avgLeadTimeDays: 9,
    },
    timeline: [
      {
        id: "t1",
        type: "po",
        title: "PO-2026-0140 drafted",
        description: "3 beauty SKUs · ৳186,000",
        at: "2026-06-15T08:00:00",
      },
    ],
  },
  sup_004: {
    contacts: [
      {
        id: "c1",
        name: "Li Wei",
        role: "Export Manager",
        email: "liwei@szelec.cn",
        phone: "+86 755-8888",
        isPrimary: true,
      },
      {
        id: "c2",
        name: "Chen Ming",
        role: "QC Lead",
        email: "qc@szelec.cn",
        phone: "+86 755-8889",
        isPrimary: false,
      },
    ],
    addresses: [
      {
        id: "a1",
        label: "Shenzhen HQ",
        type: "shipping",
        line1: "Nanshan Tech Park, Building 3",
        city: "Shenzhen",
        country: "China",
      },
    ],
    contracts: [
      {
        id: "ct1",
        contractNumber: "CTR-2025-018",
        title: "Electronics import — FOB Shenzhen",
        validFrom: "2025-07-01",
        validTo: "2026-06-30",
        status: "active",
        value: 12000000,
      },
    ],
    bills: [
      {
        id: "b1",
        billNumber: "VB-2026-095",
        amount: 1250000,
        status: "overdue",
        dueAt: "2026-06-01",
      },
    ],
    performance: {
      onTimeDeliveryPct: 82,
      qualityRejectRatePct: 4.8,
      priceVariancePct: -5.2,
      avgLeadTimeDays: 26,
    },
    timeline: [
      {
        id: "t1",
        type: "rfq",
        title: "RFQ-2026-008 response submitted",
        description: "Quoted 4 SKUs with 25-day lead time",
        at: "2026-06-12T16:00:00",
      },
      {
        id: "t2",
        type: "po",
        title: "PO-2026-0141 partial receipt",
        description: "7 of 12 items received",
        at: "2026-06-10T09:30:00",
      },
    ],
  },
  sup_005: {
    contacts: [
      {
        id: "c1",
        name: "Rafiqul Alam",
        role: "Owner",
        email: "rafiq@homenest.bd",
        phone: "+880 1711-500001",
        isPrimary: true,
      },
    ],
    addresses: [
      {
        id: "a1",
        label: "Store",
        type: "billing",
        line1: "Mirpur Section 10",
        city: "Dhaka",
        country: "Bangladesh",
      },
    ],
    contracts: [],
    bills: [],
    performance: {
      onTimeDeliveryPct: 65,
      qualityRejectRatePct: 8.2,
      priceVariancePct: 6.4,
      avgLeadTimeDays: 8,
    },
    timeline: [
      {
        id: "t1",
        type: "note",
        title: "Vendor blocked",
        description: "Repeated late deliveries and quality issues",
        at: "2026-06-01T12:00:00",
      },
    ],
  },
};

const supplierMeta: Record<
  string,
  Pick<SupplierDetail, "rfqCount" | "receiptCount" | "hasStockFeed">
> = {
  sup_001: { rfqCount: 3, receiptCount: 12, hasStockFeed: true },
  sup_002: { rfqCount: 1, receiptCount: 8, hasStockFeed: false },
  sup_003: { rfqCount: 2, receiptCount: 5, hasStockFeed: false },
  sup_004: { rfqCount: 5, receiptCount: 18, hasStockFeed: true },
  sup_005: { rfqCount: 0, receiptCount: 2, hasStockFeed: false },
};

export function getSupplierById(id: string): Supplier | undefined {
  return suppliersSeed.find((s) => s.id === id);
}

export function getSupplierDetail(id: string): SupplierDetail | undefined {
  const base = getSupplierById(id);
  const extras = supplierDetailExtras[id];
  const meta = supplierMeta[id];
  if (!base || !extras || !meta) return undefined;

  const pos = purchaseOrdersSeed.filter((p) => p.supplierId === id);

  return {
    ...base,
    ...extras,
    ...meta,
    totalPos: pos.length,
    openPos: pos.filter((p) => p.status !== "received" && p.status !== "cancelled").length,
  };
}

export function getPosBySupplierId(supplierId: string): PurchaseOrder[] {
  return purchaseOrdersSeed.filter((p) => p.supplierId === supplierId);
}

export const SUPPLIER_STATUS_LABELS: Record<SupplierStatus, string> = {
  active: "Active",
  blocked: "Blocked",
  preferred: "Preferred",
};

export function countSuppliersByStatus(suppliers: Supplier[]) {
  return {
    all: suppliers.length,
    active: suppliers.filter((s) => s.status === "active").length,
    preferred: suppliers.filter((s) => s.status === "preferred").length,
    blocked: suppliers.filter((s) => s.status === "blocked").length,
  };
}
