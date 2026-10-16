import { create } from "zustand";
import { toast } from "sonner";
import {
  goodsReceiptsSeed,
  type GoodsReceipt,
  type ReceiptLine,
  type ReceiptStatus,
} from "@/lib/mock-data/purchase-receipts";
import {
  purchaseOrderReceivedPct,
  type PurchaseOrder,
  type PurchaseOrderStatus,
} from "@/lib/mock-data/purchase-orders";
import { usePurchaseOrderStore } from "@/lib/store/purchase-order-store";

type PurchaseReceiptStore = {
  receipts: GoodsReceipt[];
  getById: (id: string) => GoodsReceipt | undefined;
  getByPurchaseOrder: (poId: string) => GoodsReceipt[];
  updateStatus: (id: string, status: ReceiptStatus) => void;
  patchReceipt: (id: string, patch: Partial<GoodsReceipt>) => void;
  updateLine: (receiptId: string, lineId: string, patch: Partial<ReceiptLine>) => void;
  addReceipt: (receipt: GoodsReceipt) => void;
  postReceipt: (id: string) => void;
  completeReceipt: (id: string) => void;
};

function derivePoStatus(po: PurchaseOrder): PurchaseOrderStatus {
  const pct = purchaseOrderReceivedPct(po);
  if (pct >= 100) return "received";
  if (pct > 0) return "partially_received";
  return po.status;
}

function syncPoFromReceipt(receipt: GoodsReceipt) {
  const poStore = usePurchaseOrderStore.getState();
  const po = poStore.getById(receipt.purchaseOrderId);
  if (!po) return;

  const lines = po.lines.map((line) => {
    const rl = receipt.lines.find((l) => l.poLineId === line.id);
    if (!rl || receipt.status !== "posted" && receipt.status !== "completed") return line;
    const newReceived = Math.min(
      line.quantityOrdered,
      line.quantityReceived + rl.quantityReceived,
    );
    return { ...line, quantityReceived: newReceived };
  });

  const receiptIds = po.receiptIds.includes(receipt.id)
    ? po.receiptIds
    : [...po.receiptIds, receipt.id];

  const updated: PurchaseOrder = {
    ...po,
    lines,
    receiptIds,
    status: derivePoStatus({ ...po, lines }),
  };

  poStore.patchOrder(po.id, updated);
}

export const usePurchaseReceiptStore = create<PurchaseReceiptStore>()((set, get) => ({
  receipts: [...goodsReceiptsSeed],
  getById: (id) => get().receipts.find((r) => r.id === id),
  getByPurchaseOrder: (poId) => get().receipts.filter((r) => r.purchaseOrderId === poId),
  updateStatus: (id, status) =>
    set((s) => ({
      receipts: s.receipts.map((r) => (r.id === id ? { ...r, status } : r)),
    })),
  patchReceipt: (id, patch) =>
    set((s) => ({
      receipts: s.receipts.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    })),
  updateLine: (receiptId, lineId, patch) =>
    set((s) => ({
      receipts: s.receipts.map((r) =>
        r.id === receiptId
          ? {
              ...r,
              lines: r.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)),
            }
          : r,
      ),
    })),
  addReceipt: (receipt) => {
    set((s) => ({ receipts: [receipt, ...s.receipts] }));
    const po = usePurchaseOrderStore.getState().getById(receipt.purchaseOrderId);
    if (po && !po.receiptIds.includes(receipt.id)) {
      usePurchaseOrderStore.getState().patchOrder(po.id, {
        receiptIds: [...po.receiptIds, receipt.id],
      });
    }
  },
  postReceipt: (id) => {
    const receipt = get().getById(id);
    if (!receipt) return;
    if (!["draft", "receiving", "qc_pending"].includes(receipt.status)) {
      toast.error("Receipt already posted");
      return;
    }
    if (receipt.lines.some((l) => l.quantityReceived <= 0)) {
      toast.error("Enter received quantity on all lines");
      return;
    }
    set((s) => ({
      receipts: s.receipts.map((r) => (r.id === id ? { ...r, status: "posted" as ReceiptStatus } : r)),
    }));
    syncPoFromReceipt({ ...receipt, status: "posted" });
    toast.success("Receipt posted — inventory.stock_in.posted (mock)");
  },
  completeReceipt: (id) => {
    set((s) => ({
      receipts: s.receipts.map((r) =>
        r.id === id ? { ...r, status: "completed" as ReceiptStatus } : r,
      ),
    }));
    toast.success("Receipt completed — ready for vendor bill");
  },
}));

export function receiptStatusBadgeVariant(
  status: ReceiptStatus,
): "default" | "secondary" | "success" | "warning" | "muted" | "outline" {
  switch (status) {
    case "draft":
      return "muted";
    case "receiving":
      return "secondary";
    case "qc_pending":
      return "warning";
    case "posted":
      return "default";
    case "completed":
      return "success";
    case "cancelled":
      return "outline";
    default:
      return "muted";
  }
}
