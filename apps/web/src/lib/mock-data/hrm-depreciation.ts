/** Workdo Asset Depreciation Report: summary cards + detail table. */

export type DepreciationMethod = "straight_line" | "reducing_balance";

export type AssetDepreciationRow = {
  id: string;
  assetName: string;
  assetType: string;
  purchaseDate: string;
  purchaseCost: number;
  method: DepreciationMethod;
  currentValue: number;
  depreciationAmount: number;
};

export const DEPRECIATION_METHOD_LABEL: Record<DepreciationMethod, string> = {
  straight_line: "Straight Line",
  reducing_balance: "Reducing Balance",
};

export const DEPRECIATION_METHOD_OPTIONS = (
  Object.keys(DEPRECIATION_METHOD_LABEL) as DepreciationMethod[]
).map((k) => ({ value: k, label: DEPRECIATION_METHOD_LABEL[k] }));

function row(
  id: string,
  assetName: string,
  assetType: string,
  purchaseDate: string,
  purchaseCost: number,
  currentValue: number,
  method: DepreciationMethod = "straight_line",
): AssetDepreciationRow {
  return {
    id,
    assetName,
    assetType,
    purchaseDate,
    purchaseCost,
    method,
    currentValue,
    depreciationAmount: Math.round((purchaseCost - currentValue) * 100) / 100,
  };
}

export const DEPRECIATION_ROWS_SEED: AssetDepreciationRow[] = [
  row("dep_1", "Epson EcoTank Printer", "Office Equipment", "2025-01-15", 25000, 20500),
  row("dep_2", "TP-Link Wireless Router", "Network Equipment", "2025-01-15", 8000, 6800),
  row("dep_3", "Cisco Catalyst Switch", "Network Equipment", "2025-01-15", 75000, 63750),
  row("dep_4", "Honda City 2022", "Vehicles", "2025-01-15", 1_800_000, 1_530_000),
  row("dep_5", "Dell OptiPlex 7080", "Computer Hardware", "2024-06-10", 95000, 76000),
  row("dep_6", 'MacBook Pro 16"', "Computer Hardware", "2024-09-01", 280000, 238000),
  row("dep_7", "iPhone 14 Pro", "Mobile Devices", "2024-11-05", 120000, 102000),
  row("dep_8", "Canon imageRUNNER Printer", "Office Equipment", "2023-08-20", 185000, 129500),
  row("dep_9", "Executive Office Desk", "Furniture", "2023-03-12", 45000, 36000),
  row("dep_10", "Company Van — Toyota Hiace", "Vehicles", "2021-05-18", 2_200_000, 1_540_000),
  row("dep_11", "Conference Room Projector", "Office Equipment", "2022-04-01", 85000, 59500),
  row(
    "dep_12",
    "Server Rack — Dell PowerEdge",
    "Computer Hardware",
    "2023-01-20",
    452000,
    316400,
    "reducing_balance",
  ),
];

/** Workdo demo totals (may not equal sum of sample rows exactly — keep report-level summary). */
export const DEPRECIATION_SUMMARY = {
  totalPurchaseValue: 6_370_000,
  totalCurrentValue: 5_488_330,
  totalDepreciation: 881_670,
};

export function formatDepMoney(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

export function depreciationPct(purchaseCost: number, depreciationAmount: number): number {
  if (purchaseCost <= 0) return 0;
  return Math.round((depreciationAmount / purchaseCost) * 10000) / 100;
}

export function pctOf(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}
