// UI-facing types for purchase returns. Data itself comes from the real API
// (see @/lib/api/purchase-returns) — this module only holds the shared shape
// and display labels the grid, drawer, and page all need.

export type ReturnReason =
  | "defective"
  | "wrong_item"
  | "over_shipment"
  | "warranty"
  | "expired"
  | "other";

export type ReturnStatus = "requested" | "approved" | "credited" | "rejected" | "cancelled";

export type ReturnLine = {
  id: string;
  poLineId: string;
  sku: string;
  name: string;
  quantityReturn: number;
  unitPrice: number;
  reason: ReturnReason;
};

export type PurchaseReturn = {
  id: string;
  number: string;
  purchaseOrderId: string;
  poNumber: string;
  receiptId?: string;
  receiptNumber?: string;
  supplierId: string;
  supplierName: string;
  warehouse: string;
  requestDate: string;
  requestedBy: string;
  status: ReturnStatus;
  reason: ReturnReason;
  lines: ReturnLine[];
  creditAmount: number;
  notes?: string;
};

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  requested: "Requested",
  approved: "Approved",
  credited: "Credited",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export const RETURN_REASON_LABELS: Record<ReturnReason, string> = {
  defective: "Defective",
  wrong_item: "Wrong item",
  over_shipment: "Over-shipment",
  warranty: "Warranty",
  expired: "Expired",
  other: "Other",
};

export function returnLineTotal(line: ReturnLine) {
  return line.quantityReturn * line.unitPrice;
}

export function returnCreditTotal(ret: PurchaseReturn) {
  return ret.lines.reduce((s, l) => s + returnLineTotal(l), 0);
}

export function purchaseLineReturnable(line: {
  quantity_received: number;
  quantity_returned?: number;
}) {
  return Math.max(0, line.quantity_received - (line.quantity_returned ?? 0));
}

export function purchaseOrderIsReturnable(order: {
  lines: { quantity_received: number; quantity_returned?: number }[];
}) {
  return order.lines.some((line) => purchaseLineReturnable(line) > 0);
}
