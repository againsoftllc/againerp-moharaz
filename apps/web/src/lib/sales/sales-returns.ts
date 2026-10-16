export type SalesReturnReason =
  | "defective"
  | "wrong_item"
  | "customer_changed_mind"
  | "warranty"
  | "damaged_in_transit"
  | "other";

export type SalesReturnStatus = "draft" | "confirmed" | "credited" | "cancelled";

export type SalesReturnLine = {
  id: string;
  soLineId: string;
  sku: string;
  name: string;
  quantityReturn: number;
  unitPrice: number;
  reason: SalesReturnReason;
};

export type SalesReturn = {
  id: string;
  number: string;
  salesOrderId: string;
  orderNumber: string;
  invoiceNumber?: string;
  customerId: string;
  customerName: string;
  warehouse: string;
  returnDate: string;
  requestedBy: string;
  status: SalesReturnStatus;
  reason: SalesReturnReason;
  lines: SalesReturnLine[];
  creditAmount: number;
  notes?: string;
};

export const SALES_RETURN_STATUS_LABELS: Record<SalesReturnStatus, string> = {
  draft: "Draft",
  confirmed: "Confirmed",
  credited: "Credited",
  cancelled: "Cancelled",
};

export const SALES_RETURN_REASON_LABELS: Record<SalesReturnReason, string> = {
  defective: "Defective",
  wrong_item: "Wrong item",
  customer_changed_mind: "Customer changed mind",
  warranty: "Warranty",
  damaged_in_transit: "Damaged in transit",
  other: "Other",
};
