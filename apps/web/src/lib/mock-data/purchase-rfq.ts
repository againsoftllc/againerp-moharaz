const SUPPLIER_NAMES: Record<string, string> = {
  sup_001: "TechPro Distributors Ltd",
  sup_002: "UrbanWear Manufacturing",
  sup_003: "GlowUp Beauty Imports",
  sup_004: "Shenzhen Electronics Co.",
  sup_005: "HomeNest Wholesale",
};

export type RfqStatus =
  | "draft"
  | "sent"
  | "vendor_response"
  | "quotation"
  | "approved"
  | "po_created"
  | "closed"
  | "cancelled";

export type QuotationStatus = "draft" | "submitted" | "accepted" | "rejected";

/** Provenance of a supplier's bid — "portal" means the supplier submitted it themselves
 * through the Supplier Portal; "manual" means staff recorded a phoned/emailed-in quote. */
export type QuoteSource = "portal" | "manual";

export type RfqLine = {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  productId?: string;
};

export type RfqLineQuote = {
  rfqLineId: string;
  unitPrice: number;
};

export type RfqVendorQuote = {
  id: string;
  rfqId: string;
  supplierId: string;
  quoteNumber: string;
  status: QuotationStatus;
  validUntil: string;
  leadTimeDays: number;
  moq: number;
  lineQuotes: RfqLineQuote[];
  totalAmount: number;
  submittedAt?: string;
  /** Optional — only present once the real API is wired up; absent on legacy mock seed rows. */
  source?: QuoteSource;
};

export type PurchaseRfq = {
  id: string;
  number: string;
  title: string;
  status: RfqStatus;
  deadline: string;
  createdAt: string;
  buyer: string;
  lines: RfqLine[];
  invitedSupplierIds: string[];
  quotes: RfqVendorQuote[];
  awardedSupplierId?: string;
  linkedPoId?: string;
  notes?: string;
};

/** Slim row for supplier summary tab */
export type RfqRecord = {
  id: string;
  rfqNumber: string;
  title: string;
  status: "draft" | "sent" | "review" | "awarded" | "closed";
  vendorsInvited: number;
  responses: number;
  deadline: string;
};

export const RFQ_STATUS_LABELS: Record<RfqStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  vendor_response: "Vendor response",
  quotation: "Quotation",
  approved: "Approved",
  po_created: "PO created",
  closed: "Closed",
  cancelled: "Cancelled",
};

export const QUOTATION_STATUS_LABELS: Record<QuotationStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  accepted: "Accepted",
  rejected: "Rejected",
};

export function rfqSupplierName(supplierId: string) {
  return SUPPLIER_NAMES[supplierId] ?? "Unknown vendor";
}

export function rfqStatusBadgeVariant(
  status: RfqStatus,
): "default" | "secondary" | "success" | "warning" | "muted" | "outline" {
  switch (status) {
    case "draft":
      return "muted";
    case "sent":
    case "vendor_response":
      return "secondary";
    case "quotation":
      return "warning";
    case "approved":
    case "po_created":
      return "success";
    case "closed":
      return "outline";
    case "cancelled":
      return "outline";
    default:
      return "muted";
  }
}

export function quotationStatusBadgeVariant(
  status: QuotationStatus,
): "default" | "secondary" | "success" | "warning" | "muted" | "outline" {
  switch (status) {
    case "draft":
      return "muted";
    case "submitted":
      return "secondary";
    case "accepted":
      return "success";
    case "rejected":
      return "outline";
    default:
      return "muted";
  }
}

export function toLegacyRfqStatus(status: RfqStatus): RfqRecord["status"] {
  switch (status) {
    case "sent":
    case "vendor_response":
      return "sent";
    case "quotation":
      return "review";
    case "approved":
    case "po_created":
      return "awarded";
    case "closed":
    case "cancelled":
      return "closed";
    default:
      return "draft";
  }
}

export function toRfqRecord(rfq: PurchaseRfq): RfqRecord {
  return {
    id: rfq.id,
    rfqNumber: rfq.number,
    title: rfq.title,
    status: toLegacyRfqStatus(rfq.status),
    vendorsInvited: rfq.invitedSupplierIds.length,
    responses: rfq.quotes.filter((q) => q.status === "submitted" || q.status === "accepted").length,
    deadline: rfq.deadline,
  };
}

export function quoteTotalFromLines(rfq: PurchaseRfq, quote: RfqVendorQuote) {
  return rfq.lines.reduce((sum, line) => {
    const lq = quote.lineQuotes.find((q) => q.rfqLineId === line.id);
    return sum + (lq ? lq.unitPrice * line.quantity : 0);
  }, 0);
}

export const purchaseRfqSeed: PurchaseRfq[] = [
  {
    id: "rfq_001",
    number: "RFQ-2026-0144",
    title: "Wireless earbuds — Q3 restock",
    status: "quotation",
    deadline: "2026-06-20",
    createdAt: "2026-06-12",
    buyer: "Rahim Uddin",
    lines: [
      { id: "rfl_001_1", sku: "SKU-0002", name: "Wireless Earbuds Pro", quantity: 500 },
      { id: "rfl_001_2", sku: "SKU-0014", name: "USB-C Hub 7-in-1", quantity: 200 },
    ],
    invitedSupplierIds: ["sup_001", "sup_004"],
    quotes: [
      {
        id: "qt_001_a",
        rfqId: "rfq_001",
        supplierId: "sup_001",
        quoteNumber: "TQ-8841",
        status: "submitted",
        validUntil: "2026-06-25",
        leadTimeDays: 7,
        moq: 100,
        submittedAt: "2026-06-14",
        lineQuotes: [
          { rfqLineId: "rfl_001_1", unitPrice: 42 },
          { rfqLineId: "rfl_001_2", unitPrice: 215 },
        ],
        totalAmount: 64000,
      },
      {
        id: "qt_001_b",
        rfqId: "rfq_001",
        supplierId: "sup_004",
        quoteNumber: "SZ-2026-1192",
        status: "submitted",
        validUntil: "2026-06-22",
        leadTimeDays: 21,
        moq: 200,
        submittedAt: "2026-06-15",
        lineQuotes: [
          { rfqLineId: "rfl_001_1", unitPrice: 39 },
          { rfqLineId: "rfl_001_2", unitPrice: 198 },
        ],
        totalAmount: 59100,
      },
    ],
    notes: "Compare against last PO PO-2026-0138 pricing.",
  },
  {
    id: "rfq_002",
    number: "RFQ-2026-0140",
    title: "Summer apparel collection",
    status: "approved",
    deadline: "2026-06-18",
    createdAt: "2026-06-08",
    buyer: "Sadia Rahman",
    lines: [{ id: "rfl_002_1", sku: "SKU-0001", name: "Premium Cotton T-Shirt", quantity: 1000 }],
    invitedSupplierIds: ["sup_002", "sup_003"],
    quotes: [
      {
        id: "qt_002_a",
        rfqId: "rfq_002",
        supplierId: "sup_002",
        quoteNumber: "UW-Q-552",
        status: "accepted",
        validUntil: "2026-06-30",
        leadTimeDays: 14,
        moq: 500,
        submittedAt: "2026-06-10",
        lineQuotes: [{ rfqLineId: "rfl_002_1", unitPrice: 86 }],
        totalAmount: 86000,
      },
      {
        id: "qt_002_b",
        rfqId: "rfq_002",
        supplierId: "sup_003",
        quoteNumber: "GU-778",
        status: "rejected",
        validUntil: "2026-06-28",
        leadTimeDays: 12,
        moq: 300,
        submittedAt: "2026-06-11",
        lineQuotes: [{ rfqLineId: "rfl_002_1", unitPrice: 92 }],
        totalAmount: 92000,
      },
    ],
    awardedSupplierId: "sup_002",
    linkedPoId: "po_003",
  },
  {
    id: "rfq_003",
    number: "RFQ-2026-0138",
    title: "Smart watch bulk order",
    status: "sent",
    deadline: "2026-06-25",
    createdAt: "2026-06-14",
    buyer: "Karim Ahmed",
    lines: [{ id: "rfl_003_1", sku: "SKU-0005", name: "Smart Watch Series 5", quantity: 300 }],
    invitedSupplierIds: ["sup_001", "sup_004", "sup_002"],
    quotes: [],
    notes: "Awaiting vendor responses.",
  },
  {
    id: "rfq_004",
    number: "RFQ-2026-0135",
    title: "Home & living restock",
    status: "po_created",
    deadline: "2026-05-20",
    createdAt: "2026-05-05",
    buyer: "Manager",
    lines: [{ id: "rfl_004_1", sku: "SKU-0003", name: "Ceramic Coffee Mug Set", quantity: 150 }],
    invitedSupplierIds: ["sup_005", "sup_003"],
    quotes: [
      {
        id: "qt_004_a",
        rfqId: "rfq_004",
        supplierId: "sup_003",
        quoteNumber: "GU-441",
        status: "accepted",
        validUntil: "2026-05-25",
        leadTimeDays: 10,
        moq: 50,
        submittedAt: "2026-05-12",
        lineQuotes: [{ rfqLineId: "rfl_004_1", unitPrice: 155 }],
        totalAmount: 23250,
      },
    ],
    awardedSupplierId: "sup_003",
    linkedPoId: "po_004",
  },
  {
    id: "rfq_005",
    number: "RFQ-2026-0146",
    title: "Running shoes — new season",
    status: "draft",
    deadline: "2026-07-01",
    createdAt: "2026-06-16",
    buyer: "Admin",
    lines: [{ id: "rfl_005_1", sku: "SKU-0004", name: "Running Shoes Ultra", quantity: 240 }],
    invitedSupplierIds: ["sup_002"],
    quotes: [],
  },
];

export function getPurchaseRfqById(id: string) {
  return purchaseRfqSeed.find((r) => r.id === id);
}

export function flattenQuotations(rfqs: PurchaseRfq[]): RfqVendorQuote[] {
  return rfqs.flatMap((r) => r.quotes.map((q) => ({ ...q, rfqId: r.id })));
}

export function buildQuoteDraft(input: {
  rfqId: string;
  supplierId: string;
  validUntil: string;
  leadTimeDays: number;
  moq: number;
  lineQuotes: RfqLineQuote[];
  totalAmount: number;
  status?: QuotationStatus;
}): RfqVendorQuote {
  const stamp = Date.now();
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return {
    id: `qt_${stamp}`,
    rfqId: input.rfqId,
    supplierId: input.supplierId,
    quoteNumber: `QT-${day}-${String(stamp).slice(-4)}`,
    status: input.status ?? "draft",
    validUntil: input.validUntil,
    leadTimeDays: input.leadTimeDays,
    moq: input.moq,
    lineQuotes: input.lineQuotes,
    totalAmount: input.totalAmount,
    submittedAt: input.status === "submitted" ? new Date().toISOString().slice(0, 10) : undefined,
  };
}

export function buildRfqDraft(input: {
  title: string;
  deadline: string;
  buyer?: string;
  invitedSupplierIds: string[];
  lines: Omit<RfqLine, "id">[];
  notes?: string;
}): PurchaseRfq {
  const stamp = Date.now();
  const id = `rfq_${stamp}`;
  return {
    id,
    number: `RFQ-2026-${String(stamp).slice(-4)}`,
    title: input.title.trim(),
    status: "draft",
    deadline: input.deadline,
    createdAt: new Date().toISOString().slice(0, 10),
    buyer: input.buyer ?? "Rahim Uddin",
    lines: input.lines.map((l, i) => ({ ...l, id: `rfl_${stamp}_${i}` })),
    invitedSupplierIds: input.invitedSupplierIds,
    quotes: [],
    notes: input.notes,
  };
}
