import { create } from "zustand";
import {
  purchaseOrdersSeed,
  type PurchaseOrder,
  type PurchaseOrderStatus,
} from "@/lib/mock-data/purchase-orders";

type PurchaseOrderStore = {
  orders: PurchaseOrder[];
  getById: (id: string) => PurchaseOrder | undefined;
  updateStatus: (id: string, status: PurchaseOrderStatus) => void;
  patchOrder: (id: string, patch: Partial<PurchaseOrder>) => void;
  addOrder: (order: PurchaseOrder) => void;
};

export const usePurchaseOrderStore = create<PurchaseOrderStore>()((set, get) => ({
  orders: [...purchaseOrdersSeed],
  getById: (id) => get().orders.find((o) => o.id === id),
  updateStatus: (id, status) =>
    set((s) => ({
      orders: s.orders.map((o) => (o.id === id ? { ...o, status } : o)),
    })),
  patchOrder: (id, patch) =>
    set((s) => ({
      orders: s.orders.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    })),
  addOrder: (order) => set((s) => ({ orders: [order, ...s.orders] })),
}));

export function poStatusBadgeVariant(
  status: PurchaseOrderStatus,
): "default" | "secondary" | "success" | "warning" | "muted" | "outline" {
  switch (status) {
    case "draft":
      return "muted";
    case "confirmed":
    case "ordered":
    case "approved":
      return "default";
    case "partial_received":
    case "partially_received":
    case "pending_approval":
      return "warning";
    case "completed":
    case "received":
    case "closed":
      return "success";
    case "rejected":
    case "cancelled":
      return "outline";
    default:
      return "muted";
  }
}
