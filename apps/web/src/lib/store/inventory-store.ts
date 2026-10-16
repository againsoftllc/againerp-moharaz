import { create } from "zustand";
import {
  demoWorkOrderMovementsSeed,
} from "@/lib/mock-data/inventory-integration-seed";
import {
  rawMaterialStockSeed,
  stockItemsSeed,
  type StockItem,
  type StockMovement,
  type StockMovementReferenceType,
  type StockMovementType,
  type StockStatus,
} from "@/lib/mock-data/inventory";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function recalcStockStatus(item: Omit<StockItem, "available" | "status"> & { available?: number }): StockItem {
  const available = item.onHand - item.reserved;
  let status: StockStatus = "in_stock";
  if (item.onHand <= 0) status = "out_of_stock";
  else if (available < item.minQty) status = "low_stock";
  else if (item.onHand > item.maxQty) status = "overstock";
  return { ...item, available, status, updatedAt: todayIso() };
}

function stockKey(sku: string, warehouse: string): string {
  return `${sku}::${warehouse}`;
}

type PostMovementInput = {
  type: StockMovementType;
  sku: string;
  productName: string;
  warehouse: string;
  quantity: number;
  unitCost?: number;
  referenceType: StockMovementReferenceType;
  referenceId: string;
  referenceLabel: string;
  event: string;
};

type InventoryStore = {
  stockItems: StockItem[];
  movements: StockMovement[];
  getStock: (sku: string, warehouse: string) => StockItem | undefined;
  getMovementsByReference: (referenceType: StockMovementReferenceType, referenceId: string) => StockMovement[];
  postMovement: (input: PostMovementInput) => StockMovement | null;
  reserveStock: (input: Omit<PostMovementInput, "type" | "event" | "unitCost">) => StockMovement | null;
  stockOut: (input: Omit<PostMovementInput, "type" | "event">) => StockMovement | null;
  stockIn: (input: Omit<PostMovementInput, "type" | "event">) => StockMovement | null;
};

function findOrCreateItem(
  items: StockItem[],
  sku: string,
  productName: string,
  warehouse: string,
  unitCost = 0,
): { items: StockItem[]; index: number } {
  const idx = items.findIndex((i) => i.sku === sku && i.warehouse === warehouse);
  if (idx >= 0) return { items, index: idx };

  const newItem = recalcStockStatus({
    id: `inv_dyn_${sku}_${warehouse.replace(/\s/g, "_")}`,
    sku,
    name: productName,
    warehouse,
    onHand: 0,
    reserved: 0,
    incoming: 0,
    minQty: 0,
    maxQty: 99999,
    unitCost,
    updatedAt: todayIso(),
  });
  return { items: [...items, newItem], index: items.length };
}

export const useInventoryStore = create<InventoryStore>()((set, get) => ({
  stockItems: [...stockItemsSeed, ...rawMaterialStockSeed].map((i) => recalcStockStatus(i)),
  movements: [...demoWorkOrderMovementsSeed],

  getStock: (sku, warehouse) =>
    get().stockItems.find((i) => i.sku === sku && i.warehouse === warehouse),

  getMovementsByReference: (referenceType, referenceId) =>
    get().movements.filter(
      (m) => m.referenceType === referenceType && m.referenceId === referenceId,
    ),

  postMovement: (input) => {
    if (input.quantity <= 0) return null;

    const movement: StockMovement = {
      id: `mov_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ...input,
      totalValue:
        input.unitCost != null
          ? Math.round(input.quantity * input.unitCost * 100) / 100
          : undefined,
      postedAt: new Date().toISOString(),
    };

    set((s) => {
      let items = [...s.stockItems];
      const { items: nextItems, index } = findOrCreateItem(
        items,
        input.sku,
        input.productName,
        input.warehouse,
        input.unitCost ?? 0,
      );
      items = nextItems;
      const item = { ...items[index] };

      switch (input.type) {
        case "reserve":
          item.reserved += input.quantity;
          break;
        case "unreserve":
          item.reserved = Math.max(0, item.reserved - input.quantity);
          break;
        case "stock_out":
          item.onHand = Math.max(0, item.onHand - input.quantity);
          item.reserved = Math.max(0, item.reserved - input.quantity);
          if (input.unitCost != null) item.unitCost = input.unitCost;
          break;
        case "stock_in":
          item.onHand += input.quantity;
          if (input.unitCost != null) item.unitCost = input.unitCost;
          break;
      }

      items[index] = recalcStockStatus(item);
      return { stockItems: items, movements: [movement, ...s.movements] };
    });

    return movement;
  },

  reserveStock: (input) =>
    get().postMovement({
      ...input,
      type: "reserve",
      event: "inventory.reserve.posted",
    }),

  stockOut: (input) =>
    get().postMovement({
      ...input,
      type: "stock_out",
      event: "inventory.stock_out.posted",
    }),

  stockIn: (input) =>
    get().postMovement({
      ...input,
      type: "stock_in",
      event: "inventory.stock_in.posted",
    }),
}));

export { stockKey, recalcStockStatus };
