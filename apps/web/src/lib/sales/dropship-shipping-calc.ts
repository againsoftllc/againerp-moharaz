/** Dropship shipping estimate — mirrors storefront ProductPurchasePanel (againerp). */

export type DropshipShippingMethod = "air" | "sea";

export type DropshipShippingLine = {
  quantity: number;
  unitPrice: number;
  variant?: string;
  name?: string;
  weightKgPerUnit?: number | null;
};

export const DROPSHIP_SHIPPING_METHODS = {
  air: {
    label: "By Air",
    rateLabel: "৳750–1,150/kg",
    rateMin: 750,
    rateMax: 1150,
    estimatePerUnit: 180,
    eta: "7–12 days",
  },
  sea: {
    label: "By Sea",
    rateLabel: "৳170–400/kg",
    rateMin: 170,
    rateMax: 400,
    estimatePerUnit: 55,
    eta: "25–40 days",
  },
} as const;

export const CHINA_COURIER_PER_UNIT_BDT = 35;
export const PAY_NOW_PERCENT = 70;
export const DEFAULT_WEIGHT_KG_PER_UNIT = 0.5;

export type DropshipOrderLine = {
  label: string;
  qty: number;
  unitPrice: number;
};

export type DropshipShippingResult = {
  shippingMethod: DropshipShippingMethod;
  optionCount: number;
  totalPieces: number;
  productSubtotal: number;
  payNowPercent: number;
  payNowAmount: number;
  payLaterAmount: number;
  unitWeightKg: number | null;
  totalWeightKg: number | null;
  internationalShipping: number;
  chinaCourier: number;
  shippingTotal: number;
  grandTotal: number;
  orderLines: DropshipOrderLine[];
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatKg(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  const rounded = Math.round(n * 1000) / 1000;
  return `${rounded.toLocaleString("en-BD", { maximumFractionDigits: 3 })}kg`;
}

function resolveTotalWeightKg(
  lines: DropshipShippingLine[],
  totalPieces: number,
  manualWeightKg?: number,
): number | null {
  if (manualWeightKg != null && Number.isFinite(manualWeightKg) && manualWeightKg > 0) {
    return roundMoney(manualWeightKg);
  }

  let weightedSum = 0;
  let weightedQty = 0;
  for (const line of lines) {
    const qty = Math.max(0, line.quantity);
    if (qty <= 0) continue;
    const w =
      line.weightKgPerUnit != null && line.weightKgPerUnit > 0
        ? line.weightKgPerUnit
        : DEFAULT_WEIGHT_KG_PER_UNIT;
    weightedSum += w * qty;
    weightedQty += qty;
  }

  if (weightedQty > 0) return roundMoney(weightedSum);
  if (totalPieces > 0) return roundMoney(totalPieces * DEFAULT_WEIGHT_KG_PER_UNIT);
  return null;
}

function shippingEstimateForMethod(
  method: DropshipShippingMethod,
  totalWeightKg: number | null,
  totalPieces: number,
): number {
  const ship = DROPSHIP_SHIPPING_METHODS[method];
  if (totalWeightKg != null && totalWeightKg > 0) {
    return roundMoney(((ship.rateMin + ship.rateMax) / 2) * totalWeightKg);
  }
  return roundMoney(ship.estimatePerUnit * Math.max(0, totalPieces));
}

export function buildDropshipOrderLines(lines: DropshipShippingLine[]): DropshipOrderLine[] {
  return lines
    .filter((line) => line.quantity > 0)
    .map((line) => {
      const variant = line.variant?.trim();
      const name = line.name?.trim() || "Product";
      const label = variant ? `${name} / ${variant}` : name;
      return {
        label,
        qty: line.quantity,
        unitPrice: line.unitPrice,
      };
    });
}

export function calculateDropshipShipping(
  lines: DropshipShippingLine[],
  options?: {
    shippingMethod?: DropshipShippingMethod;
    weightKg?: number;
  },
): DropshipShippingResult {
  const shippingMethod = options?.shippingMethod ?? "air";
  const productLines = lines.filter((line) => line.quantity > 0);
  const orderLines = buildDropshipOrderLines(productLines);
  const optionCount = orderLines.length;
  const totalPieces = productLines.reduce((sum, line) => sum + line.quantity, 0);
  const productSubtotal = roundMoney(
    productLines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
  );

  const payNowAmount = roundMoney((productSubtotal * PAY_NOW_PERCENT) / 100);
  const payLaterAmount = roundMoney(productSubtotal - payNowAmount);

  const totalWeightKg = resolveTotalWeightKg(productLines, totalPieces, options?.weightKg);
  const unitWeightKg =
    totalWeightKg != null && totalPieces > 0
      ? roundMoney(totalWeightKg / totalPieces)
      : null;

  const internationalShipping = shippingEstimateForMethod(
    shippingMethod,
    totalWeightKg,
    totalPieces,
  );
  const chinaCourier = roundMoney(CHINA_COURIER_PER_UNIT_BDT * Math.max(0, totalPieces));
  const shippingTotal = roundMoney(internationalShipping + chinaCourier);
  const grandTotal = roundMoney(productSubtotal + shippingTotal);

  return {
    shippingMethod,
    optionCount,
    totalPieces,
    productSubtotal,
    payNowPercent: PAY_NOW_PERCENT,
    payNowAmount,
    payLaterAmount,
    unitWeightKg,
    totalWeightKg,
    internationalShipping,
    chinaCourier,
    shippingTotal,
    grandTotal,
    orderLines,
  };
}

/** @deprecated use resolveTotalWeightKg via calculateDropshipShipping */
export function estimateLineWeightKg(lines: DropshipShippingLine[]): number {
  const totalPieces = lines.reduce((sum, line) => sum + Math.max(0, line.quantity), 0);
  return resolveTotalWeightKg(lines, totalPieces) ?? 0;
}
