/** Canonical Purchase module routes. Suppliers lives at its own top-level `/suppliers*` module. */

export const PURCHASE_HOME = "/purchase/orders";

export const purchasePaths = {
  home: PURCHASE_HOME,
  suppliers: "/suppliers",
  supplier: (id: string) => `/suppliers/${id}`,
  products: "/purchase/products",
  orders: "/purchase/orders",
  rfq: "/purchase/rfq",
  quotations: "/purchase/quotations",
  receipts: "/purchase/receipts",
  returns: "/purchase/returns",
  bills: "/purchase/bills",
  reports: "/purchase/reports",
  settings: "/purchase/settings",
} as const;

export type PurchaseOrderPrefillLine = {
  sku: string;
  qty: number;
  unitCost?: number;
};

export function purchaseOrderCreateHref(opts?: {
  supplierId?: string | null;
  warehouseId?: string | null;
  lines?: PurchaseOrderPrefillLine[];
}): string {
  const qs = new URLSearchParams();
  qs.set("create", "1");
  if (opts?.supplierId) qs.set("supplier", opts.supplierId);
  if (opts?.warehouseId) qs.set("warehouse", opts.warehouseId);
  if (opts?.lines?.length) {
    qs.set(
      "lines",
      opts.lines
        .map((l) =>
          l.unitCost != null && Number.isFinite(l.unitCost)
            ? `${l.sku}:${l.qty}:${l.unitCost}`
            : `${l.sku}:${l.qty}`,
        )
        .join(","),
    );
  }
  return `${purchasePaths.orders}?${qs.toString()}`;
}

export function parsePurchaseOrderCreateLines(
  raw: string | null,
): PurchaseOrderPrefillLine[] {
  if (!raw?.trim()) return [];
  const lines: PurchaseOrderPrefillLine[] = [];
  for (const part of raw.split(",")) {
    const [sku, qtyRaw, costRaw] = part.split(":");
    if (!sku) continue;
    const qty = Number.parseInt(qtyRaw ?? "1", 10);
    const unitCost = costRaw != null && costRaw !== "" ? Number.parseFloat(costRaw) : undefined;
    lines.push({
      sku: sku.trim(),
      qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
      unitCost: unitCost != null && Number.isFinite(unitCost) ? unitCost : undefined,
    });
  }
  return lines;
}

export {
  readPurchaseSettings,
  writePurchaseSettings,
  type PurchaseSettings,
} from "./purchase-settings";
